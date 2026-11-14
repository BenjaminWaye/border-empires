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

import { FRONTIER_CLAIM_MS } from "../config.js";

/** Live vision radius around the drone while it flies. */
export const SCOUT_DRONE_VISION_RADIUS = 3;
/** Tiles the drone may fly past the player's own land before it turns back. */
export const SCOUT_DRONE_MAX_RANGE_TILES = 15;
/** Own and allied land the drone may cross on one flight (bounds the plan's size). */
export const SCOUT_DRONE_MAX_HOME_TILES = 80;
/** Time per tile past the player's land: the same pace as Expand To. */
export const SCOUT_DRONE_STEP_MS = FRONTIER_CLAIM_MS;
/** Time per tile over the player's own or allied land, which it already sees. */
export const SCOUT_DRONE_HOME_STEP_MS = 1_000;
/** A rival is alerted at most once per scouting empire per this window. */
export const SCOUT_SIGHTED_ALERT_COOLDOWN_MS = 60 * 60_000;

/** PLAYER_MESSAGE: the owner's drone, sent on launch, on landing and on subscribe. */
export const SCOUT_DRONE_MESSAGE_TYPE = "SCOUT_DRONE";
/** PLAYER_MESSAGE: a rival's drone was turned back at this player's border. */
export const SCOUT_SIGHTED_MESSAGE_TYPE = "SCOUT_SIGHTED";

/** How the drone treats a tile on its line. */
export type ScoutDroneTileClass =
  | "HOME" // the player's own or allied land: crossed quickly, not counted toward range
  | "OPEN" // neutral land, sea or Planetary Defense land: counted toward range
  | "BLOCKED"; // a non-allied player's land: the drone turns back before it

export type ScoutDroneStep = { x: number; y: number; at: number };

export type ScoutDroneEndReason = "TARGET" | "RANGE" | "BLOCKED";

export type ScoutDroneFlight = {
  launchedAt: number;
  targetX: number;
  targetY: number;
  /** Outbound then return tiles in order, each with the time the drone is over it. */
  steps: ScoutDroneStep[];
  /** Index in `steps` of the turnaround tile (the last outbound tile). */
  turnIndex: number;
  landsAt: number;
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
  planetaryDefenseTiles: number;
  /** Other empires whose land the drone saw. */
  empiresSighted: string[];
};

export type ScoutDronePayload = {
  type: typeof SCOUT_DRONE_MESSAGE_TYPE;
  /** The drone in the air, or null when it is docked. */
  flight: ScoutDroneFlight | null;
  /** Set on the landing message: what the finished flight found. */
  report?: ScoutReportFindings & { targetX: number; targetY: number };
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
 * Plans a flight from the launch tile toward the target: outbound until the
 * target, the range limit, the home-land limit or a blocking border, then
 * straight back along the same tiles. Returns undefined when the drone could
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
  let open = 0;
  let home = 0;
  let endReason: ScoutDroneEndReason = "TARGET";
  let blocked: { ownerId?: string | undefined; x: number; y: number } | undefined;
  for (const tile of line.slice(1)) {
    const cls = world.classify(tile.x, tile.y);
    if (cls.kind === "BLOCKED") {
      endReason = "BLOCKED";
      blocked = { ownerId: cls.ownerId, x: tile.x, y: tile.y };
      break;
    }
    if (cls.kind === "HOME") {
      if (home >= SCOUT_DRONE_MAX_HOME_TILES) {
        endReason = "RANGE";
        break;
      }
      home += 1;
    } else {
      if (open >= SCOUT_DRONE_MAX_RANGE_TILES) {
        endReason = "RANGE";
        break;
      }
      open += 1;
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
