import { describe, expect, it } from "vitest";

import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";
import { buildWorldgenBaselineIndex, compactSnapshotForStorage, type TileOverlayMemo } from "./snapshot-compaction.js";

type RecoveredTile = RecoveredSimulationState["tiles"][number];

const WORLD_WIDTH = 450;
const WORLD_HEIGHT = 450;

// Regression test for the checkpoint-path event-loop-block risk. History:
// compactSnapshotForStorage originally ran synchronously with no yield; a
// fix added yielding every 2,000 tiles to match every other checkpoint step.
// That backfired in production — staging measured checkpoints stretching to
// 17-22s because each setImmediate yield re-queues behind the AI planner's
// own tick scheduling on the same thread, an UNBOUNDED wait that grows with
// however much AI-tick backlog happens to be queued. Reducing yield count
// (larger chunks) still measured 16.7s once backlog built up over sustained
// uptime. The fix that actually holds: don't yield at all — a synchronous
// pass can't be preempted by AI ticks, so its cost is bounded (~100-130ms on
// a realistic 450x450/202,500-tile world) regardless of contention. This
// test asserts NO yields occur and the whole pass completes well under the
// 30s watchdog stall threshold at realistic scale.
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

describe("compactSnapshotForStorage — realistic-scale timing", () => {
  it("never yields at realistic world scale, and completes well under the watchdog stall threshold", async () => {
    const { baselineTiles, runtimeTiles } = buildRealisticWorld();
    const baselineIndex = buildWorldgenBaselineIndex(baselineTiles);

    let yieldCount = 0;
    const trackingYield = async (): Promise<void> => {
      yieldCount += 1;
    };

    const t0 = Date.now();
    const result = await compactSnapshotForStorage(
      { initialState: { tiles: runtimeTiles, activeLocks: [] }, commandEvents: [] },
      baselineIndex,
      trackingYield
    );
    const elapsedMs = Date.now() - t0;

    expect(result.tileOverlay.length).toBeGreaterThan(0);
    // Zero yields is the whole point: nothing here can queue behind AI-tick
    // backlog if it never yields to begin with.
    expect(yieldCount).toBe(0);
    // The one synchronous slice must stay far below anything already
    // tolerated on the sim thread (AI ticks alone run up to ~1s
    // synchronously — see sim_tick_duration_ms p99) and nowhere near the
    // 30s watchdog stall threshold.
    expect(elapsedMs).toBeLessThan(1000);
  });

  it("reuses the exact memoised overlay object for unmutated tiles on a repeat checkpoint", async () => {
    // Mirrors the runtime's steady state: most tiles between two checkpoints
    // are untouched (same object reference), only a handful mutated. Object
    // identity is what makes the memo a correct, not approximate, cache key
    // — see TileOverlayMemo's doc comment in snapshot-compaction.ts.
    //
    // Deliberately NOT a wall-clock timing assertion: this repo's own perf
    // gates are documented to flake on a loaded box (see
    // snapshot-compaction.perf.test.ts's sibling test above, which asserts
    // yield count / an absolute ceiling rather than a relative speedup).
    // Asserting object-reference reuse proves the cache actually fired
    // without any timing sensitivity.
    const { baselineTiles, runtimeTiles } = buildRealisticWorld();
    const baselineIndex = buildWorldgenBaselineIndex(baselineTiles);
    const memo: TileOverlayMemo = new WeakMap();

    const first = await compactSnapshotForStorage(
      { initialState: { tiles: runtimeTiles, activeLocks: [] }, commandEvents: [] },
      baselineIndex,
      undefined,
      memo
    );

    // Mutate a small handful of tiles to new objects (as replaceTileState
    // would); everything else keeps its object reference from `runtimeTiles`.
    const mutatedIndexes = new Set([0, 5000, 10000]);
    const mutatedTiles = runtimeTiles.map((tile, i) =>
      mutatedIndexes.has(i) ? { ...tile, ownerId: `player-mutated-${i}`, ownershipState: "OWNED" as const } : tile
    );

    const second = await compactSnapshotForStorage(
      { initialState: { tiles: mutatedTiles, activeLocks: [] }, commandEvents: [] },
      baselineIndex,
      undefined,
      memo
    );

    expect(first.tileOverlay.length).toBeGreaterThan(0);
    // An owned tile that did NOT mutate: its overlay entry must be the exact
    // same object both times (proves the memo returned the cached diff
    // rather than recomputing an equal-but-new object).
    const unmutatedOwnedIndex = 7; // i % 7 === 0 in buildRealisticWorld, not in mutatedIndexes
    const unmutatedTile = runtimeTiles[unmutatedOwnedIndex]!;
    const firstEntry = first.tileOverlay.find((t) => t.x === unmutatedTile.x && t.y === unmutatedTile.y);
    const secondEntry = second.tileOverlay.find((t) => t.x === unmutatedTile.x && t.y === unmutatedTile.y);
    expect(firstEntry).toBeDefined();
    expect(secondEntry).toBe(firstEntry);

    // A tile that DID mutate must reflect the new value, not a stale cache hit.
    const mutatedTile = mutatedTiles[0]!;
    const mutatedEntry = second.tileOverlay.find((t) => t.x === mutatedTile.x && t.y === mutatedTile.y);
    expect(mutatedEntry).toMatchObject({ ownerId: "player-mutated-0" });
  });
});
