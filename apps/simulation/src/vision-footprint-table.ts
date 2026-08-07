/**
 * Terrain-aware vision footprint table: the set of (dx, dy) offsets a source
 * tile's vision dilates into, given forest and mountain occlusion (see
 * vision-line-of-sight.ts for the actual ray math), plus the hills vision
 * bonus.
 *
 * Performance contract: this must not add cost to the existing O(radius²)
 * per-tile hot path (tileOwnershipChanged in visibility-coverage-cache.ts)
 * for the common case of a tile with no forest/mountain interaction nearby.
 *
 * How the zero-cost guarantee holds:
 * - Hills-ness, forest-ness, and mountain adjacency are all
 *   permanent-until-terraformed properties of a tile. Hills-ness and
 *   forest-ness never mutate in play. Mountains only change via
 *   CREATE_MOUNTAIN/REMOVE_MOUNTAIN, which already bump the runtime's
 *   `terrainEpoch` counter — reused here as the sole invalidation signal
 *   instead of adding new mutation hooks.
 * - Tiles with neither a mountain nor a forest anywhere within radius (the
 *   common case away from that terrain) get a *shared* plain-square array
 *   (one per distinct radius, not per tile) with no per-tile Map write at
 *   all — identical cost to the pre-LOS square-dilation loop.
 * - Everything else pays a one-time O(radius²) scan/raycast, memoized
 *   forever by (x, y, radius). Since a given owned tile's (position, radius)
 *   pair is reused across every future capture/loss/resync of that same
 *   tile, this cost is paid at most once per distinct tile+radius
 *   combination, not once per mutation.
 * - Forest terrain never mutates in play, so any entry whose computation
 *   never touched a mountain is cached in `permanentByKey` and never
 *   invalidated. Only entries that *did* involve a mountain (which
 *   CREATE_MOUNTAIN/REMOVE_MOUNTAIN can change) go in `epochScopedByKey`,
 *   cleared via the runtime's existing `terrainEpoch` counter. This split
 *   matters because forest is common terrain — without it, a single rare
 *   mountain edit anywhere in the world would force every forest-adjacent
 *   footprint across the whole map to be recomputed too.
 * - The memo key is a packed integer (not a template-string concatenation)
 *   so the Map.get() calls this function does on every call — clean or
 *   occluded — never allocate a string on the hot path.
 *
 * Bound on `permanentByKey`/`epochScopedByKey` growth: since forest is common
 * terrain (unlike sparse mountains), a much larger fraction of ever-touched
 * tiles now get a real cached entry here, and neither map ever evicts.
 * Unlike a request-driven cache this is NOT unbounded by load/time, though:
 * the key space is capped by (world tile count) × (distinct radius values
 * ever queried) — both hard, finite ceilings for a fixed world size — the
 * same bound VisibilityCoverageCache already relies on for its own per-player
 * O(territory) storage. In practice the number of
 * distinct radii is small (a handful of tech/observatory-derived integers),
 * so total entries stay well under (world tiles), not anywhere near the
 * theoretical (world tiles × distinct radii) ceiling.
 */

import type { Terrain } from "@border-empires/shared";
import { HILLS_VISION_BONUS, isForestTileAt, isHillsTileAt } from "@border-empires/shared";
import { computeLosOffsets, squareOffsets } from "./vision-line-of-sight.js";
import { simulationTileKey } from "./seed-state/seed-state.js";

export type VisionFootprintTableDeps = {
  /** Live (mutable) terrain lookup — must reflect CREATE_MOUNTAIN/REMOVE_MOUNTAIN. */
  readonly terrainAt: (x: number, y: number) => Terrain | undefined;
  /** Bumped by the runtime on every terrain mutation; used to invalidate memoized footprints. */
  readonly getTerrainEpoch: () => number;
  /** Forest lookup — defaults to the real (static, world-seeded) isForestTileAt; overridable for deterministic tests. */
  readonly forestAt?: (x: number, y: number) => boolean;
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
  // Forest-only (or fully clean) results — forest terrain is static, so
  // these never need invalidation. `null` means "clean, use the shared
  // plain square"; an array means "forest-occluded, use this footprint".
  private readonly permanentByKey = new Map<number, ReadonlyArray<[number, number]> | null>();
  // Results whose computation touched a mountain — cleared on terrainEpoch
  // change (CREATE_MOUNTAIN/REMOVE_MOUNTAIN). Kept separate from
  // permanentByKey so a rare mountain edit doesn't force every (much more
  // common) forest-adjacent footprint to be recomputed too.
  private readonly epochScopedByKey = new Map<number, ReadonlyArray<[number, number]>>();
  private epoch = -1;
  private readonly forestAt: (x: number, y: number) => boolean;

  constructor(worldWidth: number, worldHeight: number, deps: VisionFootprintTableDeps) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.deps = deps;
    this.forestAt = deps.forestAt ?? isForestTileAt;
  }

  /**
   * Returns the (dx, dy) offsets a vision source at (x, y) with the given
   * base radius actually dilates into, after the hills vision bonus, forest
   * ray occlusion, and mountain occlusion. Callers wrap (x + dx, y + dy)
   * into world bounds themselves — this mirrors the existing
   * forEachDilatedCell contract.
   */
  getOffsets(x: number, y: number, radius: number): ReadonlyArray<[number, number]> {
    this.invalidateIfEpochChanged();
    const effectiveRadius = isHillsTileAt(x, y) ? radius + HILLS_VISION_BONUS : radius;
    const key = this.packKey(x, y, effectiveRadius);

    const permanent = this.permanentByKey.get(key);
    if (permanent !== undefined) return permanent ?? this.plainSquare(effectiveRadius);
    const epochScoped = this.epochScopedByKey.get(key);
    if (epochScoped !== undefined) return epochScoped;

    const { hasMountain, hasForest } = this.scanOccluders(x, y, effectiveRadius);
    if (!hasMountain && !hasForest) {
      this.permanentByKey.set(key, null);
      return this.plainSquare(effectiveRadius);
    }

    const offsets = computeLosOffsets(x, y, effectiveRadius, (mx, my) => this.mountainAt(mx, my), this.forestAt);
    if (hasMountain) {
      this.epochScopedByKey.set(key, offsets);
    } else {
      this.permanentByKey.set(key, offsets);
    }
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

  /** Single O(radius²) pass detecting both occluder types, with an early exit once both are found. The source tile itself is excluded — its own terrain never occludes its own vision (see vision-line-of-sight.ts). */
  private scanOccluders(x: number, y: number, radius: number): { hasMountain: boolean; hasForest: boolean } {
    let hasMountain = false;
    let hasForest = false;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (!hasMountain && this.mountainAt(x + dx, y + dy)) hasMountain = true;
        if (!hasForest && this.forestAt(x + dx, y + dy)) hasForest = true;
        if (hasMountain && hasForest) return { hasMountain, hasForest };
      }
    }
    return { hasMountain, hasForest };
  }

  private invalidateIfEpochChanged(): void {
    const currentEpoch = this.deps.getTerrainEpoch();
    if (currentEpoch === this.epoch) return;
    this.epoch = currentEpoch;
    this.epochScopedByKey.clear();
    // permanentByKey and plainSquareByRadius are both mountain-independent
    // (forest-only or fully clean) — never need invalidation.
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
