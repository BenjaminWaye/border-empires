import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { SimulationRuntime } from "../runtime/runtime.js";
import { ADVANCE_EMPTY_COOLDOWN_MS } from "./muster-auto-fire-shared.js";

const makePlayer = (id: string) => ({
  id,
  isAi: false,
  points: 10_000,
  manpower: 150,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const tileMuster = (runtime: SimulationRuntime, x: number, y: number) => {
  const tile = runtime.exportState().tiles.find((entry) => entry.x === x && entry.y === y);
  return tile?.musterJson ? JSON.parse(tile.musterJson) : undefined;
};

// Regression: the muster HUD/tile-menu/on-map alert only ever showed
// "Advancing"/"Holding" (and even mislabeled MARCH as "Holding") with no
// visibility into whether a flag was actually fighting or just cooling down
// between auto-fire searches. syncMusterStatus (muster-auto-fire-shared.ts)
// stamps inFlight/nextActionAt/fightX/fightY onto the wire muster object so
// the client can show "Fighting at (x,y)" / "Planning next move — Ns".
describe("muster auto-fire status feedback", () => {
  it("marks an ADVANCE flag in-flight with the attacked tile's coordinates once it fires", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", makePlayer("player-1")],
          ["player-2", makePlayer("player-2")]
        ]),
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              muster: { ownerId: "player-1", amount: 60, mode: "ADVANCE", updatedAt: 1_000 }
            },
            { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
          ],
          activeLocks: []
        }
      });

      runtime.tickMuster(1_000);
      await Promise.resolve();

      const muster = tileMuster(runtime, 10, 10);
      expect(muster.inFlight).toBe(true);
      expect(muster.fightX).toBe(10);
      expect(muster.fightY).toBe(11);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("sets nextActionAt on an ADVANCE flag with nothing attackable, and clears inFlight", async () => {
    let nowMs = 1_000;
    // seedTiles: new Map() disables worldgen fill (which otherwise seeds
    // barbarian-owned, attackable neighbors) so this tile is truly isolated
    // — same technique as the "ADVANCE flag on an owned dock" test above.
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            muster: { ownerId: "player-1", amount: 60, mode: "ADVANCE", updatedAt: 1_000 }
          }
        ],
        activeLocks: []
      }
    });

    runtime.tickMuster(nowMs);
    await Promise.resolve();

    const muster = tileMuster(runtime, 10, 10);
    expect(muster.inFlight).toBeFalsy();
    expect(muster.nextActionAt).toBeCloseTo(nowMs + ADVANCE_EMPTY_COOLDOWN_MS, -1);
  });

  it("marks a MARCH flag in-flight with the attacked tile's coordinates once it fires", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", makePlayer("player-1")],
          ["player-2", makePlayer("player-2")]
        ]),
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              muster: { ownerId: "player-1", amount: 60, mode: "MARCH", targetX: 10, targetY: 11, updatedAt: 1_000 }
            },
            { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
          ],
          activeLocks: []
        }
      });

      runtime.tickMuster(1_000);
      await Promise.resolve();

      const muster = tileMuster(runtime, 10, 10);
      expect(muster.mode).toBe("MARCH");
      expect(muster.inFlight).toBe(true);
      expect(muster.fightX).toBe(10);
      expect(muster.fightY).toBe(11);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
