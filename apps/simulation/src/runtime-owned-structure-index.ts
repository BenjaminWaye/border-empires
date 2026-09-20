import type { DomainTileState } from "@border-empires/game-domain";
import type { BuildableStructureType } from "@border-empires/shared";
import type { PlannerOwnedStructureCounts } from "./ai/planner-owned-structure-counts.js";

export function ownedStructureCountForPlayer(
  ownedStructureCountByPlayerByType: ReadonlyMap<string, ReadonlyMap<BuildableStructureType, number>>,
  playerId: string,
  structureType: BuildableStructureType
): number {
  return ownedStructureCountByPlayerByType.get(playerId)?.get(structureType) ?? 0;
}

export function ownedStructureCountsForPlayer(
  ownedStructureCountByPlayerByType: ReadonlyMap<string, ReadonlyMap<BuildableStructureType, number>>,
  playerId: string
): PlannerOwnedStructureCounts {
  const counts: PlannerOwnedStructureCounts = {};
  const byType = ownedStructureCountByPlayerByType.get(playerId);
  if (!byType) return counts;
  for (const [structureType, count] of byType) counts[structureType] = count;
  return counts;
}

export function adjustOwnedStructureCount(
  ownedStructureCountByPlayerByType: Map<string, Map<BuildableStructureType, number>>,
  ownerId: string,
  structureType: BuildableStructureType,
  delta: number
): void {
  let byType = ownedStructureCountByPlayerByType.get(ownerId);
  if (!byType) {
    if (delta <= 0) return;
    byType = new Map();
    ownedStructureCountByPlayerByType.set(ownerId, byType);
  }
  const next = (byType.get(structureType) ?? 0) + delta;
  if (next <= 0) {
    byType.delete(structureType);
    if (byType.size === 0) ownedStructureCountByPlayerByType.delete(ownerId);
  } else {
    byType.set(structureType, next);
  }
}

export function refreshOwnedStructureCountIndexForTile(input: {
  previous: DomainTileState | undefined;
  next: DomainTileState;
  adjustOwnedStructureCount: (ownerId: string, structureType: BuildableStructureType, delta: number) => void;
}): void {
  const { previous, next, adjustOwnedStructureCount } = input;
  const prevFortOwner = previous?.fort?.ownerId;
  const nextFortOwner = next.fort?.ownerId;
  if (prevFortOwner !== nextFortOwner) {
    if (prevFortOwner) adjustOwnedStructureCount(prevFortOwner, "FORT", -1);
    if (nextFortOwner) adjustOwnedStructureCount(nextFortOwner, "FORT", 1);
  }
  const prevObsOwner = previous?.observatory?.ownerId;
  const nextObsOwner = next.observatory?.ownerId;
  if (prevObsOwner !== nextObsOwner) {
    if (prevObsOwner) adjustOwnedStructureCount(prevObsOwner, "OBSERVATORY", -1);
    if (nextObsOwner) adjustOwnedStructureCount(nextObsOwner, "OBSERVATORY", 1);
  }
  const prevSiegeOwner = previous?.siegeOutpost?.ownerId;
  const nextSiegeOwner = next.siegeOutpost?.ownerId;
  if (prevSiegeOwner !== nextSiegeOwner) {
    if (prevSiegeOwner) adjustOwnedStructureCount(prevSiegeOwner, "SIEGE_OUTPOST", -1);
    if (nextSiegeOwner) adjustOwnedStructureCount(nextSiegeOwner, "SIEGE_OUTPOST", 1);
  }
  const prevEcoOwner = previous?.economicStructure?.ownerId;
  const prevEcoType = previous?.economicStructure?.type as BuildableStructureType | undefined;
  const nextEcoOwner = next.economicStructure?.ownerId;
  const nextEcoType = next.economicStructure?.type as BuildableStructureType | undefined;
  if (prevEcoOwner !== nextEcoOwner || prevEcoType !== nextEcoType) {
    if (prevEcoOwner && prevEcoType) adjustOwnedStructureCount(prevEcoOwner, prevEcoType, -1);
    if (nextEcoOwner && nextEcoType) adjustOwnedStructureCount(nextEcoOwner, nextEcoType, 1);
  }
}

/**
 * Empire-wide Titanium/Umbrite Weapons Factory counts read from the
 * maintained per-owner index — O(1), versus weaponsFactoryCountsForPlayer's
 * full world-tile scan (202k tiles), which emitPlayerStateUpdate used to pay
 * on every 15s passive-income tick for every active player (2026-09-17 prod
 * CPU-throttle incident). This is the exact same index combat already reads
 * for its multipliers (runtime-weapons-factory-mults.ts), so the PLAYER_UPDATE
 * modBreakdown now matches what combat actually applies.
 */
export function weaponsFactoryCountsFromIndex(
  ownedStructureCountByPlayerByType: ReadonlyMap<string, ReadonlyMap<BuildableStructureType, number>>,
  playerId: string
): { titanium: number; umbrite: number } {
  return {
    titanium: ownedStructureCountForPlayer(ownedStructureCountByPlayerByType, playerId, "TITANIUM_WEAPONS_FACTORY"),
    umbrite: ownedStructureCountForPlayer(ownedStructureCountByPlayerByType, playerId, "UMBRITE_WEAPONS_FACTORY")
  };
}
