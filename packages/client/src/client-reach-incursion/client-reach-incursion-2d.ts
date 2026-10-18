import { drawDormantFrontierTreatment, isDormantFrontierTile } from "../client-reach-overlay/client-reach-overlay.js";
import { incursionHatchColors, incursionMarkColor, incursionPocketEdges, reachPocketAt, type IncursionDeps } from "./client-reach-incursion.js";
import type { Tile } from "../client-types.js";

// 2D canvas twin of client-map-3d-incursion-overlay.ts: a tile held inside
// another empire's reach (reachPocketAt -- a rival's tile inside the viewer's
// reach, or the viewer's own tile inside a rival's) gets a two-colour diagonal
// hatch (the pusher's colour alternating with the reach owner's) plus a solid
// strip along each pocket edge in a colour contrasting with the pusher's fill. Also owns the existing dormant-frontier
// treatment, so client-runtime-loop.ts makes one per-tile reach call.

const HATCH_ALPHA = 0.6;
/** Theirs+mine stripe pairs per tile (matches the 3D HATCH_STRIPE_PAIRS_PER_TILE); whole, so neighbouring tiles' stripes line up. */
const HATCH_STRIPES = 4;
const EDGE_WIDTH_FRACTION = 0.07;

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

/** Per-tile reach treatments for one VISIBLE tile on the 2D map: dormant frontier (own tiles) and the incursion hatch on any tile held inside another empire's reach. */
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
  if (tile.ownerId === deps.me && isDormantFrontierTile(tile)) drawDormantFrontierTreatment(ctx, px, py, size);
  const pocket = reachPocketAt(tile, deps.keyFor(wx, wy), deps.me, myReach, deps.tiles);
  if (!pocket) return;
  const pusherColor = deps.ownerColor(pocket.pusher);
  drawIncursionTile(ctx, incursionHatchColors(pusherColor, deps.ownerColor(pocket.defender)), incursionMarkColor(pusherColor), px, py, size, incursionPocketEdges(wx, wy, pocket.pusher, deps));
};
