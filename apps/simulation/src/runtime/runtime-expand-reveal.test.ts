import { describe, expect, it, vi } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer } from "./runtime.test-helpers.js";
import { stampVisibilityAndMergeFogDeltas } from "../tile-delta-visibility-stamp.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

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

  // Regression for the "fog stopped clearing on EXPAND" incident (deployed
  // right after the single-tile-delta fix above): EXPAND's own event only
  // carries the captured tile, but the vision-transition accumulator still
  // tracks the leading-edge fringe of newly-visible fog around it (see
  // runtime-vision-transition.ts). The gateway fanout (simulation-service.ts)
  // is responsible for merging that fringe back in via
  // stampVisibilityAndMergeFogDeltas -- this test exercises that full
  // pipeline end-to-end (runtime event -> takeVisionTransitions ->
  // filterTileDeltasForPlayer -> stampVisibilityAndMergeFogDeltas) the same
  // way simulation-service.ts's TILE_DELTA_BATCH fanout does, so a
  // regression to "only ever send the batch's own tileDeltas" is caught here
  // instead of only in production.
  it("the fanout pipeline reveals the newly-visible fringe tile beyond the single captured-tile delta", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-2", buildPlayer("player-2", { manpower: Number.MAX_SAFE_INTEGER, mods: { attack: 1_000, defense: 1, income: 1, vision: 1 } })]
        ]),
        initialState: {
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
      let lastBatch: readonly { x: number; y: number }[] | undefined;
      runtime.onEvent((event) => {
        if (event.eventType === "TILE_DELTA_BATCH" && event.commandId === "human-expand-2") {
          lastBatch = event.tileDeltas;
        }
      });

      runtime.submitCommand({
        commandId: "human-expand-2",
        sessionId: "player-2",
        playerId: "player-2",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      expect(lastBatch).toBeDefined();
      // Reproduce the same fanout pipeline simulation-service.ts runs per
      // subscriber for a TILE_DELTA_BATCH event.
      const visionTransitions = runtime.takeVisionTransitions();
      const filtered = stampVisibilityAndMergeFogDeltas(runtime.filterTileDeltasForPlayer(lastBatch!, "player-2"), {
        leftVisionTileKeys: visionTransitions.left.get("player-2"),
        enteredVisionTileKeys: visionTransitions.entered.get("player-2"),
        wireDeltaForTileKey: (tileKey) => runtime.wireDeltaForTileKey(tileKey),
        tileKeyFor: simulationTileKey
      });

      // Must contain the captured tile itself...
      expect(filtered.some((d) => d.x === 10 && d.y === 11)).toBe(true);
      // ...and the fringe tile beyond it that only just entered vision
      // because the player's footprint moved outward with the capture --
      // this is the fog that silently never cleared once EXPAND stopped
      // building the full reveal square. Owning only (10,10) covers y 6-14
      // at the base vision radius (4, mods.vision: 1); owning (10,11) too
      // extends coverage to y 7-15, so (10,15) is the one genuinely new cell.
      expect(filtered.some((d) => d.x === 10 && d.y === 15)).toBe(true);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
