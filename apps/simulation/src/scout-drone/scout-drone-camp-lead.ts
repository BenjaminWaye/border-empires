import type { DomainTileState } from "@border-empires/game-domain";
import type { VisibilityCoverageTracker, VisibilityTransitionCallbacks } from "../visibility-coverage-cache.js";
import { isPlanetaryDefenseCampTile } from "../planetary-defense-camps/camp-rules.js";
import type { ScoutExploredLookup } from "./scout-drone-findings.js";

// Camp lead (owner, first-15-minutes playtest 2026-11-28): a combat-minded new
// player spent all 8 charges and never found an Insurgent camp, although world
// gen posts one about 20 tiles from every start site (season-barbarian-seed.ts).
// So a drone launch also shows the player the nearest live Insurgent camp to the
// AFC it launched from, unless they already know one that near. "Already know"
// is the player's explored-tile memory (explored-tiles-store.ts), which every
// snapshot saves, so there is no new persisted flag: the first launch of a new
// empire shows its camp, and later launches show another only once every camp
// they knew nearby has fallen.
//
// The look is a temporary reveal of the camp and the ring around it, through
// the same coverage the fog of war and camp wake-up read (as a waystation's
// VISION look), so the camp is live on the map, with its attack and march
// options, for SCOUT_CAMP_LEAD_REVEAL_TTL_MS; then it drops to remembered fog.
// Looks live only in memory: a restart ends one early, as it docks a drone.

/** How far (wrapped Chebyshev) from the launching AFC a camp counts as "near"; start-site patrols are posted 12-35 out (season-barbarian-seed.ts PATROL_TIERS). */
export const SCOUT_CAMP_LEAD_SEARCH_RADIUS = 35;
/** The camp tile and the ring around it. */
export const SCOUT_CAMP_LEAD_REVEAL_RADIUS = 1;
export const SCOUT_CAMP_LEAD_REVEAL_TTL_MS = 10 * 60_000;

export type ScoutCampLeadInput = {
  readonly playerId: string;
  readonly from: { readonly x: number; readonly y: number };
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
 * The nearest live camp within SCOUT_CAMP_LEAD_SEARCH_RADIUS of `from` that
 * the player has never seen, or undefined when there is none or the player has
 * already explored a live camp that near. Ties go to the lower tile key, so
 * the pick doesn't depend on set order. O(live camps), at most 100.
 */
export const findScoutCampLead = (input: ScoutCampLeadInput): { x: number; y: number } | undefined => {
  let best: { x: number; y: number; d: number; key: string } | undefined;
  for (const key of input.campKeys) {
    const tile = input.tiles.get(key);
    if (!tile || !isPlanetaryDefenseCampTile(key, tile)) continue;
    const d = wrappedChebyshev(input.from.x, input.from.y, tile.x, tile.y, input.worldWidth, input.worldHeight);
    if (d > SCOUT_CAMP_LEAD_SEARCH_RADIUS) continue;
    if (input.isExplored(input.playerId, tile.x, tile.y)) return undefined;
    if (!best || d < best.d || (d === best.d && key < best.key)) best = { x: tile.x, y: tile.y, d, key };
  }
  return best ? { x: best.x, y: best.y } : undefined;
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
