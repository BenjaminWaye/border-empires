// Stops toward the guide's town lead (state.guideTownLead). A drone leg reaches at most
// SCOUT_DRONE_MAX_LEG_TILES open tiles and a farther stop is pulled back, so one tap on a far town
// flew the same 20 tiles every time and never got there. Tapping the marked town instead lays stops
// along the straight line to it, one per leg, as many as the charges allow (Playtest Run 4).
// The route itself is shared (scout-drone-lead-route.ts): the simulation checks the free camp flight against it.
import { isScoutLeadRoute, SCOUT_LEAD_ROUTE_LEG_TILES, scoutLeadRouteLegs, scoutLeadRouteStops, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

type Point = { x: number; y: number };

/** Each leg a little under the range, so a stop is never pulled back short of the next one's start. */
export const LEAD_ROUTE_LEG_TILES = SCOUT_LEAD_ROUTE_LEG_TILES;

/** How many legs (one charge each) the route from `launch` to `lead` takes. */
export const leadRouteLegs = (launch: Point, lead: Point): number => scoutLeadRouteLegs(launch, lead, WORLD_WIDTH, WORLD_HEIGHT);

/**
 * True when `stops` is the guide's free flight to its camp lead (state.guideCampLead): exactly the straight route
 * from `launch` (the AFC nearest the camp). Mirrors the simulation's isScoutCampLeadFlight, which decides.
 */
export const isCampLeadRoute = (stops: readonly Point[], lead: Point | undefined, launch: Point | undefined): boolean =>
  Boolean(lead && launch && isScoutLeadRoute(stops, lead, launch, WORLD_WIDTH, WORLD_HEIGHT));

/** Stops from `launch` to `lead`, ending on the lead itself, at most `capacity` of them (the nearest first). */
export const leadRouteStops = (launch: Point, lead: Point, capacity: number): Point[] =>
  capacity <= 0 ? [] : scoutLeadRouteStops(launch, lead, WORLD_WIDTH, WORLD_HEIGHT).slice(0, capacity);
