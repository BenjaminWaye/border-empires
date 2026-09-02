import { computeReachSetsByOwnerFromWire } from "../client-reach-overlay-all-owners/client-reach-overlay-all-owners.js";
import {
  filterReachToLand,
  samplePerimeterPylons,
  traceReachBoundaryEdgeLoops,
  type ReachBoundaryDeps,
  type ReachOverlayTileMap,
  type TileCoord
} from "../client-reach-overlay/client-reach-overlay.js";

// Fans traceReachBoundaryEdgeLoops/samplePerimeterPylons (built for a single
// "my reach" set) out over every OTHER visible owner's reach too, so the 3D
// map can draw AI/enemy border pylons alongside your own — previously the
// pylon overlay only ever rendered `deps.state.me`'s border at all, which
// read as "AI border pylons don't show" even though nothing was actually
// broken: there was simply no code path that ever computed anyone else's
// shape. Kept out of client-map-3d.ts (already well over the repo's
// 500-line file cap) and client-reach-overlay.ts (same) as a separate,
// focused module.
//
// Reads every owner's reach straight off tile.reachOwnerId
// (computeReachSetsByOwnerFromWire) rather than guessing it from a plain
// union of anchor-radius disks. That guess was never clipped against
// anyone's border, so two owners' boundary loops rarely landed on the exact
// shared line the clash-seam detector (client-reach-overlay-border-contact.ts)
// needs — they either didn't touch (no seam) or visibly crossed (the
// original border-crossing bug this replaced). reachOwnerId is already
// contest-resolved server-side (one owner per tile), so it can't disagree
// with itself the way two independently-guessed shapes could.

export type OwnedPylonPoint = TileCoord & { ownerId: string };
export type OwnedPylonSegment = { from: TileCoord; to: TileCoord; ownerId: string };

/**
 * Traces boundary pylons/segments for every visible owner OTHER than
 * `myOwnerId` (whose shape the caller already computes separately via the
 * existing single-owner path), tagging each point/segment with its owner so
 * the renderer can color and animate them independently per empire.
 */
export const computeOtherOwnersReachPylons = (
  tiles: ReachOverlayTileMap,
  myOwnerId: string,
  deps: ReachBoundaryDeps,
  keyFor: (x: number, y: number) => string
): { pylons: OwnedPylonPoint[]; segments: OwnedPylonSegment[] } => {
  const reachByOwner = computeReachSetsByOwnerFromWire(tiles, myOwnerId);
  const pylons: OwnedPylonPoint[] = [];
  const segments: OwnedPylonSegment[] = [];
  for (const [ownerId, reach] of reachByOwner) {
    const landReach = filterReachToLand(reach, tiles, keyFor);
    if (landReach.size === 0) continue;
    const loops = traceReachBoundaryEdgeLoops(landReach, deps);
    const sampled = samplePerimeterPylons(loops);
    for (const point of sampled.pylons.flat()) pylons.push({ ...point, ownerId });
    for (const segment of sampled.segments.flat()) segments.push({ from: segment.from, to: segment.to, ownerId });
  }
  return { pylons, segments };
};
