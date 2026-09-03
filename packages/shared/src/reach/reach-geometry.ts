import { DOCK_REACH_RADIUS, OUTPOST_REACH_RADIUS, TOWN_REACH_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";

// Pure geometry/anchor-shape building blocks for reach.ts, split out to keep
// that file under the 500-line cap. See reach.ts's module doc comment for the
// overall fixed-border reach model these helpers support.

export type ReachAnchorKind = "TOWN" | "OUTPOST" | "DOCK";

export type ReachAnchor = {
  x: number;
  y: number;
  ownerId: string;
  /** Event-ordering timestamp. Used only to order processing deterministically. */
  activatedAt: number;
  kind: ReachAnchorKind;
  /**
   * Overrides reachRadiusForKind's kind-based radius for this specific
   * anchor instance. Used by the Aether Bridge landing grant, which reuses
   * "OUTPOST" kind semantics (a one-shot grant, not a persistent structure)
   * but at a smaller radius than OUTPOST_REACH_RADIUS.
   */
  radiusOverride?: number;
  /**
   * Opts this specific anchor OUT of land-gating even when a caller passes a
   * `LandConnectivityQuery` to tileKeysInReach/grantAnchorToBorder/etc — its
   * disk stays pure Chebyshev geometry, free to spread across water. Used by
   * the Aether Bridge landing grant (and any other explicitly water-crossing
   * ability): its entire purpose is to bridge reach across water without a
   * land connection, so it must be exempt from the land-connectivity
   * requirement normal TOWN/OUTPOST/DOCK anchors are gated on.
   */
  crossesWater?: boolean;
};

/** Answers "is the tile at this world position LAND terrain?" for land-gating a reach disk. */
export type LandConnectivityQuery = (x: number, y: number) => boolean;

export const reachRadiusForKind = (kind: ReachAnchorKind): number => {
  if (kind === "TOWN") return TOWN_REACH_RADIUS;
  if (kind === "DOCK") return DOCK_REACH_RADIUS;
  return OUTPOST_REACH_RADIUS; // OUTPOST: RELAY_BEACON, SIEGE_OUTPOST, SIEGE_TOWER, DREAD_TOWER
};

export const reachRadiusForAnchor = (anchor: ReachAnchor): number =>
  anchor.radiusOverride ?? reachRadiusForKind(anchor.kind);

export const wrapCoord = (v: number, size: number): number => ((v % size) + size) % size;

export const tileKey = (x: number, y: number): string => `${x},${y}`;

/** Wrapped Chebyshev distance between two world positions. */
export const chebyshevWithWrap = (ax: number, ay: number, bx: number, by: number): number => {
  const dxRaw = Math.abs(ax - bx);
  const dyRaw = Math.abs(ay - by);
  const dx = Math.min(dxRaw, WORLD_WIDTH - dxRaw);
  const dy = Math.min(dyRaw, WORLD_HEIGHT - dyRaw);
  return Math.max(dx, dy);
};

/** 8-neighbor coordinate offsets, matching encirclement.ts's adjacency convention. */
const REACH_NEIGHBOR_OFFSETS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: -1, dy: -1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: -1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: 1, dy: 1 }
];

/**
 * The 8 wrapped neighbor keys of `key` (diagonals included). Shared adjacency
 * primitive for any BFS/flood-fill walking the tile grid outside a single
 * anchor's disk (e.g. encirclement connectivity, the stranded-settled-tile
 * sweep) -- keeps every such walk using the exact same wrap-and-offset
 * convention as the reach disks above instead of re-deriving it per caller.
 */
export const neighborTileKeys = (key: string): string[] => {
  const [xStr, yStr] = key.split(",");
  const x = Number(xStr);
  const y = Number(yStr);
  return REACH_NEIGHBOR_OFFSETS.map(({ dx, dy }) => tileKey(wrapCoord(x + dx, WORLD_WIDTH), wrapCoord(y + dy, WORLD_HEIGHT)));
};

/**
 * Land-gated variant of the disk: a tile within `radius` of the anchor only
 * counts as in-reach if it is reachable from the anchor's own tile via a
 * path of LAND tiles (8-connected), staying within the radius throughout —
 * water can never be a stepping-stone that extends reach onto land past it.
 * A water tile itself IS still included when it's directly adjacent to a
 * reached land tile (or is the anchor's own tile) — coastal edges are fine,
 * they just can't propagate further. Same O(radius²) bound as the pure
 * geometric disk: the BFS never leaves the anchor's local bounding box.
 *
 * Exported (not just used internally by `tileKeysInReach`) so client-side
 * reach previews (`computeLocalReachSet`) can share this exact algorithm
 * instead of re-implementing it against `Tile.terrain` — keeping client
 * and server/shared reach predictions in sync by construction.
 */
export const landGatedTileKeysInDisk = (
  anchorX: number,
  anchorY: number,
  radius: number,
  isLand: LandConnectivityQuery
): string[] => {
  const ax = wrapCoord(anchorX, WORLD_WIDTH);
  const ay = wrapCoord(anchorY, WORLD_HEIGHT);
  const included = new Set<string>([tileKey(ax, ay)]);
  const visited = new Set<string>([tileKey(ax, ay)]);
  const queue: Array<{ x: number; y: number }> = [{ x: ax, y: ay }];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head]!;
    head += 1;
    for (const { dx, dy } of REACH_NEIGHBOR_OFFSETS) {
      const nx = wrapCoord(current.x + dx, WORLD_WIDTH);
      const ny = wrapCoord(current.y + dy, WORLD_HEIGHT);
      if (chebyshevWithWrap(ax, ay, nx, ny) > radius) continue;
      const nk = tileKey(nx, ny);
      if (visited.has(nk)) continue;
      visited.add(nk);
      included.add(nk);
      // Only propagate the BFS through LAND tiles -- a water tile is still
      // included (coastal edge) but never used as a stepping-stone onward.
      if (isLand(nx, ny)) queue.push({ x: nx, y: ny });
    }
  }
  return [...included];
};

/**
 * Every wrapped tile key within `anchor`'s radius (inclusive), including the
 * anchor's own tile. Iterates only the anchor's local bounding box, not the
 * world grid, so cost is O(radius²) per anchor regardless of world size.
 *
 * When `landConnectivity` is supplied AND the anchor is not marked
 * `crossesWater`, the disk is additionally gated to tiles land-connected to
 * the anchor within the radius (see `landGatedTileKeysInDisk`). Omitting
 * `landConnectivity` (the default) keeps the pure geometric disk — every
 * existing caller that doesn't pass it is unaffected.
 */
export const tileKeysInReach = (anchor: ReachAnchor, landConnectivity?: LandConnectivityQuery): string[] => {
  const radius = reachRadiusForAnchor(anchor);
  if (landConnectivity && !anchor.crossesWater) {
    return landGatedTileKeysInDisk(anchor.x, anchor.y, radius, landConnectivity);
  }
  const keys: string[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const x = wrapCoord(anchor.x + dx, WORLD_WIDTH);
      const y = wrapCoord(anchor.y + dy, WORLD_HEIGHT);
      keys.push(tileKey(x, y));
    }
  }
  return keys;
};
