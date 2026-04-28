import type { Player } from "@border-empires/shared";

export const playerNeedsProfileSetup = (
  player: Pick<Player, "isAi" | "profileComplete">
): boolean => player.isAi !== true && player.profileComplete !== true;

export const resetHumanProfileForSeason = (
  player: Pick<Player, "isAi" | "profileComplete">
): void => {
  if (player.isAi === true) return;
  player.profileComplete = false;
};
