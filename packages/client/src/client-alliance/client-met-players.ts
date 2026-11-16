import type { ClientState } from "../client-state/client-state.js";
import { storageGet, storageSet } from "../client-state/client-storage.js";

export type MetPlayersState = Pick<
  ClientState,
  "tiles" | "tilesRevision" | "me" | "bridgeDebugSeasonId" | "metPlayerIds" | "metPlayersScannedRevision" | "metPlayersLoadedFor" | "metPlayersSavedCount"
>;

// Barbarians / Planetary Defense are environment, not diplomatic counterparts.
export const isMeetablePlayerId = (ownerId: string | undefined, me: string | undefined): ownerId is string =>
  Boolean(ownerId) && ownerId !== me && !ownerId!.startsWith("barbarian");

/**
 * The set is saved in this browser per account (one localStorage key per
 * player, tagged with the season, so a new season starts empty and old
 * seasons leave nothing behind). Playtest run 2: it was rebuilt only from the
 * tiles loaded now, so after a reload, or once a truce partner's land was out
 * of view, empires reverted to "Not met yet". Client-side only: another
 * device or cleared site data starts from the loaded tiles again.
 */
export const MET_PLAYERS_STORAGE_PREFIX = "be:met-players:";
/** Hard cap on saved ids; the season's player count is far below it. Oldest-met are dropped first. */
export const MET_PLAYERS_MAX_SAVED = 500;

type SavedMetPlayers = { seasonId: string; ids: string[] };
const RESET_PREFIX = "reset:";

const readSaved = (playerId: string, seasonId: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(storageGet(`${MET_PLAYERS_STORAGE_PREFIX}${playerId}`) ?? "null");
    if (!parsed || typeof parsed !== "object") return [];
    const saved = parsed as Partial<SavedMetPlayers>;
    if (saved.seasonId !== seasonId || !Array.isArray(saved.ids)) return [];
    return saved.ids.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
};

const save = (state: MetPlayersState): void => {
  const ids = [...state.metPlayerIds].slice(-MET_PLAYERS_MAX_SAVED);
  const value: SavedMetPlayers = { seasonId: state.bridgeDebugSeasonId, ids };
  storageSet(`${MET_PLAYERS_STORAGE_PREFIX}${state.me}`, JSON.stringify(value));
  state.metPlayersSavedCount = state.metPlayerIds.size;
};

/** Loads this account's saved set for this season once its id and season are known. */
const ensureLoaded = (state: MetPlayersState): void => {
  if (!state.me || !state.bridgeDebugSeasonId) return;
  const key = `${state.me}|${state.bridgeDebugSeasonId}`;
  if (state.metPlayersLoadedFor === key) return;
  // Reset for a new season whose id hasn't arrived yet: the old season's saved set must not come back.
  const resetFromThisKey = state.metPlayersLoadedFor === `${RESET_PREFIX}${key}`;
  // Another account or season: what was met there doesn't carry over. (Before
  // the first load the set can only hold this session's scan, which is kept.)
  if (state.metPlayersLoadedFor && !resetFromThisKey) state.metPlayerIds.clear();
  state.metPlayersLoadedFor = key;
  if (!resetFromThisKey) for (const id of readSaved(state.me, state.bridgeDebugSeasonId)) if (isMeetablePlayerId(id, state.me)) state.metPlayerIds.add(id);
  state.metPlayersSavedCount = -1;
  state.metPlayersScannedRevision = -1;
};

/**
 * "Met" = you have seen a tile owned by that player this season. The set only
 * ever grows within a season (a player you saw and later lost sight of, or
 * whose border tiles were captured, stays met) and is bounded by the player
 * count. New sightings come from `state.tiles`, memoized on `tilesRevision`,
 * so the HUD (which re-renders on nearly every gateway message) only rescans
 * after tiles actually changed. Reset on season rollover / world regeneration.
 */
export const refreshMetPlayerIds = (state: MetPlayersState): ReadonlySet<string> => {
  ensureLoaded(state);
  if (state.metPlayersScannedRevision === state.tilesRevision) return state.metPlayerIds;
  for (const tile of state.tiles.values()) {
    if (isMeetablePlayerId(tile.ownerId, state.me)) state.metPlayerIds.add(tile.ownerId);
  }
  state.metPlayersScannedRevision = state.tilesRevision;
  // Saved when the set changed size: it grew, or a world regeneration cleared it.
  if (state.metPlayersLoadedFor && state.metPlayerIds.size !== state.metPlayersSavedCount) save(state);
  return state.metPlayerIds;
};

export const resetMetPlayers = (state: Pick<ClientState, "metPlayerIds" | "metPlayersScannedRevision" | "metPlayersLoadedFor">): void => {
  state.metPlayerIds.clear();
  state.metPlayersScannedRevision = -1;
  // Loads again once the new season's id arrives; until then the old season's saved set stays unloaded.
  state.metPlayersLoadedFor = state.metPlayersLoadedFor && !state.metPlayersLoadedFor.startsWith(RESET_PREFIX) ? `${RESET_PREFIX}${state.metPlayersLoadedFor}` : state.metPlayersLoadedFor;
};
