import type { ClientState } from "../client-state/client-state.js";

const leaderboardNameForOwner = (state: Pick<ClientState, "leaderboard">, ownerId: string): string | undefined => {
  const leaderboardEntries = [
    ...state.leaderboard.overall,
    ...state.leaderboard.byTiles,
    ...state.leaderboard.byIncome,
    ...state.leaderboard.byTechs
  ];
  return leaderboardEntries.find((entry) => entry.id === ownerId)?.name;
};

// Used for player-identifying purposes (e.g. truce/alliance target names sent
// to the gateway): AI players must keep the stable "AI N" name here, because
// social-state's resolveByName only recognizes that cosmetic default, not the
// live seasonal name the leaderboard reports (see
// apps/realtime-gateway/src/auth-identity/auth-identity.ts).
export const playerNameForOwnerFromState = (
  state: Pick<ClientState, "me" | "meName" | "playerNames" | "leaderboard">,
  ownerId?: string | null
): string | undefined => {
  if (!ownerId) return undefined;
  if (ownerId === state.me) return state.meName || "you";
  if (ownerId === "barbarian") return "Barbarians";
  const knownName = state.playerNames.get(ownerId);
  if (knownName) return knownName;
  return leaderboardNameForOwner(state, ownerId);
};

// Used purely for display (e.g. the tile description panel's owner label).
// Prefers the leaderboard's live seasonal name over the client's playerNames
// map, which is only ever set once at init and never gains an AI's real name
// (playerNames intentionally stays "AI N" for social-state resolvability; see
// playerNameForOwnerFromState above). Not safe to use for truce/alliance
// target names.
export const playerDisplayNameForOwnerFromState = (
  state: Pick<ClientState, "me" | "meName" | "playerNames" | "leaderboard">,
  ownerId?: string | null
): string | undefined => {
  if (!ownerId) return undefined;
  if (ownerId === state.me) return state.meName || "you";
  if (ownerId === "barbarian") return "Barbarians";
  return leaderboardNameForOwner(state, ownerId) ?? state.playerNames.get(ownerId);
};
