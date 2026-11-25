import {
  SCOUT_DRONE_VISION_RADIUS,
  rerouteScoutDroneFlightHome,
  scoutDroneBlockAt,
  turnScoutDroneFlightHome,
  type ScoutDroneFlight
} from "@border-empires/shared";
import type { ScoutChargeLedger } from "./scout-drone-charge-ledger.js";
import type { ScoutDroneWorlds } from "./scout-drone-worlds.js";

// What a scout drone does when its next tile meets a rival border (docs/explore-scout-plan.md §13).
// Routes are planned on what the player can see (scout-drone-worlds.ts), so a border in fog is met
// only in flight: on the way out the drone turns home and the stops past the border are refunded;
// on the way home it goes round. Either way it first moves its reveal over the tile before the
// border, so the border is in sight, and keeps the border tiles it saw for the rest of the flight.
// When it cannot go round (no way found, its AFC taken, or past the reroute cap) it keeps its route
// over that land for the rest of the flight: the rival sees it, as on the way out, and it never
// searches again, so a blocked way home costs one search, not one per step (review of PR #2966).

/** Times one flight goes round a border on its way home; past this it keeps its route (counted once in homeRerouteCapHits). */
export const SCOUT_DRONE_MAX_HOME_REROUTES = 16;

/** The parts of a flight in the air this module reads and replaces. */
export type ScoutBorderFlight = {
  readonly playerId: string;
  readonly commandId: string;
  flight: ScoutDroneFlight;
  lastStepIndex: number;
  revealAt: { x: number; y: number } | undefined;
  /** Rival tiles this drone has met in flight: at most ~49 per border met, and a flight meets at most SCOUT_DRONE_MAX_HOME_REROUTES on the way home. */
  readonly bordersSeen: Set<string>;
  homeReroutes: number;
  /** Set once the drone gave up going round on its way home: it flies its route from then on. */
  homeRouteKept: boolean;
};

/** A rival who saw the drone: at the border tile it met. */
export type ScoutSighting = { readonly rivalId: string; readonly x: number; readonly y: number };

export type ScoutDroneBorderDeps<F extends ScoutBorderFlight> = {
  readonly worlds: ScoutDroneWorlds;
  readonly charges: Pick<ScoutChargeLedger, "refund">;
  readonly moveReveal: (active: F, to: { x: number; y: number }) => void;
  /** Alerts the rival the flight was blocked by, or `sighting`'s rival when given. */
  readonly alertRival: (active: F, nowMs: number, sighting?: ScoutSighting) => void;
  /** Sends the owner the replaced flight under `${prefix}${commandId}`. */
  readonly sendFlight: (active: F, prefix: "scout-drone-turned:" | "scout-drone-rerouted:") => void;
};

export type ScoutDroneBorderGauge = {
  /** Times a rival border met on the way out turned the drone back. */
  borderTurnBacks: number;
  /** Times a rival border on the way home sent the drone round it. */
  homeReroutes: number;
  /** Charges given back for stops past a border the drone was turned back at. */
  chargesRefunded: number;
  /** Flights that reached SCOUT_DRONE_MAX_HOME_REROUTES and kept their route over the next border. */
  homeRerouteCapHits: number;
  /** Flights that found no way round a border on their way home (or their AFC taken) and kept their route over it. */
  homeRerouteFailures: number;
};

export const createScoutDroneBorders = <F extends ScoutBorderFlight>(deps: ScoutDroneBorderDeps<F>) => {
  const gauge: ScoutDroneBorderGauge = { borderTurnBacks: 0, homeReroutes: 0, chargesRefunded: 0, homeRerouteCapHits: 0, homeRerouteFailures: 0 };

  /** The rival border between outbound or homeward steps `stepIndex - 1` and `stepIndex`, on the live map. */
  const wallAt = (active: F, stepIndex: number) =>
    scoutDroneBlockAt(active.flight.steps[stepIndex - 1]!, active.flight.steps[stepIndex]!, deps.worlds.truth(active.playerId));

  /** The drone over the last tile before a border: its reveal moves there, and the border it sees is kept for this flight. */
  const meetBorder = (active: F, tile: { x: number; y: number }): void => {
    if (active.revealAt?.x !== tile.x || active.revealAt.y !== tile.y) deps.moveReveal(active, { x: tile.x, y: tile.y });
    deps.worlds.noteBordersAround(active.playerId, tile.x, tile.y, SCOUT_DRONE_VISION_RADIUS, active.bordersSeen);
  };

  /** A rival border on the next outbound tile (in fog at planning, claimed since, or an alliance ended): turn back now. True when it did. */
  const turnBackIfBlocked = (active: F, stepIndex: number, nowMs: number): boolean => {
    if (stepIndex <= 0) return false;
    const wall = wallAt(active, stepIndex);
    if (!wall) return false;
    meetBorder(active, active.flight.steps[stepIndex - 1]!);
    const stopsBefore = active.flight.waypoints?.length ?? 1;
    active.flight = turnScoutDroneFlightHome(active.flight, stepIndex - 1, nowMs, deps.worlds.known(active.playerId, active.bordersSeen), wall);
    active.lastStepIndex = stepIndex - 1;
    // Each stop was charged at launch. The leg cut short still costs one, as a route cut at a border the
    // player could see does; the stops past the border were never reached, so they come back.
    const unreached = stopsBefore - (active.flight.waypoints?.length ?? 1) - 1;
    deps.charges.refund(active.playerId, unreached, nowMs);
    gauge.chargesRefunded += Math.max(0, unreached);
    gauge.borderTurnBacks += 1;
    deps.alertRival(active, nowMs);
    deps.sendFlight(active, "scout-drone-turned:");
    return true;
  };

  /** No going round: the drone flies on over the rival's land, never stranded, and the rival sees it cross. */
  const keepRoute = (active: F, wall: { ownerId?: string | undefined; x: number; y: number }, nowMs: number): void => {
    active.homeRouteKept = true;
    if (wall.ownerId) deps.alertRival(active, nowMs, { rivalId: wall.ownerId, x: wall.x, y: wall.y });
  };

  /**
   * A rival border on the next homeward tile: the way home was planned on what the player could see, so
   * it can run into land they could not (or land claimed since). The drone goes round it from the tile
   * before. True when it did; with no way round, or past the cap, it keeps its route (keepRoute).
   */
  const rerouteHomeIfBlocked = (active: F, stepIndex: number, nowMs: number): boolean => {
    if (stepIndex <= active.flight.turnIndex || active.homeRouteKept) return false;
    const wall = wallAt(active, stepIndex);
    if (!wall) return false;
    if (active.homeReroutes >= SCOUT_DRONE_MAX_HOME_REROUTES) {
      gauge.homeRerouteCapHits += 1;
      keepRoute(active, wall, nowMs);
      return false;
    }
    meetBorder(active, active.flight.steps[stepIndex - 1]!);
    const rerouted = rerouteScoutDroneFlightHome(active.flight, stepIndex - 1, nowMs, deps.worlds.known(active.playerId, active.bordersSeen));
    if (!rerouted) {
      gauge.homeRerouteFailures += 1;
      keepRoute(active, wall, nowMs);
      return false;
    }
    active.flight = rerouted;
    active.lastStepIndex = stepIndex - 1;
    active.homeReroutes += 1;
    gauge.homeReroutes += 1;
    deps.sendFlight(active, "scout-drone-rerouted:");
    return true;
  };

  return {
    /** Outbound step: turn back at a border. Homeward step: go round one. True when the flight was replaced. */
    meetIfBlocked: (active: F, stepIndex: number, nowMs: number): boolean =>
      stepIndex <= active.flight.turnIndex ? turnBackIfBlocked(active, stepIndex, nowMs) : rerouteHomeIfBlocked(active, stepIndex, nowMs),
    gauge: (): ScoutDroneBorderGauge => ({ ...gauge })
  };
};
