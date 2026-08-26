import { computeReachSetsByOwner } from "../client-reach-overlay-all-owners/client-reach-overlay-all-owners.js";
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
// Prefers the simulation's authoritative, fog-clipped RIVAL_REACH_UPDATE
// data per owner (client-rival-reach-authoritative.ts) over the local guess:
// the local guess isn't clipped against anyone's border, so two owners'
// boundary loops rarely land on the exact shared line the clash-seam
// detector (client-reach-overlay-border-contact.ts) needs. An owner the
// server hasn't pushed anything for yet still falls back to the local guess,
// so a rival never simply disappears while its first push is in flight.

export type OwnedPylonPoint = TileCoord & { ownerId: string };
export type OwnedPylonSegment = { from: TileCoord; to: TileCoord; ownerId: string };

/**
 * Traces boundary pylons/segments for every visible owner OTHER than
 * `myOwnerId` (whose shape the caller already computes separately via the
 * existing single-owner path), tagging each point/segment with its owner so
 * the renderer can color and animate them independently per empire.
 *
 * `serverRivalReach` is the authoritative per-owner set from
 * RIVAL_REACH_UPDATE; an owner present there is traced from that data
 * exclusively, never merged with the local guess (mixing a clipped,
 * authoritative shape with an unclipped guess would reintroduce the same
 * "loops don't line up" problem this whole mechanism exists to fix). An
 * owner NOT present there — the server hasn't sent anything for them yet —
 * still falls back to the local per-owner guess from computeReachSetsByOwner.
 */
export const computeOtherOwnersReachPylons = (
  tiles: ReachOverlayTileMap,
  myOwnerId: string,
  deps: ReachBoundaryDeps,
  keyFor: (x: number, y: number) => string,
  serverRivalReach: ReadonlyMap<string, Set<string>>
): { pylons: OwnedPylonPoint[]; segments: OwnedPylonSegment[] } => {
  const localGuessByOwner = computeReachSetsByOwner(tiles, myOwnerId);
  const pylons: OwnedPylonPoint[] = [];
  const segments: OwnedPylonSegment[] = [];
  const ownerIds = new Set<string>([...localGuessByOwner.keys(), ...serverRivalReach.keys()]);
  for (const ownerId of ownerIds) {
    if (ownerId === myOwnerId) continue;
    const reach = serverRivalReach.get(ownerId) ?? localGuessByOwner.get(ownerId);
    if (!reach) continue;
    const landReach = filterReachToLand(reach, tiles, keyFor);
    if (landReach.size === 0) continue;
    const loops = traceReachBoundaryEdgeLoops(landReach, deps);
    const sampled = samplePerimeterPylons(loops);
    for (const point of sampled.pylons.flat()) pylons.push({ ...point, ownerId });
    for (const segment of sampled.segments.flat()) segments.push({ from: segment.from, to: segment.to, ownerId });
  }
  return { pylons, segments };
};
