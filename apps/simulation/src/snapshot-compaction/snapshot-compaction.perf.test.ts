import { describe, expect, it } from "vitest";

import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";
import { buildWorldgenBaselineIndex, compactSnapshotForStorage } from "./snapshot-compaction.js";

type RecoveredTile = RecoveredSimulationState["tiles"][number];

const WORLD_WIDTH = 450;
const WORLD_HEIGHT = 450;

// Regression test for the checkpoint-path event-loop-block risk: prior to this
// fix, `compactSnapshotForStorage` ran its two O(world-tile-count) loops fully
// synchronously with no yield, unlike every other step in the checkpoint
// pipeline (buildRuntimeSnapshotSectionsAsync, the stringifier, the event
// prune loop). Measured at ~100-130ms of unyielded main-thread work on a
// realistic 450x450 (202,500-tile) late-game world — see the H2 measurement
// in the PR description. This test asserts the injected yield callback fires
// at realistic world scale, which fails (0 calls) before the fix and passes
// after it.
const buildRealisticWorld = (): {
  baselineTiles: RecoveredTile[];
  runtimeTiles: RecoveredTile[];
} => {
  const baselineTiles: RecoveredTile[] = [];
  const runtimeTiles: RecoveredTile[] = [];
  let i = 0;
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const terrain = (x + y) % 5 === 0 ? "MOUNTAIN" : "LAND";
      baselineTiles.push({ x, y, terrain });
      // ~14% of tiles diverge from baseline (owned/settled), matching the
      // benchmark's realistic mid-game scenario.
      if (i % 7 === 0) {
        runtimeTiles.push({
          x,
          y,
          terrain,
          ownerId: `player-${i % 50}`,
          ownershipState: "OWNED"
        });
      } else {
        runtimeTiles.push({ x, y, terrain });
      }
      i += 1;
    }
  }
  return { baselineTiles, runtimeTiles };
};

describe("compactSnapshotForStorage — event-loop yielding at realistic scale", () => {
  it("yields to the event loop while compacting a full 202,500-tile world", async () => {
    const { baselineTiles, runtimeTiles } = buildRealisticWorld();
    const baselineIndex = buildWorldgenBaselineIndex(baselineTiles);

    let yieldCount = 0;
    const trackingYield = async (): Promise<void> => {
      yieldCount += 1;
    };

    const result = await compactSnapshotForStorage(
      { initialState: { tiles: runtimeTiles, activeLocks: [] }, commandEvents: [] },
      baselineIndex,
      trackingYield
    );

    expect(result.tileOverlay.length).toBeGreaterThan(0);
    // 202,500 tiles / 50,000-tile yield chunk size ⇒ 4 yields. Upper bound
    // guards against a future regression back toward the small chunk size
    // that let each yield queue behind AI-tick backlog (see YIELD_CHUNK_SIZE's
    // comment); lower bound guards against removing yielding entirely, which
    // would reintroduce the original unyielded ~100-130ms synchronous block.
    expect(yieldCount).toBeGreaterThanOrEqual(2);
    expect(yieldCount).toBeLessThanOrEqual(10);
  });

  it("keeps each unyielded slice well under the watchdog's stall threshold", async () => {
    const { baselineTiles, runtimeTiles } = buildRealisticWorld();
    const baselineIndex = buildWorldgenBaselineIndex(baselineTiles);

    let lastResumedAt = Date.now();
    const sliceDurationsMs: number[] = [];
    const timingYield = (): Promise<void> =>
      new Promise((resolve) => {
        sliceDurationsMs.push(Date.now() - lastResumedAt);
        setImmediate(() => {
          lastResumedAt = Date.now();
          resolve();
        });
      });

    const t0 = Date.now();
    await compactSnapshotForStorage(
      { initialState: { tiles: runtimeTiles, activeLocks: [] }, commandEvents: [] },
      baselineIndex,
      timingYield
    );
    sliceDurationsMs.push(Date.now() - lastResumedAt);

    // Each individual synchronous slice must stay far below anything already
    // tolerated on the sim thread (AI ticks alone run up to ~1s
    // synchronously — see sim_tick_duration_ms p99) so this checkpoint step
    // can never itself become the thing that stalls other work.
    for (const duration of sliceDurationsMs) expect(duration).toBeLessThan(500);
    // And the whole compaction still completes quickly overall.
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
