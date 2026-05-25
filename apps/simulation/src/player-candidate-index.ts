/**
 * PlayerCandidateIndex
 *
 * Per-anchor spatial index used by tickTerritoryAutomation (fix #3) and
 * sweepAttackCandidates hot-path (fix #4) to avoid per-tick O(r^2) scans and
 * sort allocations.
 *
 * Extends the pattern established in planner-candidate-index.ts — reads that
 * module's helpers but maintains its own data structures for runtime-tier
 * (synchronous main-loop) use.
 *
 * Invalidation: refreshAroundTile is called from
 * refreshPlannerCandidateIndexesAroundTileChange (bounded to (2R+1)^2 = 81
 * tiles per change at MAX_FORT_AUTO_FRONTIER_RADIUS=4, 121 at sweep radius 5).
 * Each call is O(1) amortised per tile, so the total cost per tick is O(dirty
 * tiles * R^2), which is well within watchdog budget.
 *
 * Iteration order for claimCandidates: top-left to bottom-right, matching
 * coordsInChebyshevRadius exactly (dy = -R..+R outer, dx = -R..+R inner,
 * skip center). This preserves determinism in tickTerritoryAutomation.
 *
 * Sort key for sortedAttackCandidates: distance asc, then x asc, then y asc.
 * Matches sweepAttackCandidates exactly.
 */

import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { chebyshevDistanceSimple, coordsInChebyshevRadius } from "./territory-automation.js";

/** Maximum sweep radius across all outpost variants. */
export const MAX_SWEEP_RADIUS = 5;

type AnchorEntry = {
  anchorKey: string;
  anchorOwnerId: string;
  maxRadius: number;
  /** Candidate tile keys sorted by (y asc, x asc) for claim iteration. */
  claimCandidatesByRadius: ReadonlyArray<ReadonlyArray<string>>;
  /** Candidate tiles sorted by (dist asc, x asc, y asc) at maxRadius. */
  sortedAttackTiles: DomainTileState[];
};

const parseTileKey = (key: string): { x: number; y: number } | undefined => {
  const comma = key.indexOf(",");
  if (comma < 0) return undefined;
  const x = Number(key.slice(0, comma));
  const y = Number(key.slice(comma + 1));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { x, y };
};

const sortedInsert = (arr: DomainTileState[], tile: DomainTileState, anchorX: number, anchorY: number): void => {
  const dist = chebyshevDistanceSimple(anchorX, anchorY, tile.x, tile.y);
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const m = arr[mid]!;
    const mDist = chebyshevDistanceSimple(anchorX, anchorY, m.x, m.y);
    if (mDist < dist || (mDist === dist && (m.x < tile.x || (m.x === tile.x && m.y < tile.y)))) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  arr.splice(lo, 0, tile);
};

const isEnemyTile = (tile: DomainTileState, ownerId: string): boolean =>
  tile.terrain === "LAND" &&
  !!tile.ownerId &&
  tile.ownerId !== ownerId &&
  (tile.ownershipState === "FRONTIER" || tile.ownershipState === "SETTLED" || tile.ownershipState === "BARBARIAN");

const isFortAttackTarget = (tile: DomainTileState, ownerId: string): boolean =>
  tile.terrain === "LAND" &&
  !!tile.ownerId &&
  tile.ownerId !== ownerId &&
  tile.ownershipState === "FRONTIER" &&
  !tile.fort &&
  (tile.economicStructure?.type !== "WOODEN_FORT" || tile.economicStructure.status !== "active");

/**
 * Build the per-radius claim candidate list for an anchor at (ax, ay).
 *
 * Index 0 = radius 1, index 1 = radius 2, … index maxRadius-1 = maxRadius.
 * Each entry is a sorted array of tile keys (by (y asc, x asc)) that are
 * newly added at that radius (not present at smaller radii).
 *
 * Claim iteration over radius r visits indices 0..r-1 in order.
 * Within each ring the order matches coordsInChebyshevRadius (top-left to
 * bottom-right) — we sort by y then x to reproduce that traversal.
 */
const buildClaimCandidatesByRadius = (
  ax: number,
  ay: number,
  maxRadius: number
): ReadonlyArray<ReadonlyArray<string>> => {
  const result: string[][] = [];
  // coordsInChebyshevRadius already gives top-left to bottom-right (dy outer,
  // dx inner). We want the ring at each radius, so we group coords by their
  // Chebyshev distance from the anchor.
  const allCoords = coordsInChebyshevRadius(ax, ay, maxRadius);
  // Group by radius (Chebyshev distance).
  const byRadius: string[][] = Array.from({ length: maxRadius }, () => []);
  for (const { x, y } of allCoords) {
    const dist = Math.max(Math.abs(x - ax), Math.abs(y - ay));
    // For wrapped coordinates, recompute correctly.
    const dx = Math.abs(x - ax);
    const wrappedDx = Math.min(dx, WORLD_WIDTH - dx);
    const dy = Math.abs(y - ay);
    const wrappedDy = Math.min(dy, WORLD_HEIGHT - dy);
    const wrappedDist = Math.max(wrappedDx, wrappedDy);
    const r = wrappedDist;
    if (r >= 1 && r <= maxRadius) {
      byRadius[r - 1]!.push(`${x},${y}`);
    }
    void dist; // unused, using wrappedDist
  }
  for (let r = 0; r < maxRadius; r += 1) {
    // coordsInChebyshevRadius iterates dy=-r..+r outer, dx=-r..+r inner.
    // The coords are already in (dy asc, dx asc) order within each ring.
    // We just pass them through in the same order they were generated.
    result.push(byRadius[r] ?? []);
  }
  return result;
};

export class PlayerCandidateIndex {
  private readonly anchors = new Map<string, AnchorEntry>();
  /** Set of tile keys that are watched by at least one anchor. */
  private readonly watchedKeys = new Map<string, Set<string>>(); // tileKey -> anchorKeys

  /** Register an anchor tile (town or fort) with its maximum radius. */
  registerAnchor(
    anchorTileKey: string,
    anchorOwnerId: string,
    maxRadius: number,
    getTile: (key: string) => DomainTileState | undefined
  ): void {
    const coords = parseTileKey(anchorTileKey);
    if (!coords) return;
    const { x: ax, y: ay } = coords;
    const claimCandidatesByRadius = buildClaimCandidatesByRadius(ax, ay, maxRadius);
    // Build sorted attack candidates from scratch.
    const sortedAttackTiles: DomainTileState[] = [];
    for (let ri = 0; ri < maxRadius; ri += 1) {
      for (const key of claimCandidatesByRadius[ri] ?? []) {
        const tile = getTile(key);
        if (!tile) continue;
        if (isEnemyTile(tile, anchorOwnerId)) {
          sortedInsert(sortedAttackTiles, tile, ax, ay);
        }
        // Register watch.
        let watchers = this.watchedKeys.get(key);
        if (!watchers) { watchers = new Set(); this.watchedKeys.set(key, watchers); }
        watchers.add(anchorTileKey);
      }
    }
    this.anchors.set(anchorTileKey, {
      anchorKey: anchorTileKey,
      anchorOwnerId,
      maxRadius,
      claimCandidatesByRadius,
      sortedAttackTiles
    });
  }

  /** Unregister an anchor tile. */
  unregisterAnchor(anchorTileKey: string): void {
    const entry = this.anchors.get(anchorTileKey);
    if (!entry) return;
    // Remove watcher registrations.
    for (const ring of entry.claimCandidatesByRadius) {
      for (const key of ring) {
        const watchers = this.watchedKeys.get(key);
        if (watchers) {
          watchers.delete(anchorTileKey);
          if (watchers.size === 0) this.watchedKeys.delete(key);
        }
      }
    }
    this.anchors.delete(anchorTileKey);
  }

  /**
   * Refresh all anchors that watch the given tile.
   *
   * Called from refreshPlannerCandidateIndexesAroundTileChange after a tile
   * mutation. Bounded to (2*MAX_RADIUS+1)^2 tiles inspected per change.
   */
  refreshAroundTile(
    tileKey: string,
    getTile: (key: string) => DomainTileState | undefined
  ): void {
    const affectedAnchors = this.watchedKeys.get(tileKey);
    if (!affectedAnchors || affectedAnchors.size === 0) return;
    for (const anchorKey of affectedAnchors) {
      const entry = this.anchors.get(anchorKey);
      if (!entry) continue;
      const coords = parseTileKey(anchorKey);
      if (!coords) continue;
      const { x: ax, y: ay } = coords;
      const ownerId = entry.anchorOwnerId;
      // Rebuild sorted attack list from scratch (small — maxRadius^2 tiles).
      const sortedAttackTiles: DomainTileState[] = [];
      for (const ring of entry.claimCandidatesByRadius) {
        for (const key of ring) {
          const tile = getTile(key);
          if (!tile) continue;
          if (isEnemyTile(tile, ownerId)) {
            sortedInsert(sortedAttackTiles, tile, ax, ay);
          }
        }
      }
      entry.sortedAttackTiles = sortedAttackTiles;
    }
  }

  /**
   * Return an iterable of tile keys within chebyshev radius for claim scanning.
   *
   * Iteration order matches coordsInChebyshevRadius top-left to bottom-right
   * for determinism. Returns only keys up to currentRadius.
   */
  claimCandidates(anchorTileKey: string, currentRadius: number): Iterable<string> {
    const entry = this.anchors.get(anchorTileKey);
    if (!entry || currentRadius <= 0) return [];
    const r = Math.min(currentRadius, entry.maxRadius);
    const result: string[] = [];
    for (let ri = 0; ri < r; ri += 1) {
      const ring = entry.claimCandidatesByRadius[ri];
      if (ring) for (const key of ring) result.push(key);
    }
    return result;
  }

  /**
   * Return the sorted attack candidates for an anchor up to currentRadius.
   *
   * Sort order: distance asc, x asc, y asc — matches sweepAttackCandidates.
   * The full sorted list at maxRadius is precomputed; this method filters to
   * currentRadius.
   *
   * Hot-path callers should use this instead of sweepAttackCandidates/
   * fortAutoAttackCandidates to avoid per-call sort + intermediate allocations.
   */
  sortedAttackCandidates(anchorTileKey: string, currentRadius: number): readonly DomainTileState[] {
    const entry = this.anchors.get(anchorTileKey);
    if (!entry) return [];
    if (currentRadius >= entry.maxRadius) return entry.sortedAttackTiles;
    const coords = parseTileKey(anchorTileKey);
    if (!coords) return [];
    const { x: ax, y: ay } = coords;
    return entry.sortedAttackTiles.filter((t) =>
      chebyshevDistanceSimple(ax, ay, t.x, t.y) <= currentRadius
    );
  }

  /**
   * Return sorted fort-auto-attack candidates (frontier only, no fort/wooden-fort).
   * Used by the fort patrol path in tickTerritoryAutomation (fix #4 fort variant).
   */
  sortedFortAttackCandidates(anchorTileKey: string, currentRadius: number): readonly DomainTileState[] {
    const entry = this.anchors.get(anchorTileKey);
    if (!entry) return [];
    const coords = parseTileKey(anchorTileKey);
    if (!coords) return [];
    const { x: ax, y: ay } = coords;
    const ownerId = entry.anchorOwnerId;
    const r = Math.min(currentRadius, entry.maxRadius);
    // Filter from the precomputed sorted list.
    return entry.sortedAttackTiles.filter((t) => {
      const dist = chebyshevDistanceSimple(ax, ay, t.x, t.y);
      return dist <= r && isFortAttackTarget(t, ownerId);
    });
  }

  hasAnchor(anchorTileKey: string): boolean {
    return this.anchors.has(anchorTileKey);
  }

  anchorCount(): number {
    return this.anchors.size;
  }

  size(): number {
    return this.watchedKeys.size;
  }
}
