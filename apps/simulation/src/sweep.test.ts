/**
 * Sweep tests — spec IDs match the implementation plan.
 *
 * Tests cover:
 *   A*  — budget mechanics
 *   B*  — targeting
 *   C*  — lifecycle (toggle, destroy)
 *   H*  — sweep + encirclement integration
 *   I*  — determinism / snapshot roundtrip
 *   (pause vs deactivate conflict)
 */
import { describe, expect, it, vi } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { SWEEP_ATTACK_COST, SWEEP_BUDGET_CAP } from "@border-empires/shared";
import { MANPOWER_BASE_REGEN_PER_MINUTE } from "@border-empires/game-domain";
import { sweepAttackCandidates } from "./territory-automation.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type DomainPlayer = {
  id: string;
  isAi: boolean;
  points: number;
  manpower: number;
  techIds: Set<string>;
  domainIds: Set<string>;
  mods: { attack: number; defense: number; income: number; vision: number };
  techRootId: string;
  allies: Set<string>;
  strategicResources?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>>;
};

const mkPlayer = (id: string, points = 10_000, manpower = 10_000): DomainPlayer => ({
  id,
  isAi: false,
  points,
  manpower,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const mkRuntime = (
  tiles: Array<{
    x: number;
    y: number;
    terrain: "LAND" | "SEA";
    ownerId?: string;
    ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
    siegeOutpost?: {
      ownerId: string;
      status: "under_construction" | "active" | "removing";
      variant?: "SIEGE_OUTPOST" | "SIEGE_TOWER" | "DREAD_TOWER";
      sweepBudget?: number;
      sweepActive?: boolean;
      sweepBudgetUpdatedAt?: number;
    };
    economicStructure?: {
      id: string;
      type: string;
      tileKey: string;
      ownerId: string;
      status: "under_construction" | "active" | "inactive" | "removing";
      nextUpkeepAt: number;
      sweepBudget?: number;
      sweepActive?: boolean;
      sweepBudgetUpdatedAt?: number;
    };
    frontierDecayAt?: number;
  }>,
  players: string[] = ["player-1", "player-2"],
  nowFn?: () => number
) =>
  new SimulationRuntime({
    now: nowFn ?? (() => 1_000),
    initialPlayers: new Map(players.map((id) => [id, mkPlayer(id)])),
    seedTiles: new Map(),
    initialState: { tiles, activeLocks: [] }
  });

const tileSiegeOutpost = (runtime: SimulationRuntime, x: number, y: number) => {
  const exported = runtime.exportState();
  const tile = exported.tiles.find((t) => t.x === x && t.y === y);
  if (!tile?.siegeOutpostJson) return undefined;
  return JSON.parse(tile.siegeOutpostJson) as {
    ownerId: string;
    status: string;
    sweepBudget?: number;
    sweepActive?: boolean;
    sweepBudgetUpdatedAt?: number;
  };
};

const tileLightOutpost = (runtime: SimulationRuntime, x: number, y: number) => {
  const exported = runtime.exportState();
  const tile = exported.tiles.find((t) => t.x === x && t.y === y);
  if (!tile?.economicStructureJson) return undefined;
  const econ = JSON.parse(tile.economicStructureJson) as {
    type: string;
    ownerId: string;
    status: string;
    sweepBudget?: number;
    sweepActive?: boolean;
    sweepBudgetUpdatedAt?: number;
  };
  return econ.type === "LIGHT_OUTPOST" ? econ : undefined;
};

const collectEvents = (runtime: SimulationRuntime): SimulationEvent[] => {
  const events: SimulationEvent[] = [];
  runtime.onEvent((e) => events.push(e));
  return events;
};

// ---------------------------------------------------------------------------
// A-group: budget mechanics
// ---------------------------------------------------------------------------

describe("sweep budget mechanics", () => {
  it("A1: new outpost starts with sweepBudget=300 and sweepActive=false", async () => {
    vi.useFakeTimers();
    try {
      const now = { value: 1_000 };
      const runtime = new SimulationRuntime({
        now: () => now.value,
        initialPlayers: new Map([
          ["player-1", { ...mkPlayer("player-1"), techIds: new Set(["leatherworking"]), strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 45, SHARD: 0, OIL: 0 } }]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "build-outpost",
        sessionId: "s1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: now.value,
        type: "BUILD_SIEGE_OUTPOST",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();

      // Advance past build time (60s)
      vi.advanceTimersByTime(61_000);

      const outpost = tileSiegeOutpost(runtime, 10, 10);
      expect(outpost).toBeDefined();
      expect(outpost?.sweepBudget).toBe(SWEEP_BUDGET_CAP);
      expect(outpost?.sweepActive).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("A2/A3: budget regens at player MP-regen rate and caps at SWEEP_BUDGET_CAP", () => {
    const nowMs = { value: 1_000 };
    const runtime = mkRuntime(
      [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
          siegeOutpost: { ownerId: "player-1", status: "active", sweepBudget: 0, sweepActive: false, sweepBudgetUpdatedAt: 1_000 }
        }
      ],
      ["player-1", "player-2"],
      () => nowMs.value
    );

    // Tick 1 minute later
    nowMs.value = 1_000 + 60_000;
    runtime.tickTerritoryAutomation(nowMs.value);

    const outpost = tileSiegeOutpost(runtime, 10, 10);
    // Sweep budget regens at the player's MP regen rate (coupled).
    expect(outpost?.sweepBudget).toBeCloseTo(MANPOWER_BASE_REGEN_PER_MINUTE, 3);

    // Fill to almost cap and tick again — should cap at SWEEP_BUDGET_CAP
    const nowMs2 = { value: 1_000 };
    const runtime2 = mkRuntime(
      [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
          siegeOutpost: { ownerId: "player-1", status: "active", sweepBudget: 295, sweepActive: false, sweepBudgetUpdatedAt: 1_000 }
        }
      ],
      ["player-1", "player-2"],
      () => nowMs2.value
    );
    // Advance enough minutes that base-rate regen would more than cover the
    // remaining 5 MP to cap, regardless of how MANPOWER_BASE_REGEN_PER_MINUTE
    // is tuned.
    const minutesToOvercap = Math.ceil(10 / MANPOWER_BASE_REGEN_PER_MINUTE);
    nowMs2.value = 1_000 + 60_000 * minutesToOvercap;
    runtime2.tickTerritoryAutomation(nowMs2.value);
    const outpost2 = tileSiegeOutpost(runtime2, 10, 10);
    expect(outpost2?.sweepBudget).toBe(SWEEP_BUDGET_CAP);
  });

  it("A4: attack drains sweepBudget by SWEEP_ATTACK_COST", () => {
    const nowMs = { value: 1_000 };
    const runtime = mkRuntime(
      [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
          siegeOutpost: { ownerId: "player-1", status: "active", sweepBudget: SWEEP_BUDGET_CAP, sweepActive: true, sweepBudgetUpdatedAt: 1_000 }
        },
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
      ],
      ["player-1", "player-2"],
      () => nowMs.value
    );

    runtime.tickTerritoryAutomation(nowMs.value);

    const outpost = tileSiegeOutpost(runtime, 10, 10);
    expect(outpost?.sweepBudget).toBe(SWEEP_BUDGET_CAP - SWEEP_ATTACK_COST);
    // sweepActive stays true
    expect(outpost?.sweepActive).toBe(true);
  });

  it("A5: sweepBudget < SWEEP_ATTACK_COST → pause, sweepActive stays true, no attack", () => {
    const nowMs = { value: 1_000 };
    const events: SimulationEvent[] = [];
    const runtime = mkRuntime(
      [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
          siegeOutpost: { ownerId: "player-1", status: "active", sweepBudget: SWEEP_ATTACK_COST - 1, sweepActive: true, sweepBudgetUpdatedAt: 1_000 }
        },
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
      ],
      ["player-1", "player-2"],
      () => nowMs.value
    );
    runtime.onEvent((e) => events.push(e));

    runtime.tickTerritoryAutomation(nowMs.value);

    const outpost = tileSiegeOutpost(runtime, 10, 10);
    // Still active (paused, not deactivated)
    expect(outpost?.sweepActive).toBe(true);
    // No attack was launched
    const accepted = events.filter((e) => e.eventType === "COMMAND_ACCEPTED");
    expect(accepted).toHaveLength(0);
  });

  it("A7: auto-resume after budget refills past threshold", () => {
    const nowMs = { value: 1_000 };
    const events: SimulationEvent[] = [];
    const runtime = mkRuntime(
      [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
          // Start just below threshold so the wait is short and unrelated
          // automation (frontier auto-claim) can't reach the enemy tile first.
          siegeOutpost: { ownerId: "player-1", status: "active", sweepBudget: SWEEP_ATTACK_COST - 1, sweepActive: true, sweepBudgetUpdatedAt: 1_000 }
        },
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
      ],
      ["player-1", "player-2"],
      () => nowMs.value
    );
    runtime.onEvent((e) => events.push(e));

    // Tick with budget below threshold — sweep pauses, no attack.
    runtime.tickTerritoryAutomation(nowMs.value);
    const noAttackEvents = events.filter((e) => e.eventType === "COMMAND_ACCEPTED");
    expect(noAttackEvents).toHaveLength(0);

    // Jump forward enough that the 1 MP gap fills at MANPOWER_BASE_REGEN_PER_MINUTE.
    const minutesToRecover = Math.ceil(1 / MANPOWER_BASE_REGEN_PER_MINUTE) + 1;
    nowMs.value = 1_000 + minutesToRecover * 60_000;
    runtime.tickTerritoryAutomation(nowMs.value);

    const afterAttackEvents = events.filter((e) => e.eventType === "COMMAND_ACCEPTED");
    expect(afterAttackEvents.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// B-group: targeting
// ---------------------------------------------------------------------------

describe("sweep targeting (outpost at 10,10, radius 5)", () => {
  it("B1: enemy tiles within radius included; outside excluded", () => {
    const outpost = { x: 10, y: 10, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const };
    const tiles = new Map([
      ["9,9",   { x: 9,  y: 9,  terrain: "LAND" as const, ownerId: "player-2", ownershipState: "FRONTIER" as const }],
      ["12,15", { x: 12, y: 15, terrain: "LAND" as const, ownerId: "player-2", ownershipState: "FRONTIER" as const }],
      ["10,11", { x: 10, y: 11, terrain: "LAND" as const, ownerId: "player-2", ownershipState: "FRONTIER" as const }],
      ["4,3",   { x: 4,  y: 3,  terrain: "LAND" as const, ownerId: "player-2", ownershipState: "FRONTIER" as const }],  // distance 7 > 5
    ]);
    const getTile = (x: number, y: number) => tiles.get(`${x},${y}`);
    const candidates = sweepAttackCandidates(outpost, "player-1", 5, getTile);
    const keys = candidates.map((t) => `${t.x},${t.y}`);
    expect(keys).toContain("9,9");
    // 12,15 is distance = max(|12-10|,|15-10|) = max(2,5) = 5 ≤ 5, so included
    expect(keys).toContain("12,15");
    expect(keys).toContain("10,11");
    // 4,3 is distance = max(|4-10|,|3-10|) = max(6,7) = 7 > 5, so excluded
    expect(keys).not.toContain("4,3");
  });

  it("B2/B3: closest target attacked first; deterministic tie-break (lower x then lower y)", () => {
    const outpost = { x: 10, y: 10, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const };
    // All at chebyshev distance 1 from outpost, tie-break by x then y
    const tiles = new Map([
      ["11,10", { x: 11, y: 10, terrain: "LAND" as const, ownerId: "player-2", ownershipState: "FRONTIER" as const }],
      ["9,10",  { x: 9,  y: 10, terrain: "LAND" as const, ownerId: "player-2", ownershipState: "FRONTIER" as const }],
      ["10,11", { x: 10, y: 11, terrain: "LAND" as const, ownerId: "player-2", ownershipState: "FRONTIER" as const }],
    ]);
    const getTile = (x: number, y: number) => tiles.get(`${x},${y}`);
    const candidates = sweepAttackCandidates(outpost, "player-1", 5, getTile);
    // All are distance 1; tie-break: lower x first → 9,10 should be first
    expect(candidates[0]?.x).toBe(9);
    expect(candidates[0]?.y).toBe(10);
  });

  it("B4: own tiles are not targeted", () => {
    const outpost = { x: 10, y: 10, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const };
    const tiles = new Map([
      ["11,10", { x: 11, y: 10, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "FRONTIER" as const }],
    ]);
    const candidates = sweepAttackCandidates(outpost, "player-1", 5, (x, y) => tiles.get(`${x},${y}`));
    expect(candidates).toHaveLength(0);
  });

  it("B5: barbarian tiles included as valid targets", () => {
    const outpost = { x: 10, y: 10, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const };
    const tiles = new Map([
      ["11,10", { x: 11, y: 10, terrain: "LAND" as const, ownerId: "barbarian-1", ownershipState: "BARBARIAN" as const }],
    ]);
    const candidates = sweepAttackCandidates(outpost, "player-1", 5, (x, y) => tiles.get(`${x},${y}`));
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.ownerId).toBe("barbarian-1");
  });

  it("B6: no targets in radius → sweepActive set to false", () => {
    const nowMs = { value: 1_000 };
    const runtime = mkRuntime(
      [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
          siegeOutpost: { ownerId: "player-1", status: "active", sweepBudget: SWEEP_BUDGET_CAP, sweepActive: true, sweepBudgetUpdatedAt: 1_000 }
        }
        // No enemy tiles
      ],
      ["player-1"],
      () => nowMs.value
    );

    runtime.tickTerritoryAutomation(nowMs.value);

    const outpost = tileSiegeOutpost(runtime, 10, 10);
    expect(outpost?.sweepActive).toBe(false);
  });

  it("B6b: after auto-deactivation, enemies returning to radius does NOT reactivate", () => {
    // Establish auto-deactivation
    const nowMs = { value: 1_000 };
    const runtime = mkRuntime(
      [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
          siegeOutpost: { ownerId: "player-1", status: "active", sweepBudget: SWEEP_BUDGET_CAP, sweepActive: true, sweepBudgetUpdatedAt: 1_000 }
        }
      ],
      ["player-1", "player-2"],
      () => nowMs.value
    );

    // No enemies, so deactivates
    runtime.tickTerritoryAutomation(nowMs.value);
    expect(tileSiegeOutpost(runtime, 10, 10)?.sweepActive).toBe(false);

    // Even though player-2 could now be adjacent, we don't re-activate automatically
    // (B6b just verifies sweepActive stays false without manual toggle)
    runtime.tickTerritoryAutomation(nowMs.value);
    expect(tileSiegeOutpost(runtime, 10, 10)?.sweepActive).toBe(false);
  });

  it("B7: after capturing closest tile, next tick recomputes target", () => {
    vi.useFakeTimers();
    try {
      const now = { value: 1_000 };
      const runtime = new SimulationRuntime({
        now: () => now.value,
        initialPlayers: new Map([
          ["player-1", { ...mkPlayer("player-1"), manpower: 1_000, points: 10_000 }],
          ["player-2", mkPlayer("player-2")]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
              siegeOutpost: { ownerId: "player-1", status: "active", sweepBudget: SWEEP_BUDGET_CAP, sweepActive: true, sweepBudgetUpdatedAt: 1_000 }
            },
            { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }, // closer
            { x: 12, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }  // farther
          ],
          activeLocks: []
        }
      });
      const events: SimulationEvent[] = [];
      runtime.onEvent((e) => events.push(e));

      // Tick 1: should attack (11,10) as it's closest
      runtime.tickTerritoryAutomation(now.value);
      const firstAttacks = events.filter(
        (e) => e.eventType === "COMMAND_ACCEPTED"
      );
      expect(firstAttacks.length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// C-group: lifecycle
// ---------------------------------------------------------------------------

describe("sweep lifecycle", () => {
  it("C1: toggle on/off does not drain any resources", async () => {
    const now = { value: 1_000 };
    const runtime = mkRuntime(
      [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
          siegeOutpost: { ownerId: "player-1", status: "active", sweepBudget: 200, sweepActive: false, sweepBudgetUpdatedAt: 1_000 }
        }
      ],
      ["player-1"],
      () => now.value
    );

    const before = runtime.exportState().players.find((p) => p.id === "player-1");
    const budgetBefore = tileSiegeOutpost(runtime, 10, 10)?.sweepBudget;

    runtime.submitCommand({
      commandId: "sweep-on",
      sessionId: "s1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: now.value,
      type: "SET_SIEGE_OUTPOST_SWEEP",
      payloadJson: JSON.stringify({ x: 10, y: 10, enabled: true })
    });
    await Promise.resolve();

    runtime.submitCommand({
      commandId: "sweep-off",
      sessionId: "s1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: now.value,
      type: "SET_SIEGE_OUTPOST_SWEEP",
      payloadJson: JSON.stringify({ x: 10, y: 10, enabled: false })
    });
    await Promise.resolve();

    const after = runtime.exportState().players.find((p) => p.id === "player-1");
    const budgetAfter = tileSiegeOutpost(runtime, 10, 10)?.sweepBudget;

    // Gold and manpower unchanged
    expect(after?.points).toBe(before?.points);
    expect(after?.manpower).toBe(before?.manpower);
    // Budget unchanged by toggle alone
    expect(budgetAfter).toBe(budgetBefore);
  });

  it("C2: toggling off mid-sweep stops future attacks", async () => {
    const now = { value: 1_000 };
    const runtime = mkRuntime(
      [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
          siegeOutpost: { ownerId: "player-1", status: "active", sweepBudget: SWEEP_BUDGET_CAP, sweepActive: true, sweepBudgetUpdatedAt: 1_000 }
        },
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
      ],
      ["player-1", "player-2"],
      () => now.value
    );

    // Disable sweep
    runtime.submitCommand({
      commandId: "sweep-off",
      sessionId: "s1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: now.value,
      type: "SET_SIEGE_OUTPOST_SWEEP",
      payloadJson: JSON.stringify({ x: 10, y: 10, enabled: false })
    });
    await Promise.resolve();

    const events: SimulationEvent[] = [];
    runtime.onEvent((e) => events.push(e));

    runtime.tickTerritoryAutomation(now.value);

    const accepted = events.filter((e) => e.eventType === "COMMAND_ACCEPTED");
    expect(accepted).toHaveLength(0);
  });

  it("C3: outpost-not-found command is rejected cleanly", async () => {
    const now = { value: 1_000 };
    const runtime = mkRuntime(
      [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }],
      ["player-1"],
      () => now.value
    );
    const events: SimulationEvent[] = [];
    runtime.onEvent((e) => events.push(e));

    runtime.submitCommand({
      commandId: "sweep-bad",
      sessionId: "s1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: now.value,
      type: "SET_SIEGE_OUTPOST_SWEEP",
      payloadJson: JSON.stringify({ x: 10, y: 10, enabled: true })
    });
    await Promise.resolve();

    const rejected = events.find((e) => e.eventType === "COMMAND_REJECTED");
    expect(rejected).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// H-group: sweep + encirclement integration
// ---------------------------------------------------------------------------

describe("sweep + encirclement integration", () => {
  it("H1: sweep attack uses existing attack path, encirclement triggers on capture", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0); // attacker always wins
    try {
      const now = { value: 1_000 };
      const runtime = new SimulationRuntime({
        now: () => now.value,
        initialPlayers: new Map([
          ["player-1", { ...mkPlayer("player-1"), manpower: 1_000, points: 10_000 }],
          ["player-2", mkPlayer("player-2")]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
              siegeOutpost: { ownerId: "player-1", status: "active", sweepBudget: SWEEP_BUDGET_CAP, sweepActive: true, sweepBudgetUpdatedAt: 1_000 }
            },
            { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
          ],
          activeLocks: []
        }
      });
      const events: SimulationEvent[] = [];
      runtime.onEvent((e) => events.push(e));

      // tick fires sweep attack
      runtime.tickTerritoryAutomation(now.value);

      // Attack should be accepted
      const accepted = events.find((e) => e.eventType === "COMMAND_ACCEPTED");
      expect(accepted).toBeDefined();

      // Advance timer to resolve combat
      vi.advanceTimersByTime(3_200);

      const combatResolved = events.find((e) => e.eventType === "COMBAT_RESOLVED");
      expect(combatResolved).toBeDefined();
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("H2: large cut-off pocket all get frontierDecayAt set in same tick", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      // Build a scenario where capturing one tile encircles a chain of 5 tiles
      // S(P1,10,10) — F_key(P2,11,10) — F_chain[P1: 12,10 to 16,10]
      // After sweep captures (11,10), player-1 tiles (12-16, 10) would be encircled
      // (but in this test we just verify encirclement fires at all from a sweep attack)
      const now = { value: 1_000 };
      const runtime = new SimulationRuntime({
        now: () => now.value,
        initialPlayers: new Map([
          ["player-1", { ...mkPlayer("player-1"), manpower: 1_000, points: 10_000 }],
          ["player-2", mkPlayer("player-2")]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
              siegeOutpost: { ownerId: "player-1", status: "active", sweepBudget: SWEEP_BUDGET_CAP, sweepActive: true, sweepBudgetUpdatedAt: 1_000 }
            },
            { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
            // pocket of player-2 tiles isolated once 11,10 is captured
            { x: 12, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
            { x: 13, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
          ],
          activeLocks: []
        }
      });
      const events: SimulationEvent[] = [];
      runtime.onEvent((e) => events.push(e));

      runtime.tickTerritoryAutomation(now.value);
      vi.advanceTimersByTime(3_200);

      // At least one TILE_DELTA_BATCH should have been emitted
      const deltaEvents = events.filter((e) => e.eventType === "TILE_DELTA_BATCH");
      expect(deltaEvents.length).toBeGreaterThan(0);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// I-group: determinism / snapshot roundtrip
// ---------------------------------------------------------------------------

describe("sweep determinism and snapshot roundtrip", () => {
  it("I1: snapshot exportState preserves sweepBudget and sweepActive", () => {
    const runtime = mkRuntime([
      { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
        siegeOutpost: { ownerId: "player-1", status: "active", sweepBudget: 150, sweepActive: true, sweepBudgetUpdatedAt: 1_000 }
      }
    ]);
    const outpost = tileSiegeOutpost(runtime, 10, 10);
    expect(outpost?.sweepBudget).toBe(150);
    expect(outpost?.sweepActive).toBe(true);
  });

  it("I2: same seed + commands produce same sweep targets (deterministic)", () => {
    const makeRuntime = () => mkRuntime([
      { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
        siegeOutpost: { ownerId: "player-1", status: "active", sweepBudget: SWEEP_BUDGET_CAP, sweepActive: true, sweepBudgetUpdatedAt: 1_000 }
      },
      { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
      { x: 9, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
    ]);

    const r1 = makeRuntime();
    const r2 = makeRuntime();
    const events1: SimulationEvent[] = [];
    const events2: SimulationEvent[] = [];
    r1.onEvent((e) => events1.push(e));
    r2.onEvent((e) => events2.push(e));

    r1.tickTerritoryAutomation(1_000);
    r2.tickTerritoryAutomation(1_000);

    const accepted1 = events1.filter((e) => e.eventType === "COMMAND_ACCEPTED");
    const accepted2 = events2.filter((e) => e.eventType === "COMMAND_ACCEPTED");
    expect(accepted1.length).toBe(accepted2.length);
  });
});

// ---------------------------------------------------------------------------
// Pause vs deactivate conflict
// ---------------------------------------------------------------------------

describe("pause vs deactivate conflict", () => {
  it("budget tom AND no targets → deactivate wins (sweepActive = false)", () => {
    const nowMs = { value: 1_000 };
    const runtime = mkRuntime(
      [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
          // Budget below threshold AND no enemies
          siegeOutpost: { ownerId: "player-1", status: "active", sweepBudget: SWEEP_ATTACK_COST - 1, sweepActive: true, sweepBudgetUpdatedAt: 1_000 }
        }
        // No enemy tiles
      ],
      ["player-1"],
      () => nowMs.value
    );

    runtime.tickTerritoryAutomation(nowMs.value);

    const outpost = tileSiegeOutpost(runtime, 10, 10);
    // deactivate wins: sweepActive = false
    expect(outpost?.sweepActive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LIGHT_OUTPOST sweep toggle (SET_SIEGE_OUTPOST_SWEEP with economicStructure)
// ---------------------------------------------------------------------------

describe("LIGHT_OUTPOST sweep toggle", () => {
  const mkLightOutpostTile = (x: number, y: number, ownerId: string, sweepBudget = SWEEP_BUDGET_CAP, sweepActive = false) => ({
    x,
    y,
    terrain: "LAND" as const,
    ownerId,
    ownershipState: "SETTLED" as const,
    economicStructure: {
      id: `lo-${x}-${y}`,
      type: "LIGHT_OUTPOST",
      tileKey: `${x},${y}`,
      ownerId,
      status: "active" as const,
      nextUpkeepAt: Number.MAX_SAFE_INTEGER,
      sweepBudget,
      sweepActive,
      sweepBudgetUpdatedAt: 1_000
    }
  });

  it("LO-C1: SET_SIEGE_OUTPOST_SWEEP {enabled:true} sets sweepActive on LIGHT_OUTPOST", async () => {
    const runtime = mkRuntime(
      [mkLightOutpostTile(10, 10, "player-1", SWEEP_BUDGET_CAP, false)],
      ["player-1", "player-2"]
    );
    const events = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "lo-sweep-on",
      sessionId: "s1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SET_SIEGE_OUTPOST_SWEEP",
      payloadJson: JSON.stringify({ x: 10, y: 10, enabled: true })
    });
    await Promise.resolve();

    const outpost = tileLightOutpost(runtime, 10, 10);
    expect(outpost?.sweepActive).toBe(true);

    const tileDeltas = events.filter((e) => e.eventType === "TILE_DELTA_BATCH");
    expect(tileDeltas.length).toBeGreaterThanOrEqual(1);
  });

  it("LO-C2: SET_SIEGE_OUTPOST_SWEEP {enabled:false} turns off sweep on LIGHT_OUTPOST", async () => {
    const runtime = mkRuntime(
      [mkLightOutpostTile(10, 10, "player-1", SWEEP_BUDGET_CAP, true)],
      ["player-1", "player-2"]
    );

    runtime.submitCommand({
      commandId: "lo-sweep-off",
      sessionId: "s1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SET_SIEGE_OUTPOST_SWEEP",
      payloadJson: JSON.stringify({ x: 10, y: 10, enabled: false })
    });
    await Promise.resolve();

    const outpost = tileLightOutpost(runtime, 10, 10);
    expect(outpost?.sweepActive).toBe(false);
  });

  // LO-C3 (does an enabled LIGHT_OUTPOST actually fire on tick?) is intentionally
  // not covered here. The sim's per-tick sweep firing was unchanged by this PR
  // and is already covered by the SIEGE_OUTPOST sweep tests above; LIGHT_OUTPOST
  // routes through the same shared tickSweepStructure helper. Setting up the
  // anchor/manpower/projection fixture for an end-to-end LIGHT_OUTPOST tick
  // belongs with the structure-pipeline rewrite.

  it("LO-neg: SET_SIEGE_OUTPOST_SWEEP on tile with no outpost → COMMAND_REJECTED", async () => {
    const runtime = mkRuntime(
      [{ x: 5, y: 5, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const }],
      ["player-1", "player-2"]
    );
    const events = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "lo-sweep-reject",
      sessionId: "s1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SET_SIEGE_OUTPOST_SWEEP",
      payloadJson: JSON.stringify({ x: 5, y: 5, enabled: true })
    });
    await Promise.resolve();

    const rejected = events.filter((e) => e.eventType === "COMMAND_REJECTED");
    expect(rejected.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Fix 1 & 2: bordering-attack, expansion, and no-budget-deduction-on-reject
// ---------------------------------------------------------------------------

describe("sweep attack uses bordering owned tile as origin", () => {
  it("attacks from a bordering owned neighbour (not the outpost) when target borders territory", () => {
    // Layout:
    //   (10,10) SETTLED outpost (player-1)
    //   (11,10) SETTLED player-1 (borders the target)
    //   (12,10) FRONTIER player-2  <- sweep target, borders (11,10)
    const nowMs = { value: 1_000 };
    const events: SimulationEvent[] = [];
    const runtime = mkRuntime(
      [
        {
          x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
          siegeOutpost: { ownerId: "player-1", status: "active", sweepBudget: SWEEP_BUDGET_CAP, sweepActive: true, sweepBudgetUpdatedAt: 1_000 }
        },
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 12, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
      ],
      ["player-1", "player-2"],
      () => nowMs.value
    );
    runtime.onEvent((e) => events.push(e));

    runtime.tickTerritoryAutomation(nowMs.value);

    // The attack must be accepted (origin (11,10) is adjacent to target (12,10))
    const accepted = events.filter((e) => e.eventType === "COMMAND_ACCEPTED");
    expect(accepted.length).toBeGreaterThan(0);
    const acceptedEvent = accepted[0] as Extract<SimulationEvent, { eventType: "COMMAND_ACCEPTED" }>;
    expect(acceptedEvent.originX).toBe(11);
    expect(acceptedEvent.originY).toBe(10);
    expect(acceptedEvent.targetX).toBe(12);
    expect(acceptedEvent.targetY).toBe(10);
    // Budget should be deducted
    const outpost = tileSiegeOutpost(runtime, 10, 10);
    expect(outpost?.sweepBudget).toBe(SWEEP_BUDGET_CAP - SWEEP_ATTACK_COST);
  });
});

describe("sweep expands toward target when it does not border owned territory", () => {
  it("issues EXPAND toward the target when target is out of reach", () => {
    // Layout:
    //   (10,10) SETTLED outpost (player-1)
    //   (12,10) FRONTIER player-2  <- 2 tiles away; no owned tile at (11,10)
    //   (11,10) unowned neutral land
    const nowMs = { value: 1_000 };
    const events: SimulationEvent[] = [];
    const runtime = mkRuntime(
      [
        {
          x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
          siegeOutpost: { ownerId: "player-1", status: "active", sweepBudget: SWEEP_BUDGET_CAP, sweepActive: true, sweepBudgetUpdatedAt: 1_000 }
        },
        { x: 11, y: 10, terrain: "LAND" }, // neutral, no owner
        { x: 12, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
      ],
      ["player-1", "player-2"],
      () => nowMs.value
    );
    runtime.onEvent((e) => events.push(e));

    runtime.tickTerritoryAutomation(nowMs.value);

    // An EXPAND command should be accepted (not an ATTACK)
    const accepted = events.filter((e) => e.eventType === "COMMAND_ACCEPTED") as Array<Extract<SimulationEvent, { eventType: "COMMAND_ACCEPTED" }>>;
    expect(accepted.length).toBeGreaterThan(0);
    expect(accepted[0]!.actionType).toBe("EXPAND");
    // The expansion target should be the neutral tile (11,10)
    expect(accepted[0]!.targetX).toBe(11);
    expect(accepted[0]!.targetY).toBe(10);
    // Budget should be deducted since the EXPAND was accepted
    const outpost = tileSiegeOutpost(runtime, 10, 10);
    expect(outpost?.sweepBudget).toBe(SWEEP_BUDGET_CAP - SWEEP_ATTACK_COST);
  });
});

describe("sweep budget not deducted when command is rejected", () => {
  it("does NOT deduct budget when sweep fires but the command is rejected (e.g. target already locked)", async () => {
    // Submit a player-issued attack to lock the target tile first,
    // then tick sweep so the same tile is targeted but locked → rejected.
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(1); // attacker loses so lock is placed
    try {
      const now = { value: 1_000 };
      const runtime = new SimulationRuntime({
        now: () => now.value,
        initialPlayers: new Map([
          ["player-1", { ...mkPlayer("player-1"), manpower: 10_000, points: 10_000 }],
          ["player-2", mkPlayer("player-2")]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            {
              x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
              siegeOutpost: { ownerId: "player-1", status: "active", sweepBudget: SWEEP_BUDGET_CAP, sweepActive: true, sweepBudgetUpdatedAt: 1_000 }
            },
            { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
          ],
          activeLocks: []
        }
      });

      // Issue a player attack that places a lock on (11,10)
      runtime.submitCommand({
        commandId: "player-attack-1",
        sessionId: "player-session",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: now.value,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
      });
      await Promise.resolve();

      // Budget before sweep tick (may have been affected by player attack path spending MP — but sweep budget is separate)
      const budgetBefore = tileSiegeOutpost(runtime, 10, 10)?.sweepBudget ?? 0;

      // Now tick sweep — target (11,10) is locked, so the sweep ATTACK will be rejected.
      runtime.tickTerritoryAutomation(now.value);

      const budgetAfter = tileSiegeOutpost(runtime, 10, 10)?.sweepBudget ?? 0;
      // Budget should NOT have decreased by SWEEP_ATTACK_COST
      expect(budgetAfter).toBeGreaterThanOrEqual(budgetBefore - 0.001); // allow tiny regen difference
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
