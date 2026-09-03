import { isSeaTerrain, tileKey } from "@border-empires/shared";
import { parseTileKey } from "../client-map-3d-utils/client-map-3d-utils.js";
import { tileHasTownIdentity } from "../client-town-identity.js";
import type { Tile } from "../client-types.js";
import {
  tileKeysAroundAnchor,
  type LocalAnchor,
  type LocalLandConnectivityQuery
} from "./client-reach-overlay-anchor-disk.js";

export { tileKeysAroundAnchor, type LocalAnchor, type LocalLandConnectivityQuery };

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

export const OUTPOST_STRUCTURE_TYPES = new Set(["RELAY_BEACON", "SIEGE_OUTPOST", "SIEGE_TOWER", "DREAD_TOWER"]);

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
    // Same detail-payload-vs-lightweight-reference bug the dock anchor had:
    // `tile.town` is the heavy detail object (goldPerMinute, population,
    // etc.), only populated once the client has fetched full detail for
    // that specific tile -- most map tiles never do, including a player's
    // own town if it hasn't been recently viewed. `townType` is the
    // lightweight reference always present regardless of detail level
    // (same convention client-town-identity.ts's townIdentityForTile
    // already uses) -- gating on `tile.town` alone silently zeroed out the
    // single most common reach anchor for smaller empires.
    if (isSettled && tileHasTownIdentity(tile)) anchors.push({ x: tile.x, y: tile.y, kind: "TOWN" });
    // Server-side (runtime.ts's gatherReachAnchors) a dock anchor only ever
    // needs the tile to be an owned dock tile (from the docks registry) --
    // it doesn't require the tile's full economic-detail payload. `tile.dock`
    // is that heavy detail object (goldPerMinute, modifiers, etc.), only
    // populated once the client has fetched full detail for that specific
    // tile -- most map tiles never do, so gating on it here silently dropped
    // almost every real dock anchor. `dockId` is the lightweight reference
    // already present on any dock-linked tile regardless of detail level,
    // matching what the server actually checks.
    if (tile.dockId) anchors.push({ x: tile.x, y: tile.y, kind: "DOCK" });
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
  // Land-gate every anchor's disk to mirror the server (see reach.ts). Unlike
  // the server, the client only has partial map knowledge (fog of war), so
  // an unloaded tile defaults to "assume land" rather than "assume water" --
  // the server's fallback would falsely narrow this preview for perfectly
  // normal unexplored ground, which is worse than the rare case of this
  // preview optimistically including a water tile it hasn't seen yet.
  const isLand: LocalLandConnectivityQuery = (x, y) => {
    const tile = tiles.get(tileKey(x, y));
    return tile ? tile.terrain === "LAND" : true;
  };
  const reach = new Set<string>();
  for (const anchor of anchors) {
    for (const key of tileKeysAroundAnchor(anchor, isLand)) reach.add(key);
  }
  return reach;
};

/**
 * A cheap (single reach-set computation, then O(1) lookups) `isInReach`
 * predicate for `planWaypoint`'s deps (packages/shared/src/waypoint-planner)
 * -- the search calls it once per candidate EXPAND step, so computing the
 * whole reach set fresh on every call would be far too slow.
 */
export const localReachIsInReach = (
  tiles: ReachOverlayTileMap,
  me: string,
  keyFor: (x: number, y: number) => string
): ((x: number, y: number) => boolean) => {
  const reach = computeLocalReachSet(tiles, me);
  return (x: number, y: number): boolean => reach.has(keyFor(x, y));
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
  // Iterates the authoritative `reach` set itself, not `tiles.values()` --
  // fog-of-war means the client's local tile cache lags behind the server's
  // reach grant for ground it hasn't visually revealed yet (e.g. a Relay
  // Beacon's radius extending past the player's current vision). Iterating
  // `tiles` alone silently dropped every such tile from the overlay, since a
  // reach-granted-but-unseen tile was never a candidate for inclusion at all.
  // An unseen tile defaults to "assume land" (same convention
  // `computeLocalReachSet`'s `isLand` uses) rather than being excluded --
  // wrongly showing a border gap here is worse than the rare case of this
  // overlay optimistically including a water tile it hasn't seen yet.
  const filtered = new Set<string>();
  for (const key of reach) {
    const parsed = parseTileKey(key);
    if (!parsed) continue;
    const tile = tiles.get(keyFor(parsed.x, parsed.y));
    if (tile && isSeaTerrain(tile.terrain)) continue;
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

// Perimeter trace (ordered boundary walk) + sparse pylon sampling for the
// Aether Survey Line moved to
// client-reach-overlay-boundary-trace/client-reach-overlay-boundary-trace.ts
// -- a fully self-contained algorithm (grid-corner contour tracing), split
// out to keep this file under the repo's 500-line cap (AGENTS.md). Re-
// exported here so existing call sites importing from this module keep
// working unchanged.
export {
  type TileCoord,
  type CornerCoord,
  traceReachBoundaryEdgeLoops,
  type PylonSegment,
  DEFAULT_PYLON_SPACING_TILES,
  isCornerAt,
  samplePerimeterPylons
} from "../client-reach-overlay-boundary-trace/client-reach-overlay-boundary-trace.js";

// Beacon-placement reach preview (computeOutpostReachPreview,
// drawOutpostReachPreviewTile) moved to
// client-reach-overlay-beacon-preview/client-reach-overlay-beacon-preview.ts
// -- a fully separate concern from this module's authoritative
// reach-boundary rendering, split out to keep this file under the repo's
// 500-line cap (AGENTS.md).
