import type { ClientState } from "../client-state/client-state.js";

export const playerNameForOwnerFromState = (
  state: Pick<ClientState, "me" | "meName" | "playerNames" | "leaderboard">,
  ownerId?: string | null
): string | undefined => {
  if (!ownerId) return undefined;
  if (ownerId === state.me) return state.meName || "you";
  if (ownerId === "barbarian") return "Barbarians";
  const knownName = state.playerNames.get(ownerId);
  if (knownName) return knownName;
  const leaderboardEntries = [
    ...state.leaderboard.overall,
    ...state.leaderboard.byTiles,
    ...state.leaderboard.byIncome,
    ...state.leaderboard.byTechs
  ];
  return leaderboardEntries.find((entry) => entry.id === ownerId)?.name;
};
