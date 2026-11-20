// Waypoint flights for the scout drone (docs/explore-scout-plan.md §13). The
// player places up to SCOUT_DRONE_MAX_STOPS stops; the drone flies from its AFC
// through each in turn, then straight home. Each leg reaches at most
// SCOUT_DRONE_MAX_LEG_TILES open tiles (own, allied and reach ground is free):
// a stop placed farther away is pulled back along the leg to the last tile in
// range, so a plan is never refused for being too long. The client runs the
// same functions to draw the route before launch, so the preview and the
// flight match wherever the client's view of the map is the server's.
import {
  SCOUT_DRONE_HOME_STEP_MS,
  SCOUT_DRONE_STEP_MS,
  scoutDroneBlockAt,
  scoutDroneLine,
  type ScoutDroneEndReason,
  type ScoutDroneFlight,
  type ScoutDroneStep,
  type ScoutDroneWorld
} from "./scout-drone.js";

/** Open tiles one leg may cross: past this the stop is pulled back. */
export const SCOUT_DRONE_MAX_LEG_TILES = 20;
/** Stops in one flight (each costs a charge, client and server cap it at the charges left too). */
export const SCOUT_DRONE_MAX_STOPS = 8;

type Point = { x: number; y: number };
type LegTile = Point & { stepMs: number };
type Block = { ownerId?: string | undefined; x: number; y: number };

export type ScoutDroneLeg = {
  /** Tiles flown after leaving `from`, in order (`from` itself is not included). */
  readonly tiles: readonly LegTile[];
  /** Where the leg ends: the stop, or the tile it was pulled back to, or the last tile before a rival border. */
  readonly end: Point;
  /** True when the stop was out of range and the leg was cut at SCOUT_DRONE_MAX_LEG_TILES open tiles. */
  readonly clamped: boolean;
  /** The rival border that ended the leg, when one did. */
  readonly blocked?: Block | undefined;
};

/** One leg from `from` toward `to`: straight, cut at the range limit or one tile short of a rival border. */
export const scoutDroneLeg = (from: Point, to: Point, world: ScoutDroneWorld): ScoutDroneLeg => {
  const tiles: LegTile[] = [];
  let prev = from;
  let open = 0;
  for (const tile of scoutDroneLine(from, to, world.width, world.height).slice(1)) {
    const wall = scoutDroneBlockAt(prev, tile, world);
    if (wall) return { tiles, end: prev, clamped: false, blocked: wall };
    const home = world.classify(tile.x, tile.y).kind === "HOME";
    if (!home) {
      if (open >= SCOUT_DRONE_MAX_LEG_TILES) return { tiles, end: prev, clamped: true };
      open += 1;
    }
    tiles.push({ x: tile.x, y: tile.y, stepMs: home ? SCOUT_DRONE_HOME_STEP_MS : SCOUT_DRONE_STEP_MS });
    prev = tile;
  }
  return { tiles, end: prev, clamped: false };
};

export type ScoutDroneRoutePlan = {
  /** Each leg in order; a rival border ends the route at the leg it blocks. */
  readonly legs: readonly ScoutDroneLeg[];
  /** Where each flown leg ends: the stops as the drone will actually reach them. */
  readonly stops: readonly Point[];
};

/** The route through `stops` from `launch`, leg by leg, as the drone will fly it. */
export const planScoutDroneRoute = (launch: Point, stops: readonly Point[], world: ScoutDroneWorld): ScoutDroneRoutePlan => {
  const legs: ScoutDroneLeg[] = [];
  let at = launch;
  for (const stop of stops.slice(0, SCOUT_DRONE_MAX_STOPS)) {
    const leg = scoutDroneLeg(at, stop, world);
    legs.push(leg);
    at = leg.end;
    if (leg.blocked) break;
  }
  return { legs, stops: legs.map((leg) => leg.end) };
};

/** The tiles straight home from `from` to `launch`, or undefined when a rival border lies across that line. */
const straightHome = (from: Point, launch: Point, world: ScoutDroneWorld): LegTile[] | undefined => {
  const tiles: LegTile[] = [];
  let prev = from;
  for (const tile of scoutDroneLine(from, launch, world.width, world.height).slice(1)) {
    if (scoutDroneBlockAt(prev, tile, world)) return undefined;
    tiles.push({ x: tile.x, y: tile.y, stepMs: world.classify(tile.x, tile.y).kind === "HOME" ? SCOUT_DRONE_HOME_STEP_MS : SCOUT_DRONE_STEP_MS });
    prev = tile;
  }
  return tiles;
};

/**
 * A waypoint flight: out through every stop, then straight home, so the way
 * back reveals new ground too. When a rival border ends the route, or the
 * straight line home crosses one, it retraces its route instead. Undefined when
 * the drone could not leave at all.
 */
export const planScoutDroneWaypointFlight = (launch: Point, stops: readonly Point[], launchedAt: number, world: ScoutDroneWorld): ScoutDroneFlight | undefined => {
  const route = planScoutDroneRoute(launch, stops, world);
  const outbound: LegTile[] = [{ x: launch.x, y: launch.y, stepMs: 0 }, ...route.legs.flatMap((leg) => leg.tiles)];
  if (outbound.length < 2) return undefined;
  const blocked = route.legs.at(-1)?.blocked;
  const steps: ScoutDroneStep[] = [];
  let at = launchedAt;
  for (const tile of outbound) {
    at += tile.stepMs;
    steps.push({ x: tile.x, y: tile.y, at });
  }
  const turnIndex = steps.length - 1;
  const turn = outbound[turnIndex]!;
  const home = blocked ? undefined : straightHome(turn, launch, world);
  if (home) {
    for (const tile of home) {
      at += tile.stepMs;
      steps.push({ x: tile.x, y: tile.y, at });
    }
  } else {
    for (let i = outbound.length - 2; i >= 0; i -= 1) {
      at += outbound[i + 1]!.stepMs;
      steps.push({ x: outbound[i]!.x, y: outbound[i]!.y, at });
    }
  }
  const endReason: ScoutDroneEndReason = blocked ? "BLOCKED" : "TARGET";
  return {
    launchedAt,
    targetX: turn.x,
    targetY: turn.y,
    steps,
    turnIndex,
    landsAt: at,
    endReason,
    waypoints: route.stops.map((stop) => ({ x: stop.x, y: stop.y })),
    ...(blocked?.ownerId ? { blockedByPlayerId: blocked.ownerId, blockedAtX: blocked.x, blockedAtY: blocked.y } : {})
  };
};
