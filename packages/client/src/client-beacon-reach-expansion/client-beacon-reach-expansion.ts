// While a Relay Beacon is being placed, the map shows the reach it would add growing out from the chosen tile:
// the ground newly brought into reach fills in ring by ring from the beacon to the edge of its reach, inside a
// solid outline of where it ends, then holds and plays again. Ground already in reach is left alone, so what
// lights up is exactly what the beacon adds. The owner asked for this in place of the old flat range square
// (First-15 round 1: "illustrate this better instead of the green overlay"); a player asked to see the reach
// before confirming, not only after.
//
// Shared by the 2D canvas (client-placement-preview-2d.ts) and the true-3D overlay
// (client-map-3d-beacon-placement-overlay.ts) so both draw the same tiles on the same clock.
import { chebyshevWithWrap } from "@border-empires/shared";
import { REACH_RADIUS_BY_KIND } from "../client-reach-overlay/client-reach-overlay-anchor-disk.js";
import { computeOutpostReachPreview } from "../client-reach-overlay-beacon-preview/client-reach-overlay-beacon-preview.js";
import { reachCacheKey, resolveMyReachCached, type ReachCacheState } from "../client-reach-authoritative/client-reach-authoritative.js";

/** One tile the beacon would newly bring into reach, with its ring (Chebyshev distance) from the beacon. */
export type BeaconNewReachTile = { readonly x: number; readonly y: number; readonly key: string; readonly ring: number };

export type BeaconReachExpansion = {
  readonly tiles: readonly BeaconNewReachTile[];
  readonly keys: ReadonlySet<string>;
};

/** How long the reach takes to grow from the beacon to its edge. */
export const BEACON_EXPANSION_GROW_MS = 1_100;
/** How long the full reach holds before it plays again. */
export const BEACON_EXPANSION_HOLD_MS = 1_600;
const CYCLE_MS = BEACON_EXPANSION_GROW_MS + BEACON_EXPANSION_HOLD_MS;
const RADIUS = REACH_RADIUS_BY_KIND.OUTPOST;

/** The tiles a beacon at (x, y) would add to the player's reach: its land-gated reach less what is already in reach. */
export const beaconReachExpansion = (state: ReachCacheState, x: number, y: number): BeaconReachExpansion => {
  const existing = resolveMyReachCached(state);
  const tiles: BeaconNewReachTile[] = [];
  for (const key of computeOutpostReachPreview(x, y, state.tiles)) {
    if (existing.has(key)) continue;
    const [kx, ky] = key.split(",").map(Number);
    if (!Number.isFinite(kx) || !Number.isFinite(ky)) continue;
    tiles.push({ x: kx!, y: ky!, key, ring: chebyshevWithWrap(x, y, kx!, ky!) });
  }
  return { tiles, keys: new Set(tiles.map((tile) => tile.key)) };
};

let expansionCache: { tiles: ReachCacheState["tiles"]; key: string; expansion: BeaconReachExpansion } | undefined;

/**
 * `beaconReachExpansion`, memoised on the beacon tile, the tiles map and the reach cache key (tiles revision +
 * server reach). Both renderers draw the preview every frame; only the fill scale changes with time, so the disk
 * and its key strings are built once per spot and tile change, not 60 times a second.
 */
export const beaconReachExpansionCached = (state: ReachCacheState, x: number, y: number): BeaconReachExpansion => {
  const key = `${x},${y}|${reachCacheKey(state)}`;
  if (expansionCache && expansionCache.tiles === state.tiles && expansionCache.key === key) return expansionCache.expansion;
  const expansion = beaconReachExpansion(state, x, y);
  expansionCache = { tiles: state.tiles, key, expansion };
  return expansion;
};

/**
 * How far in a tile on `ring` has filled at `elapsedMs` into the cycle: 0 before the wave reaches it, rising to 1
 * as the wave passes, 1 while the reach holds. `reducedMotion` shows it full at once.
 */
export const beaconExpansionTileFill = (ring: number, elapsedMs: number, reducedMotion = false): number => {
  if (reducedMotion) return 1;
  const t = ((elapsedMs % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  // The wave front moves from the beacon (ring 0) to one ring past the edge, so the last ring finishes filling.
  const front = (Math.min(t, BEACON_EXPANSION_GROW_MS) / BEACON_EXPANSION_GROW_MS) * (RADIUS + 1);
  return Math.max(0, Math.min(1, front - ring));
};

let clock: { key: string; startedAt: number } | undefined;

/** Placement ended: the next placement, even on the same tile, plays the growth from the beacon out again. */
export const resetBeaconExpansionClock = (): void => {
  clock = undefined;
};

/** Ms since the beacon was put on this tile: moving it restarts the growth, so each new spot plays from the beacon out. */
export const beaconExpansionElapsedMs = (x: number, y: number, nowMs: number): number => {
  const key = `${x},${y}`;
  if (!clock || clock.key !== key) clock = { key, startedAt: nowMs };
  return nowMs - clock.startedAt;
};

/** The viewer asked their system for less motion: the reach shows in full with no growth. */
// One live MediaQueryList (its `matches` follows the setting), not a new one per frame.
let reducedMotionQuery: MediaQueryList | null | undefined;
export const prefersReducedMotion = (): boolean => {
  if (reducedMotionQuery === undefined) {
    reducedMotionQuery =
      typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  }
  return reducedMotionQuery?.matches ?? false;
};

export type BeaconOutlineEdge = { readonly x: number; readonly y: number; readonly side: "top" | "right" | "bottom" | "left" };

/** The outer edges of the new-reach area: every side of a new tile whose neighbour is not new. The outline shows where it ends. */
export const beaconExpansionOutline = (
  expansion: BeaconReachExpansion,
  keyFor: (x: number, y: number) => string,
  wrapX: (x: number) => number,
  wrapY: (y: number) => number
): BeaconOutlineEdge[] => {
  const edges: BeaconOutlineEdge[] = [];
  const isNew = (x: number, y: number): boolean => expansion.keys.has(keyFor(wrapX(x), wrapY(y)));
  for (const { x, y } of expansion.tiles) {
    if (!isNew(x, y - 1)) edges.push({ x, y, side: "top" });
    if (!isNew(x + 1, y)) edges.push({ x, y, side: "right" });
    if (!isNew(x, y + 1)) edges.push({ x, y, side: "bottom" });
    if (!isNew(x - 1, y)) edges.push({ x, y, side: "left" });
  }
  return edges;
};

const outlineCache = new WeakMap<BeaconReachExpansion, BeaconOutlineEdge[]>();

/** `beaconExpansionOutline` memoised per expansion (pair with `beaconReachExpansionCached`); `keyFor`/`wrap*` are fixed per client. */
export const beaconExpansionOutlineCached = (
  expansion: BeaconReachExpansion,
  keyFor: (x: number, y: number) => string,
  wrapX: (x: number) => number,
  wrapY: (y: number) => number
): readonly BeaconOutlineEdge[] => {
  let edges = outlineCache.get(expansion);
  if (!edges) {
    edges = beaconExpansionOutline(expansion, keyFor, wrapX, wrapY);
    outlineCache.set(expansion, edges);
  }
  return edges;
};

/** An outline edge's two ends as tile-corner offsets (0 or 1 along x and y from the tile's top-left corner). */
export const OUTLINE_EDGE_CORNERS: Readonly<Record<BeaconOutlineEdge["side"], readonly [readonly [number, number], readonly [number, number]]>> = {
  top: [[0, 0], [1, 0]],
  right: [[1, 0], [1, 1]],
  bottom: [[0, 1], [1, 1]],
  left: [[0, 0], [0, 1]]
};

/** "+23 tiles into reach" for the placement bar; "no new reach" when every tile is already in reach. */
export const beaconNewReachLabel = (count: number): string =>
  count === 0 ? "no new reach" : `+${count} ${count === 1 ? "tile" : "tiles"} into reach`;

export const resetBeaconExpansionClockForTests = (): void => {
  clock = undefined;
  expansionCache = undefined;
  reducedMotionQuery = undefined;
};
