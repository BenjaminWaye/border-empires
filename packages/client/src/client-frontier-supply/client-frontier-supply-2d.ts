import type { FrontierSupplyModel } from "./client-frontier-supply.js";
import { supplyRoutesFor, type SupplyRoute, type SupplyRoutePoint } from "./client-frontier-supply-routes.js";
import {
  SUPPLY_ROUTE_REST_ALPHA,
  SUPPLY_SHADOW_PULSE_LIFT,
  SUPPLY_SHADOW_REST_ALPHA,
  supplyPulseAt
} from "./client-frontier-supply-style.js";

/**
 * 2D canvas renderer for frontier supply routes (the 3D counterpart is
 * client-map-3d-frontier-supply-overlay.ts; both draw client-frontier-supply-
 * routes.ts in the client-frontier-supply-style.ts look). Drawn as one pass
 * after the tile loop, so a route crossing tile edges isn't painted over.
 *
 * Each route is stroked in three faint layers, in runs so width and opacity
 * can vary along it: a soft dark shadow edge, the empire-coloured body, and
 * a light core. Those stay pale; travelling pulses are drawn bright on top.
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

type Run = { from: number; to: number; width: number; alpha: number };

/**
 * Splits a route into runs of segments that share (bucketed) width and
 * opacity, so each layer can be stroked as a few continuous paths.
 * Stroking every tiny smoothed segment separately overlaps translucent round
 * caps at every joint and reads as a string of beads. `alphaOf` gives a
 * segment's opacity; segments that bucket to zero are left out, splitting
 * the route there (used to keep only the lit stretches of a pulse).
 */
const runsOf = (points: ScreenPoint[], alphaOf: (a: SupplyRoutePoint, b: SupplyRoutePoint) => number): Run[] => {
  const bucket = (v: number, step: number): number => Math.round(v / step) * step;
  const runs: Run[] = [];
  let open = false;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!.p;
    const b = points[i]!.p;
    const width = bucket((a.width + b.width) / 2, 0.02);
    const alpha = bucket(alphaOf(a, b), 0.05);
    if (alpha <= 0) {
      open = false;
      continue;
    }
    const last = runs[runs.length - 1];
    if (open && last && last.width === width && last.alpha === alpha) last.to = i;
    else runs.push({ from: i - 1, to: i, width, alpha });
    open = true;
  }
  return runs;
};

const restAlpha = (a: SupplyRoutePoint, b: SupplyRoutePoint): number => (a.alpha + b.alpha) / 2;

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
  // Cheap reject before mapping every point: the whole route lies within its own length of its first point.
  const first = route.points[0];
  if (!first) return;
  const anchor = deps.tileCenter(first.x, first.y);
  const reachPx = ((route.points[route.points.length - 1]?.distance ?? 0) - first.distance + CULL_MARGIN_TILES) * deps.size;
  if (anchor.sx < -reachPx || anchor.sy < -reachPx || anchor.sx > deps.viewportWidth + reachPx || anchor.sy > deps.viewportHeight + reachPx) return;
  const points = toScreen(route, deps);
  if (points.length < 2 || !isOnScreen(points, deps)) return;
  const size = deps.size;
  const runs = runsOf(points, restAlpha);
  // Layer by layer, all kept pale at rest: soft dark edge, body, steady core.
  for (const run of runs) strokeRun(ctx, points, run, run.width * SHADOW_SCALE * size, run.alpha * SUPPLY_SHADOW_REST_ALPHA, SHADOW_COLOR);
  for (const run of runs) strokeRun(ctx, points, run, run.width * size, run.alpha * SUPPLY_ROUTE_REST_ALPHA, deps.ownerColor);
  for (const run of runs) strokeRun(ctx, points, run, run.width * CORE_SCALE * size, run.alpha * SUPPLY_ROUTE_REST_ALPHA * 0.5, CORE_COLOR);
  // Travelling pulses on top, at full strength, again layer by layer so a
  // pulse's shadow never lands on its own head: only the lit stretches.
  const pulseRuns = runsOf(points, (a, b) => {
    const pulse = supplyPulseAt((a.distance + b.distance) / 2, deps.nowMs);
    return pulse < 0.04 ? 0 : restAlpha(a, b) * pulse;
  });
  for (const run of pulseRuns) strokeRun(ctx, points, run, run.width * SHADOW_SCALE * size, run.alpha * SUPPLY_SHADOW_PULSE_LIFT, SHADOW_COLOR);
  for (const run of pulseRuns) strokeRun(ctx, points, run, run.width * size, run.alpha * 0.85, deps.ownerColor);
  for (const run of pulseRuns) strokeRun(ctx, points, run, run.width * 0.6 * size, run.alpha * 0.8, CORE_COLOR);
};

export const drawFrontierSupply2D = (ctx: CanvasRenderingContext2D, model: FrontierSupplyModel, deps: FrontierSupply2DDeps): void => {
  if (model.links.length === 0) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const route of supplyRoutesFor(model)) drawRoute(ctx, route, deps);
  ctx.restore();
};
