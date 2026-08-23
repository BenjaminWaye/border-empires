import type { OwnedPylonPoint, OwnedPylonSegment } from "../client-reach-overlay-3d-multi/client-reach-overlay-3d-multi.js";
import type { TileCoord } from "../client-reach-overlay/client-reach-overlay.js";

// A "border contact" seam: a boundary chord that sits on BOTH my reach
// loop's perimeter AND some other owner's reach loop's perimeter (each
// traced independently in client-reach-overlay-3d-multi.ts). Since both
// loops trace the edge between "in this owner's reach" and "not", a chord
// that appears in both owners' traced sets is, by construction, exactly the
// shared edge where the two borders touch -- no separate adjacency geometry
// needed, just an intersection over the two already-computed segment/pylon
// lists. Mirrors the server-side EXPAND-into-a-rival's-reach carve-out
// (runtime-frontier-command.ts's isEnemyBorderContact): this is the client
// render-side view of that same contact condition, used purely for the
// visual treatment (translucent blended border + drifting dust), not for
// any legality decision.

export type BorderContactSegment = { from: TileCoord; to: TileCoord; ownerIdA: string; ownerIdB: string };
export type BorderContactPylon = TileCoord & { ownerIdA: string; ownerIdB: string };

/** Exported so render-loop code can look up membership for an individual
 *  owner-tagged segment/pylon without re-deriving the contact set itself --
 *  see client-map-3d.ts's renderReachOverlay3DPylons. */
export const undirectedSegmentKey = (from: TileCoord, to: TileCoord): string => {
  const a = `${from.x},${from.y}`;
  const b = `${to.x},${to.y}`;
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
};

export const pointKey = (p: TileCoord): string => `${p.x},${p.y}`;

/**
 * Segments that lie on my boundary loop AND on at least one other visible
 * owner's boundary loop -- the seams to render translucent/blended and to
 * seed the dust-particle effect along. `mySegments` and `otherSegments`
 * come straight from client-map-3d.ts's existing reach3DSegments /
 * otherOwnersSegments (already computed every rebuild for the normal
 * pylon-border render), so this is a cheap set-intersection over data that
 * already exists -- no new geometry pass.
 */
export const computeBorderContactSegments = (
  myOwnerId: string,
  mySegments: ReadonlyArray<{ from: TileCoord; to: TileCoord }>,
  otherSegments: ReadonlyArray<OwnedPylonSegment>
): BorderContactSegment[] => {
  const otherByKey = new Map<string, string>(); // undirected chord key -> ownerId (first writer wins, deterministic input order)
  for (const seg of otherSegments) {
    const key = undirectedSegmentKey(seg.from, seg.to);
    if (!otherByKey.has(key)) otherByKey.set(key, seg.ownerId);
  }
  const seen = new Set<string>();
  const out: BorderContactSegment[] = [];
  for (const seg of mySegments) {
    const key = undirectedSegmentKey(seg.from, seg.to);
    const rivalOwnerId = otherByKey.get(key);
    if (!rivalOwnerId || rivalOwnerId === myOwnerId || seen.has(key)) continue;
    seen.add(key);
    out.push({ from: seg.from, to: seg.to, ownerIdA: myOwnerId, ownerIdB: rivalOwnerId });
  }
  return out;
};

/** Same idea as computeBorderContactSegments, for the pylon points at each seam's endpoints. */
export const computeBorderContactPylons = (
  myOwnerId: string,
  myPylons: ReadonlyArray<TileCoord>,
  otherPylons: ReadonlyArray<OwnedPylonPoint>
): BorderContactPylon[] => {
  const otherByKey = new Map<string, string>();
  for (const p of otherPylons) {
    const key = pointKey(p);
    if (!otherByKey.has(key)) otherByKey.set(key, p.ownerId);
  }
  const seen = new Set<string>();
  const out: BorderContactPylon[] = [];
  for (const p of myPylons) {
    const key = pointKey(p);
    const rivalOwnerId = otherByKey.get(key);
    if (!rivalOwnerId || rivalOwnerId === myOwnerId || seen.has(key)) continue;
    seen.add(key);
    out.push({ x: p.x, y: p.y, ownerIdA: myOwnerId, ownerIdB: rivalOwnerId });
  }
  return out;
};
