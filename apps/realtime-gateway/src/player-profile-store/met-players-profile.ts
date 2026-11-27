import { MET_PLAYERS_MAX_IDS } from "@border-empires/shared";

// "Empires you've met" on the player profile, so the Diplomacy list's contact
// set survives a browser data clear, a new device or a fresh browser
// (playtest run 5: "Empires you've met · 0", and rivals fought or truced the
// day before dropped off it, because the set lived only in localStorage).
// The client sends its whole set for one season on SET_HINT_STATE; the stored
// set is the union for that season, so a device that saw less never shrinks
// it. Another season replaces it, and an empty list clears it (a regenerated
// world starts over). Bounded by MET_PLAYERS_MAX_IDS, oldest-met dropped first.

export type StoredMetPlayers = {
  metPlayerIds?: string[];
  metPlayersSeasonId?: string;
};

/** The stored set after a patch, or undefined when the patch carries no met set (nothing changes). */
export const mergeMetPlayers = (existing: StoredMetPlayers | undefined, patch: StoredMetPlayers): Required<StoredMetPlayers> | undefined => {
  if (!patch.metPlayerIds || !patch.metPlayersSeasonId) return undefined;
  const seasonId = patch.metPlayersSeasonId;
  if (patch.metPlayerIds.length === 0) return { metPlayersSeasonId: seasonId, metPlayerIds: [] };
  const kept = existing?.metPlayersSeasonId === seasonId ? existing.metPlayerIds ?? [] : [];
  const merged = [...new Set([...kept, ...patch.metPlayerIds])];
  return { metPlayersSeasonId: seasonId, metPlayerIds: merged.slice(-MET_PLAYERS_MAX_IDS) };
};

/** The met fields of `existing`, merged with `patch` when it carries a set -- for every in-memory profile write. */
export const metPlayersFields = (existing: StoredMetPlayers | undefined, patch: StoredMetPlayers = {}): StoredMetPlayers => {
  const merged = mergeMetPlayers(existing, patch);
  if (merged) return merged;
  return {
    ...(existing?.metPlayerIds ? { metPlayerIds: existing.metPlayerIds } : {}),
    ...(existing?.metPlayersSeasonId ? { metPlayersSeasonId: existing.metPlayersSeasonId } : {})
  };
};
