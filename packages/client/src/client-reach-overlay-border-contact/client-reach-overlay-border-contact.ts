import type { OwnedPylonPoint, OwnedPylonSegment } from "../client-reach-overlay-3d-multi/client-reach-overlay-3d-multi.js";
import type { TileCoord } from "../client-reach-overlay/client-reach-overlay.js";

// A "border contact" seam: the stretch where my reach loop's perimeter and
// some other owner's reach loop's perimeter run along the same line and
// overlap (each loop traced independently in client-reach-overlay-3d-multi.ts).
// Mirrors the server-side EXPAND-into-a-rival's-reach carve-out
// (runtime-frontier-command.ts's isEnemyBorderContact): this is the client
// render-side view of that same contact condition, used purely for the
// visual treatment (translucent blended border + drifting dust), not for
// any legality decision.
//
// samplePerimeterPylons emits SPARSE segments -- one per straight wall
// stretch between corner turns, not one per tile edge -- so two owners'
// touching walls are essentially never the exact same segment (different
// settled extent, terrain clipping, structure radius, etc. routinely make
// one owner's wall longer or shorter than its neighbor's, even where they
// share a real stretch). Matching on exact endpoint equality therefore
// misses almost every real contact; every reach-boundary segment this
// module receives is axis-aligned (Chebyshev-disk tracing never produces a
// diagonal chord), so instead this treats each segment as a 1D interval on
// its line (same x for a vertical wall, same y for a horizontal one) and
// looks for a genuinely overlapping sub-range between one of my segments
// and one of the other owner's -- the overlap itself, not either original
// segment, is the seam.

export type BorderContactSegment = { from: TileCoord; to: TileCoord; ownerIdA: string; ownerIdB: string };
export type BorderContactPylon = TileCoord & { ownerIdA: string; ownerIdB: string };

/** Exported so render-loop code can look up membership for an individual
 *  owner-tagged segment/pylon without re-deriving the contact set itself --
 *  see client-map-3d.ts's renderReachOverlay3DPylons. Segments are stored
 *  clipped to the actual overlap, so a rendered segment matches this key
 *  only when it exactly IS a contact seam (the pylon/segment render loop
 *  still draws each owner's original, unclipped wall otherwise). */
export const undirectedSegmentKey = (from: TileCoord, to: TileCoord): string => {
  const a = `${from.x},${from.y}`;
  const b = `${to.x},${to.y}`;
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
};

export const pointKey = (p: TileCoord): string => `${p.x},${p.y}`;

type AxisInterval = { axis: "h" | "v"; line: number; lo: number; hi: number };

/** Axis-aligned segment -> {orientation, coordinate of the shared line, range along it}. Null for a degenerate (zero-length) or non-axis-aligned input, neither of which the boundary tracer should ever produce. */
const toAxisInterval = (seg: { from: TileCoord; to: TileCoord }): AxisInterval | null => {
  if (seg.from.y === seg.to.y && seg.from.x !== seg.to.x) {
    return { axis: "h", line: seg.from.y, lo: Math.min(seg.from.x, seg.to.x), hi: Math.max(seg.from.x, seg.to.x) };
  }
  if (seg.from.x === seg.to.x && seg.from.y !== seg.to.y) {
    return { axis: "v", line: seg.from.x, lo: Math.min(seg.from.y, seg.to.y), hi: Math.max(seg.from.y, seg.to.y) };
  }
  return null;
};

const intervalToSegment = (interval: AxisInterval): { from: TileCoord; to: TileCoord } =>
  interval.axis === "h"
    ? { from: { x: interval.lo, y: interval.line }, to: { x: interval.hi, y: interval.line } }
    : { from: { x: interval.line, y: interval.lo }, to: { x: interval.line, y: interval.hi } };

/**
 * Segments where my boundary loop and at least one other visible owner's
 * boundary loop run along the same line with a genuinely overlapping
 * range -- the actual seams to render translucent/blended and to seed the
 * dust-particle effect along. `mySegments` and `otherSegments` come
 * straight from client-map-3d.ts's existing reach3DSegments /
 * otherOwnersSegments (already computed every rebuild for the normal
 * pylon-border render); this is an O(mine × others) scan over those
 * already-sparse lists, not a new geometry pass over tiles.
 */
export const computeBorderContactSegments = (
  myOwnerId: string,
  mySegments: ReadonlyArray<{ from: TileCoord; to: TileCoord }>,
  otherSegments: ReadonlyArray<OwnedPylonSegment>
): BorderContactSegment[] => {
  const others = otherSegments
    .map((seg) => ({ ownerId: seg.ownerId, interval: toAxisInterval(seg) }))
    .filter((entry): entry is { ownerId: string; interval: AxisInterval } => entry.interval !== null && entry.ownerId !== myOwnerId);

  const out: BorderContactSegment[] = [];
  for (const mySeg of mySegments) {
    const mine = toAxisInterval(mySeg);
    if (!mine) continue;
    for (const other of others) {
      if (other.interval.axis !== mine.axis || other.interval.line !== mine.line) continue;
      const lo = Math.max(mine.lo, other.interval.lo);
      const hi = Math.min(mine.hi, other.interval.hi);
      if (hi <= lo) continue; // touching at a single point (or not at all) isn't a seam with any length
      const { from, to } = intervalToSegment({ axis: mine.axis, line: mine.line, lo, hi });
      out.push({ from, to, ownerIdA: myOwnerId, ownerIdB: other.ownerId });
    }
  }
  return out;
};

const isPointOnInterval = (p: TileCoord, interval: AxisInterval): boolean =>
  interval.axis === "h" ? p.y === interval.line && p.x >= interval.lo && p.x <= interval.hi : p.x === interval.line && p.y >= interval.lo && p.y <= interval.hi;

/**
 * True if `segment` (one full rendered wall, e.g. an owner's whole straight
 * stretch between corner turns) touches any of `seams` -- used instead of
 * exact segment-key membership because a seam is CLIPPED to the overlap
 * range, so it will rarely equal either owner's full original wall exactly.
 * The renderer draws one full wall as a single chord (it can't currently
 * split a wall mid-render to recolor only the touching sub-range), so this
 * intentionally answers "does this whole wall touch a rival anywhere",
 * which recolors the entire wall once any part of it is a real seam --
 * simpler to predict for a player ("this stretch of border touches a
 * rival") than a partial-length blend would be.
 */
export const segmentTouchesAnySeam = (from: TileCoord, to: TileCoord, seams: ReadonlyArray<BorderContactSegment>): boolean => {
  const segInterval = toAxisInterval({ from, to });
  if (!segInterval) return false;
  return seams.some((seam) => {
    const seamInterval = toAxisInterval(seam);
    return seamInterval !== null && seamInterval.axis === segInterval.axis && seamInterval.line === segInterval.line && seamInterval.lo < segInterval.hi && segInterval.lo < seamInterval.hi;
  });
};

/**
 * Pylon points that fall on one of `seams`' overlap ranges -- the posts to
 * render translucent/blended alongside the seam's line segment. A pylon
 * only needs to sit somewhere along the shared stretch, not exactly at one
 * of the (now-clipped) seam's own endpoints, so this checks point-on-range
 * rather than reusing the old exact-corner-match approach the segment fix
 * above already made too strict to rely on here as well.
 */
export const computeBorderContactPylons = (
  myOwnerId: string,
  myPylons: ReadonlyArray<TileCoord>,
  otherPylons: ReadonlyArray<OwnedPylonPoint>,
  seams: ReadonlyArray<BorderContactSegment>
): BorderContactPylon[] => {
  const intervals = seams.map((seam) => toAxisInterval(seam)).filter((interval): interval is AxisInterval => interval !== null);
  const onAnySeam = (p: TileCoord): boolean => intervals.some((interval) => isPointOnInterval(p, interval));

  const seen = new Set<string>();
  const out: BorderContactPylon[] = [];
  const otherByOwner = otherPylons.filter((p) => p.ownerId !== myOwnerId);
  for (const p of [...myPylons.map((p) => ({ ...p, ownerId: myOwnerId })), ...otherByOwner]) {
    const key = pointKey(p);
    if (seen.has(key) || !onAnySeam(p)) continue;
    seen.add(key);
    const seam = seams.find((s) => isPointOnInterval(p, toAxisInterval(s)!));
    if (!seam) continue;
    out.push({ x: p.x, y: p.y, ownerIdA: seam.ownerIdA, ownerIdB: seam.ownerIdB });
  }
  return out;
};
