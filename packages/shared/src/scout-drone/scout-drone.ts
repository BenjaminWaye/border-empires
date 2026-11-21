// Explore: AFC scout drones (docs/explore-scout-plan.md). Tapping an
// unexplored tile launches the player's scout drone from their AFC. It flies a
// straight line toward the tile, gives the player live vision around itself,
// claims nothing, and flies home. One drone per player is in the air at a
// time and the first version is free.
//
// This module holds the rules both the simulation and the client need: the
// constants, the flight plan (which tiles, at what times) and the wire
// payloads. The plan is a pure function of the launch tile, the target, the
// launch time and how each tile on the line is classified, so the client can
// draw exactly the flight the server runs.

import type { ScoutDroneCharges } from "./scout-drone-charges.js";

/** Live vision radius around the drone while it flies. */
export const SCOUT_DRONE_VISION_RADIUS = 3;
/** Time per tile past the player's land (3s since 2026-11-21: 1s explored too fast; was Expand To's 7.5s before 2026-11-20). */
export const SCOUT_DRONE_STEP_MS = 3_000;
/** Time per tile over home ground (own and allied land and reach), which the player already sees. */
export const SCOUT_DRONE_HOME_STEP_MS = 1_000;
/** A player's scout reports reach the shared Activity log at most this often (the feed still gets every one). */
export const SCOUT_REPORT_ACTIVITY_MIN_INTERVAL_MS = 10 * 60_000;
/** A rival is alerted at most once per scouting empire per this window. */
export const SCOUT_SIGHTED_ALERT_COOLDOWN_MS = 60 * 60_000;

/** PLAYER_MESSAGE: the owner's drone, sent on launch, on landing and on subscribe. */
export const SCOUT_DRONE_MESSAGE_TYPE = "SCOUT_DRONE";
/** PLAYER_MESSAGE: a rival's drone was turned back at this player's border. */
export const SCOUT_SIGHTED_MESSAGE_TYPE = "SCOUT_SIGHTED";

/** How the drone treats a tile on its line. */
export type ScoutDroneTileClass =
  | "HOME" // the player's own or allied land, or unclaimed own or allied reach: crossed quickly
  | "OPEN" // neutral land, sea or Planetary Defense land: flown at Expand To pace
  | "BLOCKED"; // a non-allied player's land: the drone turns back before it

export type ScoutDroneStep = { x: number; y: number; at: number };

/**
 * RECALLED: the owner called it home early (RECALL_SCOUT). There is no RANGE
 * reason: the drone has had no range limit since 2026-11-20 (a farther target
 * only means a longer flight). A client parses an unknown reason as TARGET.
 */
export type ScoutDroneEndReason = "TARGET" | "BLOCKED" | "RECALLED";

export type ScoutDroneFlight = {
  launchedAt: number;
  targetX: number;
  targetY: number;
  /** Outbound then return tiles in order, each with the time the drone is over it. */
  steps: ScoutDroneStep[];
  /** Index in `steps` of the turnaround tile (the last outbound tile). */
  turnIndex: number;
  landsAt: number;
  /** The stops of a waypoint flight as the drone reaches them (scout-drone-route.ts); absent on a single-target flight. */
  waypoints?: Array<{ x: number; y: number }>;
  endReason: ScoutDroneEndReason;
  /** Owner of the border that turned the drone back, when endReason is BLOCKED. */
  blockedByPlayerId?: string;
  blockedAtX?: number;
  blockedAtY?: number;
};

export type ScoutReportFindings = {
  towns: number;
  docks: number;
  waystations: number;
  watchtowers: number;
  resourceTiles: number;
  resourcesSighted?: Array<{ resource: string; count: number }>;
  planetaryDefenseTiles: number;
  /** Other empires whose land the drone saw. */
  empiresSighted: string[];
  /** The most notable find (first town, else dock, waystation, watchtower, resource, empire, Planetary Defense); absent when nothing was found. */
  focusX?: number;
  focusY?: number;
};

export type ScoutDronePayload = {
  type: typeof SCOUT_DRONE_MESSAGE_TYPE;
  /** The drone in the air, or null when it is docked. */
  flight: ScoutDroneFlight | null;
  /** Every SCOUT_DRONE carries the player's charges (scout-drone-charges.ts), server clock. */
  charges?: ScoutDroneCharges;
  /** Set on the landing message: what the finished flight found. */
  report?: ScoutReportFindings & { targetX: number; targetY: number; blockedByPlayerId?: string };
};

export type ScoutSightedPayload = {
  type: typeof SCOUT_SIGHTED_MESSAGE_TYPE;
  scoutPlayerId: string;
  x: number;
  y: number;
};

export type ScoutDroneWorld = {
  width: number;
  height: number;
  classify: (x: number, y: number) => { kind: ScoutDroneTileClass; ownerId?: string | undefined };
};

const wrap = (v: number, size: number): number => ((v % size) + size) % size;
const shortestDelta = (from: number, to: number, size: number): number => {
  const raw = wrap(to - from, size);
  return raw > size / 2 ? raw - size : raw;
};

/** Tiles on the straight line from `from` to `to` (both included), on a wrapping map. */
export const scoutDroneLine = (
  from: { x: number; y: number },
  to: { x: number; y: number },
  width: number,
  height: number
): Array<{ x: number; y: number }> => {
  const dx = shortestDelta(from.x, to.x, width);
  const dy = shortestDelta(from.y, to.y, height);
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const line: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    line.push({ x: wrap(from.x + Math.round(dx * t), width), y: wrap(from.y + Math.round(dy * t), height) });
  }
  return line;
};

/**
 * The rival border that stops a step from `from` to the neighbouring `to`:
 * `to` itself, or, on a diagonal step, a corner squeezed shut by rival land
 * on both sides (a drone can't slip between two touching border tiles).
 */
export const scoutDroneBlockAt = (
  from: { x: number; y: number },
  to: { x: number; y: number },
  world: ScoutDroneWorld
): { ownerId?: string | undefined; x: number; y: number } | undefined => {
  const direct = world.classify(to.x, to.y);
  if (direct.kind === "BLOCKED") return { ownerId: direct.ownerId, x: to.x, y: to.y };
  if (from.x === to.x || from.y === to.y) return undefined;
  const a = world.classify(to.x, from.y);
  const b = world.classify(from.x, to.y);
  if (a.kind === "BLOCKED" && b.kind === "BLOCKED") return { ownerId: a.ownerId, x: to.x, y: from.y };
  return undefined;
};

/**
 * Plans a flight from the launch tile toward the target: outbound until the
 * target or a blocking border, then straight back along the same tiles. There
 * is no range limit: a farther target only takes longer (Expand To pace over
 * open ground). The plan stays bounded because the line takes the short way
 * round the wrapping map, so it is at most half the map's width or height. Returns undefined when the drone could
 * not leave at all (the very first tile past the AFC is blocked).
 */
export const planScoutDroneFlight = (
  launch: { x: number; y: number },
  target: { x: number; y: number },
  launchedAt: number,
  world: ScoutDroneWorld
): ScoutDroneFlight | undefined => {
  const line = scoutDroneLine(launch, target, world.width, world.height);
  const outbound: Array<{ x: number; y: number; stepMs: number }> = [{ x: launch.x, y: launch.y, stepMs: 0 }];
  let endReason: ScoutDroneEndReason = "TARGET";
  let blocked: { ownerId?: string | undefined; x: number; y: number } | undefined;
  let prev = launch;
  for (const tile of line.slice(1)) {
    const cls = world.classify(tile.x, tile.y);
    const wall = scoutDroneBlockAt(prev, tile, world);
    prev = tile;
    if (wall) {
      endReason = "BLOCKED";
      blocked = wall;
      break;
    }
    outbound.push({ x: tile.x, y: tile.y, stepMs: cls.kind === "HOME" ? SCOUT_DRONE_HOME_STEP_MS : SCOUT_DRONE_STEP_MS });
  }
  if (outbound.length < 2) return undefined;
  const steps: ScoutDroneStep[] = [];
  let at = launchedAt;
  for (const tile of outbound) {
    at += tile.stepMs;
    steps.push({ x: tile.x, y: tile.y, at });
  }
  const turnIndex = steps.length - 1;
  // Home: the same tiles in reverse, each leg taking as long as it did outbound.
  for (let i = outbound.length - 2; i >= 0; i -= 1) {
    at += outbound[i + 1]!.stepMs;
    steps.push({ x: outbound[i]!.x, y: outbound[i]!.y, at });
  }
  return {
    launchedAt,
    targetX: target.x,
    targetY: target.y,
    steps,
    turnIndex,
    landsAt: at,
    endReason,
    ...(blocked?.ownerId ? { blockedByPlayerId: blocked.ownerId, blockedAtX: blocked.x, blockedAtY: blocked.y } : {})
  };
};

/**
 * The same flight turned back early: it stops over outbound step `turnIndex`
 * (because the next tile became a rival's border mid-flight) and flies the
 * tiles before it home, leaving no earlier than `nowMs`, each leg as long as
 * it was outbound.
 */
export const turnScoutDroneFlightBack = (
  flight: ScoutDroneFlight,
  turnIndex: number,
  nowMs: number,
  blocked: { ownerId?: string | undefined; x: number; y: number }
): ScoutDroneFlight => {
  const outbound = flight.steps.slice(0, Math.max(0, Math.min(turnIndex, flight.turnIndex)) + 1);
  const steps: ScoutDroneStep[] = outbound.map((step) => ({ ...step }));
  let at = Math.max(nowMs, outbound.at(-1)!.at);
  for (let i = outbound.length - 2; i >= 0; i -= 1) {
    at += outbound[i + 1]!.at - outbound[i]!.at;
    steps.push({ x: outbound[i]!.x, y: outbound[i]!.y, at });
  }
  const { blockedByPlayerId: _id, blockedAtX: _x, blockedAtY: _y, ...rest } = flight;
  return {
    ...rest,
    steps,
    turnIndex: outbound.length - 1,
    landsAt: at,
    endReason: "BLOCKED",
    ...(blocked.ownerId ? { blockedByPlayerId: blocked.ownerId, blockedAtX: blocked.x, blockedAtY: blocked.y } : {})
  };
};

/**
 * The owner calls the drone home early: it turns back over `turnIndex` and flies
 * the same tiles home at the same pace, like a border turn-back but with no rival
 * to blame. Pass the outbound tile it is flying toward, not the one it last
 * reached: the drone finishes its current leg, so it never jumps back on screen
 * and every homeward leg keeps its outbound time.
 */
export const recallScoutDroneFlight = (flight: ScoutDroneFlight, turnIndex: number, nowMs: number): ScoutDroneFlight => {
  const turned = turnScoutDroneFlightBack(flight, turnIndex, nowMs, { x: flight.targetX, y: flight.targetY });
  return { ...turned, endReason: "RECALLED" };
};

/**
 * Ground on the drone's path that became home ground (the player's or an
 * ally's land or reach) mid-flight: the legs over it drop to home pace, so the
 * drone jumps forward. A leg's pace follows its outer tile (the tile flown
 * into on the way out, the tile flown out of on the way home), as in the plan.
 * Legs only ever get faster: losing that ground again doesn't slow the drone.
 * The leg in progress ends no earlier than `nowMs`, so the drone may jump
 * straight onto the tile it was flying toward but never past it. Tiles,
 * turnaround and range are unchanged. Undefined when no remaining leg got
 * faster. Runs every tick for every drone, so it only reads until a leg
 * changes, and asks `isHome` only about legs still slower than home pace.
 */
export const speedUpScoutDroneFlight = (
  flight: ScoutDroneFlight,
  nowMs: number,
  isHome: (x: number, y: number) => boolean
): ScoutDroneFlight | undefined => {
  const index = scoutDroneStepIndexAt(flight, nowMs);
  if (index < 0 || index >= flight.steps.length - 1) return undefined;
  let steps: ScoutDroneStep[] | undefined;
  for (let j = index + 1; j < flight.steps.length; j += 1) {
    const duration = flight.steps[j]!.at - flight.steps[j - 1]!.at;
    const outer = j <= flight.turnIndex ? flight.steps[j]! : flight.steps[j - 1]!;
    const faster = duration > SCOUT_DRONE_HOME_STEP_MS && isHome(outer.x, outer.y);
    if (!faster && !steps) continue;
    steps ??= flight.steps.map((step) => ({ ...step }));
    let at = steps[j - 1]!.at + (faster ? SCOUT_DRONE_HOME_STEP_MS : duration);
    if (j === index + 1) at = Math.max(nowMs, at);
    steps[j]!.at = at;
  }
  if (!steps || steps.at(-1)!.at === flight.landsAt) return undefined;
  return { ...flight, steps, landsAt: steps.at(-1)!.at };
};

/** Index of the step the drone is over at `nowMs` (the last step whose time has come), or -1 before the first. */
export const scoutDroneStepIndexAt = (flight: ScoutDroneFlight, nowMs: number): number => {
  let index = -1;
  for (let i = 0; i < flight.steps.length; i += 1) {
    if (flight.steps[i]!.at > nowMs) break;
    index = i;
  }
  return index;
};

/**
 * The drone's position at `nowMs` in tile units, eased between steps for
 * drawing. `x`/`y` may lie just outside the map near a wrap seam; renderers
 * already wrap positions relative to the camera. Undefined once it has landed.
 */
export const scoutDronePositionAt = (
  flight: ScoutDroneFlight,
  nowMs: number,
  width: number,
  height: number
): { x: number; y: number; heading: number; returning: boolean } | undefined => {
  if (nowMs >= flight.landsAt || flight.steps.length === 0) return undefined;
  const first = flight.steps[0]!;
  if (nowMs <= first.at) return { x: first.x, y: first.y, heading: 0, returning: false };
  const index = scoutDroneStepIndexAt(flight, nowMs);
  const from = flight.steps[index]!;
  const to = flight.steps[Math.min(index + 1, flight.steps.length - 1)]!;
  const span = Math.max(1, to.at - from.at);
  const t = Math.min(1, Math.max(0, (nowMs - from.at) / span));
  const dx = shortestDelta(from.x, to.x, width);
  const dy = shortestDelta(from.y, to.y, height);
  return { x: from.x + dx * t, y: from.y + dy * t, heading: Math.atan2(dy, dx), returning: index >= flight.turnIndex };
};
