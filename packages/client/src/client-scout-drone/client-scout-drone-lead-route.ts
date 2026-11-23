// Stops toward the guide's town lead (state.guideTownLead). A drone leg reaches at most
// SCOUT_DRONE_MAX_LEG_TILES open tiles and a farther stop is pulled back, so one tap on a far town
// flew the same 20 tiles every time and never got there. Tapping the marked town instead lays stops
// along the straight line to it, one per leg, as many as the charges allow (Playtest Run 4).
import { SCOUT_DRONE_MAX_LEG_TILES, WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";

type Point = { x: number; y: number };

/** Each leg a little under the range, so a stop is never pulled back short of the next one's start. */
export const LEAD_ROUTE_LEG_TILES = SCOUT_DRONE_MAX_LEG_TILES - 2;

const signedDelta = (from: number, to: number, size: number): number => {
  const d = (((to - from) % size) + size) % size;
  return d > size / 2 ? d - size : d;
};

/** Stops from `launch` to `lead`, ending on the lead itself, at most `capacity` of them (the nearest first). */
export const leadRouteStops = (launch: Point, lead: Point, capacity: number): Point[] => {
  if (capacity <= 0) return [];
  const dx = signedDelta(launch.x, lead.x, WORLD_WIDTH);
  const dy = signedDelta(launch.y, lead.y, WORLD_HEIGHT);
  const legs = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / LEAD_ROUTE_LEG_TILES));
  const stops: Point[] = [];
  for (let i = 1; i <= legs && stops.length < capacity; i += 1) {
    stops.push({ x: wrapX(launch.x + Math.round((dx * i) / legs), WORLD_WIDTH), y: wrapY(launch.y + Math.round((dy * i) / legs), WORLD_HEIGHT) });
  }
  return stops;
};
