import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { SimulationRuntime } from "../runtime/runtime.js";
import { MUSTER_BASE_RATE_PER_MIN, MUSTER_TILE_CAP } from "@border-empires/shared";

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

    // Advance 1 minute and tick.
    nowMs = 1_000 + 60_000;
    runtime.tickMuster(nowMs);

    const accumulated = musterAmount(runtime, 10, 10)!;
    expect(accumulated).toBeCloseTo(MUSTER_BASE_RATE_PER_MIN, 2);
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

  it("caps the muster amount at the player's manpower cap", async () => {
    let nowMs = 1_000;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      initialPlayers: new Map([["player-1", makePlayer("player-1", 1_000_000)]]),
      initialState: {
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }],
        activeLocks: []
      }
    });
    await setMuster(runtime, 10, 10, 1);
    // Advance a very long time so accumulation would vastly exceed the cap.
    // A single SETTLEMENT gives a manpower cap of 150 (== MUSTER_TILE_CAP for reference).
    nowMs = 1_000 + 1_000 * 60_000;
    runtime.tickMuster(nowMs);
    expect(musterAmount(runtime, 10, 10)).toBeCloseTo(MUSTER_TILE_CAP, 5);
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
});
