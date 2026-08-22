import { describe, expect, it, vi } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer } from "./runtime.test-helpers.js";

// Both tests share the same shape — a town at (0,0) (reach radius
// TOWN_REACH_RADIUS = 3), player-1's FRONTIER tile at (1,0) about to be
// settled, and one unowned interior tile at (2,0) — and differ only in
// where the pocket's far wall sits. The wall itself (not just the
// interior) must be inside reach for the pocket to seal at all: a wall
// outside reach doesn't count as sealed, so the whole scan fails, exactly
// like leaking to an enemy tile. This is deliberately stricter than
// "claim whatever's in reach" — a stale wall built long ago, or a
// coastline not yet fully explored/reached, shouldn't seal a pocket just
// because reach happens to cover *part* of it.
describe("simulation runtime — auto-fill reach gating", () => {
  it("does not auto-fill even the in-reach part of a pocket when its wall sits outside reach", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 500, manpower: 10_000 })]]),
        initialState: {
          tiles: [
            {
              x: 0,
              y: 0,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" }
            },
            { x: 1, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 2, y: 0, terrain: "LAND" },
            { x: 3, y: 0, terrain: "LAND" },
            // The far wall, at distance 4 — outside TOWN_REACH_RADIUS (3).
            { x: 4, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "settle-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
        type: "SETTLE", payloadJson: JSON.stringify({ x: 1, y: 0 })
      });
      await Promise.resolve();
      // Rush-complete the settlement immediately so auto-fill runs without
      // needing to model the settlement-duration timer.
      runtime.submitCommand({
        commandId: "rush-1", sessionId: "session-1", playerId: "player-1", clientSeq: 2, issuedAt: 1_000,
        type: "RUSH_BUY", payloadJson: JSON.stringify({ x: 1, y: 0 })
      });
      await Promise.resolve();

      const tiles = runtime.exportState().tiles;
      const at = (x: number, y: number) => tiles.find((t) => t.x === x && t.y === y);

      expect(at(1, 0)).toEqual(expect.objectContaining({ ownerId: "player-1", ownershipState: "SETTLED" }));
      // (2,0) and (3,0) are themselves well within reach (distance 2 and 3),
      // but the pocket never seals — its far wall at (4,0) is out of reach —
      // so neither auto-fills.
      expect(at(2, 0)?.ownerId).toBeFalsy();
      expect(at(3, 0)?.ownerId).toBeFalsy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("auto-fills the pocket once its wall is also inside reach", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 500, manpower: 10_000 })]]),
        initialState: {
          tiles: [
            {
              x: 0,
              y: 0,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" }
            },
            { x: 1, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 2, y: 0, terrain: "LAND" },
            // The wall, at distance 3 — the edge of TOWN_REACH_RADIUS, still in reach.
            { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "settle-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
        type: "SETTLE", payloadJson: JSON.stringify({ x: 1, y: 0 })
      });
      await Promise.resolve();
      runtime.submitCommand({
        commandId: "rush-1", sessionId: "session-1", playerId: "player-1", clientSeq: 2, issuedAt: 1_000,
        type: "RUSH_BUY", payloadJson: JSON.stringify({ x: 1, y: 0 })
      });
      await Promise.resolve();

      const tiles = runtime.exportState().tiles;
      const at = (x: number, y: number) => tiles.find((t) => t.x === x && t.y === y);

      expect(at(1, 0)).toEqual(expect.objectContaining({ ownerId: "player-1", ownershipState: "SETTLED" }));
      expect(at(2, 0)).toEqual(expect.objectContaining({ ownerId: "player-1", ownershipState: "SETTLED" }));
    } finally {
      vi.useRealTimers();
    }
  });
});
