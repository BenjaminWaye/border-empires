// Waypoint flights for the scout drone (docs/explore-scout-plan.md §13). The
// player places up to SCOUT_DRONE_MAX_STOPS stops; the drone flies from its AFC
// through each in turn, then home: straight, or the shortest way round rival borders when quicker than retracing. Each leg reaches at most
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
  scoutDroneStepIndexAt,
  type ScoutDroneEndReason,
  type ScoutDroneFlight,
  type ScoutDroneStep,
  type ScoutDroneWorld
} from "./scout-drone.js";
import { scoutDroneHomePath } from "./scout-drone-home-path.js";

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
    const home = world.classify(tile.x, tile.y).kind === "HOME";
    // Range first: a rival border just past the leg's limit is never reached, so it must not end the route.
    if (!home && open >= SCOUT_DRONE_MAX_LEG_TILES) return { tiles, end: prev, clamped: true };
    const wall = scoutDroneBlockAt(prev, tile, world);
    if (wall) return { tiles, end: prev, clamped: false, blocked: wall };
    if (!home) open += 1;
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

/**
 * A waypoint flight: out through every stop, then straight home, so the way
 * back reveals new ground too. When a rival border lies across the line home it
 * takes the shortest way round (scoutDroneHomePath), retracing its route only
 * when that is quicker. Undefined when the drone could not leave at all.
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
  // Retracing takes as long as the flight out, so a way home must beat that.
  const home = scoutDroneHomePath(turn, launch, world, at - launchedAt);
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

/**
 * The flight cut short over outbound step `turnIndex` -- a rival border ahead (`blocked`) or
 * a recall (no `blocked`) -- then home from there by the short way, like a finished route; it
 * retraces only when no way round is quicker the rival borders. Leaves no earlier than `nowMs`.
 */
export const turnScoutDroneFlightHome = (
  flight: ScoutDroneFlight,
  turnIndex: number,
  nowMs: number,
  world: ScoutDroneWorld,
  blocked?: Block
): ScoutDroneFlight => {
  const outbound = flight.steps.slice(0, Math.max(0, Math.min(turnIndex, flight.turnIndex)) + 1).map((step) => ({ ...step }));
  const turn = outbound.at(-1)!;
  const launch = flight.steps[0]!;
  const reachedStopIndexes = stopStepIndexes(flight).map((index) => (index >= 0 && index < outbound.length ? index : -1));
  const steps: ScoutDroneStep[] = [...outbound];
  let at = Math.max(nowMs, turn.at);
  const home = scoutDroneHomePath(turn, launch, world, turn.at - outbound[0]!.at);
  if (home) {
    for (const tile of home) {
      at += tile.stepMs;
      steps.push({ x: tile.x, y: tile.y, at });
    }
  } else {
    for (let i = outbound.length - 2; i >= 0; i -= 1) {
      at += outbound[i + 1]!.at - outbound[i]!.at;
      steps.push({ x: outbound[i]!.x, y: outbound[i]!.y, at });
    }
  }
  const { blockedByPlayerId: _id, blockedAtX: _x, blockedAtY: _y, ...rest } = flight;
  return {
    ...rest,
    steps,
    turnIndex: outbound.length - 1,
    landsAt: at,
    endReason: blocked ? "BLOCKED" : "RECALLED",
    // Stops past the turn are abandoned: adding stops later must not bring them back.
    ...(flight.waypoints ? { waypoints: flight.waypoints.filter((_, i) => (reachedStopIndexes[i] ?? -1) >= 0) } : {}),
    ...(blocked?.ownerId ? { blockedByPlayerId: blocked.ownerId, blockedAtX: blocked.x, blockedAtY: blocked.y } : {})
  };
};

/** Outbound step index of each stop the flight has as `waypoints`, in order (-1 when not found). */
const stopStepIndexes = (flight: ScoutDroneFlight): number[] => {
  const indexes: number[] = [];
  let from = 0;
  for (const stop of flight.waypoints ?? [{ x: flight.targetX, y: flight.targetY }]) {
    let found = -1;
    for (let i = from; i <= flight.turnIndex; i += 1) {
      if (flight.steps[i]!.x === stop.x && flight.steps[i]!.y === stop.y) {
        found = i;
        break;
      }
    }
    indexes.push(found);
    if (found >= 0) from = found;
  }
  return indexes;
};

export type ScoutDroneExtension = {
  readonly flight: ScoutDroneFlight;
  /** How many of `newStops` the drone will reach (each costs a charge). */
  readonly newStopsReached: number;
};

/**
 * More stops for a drone already in the air: from the tile it is flying toward it flies on
 * through the stops it hasn't reached yet, then `newStops`, then home by the short way (retracing
 * only when no way round the rival borders is quicker). A drone already on its way home turns from there.
 * Steps already flown keep their times. Undefined once it has landed or has nowhere new to go.
 */
export const extendScoutDroneFlight = (
  flight: ScoutDroneFlight,
  nowMs: number,
  newStops: readonly Point[],
  world: ScoutDroneWorld
): ScoutDroneExtension | undefined => {
  if (nowMs >= flight.landsAt || newStops.length === 0) return undefined;
  const index = Math.max(0, scoutDroneStepIndexAt(flight, nowMs));
  const resumeIndex = Math.min(index + 1, flight.steps.length - 1);
  const resume = flight.steps[resumeIndex]!;
  const waypoints = flight.waypoints ?? [{ x: flight.targetX, y: flight.targetY }];
  const stopSteps = stopStepIndexes(flight);
  const reached = waypoints.filter((_, i) => resumeIndex > flight.turnIndex || (stopSteps[i]! >= 0 && stopSteps[i]! <= resumeIndex));
  const remaining = resumeIndex > flight.turnIndex ? [] : waypoints.slice(reached.length);
  const route = planScoutDroneRoute(resume, [...remaining, ...newStops], world);
  const newStopsReached = Math.max(0, route.legs.length - remaining.length);
  const legTiles = route.legs.flatMap((leg) => leg.tiles);
  if (newStopsReached === 0 || legTiles.length === 0) return undefined;
  const steps: ScoutDroneStep[] = flight.steps.slice(0, resumeIndex + 1).map((step) => ({ ...step }));
  let at = steps.at(-1)!.at;
  for (const tile of legTiles) {
    at += tile.stepMs;
    steps.push({ x: tile.x, y: tile.y, at });
  }
  const turnIndex = steps.length - 1;
  const turn = steps[turnIndex]!;
  const launch = flight.steps[0]!;
  const blocked = route.legs.at(-1)?.blocked;
  const home = scoutDroneHomePath(turn, launch, world, turn.at - steps[0]!.at);
  if (home) {
    for (const tile of home) {
      at += tile.stepMs;
      steps.push({ x: tile.x, y: tile.y, at });
    }
  } else {
    for (let i = turnIndex - 1; i >= 0; i -= 1) {
      at += steps[i + 1]!.at - steps[i]!.at;
      steps.push({ x: steps[i]!.x, y: steps[i]!.y, at });
    }
  }
  const { blockedByPlayerId: _id, blockedAtX: _x, blockedAtY: _y, ...rest } = flight;
  return {
    newStopsReached,
    flight: {
      ...rest,
      targetX: turn.x,
      targetY: turn.y,
      steps,
      turnIndex,
      landsAt: at,
      endReason: blocked ? "BLOCKED" : "TARGET",
      waypoints: [...reached, ...route.stops].map((stop) => ({ x: stop.x, y: stop.y })),
      ...(blocked?.ownerId ? { blockedByPlayerId: blocked.ownerId, blockedAtX: blocked.x, blockedAtY: blocked.y } : {})
    }
  };
};
