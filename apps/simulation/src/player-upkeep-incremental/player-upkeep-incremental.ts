/**
 * Incremental upkeep cache for per-player economy accrual.
 *
 * `buildPlayerUpdateEconomySnapshot` is O(territory tiles) — it iterates all
 * settled tiles each time the cache is invalidated.  At 250k tiles with
 * frequent tile mutations (replaceTileState), the invalidate + full-rebuild
 * cycle is O(owned-tiles) per mutation × number of mutations.
 *
 * This module maintains a cheaper parallel cache that holds ONLY the
 * `upkeepPerMinute` fields consumed by `applyEconomyAccrual`.  Because
 * every field in `upkeepPerMinute` is a plain sum of per-tile contributions,
 * it can be updated incrementally in O(1) per `replaceTileState` call:
 *
 *   cache -= oldTileContribution(previousTile)
 *   cache += newTileContribution(newTile)
 *
 * `applyEconomyAccrual` reads from this incremental cache instead of the full
 * snapshot, so tile mutations no longer trigger full rebuilds for the hot
 * accrual path.
 *
 * The full snapshot (incomePerMinute, economyBreakdown, etc.) is still built
 * on the invalidate+rebuild path and consumed only by `emitPlayerStateUpdate`
 * — a display path called once per command, not once per tick.
 *
 * Fields NOT incrementalized (left on full-rebuild path):
 *   - incomePerMinute — town gold depends on neighbor count, connected-town
 *     network, fed-town state (global food balance), dock link network.
 *   - economyBreakdown — detailed UI buckets; inherits the same dependencies.
 *   - upkeepLastTick.foodCoverage — ratio depends on player stock + production
 *     at time of read; not a pure tile sum.
 *   - strategicProductionPerMinute — base tile production is already maintained
 *     in PlayerRuntimeSummary; converter output (IRONWORKS, etc.) is additive
 *     over settled tiles and IS incrementalizable, but it is only needed for
 *     display; left on full-rebuild for simplicity.
 */

import { OBSERVATORY_UPKEEP_PER_MIN } from "@border-empires/shared";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";

import {
  AIRPORT_CRYSTAL_UPKEEP_PER_MIN,
  BANK_FOOD_UPKEEP,
  CARAVANARY_FOOD_UPKEEP,
  CAMP_GOLD_UPKEEP,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP,
  CUSTOMS_HOUSE_GOLD_UPKEEP,
  FARMSTEAD_GOLD_UPKEEP,
  FOUNDRY_GOLD_UPKEEP,
  FUR_SYNTHESIZER_GOLD_UPKEEP,
  GARRISON_HALL_GOLD_UPKEEP,
  GOVERNORS_OFFICE_GOLD_UPKEEP,
  GRANARY_GOLD_UPKEEP,
  IRONWORKS_GOLD_UPKEEP,
  LIGHT_OUTPOST_GOLD_UPKEEP,
  MARKET_FOOD_UPKEEP,
  MINE_GOLD_UPKEEP,
  RADAR_SYSTEM_GOLD_UPKEEP,
  WOODEN_FORT_GOLD_UPKEEP
} from "@border-empires/game-domain";
import { multiplicativeEffectForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";
import { townFoodUpkeepPerMinute } from "../player-update-economy/player-update-economy.js";

/** The subset of upkeep fields consumed by `applyEconomyAccrual`. */
export type UpkeepAccrualSnapshot = {
  gold: number;
  food: number;
  iron: number;
  crystal: number;
  supply: number;
};

export const emptyUpkeepAccrualSnapshot = (): UpkeepAccrualSnapshot => ({
  gold: 0,
  food: 0,
  iron: 0,
  crystal: 0,
  supply: 0
});

/**
 * Compute the upkeep contribution of a single tile for the given owner.
 * Returns zeros for tiles that are not settled or not owned by the player.
 * All values are per-minute.
 *
 * @param tile    - The tile to evaluate.
 * @param ownerId - The player whose upkeep we're computing.
 * @param player  - The full player object (for tech/domain multipliers).
 */
export const tileUpkeepContribution = (
  tile: DomainTileState,
  ownerId: string,
  player: DomainPlayer
): UpkeepAccrualSnapshot => {
  // Only SETTLED tiles owned by this player incur upkeep.
  if (tile.ownerId !== ownerId || tile.ownershipState !== "SETTLED") {
    return emptyUpkeepAccrualSnapshot();
  }

  const fortGoldUpkeepMult = multiplicativeEffectForPlayer(player, "fortGoldUpkeepMult");
  const fortIronUpkeepMult = multiplicativeEffectForPlayer(player, "fortIronUpkeepMult");
  const outpostSupplyUpkeepMult = multiplicativeEffectForPlayer(player, "outpostSupplyUpkeepMult");

  let gold = 0.04; // settled land upkeep (1 settled tile)
  let food = 0;
  let iron = 0;
  let crystal = 0;
  let supply = 0;
  // Town food upkeep.
  if (tile.town) {
    food += townFoodUpkeepPerMinute(tile.town.populationTier);
  }

  // Fort upkeep.
  if (tile.fort?.ownerId === ownerId && tile.fort.status === "active") {
    gold += 1 * fortGoldUpkeepMult;
    iron += 0.025 * fortIronUpkeepMult;
  }

  // Siege outpost upkeep.
  if (tile.siegeOutpost?.ownerId === ownerId && tile.siegeOutpost.status === "active") {
    gold += 1;
    supply += 0.025 * outpostSupplyUpkeepMult;
  }

  // Observatory upkeep.
  if (tile.observatory?.ownerId === ownerId && tile.observatory.status === "active") {
    crystal += OBSERVATORY_UPKEEP_PER_MIN;
  }

  // Economic structure upkeep.
  const structure = tile.economicStructure;
  if (structure?.ownerId === ownerId && structure.status === "active") {
    switch (structure.type) {
      case "FARMSTEAD":         gold    += FARMSTEAD_GOLD_UPKEEP / 10; break;
      case "CAMP":              gold    += CAMP_GOLD_UPKEEP / 10; break;
      case "MINE":              gold    += MINE_GOLD_UPKEEP / 10; break;
      case "MARKET":            food    += MARKET_FOOD_UPKEEP / 10; break;
      case "GRANARY":           gold    += GRANARY_GOLD_UPKEEP / 10; break;
      case "BANK":              food    += BANK_FOOD_UPKEEP / 10; break;
      case "WOODEN_FORT":       gold    += WOODEN_FORT_GOLD_UPKEEP / 10; break;
      case "LIGHT_OUTPOST":     gold    += LIGHT_OUTPOST_GOLD_UPKEEP / 10; break;
      case "CARAVANARY":        food    += CARAVANARY_FOOD_UPKEEP / 10; break;
      case "FUR_SYNTHESIZER":
      case "ADVANCED_FUR_SYNTHESIZER":
                                gold    += FUR_SYNTHESIZER_GOLD_UPKEEP / 10; break;
      case "IRONWORKS":
      case "ADVANCED_IRONWORKS":
                                gold    += IRONWORKS_GOLD_UPKEEP / 10; break;
      case "CRYSTAL_SYNTHESIZER":
      case "ADVANCED_CRYSTAL_SYNTHESIZER":
                                gold    += CRYSTAL_SYNTHESIZER_GOLD_UPKEEP / 10; break;
      case "FOUNDRY":           gold    += FOUNDRY_GOLD_UPKEEP / 10; break;
      case "CUSTOMS_HOUSE":     gold    += CUSTOMS_HOUSE_GOLD_UPKEEP / 10; break;
      case "GARRISON_HALL":     gold    += GARRISON_HALL_GOLD_UPKEEP / 10; break;
      case "GOVERNORS_OFFICE":  gold    += GOVERNORS_OFFICE_GOLD_UPKEEP / 10; break;
      case "RADAR_SYSTEM":      gold    += RADAR_SYSTEM_GOLD_UPKEEP / 10; break;
      case "AIRPORT":           crystal += AIRPORT_CRYSTAL_UPKEEP_PER_MIN; break;
    }
  }

  return { gold, food, iron, crystal, supply };
};

/**
 * Add the contribution of `tile` for `ownerId` into `cache` in place.
 * O(1). Call when a tile is added/updated to a player's territory.
 */
export const addTileUpkeepToCache = (
  cache: UpkeepAccrualSnapshot,
  tile: DomainTileState,
  ownerId: string,
  player: DomainPlayer
): void => {
  const contrib = tileUpkeepContribution(tile, ownerId, player);
  cache.gold    += contrib.gold;
  cache.food    += contrib.food;
  cache.iron    += contrib.iron;
  cache.crystal += contrib.crystal;
  cache.supply  += contrib.supply;
};

/**
 * Subtract the contribution of `tile` for `ownerId` from `cache` in place.
 * O(1). Call when a tile is removed/updated from a player's territory.
 */
export const removeTileUpkeepFromCache = (
  cache: UpkeepAccrualSnapshot,
  tile: DomainTileState,
  ownerId: string,
  player: DomainPlayer
): void => {
  const contrib = tileUpkeepContribution(tile, ownerId, player);
  cache.gold    -= contrib.gold;
  cache.food    -= contrib.food;
  cache.iron    -= contrib.iron;
  cache.crystal -= contrib.crystal;
  cache.supply  -= contrib.supply;
};

/**
 * Build the upkeep accrual snapshot from scratch by iterating all settled
 * tiles owned by `ownerId`. Used for initial population and after
 * multiplier-changing events (tech/domain choice). O(all tiles).
 */
export const buildUpkeepAccrualSnapshot = (
  ownerId: string,
  player: DomainPlayer,
  tiles: ReadonlyMap<string, DomainTileState>
): UpkeepAccrualSnapshot => {
  const cache = emptyUpkeepAccrualSnapshot();
  for (const tile of tiles.values()) {
    if (tile.ownerId !== ownerId || tile.ownershipState !== "SETTLED") continue;
    addTileUpkeepToCache(cache, tile, ownerId, player);
  }
  return cache;
};
