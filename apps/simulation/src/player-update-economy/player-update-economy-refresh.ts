// refreshTownEconomyFields split out of player-update-economy.ts to keep
// that file under the repo's 500-line cap.
import type { DomainTileState } from "@border-empires/game-domain";
import { PASSIVE_INCOME_MULT, SETTLEMENT_BASE_GOLD_PER_MIN } from "@border-empires/game-domain";
import {
  firstThreeTownsGoldOutputMultiplierForPlayer,
  firstThreeTownsPopulationGrowthMultiplierForPlayer,
  type EconomyPlayer
} from "../economy-network/economy-network.js";
import { townGoldPerMinuteForPlayer } from "./player-update-economy.js";

// Refresh goldPerMinute/isFed on a town originally from buildTownSummary
// (detected via the snapshot-only supportMax field) — between full rebuilds
// the connected-town bonus re-enriches but goldPerMinute doesn't. Partial
// test-fixture town stubs (no supportMax/supportCurrent) pass through untouched.
export const refreshTownEconomyFields = (
  town: NonNullable<DomainTileState["town"]>,
  tile: DomainTileState,
  player: EconomyPlayer,
  tiles: ReadonlyMap<string, DomainTileState>,
  fedTownKeys: ReadonlySet<string>,
  firstThreeTownKeys?: ReadonlySet<string>,
  connectedClearingHouseKeys?: readonly string[],
  dormantEconomicStructureKeys: ReadonlySet<string> = new Set()
): NonNullable<DomainTileState["town"]> => {
  if (typeof town.supportMax !== "number" || typeof town.supportCurrent !== "number") return town;
  if (tile.ownerId !== player.id) return town;
  const isSettlement = town.populationTier === "SETTLEMENT" || !town.populationTier;
  const goldPerMinute = isSettlement
    ? SETTLEMENT_BASE_GOLD_PER_MIN * (player.mods?.income ?? 1) * PASSIVE_INCOME_MULT
    : townGoldPerMinuteForPlayer(
        player,
        tile,
        town,
        tiles,
        fedTownKeys,
        firstThreeTownKeys,
        connectedClearingHouseKeys,
        dormantEconomicStructureKeys
      );
  // Re-stamp isFed from the fresh fed-key set (settlements always fed).
  const isFed = isSettlement ? true : fedTownKeys.has(`${tile.x},${tile.y}`);
  // Mercantile Charter (and any future firstThreeTowns* domain/tech): its
  // multiplier is already folded into goldPerMinute above via
  // townGoldPerMinuteForPlayer, but the wire fields the tile overview reads
  // (firstThreeTownGoldMult/firstThreeTownPopGrowthMult) still need
  // re-stamping here too — otherwise a town whose original buildTownSummary
  // predates the player picking up the domain (or falling in/out of their
  // first three) keeps showing a stale value between full rebuilds, same
  // class of bug goldPerMinute/isFed were already re-stamped here to avoid.
  const isFirstThree = firstThreeTownKeys?.has(`${tile.x},${tile.y}`) ?? false;
  const firstThreeTownGoldMult = isFirstThree ? firstThreeTownsGoldOutputMultiplierForPlayer(player) : 1;
  const firstThreeTownPopGrowthMult = isFirstThree ? firstThreeTownsPopulationGrowthMultiplierForPlayer(player) : 1;
  if (
    town.goldPerMinute === goldPerMinute &&
    town.isFed === isFed &&
    (town.firstThreeTownGoldMult ?? 1) === firstThreeTownGoldMult &&
    (town.firstThreeTownPopGrowthMult ?? 1) === firstThreeTownPopGrowthMult
  ) {
    return town;
  }
  const { firstThreeTownGoldMult: _droppedGoldMult, firstThreeTownPopGrowthMult: _droppedPopGrowthMult, ...townWithoutFirstThreeFields } = town;
  return {
    ...townWithoutFirstThreeFields,
    goldPerMinute,
    isFed,
    ...(firstThreeTownGoldMult !== 1 ? { firstThreeTownGoldMult } : {}),
    ...(firstThreeTownPopGrowthMult !== 1 ? { firstThreeTownPopGrowthMult } : {})
  };
};
