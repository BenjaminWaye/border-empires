// Shared "chance of winning" pieces for the tile-menu battle card, used by both
// the manual-attack card (client-battle-progress.ts) and the muster-attack card
// (client-tracked-battle-progress.ts).
import { fallbackOwnerColor, resolveOwnerColor } from "../client-owner-colors/client-owner-colors.js";
import { playerDisplayNameForOwnerFromState } from "../client-owner-name/client-owner-name.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileMenuProgressView } from "../client-types.js";

/** Looks up the win chance (0-1) for attacking `tile` from the cached attack
 * preview, if one is currently available. */
export type LiveWinChance = (tile: Tile) => number | undefined;

export type BattleOddsState = Pick<ClientState, "me" | "meName" | "playerColors" | "playerNames" | "leaderboard">;

export const battleOddsView = (
  state: BattleOddsState,
  defenderOwnerId: string,
  winChance: number
): NonNullable<TileMenuProgressView["battle"]> => ({
  attackerColor: resolveOwnerColor(state.me, state.playerColors, fallbackOwnerColor),
  defenderColor: resolveOwnerColor(defenderOwnerId, state.playerColors, fallbackOwnerColor),
  attackerShare: Math.max(0, Math.min(1, winChance)),
  attackerLabel: "You",
  defenderLabel: playerDisplayNameForOwnerFromState(state, defenderOwnerId) ?? "Defender"
});

export const battleOddsDetail = (battle: NonNullable<TileMenuProgressView["battle"]>): string =>
  `Chance of winning: ${Math.round(battle.attackerShare * 100)}% you, ${Math.round((1 - battle.attackerShare) * 100)}% ${battle.defenderLabel}.`;

/** Odds for the tile's current defender from the live preview, when there is
 * both a defender and a cached preview. */
export const liveBattleOdds = (
  state: BattleOddsState,
  tile: Tile,
  liveWinChance: LiveWinChance | undefined
): NonNullable<TileMenuProgressView["battle"]> | undefined => {
  if (!tile.ownerId) return undefined;
  const winChance = liveWinChance?.(tile);
  return typeof winChance === "number" ? battleOddsView(state, tile.ownerId, winChance) : undefined;
};
