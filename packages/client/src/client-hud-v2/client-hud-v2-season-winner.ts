// Once a season is crowned, the HUD's victory surfaces (top-bar Victory race
// line, Ranks banner and the winning path's track) say who won instead of
// who is "holding". The winner's name is re-resolved like Ranks does, so a
// rename after crowning shows the current name; the local player reads "You".

import type { SeasonWinnerView } from "../client-types.js";

/** Display name for the crowned winner: "You", the current name, then the crowning snapshot. */
export const seasonWinnerName = (winner: SeasonWinnerView, me: string, nameOf: (playerId: string) => string): string => {
  if (winner.playerId === me) return "You";
  return nameOf(winner.playerId) || winner.playerName || "An empire";
};

/** "Economic Ascendancy", or a neutral fallback if the snapshot has no path name. */
export const seasonWinnerPath = (winner: SeasonWinnerView): string => winner.objectiveName || "the Sector Contest";
