/**
 * Regression tests for PlannerTileKeysCache incremental maintenance.
 *
 * Invariant: after every mutation sequence, the cache entry must be set-equal
 * to the source-of-truth PlayerRuntimeSummary fields.  Order is intentionally
 * NOT asserted — downstream consumers iterate or convert to Set; they never
 * rely on insertion order.
 *
 * The test harness mirrors exactly what runtime.ts does:
 *   - applyTileToPlayerSummary / removeTileFromPlayerSummary update summary Sets
 *   - incrementalAdd / incrementalRemove mirror those updates into the cache
 *   - refreshPlannerCandidateIndexesAroundTileChange mirrors hot/strategic/build
 *   - addPendingSettlement / removePendingSettlement mirror pendingSettlement
 *
 * After each step, verifyCacheEntryMatchesSummary checks that the cache is
 * identical (set-equality) to the summary.  Any mismatch fails the test.
 */
import { describe, expect, it } from "vitest";
import { createEmptyPlayerRuntimeSummary } from "./player-runtime-summary.js";
import {
  incrementalAdd,
  incrementalRemove,
  initCacheEntryFromSummary,
  resetFromIterable,
  verifyCacheEntryMatchesSummary,
  type PlannerTileKeysCacheEntry
} from "./planner-tile-keys-cache.js";
import type { PlayerRuntimeSummary, PendingSettlementRecord } from "./player-runtime-summary.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCache(): Map<string, PlannerTileKeysCacheEntry> {
  return new Map();
}

/** Apply "claim tile" mutation: add to territory; if FRONTIER, add to frontier. */
function applyClaimToSummaryAndCache(
  summary: PlayerRuntimeSummary,
  cache: Map<string, PlannerTileKeysCacheEntry>,
  playerId: string,
  tileKey: string,
  ownershipState: "FRONTIER" | "SETTLED"
): void {
  summary.territoryTileKeys.add(tileKey);
  if (ownershipState === "FRONTIER") summary.frontierTileKeys.add(tileKey);

  const entry = cache.get(playerId);
  if (entry) {
    incrementalAdd(entry.territory, tileKey);
    if (ownershipState === "FRONTIER") incrementalAdd(entry.frontier, tileKey);
  }
}

/** Apply "lose tile" mutation: remove from territory and frontier. */
function applyLoseToSummaryAndCache(
  summary: PlayerRuntimeSummary,
  cache: Map<string, PlannerTileKeysCacheEntry>,
  playerId: string,
  tileKey: string
): void {
  summary.territoryTileKeys.delete(tileKey);
  summary.frontierTileKeys.delete(tileKey);

  const entry = cache.get(playerId);
  if (entry) {
    incrementalRemove(entry.territory, tileKey);
    incrementalRemove(entry.frontier, tileKey);
  }
}

/** Apply "settle tile" mutation: remove from frontier (stay in territory). */
function applySettleToSummaryAndCache(
  summary: PlayerRuntimeSummary,
  cache: Map<string, PlannerTileKeysCacheEntry>,
  playerId: string,
  tileKey: string
): void {
  // In the real runtime: removeTile then applyTile with SETTLED state.
  // Net effect: removed from frontier, stays in territory.
  summary.frontierTileKeys.delete(tileKey);

  const entry = cache.get(playerId);
  if (entry) {
    incrementalRemove(entry.frontier, tileKey);
    // territory: no change (stays in territory as SETTLED)
  }
}

/** Mirror hot/strategic/build candidate changes for a set of affected keys. */
function applyNeighborCandidateUpdateToSummaryAndCache(
  summary: PlayerRuntimeSummary,
  cache: Map<string, PlannerTileKeysCacheEntry>,
  playerId: string,
  affectedKeys: string[],
  hotKeys: Set<string>,
  strategicKeys: Set<string>,
  buildKeys: Set<string>
): void {
  // Update summary Sets.
  for (const k of affectedKeys) {
    summary.hotFrontierTileKeys.delete(k);
    summary.strategicFrontierTileKeys.delete(k);
    summary.buildCandidateTileKeys.delete(k);
    if (hotKeys.has(k)) summary.hotFrontierTileKeys.add(k);
    if (strategicKeys.has(k)) summary.strategicFrontierTileKeys.add(k);
    if (buildKeys.has(k)) summary.buildCandidateTileKeys.add(k);
  }

  // Mirror into cache.
  const entry = cache.get(playerId);
  if (!entry) return;
  for (const k of affectedKeys) {
    if (summary.hotFrontierTileKeys.has(k)) incrementalAdd(entry.hotFrontier, k);
    else incrementalRemove(entry.hotFrontier, k);
    if (summary.strategicFrontierTileKeys.has(k)) incrementalAdd(entry.strategicFrontier, k);
    else incrementalRemove(entry.strategicFrontier, k);
    if (summary.buildCandidateTileKeys.has(k)) incrementalAdd(entry.buildCandidate, k);
    else incrementalRemove(entry.buildCandidate, k);
  }
}

function applyAddPendingSettlement(
  summary: PlayerRuntimeSummary,
  cache: Map<string, PlannerTileKeysCacheEntry>,
  playerId: string,
  tileKey: string
): void {
  const record: PendingSettlementRecord = {
    ownerId: playerId,
    tileKey,
    startedAt: 0,
    resolvesAt: 60_000,
    goldCost: 50
  };
  summary.pendingSettlementsByTile.set(tileKey, record);
  const entry = cache.get(playerId);
  if (entry) incrementalAdd(entry.pendingSettlement, tileKey);
}

function applyRemovePendingSettlement(
  summary: PlayerRuntimeSummary,
  cache: Map<string, PlannerTileKeysCacheEntry>,
  playerId: string,
  tileKey: string
): void {
  summary.pendingSettlementsByTile.delete(tileKey);
  const entry = cache.get(playerId);
  if (entry) incrementalRemove(entry.pendingSettlement, tileKey);
}

function assertCacheMatchesSummary(
  cache: Map<string, PlannerTileKeysCacheEntry>,
  playerId: string,
  summary: PlayerRuntimeSummary,
  label: string
): void {
  const entry = cache.get(playerId);
  expect(entry, `${label}: cache entry must exist`).toBeDefined();
  const mismatch = verifyCacheEntryMatchesSummary(entry!, summary);
  if (mismatch) {
    throw new Error(
      `${label}: cache mismatch in field "${mismatch.field}" — ` +
        `onlyInCache=${JSON.stringify(mismatch.onlyInCache)} ` +
        `onlyInSummary=${JSON.stringify(mismatch.onlyInSummary)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PlannerTileKeysCache incremental maintenance", () => {
  it("initCacheEntryFromSummary matches an empty summary", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    const cache = makeCache();
    initCacheEntryFromSummary(cache, "p1", summary);
    assertCacheMatchesSummary(cache, "p1", summary, "empty init");
  });

  it("initCacheEntryFromSummary matches a pre-populated summary", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    summary.territoryTileKeys.add("1,1");
    summary.territoryTileKeys.add("2,1");
    summary.frontierTileKeys.add("2,1");
    summary.hotFrontierTileKeys.add("2,1");
    summary.buildCandidateTileKeys.add("1,1");

    const cache = makeCache();
    initCacheEntryFromSummary(cache, "p1", summary);
    assertCacheMatchesSummary(cache, "p1", summary, "pre-populated init");
  });

  it("territory incremental: claim frontier tiles keeps cache in sync", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    const cache = makeCache();
    initCacheEntryFromSummary(cache, "p1", summary);
    assertCacheMatchesSummary(cache, "p1", summary, "start");

    for (let i = 0; i < 20; i++) {
      applyClaimToSummaryAndCache(summary, cache, "p1", `${i},0`, "FRONTIER");
      assertCacheMatchesSummary(cache, "p1", summary, `after claim ${i}`);
    }
  });

  it("territory incremental: lose tiles keeps cache in sync (swap-pop order independence)", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    const cache = makeCache();
    initCacheEntryFromSummary(cache, "p1", summary);

    // Claim 10 tiles first.
    for (let i = 0; i < 10; i++) {
      applyClaimToSummaryAndCache(summary, cache, "p1", `${i},0`, "FRONTIER");
    }
    assertCacheMatchesSummary(cache, "p1", summary, "after 10 claims");

    // Lose tiles in non-sequential order (stress-tests swap-pop).
    const loseOrder = [5, 0, 9, 3, 7, 2, 8, 1, 4, 6];
    for (const i of loseOrder) {
      applyLoseToSummaryAndCache(summary, cache, "p1", `${i},0`);
      assertCacheMatchesSummary(cache, "p1", summary, `after losing ${i},0`);
    }
  });

  it("territory incremental: settle tiles removes from frontier, not territory", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    const cache = makeCache();
    initCacheEntryFromSummary(cache, "p1", summary);

    // Claim as FRONTIER.
    for (let i = 0; i < 5; i++) {
      applyClaimToSummaryAndCache(summary, cache, "p1", `${i},0`, "FRONTIER");
    }
    assertCacheMatchesSummary(cache, "p1", summary, "after frontier claims");

    // Settle tiles 0, 2, 4.
    for (const i of [0, 2, 4]) {
      applySettleToSummaryAndCache(summary, cache, "p1", `${i},0`);
      assertCacheMatchesSummary(cache, "p1", summary, `after settling ${i},0`);
    }

    // Territory should still have all 5; frontier should have 1,3.
    const entry = cache.get("p1")!;
    expect(new Set(entry.territory.keys)).toEqual(new Set(["0,0", "1,0", "2,0", "3,0", "4,0"]));
    expect(new Set(entry.frontier.keys)).toEqual(new Set(["1,0", "3,0"]));
  });

  it("candidate indexes incremental: hot/strategic/build updates kept in sync", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    const cache = makeCache();
    initCacheEntryFromSummary(cache, "p1", summary);

    // Simulate a tile change that affects neighborhood [0,0..2,2].
    const affected = ["0,0", "1,0", "0,1", "1,1"];
    const hotKeys = new Set(["0,0", "1,0"]);
    const strategicKeys = new Set(["1,1"]);
    const buildKeys = new Set(["0,0", "0,1"]);

    applyNeighborCandidateUpdateToSummaryAndCache(summary, cache, "p1", affected, hotKeys, strategicKeys, buildKeys);
    assertCacheMatchesSummary(cache, "p1", summary, "after first neighbor update");

    // Simulate a second update that removes some entries.
    const hotKeys2 = new Set<string>();
    const strategicKeys2 = new Set(["0,0"]);
    const buildKeys2 = new Set(["1,1"]);
    applyNeighborCandidateUpdateToSummaryAndCache(summary, cache, "p1", affected, hotKeys2, strategicKeys2, buildKeys2);
    assertCacheMatchesSummary(cache, "p1", summary, "after second neighbor update");
  });

  it("pendingSettlement incremental: add and remove kept in sync", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    const cache = makeCache();
    initCacheEntryFromSummary(cache, "p1", summary);

    applyAddPendingSettlement(summary, cache, "p1", "3,3");
    assertCacheMatchesSummary(cache, "p1", summary, "after add settlement 3,3");

    applyAddPendingSettlement(summary, cache, "p1", "4,4");
    assertCacheMatchesSummary(cache, "p1", summary, "after add settlement 4,4");

    applyRemovePendingSettlement(summary, cache, "p1", "3,3");
    assertCacheMatchesSummary(cache, "p1", summary, "after remove settlement 3,3");

    applyRemovePendingSettlement(summary, cache, "p1", "4,4");
    assertCacheMatchesSummary(cache, "p1", summary, "after remove settlement 4,4");
  });

  it("full mutation sequence: claim/settle/attack/ally-change stays in sync", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    const cache = makeCache();
    initCacheEntryFromSummary(cache, "p1", summary);

    // Phase 1: expand 30 frontier tiles.
    for (let i = 0; i < 30; i++) {
      applyClaimToSummaryAndCache(summary, cache, "p1", `${i},0`, "FRONTIER");
    }
    assertCacheMatchesSummary(cache, "p1", summary, "phase1: 30 frontier tiles");

    // Phase 2: settle tiles 0..14 (remove from frontier, keep in territory).
    for (let i = 0; i < 15; i++) {
      applySettleToSummaryAndCache(summary, cache, "p1", `${i},0`);
    }
    assertCacheMatchesSummary(cache, "p1", summary, "phase2: 15 settled");

    // Phase 3: add candidate index entries for some tiles.
    const affected = Array.from({ length: 10 }, (_, i) => `${i},0`);
    applyNeighborCandidateUpdateToSummaryAndCache(
      summary,
      cache,
      "p1",
      affected,
      new Set(["5,0", "6,0"]),
      new Set(["7,0"]),
      new Set(["8,0", "9,0"])
    );
    assertCacheMatchesSummary(cache, "p1", summary, "phase3: candidate updates");

    // Phase 4: pending settlements.
    applyAddPendingSettlement(summary, cache, "p1", "15,0");
    applyAddPendingSettlement(summary, cache, "p1", "16,0");
    assertCacheMatchesSummary(cache, "p1", summary, "phase4: pending settlements added");

    // Phase 5: lose tiles (attack) in non-sequential order.
    for (const i of [29, 20, 10, 0, 15, 25]) {
      applyLoseToSummaryAndCache(summary, cache, "p1", `${i},0`);
    }
    // Remove pending settlement for 15,0 since it was lost.
    applyRemovePendingSettlement(summary, cache, "p1", "15,0");
    assertCacheMatchesSummary(cache, "p1", summary, "phase5: after attacks and settlement removal");

    // Phase 6: clear then add candidate keys (simulating full rebuild of
    // hot/strategic/build, as rebuildPlannerCandidateIndexesForPlayer does).
    summary.hotFrontierTileKeys.clear();
    summary.strategicFrontierTileKeys.clear();
    summary.buildCandidateTileKeys.clear();
    const entry = cache.get("p1")!;
    resetFromIterable(entry.hotFrontier, summary.hotFrontierTileKeys);
    resetFromIterable(entry.strategicFrontier, summary.strategicFrontierTileKeys);
    resetFromIterable(entry.buildCandidate, summary.buildCandidateTileKeys);
    assertCacheMatchesSummary(cache, "p1", summary, "phase6: after full candidate rebuild");
  });

  it("incrementalAdd is idempotent — duplicate adds do not corrupt the entry", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    const cache = makeCache();
    initCacheEntryFromSummary(cache, "p1", summary);

    applyClaimToSummaryAndCache(summary, cache, "p1", "1,1", "FRONTIER");
    // Apply add again (duplicate — should be a no-op on the cache).
    const entry = cache.get("p1")!;
    incrementalAdd(entry.territory, "1,1");
    incrementalAdd(entry.frontier, "1,1");

    // Cache should still be set-equal to summary.
    assertCacheMatchesSummary(cache, "p1", summary, "after duplicate add");
  });

  it("incrementalRemove on absent key is a safe no-op", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    const cache = makeCache();
    initCacheEntryFromSummary(cache, "p1", summary);

    applyClaimToSummaryAndCache(summary, cache, "p1", "1,1", "FRONTIER");

    const entry = cache.get("p1")!;
    // Remove a key that was never added — should not corrupt the entry.
    incrementalRemove(entry.territory, "99,99");
    incrementalRemove(entry.frontier, "99,99");

    assertCacheMatchesSummary(cache, "p1", summary, "after spurious remove");
  });

  it("multi-player isolation: mutations to p1 do not affect p2", () => {
    const summary1 = createEmptyPlayerRuntimeSummary();
    const summary2 = createEmptyPlayerRuntimeSummary();
    const cache = makeCache();
    initCacheEntryFromSummary(cache, "p1", summary1);
    initCacheEntryFromSummary(cache, "p2", summary2);

    // Claim tiles for p1.
    for (let i = 0; i < 5; i++) {
      applyClaimToSummaryAndCache(summary1, cache, "p1", `${i},0`, "FRONTIER");
    }
    // Claim tiles for p2.
    for (let i = 0; i < 3; i++) {
      applyClaimToSummaryAndCache(summary2, cache, "p2", `${i},1`, "SETTLED");
    }

    assertCacheMatchesSummary(cache, "p1", summary1, "p1 isolated");
    assertCacheMatchesSummary(cache, "p2", summary2, "p2 isolated");

    // Lose p1 tiles and verify p2 is still correct.
    applyLoseToSummaryAndCache(summary1, cache, "p1", "0,0");
    applyLoseToSummaryAndCache(summary1, cache, "p1", "4,0");

    assertCacheMatchesSummary(cache, "p1", summary1, "p1 after lose");
    assertCacheMatchesSummary(cache, "p2", summary2, "p2 unaffected");
  });

  it("lazy init from summary after missing entry matches summary", () => {
    // Simulate first-access path: summary has data but cache entry doesn't exist yet.
    const summary = createEmptyPlayerRuntimeSummary();
    summary.territoryTileKeys.add("5,5");
    summary.territoryTileKeys.add("6,5");
    summary.frontierTileKeys.add("6,5");
    summary.hotFrontierTileKeys.add("6,5");

    const cache = makeCache();
    // initCacheEntryFromSummary simulates what plannerPlayerTileKeys does on first call.
    initCacheEntryFromSummary(cache, "p1", summary);
    assertCacheMatchesSummary(cache, "p1", summary, "lazy init");

    // Subsequent incremental mutation.
    applyClaimToSummaryAndCache(summary, cache, "p1", "7,5", "FRONTIER");
    assertCacheMatchesSummary(cache, "p1", summary, "after incremental add post-init");
  });
});
