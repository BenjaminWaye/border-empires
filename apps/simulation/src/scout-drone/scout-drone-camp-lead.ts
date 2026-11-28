import type { DomainTileState } from "@border-empires/game-domain";
import { isScoutLeadRoute, type ScoutDroneFlight } from "@border-empires/shared";
import type { VisibilityCoverageTracker, VisibilityTransitionCallbacks } from "../visibility-coverage-cache.js";
import { isPlanetaryDefenseCampTile } from "../planetary-defense-camps/camp-rules.js";
import type { ScoutExploredLookup } from "./scout-drone-findings.js";

// The guide's camp lead (owner decision 2026-11-28, after the first-15-minutes
// playtest: minutes 8-15 went dead, Explore spent, Coin at 0, no one to fight).
// The last chapter of the tutorial guide sends the player's scout drone to the
// nearest Insurgent camp and walks them through taking it
// (packages/client/src/client-tutorial-guide/tutorial-guide-camp-steps.ts).
//
// The simulation names that camp on PLAYER_UPDATE (guideCampLead, from the live
// camp index the runtime already keeps: planetary-defense-camps/camp-index.ts,
// per season, rebuilt at boot, never saved) and the guide rings it. A flight
// that is exactly the straight route to that camp from the AFC nearest it
// (shared scout-drone-lead-route.ts) is the guided flight: it costs no charge
// (the playtesters had spent them all by then), unless a border the player
// knows of cuts it short of the camp.
//
// Owner decisions 2026-11-28 (PR #3063 review): the camp and the ring around
// it are shown when the drone ARRIVES over it, not at launch, through the same
// coverage the fog of war and camp wake-up read (as a waystation's VISION
// look), so the camp is live on the map with its attack and march options. The
// look holds until the camp falls (checked every tick) or the player moves past
// the guide's chapter (SCOUT_CAMP_LEAD_DONE from the client: it only takes the
// player's own vision away, so the client may say it). Any other Explore shows
// no camp. Once a camp falls the next unseen camp near an AFC is the new lead,
// with its own free flight.
//
// "Never seen" is the player's explored-tile memory (explored-tiles-store.ts),
// which every snapshot saves, so there is no new persisted flag: once the
// player has explored a live camp that near, there is no lead and no free
// flight until every camp they knew nearby has fallen.
// Looks live only in memory: a restart ends one early, as it docks a drone.

/** How far (wrapped Chebyshev) from the launching AFC a camp counts as "near"; start-site patrols are posted 12-35 out (season-barbarian-seed.ts PATROL_TIERS). */
export const SCOUT_CAMP_LEAD_SEARCH_RADIUS = 35;
/** The camp tile and the ring around it. */
export const SCOUT_CAMP_LEAD_REVEAL_RADIUS = 1;

type Point = { readonly x: number; readonly y: number };

export type ScoutCampLeadInput = {
  readonly playerId: string;
  /** The player's active AFCs: where the drone launches from. */
  readonly origins: readonly Point[];
  readonly campKeys: Iterable<string>;
  readonly tiles: ReadonlyMap<string, DomainTileState>;
  readonly isExplored: ScoutExploredLookup;
  readonly worldWidth: number;
  readonly worldHeight: number;
};

const wrappedChebyshev = (ax: number, ay: number, bx: number, by: number, width: number, height: number): number => {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(Math.min(dx, width - dx), Math.min(dy, height - dy));
};

/**
 * The nearest live camp within SCOUT_CAMP_LEAD_SEARCH_RADIUS of an AFC that
 * the player has never seen, or undefined when there is none or the player has
 * already explored a live camp that near. Ties go to the lower tile key, so
 * the pick doesn't depend on set order. O(live camps x AFCs); camps are at
 * most 100 (MAX_PLANETARY_DEFENSE_CAMPS).
 */
export const findScoutCampLead = (input: ScoutCampLeadInput): { x: number; y: number } | undefined => {
  let best: { x: number; y: number; d: number; key: string } | undefined;
  for (const key of input.campKeys) {
    const tile = input.tiles.get(key);
    if (!tile || !isPlanetaryDefenseCampTile(key, tile)) continue;
    let d = Infinity;
    for (const origin of input.origins) d = Math.min(d, wrappedChebyshev(origin.x, origin.y, tile.x, tile.y, input.worldWidth, input.worldHeight));
    if (d > SCOUT_CAMP_LEAD_SEARCH_RADIUS) continue;
    if (input.isExplored(input.playerId, tile.x, tile.y)) return undefined;
    if (!best || d < best.d || (d === best.d && key < best.key)) best = { x: tile.x, y: tile.y, d, key };
  }
  return best ? { x: best.x, y: best.y } : undefined;
};

/**
 * True when `stops` is the guided flight to `lead` from `launch` (the AFC nearest the camp): exactly the straight
 * route the client lays, stop for stop, so a free flight can't carry a stop anywhere else.
 */
export const isScoutCampLeadFlight = (stops: readonly Point[], lead: Point, launch: Point, worldWidth: number, worldHeight: number): boolean =>
  isScoutLeadRoute(stops, lead, launch, worldWidth, worldHeight);

export type ScoutCampLeadsDeps = {
  readonly visibilityCoverage: () => Pick<VisibilityCoverageTracker, "addTemporaryRevealCells" | "removeTemporaryRevealCells">;
  readonly visionTransitionCallbacks: () => VisibilityTransitionCallbacks;
  /** Flushes the vision edges to the client (the fanout sends them only on a TILE_DELTA_BATCH). */
  readonly flushVision: (playerId: string, commandId: string) => void;
  readonly tiles: () => ReadonlyMap<string, DomainTileState>;
};

export type ScoutCampLeadsGauge = {
  /** Looks held now: at most one per player. */
  campLeadReveals: number;
  /** Looks granted (the drone arrived over its camp) since boot. */
  campLeadsGranted: number;
  /** Looks ended because the camp fell. */
  campLeadsEndedCampFell: number;
  /** Looks ended because the player moved past the guide's chapter (SCOUT_CAMP_LEAD_DONE). */
  campLeadsEndedGuideDone: number;
  /** SCOUT_CAMP_LEAD_DONE with no look held: a no-op. */
  campLeadDoneNoLook: number;
};

export type ScoutCampLeads = {
  /** Shows the player the camp at (x, y) until it falls or they say the chapter is done, replacing a look they still hold. */
  readonly reveal: (playerId: string, at: { x: number; y: number }, commandId: string) => void;
  /** SCOUT_CAMP_LEAD_DONE: the player moved past the guide's chapter; ends their look, if any. */
  readonly release: (playerId: string, commandId: string) => void;
  /** Ends every look whose camp has fallen. */
  readonly tick: () => void;
  readonly gauge: () => ScoutCampLeadsGauge;
};

type HeldLook = { readonly at: Point; readonly cellKeys: readonly string[]; readonly commandId: string };

export const createScoutCampLeads = (deps: ScoutCampLeadsDeps): ScoutCampLeads => {
  // Bounded by the player count: one look each.
  const held = new Map<string, HeldLook>();
  let granted = 0;
  let endedCampFell = 0;
  let endedGuideDone = 0;
  let doneNoLook = 0;

  const drop = (playerId: string, look: HeldLook, commandId: string): void => {
    held.delete(playerId);
    deps.visibilityCoverage().removeTemporaryRevealCells(playerId, look.cellKeys, deps.visionTransitionCallbacks());
    deps.flushVision(playerId, `scout-camp-lead-expire:${commandId}`);
  };

  const campStands = (at: Point): boolean => {
    const key = `${at.x},${at.y}`;
    const tile = deps.tiles().get(key);
    return Boolean(tile && isPlanetaryDefenseCampTile(key, tile));
  };

  return {
    reveal: (playerId, at, commandId) => {
      const previous = held.get(playerId);
      if (previous) drop(playerId, previous, previous.commandId);
      const cellKeys = deps.visibilityCoverage().addTemporaryRevealCells(playerId, at.x, at.y, SCOUT_CAMP_LEAD_REVEAL_RADIUS, deps.visionTransitionCallbacks());
      held.set(playerId, { at: { x: at.x, y: at.y }, cellKeys, commandId });
      granted += 1;
      deps.flushVision(playerId, `scout-camp-lead:${commandId}`);
    },
    release: (playerId, commandId) => {
      const look = held.get(playerId);
      if (!look) {
        doneNoLook += 1;
        return;
      }
      endedGuideDone += 1;
      drop(playerId, look, commandId);
    },
    tick: () => {
      for (const [playerId, look] of [...held]) {
        if (campStands(look.at)) continue;
        endedCampFell += 1;
        drop(playerId, look, look.commandId);
      }
    },
    gauge: () => ({ campLeadReveals: held.size, campLeadsGranted: granted, campLeadsEndedCampFell: endedCampFell, campLeadsEndedGuideDone: endedGuideDone, campLeadDoneNoLook: doneNoLook })
  };
};

export type ScoutCampLeadFlightsDeps = Omit<ScoutCampLeadsDeps, "tiles"> & {
  readonly tiles: () => ReadonlyMap<string, DomainTileState>;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly afcTileKeys: (playerId: string) => Iterable<string>;
  /** The player's active AFC nearest a point: where the guided flight launches from. */
  readonly nearestAfc: (playerId: string, at: Point) => Point | undefined;
  readonly liveCampKeys?: (() => Iterable<string>) | undefined;
  readonly isExplored?: ScoutExploredLookup | undefined;
};

export type ScoutCampLeadFlightsGauge = ScoutCampLeadsGauge & {
  /** Guided flights launched free. */
  campLeadFreeFlights: number;
  /** Guided routes a border the player knows of cut short of the camp: charged as ordinary flights. */
  campLeadRoutesCutShort: number;
  /** Free guided flights that landed without reaching the camp (a border met on the way, or recalled): no look. */
  campLeadFlightsUnarrived: number;
};

export type ScoutCampLeadFlights = {
  /** The guide's camp lead for PLAYER_UPDATE guideCampLead: the nearest live camp to the player's active AFCs they have never seen. */
  readonly campLeadFor: (playerId: string) => Point | undefined;
  /** The lead and the AFC it launches from, when `stops` is the guided flight to it. */
  readonly guidedFlight: (playerId: string, stops: readonly Point[]) => { lead: Point; launch: Point } | undefined;
  /** The planned guided flight reaches its camp, so it is free; one cut short is counted and charged. */
  readonly confirmFree: (flight: Pick<ScoutDroneFlight, "endReason" | "targetX" | "targetY">, lead: Point) => boolean;
  /** The drone is over `step`: when that is its camp, the look starts. True when it did. */
  readonly arriveIfOver: (playerId: string, lead: Point, step: Point, commandId: string) => boolean;
  /** A free guided flight landed without reaching its camp. */
  readonly landedShort: () => void;
  readonly release: ScoutCampLeads["release"];
  readonly tick: ScoutCampLeads["tick"];
  readonly gauge: () => ScoutCampLeadFlightsGauge;
};

export const createScoutCampLeadFlights = (deps: ScoutCampLeadFlightsDeps): ScoutCampLeadFlights => {
  const looks = createScoutCampLeads(deps);
  let freeFlights = 0;
  let routesCutShort = 0;
  let flightsUnarrived = 0;

  const campLeadFor = (playerId: string): Point | undefined => {
    if (!deps.liveCampKeys || !deps.isExplored) return undefined;
    const origins: Point[] = [];
    for (const key of deps.afcTileKeys(playerId)) {
      const tile = deps.tiles().get(key);
      if (tile?.afc?.status === "active") origins.push({ x: tile.x, y: tile.y });
    }
    if (origins.length === 0) return undefined;
    return findScoutCampLead({ playerId, origins, campKeys: deps.liveCampKeys(), tiles: deps.tiles(), isExplored: deps.isExplored, worldWidth: deps.worldWidth, worldHeight: deps.worldHeight });
  };

  return {
    campLeadFor,
    guidedFlight: (playerId, stops) => {
      const lead = campLeadFor(playerId);
      // From the AFC nearest the camp, as the client lays the route (client-scout-drone-plan.ts scoutLaunchAfc).
      const launch = lead ? deps.nearestAfc(playerId, lead) : undefined;
      return lead && launch && isScoutCampLeadFlight(stops, lead, launch, deps.worldWidth, deps.worldHeight) ? { lead, launch } : undefined;
    },
    confirmFree: (flight, lead) => {
      const reaches = flight.endReason !== "BLOCKED" && flight.targetX === lead.x && flight.targetY === lead.y;
      if (reaches) freeFlights += 1;
      else routesCutShort += 1;
      return reaches;
    },
    arriveIfOver: (playerId, lead, step, commandId) => {
      if (step.x !== lead.x || step.y !== lead.y) return false;
      looks.reveal(playerId, lead, commandId);
      return true;
    },
    landedShort: () => {
      flightsUnarrived += 1;
    },
    release: looks.release,
    tick: looks.tick,
    gauge: () => ({ ...looks.gauge(), campLeadFreeFlights: freeFlights, campLeadRoutesCutShort: routesCutShort, campLeadFlightsUnarrived: flightsUnarrived })
  };
};
