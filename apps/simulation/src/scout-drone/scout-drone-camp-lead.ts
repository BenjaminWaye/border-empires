import type { DomainTileState } from "@border-empires/game-domain";
import { SCOUT_DRONE_MAX_LEG_TILES } from "@border-empires/shared";
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
// whose last stop is that camp is the guided flight: it costs no charge (the
// playtesters had spent them all by then) and shows the camp and the ring
// around it for SCOUT_CAMP_LEAD_REVEAL_TTL_MS, through the same coverage the
// fog of war and camp wake-up read (as a waystation's VISION look), so the camp
// is live on the map, with its attack and march options, while the guide
// teaches the attack; then it drops to remembered fog. Any other Explore shows
// no camp (the always-on reveal this branch first shipped was dropped).
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
export const SCOUT_CAMP_LEAD_REVEAL_TTL_MS = 10 * 60_000;

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

/** Each leg of a lead route a little under the drone's range, as the client lays it (client-scout-drone-lead-route.ts). */
const LEAD_ROUTE_LEG_TILES = SCOUT_DRONE_MAX_LEG_TILES - 2;

/**
 * True when `stops` is the guided flight to `lead` from `launch`: it ends on the
 * camp and has no more stops than the legs the straight route there needs, so
 * a free flight can't carry extra stops elsewhere.
 */
export const isScoutCampLeadFlight = (stops: readonly Point[], lead: Point, launch: Point, worldWidth: number, worldHeight: number): boolean => {
  const last = stops.at(-1);
  if (!last || last.x !== lead.x || last.y !== lead.y) return false;
  const legs = Math.max(1, Math.ceil(wrappedChebyshev(launch.x, launch.y, lead.x, lead.y, worldWidth, worldHeight) / LEAD_ROUTE_LEG_TILES));
  return stops.length <= legs;
};

export type ScoutCampLeadsDeps = {
  readonly visibilityCoverage: () => Pick<VisibilityCoverageTracker, "addTemporaryRevealCells" | "removeTemporaryRevealCells">;
  readonly visionTransitionCallbacks: () => VisibilityTransitionCallbacks;
  /** Flushes the vision edges to the client (the fanout sends them only on a TILE_DELTA_BATCH). */
  readonly flushVision: (playerId: string, commandId: string) => void;
};

export type ScoutCampLeadsGauge = {
  /** Looks held now: at most one per player. */
  campLeadReveals: number;
  /** Looks granted since boot. */
  campLeadsGranted: number;
};

export type ScoutCampLeads = {
  /** Shows the player the camp at (x, y) until `nowMs` + TTL, replacing a look they still hold. */
  readonly reveal: (playerId: string, at: { x: number; y: number }, nowMs: number, commandId: string) => void;
  readonly tick: (nowMs: number) => void;
  readonly gauge: () => ScoutCampLeadsGauge;
};

type HeldLook = { readonly cellKeys: readonly string[]; readonly expiresAt: number; readonly commandId: string };

export const createScoutCampLeads = (deps: ScoutCampLeadsDeps): ScoutCampLeads => {
  // Bounded by the player count (one look each) and by the TTL.
  const held = new Map<string, HeldLook>();
  let granted = 0;

  const drop = (playerId: string, look: HeldLook): void => {
    held.delete(playerId);
    deps.visibilityCoverage().removeTemporaryRevealCells(playerId, look.cellKeys, deps.visionTransitionCallbacks());
    deps.flushVision(playerId, `scout-camp-lead-expire:${look.commandId}`);
  };

  return {
    reveal: (playerId, at, nowMs, commandId) => {
      const previous = held.get(playerId);
      if (previous) drop(playerId, previous);
      const cellKeys = deps.visibilityCoverage().addTemporaryRevealCells(playerId, at.x, at.y, SCOUT_CAMP_LEAD_REVEAL_RADIUS, deps.visionTransitionCallbacks());
      held.set(playerId, { cellKeys, expiresAt: nowMs + SCOUT_CAMP_LEAD_REVEAL_TTL_MS, commandId });
      granted += 1;
      deps.flushVision(playerId, `scout-camp-lead:${commandId}`);
    },
    tick: (nowMs) => {
      for (const [playerId, look] of [...held]) if (nowMs >= look.expiresAt) drop(playerId, look);
    },
    gauge: () => ({ campLeadReveals: held.size, campLeadsGranted: granted })
  };
};
