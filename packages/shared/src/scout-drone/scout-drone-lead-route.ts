// The straight route the client lays to a guide lead (a town, or the Insurgent camp whose flight is free:
// apps/simulation scout-drone-camp-lead.ts): one stop per leg, each leg a little under the drone's range, so a
// stop is never pulled back short of the next one's start. Shared so the simulation can check that a free flight
// is exactly that route, stop for stop (a looser check let a free flight carry a stop anywhere).
import { SCOUT_DRONE_MAX_LEG_TILES } from "./scout-drone-route.js";

type Point = { readonly x: number; readonly y: number };

/** Each leg of a lead route: a little under the range. */
export const SCOUT_LEAD_ROUTE_LEG_TILES = SCOUT_DRONE_MAX_LEG_TILES - 2;

const signedDelta = (from: number, to: number, size: number): number => {
  const d = (((to - from) % size) + size) % size;
  return d > size / 2 ? d - size : d;
};

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

/** How many legs (one stop each) the straight route from `launch` to `lead` takes. */
export const scoutLeadRouteLegs = (launch: Point, lead: Point, worldWidth: number, worldHeight: number): number => {
  const dx = signedDelta(launch.x, lead.x, worldWidth);
  const dy = signedDelta(launch.y, lead.y, worldHeight);
  return Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / SCOUT_LEAD_ROUTE_LEG_TILES));
};

/** Every stop of the straight route from `launch` to `lead`, nearest first, ending on the lead. */
export const scoutLeadRouteStops = (launch: Point, lead: Point, worldWidth: number, worldHeight: number): Array<{ x: number; y: number }> => {
  const dx = signedDelta(launch.x, lead.x, worldWidth);
  const dy = signedDelta(launch.y, lead.y, worldHeight);
  const legs = scoutLeadRouteLegs(launch, lead, worldWidth, worldHeight);
  const stops: Array<{ x: number; y: number }> = [];
  for (let i = 1; i <= legs; i += 1) stops.push({ x: wrap(launch.x + Math.round((dx * i) / legs), worldWidth), y: wrap(launch.y + Math.round((dy * i) / legs), worldHeight) });
  return stops;
};

/** True when `stops` is exactly the straight route from `launch` to `lead`. */
export const isScoutLeadRoute = (stops: readonly Point[], lead: Point, launch: Point, worldWidth: number, worldHeight: number): boolean => {
  const route = scoutLeadRouteStops(launch, lead, worldWidth, worldHeight);
  return stops.length === route.length && route.every((stop, i) => stops[i]!.x === stop.x && stops[i]!.y === stop.y);
};
