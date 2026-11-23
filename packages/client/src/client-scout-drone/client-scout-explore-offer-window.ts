// How long the brass "Explore" pill keeps offering the scout drone. A new House explores to find its
// first towns and food; by its third day it has, and the pill only sits over the map (owner, Playtest
// Run 4). After the window the drone is still a tap away: tap fog, or Send scout drone on the AFC.
//
// The clock starts the first time this device sees the player in a season. The client has no join
// date from the server, so a new device or cleared site data starts the window again; that only
// shows the pill longer, never hides the drone. One stored entry per player (the latest season
// replaces it), so it is bounded by the accounts signed in on this device.
import { storageGet, storageSet } from "../client-state/client-storage.js";

export const EXPLORE_OFFER_WINDOW_MS = 3 * 24 * 3_600_000;

const keyFor = (playerId: string): string => `be-explore-offer-since:${playerId}`;

type Since = { seasonId: string; at: number };

const memory = new Map<string, Since>();

const readStored = (playerId: string): Since | undefined => {
  try {
    const parsed = JSON.parse(storageGet(keyFor(playerId)) ?? "null") as Partial<Since> | null;
    return parsed && typeof parsed.seasonId === "string" && typeof parsed.at === "number" && Number.isFinite(parsed.at)
      ? { seasonId: parsed.seasonId, at: parsed.at }
      : undefined;
  } catch {
    return undefined;
  }
};

/** When this device first saw `playerId` in `seasonId`, recording `nowMs` the first time. */
export const exploreOfferSince = (playerId: string, seasonId: string, nowMs: number): number => {
  const known = memory.get(playerId) ?? readStored(playerId);
  if (known && known.seasonId === seasonId) {
    memory.set(playerId, known);
    return known.at;
  }
  const fresh = { seasonId, at: nowMs };
  memory.set(playerId, fresh);
  storageSet(keyFor(playerId), JSON.stringify(fresh));
  return nowMs;
};

/**
 * True while the pill may offer the drone: within EXPLORE_OFFER_WINDOW_MS of the player's first visit
 * this season. Before the player and season are known it stays open (nothing is recorded yet).
 */
export const exploreOfferWindowOpen = (state: { me: string; bridgeDebugSeasonId?: string | undefined }, nowMs: number): boolean => {
  if (!state.me || !state.bridgeDebugSeasonId) return true;
  return nowMs - exploreOfferSince(state.me, state.bridgeDebugSeasonId, nowMs) < EXPLORE_OFFER_WINDOW_MS;
};

/** Test-only: forgets the in-memory copy so the next read goes to storage. */
export const resetExploreOfferWindowForTests = (): void => memory.clear();
