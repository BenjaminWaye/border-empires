/**
 * Terrain-aware vision footprint table: the set of (dx, dy) offsets a source
 * tile's vision dilates into, given forest clamping and mountain occlusion.
 *
 * Performance contract: this must not add cost to the existing O(radius²)
 * per-tile hot path (tileOwnershipChanged in visibility-coverage-cache.ts)
 * for the common case of a tile with no forest/mountain interaction.
 *
 * How the zero-cost guarantee holds:
 * - Forest-ness and mountain adjacency are both permanent-until-terraformed
 *   properties of a tile. Forest-ness never mutates in play. Mountains only
 *   change via CREATE_MOUNTAIN/REMOVE_MOUNTAIN, which already bump the
 *   runtime's `terrainEpoch` counter — reused here as the sole invalidation
 *   signal instead of adding new mutation hooks.
 * - The overwhelming majority of tiles have no mountain anywhere within
 *   vision radius. For those, `getOffsets` returns a *shared* plain-square
 *   array (one per distinct radius, not per tile) with no per-tile Map
 *   write at all — identical cost to the pre-LOS square-dilation loop.
 * - Only tiles that are themselves forest, or have a mountain within
 *   radius, pay a one-time O(radius²) scan/raycast, memoized forever by
 *   (x, y, radius) until the next terrain epoch. Since a given owned tile's
 *   (position, radius) pair is reused across every future
 *   capture/loss/resync of that same tile, this cost is paid at most once
 *   per distinct occluded tile+radius combination, not once per mutation.
 * - The memo key is a packed integer (not a template-string concatenation)
 *   so even the single Map.get() this function does on every call — clean
 *   or occluded — never allocates a string on the hot path.
 */

import type { Terrain } from "@border-empires/shared";
import { FOREST_VISION_RANGE, isForestTileAt } from "@border-empires/shared";
import { computeLosOffsets, squareOffsets } from "./vision-line-of-sight.js";
import { simulationTileKey } from "./seed-state/seed-state.js";

export type VisionFootprintTableDeps = {
  /** Live (mutable) terrain lookup — must reflect CREATE_MOUNTAIN/REMOVE_MOUNTAIN. */
  readonly terrainAt: (x: number, y: number) => Terrain | undefined;
  /** Bumped by the runtime on every terrain mutation; used to invalidate memoized footprints. */
  readonly getTerrainEpoch: () => number;
};

// Radius is packed into the low bits of the memo key below; real vision
// radii top out in the low tens (VISION_RADIUS×mods + tech/observatory
// bonuses, see effectiveVisionRadiusForPlayer), far under this ceiling.
const MAX_PACKABLE_RADIUS = 1_024;

export class VisionFootprintTable {
  private readonly worldWidth: number;
  private readonly worldHeight: number;
  private readonly deps: VisionFootprintTableDeps;
  private readonly plainSquareByRadius = new Map<number, ReadonlyArray<[number, number]>>();
  // Keyed by a packed (x, y, radius) integer rather than a template-string
  // concatenation — this Map.get() runs on every getOffsets() call (hot
  // path), so it must not allocate. `null` means "clean, use the shared
  // plain square"; an array means "occluded, use this LOS-filtered footprint".
  private readonly footprintByKey = new Map<number, ReadonlyArray<[number, number]> | null>();
  private epoch = -1;

  constructor(worldWidth: number, worldHeight: number, deps: VisionFootprintTableDeps) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.deps = deps;
  }

  /**
   * Returns the (dx, dy) offsets a vision source at (x, y) with the given
   * base radius actually dilates into, after forest clamping and mountain
   * occlusion. Callers wrap (x + dx, y + dy) into world bounds themselves —
   * this mirrors the existing forEachDilatedCell contract.
   */
  getOffsets(x: number, y: number, radius: number): ReadonlyArray<[number, number]> {
    this.invalidateIfEpochChanged();
    const effectiveRadius = isForestTileAt(x, y) ? Math.min(radius, FOREST_VISION_RANGE) : radius;
    const key = this.packKey(x, y, effectiveRadius);

    const cached = this.footprintByKey.get(key);
    if (cached !== undefined) return cached ?? this.plainSquare(effectiveRadius);

    if (!this.hasMountainWithin(x, y, effectiveRadius)) {
      this.footprintByKey.set(key, null);
      return this.plainSquare(effectiveRadius);
    }

    const offsets = computeLosOffsets(x, y, effectiveRadius, (mx, my) => this.mountainAt(mx, my));
    this.footprintByKey.set(key, offsets);
    return offsets;
  }

  private packKey(x: number, y: number, radius: number): number {
    const wx = ((x % this.worldWidth) + this.worldWidth) % this.worldWidth;
    const wy = ((y % this.worldHeight) + this.worldHeight) % this.worldHeight;
    return (wx * this.worldHeight + wy) * MAX_PACKABLE_RADIUS + radius;
  }

  private plainSquare(radius: number): ReadonlyArray<[number, number]> {
    let offsets = this.plainSquareByRadius.get(radius);
    if (!offsets) {
      offsets = squareOffsets(radius);
      this.plainSquareByRadius.set(radius, offsets);
    }
    return offsets;
  }

  private mountainAt(x: number, y: number): boolean {
    const wx = ((x % this.worldWidth) + this.worldWidth) % this.worldWidth;
    const wy = ((y % this.worldHeight) + this.worldHeight) % this.worldHeight;
    return this.deps.terrainAt(wx, wy) === "MOUNTAIN";
  }

  private hasMountainWithin(x: number, y: number, radius: number): boolean {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (this.mountainAt(x + dx, y + dy)) return true;
      }
    }
    return false;
  }

  private invalidateIfEpochChanged(): void {
    const currentEpoch = this.deps.getTerrainEpoch();
    if (currentEpoch === this.epoch) return;
    this.epoch = currentEpoch;
    this.footprintByKey.clear();
    // plainSquareByRadius is terrain-independent — never needs invalidation.
  }
}

/**
 * Single-line composition helper so runtime.ts only needs one field, not an
 * inline deps object literal (keeps the already-oversized file from
 * growing). Takes a `getTiles` thunk rather than the Map directly since this
 * is constructed as a class field before `tiles` is assigned in the
 * constructor body — the thunk defers the read until first actual use.
 */
export const createVisionFootprintTableForRuntime = (
  worldWidth: number,
  worldHeight: number,
  getTiles: () => Map<string, { terrain?: Terrain }>,
  getTerrainEpoch: () => number
): VisionFootprintTable =>
  new VisionFootprintTable(worldWidth, worldHeight, { terrainAt: (x, y) => getTiles().get(simulationTileKey(x, y))?.terrain, getTerrainEpoch });
