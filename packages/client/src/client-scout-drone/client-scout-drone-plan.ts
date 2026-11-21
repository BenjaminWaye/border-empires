// Planning a scout drone flight (docs/explore-scout-plan.md §13). Tapping fog
// starts a plan with that tile as the first stop; every further tap adds a
// stop, and tapping a stop removes it and the ones after it. Each stop costs
// a charge and a leg reaches at most SCOUT_DRONE_MAX_LEG_TILES open tiles: a
// tap farther away is pulled back along the leg (planScoutDroneRoute), so the
// route on the map always shows exactly where the drone will go. Go sends
// EXPLORE with the stops. The dock (client-scout-drone-dock.ts) and the 3D
// route (client-map-3d-scout-drone-plan-overlay.ts) both read this.
import {
  SCOUT_DRONE_MAX_CHARGES,
  SCOUT_DRONE_MAX_STOPS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  extendScoutDroneFlight,
  planScoutDroneRoute,
  scoutDroneStepIndexAt,
  planScoutDroneWaypointFlight,
  scoutChargesAvailable,
  type ScoutDroneFlight,
  type ScoutDroneRoutePlan,
  type ScoutDroneWorld
} from "@border-empires/shared";
import { resolveMyReachCached } from "../client-reach-authoritative/client-reach-authoritative.js";
import type { ClientState } from "../client-state/client-state.js";

type Point = { x: number; y: number };
export type ScoutPlanState = Pick<
  ClientState,
  "scoutDronePicking" | "scoutDroneFlight" | "scoutDroneCharges" | "tiles" | "me" | "allies" | "discoveredTiles" | "tilesRevision" | "serverReach" | "serverReachRevision" | "myReach" | "myReachRevisionAtCompute"
>;

const keyOf = (x: number, y: number): string => `${x},${y}`;
const wrap = (v: number, size: number): number => ((v % size) + size) % size;
const isPlanetaryDefense = (ownerId: string): boolean => ownerId.startsWith("barbarian-");

/** The map as the drone sees it, from what this client knows: unseen ground counts as open. */
export const clientScoutWorld = (state: ScoutPlanState): ScoutDroneWorld => {
  const reach = resolveMyReachCached(state);
  return {
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    classify: (x, y) => {
      const key = keyOf(wrap(x, WORLD_WIDTH), wrap(y, WORLD_HEIGHT));
      const ownerId = state.tiles.get(key)?.ownerId;
      if (ownerId && isPlanetaryDefense(ownerId)) return { kind: "OPEN" };
      if (ownerId) return ownerId === state.me || state.allies.includes(ownerId) ? { kind: "HOME" } : { kind: "BLOCKED", ownerId };
      return reach.has(key) ? { kind: "HOME" } : { kind: "OPEN" };
    }
  };
};

let afcCache: { tiles: ClientState["tiles"]; revision: number; me: string; afcs: Point[] } | undefined;
/** The player's active AFCs (cached per tiles revision: this runs every frame while planning). */
export const ownActiveAfcs = (state: Pick<ClientState, "tiles" | "me" | "tilesRevision">): Point[] => {
  if (afcCache && afcCache.tiles === state.tiles && afcCache.revision === state.tilesRevision && afcCache.me === state.me) return afcCache.afcs;
  const afcs: Point[] = [];
  for (const tile of state.tiles.values()) if (tile.afc?.ownerId === state.me && tile.afc.status === "active") afcs.push({ x: tile.x, y: tile.y });
  afcCache = { tiles: state.tiles, revision: state.tilesRevision, me: state.me, afcs };
  return afcs;
};

const distance = (a: Point, b: Point): number => {
  const dx = Math.abs(wrap(a.x - b.x + WORLD_WIDTH / 2, WORLD_WIDTH) - WORLD_WIDTH / 2);
  const dy = Math.abs(wrap(a.y - b.y + WORLD_HEIGHT / 2, WORLD_HEIGHT) - WORLD_HEIGHT / 2);
  return Math.max(dx, dy);
};

/** The AFC the server will launch from: the active one nearest the first stop. */
export const scoutLaunchAfc = (state: Pick<ClientState, "tiles" | "me" | "tilesRevision">, firstStop: Point): Point | undefined => {
  let best: { p: Point; d: number } | undefined;
  for (const p of ownActiveAfcs(state)) {
    const d = distance(p, firstStop);
    if (!best || d < best.d) best = { p, d };
  }
  return best?.p;
};

/** Charges ready now; all of them before the server has said (an older server sends none). */
export const scoutChargesReady = (state: Pick<ClientState, "scoutDroneCharges">, nowMs: number): number =>
  state.scoutDroneCharges ? scoutChargesAvailable(state.scoutDroneCharges, nowMs) : SCOUT_DRONE_MAX_CHARGES;

export const scoutChargesMax = (state: Pick<ClientState, "scoutDroneCharges">): number => state.scoutDroneCharges?.max ?? SCOUT_DRONE_MAX_CHARGES;

/** Stops one flight may hold once stops are added mid-flight (matches the server's SCOUT_DRONE_MAX_ROUTE_STOPS). */
export const SCOUT_DRONE_MAX_ROUTE_STOPS = SCOUT_DRONE_MAX_STOPS * 2;

/** The drone in the air at `nowMs`, if any. */
export const flyingScoutDrone = (state: Pick<ClientState, "scoutDroneFlight">, nowMs: number): ScoutDroneFlight | undefined =>
  state.scoutDroneFlight && state.scoutDroneFlight.landsAt > nowMs ? state.scoutDroneFlight : undefined;

/**
 * The flying drone's stops it has not reached yet, with each one's number on the route (1-based). Each stop's
 * step is found in flight order: a route that crosses a later stop's tile on an earlier leg must not count that
 * stop as reached (review 2026-11-21). The 3D route numbers these, and a tap on one is never a new stop.
 */
export const flyingStopsAhead = (flight: ScoutDroneFlight, nowMs: number): Array<Point & { n: number }> => {
  const from = Math.max(0, scoutDroneStepIndexAt(flight, nowMs));
  const ahead: Array<Point & { n: number }> = [];
  let cursor = 0;
  (flight.waypoints ?? []).forEach((stop, i) => {
    let at = cursor;
    while (at <= flight.turnIndex && (flight.steps[at]!.x !== stop.x || flight.steps[at]!.y !== stop.y)) at += 1;
    if (at > flight.turnIndex) return;
    cursor = at + 1;
    if (at > from) ahead.push({ x: stop.x, y: stop.y, n: i + 1 });
  });
  return ahead;
};

/**
 * How near a tap must land to count as a tap on a stop, in tiles. A stop's number badge covers more than its own
 * tile, so a tap on the badge that missed the tile by one added a stop beside it (player report 2026-11-21).
 */
export const SCOUT_STOP_TAP_RADIUS_TILES = 1;

/** Index of the stop nearest (wx, wy) within the tap radius, or -1. */
const stopIndexNear = (stops: readonly Point[], wx: number, wy: number): number => {
  let best = -1;
  let bestDistance = Infinity;
  stops.forEach((stop, i) => {
    const d = distance(stop, { x: wx, y: wy });
    if (d <= SCOUT_STOP_TAP_RADIUS_TILES && d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  });
  return best;
};

/** How many stops the plan can hold now: charges left, and room on the flying drone's route. */
export const scoutPlanCapacity = (state: ScoutPlanState, nowMs: number): number => {
  const flying = flyingScoutDrone(state, nowMs);
  const room = flying ? SCOUT_DRONE_MAX_ROUTE_STOPS - (flying.waypoints?.length ?? 1) : SCOUT_DRONE_MAX_STOPS;
  return Math.max(0, Math.min(room, scoutChargesReady(state, nowMs)));
};

export type ScoutPlanPreview = {
  /** Where the planned legs start: the AFC, or where the flying drone will take them on. */
  readonly launch: Point;
  readonly route: ScoutDroneRoutePlan;
  /** The whole flight as the server would plan it now (launch, stops, home), for the route home and the time on Go. */
  readonly flight: ScoutDroneFlight | undefined;
};

/** The planned route from the launch AFC through `stops` (plus an optional ghost stop for the leg under the pointer). */
export const scoutPlanPreview = (state: ScoutPlanState, stops: readonly Point[], nowMs: number): ScoutPlanPreview | undefined => {
  const first = stops[0];
  if (!first) return undefined;
  const world = clientScoutWorld(state);
  const flying = flyingScoutDrone(state, nowMs);
  if (flying) {
    // The new stops join the flying drone's route: after its last stop while it is still flying
    // out, or from the tile it is flying toward once it is heading home (shared extendScoutDroneFlight).
    const index = Math.max(0, scoutDroneStepIndexAt(flying, nowMs));
    const anchor = index + 1 <= flying.turnIndex ? flying.steps[flying.turnIndex]! : flying.steps[Math.min(index + 1, flying.steps.length - 1)]!;
    const launch = { x: anchor.x, y: anchor.y };
    return { launch, route: planScoutDroneRoute(launch, stops, world), flight: extendScoutDroneFlight(flying, nowMs, stops, world)?.flight };
  }
  const launch = scoutLaunchAfc(state, first);
  if (!launch) return undefined;
  return { launch, route: planScoutDroneRoute(launch, stops, world), flight: planScoutDroneWaypointFlight(launch, stops, nowMs, world) };
};

const isHome = (state: ScoutPlanState, x: number, y: number): boolean => {
  const ownerId = state.tiles.get(keyOf(x, y))?.ownerId;
  return Boolean(ownerId && (ownerId === state.me || state.allies.includes(ownerId)));
};

export const isScoutPlanning = (state: Pick<ClientState, "scoutDronePicking">): boolean => state.scoutDronePicking.active;

export const cancelScoutPlan = (state: Pick<ClientState, "scoutDronePicking">): void => {
  state.scoutDronePicking.active = false;
  state.scoutDronePicking.stops = [];
};

export const undoScoutPlanStop = (state: Pick<ClientState, "scoutDronePicking">): void => {
  state.scoutDronePicking.stops = state.scoutDronePicking.stops.slice(0, -1);
};

/** True when the player can plan at all: an active AFC to launch from. */
export const canPlanScoutFlight = (state: Pick<ClientState, "tiles" | "me" | "tilesRevision">): boolean => ownActiveAfcs(state).length > 0;

/** True when a tap at (wx, wy) with no plan open would start one: fog never explored, no tile data, off home ground. */
export const scoutPlanTapStarts = (state: ScoutPlanState, wx: number, wy: number): boolean => {
  const key = keyOf(wx, wy);
  return !state.discoveredTiles.has(key) && !state.tiles.has(key) && !isHome(state, wx, wy) && canPlanScoutFlight(state);
};

/**
 * A map tap while planning, or a tap on unexplored ground that starts a plan.
 * Returns true when the tap was consumed.
 */

export const handleScoutPlanTap = (state: ScoutPlanState, wx: number, wy: number, nowMs: number): boolean => {
  const plan = state.scoutDronePicking;
  // A tap on a planned stop (as reached) takes it and the ones after it off the plan.
  const preview = plan.active ? scoutPlanPreview(state, plan.stops, nowMs) : undefined;
  const hit = preview ? stopIndexNear(preview.route.stops, wx, wy) : -1;
  if (hit >= 0) {
    plan.stops = plan.stops.slice(0, hit);
    plan.bumpAt = nowMs;
    return true;
  }
  // A tap on a stop the flying drone has yet to reach is spent: the stop is already on its way, and a new stop
  // there numbered after the whole route read as a stop the player never placed (player report 2026-11-21).
  const flying = flyingScoutDrone(state, nowMs);
  if (flying && stopIndexNear(flyingStopsAhead(flying, nowMs), wx, wy) >= 0) return plan.active || scoutPlanTapStarts(state, wx, wy);
  if (!plan.active) {
    // Only fog starts a plan: a tile never explored that the client has no data for, off home ground.
    if (!scoutPlanTapStarts(state, wx, wy)) return false;
    plan.active = true;
    plan.stops = [];
  }
  if (isHome(state, wx, wy)) return true;
  if (plan.stops.length >= scoutPlanCapacity(state, nowMs)) {
    plan.shakeAt = nowMs; // the dock's pips shake: no charge left for another stop
    return true;
  }
  plan.stops = [...plan.stops, { x: wx, y: wy }];
  plan.bumpAt = nowMs;
  return true;
};

export type ScoutPlanLaunchDeps = { sendGameMessage?: ((payload: unknown) => boolean) | undefined };

/** Go: sends the plan's stops (as the route reaches them) and closes the plan. With a drone out, the server adds them to its route. */
export const launchScoutPlan = (state: ScoutPlanState, deps: ScoutPlanLaunchDeps, nowMs: number): boolean => {
  const preview = scoutPlanPreview(state, state.scoutDronePicking.stops, nowMs);
  if (!preview || preview.route.stops.length === 0 || !deps.sendGameMessage) return false;
  const stops = preview.route.stops.map((stop) => ({ x: stop.x, y: stop.y }));
  const first = stops[0]!;
  deps.sendGameMessage({ type: "EXPLORE", x: first.x, y: first.y, waypoints: stops });
  state.scoutDronePicking.launches += 1;
  cancelScoutPlan(state);
  return true;
};
