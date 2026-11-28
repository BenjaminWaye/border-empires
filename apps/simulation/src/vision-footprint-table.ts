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
 * - Forest terrain only changes when an AFC landing clears it (once per
 *   spawn, via forestClearingEpoch), so any entry whose computation never
 *   touched a mountain is cached in `permanentByKey` and kept until then. Only entries that *did* involve a mountain (which
 *   CREATE_MOUNTAIN/REMOVE_MOUNTAIN can change) go in `epochScopedByKey`,
 *   cleared via the runtime's existing `terrainEpoch` counter. This split
 *   matters because forest is common terrain — without it, a single rare
 *   mountain edit anywhere in the world would force every forest-adjacent
 *   footprint across the whole map to be recomputed too.
 * - The memo key is a packed integer (not a template-string concatenation)
 *   so the Map.get() calls this function does on every call — clean or
 *   occluded — never allocate a string on the hot path.
 *
 * Bound on `permanentByKey`/`epochScopedByKey` growth: each is a
 * VisionFootprintMemo (vision-footprint-memo.ts) holding at most
 * 2 x VISION_FOOTPRINT_MEMO_GENERATION_SIZE entries, each a packed Int16Array
 * rather than an array of [dx, dy] tuples (about 64 bytes per cell as JS
 * arrays). The old unbounded maps kept every (tile, radius) ever queried for
 * the whole season -- radius grows with tech, so stale radii piled up -- and
 * grew without levelling off in the 2026-11-28 heap snapshots.
 */

import type { Terrain } from "@border-empires/shared";
import { HILLS_VISION_BONUS, forestClearingEpoch, isForestTileAt, isHillsTileAt } from "@border-empires/shared";
import { computeLosOffsets, squareOffsets } from "./vision-line-of-sight.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { runtimeLogInfo } from "./runtime-log/runtime-log.js";
import { VisionFootprintMemo, packOffsets, unpackOffsets, type PackedFootprint, type VisionFootprintMemoStats } from "./vision-footprint-memo.js";

// Per tier and per generation. Most entries are the cheap "no occluder"
// marker (about 20 bytes average in a 46k-tile world); 16k per generation
// rolled over every hour or so there, so this is doubled. Worst case, every
// entry an occluded footprint (~200 bytes packed): about 25 MB per tier.
export const VISION_FOOTPRINT_MEMO_GENERATION_SIZE = 32_768;

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
  // Forest-only (or fully clean) results — forest only changes on an AFC
  // landing (forestClearingEpoch), so these are otherwise never invalidated. `null` means "clean, use the shared
  // plain square"; an array means "forest-occluded, use this footprint".
  private readonly permanentByKey: VisionFootprintMemo;
  // Results whose computation touched a mountain — cleared on terrainEpoch
  // change (CREATE_MOUNTAIN/REMOVE_MOUNTAIN). Kept separate from
  // permanentByKey so a rare mountain edit doesn't force every (much more
  // common) forest-adjacent footprint to be recomputed too.
  private readonly epochScopedByKey: VisionFootprintMemo;
  private epoch = -1;
  private forestEpoch = forestClearingEpoch();
  private readonly forestAt: (x: number, y: number) => boolean;

  constructor(worldWidth: number, worldHeight: number, deps: VisionFootprintTableDeps, generationSize = VISION_FOOTPRINT_MEMO_GENERATION_SIZE) {
    const onRollover = (tier: string) => (stats: VisionFootprintMemoStats) => runtimeLogInfo({ tier, ...stats }, "simulation vision footprint memo rollover");
    this.permanentByKey = new VisionFootprintMemo(generationSize, onRollover("permanent"));
    this.epochScopedByKey = new VisionFootprintMemo(generationSize, onRollover("epoch"));
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.deps = deps;
    const staticForestAt = deps.forestAt ?? isForestTileAt;
    // isForestTileAt reads the static worldgen map only. Season worldgen can
    // carve SEA channels through tiles that map still calls forest
    // (server-worldgen-island-connectivity.ts), so the live terrain must
    // veto it: water never occludes vision. Sea never changes in play, so
    // this doesn't affect the permanent/epoch cache split below (a future
    // terraform that makes or drains sea must clear permanentByKey too).
    // The cheap static check runs first so forest-free cells never pay for
    // the terrain lookup.
    this.forestAt = (x, y) => {
      if (!staticForestAt(x, y)) return false;
      const terrain = this.deps.terrainAt(((x % worldWidth) + worldWidth) % worldWidth, ((y % worldHeight) + worldHeight) % worldHeight);
      return terrain !== "SEA" && terrain !== "COASTAL_SEA";
    };
  }

  /**
   * Returns the (dx, dy) offsets a vision source at (x, y) with the given
   * base radius actually dilates into, after the hills vision bonus, forest
   * ray occlusion, and mountain occlusion. Callers wrap (x + dx, y + dy)
   * into world bounds themselves — this mirrors the existing
   * forEachDilatedCell contract.
   *
   * `ignoreForest` drops forest occlusion (mountains still block): Relay
   * Beacon vision rings see over the canopy (runtime-outpost-vision.ts).
   * It is part of the memo key, so the two footprints never share an entry.
   */
  getOffsets(x: number, y: number, radius: number, ignoreForest = false): ReadonlyArray<[number, number]> {
    const resolved = this.resolve(x, y, radius, ignoreForest);
    return typeof resolved === "number" ? this.plainSquare(resolved) : unpackOffsets(resolved);
  }

  /**
   * Same footprint as getOffsets, without allocating: calls `cb` once per
   * (dx, dy). The hot path (VisibilityCoverageCache's dilation) uses this.
   */
  forEachOffset(x: number, y: number, radius: number, ignoreForest: boolean, cb: (dx: number, dy: number) => void): void {
    const resolved = this.resolve(x, y, radius, ignoreForest);
    if (typeof resolved === "number") {
      for (const [dx, dy] of this.plainSquare(resolved)) cb(dx, dy);
      return;
    }
    for (let i = 0; i < resolved.length; i += 2) cb(resolved[i]!, resolved[i + 1]!);
  }

  /** Size gauge for both memo tiers (state-and-persistence-discipline.md). */
  stats(): { permanent: VisionFootprintMemoStats; epochScoped: VisionFootprintMemoStats } {
    return { permanent: this.permanentByKey.stats(), epochScoped: this.epochScopedByKey.stats() };
  }

  // A number is the effective radius of an unoccluded (plain square) footprint.
  private resolve(x: number, y: number, radius: number, ignoreForest: boolean): number | Int16Array {
    this.invalidateIfEpochChanged();
    // radius 0 means "self-tile only, no standing halo" (a FRONTIER claim —
    // see visibility-coverage-cache.ts's tileOwnershipChanged) — the hills
    // bonus extends an existing halo outward, it doesn't conjure one from
    // nothing, so it's skipped entirely at radius 0 rather than bumping it
    // to 1 and silently reintroducing the halo FRONTIER isn't meant to have.
    const effectiveRadius = radius > 0 && isHillsTileAt(x, y) ? radius + HILLS_VISION_BONUS : radius;
    const key = this.packKey(x, y, effectiveRadius) * 2 + (ignoreForest ? 1 : 0);

    const permanent: PackedFootprint | undefined = this.permanentByKey.get(key);
    if (permanent !== undefined) return permanent ?? effectiveRadius;
    const epochScoped = this.epochScopedByKey.get(key);
    if (epochScoped) return epochScoped;

    const { hasMountain, hasForest } = this.scanOccluders(x, y, effectiveRadius, ignoreForest);
    if (!hasMountain && !hasForest) {
      this.permanentByKey.set(key, null);
      return effectiveRadius;
    }

    const offsets = packOffsets(computeLosOffsets(x, y, effectiveRadius, (mx, my) => this.mountainAt(mx, my), ignoreForest ? () => false : this.forestAt));
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
  private scanOccluders(x: number, y: number, radius: number, ignoreForest: boolean): { hasMountain: boolean; hasForest: boolean } {
    let hasMountain = false;
    // Forest that can't occlude counts as already found, so the scan stops on the first mountain.
    let hasForest = ignoreForest;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (!hasMountain && this.mountainAt(x + dx, y + dy)) hasMountain = true;
        if (!hasForest && this.forestAt(x + dx, y + dy)) hasForest = true;
        if (hasMountain && hasForest) return { hasMountain, hasForest: hasForest && !ignoreForest };
      }
    }
    return { hasMountain, hasForest: hasForest && !ignoreForest };
  }

  private invalidateIfEpochChanged(): void {
    // An AFC landing clearing forest is the one in-play forest change (see
    // forest-clearing.ts in @border-empires/shared) -- rare, so dropping
    // every memoized footprint is cheaper than tracking which it touched.
    const currentForestEpoch = forestClearingEpoch();
    if (currentForestEpoch !== this.forestEpoch) {
      this.forestEpoch = currentForestEpoch;
      this.permanentByKey.clear();
      this.epochScopedByKey.clear();
    }
    const currentEpoch = this.deps.getTerrainEpoch();
    if (currentEpoch === this.epoch) return;
    this.epoch = currentEpoch;
    this.epochScopedByKey.clear();
    // permanentByKey and plainSquareByRadius are both mountain-independent
    // (forest-only or fully clean) — only a forest clearing (above) drops them.
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
