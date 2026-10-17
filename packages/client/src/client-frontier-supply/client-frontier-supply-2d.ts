import type { FrontierSupplyModel } from "./client-frontier-supply.js";
import { supplyRoutesFor, type SupplyRoute, type SupplyRoutePoint } from "./client-frontier-supply-routes.js";
import { supplyPulseAt } from "./client-frontier-supply-style.js";

/**
 * 2D canvas renderer for frontier supply routes (the 3D counterpart is
 * client-map-3d-frontier-supply-overlay.ts; both draw client-frontier-supply-
 * routes.ts in the client-frontier-supply-style.ts look). Drawn as one pass
 * after the tile loop, so a route crossing tile edges isn't painted over.
 *
 * Each route is stroked in three layers, segment by segment so width,
 * opacity and fragility can vary along it: a soft dark shadow edge, the
 * empire-coloured body, and a light core that brightens where a pulse is
 * passing. Branch tips get an arrowhead.
 */
export type FrontierSupply2DDeps = {
  /** Screen-space centre of a tile (wrapped tile coordinates). */
  tileCenter: (x: number, y: number) => { sx: number; sy: number };
  /** Tile size in px. */
  size: number;
  viewportWidth: number;
  viewportHeight: number;
  /** The viewer's empire colour (any canvas colour string). */
  ownerColor: string;
  nowMs: number;
};

const SHADOW_COLOR = "#05080d";
const CORE_COLOR = "#ffffff";
const SHADOW_SCALE = 1.9;
const CORE_SCALE = 0.36;
const CULL_MARGIN_TILES = 2;

type ScreenPoint = { sx: number; sy: number; p: SupplyRoutePoint };

const toScreen = (route: SupplyRoute, deps: FrontierSupply2DDeps): ScreenPoint[] => {
  const first = route.points[0]!;
  const anchor = deps.tileCenter(first.x, first.y);
  return route.points.map((p) => ({ sx: anchor.sx + (p.x - first.x) * deps.size, sy: anchor.sy + (p.y - first.y) * deps.size, p }));
};

const isOnScreen = (points: ScreenPoint[], deps: FrontierSupply2DDeps): boolean => {
  const margin = deps.size * CULL_MARGIN_TILES;
  return points.some(({ sx, sy }) => sx > -margin && sy > -margin && sx < deps.viewportWidth + margin && sy < deps.viewportHeight + margin);
};

const strokeSegment = (ctx: CanvasRenderingContext2D, a: ScreenPoint, b: ScreenPoint, width: number, alpha: number, color: string): void => {
  if (alpha <= 0.01 || width <= 0) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.sx, a.sy);
  ctx.lineTo(b.sx, b.sy);
  ctx.stroke();
};

const drawArrowhead = (ctx: CanvasRenderingContext2D, points: ScreenPoint[], deps: FrontierSupply2DDeps): void => {
  const end = points[points.length - 1]!;
  const before = points[points.length - 2]!;
  const len = Math.hypot(end.sx - before.sx, end.sy - before.sy) || 1;
  const dx = (end.sx - before.sx) / len;
  const dy = (end.sy - before.sy) / len;
  const size = deps.size;
  const half = Math.max(0.13, end.p.width * 1.05) * size;
  const bx = end.sx - dx * 0.12 * size;
  const by = end.sy - dy * 0.12 * size;
  const tx = end.sx + dx * 0.26 * size;
  const ty = end.sy + dy * 0.26 * size;
  const trace = (): void => {
    ctx.beginPath();
    ctx.moveTo(bx - dy * half, by + dx * half);
    ctx.lineTo(tx, ty);
    ctx.lineTo(bx + dy * half, by - dx * half);
    ctx.closePath();
  };
  ctx.globalAlpha = end.p.alpha * 0.45;
  ctx.strokeStyle = SHADOW_COLOR;
  ctx.lineWidth = Math.max(2, size * 0.06);
  trace();
  ctx.stroke();
  ctx.globalAlpha = end.p.alpha;
  ctx.fillStyle = deps.ownerColor;
  trace();
  ctx.fill();
  ctx.globalAlpha = end.p.alpha * (0.25 + 0.6 * supplyPulseAt(end.p.distance, deps.nowMs));
  ctx.fillStyle = CORE_COLOR;
  trace();
  ctx.fill();
};

type Run = { from: number; to: number; width: number; alpha: number };

/**
 * Splits a route into runs of segments that share (bucketed) width and
 * opacity, so each layer can be stroked as a few continuous paths.
 * Stroking every tiny smoothed segment separately overlaps translucent round
 * caps at every joint and reads as a string of beads.
 */
const runsOf = (points: ScreenPoint[]): Run[] => {
  const bucket = (v: number, step: number): number => Math.round(v / step) * step;
  const runs: Run[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!.p;
    const b = points[i]!.p;
    const width = bucket((a.width + b.width) / 2, 0.02);
    const alpha = bucket((a.alpha + b.alpha) / 2, 0.05);
    const last = runs[runs.length - 1];
    if (last && last.width === width && last.alpha === alpha) last.to = i;
    else runs.push({ from: i - 1, to: i, width, alpha });
  }
  return runs;
};

const strokeRun = (ctx: CanvasRenderingContext2D, points: ScreenPoint[], run: Run, width: number, alpha: number, color: string): void => {
  if (alpha <= 0.01 || width <= 0) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(points[run.from]!.sx, points[run.from]!.sy);
  for (let i = run.from + 1; i <= run.to; i += 1) ctx.lineTo(points[i]!.sx, points[i]!.sy);
  ctx.stroke();
};

const drawRoute = (ctx: CanvasRenderingContext2D, route: SupplyRoute, deps: FrontierSupply2DDeps): void => {
  const points = toScreen(route, deps);
  if (points.length < 2 || !isOnScreen(points, deps)) return;
  const size = deps.size;
  const runs = runsOf(points);
  // Layer by layer: soft dark edge, body, steady core.
  for (const run of runs) strokeRun(ctx, points, run, run.width * SHADOW_SCALE * size, run.alpha * 0.32, SHADOW_COLOR);
  for (const run of runs) strokeRun(ctx, points, run, run.width * size, run.alpha * 0.85, deps.ownerColor);
  for (const run of runs) strokeRun(ctx, points, run, run.width * CORE_SCALE * size, run.alpha * 0.4, CORE_COLOR);
  // Travelling pulses on top: only the lit stretches, so overlaps there just read as glow.
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const pulse = supplyPulseAt((a.p.distance + b.p.distance) / 2, deps.nowMs);
    if (pulse < 0.04) continue;
    strokeSegment(ctx, a, b, (a.p.width + b.p.width) * 0.5 * size * 0.6, ((a.p.alpha + b.p.alpha) / 2) * pulse * 0.8, CORE_COLOR);
  }
  if (route.endsAtTip) drawArrowhead(ctx, points, deps);
};

export const drawFrontierSupply2D = (ctx: CanvasRenderingContext2D, model: FrontierSupplyModel, deps: FrontierSupply2DDeps): void => {
  if (model.links.length === 0) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const route of supplyRoutesFor(model)) drawRoute(ctx, route, deps);
  ctx.restore();
};
