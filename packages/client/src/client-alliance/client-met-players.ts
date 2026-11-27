import type { ClientState } from "../client-state/client-state.js";
import { storageGet, storageSet } from "../client-state/client-storage.js";
import { sendHintStateUpdate } from "../client-discovery-tips/client-hint-server-sync.js";

export type MetPlayersState = Pick<
  ClientState,
  "tiles" | "tilesRevision" | "me" | "bridgeDebugSeasonId" | "metPlayerIds" | "metPlayersScannedRevision" | "metPlayersLoadedFor" | "metPlayersSavedCount"
>;

// Barbarians / Planetary Defense are environment, not diplomatic counterparts.
export const isMeetablePlayerId = (ownerId: string | undefined, me: string | undefined): ownerId is string =>
  Boolean(ownerId) && ownerId !== me && !ownerId!.startsWith("barbarian");

/**
 * The set is saved in this browser under one localStorage key, tagged with
 * the account and season: another account or a new season starts empty and
 * overwrites it, so at most one entry (player ids only) is ever kept.
 * Playtest run 2: it was rebuilt only from the tiles loaded now, so after a
 * reload, or once a truce partner's land was out of view, empires reverted to
 * "Not met yet". Playtest run 5: a fresh browser (another device, cleared
 * site data) still started from the tiles in view ("Empires you've met · 0"),
 * so the set is also kept on the gateway's player profile: every save sends it
 * (SET_HINT_STATE metPlayerIds, merged there per season) and INIT /
 * HINT_STATE_SET bring the stored set back (hydrateMetPlayersFromServer).
 */
export const MET_PLAYERS_STORAGE_KEY = "be:met-players";
/** Hard cap on saved ids; the season's player count is far below it. Oldest-met are dropped first. */
export const MET_PLAYERS_MAX_SAVED = 500;

type SavedMetPlayers = { playerId: string; seasonId: string; ids: string[] };
const RESET_PREFIX = "reset:";

const readSaved = (playerId: string, seasonId: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(storageGet(MET_PLAYERS_STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return [];
    const saved = parsed as Partial<SavedMetPlayers>;
    if (saved.playerId !== playerId || saved.seasonId !== seasonId || !Array.isArray(saved.ids)) return [];
    return saved.ids.slice(-MET_PLAYERS_MAX_SAVED).filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
};

/**
 * Merges in what another tab of the same account and season saved meanwhile,
 * so the last tab to write doesn't drop the others' sightings. `replace` skips
 * the merge (a regenerated world starts its set over).
 */
const save = (state: MetPlayersState, replace = false): void => {
  if (!replace) for (const id of readSaved(state.me, state.bridgeDebugSeasonId)) if (isMeetablePlayerId(id, state.me)) state.metPlayerIds.add(id);
  const ids = [...state.metPlayerIds].slice(-MET_PLAYERS_MAX_SAVED);
  const value: SavedMetPlayers = { playerId: state.me, seasonId: state.bridgeDebugSeasonId, ids };
  storageSet(MET_PLAYERS_STORAGE_KEY, JSON.stringify(value));
  state.metPlayersSavedCount = state.metPlayerIds.size;
  // An empty set clears the server's copy, so it is only sent to start over (a regenerated world).
  if (replace || ids.length > 0) sendHintStateUpdate({ metPlayerIds: ids, metPlayersSeasonId: state.bridgeDebugSeasonId });
};

const isLoaded = (state: Pick<ClientState, "metPlayersLoadedFor">): boolean =>
  Boolean(state.metPlayersLoadedFor) && !state.metPlayersLoadedFor.startsWith(RESET_PREFIX);

/** Loads this account's saved set for this season once its id and season are known. */
const ensureLoaded = (state: MetPlayersState): void => {
  if (!state.me || !state.bridgeDebugSeasonId) return;
  const key = `${state.me}|${state.bridgeDebugSeasonId}`;
  if (state.metPlayersLoadedFor === key) return;
  // Reset for a new season whose id hasn't arrived yet: neither load nor save
  // under the old season, or its saved set would come back.
  if (state.metPlayersLoadedFor === `${RESET_PREFIX}${key}`) return;
  // Another account or season: what was met there doesn't carry over. (Before
  // the first load the set can only hold this session's scan, which is kept.)
  if (state.metPlayersLoadedFor) state.metPlayerIds.clear();
  state.metPlayersLoadedFor = key;
  for (const id of readSaved(state.me, state.bridgeDebugSeasonId)) if (isMeetablePlayerId(id, state.me)) state.metPlayerIds.add(id);
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
  // The set only grows, so a size change means new sightings to save.
  if (isLoaded(state) && state.metPlayerIds.size !== state.metPlayersSavedCount) save(state);
  return state.metPlayerIds;
};

/**
 * Adds the gateway's stored set (INIT, HINT_STATE_SET) when it is for this
 * season. New ids are saved on the next refresh, which also sends them back.
 */
export const hydrateMetPlayersFromServer = (state: MetPlayersState, ids: unknown, seasonId: unknown): void => {
  ensureLoaded(state);
  if (!isLoaded(state) || !Array.isArray(ids) || typeof seasonId !== "string" || seasonId !== state.bridgeDebugSeasonId) return;
  const before = state.metPlayerIds.size;
  for (const id of ids) if (typeof id === "string" && isMeetablePlayerId(id, state.me)) state.metPlayerIds.add(id);
  if (state.metPlayerIds.size !== before) state.metPlayersScannedRevision = -1;
};

export const resetMetPlayers = (state: Pick<ClientState, "metPlayerIds" | "metPlayersScannedRevision" | "metPlayersLoadedFor" | "metPlayersSavedCount">): void => {
  state.metPlayerIds.clear();
  state.metPlayersScannedRevision = -1;
  state.metPlayersSavedCount = -1;
  // Loads again once the new season's id arrives; until then the old season's saved set stays unloaded.
  if (isLoaded(state)) state.metPlayersLoadedFor = `${RESET_PREFIX}${state.metPlayersLoadedFor}`;
};

/** World regenerated within the season: start the set over, saved copy included. */
export const clearMetPlayersForNewWorld = (state: MetPlayersState): void => {
  state.metPlayerIds.clear();
  state.metPlayersScannedRevision = -1;
  if (isLoaded(state)) save(state, true);
  else state.metPlayersSavedCount = -1;
};
