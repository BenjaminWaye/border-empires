import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
/** Preserve stable acquisition order when replacing a tile without changing its owner. */
export function restoreSameOwnerSummaryOrder(summary: PlayerRuntimeSummary, tileOrder: readonly string[] | undefined, townOrder: readonly string[] | undefined): void {
  if (tileOrder) {
    const currentKeys = new Set(summary.territoryTileKeys);
    summary.territoryTileKeys.clear();
    for (const key of tileOrder) if (currentKeys.delete(key)) summary.territoryTileKeys.add(key);
    for (const key of currentKeys) summary.territoryTileKeys.add(key);
  }
  if (townOrder) {
    const currentTowns = new Map(summary.ownedTownTierByTile);
    summary.ownedTownTierByTile.clear();
    for (const key of townOrder) {
      const tier = currentTowns.get(key);
      if (tier) { summary.ownedTownTierByTile.set(key, tier); currentTowns.delete(key); }
    }
    for (const [key, tier] of currentTowns) summary.ownedTownTierByTile.set(key, tier);
  }
}
