import { parseTileKey } from "../client-map-3d-utils/client-map-3d-utils.js";
import type { ReachBoundaryDeps } from "../client-reach-overlay/client-reach-overlay.js";

// --- Perimeter trace (sparse pylon placement) ---------------------------
//
// The Aether Survey Line places pylons only every ~10-15 tiles along the
// boundary, connected by chords -- not one marker per boundary tile. That
// requires an ORDERED walk of the boundary, which isReachBoundaryTile alone
// doesn't give: it can only say a tile IS on the boundary, not what order to
// visit boundary points in to draw a coherent line around the territory.
//
// This is an EDGE-based (corner/contour) tracer, not a tile-adjacency walk.
// A tile-adjacency walk (the original implementation here) picks the
// "nearest" unvisited boundary TILE as its next step -- for a region with a
// hole in it (e.g. a lake or mountain carved out of otherwise-contiguous
// reach by filterReachToLand), the outer boundary can pass close enough to
// an unrelated inner hole's boundary that the walk hops from one component
// onto the other, producing a chord that cuts straight across the map. That
// bug is structurally impossible here, because this tracer never asks "what
// tile is near me" -- it only ever follows a literal, real tile-edge that
// exists because one specific tile is in reach and its one specific
// neighbour isn't. Every step is exactly one grid unit long.
//
// Algorithm (standard contour/boundary tracing over grid *corners*, not
// tile centers):
// 1. A tile (x,y) occupies the four corners (x,y), (x+1,y), (x+1,y+1),
//    (x,y+1) -- "corner (x,y)" is tile (x,y)'s top-left grid intersection.
// 2. For every in-reach tile, emit one directed unit edge per out-of-reach
//    cardinal neighbour, in a fixed clockwise convention (reach is always
//    on the right-hand side of the direction of travel):
//      north neighbour out -> edge (x,y) -> (x+1,y)
//      east  neighbour out -> edge (x+1,y) -> (x+1,y+1)
//      south neighbour out -> edge (x+1,y+1) -> (x,y+1)
//      west  neighbour out -> edge (x,y+1) -> (x,y)
// 3. This produces a directed graph over corners where every node's
//    in-degree equals its out-degree (each edge is paired with the tile
//    that emitted it, and the region's boundary is a closed curve by
//    construction), so following "the edge that starts where the previous
//    edge ended" always traces out complete closed loops -- one per
//    connected boundary component, correctly separating an outer boundary
//    from an inner hole's boundary since they never share a directed edge.
// See client-reach-overlay.test.ts for coverage of a square, a notched
// shape, a region with a genuine hole, and two disconnected regions.
export type TileCoord = { readonly x: number; readonly y: number };

/** A grid intersection: corner (x,y) is tile (x,y)'s top-left corner. */
export type CornerCoord = TileCoord;

type DirectedEdge = { readonly from: CornerCoord; readonly to: CornerCoord };

/**
 * Traces the local player's reach boundary as one or more ordered loops
 * (polylines) of grid-corner coordinates, one loop per connected boundary
 * component. See the algorithm comment above. Corner coordinates are the
 * exact position a border marker should stand at -- no edge-offset nudge
 * needed afterward, unlike the old tile-based trace.
 */
export const traceReachBoundaryEdgeLoops = (
  reach: ReadonlySet<string>,
  deps: ReachBoundaryDeps
): CornerCoord[][] => {
  const cornerKey = (c: CornerCoord): string => `${deps.wrapX(c.x)},${deps.wrapY(c.y)}`;
  const outgoingByCorner = new Map<string, DirectedEdge[]>();
  const pushEdge = (from: CornerCoord, to: CornerCoord): void => {
    const key = cornerKey(from);
    const list = outgoingByCorner.get(key);
    const edge = { from, to };
    if (list) list.push(edge);
    else outgoingByCorner.set(key, [edge]);
  };

  // Walks the authoritative `reach` set itself, not `deps.tiles.values()` --
  // see filterReachToLand's doc comment: a tile the server has granted reach
  // over but the client hasn't visually revealed yet (fog of war) would
  // otherwise never emit boundary edges at all, leaving gaps in the traced
  // loop specifically around freshly-explored or still-fogged ground. Edge
  // emission only needs reach-set membership, never the tile's own data.
  let totalEdges = 0;
  for (const key of reach) {
    const parsed = parseTileKey(key);
    if (!parsed) continue;
    const { x, y } = parsed;
    const north = reach.has(deps.keyFor(deps.wrapX(x), deps.wrapY(y - 1)));
    const east = reach.has(deps.keyFor(deps.wrapX(x + 1), deps.wrapY(y)));
    const south = reach.has(deps.keyFor(deps.wrapX(x), deps.wrapY(y + 1)));
    const west = reach.has(deps.keyFor(deps.wrapX(x - 1), deps.wrapY(y)));
    if (!north) {
      pushEdge({ x, y }, { x: x + 1, y });
      totalEdges += 1;
    }
    if (!east) {
      pushEdge({ x: x + 1, y }, { x: x + 1, y: y + 1 });
      totalEdges += 1;
    }
    if (!south) {
      pushEdge({ x: x + 1, y: y + 1 }, { x, y: y + 1 });
      totalEdges += 1;
    }
    if (!west) {
      pushEdge({ x, y: y + 1 }, { x, y });
      totalEdges += 1;
    }
  }

  // Picks (and removes) the unconsumed edge leaving `corner` that best
  // continues the walk. Almost every corner has exactly one candidate. The
  // exception is a "saddle" vertex: two same-owner tiles that touch only
  // diagonally (their other diagonal pair of cells unowned) share exactly
  // one grid corner, so that corner has edges belonging to two otherwise-
  // unrelated tile perimeters. Arbitrary tie-breaking there (e.g. plain
  // insertion order) can send the walk from one tile's perimeter onto the
  // other's, stitching two far-apart boundary pieces into one loop with a
  // long spurious chord between them -- samplePerimeterPylons's distance
  // guard then drops that chord as bogus, leaving two real pylons standing
  // with no segment between them (a visible "gate" in an otherwise
  // unbroken border). Resolving the tie by turn angle -- prefer the
  // sharpest clockwise turn, then straight, then counter-clockwise, then a
  // U-turn as last resort -- is the standard keep-interior-on-the-right
  // rule for square/pixel contour tracing: it always stays on the
  // perimeter of the tile the walk is currently on instead of hopping
  // across the diagonal touch.
  const nextEdgeFrom = (corner: CornerCoord, incoming?: { dx: number; dy: number }): DirectedEdge | undefined => {
    const key = cornerKey(corner);
    const list = outgoingByCorner.get(key);
    if (!list || list.length === 0) return undefined;
    if (list.length === 1 || !incoming) return list.shift();

    let bestIndex = 0;
    let bestScore = Infinity;
    for (let i = 0; i < list.length; i += 1) {
      const candidate = list[i]!;
      const dx = candidate.to.x - candidate.from.x;
      const dy = candidate.to.y - candidate.from.y;
      const cross = incoming.dx * dy - incoming.dy * dx;
      const dot = incoming.dx * dx + incoming.dy * dy;
      // 0 = right turn, 1 = straight, 2 = left turn, 3 = reverse.
      const score = cross > 0 ? 0 : dot > 0 ? 1 : cross < 0 ? 2 : 3;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    return list.splice(bestIndex, 1)[0];
  };

  const loops: CornerCoord[][] = [];
  // Hard cap on total steps across the whole trace so a pathological/
  // corrupt reach set can never spin this forever -- every real step
  // consumes one previously-unconsumed edge, so this is a generous upper
  // bound, not something normal input should approach.
  const maxTotalSteps = totalEdges * 2 + 4;
  let totalSteps = 0;

  for (const [, list] of outgoingByCorner) {
    while (list.length > 0 && totalSteps <= maxTotalSteps) {
      const first = list.shift()!;
      const loop: CornerCoord[] = [first.from];
      let current = first.to;
      loop.push(current);
      totalSteps += 1;
      while (totalSteps <= maxTotalSteps) {
        totalSteps += 1;
        if (cornerKey(current) === cornerKey(first.from)) break;
        const prev = loop[loop.length - 2]!;
        const incoming = { dx: current.x - prev.x, dy: current.y - prev.y };
        const edge = nextEdgeFrom(current, incoming);
        if (!edge) break;
        current = edge.to;
        loop.push(current);
      }
      // Drop the closing vertex (same corner as loop[0]) so downstream
      // consumers see the same "stops just short of repeating the start"
      // shape the old tile-based walk produced.
      if (loop.length > 1 && cornerKey(loop[loop.length - 1]!) === cornerKey(loop[0]!)) loop.pop();
      if (loop.length > 0) loops.push(loop);
    }
  }
  return loops;
};

/** A straight chord connecting two consecutive sampled pylon points along a traced loop. */
export type PylonSegment = { readonly from: TileCoord; readonly to: TileCoord };

// Within the brief's "every 10-15 tiles" range. Documented approximation
// (see the brief): this samples every Nth boundary tile in WALK order, not
// true arc length -- an acceptable stand-in at this scale, since consecutive
// walked tiles are always 4- or 8-adjacent (distance 1 or ~1.41), so walk-
// order spacing and arc-length spacing stay close for the gently curved/
// mostly-straight runs this overlay is meant to draw.
export const DEFAULT_PYLON_SPACING_TILES = 12;

/**
 * True if the walk direction changes between the tile before and the tile
 * after `loop[i]` -- i.e. `loop[i]` is a corner where the boundary turns.
 * A traced loop is a closed ring, so this wraps around at both ends.
 */
export const isCornerAt = (loop: ReadonlyArray<TileCoord>, i: number): boolean => {
  const n = loop.length;
  if (n < 3) return false;
  const prev = loop[(i - 1 + n) % n]!;
  const cur = loop[i]!;
  const next = loop[(i + 1) % n]!;
  return cur.x - prev.x !== next.x - cur.x || cur.y - prev.y !== next.y - cur.y;
};

/**
 * Samples each traced boundary loop into sparse pylon placement points, plus
 * the chord segments connecting consecutive samples (including a closing
 * chord from the last sample back to the first, since a traced loop is
 * conceptually a closed ring even though the walk itself stops just short
 * of re-visiting its own start tile).
 *
 * Every corner tile (`isCornerAt`) is a MANDATORY sample, not just an
 * evenly-spaced one: fixed-interval sampling alone can straddle a notch --
 * e.g. where a town's radius-3 square and a beacon's radius-5 square
 * combine into a concave shape -- and draw a straight chord that cuts
 * across land outside the actual reach, misrepresenting the border. Since
 * the boundary never changes direction *between* two consecutive corners,
 * a chord between them is always an exact match for the true edge there,
 * not an approximation. Long straight runs between corners (more than
 * `spacingTiles` tiles apart) still get extra evenly-spaced pylons filled
 * in, so a long straight edge doesn't go unmarked for a long stretch --
 * this is where the "~10-15 tiles" spacing from the brief actually applies.
 * A loop with no corners at all (a perfectly straight closed ring --
 * geometrically unusual, but not impossible for a tiny/degenerate reach
 * shape) falls back to plain even sampling. A loop with only one sample
 * (tiny/short boundary) yields that single pylon with no segments --
 * nothing to connect it to.
 */
export const samplePerimeterPylons = (
  loops: ReadonlyArray<ReadonlyArray<TileCoord>>,
  spacingTiles: number = DEFAULT_PYLON_SPACING_TILES
): { pylons: TileCoord[][]; segments: PylonSegment[][] } => {
  const step = Math.max(1, Math.floor(spacingTiles));
  const pylons: TileCoord[][] = [];
  const segments: PylonSegment[][] = [];
  for (const loop of loops) {
    const n = loop.length;
    if (n === 0) continue;

    const cornerIndices: number[] = [];
    for (let i = 0; i < n; i += 1) if (isCornerAt(loop, i)) cornerIndices.push(i);

    let sampleIndices: number[];
    if (cornerIndices.length === 0) {
      sampleIndices = [];
      for (let i = 0; i < n; i += step) sampleIndices.push(i);
    } else {
      const chosen = new Set<number>(cornerIndices);
      for (let k = 0; k < cornerIndices.length; k += 1) {
        const a = cornerIndices[k]!;
        const b = cornerIndices[(k + 1) % cornerIndices.length]!;
        const runLength = b > a ? b - a : n - a + b;
        if (runLength <= step) continue;
        const extraCount = Math.floor(runLength / step);
        for (let e = 1; e <= extraCount; e += 1) {
          const idx = (a + e * step) % n;
          if (idx !== b) chosen.add(idx);
        }
      }
      sampleIndices = Array.from(chosen).sort((x, y) => x - y);
    }

    const samples = sampleIndices.map((i) => loop[i]!);
    pylons.push(samples);
    const loopSegments: PylonSegment[] = [];
    if (samples.length > 1) {
      for (let i = 0; i < samples.length; i += 1) {
        const from = samples[i]!;
        const to = samples[(i + 1) % samples.length]!;
        // Sanity cap on real geometric distance, independent of the walk's
        // own index spacing: traceReachBoundaryLoops's walk is a documented
        // greedy approximation (not exact Moore-neighbour contour tracing),
        // and a reach shape with a hole in it (e.g. a lake/river carved out
        // by filterReachToLand) can have its outer boundary pass close to
        // an inner hole's boundary -- the walk can hop onto the wrong
        // component there, producing two walk-adjacent samples that are
        // actually far apart on the map. Two consecutive samples along a
        // clean simple contour are never farther apart (Chebyshev) than
        // their walk-index gap, which is capped at `step`; a real corner-
        // to-corner or spacing-filled run should never exceed that by more
        // than a small constant factor, so reject anything past a generous
        // multiple of it rather than draw a line across half the map.
        const dist = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
        if (dist > step * 3) continue;
        loopSegments.push({ from, to });
      }
    }
    segments.push(loopSegments);
  }
  return { pylons, segments };
};
