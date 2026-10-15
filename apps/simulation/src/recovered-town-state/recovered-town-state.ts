import type { DomainTileState } from "@border-empires/game-domain";

import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";

/**
 * Per-player town state that a snapshot round trip has to carry so a restart
 * doesn't change gameplay:
 *
 * - Town settle stamps (Runtime.tileSettledAtByKey). Resource-slot dormancy
 *   puts the NEWEST food consumers to sleep first and dates each town by this
 *   stamp (resource-slot-view.ts). A stamp lost on restart made every town
 *   look oldest, so a food shortfall moved onto structures such as the
 *   Ancillary Depot: the manpower cap dropped at boot, and the later recovery
 *   was paid out as free manpower (cap growth is credited immediately).
 * - Town order, which weights manpower regen per town.
 */
export type TownSettledAtEntry = { tileKey: string; settledAt: number };

/** Snapshot side: the settle stamps of the given towns, for those that have one. */
export const townSettledAtForSnapshot = (
  townTileKeys: Iterable<string>,
  tileSettledAtByKey: ReadonlyMap<string, number> | undefined
): TownSettledAtEntry[] => {
  if (!tileSettledAtByKey || tileSettledAtByKey.size === 0) return [];
  const entries: TownSettledAtEntry[] = [];
  for (const tileKey of townTileKeys) {
    const settledAt = tileSettledAtByKey.get(tileKey);
    if (typeof settledAt === "number" && Number.isFinite(settledAt)) entries.push({ tileKey, settledAt });
  }
  return entries.sort((a, b) => a.tileKey.localeCompare(b.tileKey));
};

/**
 * Boot side: restores a recovered player's town settle stamps, skipping any
 * town that event replay since the snapshot moved out of their settled hands
 * (its stamp would describe someone else's settlement).
 */
export const restoreTownSettledAt = (
  tileSettledAtByKey: Map<string, number>,
  tiles: ReadonlyMap<string, DomainTileState>,
  playerId: string,
  entries: readonly TownSettledAtEntry[] | undefined
): void => {
  for (const entry of entries ?? []) {
    if (!Number.isFinite(entry.settledAt)) continue;
    const tile = tiles.get(entry.tileKey);
    if (!tile?.town || tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") continue;
    tileSettledAtByKey.set(entry.tileKey, entry.settledAt);
  }
};

/**
 * Boot side: re-applies the recovered town order to a summary rebuilt from
 * tile iteration order. Recovered towns the player no longer holds are
 * dropped; towns not in the recovered list keep their place after the rest.
 */
export const restoreRecoveredTownOrder = (summary: PlayerRuntimeSummary, ownedTownTileKeys: readonly string[]): void => {
  const currentTowns = new Map(summary.ownedTownTierByTile);
  summary.ownedTownTierByTile.clear();
  for (const tileKey of ownedTownTileKeys) {
    const tier = currentTowns.get(tileKey);
    if (tier) {
      summary.ownedTownTierByTile.set(tileKey, tier);
      currentTowns.delete(tileKey);
    }
  }
  for (const [tileKey, tier] of currentTowns) summary.ownedTownTierByTile.set(tileKey, tier);
};
