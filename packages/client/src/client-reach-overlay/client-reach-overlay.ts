import { isSeaTerrain, tileKey } from "@border-empires/shared";
import { parseTileKey } from "../client-map-3d-utils/client-map-3d-utils.js";
import type { Tile } from "../client-types.js";
import {
  tileKeysAroundAnchor,
  type LocalAnchor,
  type LocalLandConnectivityQuery
} from "./client-reach-overlay-anchor-disk.js";
import { localAnchorsForTile, OUTPOST_STRUCTURE_TYPES } from "./client-reach-overlay-anchors.js";

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

export { OUTPOST_STRUCTURE_TYPES };

/**
 * Scans currently-known tiles for this player's own reach anchors (towns,
 * outpost-family structures, docks) and unions their radius disks. See the
 * MOCK-DATA SEAM comment above — this is a client-local approximation, not
 * the authoritative clipped reach the server computes.
 */
export const computeLocalReachSet = (tiles: ReachOverlayTileMap, me: string): Set<string> => {
  const anchors: LocalAnchor[] = [];
  for (const tile of tiles.values()) {
    if (tile.ownerId === me) anchors.push(...localAnchorsForTile(tile));
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
  return Boolean(tile.fort || tile.observatory || tile.economicStructure || tile.siegeBattery);
};

// --- Rendering ---------------------------------------------------------

export type ReachBoundaryDeps = {
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

// White core over an owner-coloured sheath -- the 2D twin of the 3D own-border
// emphasis (client-reach-border-emphasis.ts). Not gold: gold is the fog edge.
const REACH_BOUNDARY_CORE_COLOR = "rgba(255, 255, 255, 0.92)";
const REACH_BOUNDARY_SHEATH_ALPHA = 0.85;
const DORMANT_FRONTIER_FILL = "rgba(120, 96, 58, 0.22)";
const DORMANT_FRONTIER_STROKE = "rgba(214, 178, 110, 0.6)";

/**
 * Draws the reach-boundary line around a tile that sits on the edge of the
 * player's own reach set: a wide stroke in the player's colour with a thin
 * white core on top, so "my border" reads as mine at a glance and never
 * matches the solid ownership border (client-tile-borders.ts) or the gold
 * fog edge. Only the viewer's own reach is drawn in 2D.
 */
export const drawReachBoundaryLine = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  px: number,
  py: number,
  size: number,
  reach: ReadonlySet<string>,
  ownerColor: string,
  deps: ReachBoundaryDeps
): void => {
  if (!isReachBoundaryTile(x, y, reach, deps)) return;
  const x1 = px + 1.5;
  const y1 = py + 1.5;
  const x2 = px + size - 1.5;
  const y2 = py + size - 1.5;
  ctx.save();
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
  ctx.lineCap = "round";
  ctx.globalAlpha = REACH_BOUNDARY_SHEATH_ALPHA;
  ctx.strokeStyle = ownerColor;
  ctx.lineWidth = Math.max(2, size * 0.14);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = REACH_BOUNDARY_CORE_COLOR;
  ctx.lineWidth = Math.max(1, size * 0.045);
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
  traceReachBoundaryEdgeLoops,
  samplePerimeterPylons
} from "../client-reach-overlay-boundary-trace/client-reach-overlay-boundary-trace.js";

// Beacon-placement reach preview (computeOutpostReachPreview,
// drawOutpostReachPreviewTile) moved to
// client-reach-overlay-beacon-preview/client-reach-overlay-beacon-preview.ts
// -- a fully separate concern from this module's authoritative
// reach-boundary rendering, split out to keep this file under the repo's
// 500-line cap (AGENTS.md).
