import { activeTransitLeg, clientMusterTransitRoute, sailPath } from "../client-muster-transit-route/client-muster-transit-route.js";
import type { DockLandingState } from "../client-dock-landing-ground/client-dock-landing-ground.js";
import type { MusterSupplyLine } from "../client-muster-transit/client-muster-transit.js";

type WorldToScreen = (x: number, y: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };
type Point = { x: number; y: number };

// 2D counterpart of the 3D marching company's dock route
// (client-map-3d-muster-transit-sync.ts): a still-marching supply line follows
// the company's real route -- over land, to a dock, along the sea lane in its
// troop transport and out the far side -- instead of a straight line across
// the water, and a small boat marks the crossing while the company is aboard.

// First frame each server-fired march (no local start time) was seen, keyed by
// attack target; pruned to the live lines every draw, so it never outgrows them.
const seenAt = new Map<string, number>();

export type RoutedSupplyLine = { points: Point[]; boat?: { at: Point; heading: Point } };

/** The polyline a supply line is drawn along, and the boat's spot while the company sails. */
export const routedSupplyLine = (state: DockLandingState, line: MusterSupplyLine, nowMs: number): RoutedSupplyLine => {
  const from = { x: line.musterX, y: line.musterY };
  const to = { x: line.targetX, y: line.targetY };
  if (line.phase !== "transit") return { points: [from, to] };
  const route = clientMusterTransitRoute(state, from, to);
  if (route.legs.length === 1) return { points: [from, to] };
  const points: Point[] = [];
  for (const leg of route.legs) {
    if (leg.kind === "WALK") points.push(...leg.points);
    else points.push(...sailPath(state, leg.from, leg.to));
  }
  if (line.arriveAt === undefined) return { points };
  const startAt = line.startAt ?? seenAt.get(line.targetKey) ?? nowMs;
  if (line.startAt === undefined) seenAt.set(line.targetKey, startAt);
  const leg = activeTransitLeg(route, startAt, line.arriveAt, nowMs);
  if (leg?.kind !== "SAIL") return { points };
  const path = sailPath(state, leg.from, leg.to);
  const t = Math.min(1, Math.max(0, (nowMs - leg.startAt) / Math.max(1, leg.endAt - leg.startAt)));
  const pos = t * (path.length - 1);
  const seg = Math.min(path.length - 2, Math.floor(pos));
  const a = path[seg]!;
  const b = path[seg + 1]!;
  const local = pos - seg;
  return { points, boat: { at: { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local }, heading: { x: b.x - a.x, y: b.y - a.y } } };
};

/** Drops start times for marches no longer drawn. */
export const pruneRouteSeenAt = (liveTargetKeys: ReadonlySet<string>): void => {
  for (const key of seenAt.keys()) if (!liveTargetKeys.has(key)) seenAt.delete(key);
};

/** Strokes the routed line (style already set by the caller) and draws the boat, if sailing. */
export const strokeRoutedSupplyLine = (
  routed: RoutedSupplyLine,
  ctx: CanvasRenderingContext2D,
  worldToScreen: WorldToScreen,
  color: string,
  size: number,
  halfW: number,
  halfH: number
): void => {
  ctx.beginPath();
  routed.points.forEach((point, index) => {
    const { sx, sy } = worldToScreen(point.x, point.y, size, halfW, halfH);
    if (index === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.stroke();
  if (!routed.boat) return;
  const { sx, sy } = worldToScreen(routed.boat.at.x, routed.boat.at.y, size, halfW, halfH);
  const hull = Math.max(6, size * 0.45);
  ctx.save();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.translate(sx, sy);
  ctx.rotate(Math.atan2(routed.boat.heading.y, routed.boat.heading.x));
  // Pointed bow along +x, square stern, a funnel on the after deck.
  ctx.beginPath();
  ctx.moveTo(hull * 0.6, 0);
  ctx.lineTo(hull * 0.2, -hull * 0.22);
  ctx.lineTo(-hull * 0.5, -hull * 0.22);
  ctx.lineTo(-hull * 0.5, hull * 0.22);
  ctx.lineTo(hull * 0.2, hull * 0.22);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#2a1d14";
  ctx.stroke();
  ctx.fillStyle = "#2a1d14";
  ctx.fillRect(-hull * 0.32, -hull * 0.1, hull * 0.2, hull * 0.2);
  ctx.restore();
};
