// Mercantile Charter (and any future firstThreeTowns* domain/tech) split
// out of economy-network.ts to keep that file under the repo's 500-line
// cap.
import type { DomainPlayer } from "@border-empires/game-domain";
import { multiplicativeEffectForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";

/**
 * Returns the keys of the player's first three settled CITIES (SETTLEMENT
 * tier excluded — see Mercantile Charter's own catalog description, "your
 * first three cities") in the iteration order of the supplied entries — the
 * same semantics as the old implementation that scanned all tiles, but O(3)
 * instead of O(all_map_tiles).
 *
 * The single source of truth for "which towns are the owner's first three":
 * every wire/economy path that needs this set should call through here
 * rather than re-deriving it. A second, independently-drifted
 * implementation (buildFirstThreeTownKeysByPlayer in snapshot-tile-cache.ts
 * — kept separate for its own single-pass-over-every-player perf shape, see
 * its own doc comment) is exactly what let a bare, unnamed starting
 * SETTLEMENT silently occupy a first-three slot ahead of the player's
 * actual named towns: keep both exclusion rules in sync.
 *
 * Callers should pass `summary.ownedTownTierByTile.entries()` (or
 * equivalent) rather than `tiles.values()`, avoiding the full tile-map scan.
 */
export const firstThreeTownKeysForPlayer = (
  _playerId: string,
  ownedSettledTownEntries: Iterable<readonly [string, string | undefined]>
): Set<string> => {
  const result = new Set<string>();
  for (const [key, tier] of ownedSettledTownEntries) {
    if (tier === "SETTLEMENT") continue;
    result.add(key);
    if (result.size >= 3) break;
  }
  return result;
};

export const firstThreeTownsGoldOutputMultiplierForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">
): number => multiplicativeEffectForPlayer(player, "firstThreeTownsGoldOutputMult");

export const firstThreeTownsPopulationGrowthMultiplierForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">
): number => multiplicativeEffectForPlayer(player, "firstThreeTownsPopulationGrowthMult");

/**
 * Single source of truth for "is this specific tile one of the owner's
 * first three towns, and if so what do its gold/growth multipliers come
 * out to" — every call site that needs either the real math (folding the
 * multiplier into goldPerMinute/populationGrowthPerMinute) or the wire
 * display fields (firstThreeTownGoldMult/firstThreeTownPopGrowthMult the
 * tile overview reads) MUST go through this function instead of
 * independently checking `firstThreeTownKeys.has(tileKey)` and calling the
 * multiplier lookups themselves.
 *
 * This is a direct response to the bug history here: the math and the wire
 * display field were computed by two separate call sites that drifted out
 * of sync twice in a row (the display field was never stamped at all, then
 * stamped only on a rare full rebuild) before either path was wrong on its
 * own eligibility rule (a bare settlement counted as a "town"). Routing
 * both consumers through one function makes that drift structurally
 * impossible instead of a matter of remembering to update both sites.
 */
export const firstThreeTownMultipliersForTile = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">,
  firstThreeTownKeys: ReadonlySet<string> | undefined,
  tileKey: string
): { isFirstThree: boolean; goldMult: number; popGrowthMult: number } => {
  const isFirstThree = firstThreeTownKeys?.has(tileKey) ?? false;
  return {
    isFirstThree,
    goldMult: isFirstThree ? firstThreeTownsGoldOutputMultiplierForPlayer(player) : 1,
    popGrowthMult: isFirstThree ? firstThreeTownsPopulationGrowthMultiplierForPlayer(player) : 1
  };
};
