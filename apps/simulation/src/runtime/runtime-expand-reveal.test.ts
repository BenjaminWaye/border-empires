import { describe, expect, it, vi } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer } from "./runtime.test-helpers.js";

// Regression for the SIMULATION_UNAVAILABLE incident: buildCaptureRevealTileDeltas
// scans (2*visionRadius+1)² tiles on every human capture. For EXPAND the target
// tile is always adjacent to territory the player already had vision over, so
// that scan finds nothing new — it only re-sends already-revealed tiles, and
// with observatory/tech vision-radius bonuses can hit 400+ tiles per single-tile
// EXPAND, blocking the sim event loop long enough to blow the gateway's 2500ms
// submit timeout during rapid expand chains. EXPAND must stay a single-tile
// delta; only ATTACK keeps the full reveal (see runtime-lock-resolution.ts and
// the sibling "emits only the captured tile delta for barbarian captures"
// coverage in runtime.test.ts).
describe("simulation runtime — EXPAND capture reveal", () => {
  it("emits only the captured tile delta for a human EXPAND (no vision-radius reveal scan)", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-2", buildPlayer("player-2", { manpower: Number.MAX_SAFE_INTEGER, mods: { attack: 1_000, defense: 1, income: 1, vision: 1 } })]
        ]),
        initialState: {
          // Dense neutral neighbourhood around the target so a regressed
          // (reveal-square) path would balloon to ~VISION_RADIUS² deltas —
          // this is what makes the assertion able to tell the two paths apart.
          tiles: (() => {
            const t: Array<{ x: number; y: number; terrain: "LAND"; ownerId?: string; ownershipState?: "SETTLED" | "FRONTIER" }> = [];
            for (let x = 6; x <= 14; x += 1) {
              for (let y = 7; y <= 15; y += 1) t.push({ x, y, terrain: "LAND" });
            }
            const at = (x: number, y: number) => t.find((tile) => tile.x === x && tile.y === y)!;
            Object.assign(at(10, 10), { ownerId: "player-2", ownershipState: "SETTLED" });
            return t;
          })(),
          activeLocks: []
        }
      });
      const expandBatches: Array<Array<{ x: number; y: number; ownerId?: string }>> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "TILE_DELTA_BATCH" && event.commandId === "human-expand-1") {
          expandBatches.push(event.tileDeltas);
        }
      });

      runtime.submitCommand({
        commandId: "human-expand-1",
        sessionId: "player-2",
        playerId: "player-2",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      expect(expandBatches.length).toBeGreaterThanOrEqual(1);
      // Resolution batch must contain only the captured tile — NOT the ~81-tile
      // vision-radius reveal square the pre-fix human capture-reveal path emitted.
      // The 81-tile neighbourhood above is fully populated, so a regression would
      // blow the batch well past this bound.
      expect(expandBatches[0]).toEqual([
        expect.objectContaining({ x: 10, y: 11, ownerId: "player-2", ownershipState: "FRONTIER" })
      ]);
      // No distant neutral reveal tile (only the reveal square would surface one).
      expect(expandBatches[0].some((d) => d.x === 6 && d.y === 7)).toBe(false);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
