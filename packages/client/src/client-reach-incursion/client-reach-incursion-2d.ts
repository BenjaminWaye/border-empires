import { drawDormantFrontierTreatment, isDormantFrontierTile } from "../client-reach-overlay/client-reach-overlay.js";
import { incursionHatchColors, incursionMarkColor, incursionOwnerAt, incursionPocketEdges, rivalReachOverMyTile, type IncursionDeps } from "./client-reach-incursion.js";
import type { Tile } from "../client-types.js";

// 2D canvas twin of client-map-3d-incursion-overlay.ts: rival tiles inside
// the viewer's reach get a two-colour diagonal hatch (intruder's colour
// alternating with the viewer's) plus a solid strip along each pocket edge in
// a colour contrasting with the intruder's fill. The viewer's own tiles inside
// a rival's reach get the mirror mark instead: sparse thin lines in the rival's
// colour along the other diagonal, no edge. Also owns the existing dormant-frontier
// treatment, so client-runtime-loop.ts makes one per-tile reach call.

const HATCH_ALPHA = 0.6;
/** Theirs+mine stripe pairs per tile (matches the 3D HATCH_STRIPE_PAIRS_PER_TILE); whole, so neighbouring tiles' stripes line up. */
const HATCH_STRIPES = 4;
const EDGE_WIDTH_FRACTION = 0.07;
/** Rival-reach lines per tile and each line's share of its period (match the 3D RIVAL_REACH_* constants). */
const RIVAL_REACH_LINES = 3;
const RIVAL_REACH_LINE_WIDTH = 0.2;
const RIVAL_REACH_ALPHA = 0.85;

export type ReachTileTreatmentDeps = IncursionDeps & {
  readonly me: string;
  readonly ownerColor: (ownerId: string) => string;
};

// Pre-rendered striped tile per (theirs, mine, pixel size): the stripes are
// filled polygons between two OPAQUE colours, so their shared edges
// anti-alias cleanly, and the whole tile is then stamped at HATCH_ALPHA.
// (Stroking two overlapping translucent line sets instead left seams where
// they doubled up.) Bounded: cleared whenever it outgrows the limit -- the
// key space is just the visible intruder colours times the current zoom.
const HATCH_TILE_CACHE_LIMIT = 64;
const hatchTileCache = new Map<string, HTMLCanvasElement>();

const hatchTileImage = (hatch: ReturnType<typeof incursionHatchColors>, size: number): HTMLCanvasElement | undefined => {
  const px = Math.max(4, Math.round(size));
  const key = `${hatch.theirs}|${hatch.mine}|${px}`;
  const cached = hatchTileCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.fillStyle = hatch.mine;
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = hatch.theirs;
  // Stripes are bands of x + y in [k*step, k*step + step/2); a whole number of
  // pairs per tile keeps them continuous from one tile to the next.
  const step = px / HATCH_STRIPES;
  ctx.beginPath();
  for (let k = -HATCH_STRIPES; k <= HATCH_STRIPES * 2; k += 1) {
    const c0 = k * step;
    const c1 = c0 + step / 2;
    ctx.moveTo(c0, 0);
    ctx.lineTo(c1, 0);
    ctx.lineTo(c1 - px, px);
    ctx.lineTo(c0 - px, px);
    ctx.closePath();
  }
  ctx.fill();
  if (hatchTileCache.size >= HATCH_TILE_CACHE_LIMIT) hatchTileCache.clear();
  hatchTileCache.set(key, canvas);
  return canvas;
};

// Thin lines along x - y (the incursion hatch runs along x + y) on a
// transparent tile, so the viewer's own fill shows between them. Shares the
// bounded hatch cache; the "r|" prefix keeps its keys apart.
const rivalReachTileImage = (rivalColor: string, size: number): HTMLCanvasElement | undefined => {
  const px = Math.max(4, Math.round(size));
  const key = `r|${rivalColor}|${px}`;
  const cached = hatchTileCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.fillStyle = rivalColor;
  const step = px / RIVAL_REACH_LINES;
  const half = (step * RIVAL_REACH_LINE_WIDTH) / 2;
  ctx.beginPath();
  // Line k is the band of x - y within half of k*step + step/2 (centred like the 3D shader's lines).
  for (let k = -RIVAL_REACH_LINES; k <= RIVAL_REACH_LINES; k += 1) {
    const c = k * step + step / 2;
    ctx.moveTo(c - half, 0);
    ctx.lineTo(c + half, 0);
    ctx.lineTo(c + half + px, px);
    ctx.lineTo(c - half + px, px);
    ctx.closePath();
  }
  ctx.fill();
  if (hatchTileCache.size >= HATCH_TILE_CACHE_LIMIT) hatchTileCache.clear();
  hatchTileCache.set(key, canvas);
  return canvas;
};

const drawRivalReachTile = (ctx: CanvasRenderingContext2D, rivalColor: string, px: number, py: number, size: number): void => {
  const image = rivalReachTileImage(rivalColor, size);
  if (!image) return;
  ctx.save();
  ctx.globalAlpha = RIVAL_REACH_ALPHA;
  ctx.drawImage(image, px, py, size, size);
  ctx.restore();
};

const drawIncursionTile = (
  ctx: CanvasRenderingContext2D,
  hatch: ReturnType<typeof incursionHatchColors>,
  edgeColor: string,
  px: number,
  py: number,
  size: number,
  edges: ReturnType<typeof incursionPocketEdges>
): void => {
  const image = hatchTileImage(hatch, size);
  ctx.save();
  if (image) {
    ctx.globalAlpha = HATCH_ALPHA;
    ctx.drawImage(image, px, py, size, size);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = edgeColor;
  const w = Math.max(1.5, size * EDGE_WIDTH_FRACTION);
  if (edges.north) ctx.fillRect(px, py, size, w);
  if (edges.south) ctx.fillRect(px, py + size - w, size, w);
  if (edges.west) ctx.fillRect(px, py, w, size);
  if (edges.east) ctx.fillRect(px + size - w, py, w, size);
  ctx.restore();
};

/** Per-tile reach treatments for one VISIBLE tile on the 2D map: dormant frontier and rival reach (own tiles) or incursion (rival tiles inside my reach). */
export const drawReachTileTreatments2D = (
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  wx: number,
  wy: number,
  px: number,
  py: number,
  size: number,
  myReach: ReadonlySet<string>,
  deps: ReachTileTreatmentDeps
): void => {
  if (tile.ownerId === deps.me) {
    if (isDormantFrontierTile(tile)) drawDormantFrontierTreatment(ctx, px, py, size);
    const rival = rivalReachOverMyTile(tile, deps.me);
    if (rival) drawRivalReachTile(ctx, deps.ownerColor(rival), px, py, size);
    return;
  }
  const intruder = incursionOwnerAt(tile, deps.keyFor(wx, wy), deps.me, myReach);
  if (!intruder) return;
  const intruderColor = deps.ownerColor(intruder);
  drawIncursionTile(ctx, incursionHatchColors(intruderColor, deps.ownerColor(deps.me)), incursionMarkColor(intruderColor), px, py, size, incursionPocketEdges(wx, wy, intruder, deps));
};
