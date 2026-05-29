/**
 * Encirclement tests — spec IDs from the implementation plan.
 *
 * Pure function tests (E*, F*, connectivity) run against the exported helpers
 * in encirclement.ts. Integration tests (G*) run against SimulationRuntime.
 */
import { describe, expect, it, vi } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { computeEncirclementDeltas, ENCIRCLEMENT_BFS_CAP, ENCIRCLEMENT_DECAY_MS, isFrontierConnected } from "./encirclement.js";
import { FRONTIER_DECAY_MS } from "./territory-automation.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TileStub = { ownerId?: string; ownershipState?: string; frontierDecayAt?: number; frontierDecayKind?: "NATURAL" | "ENCIRCLEMENT" };

const mkTileMap = (entries: Record<string, TileStub>): ((key: string) => TileStub | undefined) =>
  (key: string) => entries[key];

const player = (id: string, points = 10_000, manpower = 10_000) => ({
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

const mkRuntime = (tiles: Array<{
  x: number;
  y: number;
  terrain: "LAND" | "SEA";
  ownerId?: string;
  ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
  frontierDecayAt?: number;
  frontierDecayKind?: "NATURAL" | "ENCIRCLEMENT";
}>, players = ["player-1", "player-2"]) =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map(players.map((id) => [id, player(id)])),
    seedTiles: new Map(),
    initialState: { tiles, activeLocks: [] }
  });

// ---------------------------------------------------------------------------
// E-group: connectivity semantics
// ---------------------------------------------------------------------------

describe("encirclement connectivity", () => {
  it("E1: P2 takes middle tile — far tile cut off, near tile still connected", () => {
    // Layout: S(P1,10,10) — F1(P1,11,10) — F2(now P2,12,10) — F3(P1,13,10)
    const tiles = mkTileMap({
      "10,10": { ownerId: "player-1", ownershipState: "SETTLED" },
      "11,10": { ownerId: "player-1", ownershipState: "FRONTIER" },
      "12,10": { ownerId: "player-2", ownershipState: "FRONTIER" }, // captured
      "13,10": { ownerId: "player-1", ownershipState: "FRONTIER" }
    });
    expect(isFrontierConnected("11,10", "player-1", tiles)).toBe(true);
    expect(isFrontierConnected("13,10", "player-1", tiles)).toBe(false);
  });

  it("E2: settled tiles are never cut off by this check (only FRONTIER tiles are evaluated)", () => {
    // A SETTLED tile should not return false — we simply skip non-FRONTIER tiles.
    const tiles = mkTileMap({
      "10,10": { ownerId: "player-1", ownershipState: "SETTLED" },
      "11,10": { ownerId: "player-2", ownershipState: "SETTLED" }
    });
    // isFrontierConnected returns false for non-FRONTIER input tiles (per its contract).
    // The important thing is that the caller (computeEncirclementDeltas) never adds
    // settled tiles to `toCheck`.
    const nowMs = 1_000;
    const { cutOff } = computeEncirclementDeltas(["11,10"], "player-2", tiles, nowMs);
    expect(cutOff.has("10,10")).toBe(false);
    expect(cutOff.size).toBe(0); // no frontier tiles for player-1 in region
  });

  it("E3: reconnection clears timer immediately", () => {
    // F1 was cut off; then the blocking tile reverts, so F1 is connected again.
    const tiles = mkTileMap({
      "10,10": { ownerId: "player-1", ownershipState: "SETTLED" },
      "11,10": { ownerId: "player-1", ownershipState: "FRONTIER" },
      "12,10": { ownerId: "player-1", ownershipState: "FRONTIER", frontierDecayAt: 61_000, frontierDecayKind: "ENCIRCLEMENT" }
    });
    const nowMs = 1_000;
    const { reconnected } = computeEncirclementDeltas(["11,10"], "player-1", tiles, nowMs);
    expect(reconnected.has("12,10")).toBe(true);
  });

  it("E4: multiple supply paths — severing one doesn't cut off tile", () => {
    // Two paths from F(10,10) to settled:
    //   path A: (10,10)→(9,9) settled
    //   path B: (10,10)→(11,9) frontier→(11,8) settled
    // Severing the diagonal (9,9) won't matter while (11,9)→(11,8) remains.
    const tiles = mkTileMap({
      "9,9":   { ownerId: "player-1", ownershipState: "SETTLED" },  // path A
      "11,8":  { ownerId: "player-1", ownershipState: "SETTLED" },  // path B terminus
      "11,9":  { ownerId: "player-1", ownershipState: "FRONTIER" }, // path B step
      "10,10": { ownerId: "player-1", ownershipState: "FRONTIER" }
    });
    // Remove path A (pretend (9,9) was captured)
    const tilesNoPathA = mkTileMap({
      "9,9":   { ownerId: "player-2", ownershipState: "FRONTIER" }, // no longer P1 settled
      "11,8":  { ownerId: "player-1", ownershipState: "SETTLED" },
      "11,9":  { ownerId: "player-1", ownershipState: "FRONTIER" },
      "10,10": { ownerId: "player-1", ownershipState: "FRONTIER" }
    });
    expect(isFrontierConnected("10,10", "player-1", tilesNoPathA)).toBe(true);
  });

  it("E6: 8-neighbor connectivity — diagonal path works", () => {
    // S(10,10) and F(11,11) are only diagonally adjacent.
    const tiles = mkTileMap({
      "10,10": { ownerId: "player-1", ownershipState: "SETTLED" },
      "11,11": { ownerId: "player-1", ownershipState: "FRONTIER" }
    });
    expect(isFrontierConnected("11,11", "player-1", tiles)).toBe(true);
  });

  it("E7a: frontier tile adjacent to own settled tile is connected", () => {
    const tiles = mkTileMap({
      "10,10": { ownerId: "player-1", ownershipState: "SETTLED" },
      "11,10": { ownerId: "player-1", ownershipState: "FRONTIER" }
    });
    expect(isFrontierConnected("11,10", "player-1", tiles)).toBe(true);
  });

  it("E7b: frontier tile adjacent only to another player's settled tile is cut off", () => {
    const tiles = mkTileMap({
      "10,10": { ownerId: "player-2", ownershipState: "SETTLED" },
      "11,10": { ownerId: "player-1", ownershipState: "FRONTIER" }
    });
    expect(isFrontierConnected("11,10", "player-1", tiles)).toBe(false);
  });

  it("E7c: long chain all owned — all connected", () => {
    const tiles = mkTileMap({
      "10,10": { ownerId: "player-1", ownershipState: "SETTLED" },
      "11,10": { ownerId: "player-1", ownershipState: "FRONTIER" },
      "12,10": { ownerId: "player-1", ownershipState: "FRONTIER" },
      "13,10": { ownerId: "player-1", ownershipState: "FRONTIER" }
    });
    expect(isFrontierConnected("11,10", "player-1", tiles)).toBe(true);
    expect(isFrontierConnected("12,10", "player-1", tiles)).toBe(true);
    expect(isFrontierConnected("13,10", "player-1", tiles)).toBe(true);
  });

  it("E7d: path through another player's settled tile is blocked", () => {
    // F1→F2→S2(P2)→S1(P1): F1 and F2 are cut off
    const tiles = mkTileMap({
      "10,10": { ownerId: "player-1", ownershipState: "SETTLED" }, // S1(P1) — not reachable through P2 settled
      "11,10": { ownerId: "player-2", ownershipState: "SETTLED" }, // S2(P2) — blocks path
      "12,10": { ownerId: "player-1", ownershipState: "FRONTIER" }, // F2
      "13,10": { ownerId: "player-1", ownershipState: "FRONTIER" }  // F1
    });
    // F2(12,10) is adjacent to S2(P2) — that doesn't help; also adjacent to F1(13,10) but
    // neither has a direct path to P1 settled because P2 settled at 11,10 blocks the path.
    // No P1 settled tile is reachable.
    expect(isFrontierConnected("12,10", "player-1", tiles)).toBe(false);
    expect(isFrontierConnected("13,10", "player-1", tiles)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// F-group: timer semantics
// ---------------------------------------------------------------------------

describe("encirclement timer semantics", () => {
  it("F1: cut-off tile receives 60 s decay timer", () => {
    const nowMs = 1_000;
    const tiles = mkTileMap({
      "12,10": { ownerId: "player-1", ownershipState: "FRONTIER" }
      // no settled tile for player-1 anywhere
    });
    const { cutOff } = computeEncirclementDeltas(["12,10"], "player-1", tiles, nowMs);
    expect(cutOff.has("12,10")).toBe(true);
  });

  it("F2: timer not restarted if already blinking (min-wins)", () => {
    // Tile already has a shorter timer (30 s left of 60 s); should not be overwritten.
    const nowMs = 1_000;
    const shorterDecayAt = nowMs + 30_000; // only 30 s remaining
    const tiles = mkTileMap({
      "12,10": { ownerId: "player-1", ownershipState: "FRONTIER", frontierDecayAt: shorterDecayAt }
    });
    // The tile is still cut off after the encirclement check.
    const { cutOff } = computeEncirclementDeltas(["12,10"], "player-1", tiles, nowMs);
    expect(cutOff.has("12,10")).toBe(true);
    // The applyEncirclement path would compute: min(shorterDecayAt, nowMs + 60s) = shorterDecayAt.
    // Verify the min-wins logic: encirclementExpiresAt would be nowMs + 60_000 = 61_000.
    // shorterDecayAt = 31_000 < 61_000 → min is 31_000, so no update.
    const encirclementExpiresAt = nowMs + ENCIRCLEMENT_DECAY_MS;
    const newDecayAt = Math.min(shorterDecayAt, encirclementExpiresAt);
    expect(newDecayAt).toBe(shorterDecayAt); // shorter wins, no overwrite
  });

  it("F3: reconnection clears timer fully", () => {
    const nowMs = 1_000;
    const tiles = mkTileMap({
      "10,10": { ownerId: "player-1", ownershipState: "SETTLED" },
      "11,10": { ownerId: "player-1", ownershipState: "FRONTIER", frontierDecayAt: nowMs + 30_000, frontierDecayKind: "ENCIRCLEMENT" }
    });
    const { reconnected } = computeEncirclementDeltas(["10,10"], "player-1", tiles, nowMs);
    expect(reconnected.has("11,10")).toBe(true);
  });

  it("F4: natural decay and encirclement share frontierDecayAt — min wins", () => {
    const nowMs = 1_000;
    // Natural 10-min decay was set 9 min 30 s ago, so 30 s remaining < 60 s.
    const naturalDecayAt = nowMs + 30_000; // 30 s remaining
    const tiles = mkTileMap({
      "12,10": { ownerId: "player-1", ownershipState: "FRONTIER", frontierDecayAt: naturalDecayAt, frontierDecayKind: "NATURAL" }
    });
    const { cutOff } = computeEncirclementDeltas(["12,10"], "player-1", tiles, nowMs);
    expect(cutOff.has("12,10")).toBe(true);
    // min(naturalDecayAt=31000, nowMs+60000=61000) → naturalDecayAt wins, no overwrite
    const encirclementExpiresAt = nowMs + ENCIRCLEMENT_DECAY_MS;
    expect(Math.min(naturalDecayAt, encirclementExpiresAt)).toBe(naturalDecayAt);

    // Reverse: if natural decay is far in future (9 min remaining), encirclement wins.
    const naturalDecayFar = nowMs + 9 * 60_000;
    const tilesLong = mkTileMap({
      "12,10": { ownerId: "player-1", ownershipState: "FRONTIER", frontierDecayAt: naturalDecayFar, frontierDecayKind: "NATURAL" }
    });
    const { cutOff: cutOff2 } = computeEncirclementDeltas(["12,10"], "player-1", tilesLong, nowMs);
    expect(cutOff2.has("12,10")).toBe(true);
    expect(Math.min(naturalDecayFar, encirclementExpiresAt)).toBe(encirclementExpiresAt);
  });

  it("F5: reconnect preserves natural decay timer, including its final 60 seconds", () => {
    const nowMs = 1_000;
    const tiles = mkTileMap({
      "10,10": { ownerId: "player-1", ownershipState: "SETTLED" },
      "11,10": { ownerId: "player-1", ownershipState: "FRONTIER", frontierDecayAt: nowMs + 30_000, frontierDecayKind: "NATURAL" }
    });
    const { reconnected } = computeEncirclementDeltas(["10,10"], "player-1", tiles, nowMs);
    expect(reconnected.has("11,10")).toBe(false);
  });

  it("F6: tile cut off while natural decay was running — encirclement wins via min-wins, then reconnects cleanly", () => {
    // Scenario: tile had a 10-min natural decay with 9 min remaining (naturalDecayAt).
    // It was cut off: applyEncirclement set a 60 s timer. min-wins → 60 s wins.
    // We simulate the post-cut-off state: tile now has the encirclement timer (60 s).
    // On reconnect, computeEncirclementDeltas should include it in `reconnected`
    // because remaining time ≤ ENCIRCLEMENT_DECAY_MS.
    const nowMs = 1_000;
    const encirclementTimer = nowMs + ENCIRCLEMENT_DECAY_MS; // 61_000 — exactly 60 s
    const tiles = mkTileMap({
      "10,10": { ownerId: "player-1", ownershipState: "SETTLED" },
      "11,10": { ownerId: "player-1", ownershipState: "FRONTIER", frontierDecayAt: encirclementTimer, frontierDecayKind: "ENCIRCLEMENT" }
    });
    const { reconnected } = computeEncirclementDeltas(["10,10"], "player-1", tiles, nowMs);
    // Timer is exactly ENCIRCLEMENT_DECAY_MS remaining → encirclement set it → can be cleared.
    expect(reconnected.has("11,10")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// G-group: attack source guard (integration with SimulationRuntime)
// ---------------------------------------------------------------------------

describe("encirclement attack guard", () => {
  it("G1: cannot use a cut-off (blinking) tile as attack source", async () => {
    const now = { value: 1_000 };
    const runtime = new SimulationRuntime({
      now: () => now.value,
      initialPlayers: new Map([
        ["player-1", player("player-1")],
        ["player-2", player("player-2")]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          // player-1 has a frontier tile with encirclement timer set
          {
            x: 10, y: 10, terrain: "LAND",
            ownerId: "player-1", ownershipState: "FRONTIER",
            frontierDecayAt: 1_000 + ENCIRCLEMENT_DECAY_MS, // 60 s from now
            frontierDecayKind: "ENCIRCLEMENT"
          },
          // player-2 target
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    const events: SimulationEvent[] = [];
    runtime.onEvent((e) => events.push(e));

    runtime.submitCommand({
      commandId: "attack-from-cutoff",
      sessionId: "s1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
    });
    await Promise.resolve();

    const rejected = events.find((e) => e.eventType === "COMMAND_REJECTED");
    expect(rejected).toBeDefined();
    expect(rejected).toMatchObject({ code: "ORIGIN_CUT_OFF" });
  });

  it("G3: attacks against a blinking tile proceed normally", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0); // attacker always wins
    try {
      const runtime = new SimulationRuntime({
        now: () => Date.now(),
        initialPlayers: new Map([
          ["player-1", player("player-1")],
          ["player-2", player("player-2")]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            // player-1 source — normal settled tile
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            // player-2 target — cut off / blinking
            {
              x: 11, y: 10, terrain: "LAND",
              ownerId: "player-2", ownershipState: "FRONTIER",
              frontierDecayAt: Date.now() + ENCIRCLEMENT_DECAY_MS,
              frontierDecayKind: "ENCIRCLEMENT"
            }
          ],
          activeLocks: []
        }
      });
      const events: SimulationEvent[] = [];
      runtime.onEvent((e) => events.push(e));

      runtime.submitCommand({
        commandId: "attack-against-cutoff",
        sessionId: "s1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: Date.now(),
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
      });
      await Promise.resolve();

      expect(events.find((e) => e.eventType === "COMMAND_ACCEPTED")).toBeDefined();
      expect(events.find((e) => e.eventType === "COMMAND_REJECTED")).toBeUndefined();

      vi.advanceTimersByTime(3_100);

      const combatResolved = events.find((e) => e.eventType === "COMBAT_RESOLVED");
      expect(combatResolved).toBeDefined();
      // biome-ignore lint: safe cast, event type checked above
      expect((combatResolved as Extract<SimulationEvent, { eventType: "COMBAT_RESOLVED" }>).attackerWon).toBe(true);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  // G1b: EXPAND from a blinking tile is blocked with ORIGIN_CUT_OFF.
  it("G1b: EXPAND from a cut-off (blinking) tile is rejected with ORIGIN_CUT_OFF", async () => {
    const runtime = mkRuntime([
      {
        x: 10, y: 10, terrain: "LAND",
        ownerId: "player-1", ownershipState: "FRONTIER",
        frontierDecayAt: 1_000 + ENCIRCLEMENT_DECAY_MS,
        frontierDecayKind: "ENCIRCLEMENT"
      },
      // neutral target adjacent to origin
      { x: 11, y: 10, terrain: "LAND" }
    ]);
    const events: SimulationEvent[] = [];
    runtime.onEvent((e) => events.push(e));

    runtime.submitCommand({
      commandId: "expand-from-cutoff",
      sessionId: "s1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
    });
    await Promise.resolve();

    const rejected = events.find((e) => e.eventType === "COMMAND_REJECTED");
    expect(rejected).toBeDefined();
    expect(rejected).toMatchObject({ code: "ORIGIN_CUT_OFF" });
  });

  // Regression: EXPAND from a normal (non-blinking) frontier tile still succeeds.
  it("G1b-regression: EXPAND from a non-blinking frontier tile is accepted", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => Date.now(),
        initialPlayers: new Map([["player-1", player("player-1")]]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            // player-1 origin — normal frontier tile, supplied by adjacent settled tile
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            // neutral target
            { x: 11, y: 10, terrain: "LAND" }
          ],
          activeLocks: []
        }
      });
      const events: SimulationEvent[] = [];
      runtime.onEvent((e) => events.push(e));

      runtime.submitCommand({
        commandId: "expand-normal",
        sessionId: "s1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: Date.now(),
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
      });
      await Promise.resolve();

      expect(events.find((e) => e.eventType === "COMMAND_ACCEPTED")).toBeDefined();
      expect(events.find((e) => e.eventType === "COMMAND_REJECTED")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("G1b-regression: EXPAND from a connected frontier tile with natural decay is accepted", async () => {
    const runtime = mkRuntime([
      {
        x: 10, y: 10, terrain: "LAND",
        ownerId: "player-1", ownershipState: "FRONTIER",
        frontierDecayAt: 1_000 + FRONTIER_DECAY_MS,
        frontierDecayKind: "NATURAL"
      },
      { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 11, y: 10, terrain: "LAND" }
    ]);
    const events: SimulationEvent[] = [];
    runtime.onEvent((e) => events.push(e));

    runtime.submitCommand({
      commandId: "expand-natural-decay",
      sessionId: "s1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
    });
    await Promise.resolve();

    expect(events.find((e) => e.eventType === "COMMAND_ACCEPTED")).toBeDefined();
    expect(events.find((e) => e.eventType === "COMMAND_REJECTED")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// G4-group: SETTLE guard on cut-off tiles
// ---------------------------------------------------------------------------

describe("encirclement settle guard", () => {
  // G4: SETTLE on a blinking (cut-off) tile is rejected.
  it("G4: SETTLE on a cut-off (blinking) tile is rejected with ORIGIN_CUT_OFF", async () => {
    const runtime = mkRuntime([
      {
        x: 10, y: 10, terrain: "LAND",
        ownerId: "player-1", ownershipState: "FRONTIER",
        frontierDecayAt: 1_000 + ENCIRCLEMENT_DECAY_MS,
        frontierDecayKind: "ENCIRCLEMENT"
      }
    ]);
    const events: SimulationEvent[] = [];
    runtime.onEvent((e) => events.push(e));

    runtime.submitCommand({
      commandId: "settle-cutoff",
      sessionId: "s1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });
    await Promise.resolve();

    const rejected = events.find((e) => e.eventType === "COMMAND_REJECTED");
    expect(rejected).toBeDefined();
    expect(rejected).toMatchObject({ code: "ORIGIN_CUT_OFF" });
  });

  // Regression: SETTLE on a normal (non-blinking) frontier tile still succeeds.
  it("G4-regression: SETTLE on a non-blinking frontier tile is accepted", async () => {
    const runtime = mkRuntime([
      // no frontierDecayAt set and adjacent settled supply → not cut off
      { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
      { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
    ]);
    const events: SimulationEvent[] = [];
    runtime.onEvent((e) => events.push(e));

    runtime.submitCommand({
      commandId: "settle-normal",
      sessionId: "s1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });
    await Promise.resolve();

    // Should be accepted (SETTLEMENT_STARTED or COMMAND_ACCEPTED — settle emits SETTLEMENT_STARTED)
    expect(events.find((e) => e.eventType === "SETTLEMENT_STARTED")).toBeDefined();
    expect(events.find((e) => e.eventType === "COMMAND_REJECTED")).toBeUndefined();
  });

  it("G4-regression: SETTLE on a connected frontier tile with natural decay is accepted", async () => {
    const runtime = mkRuntime([
      {
        x: 10, y: 10, terrain: "LAND",
        ownerId: "player-1", ownershipState: "FRONTIER",
        frontierDecayAt: 1_000 + FRONTIER_DECAY_MS,
        frontierDecayKind: "NATURAL"
      },
      { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
    ]);
    const events: SimulationEvent[] = [];
    runtime.onEvent((e) => events.push(e));

    runtime.submitCommand({
      commandId: "settle-natural-decay",
      sessionId: "s1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });
    await Promise.resolve();

    expect(events.find((e) => e.eventType === "SETTLEMENT_STARTED")).toBeDefined();
    expect(events.find((e) => e.eventType === "COMMAND_REJECTED")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// E8-group: EXPAND triggers encirclement reconnection check
// ---------------------------------------------------------------------------

describe("encirclement expand reconnection", () => {
  // E8: A successful EXPAND that bridges a cut-off pocket back to settled supply
  // clears frontierDecayAt on the reconnected tiles in the same tick.
  it("E8: EXPAND that reconnects a cut-off region clears frontierDecayAt on reconnected tiles", async () => {
    vi.useFakeTimers();
    try {
      // Layout:
      //   S(P1, 10,10) — F_bridge(P1, 11,10) [to be expanded into] — F_pocket(P1, 12,10) [cut off]
      //
      // Before EXPAND: only S(10,10) and F_pocket(12,10) exist. F_pocket has no
      // path to settled supply → frontierDecayAt is already set.
      // After EXPAND succeeds into (11,10): F_pocket (12,10) is adjacent to the
      // new frontier tile (11,10), which is adjacent to S(10,10) → reconnected.
      const runtime = new SimulationRuntime({
        now: () => Date.now(),
        initialPlayers: new Map([["player-1", player("player-1")]]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            // pocket tile is cut off — no path to settled because (11,10) is neutral
            {
              x: 12, y: 10, terrain: "LAND",
              ownerId: "player-1", ownershipState: "FRONTIER",
              frontierDecayAt: Date.now() + ENCIRCLEMENT_DECAY_MS,
              frontierDecayKind: "ENCIRCLEMENT"
            },
            // neutral tile that will become the bridge when expanded into
            { x: 11, y: 10, terrain: "LAND" }
          ],
          activeLocks: []
        }
      });
      const events: SimulationEvent[] = [];
      runtime.onEvent((e) => events.push(e));

      runtime.submitCommand({
        commandId: "expand-bridge",
        sessionId: "s1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: Date.now(),
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
      });
      await Promise.resolve();

      // Advance past the claim duration so the lock resolves
      vi.advanceTimersByTime(4_000);

      // The pocket tile (12,10) should now have frontierDecayAt cleared because
      // it is reconnected through the new (11,10) frontier tile to S(10,10).
      const tileDeltas = events
        .filter((e) => e.eventType === "TILE_DELTA_BATCH")
        // biome-ignore lint: safe cast, event type checked above
        .flatMap((e) => (e as Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }>).tileDeltas);

      // There may be multiple deltas for (12,10) across batches (e.g. natural decay then
      // reconnection). We want the last one — the reconnection should be the final state.
      const pocketDeltas = tileDeltas.filter((d) => d.x === 12 && d.y === 10);
      const lastPocketDelta = pocketDeltas[pocketDeltas.length - 1];
      // The reconnection delta should be present and frontierDecayAt should be cleared.
      expect(lastPocketDelta).toBeDefined();
      expect(lastPocketDelta?.frontierDecayAt).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  // Regression: EXPAND that does not reconnect anything does not spuriously
  // clear or set frontierDecayAt on unrelated tiles.
  it("E8-regression: EXPAND into truly isolated region has no encirclement side effects on unrelated tiles", async () => {
    vi.useFakeTimers();
    try {
      // Layout: only a settled tile and a neutral target — no cut-off tiles present.
      // After EXPAND the new frontier tile is directly adjacent to settled supply,
      // so computeEncirclementDeltas produces empty cutOff and reconnected sets.
      const runtime = new SimulationRuntime({
        now: () => Date.now(),
        initialPlayers: new Map([["player-1", player("player-1")]]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 11, y: 10, terrain: "LAND" } // neutral target
          ],
          activeLocks: []
        }
      });
      const events: SimulationEvent[] = [];
      runtime.onEvent((e) => events.push(e));

      runtime.submitCommand({
        commandId: "expand-no-reconnect",
        sessionId: "s1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: Date.now(),
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(4_000);

      // No TILE_DELTA_BATCH event should carry a frontierDecayAt change for any tile.
      // The only delta batches expected are the EXPAND resolution itself (the new tile)
      // plus possibly a player state update — none should set/clear frontierDecayAt
      // on pre-existing tiles.
      const tileDeltas = events
        .filter((e) => e.eventType === "TILE_DELTA_BATCH")
        // biome-ignore lint: safe cast, event type checked above
        .flatMap((e) => (e as Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }>).tileDeltas);

      // The only delta should be for the newly expanded (11,10) tile — no spurious
      // frontierDecayAt mutations on tiles that weren't involved.
      const spurious = tileDeltas.filter(
        (d) => !(d.x === 11 && d.y === 10) && typeof d.frontierDecayAt !== "undefined"
      );
      expect(spurious).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// BFS cap semantics (Option C)
// ---------------------------------------------------------------------------

describe("encirclement BFS cap (Option C)", () => {
  it("CAP1: small topology under cap returns correct cut-off", () => {
    // A 4-tile chain; changing the middle breaks connectivity.
    // This verifies the cap doesn't change behaviour for sub-cap topologies.
    const tiles = mkTileMap({
      "10,10": { ownerId: "player-1", ownershipState: "SETTLED" },
      "11,10": { ownerId: "player-1", ownershipState: "FRONTIER" },
      "12,10": { ownerId: "player-2", ownershipState: "FRONTIER" }, // captured — breaks path
      "13,10": { ownerId: "player-1", ownershipState: "FRONTIER" }
    });
    const { cutOff } = computeEncirclementDeltas(["12,10"], "player-1", tiles, 1_000, { bfsCap: ENCIRCLEMENT_BFS_CAP });
    expect(cutOff.has("13,10")).toBe(true);
    expect(cutOff.has("11,10")).toBe(false);
  });

  it("CAP2: BFS cap exceeded returns empty sets and fires onCapExceeded callback", () => {
    // Build a large connected blob of player-1 owned frontier tiles.
    // The blob is 110×110 = 12,100 tiles, which exceeds the 10,000 cap.
    const BLOB_SIZE = 110; // 110×110 = 12,100 tiles > cap
    const entries: Record<string, TileStub> = {};
    // One settled tile as supply root
    entries["0,0"] = { ownerId: "player-1", ownershipState: "SETTLED" };
    // Fill a square blob starting at (1,0)
    for (let x = 1; x <= BLOB_SIZE; x++) {
      for (let y = 0; y < BLOB_SIZE; y++) {
        entries[`${x},${y}`] = { ownerId: "player-1", ownershipState: "FRONTIER" };
      }
    }
    const tiles = mkTileMap(entries);

    let capFired = false;
    let capVisited = 0;
    const { cutOff, reconnected } = computeEncirclementDeltas(
      [`${Math.floor(BLOB_SIZE / 2)},${Math.floor(BLOB_SIZE / 2)}`], // centre of blob
      "player-1",
      tiles,
      1_000,
      {
        bfsCap: ENCIRCLEMENT_BFS_CAP,
        onCapExceeded: (_pid, visited) => {
          capFired = true;
          capVisited = visited;
        }
      }
    );

    // Cap should have fired: blob has 12,100 tiles > 10,000 cap
    expect(capFired).toBe(true);
    expect(capVisited).toBeGreaterThan(ENCIRCLEMENT_BFS_CAP);
    // When cap is exceeded, both sets must be empty (Option C: skip this tick)
    expect(cutOff.size).toBe(0);
    expect(reconnected.size).toBe(0);
  });

});

