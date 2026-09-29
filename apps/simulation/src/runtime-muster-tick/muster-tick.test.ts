import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { SimulationRuntime } from "../runtime/runtime.js";
import {
  MUSTER_BASE_RATE_PER_MIN,
  MUSTER_DEPOT_SPEED_MULT,
  RAIL_DEPOT_BOOSTED_MUSTER_MULT
} from "@border-empires/shared";

const makePlayer = (id: string, manpower: number) => ({
  id,
  isAi: false,
  points: 10_000,
  manpower,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const musterAmount = (runtime: SimulationRuntime, x: number, y: number): number | undefined => {
  const tile = runtime.exportState().tiles.find((entry) => entry.x === x && entry.y === y);
  return tile?.musterJson ? (JSON.parse(tile.musterJson).amount as number) : undefined;
};

const musterRatePerMin = (runtime: SimulationRuntime, x: number, y: number): number | undefined => {
  const tile = runtime.exportState().tiles.find((entry) => entry.x === x && entry.y === y);
  return tile?.musterJson ? (JSON.parse(tile.musterJson).ratePerMin as number | undefined) : undefined;
};

const setMuster = async (runtime: SimulationRuntime, x: number, y: number, seq: number) => {
  runtime.submitCommand({
    commandId: `set-muster-${x}-${y}-${seq}`,
    sessionId: "session-1",
    playerId: "player-1",
    clientSeq: seq,
    issuedAt: 1_000,
    type: "SET_MUSTER",
    payloadJson: JSON.stringify({ x, y, mode: "HOLD" })
  });
  await Promise.resolve();
};

describe("muster accumulation tick", () => {
  it("accumulates manpower from the pool at the logistics throughput rate", async () => {
    let nowMs = 1_000;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      initialPlayers: new Map([["player-1", makePlayer("player-1", 10_000)]]),
      initialState: {
        // Second tile is a TOWN (cap=300) so the player's manpower cap exceeds
        // MUSTER_BASE_RATE_PER_MIN (180), making throughput the bottleneck.
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "MARKET" as const, populationTier: "TOWN" as const } }
        ],
        activeLocks: []
      }
    });
    await setMuster(runtime, 10, 10, 1);
    expect(musterAmount(runtime, 10, 10)).toBe(0);

    // Advance 30s (well under this flag's default cap -- 10% of a manpower
    // cap north of 1_000 here -- at this rate) and tick, so the flag's
    // default cap isn't the bottleneck being measured here.
    nowMs = 1_000 + 30_000;
    runtime.tickMuster(nowMs);

    const accumulated = musterAmount(runtime, 10, 10)!;
    expect(accumulated).toBeCloseTo((MUSTER_BASE_RATE_PER_MIN * 30_000) / 60_000, 2);
  });

  it("removes the accumulated manpower from the player pool", async () => {
    let nowMs = 1_000;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      initialPlayers: new Map([["player-1", makePlayer("player-1", 10_000)]]),
      initialState: {
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }],
        activeLocks: []
      }
    });
    await setMuster(runtime, 10, 10, 1);

    // Pool starts at cap (single settlement => 150), so regen adds nothing this
    // tick and the only pool change is the drain onto the muster tile.
    const before = runtime.exportPlayerDebugSnapshot().find((p) => p.id === "player-1")!.manpower;
    nowMs = 1_000 + 60_000;
    runtime.tickMuster(nowMs);
    const accumulated = musterAmount(runtime, 10, 10)!;
    const after = runtime.exportPlayerDebugSnapshot().find((p) => p.id === "player-1")!.manpower;
    expect(accumulated).toBeGreaterThan(0);
    expect(before - after).toBeCloseTo(accumulated, 5);
  });

  it("D20: a flag has no cap of its own -- it fills all the way to the player's manpower cap", async () => {
    let nowMs = 1_000;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      initialPlayers: new Map([["player-1", makePlayer("player-1", 1_000_000)]]),
      initialState: {
        // Several GREAT_CITY tiles push the player's manpower cap well above
        // the old MUSTER_FLAG_BASE_CAP_CEILING -- proving there's no longer any
        // ceiling below the pool cap now that musterFlagCap/"Expand Capacity"
        // are removed (docs/replenishment-update-plan.md D20).
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "MARKET" as const, populationTier: "GREAT_CITY" as const } },
          { x: 12, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "MARKET" as const, populationTier: "GREAT_CITY" as const } },
          { x: 13, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "MARKET" as const, populationTier: "GREAT_CITY" as const } }
        ],
        activeLocks: []
      }
    });
    await setMuster(runtime, 10, 10, 1);
    const manpowerCap = runtime.exportPlayerDebugSnapshot().find((p) => p.id === "player-1")!.manpowerCap;

    // Advance a very long time so accumulation would vastly exceed the old
    // ceiling if any cap still applied -- it should instead fill all the way
    // to the player's whole manpower pool/cap.
    nowMs = 1_000 + 1_000 * 60_000;
    runtime.tickMuster(nowMs);
    expect(musterAmount(runtime, 10, 10)).toBeCloseTo(manpowerCap, 5);
  });

  it("splits throughput across two flags so each fills at half rate", async () => {
    let nowMs = 1_000;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      initialPlayers: new Map([["player-1", makePlayer("player-1", 1_000_000)]]),
      initialState: {
        // TOWN tile (cap=300) ensures player cap exceeds total throughput (2 × 90 = 180)
        // so each flag is throughput-limited, not pool-limited.
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 12, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 14, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "MARKET" as const, populationTier: "TOWN" as const } }
        ],
        activeLocks: []
      }
    });
    await setMuster(runtime, 10, 10, 1);
    await setMuster(runtime, 12, 10, 2);

    nowMs = 1_000 + 60_000;
    runtime.tickMuster(nowMs);

    const a = musterAmount(runtime, 10, 10)!;
    const b = musterAmount(runtime, 12, 10)!;
    expect(a).toBeCloseTo(MUSTER_BASE_RATE_PER_MIN / 2, 2);
    expect(b).toBeCloseTo(MUSTER_BASE_RATE_PER_MIN / 2, 2);
  });

  it("applies the Rail Depot boost when the nearest outpost isn't the depot-backed one", async () => {
    // Muster tile at (200,200). Outpost A at distance 1 is the *nearest* outpost
    // to the muster tile but is NOT within RAIL_DEPOT_MUSTER_RADIUS of the depot.
    // Outpost B at distance 5 is farther from the muster tile (still within
    // OUTPOST_DEPOT_RADIUS) but IS within RAIL_DEPOT_MUSTER_RADIUS of the depot.
    // The tile should get the depot-boosted rate because *some* nearby outpost
    // is depot-backed, not just because the closest one is.
    let nowMs = 1_000;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      initialPlayers: new Map([["player-1", makePlayer("player-1", 1_000_000)]]),
      initialState: {
        tiles: [
          { x: 200, y: 200, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 201, y: 200, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", siegeOutpost: { ownerId: "player-1", status: "active" } },
          { x: 205, y: 200, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", siegeOutpost: { ownerId: "player-1", status: "active" } },
          { x: 255, y: 200, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructure: { type: "RAIL_DEPOT", status: "active", ownerId: "player-1" } },
          // §5.4: 2 SIEGE_OUTPOSTs need 2 UMBRITE slots; RAIL_DEPOT needs
          // 1 FOOD + 1 CRYSTAL slot — none of them dormant.
          { x: 210, y: 210, terrain: "LAND", resource: "UMBRITE", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 211, y: 210, terrain: "LAND", resource: "UMBRITE", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 212, y: 210, terrain: "LAND", resource: "FARM", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 213, y: 210, terrain: "LAND", resource: "GEMS", ownerId: "player-1", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });
    await setMuster(runtime, 200, 200, 1);

    // Advance 10s so the inflow stays well under the per-flag cap at either
    // multiplier, letting the test distinguish 1.25x from 2.0x.
    nowMs = 1_000 + 10_000;
    runtime.tickMuster(nowMs);

    const accumulated = musterAmount(runtime, 200, 200)!;
    const boostedExpected = (MUSTER_BASE_RATE_PER_MIN * RAIL_DEPOT_BOOSTED_MUSTER_MULT * 10_000) / 60_000;
    const unboostedExpected = (MUSTER_BASE_RATE_PER_MIN * MUSTER_DEPOT_SPEED_MULT * 10_000) / 60_000;
    expect(accumulated).toBeCloseTo(boostedExpected, 2);
    expect(accumulated).not.toBeCloseTo(unboostedExpected, 2);
  });

  it("stashes ratePerMin on each HOLD flag matching its actual accrual rate, across 4 flags", async () => {
    let nowMs = 1_000;
    // MUSTER_MAX_TILES defaults to 2 (playerMusterFlagLimit), which would
    // reject a 3rd/4th SET_MUSTER command through the normal command path.
    // Seed all 4 flags directly via initialState instead (boot/hydration
    // populates musterTilesByOwner from any tile.muster present, same as a
    // real snapshot load) so this test can exercise activeMusterCount === 4
    // without needing a real flag-limit-raising tech/wonder in the fixture.
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      initialPlayers: new Map([["player-1", makePlayer("player-1", 1_000_000)]]),
      initialState: {
        // A TOWN tile keeps the player's manpower cap comfortably above the
        // total throughput (4 flags splitting MUSTER_BASE_RATE_PER_MIN), so
        // every flag is throughput-limited, not pool- or cap-limited.
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", muster: { ownerId: "player-1", amount: 0, mode: "HOLD", setAt: 1_000, updatedAt: 1_000 } },
          { x: 12, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", muster: { ownerId: "player-1", amount: 0, mode: "HOLD", setAt: 1_000, updatedAt: 1_000 } },
          { x: 14, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", muster: { ownerId: "player-1", amount: 0, mode: "HOLD", setAt: 1_000, updatedAt: 1_000 } },
          { x: 16, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", muster: { ownerId: "player-1", amount: 0, mode: "HOLD", setAt: 1_000, updatedAt: 1_000 } },
          { x: 18, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "MARKET" as const, populationTier: "TOWN" as const } }
        ],
        activeLocks: []
      }
    });

    const elapsedMs = 20_000;
    nowMs = 1_000 + elapsedMs;
    runtime.tickMuster(nowMs);

    const expectedRatePerMin = MUSTER_BASE_RATE_PER_MIN / 4;
    for (const [x, y] of [
      [10, 10],
      [12, 10],
      [14, 10],
      [16, 10]
    ] as const) {
      const rate = musterRatePerMin(runtime, x, y);
      const amount = musterAmount(runtime, x, y)!;
      expect(rate).toBeCloseTo(expectedRatePerMin, 3);
      // The emitted rate must actually reproduce the accrued amount over the
      // elapsed window — that's the guarantee the client's interpolation
      // depends on.
      expect(amount).toBeCloseTo((rate! * elapsedMs) / 60_000, 2);
    }
  });

  it("stamps a correct ratePerMin on a brand-new flag immediately, before any periodic tickMuster sweep has run", async () => {
    const nowMs = 1_000;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      initialPlayers: new Map([["player-1", makePlayer("player-1", 1_000_000)]]),
      initialState: { tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }], activeLocks: [] }
    });

    await setMuster(runtime, 10, 10, 1);

    // No runtime.tickMuster(...) call anywhere above -- the flag's own
    // SET_MUSTER response must already carry a real rate (cold-start fix),
    // not wait for the next 30s periodic sweep.
    expect(musterAmount(runtime, 10, 10)).toBe(0);
    expect(musterRatePerMin(runtime, 10, 10)).toBeCloseTo(MUSTER_BASE_RATE_PER_MIN, 3);
  });

  it("refreshes an existing flag's ratePerMin immediately when a sibling flag is planted, without waiting for the next sweep", async () => {
    const nowMs = 1_000;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      initialPlayers: new Map([["player-1", makePlayer("player-1", 1_000_000)]]),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 12, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    await setMuster(runtime, 10, 10, 1);
    expect(musterRatePerMin(runtime, 10, 10)).toBeCloseTo(MUSTER_BASE_RATE_PER_MIN, 3);

    await setMuster(runtime, 12, 10, 2);

    // Planting the second flag halves the throughput split -- the first
    // flag's rate must reflect that split immediately (same command), not
    // drift stale until the next periodic sweep up to 30s later.
    expect(musterRatePerMin(runtime, 10, 10)).toBeCloseTo(MUSTER_BASE_RATE_PER_MIN / 2, 3);
    expect(musterRatePerMin(runtime, 12, 10)).toBeCloseTo(MUSTER_BASE_RATE_PER_MIN / 2, 3);
    // Neither flag should have accrued any manpower yet -- only the rate
    // changed, at zero elapsed time.
    expect(musterAmount(runtime, 10, 10)).toBe(0);
    expect(musterAmount(runtime, 12, 10)).toBe(0);
  });
});
