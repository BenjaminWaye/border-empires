import { SCOUT_DRONE_MAX_STOPS } from "@border-empires/shared";

// The EXPLORE command payload (shared messages.ts): `{ x, y, waypoints? }`.
// The stops are `waypoints` when it is a valid list, else the single target
// (x, y). Both are re-checked here: the sim does not trust the gateway's parse.

type Point = { x: number; y: number };

const wrap = (v: number, size: number): number => ((v % size) + size) % size;
const isPoint = (value: unknown): value is Point =>
  typeof value === "object" && value !== null && Number.isInteger((value as { x?: unknown }).x) && Number.isInteger((value as { y?: unknown }).y);

/** The stops to fly through, wrapped to the world and capped at SCOUT_DRONE_MAX_STOPS, or undefined when the payload is invalid. */
export const parseScoutDroneExploreStops = (payloadJson: string, width: number, height: number): Point[] | undefined => {
  let payload: { x?: unknown; y?: unknown; waypoints?: unknown };
  try {
    payload = JSON.parse(payloadJson) as typeof payload;
  } catch {
    return undefined;
  }
  if (typeof payload !== "object" || payload === null) return undefined;
  let stops: Point[];
  if (payload.waypoints !== undefined) {
    if (!Array.isArray(payload.waypoints) || payload.waypoints.length === 0 || !payload.waypoints.every(isPoint)) return undefined;
    stops = payload.waypoints;
  } else {
    if (!isPoint(payload)) return undefined;
    stops = [payload];
  }
  return stops.slice(0, SCOUT_DRONE_MAX_STOPS).map((stop) => ({ x: wrap(stop.x, width), y: wrap(stop.y, height) }));
};
