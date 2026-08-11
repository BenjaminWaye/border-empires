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
 *     in PlayerRuntimeSummary; converter output (TITANIUM_WORKS, etc.) is additive
 *     over settled tiles and IS incrementalizable, but it is only needed for
 *     display; left on full-rebuild for simplicity.
 */

import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";

import {
  ADVANCED_CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ADVANCED_UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ADVANCED_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
  UPKEEP_MINUTES_PER_DAY
} from "@border-empires/game-domain";
import { townFoodUpkeepPerMinute } from "../player-update-economy/player-update-economy.js";

/** The subset of upkeep fields consumed by `applyEconomyAccrual`. */
export type UpkeepAccrualSnapshot = {
  gold: number;
  food: number;
  titanium: number;
  crystal: number;
  umbrite: number;
};

export const emptyUpkeepAccrualSnapshot = (): UpkeepAccrualSnapshot => ({
  gold: 0,
  food: 0,
  titanium: 0,
  crystal: 0,
  umbrite: 0
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

  let gold = 0;
  let food = 0;
  let titanium = 0;
  let crystal = 0;
  let umbrite = 0;
  // Town food upkeep.
  if (tile.town) {
    food += townFoodUpkeepPerMinute(tile.town.populationTier);
  }

  // §12.1/§5.1: Fort (TITANIUM slot), Siege Outpost (UMBRITE slot), and
  // Observatory (CRYSTAL slot) no longer carry a separate per-minute flow
  // drain — the slot occupation itself is the upkeep. Settled-land gold
  // upkeep (was a flat 0.04/min per tile) is retired too — §6 states
  // gold's only remaining jobs post-rewrite are tech/rush-buys/synthesizer
  // upkeep, and none of those are "own a settled tile."

  // Economic structure upkeep. Every structure except the synthesizer
  // family (Fur/Iron/Crystal + Advanced tiers, §6.4) has zero ongoing
  // upkeep: FOOD/TITANIUM/CRYSTAL/UMBRITE are slot-based (structure-slots.ts),
  // not a per-minute drain, and only the synthesizers still have a real
  // GOLD cost for their conversion. Fort and Siege Outpost families (below)
  // are the same — no per-minute drain, only their slot occupation.
  const structure = tile.economicStructure;
  if (structure?.ownerId === ownerId && structure.status === "active") {
    switch (structure.type) {
      case "UMBRITE_SYNTHESIZER":   gold  += UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY; break;
      case "ADVANCED_UMBRITE_SYNTHESIZER":
                                gold    += ADVANCED_UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY; break;
      case "TITANIUM_WORKS":    gold    += TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY; break;
      case "ADVANCED_TITANIUM_WORKS":
                                gold    += ADVANCED_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY; break;
      case "CRYSTAL_SYNTHESIZER": gold  += CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY; break;
      case "ADVANCED_CRYSTAL_SYNTHESIZER":
                                gold    += ADVANCED_CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY; break;
    }
  }

  return { gold, food, titanium, crystal, umbrite };
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
  cache.gold     += contrib.gold;
  cache.food     += contrib.food;
  cache.titanium += contrib.titanium;
  cache.crystal  += contrib.crystal;
  cache.umbrite  += contrib.umbrite;
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
  cache.gold     -= contrib.gold;
  cache.food     -= contrib.food;
  cache.titanium -= contrib.titanium;
  cache.crystal  -= contrib.crystal;
  cache.umbrite  -= contrib.umbrite;
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
