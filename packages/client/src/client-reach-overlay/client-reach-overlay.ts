import { isSeaTerrain, tileKey, WORLD_HEIGHT, WORLD_WIDTH, type ReachAnchorKind } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

// Fixed-borders-via-reach client overlay. Renders the boundary of the local
// player's reach set (union of radius disks from towns/outposts/docks — see
// packages/shared/src/reach/reach.ts for the authoritative server-side
// definition) distinctly from the plain owned-tile fill/border drawn by
// client-tile-borders.ts, plus a dormant-frontier tile treatment and
// out-of-reach dimming for visible-but-unreachable neutral/enemy tiles.
//
// ---------------------------------------------------------------------------
// MOCK-DATA SEAM (read this before wiring up live server data):
//
// The server does not yet push a reach payload over the gateway socket. Until
// it does, `computeLocalReachSet` below derives an approximate reach set
// entirely from tiles the client already has in `state.tiles` (scanning for
// this player's own town/outpost/dock tiles and unioning their radius disks
// with the same `tileKeysInReach`-equivalent math as the server). This is NOT
// authoritative — it can't see contested-tile clipping against other
// players' anchors (that requires the server's global anchor resolution) —
// but it exercises the exact same rendering path real data will use, so the
// visual logic here is real and testable today.
//
// One-line wire-up once the server sends reach data: replace the call to
// `computeLocalReachSet(...)` at the overlay's call site
// (packages/client/src/client-runtime-loop.ts, near the
// `drawTileOwnershipAndBreachBorder` call) with `state.myReach` populated
// from a new gateway message. Guessed shape, modeled on how
// `client-gateway-sync.ts`'s `applyGatewayTileDeltaBatch` shapes tile deltas
// (array of plain-object deltas, applied incrementally): a message named
// something like `{ type: "REACH_UPDATE", tileKeys: string[] }` (full
// replacement, since reach recomputes incrementally server-side on
// settle/unsettle/beacon build-destroy — same cadence as tile deltas) handled
// by a new `applyGatewayReachUpdate(deps, msg)` in client-gateway-sync.ts
// that does `deps.state.myReach = new Set(msg.tileKeys)`. Until that
// message exists, this module's mock computation is the seam.
// ---------------------------------------------------------------------------

export type ReachOverlayTileMap = ReadonlyMap<string, Tile>;

const OUTPOST_STRUCTURE_TYPES = new Set(["RELAY_BEACON", "SIEGE_OUTPOST", "SIEGE_TOWER", "DREAD_TOWER"]);

type LocalAnchor = { x: number; y: number; kind: ReachAnchorKind };

const REACH_RADIUS_BY_KIND: Record<ReachAnchorKind, number> = {
  TOWN: 3,
  OUTPOST: 5,
  DOCK: 1
};

/** Every wrapped tile key within an anchor's radius, inclusive of its own tile. */
const tileKeysAroundAnchor = (anchor: LocalAnchor): string[] => {
  const radius = REACH_RADIUS_BY_KIND[anchor.kind];
  const keys: string[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const x = ((anchor.x + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
      const y = ((anchor.y + dy) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
      keys.push(tileKey(x, y));
    }
  }
  return keys;
};

/**
 * Scans currently-known tiles for this player's own reach anchors (towns,
 * outpost-family structures, docks) and unions their radius disks. See the
 * MOCK-DATA SEAM comment above — this is a client-local approximation, not
 * the authoritative clipped reach the server computes.
 */
export const computeLocalReachSet = (tiles: ReachOverlayTileMap, me: string): Set<string> => {
  const anchors: LocalAnchor[] = [];
  for (const tile of tiles.values()) {
    if (tile.ownerId !== me) continue;
    // Mirrors the server's ownershipState gate (runtime.ts's
    // gatherReachAnchors): a dormant/unsettled tile keeps its town/outpost
    // fields but must not count as a live reach anchor, or this preview
    // would overstate reach for previously-overtaken ground. Docks are
    // deliberately left ungated, same rationale as server-side.
    const isSettled = tile.ownershipState === "SETTLED";
    if (isSettled && tile.town) anchors.push({ x: tile.x, y: tile.y, kind: "TOWN" });
    if (tile.dock) anchors.push({ x: tile.x, y: tile.y, kind: "DOCK" });
    const outpostType = tile.economicStructure?.type;
    const isActiveOutpostEconomic =
      isSettled &&
      tile.economicStructure?.ownerId === me &&
      tile.economicStructure?.status === "active" &&
      outpostType !== undefined &&
      OUTPOST_STRUCTURE_TYPES.has(outpostType);
    const isActiveSiegeOutpost = isSettled && tile.siegeOutpost?.ownerId === me && tile.siegeOutpost?.status === "active";
    if (isActiveOutpostEconomic || isActiveSiegeOutpost) anchors.push({ x: tile.x, y: tile.y, kind: "OUTPOST" });
  }
  const reach = new Set<string>();
  for (const anchor of anchors) {
    for (const key of tileKeysAroundAnchor(anchor)) reach.add(key);
  }
  return reach;
};

/**
 * Excludes water tiles (SEA/COASTAL_SEA) from a reach set. Reach itself is a
 * purely geometric radius (see `computeLocalReachSet` above) with no
 * terrain awareness -- a coastal town/beacon's radius disk legitimately
 * extends out over open water. That's fine for the underlying permission
 * (you still can't EXPAND onto a sea tile; that's a separate, existing
 * terrain check in validateFrontierCommand server-side), but a border
 * boundary trace or a row of survey pylons drawn out into the sea reads as
 * a bug, not a design choice. Apply this to whatever reach set feeds the
 * VISUAL boundary (traceReachBoundaryLoops / the reach-boundary line), not
 * to gameplay legality checks.
 */
export const filterReachToLand = (
  reach: ReadonlySet<string>,
  tiles: ReachOverlayTileMap,
  keyFor: (x: number, y: number) => string
): Set<string> => {
  const filtered = new Set<string>();
  for (const tile of tiles.values()) {
    const key = keyFor(tile.x, tile.y);
    if (!reach.has(key)) continue;
    if (isSeaTerrain(tile.terrain)) continue;
    filtered.add(key);
  }
  return filtered;
};

/**
 * True for a FRONTIER tile that still carries a leftover structure from
 * before it was unsettled (destroyed/captured beacon etc. — see the reach
 * plan's unsettle transition). Distinguishes "previously mine, still has a
 * building, currently dormant" from ordinary virgin FRONTIER land.
 */
export const isDormantFrontierTile = (tile: Tile | undefined): boolean => {
  if (!tile || tile.ownershipState !== "FRONTIER") return false;
  return Boolean(tile.fort || tile.observatory || tile.economicStructure || tile.siegeOutpost);
};

// --- Rendering ---------------------------------------------------------

export type ReachBoundaryDeps = {
  tiles: ReachOverlayTileMap;
  keyFor: (x: number, y: number) => string;
  wrapX: (value: number) => number;
  wrapY: (value: number) => number;
};

/** True when this tile is in-reach but at least one neighbour is not — i.e. it sits on the reach boundary. */
export const isReachBoundaryTile = (
  x: number,
  y: number,
  reach: ReadonlySet<string>,
  deps: ReachBoundaryDeps
): boolean => {
  if (!reach.has(deps.keyFor(x, y))) return false;
  const neighbours = [
    deps.keyFor(deps.wrapX(x), deps.wrapY(y - 1)),
    deps.keyFor(deps.wrapX(x + 1), deps.wrapY(y)),
    deps.keyFor(deps.wrapX(x), deps.wrapY(y + 1)),
    deps.keyFor(deps.wrapX(x - 1), deps.wrapY(y))
  ];
  return neighbours.some((key) => !reach.has(key));
};

/** Which of a boundary tile's 4 cardinal neighbours are themselves out of reach. */
export type ReachEdges = {
  readonly top: boolean;
  readonly right: boolean;
  readonly bottom: boolean;
  readonly left: boolean;
};

/** Computes a tile's `ReachEdges` against the given reach set. */
export const reachEdgesForTile = (x: number, y: number, reach: ReadonlySet<string>, deps: ReachBoundaryDeps): ReachEdges => ({
  top: !reach.has(deps.keyFor(deps.wrapX(x), deps.wrapY(y - 1))),
  right: !reach.has(deps.keyFor(deps.wrapX(x + 1), deps.wrapY(y))),
  bottom: !reach.has(deps.keyFor(deps.wrapX(x), deps.wrapY(y + 1))),
  left: !reach.has(deps.keyFor(deps.wrapX(x - 1), deps.wrapY(y)))
});

// Just shy of a full half-tile (0.5) so a marker sits right on the tile
// boundary line itself without its base geometry clipping through the
// neighbouring tile's ground plane.
const PYLON_EDGE_OFFSET_AMOUNT = 0.42;

/**
 * A border marker (pylon, sentry, whatever the current 3D overlay design
 * calls it) should stand on the line between the owned tile and its
 * out-of-reach neighbour, the way a real border post stands on the border,
 * not in the middle of a field. Pure function: sums an outward unit push
 * toward every active edge and returns the (unnormalized) offset to add to
 * the tile-center position, landing the marker almost exactly on that edge
 * (or, for a corner tile with two active edges, on the tile's corner
 * vertex where both edges meet).
 *
 * Reach borders never overlap between players (each tile is clipped to at
 * most one owner), so an enemy's boundary markers can sit on the tile
 * directly across the line from yours -- each side's posts standing right
 * at their own edge is exactly what should make a contested border read as
 * two real, distinct claims facing off, not two rows merged into one.
 */
export const pylonEdgeOffset = (edges: ReachEdges): { readonly dx: number; readonly dz: number } => {
  // Applied independently per axis (not a combined vector normalized to a
  // fixed length) so a corner tile actually lands on the tile's corner
  // vertex: normalizing a 2-edge diagonal to PYLON_EDGE_OFFSET_AMOUNT would
  // only reach ~0.3 units per axis (0.42/sqrt(2)) instead of the ~0.42 each
  // axis gets here, visibly undershooting the real corner.
  let dx = 0;
  let dz = 0;
  if (edges.top) dz -= PYLON_EDGE_OFFSET_AMOUNT; // north neighbour is out of reach -> push north (-z), onto that edge
  if (edges.bottom) dz += PYLON_EDGE_OFFSET_AMOUNT;
  if (edges.left) dx -= PYLON_EDGE_OFFSET_AMOUNT; // west neighbour is out of reach -> push west (-x), onto that edge
  if (edges.right) dx += PYLON_EDGE_OFFSET_AMOUNT;
  return { dx, dz };
};

const REACH_BOUNDARY_COLOR = "rgba(255, 245, 190, 0.85)";
const REACH_BOUNDARY_DASH: [number, number] = [4, 3];
const OUT_OF_REACH_HATCH_COLOR = "rgba(10, 12, 18, 0.28)";
const DORMANT_FRONTIER_FILL = "rgba(120, 96, 58, 0.22)";
const DORMANT_FRONTIER_STROKE = "rgba(214, 178, 110, 0.6)";

/**
 * Draws the dashed reach-boundary line around a tile that sits on the edge
 * of the player's reach set. Distinct treatment from the solid ownership
 * border in client-tile-borders.ts (dashed, warm gold) so "owned" and
 * "reach edge" never read as the same line.
 */
export const drawReachBoundaryLine = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  px: number,
  py: number,
  size: number,
  reach: ReadonlySet<string>,
  deps: ReachBoundaryDeps
): void => {
  if (!isReachBoundaryTile(x, y, reach, deps)) return;
  const x1 = px + 1.5;
  const y1 = py + 1.5;
  const x2 = px + size - 1.5;
  const y2 = py + size - 1.5;
  ctx.save();
  ctx.strokeStyle = REACH_BOUNDARY_COLOR;
  ctx.lineWidth = Math.max(1, size * 0.06);
  ctx.setLineDash(REACH_BOUNDARY_DASH);
  const top = !reach.has(deps.keyFor(deps.wrapX(x), deps.wrapY(y - 1)));
  const right = !reach.has(deps.keyFor(deps.wrapX(x + 1), deps.wrapY(y)));
  const bottom = !reach.has(deps.keyFor(deps.wrapX(x), deps.wrapY(y + 1)));
  const left = !reach.has(deps.keyFor(deps.wrapX(x - 1), deps.wrapY(y)));
  ctx.beginPath();
  if (top) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y1);
  }
  if (right) {
    ctx.moveTo(x2, y1);
    ctx.lineTo(x2, y2);
  }
  if (bottom) {
    ctx.moveTo(x2, y2);
    ctx.lineTo(x1, y2);
  }
  if (left) {
    ctx.moveTo(x1, y2);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
  ctx.restore();
};

/**
 * Dims/hatches a visible tile that lies outside the player's reach — reads
 * as "you can see this, but EXPAND/SETTLE would fail here" before the
 * player even attempts the action.
 */
export const drawOutOfReachDimming = (
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number
): void => {
  ctx.save();
  ctx.fillStyle = OUT_OF_REACH_HATCH_COLOR;
  ctx.fillRect(px, py, size, size);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  const step = Math.max(4, size / 4);
  ctx.beginPath();
  for (let offset = -size; offset < size * 2; offset += step) {
    ctx.moveTo(px + offset, py + size);
    ctx.lineTo(px + offset + size, py);
  }
  ctx.clip(new Path2D(`M${px} ${py} h${size} v${size} h${-size} Z`));
  ctx.stroke();
  ctx.restore();
};

/** Fill + outline treatment for a dormant-frontier tile (owned, FRONTIER, still holds structures from before an unsettle). */
export const drawDormantFrontierTreatment = (
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number
): void => {
  ctx.save();
  ctx.fillStyle = DORMANT_FRONTIER_FILL;
  ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
  ctx.strokeStyle = DORMANT_FRONTIER_STROKE;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3);
  ctx.restore();
};

// --- Perimeter walk (sparse pylon placement) ---------------------------
//
// The Aether Survey Line places pylons only every ~10-15 tiles along the
// boundary, connected by chords -- not one marker per boundary tile. That
// requires an ORDERED walk of the boundary (a "trace the perimeter" /
// marching-squares-adjacent problem), which isReachBoundaryTile alone
// doesn't give: it can only say a tile IS on the boundary, not what order
// to visit boundary tiles in to draw a coherent line around the territory.
//
// Algorithm (greedy 8-connected walk, documented approximation):
// 1. Collect every boundary tile (via isReachBoundaryTile) from the tiles
//    currently known to the client.
// 2. Repeatedly pick an unvisited boundary tile as the start of a new loop,
//    then walk: from the current tile, scan its 8 neighbours in a fixed
//    clockwise order and step to the first unvisited boundary neighbour
//    found. Mark every tile visited as it's added to the loop. When no
//    unvisited boundary neighbour remains, that loop ends.
// 3. Repeat until every boundary tile has been visited, yielding one loop
//    per connected boundary component (so multiple disconnected owned
//    regions, or a region with a hole, naturally produce multiple loops).
//
// This is a greedy nearest-neighbour trace, not a topologically exact
// contour-following algorithm (e.g. Moore-neighbour boundary tracing with
// proper "came from" bookkeeping) -- it can occasionally take a locally
// reasonable but globally sub-optimal step around a sharp notch. That's an
// acceptable trade at this scale: every boundary tile is still visited
// exactly once, the walk always terminates (visited-set + hard iteration
// cap prevent any infinite loop), and consecutive tiles in the resulting
// loop are always adjacent (4- or 8-connected), so a sampled polyline
// through it still reads as "roughly the boundary shape" even on an
// irregular/notched territory. See client-reach-overlay.test.ts for
// coverage of a square, a notched shape, and two disconnected regions.
export type TileCoord = { readonly x: number; readonly y: number };

// Clockwise starting from north, so straight runs get walked in a
// consistent rotational preference rather than zig-zagging.
const BOUNDARY_WALK_NEIGHBOURS: ReadonlyArray<TileCoord> = [
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 }
];

/**
 * Traces the local player's reach boundary as one or more ordered loops
 * (polylines) of tile coordinates, one loop per connected boundary
 * component. See the algorithm comment above for the walk strategy and its
 * documented limitations.
 */
export const traceReachBoundaryLoops = (
  reach: ReadonlySet<string>,
  deps: ReachBoundaryDeps
): TileCoord[][] => {
  const byKey = new Map<string, TileCoord>();
  for (const tile of deps.tiles.values()) {
    if (!isReachBoundaryTile(tile.x, tile.y, reach, deps)) continue;
    const key = deps.keyFor(tile.x, tile.y);
    if (!byKey.has(key)) byKey.set(key, { x: tile.x, y: tile.y });
  }

  const visited = new Set<string>();
  const loops: TileCoord[][] = [];
  // Hard cap on total steps across the whole trace (not per-loop) so a
  // pathological/corrupt reach set can never spin this forever -- every
  // real step marks a previously-unvisited tile visited, so this is a very
  // generous upper bound, not something normal input should approach.
  const maxTotalSteps = byKey.size * 2 + 4;
  let totalSteps = 0;

  for (const start of byKey.values()) {
    const startKey = deps.keyFor(start.x, start.y);
    if (visited.has(startKey)) continue;
    const loop: TileCoord[] = [];
    let current: TileCoord | undefined = start;
    while (current && totalSteps <= maxTotalSteps) {
      totalSteps += 1;
      const currentKey = deps.keyFor(current.x, current.y);
      if (visited.has(currentKey)) break;
      visited.add(currentKey);
      loop.push(current);
      let next: TileCoord | undefined;
      for (const offset of BOUNDARY_WALK_NEIGHBOURS) {
        const nx = deps.wrapX(current.x + offset.x);
        const ny = deps.wrapY(current.y + offset.y);
        const nKey = deps.keyFor(nx, ny);
        const candidate = byKey.get(nKey);
        if (candidate && !visited.has(nKey)) {
          next = candidate;
          break;
        }
      }
      current = next;
    }
    if (loop.length > 0) loops.push(loop);
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

// --- Beacon-placement reach preview ------------------------------------

/**
 * Ghost preview of the reach disk a not-yet-built outpost-family structure
 * (RELAY_BEACON etc.) would add, so beacon siting is an informed spatial
 * choice. `centerX`/`centerY` are the candidate placement tile's world
 * coords; call once per candidate tile while the structure-placement UI has
 * a pending selection (see client-action-flow.ts's structure placement
 * flow for where a pending build target is tracked).
 */
export const computeOutpostReachPreview = (centerX: number, centerY: number): Set<string> => {
  const reach = new Set<string>();
  for (const key of tileKeysAroundAnchor({ x: centerX, y: centerY, kind: "OUTPOST" })) reach.add(key);
  return reach;
};

const PREVIEW_BOUNDARY_COLOR = "rgba(150, 220, 255, 0.9)";

export const drawOutpostReachPreviewTile = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  px: number,
  py: number,
  size: number,
  preview: ReadonlySet<string>,
  deps: ReachBoundaryDeps
): void => {
  if (!preview.has(deps.keyFor(x, y))) return;
  ctx.save();
  ctx.fillStyle = "rgba(150, 220, 255, 0.10)";
  ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
  const top = !preview.has(deps.keyFor(deps.wrapX(x), deps.wrapY(y - 1)));
  const right = !preview.has(deps.keyFor(deps.wrapX(x + 1), deps.wrapY(y)));
  const bottom = !preview.has(deps.keyFor(deps.wrapX(x), deps.wrapY(y + 1)));
  const left = !preview.has(deps.keyFor(deps.wrapX(x - 1), deps.wrapY(y)));
  if (top || right || bottom || left) {
    ctx.strokeStyle = PREVIEW_BOUNDARY_COLOR;
    ctx.lineWidth = Math.max(1, size * 0.07);
    ctx.setLineDash([3, 2]);
    const x1 = px + 1.5;
    const y1 = py + 1.5;
    const x2 = px + size - 1.5;
    const y2 = py + size - 1.5;
    ctx.beginPath();
    if (top) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y1);
    }
    if (right) {
      ctx.moveTo(x2, y1);
      ctx.lineTo(x2, y2);
    }
    if (bottom) {
      ctx.moveTo(x2, y2);
      ctx.lineTo(x1, y2);
    }
    if (left) {
      ctx.moveTo(x1, y2);
      ctx.lineTo(x1, y1);
    }
    ctx.stroke();
  }
  ctx.restore();
};
