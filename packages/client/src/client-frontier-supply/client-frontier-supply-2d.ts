import { lightenHex } from "../client-map-3d-utils/client-map-3d-utils.js";
import type { FrontierSupplyModel } from "./client-frontier-supply.js";
import { supplyRoutesFor, type SupplyRoute } from "./client-frontier-supply-routes.js";
import {
  SUPPLY_CUT_RING_ALPHA,
  SUPPLY_CUT_RING_RADIUS,
  SUPPLY_CUT_RING_WIDTH,
  SUPPLY_DASH_GAP,
  SUPPLY_DASH_LENGTH,
  SUPPLY_LINE_ALPHA,
  SUPPLY_LINE_WHITE_MIX,
  SUPPLY_LINE_WIDTH
} from "./client-frontier-supply-style.js";

/**
 * 2D canvas renderer for fragile frontier supply lines (the 3D counterpart is
 * client-map-3d-frontier-supply-overlay.ts; both draw client-frontier-supply-
 * routes.ts in the client-frontier-supply-style.ts look). Drawn as one pass
 * after the tile loop, so a line crossing tile edges isn't painted over.
 *
 * Each route is one thin dashed stroke in a pale empire tint, its dash
 * pattern offset by the route's starting distance so dashes run on unbroken
 * through a fork; each cut tile gets a small ring. Static: nothing animates.
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
};

const CULL_MARGIN_TILES = 2;

const onScreen = (sx: number, sy: number, marginPx: number, deps: FrontierSupply2DDeps): boolean =>
  sx > -marginPx && sy > -marginPx && sx < deps.viewportWidth + marginPx && sy < deps.viewportHeight + marginPx;

const drawRoute = (ctx: CanvasRenderingContext2D, route: SupplyRoute, deps: FrontierSupply2DDeps): void => {
  const first = route.points[0];
  if (!first || route.points.length < 2) return;
  const size = deps.size;
  const anchor = deps.tileCenter(first.x, first.y);
  // Cheap reject: the whole route lies within its own length of its first point.
  const reachPx = ((route.points[route.points.length - 1]?.distance ?? 0) - first.distance + CULL_MARGIN_TILES) * size;
  if (!onScreen(anchor.sx, anchor.sy, reachPx, deps)) return;
  const screen = route.points.map((p) => ({ sx: anchor.sx + (p.x - first.x) * size, sy: anchor.sy + (p.y - first.y) * size }));
  const marginPx = CULL_MARGIN_TILES * size;
  if (!screen.some(({ sx, sy }) => onScreen(sx, sy, marginPx, deps))) return;
  ctx.lineDashOffset = first.distance * size;
  ctx.beginPath();
  ctx.moveTo(anchor.sx, anchor.sy);
  for (let i = 1; i < screen.length; i += 1) ctx.lineTo(screen[i]!.sx, screen[i]!.sy);
  ctx.stroke();
};

export const drawFrontierSupply2D = (ctx: CanvasRenderingContext2D, model: FrontierSupplyModel, deps: FrontierSupply2DDeps): void => {
  if (model.links.length === 0) return;
  const size = deps.size;
  ctx.save();
  ctx.strokeStyle = lightenHex(deps.ownerColor, SUPPLY_LINE_WHITE_MIX);
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";

  ctx.globalAlpha = SUPPLY_LINE_ALPHA;
  ctx.lineWidth = Math.max(1, SUPPLY_LINE_WIDTH * size);
  ctx.setLineDash([SUPPLY_DASH_LENGTH * size, SUPPLY_DASH_GAP * size]);
  for (const route of supplyRoutesFor(model)) drawRoute(ctx, route, deps);

  ctx.setLineDash([]);
  ctx.globalAlpha = SUPPLY_CUT_RING_ALPHA;
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
