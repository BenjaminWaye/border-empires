import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";

export type SameOwnerSummaryOrder = { tileOrder: string[]; townOrder: string[] };

/**
 * Before a tile is replaced without changing its owner, the order of that
 * owner's territory and towns, so restoreSameOwnerSummaryOrder can put it
 * back after the summary is rebuilt. Undefined when the owner changes (or
 * there is none): then there is no order to keep.
 */
export function captureSameOwnerSummaryOrder(sameOwnerSummary: PlayerRuntimeSummary | undefined): SameOwnerSummaryOrder | undefined {
  if (!sameOwnerSummary) return undefined;
  return { tileOrder: [...sameOwnerSummary.territoryTileKeys], townOrder: [...sameOwnerSummary.ownedTownTierByTile.keys()] };
}

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
