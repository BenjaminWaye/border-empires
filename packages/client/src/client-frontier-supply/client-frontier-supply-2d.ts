import { lightenHex } from "../client-map-3d-utils/client-map-3d-utils.js";
import type { FrontierSupplyModel } from "./client-frontier-supply.js";
import { frontierSupplyModelForState, type FrontierSupplyState } from "./client-frontier-supply-state.js";
import { supplyRoutesFor, type SupplyRoute, type SupplyRoutePoint } from "./client-frontier-supply-routes.js";
import {
  SUPPLY_CORE_WHITE_MIX,
  SUPPLY_CUT_RING_RADIUS,
  SUPPLY_CUT_RING_WIDTH,
  SUPPLY_ROUTE_ALPHA,
  SUPPLY_ROUTE_REST_ALPHA,
  SUPPLY_ROUTE_WIDTH,
  SUPPLY_SHADOW_PULSE_LIFT,
  SUPPLY_SHADOW_REST_ALPHA,
  supplyCutRingAlpha,
  supplyLitAlpha,
  supplyPulseAt
} from "./client-frontier-supply-style.js";

/**
 * 2D canvas renderer for fragile frontier supply lines (the 3D counterpart is
 * client-map-3d-frontier-supply-overlay.ts; both draw client-frontier-supply-
 * routes.ts in the client-frontier-supply-style.ts look). Drawn as one pass
 * after the tile loop, so a route crossing tile edges isn't painted over.
 *
 * Each route is stroked in three faint layers: a soft dark shadow edge, the
 * empire-coloured body, and a light core. Those stay pale; travelling pulses
 * are drawn on top, and the arrowhead at each branch tip lights up as a
 * pulse reaches it. Each cut tile gets a ring that breathes with the pulses.
 */
export type FrontierSupply2DDeps = {
  /** Screen-space centre of a tile (wrapped tile coordinates). */
  tileCenter: (x: number, y: number) => { sx: number; sy: number };
  /** Tile size in px. */
  size: number;
  viewportWidth: number;
  viewportHeight: number;
  /** The viewer's empire colour, as a hex colour. */
  ownerColor: string;
  nowMs: number;
};

const SHADOW_COLOR = "#05080d";
const CORE_COLOR = "#ffffff";
const SHADOW_SCALE = 1.9;
const CORE_SCALE = 0.36;
const CULL_MARGIN_TILES = 2;

type ScreenPoint = { sx: number; sy: number; p: SupplyRoutePoint };

const onScreen = (sx: number, sy: number, marginPx: number, deps: FrontierSupply2DDeps): boolean =>
  sx > -marginPx && sy > -marginPx && sx < deps.viewportWidth + marginPx && sy < deps.viewportHeight + marginPx;

const drawArrowhead = (ctx: CanvasRenderingContext2D, points: ScreenPoint[], deps: FrontierSupply2DDeps): void => {
  const end = points[points.length - 1]!;
  const before = points[points.length - 2]!;
  const len = Math.hypot(end.sx - before.sx, end.sy - before.sy) || 1;
  const dx = (end.sx - before.sx) / len;
  const dy = (end.sy - before.sy) / len;
  const size = deps.size;
  const half = Math.max(0.13, SUPPLY_ROUTE_WIDTH * 1.05) * size;
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
  const pulse = supplyPulseAt(end.p.distance, deps.nowMs);
  ctx.globalAlpha = SUPPLY_ROUTE_ALPHA * (SUPPLY_SHADOW_REST_ALPHA + SUPPLY_SHADOW_PULSE_LIFT * pulse);
  ctx.strokeStyle = SHADOW_COLOR;
  ctx.lineWidth = Math.max(2, size * 0.06);
  trace();
  ctx.stroke();
  ctx.globalAlpha = SUPPLY_ROUTE_ALPHA * supplyLitAlpha(pulse);
  ctx.fillStyle = deps.ownerColor;
  trace();
  ctx.fill();
  ctx.globalAlpha = SUPPLY_ROUTE_ALPHA * 0.6 * pulse;
  ctx.fillStyle = CORE_COLOR;
  trace();
  ctx.fill();
};

type Run = { from: number; to: number; alpha: number };

/**
 * Splits a route into runs of segments that share (bucketed) opacity, so
 * each layer can be stroked as a few continuous paths. Stroking every tiny
 * smoothed segment separately overlaps translucent round caps at every joint
 * and reads as a string of beads. Segments whose opacity buckets to zero are
 * left out, splitting the route there (keeps only a pulse's lit stretches).
 */
const runsOf = (points: ScreenPoint[], alphaOf: (a: SupplyRoutePoint, b: SupplyRoutePoint) => number): Run[] => {
  const runs: Run[] = [];
  let open = false;
  for (let i = 1; i < points.length; i += 1) {
    const alpha = Math.round(alphaOf(points[i - 1]!.p, points[i]!.p) / 0.05) * 0.05;
    if (alpha <= 0) {
      open = false;
      continue;
    }
    const last = runs[runs.length - 1];
    if (open && last && last.alpha === alpha) last.to = i;
    else runs.push({ from: i - 1, to: i, alpha });
    open = true;
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
  const first = route.points[0];
  if (!first || route.points.length < 2) return;
  const size = deps.size;
  const anchor = deps.tileCenter(first.x, first.y);
  // Cheap reject: the whole route lies within its own length of its first point.
  const reachPx = ((route.points[route.points.length - 1]?.distance ?? 0) - first.distance + CULL_MARGIN_TILES) * size;
  if (!onScreen(anchor.sx, anchor.sy, reachPx, deps)) return;
  const points: ScreenPoint[] = route.points.map((p) => ({ sx: anchor.sx + (p.x - first.x) * size, sy: anchor.sy + (p.y - first.y) * size, p }));
  const marginPx = CULL_MARGIN_TILES * size;
  if (!points.some(({ sx, sy }) => onScreen(sx, sy, marginPx, deps))) return;
  const width = SUPPLY_ROUTE_WIDTH * size;
  // The whole ribbon, kept pale at rest: soft dark edge, body, steady core.
  const rest = runsOf(points, () => SUPPLY_ROUTE_ALPHA);
  for (const run of rest) strokeRun(ctx, points, run, width * SHADOW_SCALE, run.alpha * SUPPLY_SHADOW_REST_ALPHA, SHADOW_COLOR);
  for (const run of rest) strokeRun(ctx, points, run, width, run.alpha * SUPPLY_ROUTE_REST_ALPHA, deps.ownerColor);
  for (const run of rest) strokeRun(ctx, points, run, width * CORE_SCALE, run.alpha * SUPPLY_ROUTE_REST_ALPHA * 0.5, CORE_COLOR);
  // Travelling pulses on top, again layer by layer so a pulse's shadow never
  // lands on its own head: only the lit stretches.
  const pulses = runsOf(points, (a, b) => {
    const pulse = supplyPulseAt((a.distance + b.distance) / 2, deps.nowMs);
    return pulse < 0.04 ? 0 : SUPPLY_ROUTE_ALPHA * pulse;
  });
  for (const run of pulses) strokeRun(ctx, points, run, width * SHADOW_SCALE, run.alpha * SUPPLY_SHADOW_PULSE_LIFT, SHADOW_COLOR);
  for (const run of pulses) strokeRun(ctx, points, run, width, run.alpha * 0.85, deps.ownerColor);
  for (const run of pulses) strokeRun(ctx, points, run, width * 0.6, run.alpha * 0.8, CORE_COLOR);
  if (route.endsAtTip) drawArrowhead(ctx, points, deps);
};

export const drawFrontierSupply2D = (ctx: CanvasRenderingContext2D, model: FrontierSupplyModel, deps: FrontierSupply2DDeps): void => {
  if (model.links.length === 0) return;
  const size = deps.size;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const route of supplyRoutesFor(model)) drawRoute(ctx, route, deps);

  // The tile everything past it hangs on: a ring breathing in step with the pulses.
  ctx.globalAlpha = supplyCutRingAlpha(deps.nowMs);
  ctx.strokeStyle = lightenHex(deps.ownerColor, SUPPLY_CORE_WHITE_MIX);
  ctx.lineWidth = Math.max(1, SUPPLY_CUT_RING_WIDTH * size);
  for (const cut of model.cuts) {
    const { sx, sy } = deps.tileCenter(cut.x, cut.y);
    if (!onScreen(sx, sy, size, deps)) continue;
    ctx.beginPath();
    ctx.arc(sx, sy, SUPPLY_CUT_RING_RADIUS * size, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
};

/** The viewer's supply lines for the current client state, on the 2D map. */
export const drawFrontierSupplyForState2D = (ctx: CanvasRenderingContext2D, state: FrontierSupplyState, deps: FrontierSupply2DDeps): void =>
  drawFrontierSupply2D(ctx, frontierSupplyModelForState(state), deps);
