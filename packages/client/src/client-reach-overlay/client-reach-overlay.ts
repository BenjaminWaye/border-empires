import { tileKey, WORLD_HEIGHT, WORLD_WIDTH, type ReachAnchorKind } from "@border-empires/shared";
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
