import type { DomainTileState } from "@border-empires/game-domain";
import { MONUMENTAL_STRUCTURE_TYPES, type MonumentalStructureType } from "@border-empires/shared";

// §16 (docs/manpower-economy-rewrite-plan.md): exactly one of each monument
// type may ever be completed in a season — a runtime instance is one season
// (see season-winner-stats.ts), so there is no separate "season id" to track
// against. Base type -> its 3 uniquely-named assembly-stage component types,
// and the reverse (component type -> base type).
const PART_TYPES_FOR_BASE: Record<MonumentalStructureType, readonly string[]> = {
  IMPERIAL_EXCHANGE: ["IMPERIAL_EXCHANGE_PART_1", "IMPERIAL_EXCHANGE_PART_2", "IMPERIAL_EXCHANGE_PART_3"],
  WORLD_ENGINE: ["WORLD_ENGINE_PART_1", "WORLD_ENGINE_PART_2", "WORLD_ENGINE_PART_3"],
  AEGIS_DOME: ["AEGIS_DOME_PART_1", "AEGIS_DOME_PART_2", "AEGIS_DOME_PART_3"],
  ASTRAL_DOCK: ["ASTRAL_DOCK_PART_1", "ASTRAL_DOCK_PART_2", "ASTRAL_DOCK_PART_3"],
  POPULATION_BUREAU: ["POPULATION_BUREAU_PART_1", "POPULATION_BUREAU_PART_2", "POPULATION_BUREAU_PART_3"],
  IRON_LEVY: ["IRON_LEVY_PART_1", "IRON_LEVY_PART_2", "IRON_LEVY_PART_3"]
};

const BASE_TYPE_FOR_PART: ReadonlyMap<string, MonumentalStructureType> = new Map(
  Object.entries(PART_TYPES_FOR_BASE).flatMap(([base, parts]) => parts.map((part) => [part, base as MonumentalStructureType] as const))
);

const MONUMENTAL_STRUCTURE_TYPE_SET: ReadonlySet<string> = new Set(MONUMENTAL_STRUCTURE_TYPES);

export const isMonumentBaseType = (type: string): type is MonumentalStructureType => MONUMENTAL_STRUCTURE_TYPE_SET.has(type);

export const monumentPartTypesForBaseType = (type: MonumentalStructureType): readonly string[] => PART_TYPES_FOR_BASE[type];

export const monumentBaseTypeForPartType = (type: string): MonumentalStructureType | undefined => BASE_TYPE_FOR_PART.get(type);

// Reject gate: is `type` (a monument base OR one of its 3 component types)
// already spoken for by a completed assembly anywhere on the map? Derived
// from tile state instead of a separately-persisted flag, so it can never
// drift from what's actually standing and needs no export/hydration
// plumbing of its own — a full-map scan is negligible cost against how
// rarely a monument build command fires.
export const monumentClaimOwnerId = (
  tiles: ReadonlyMap<string, DomainTileState>,
  baseType: MonumentalStructureType
): string | undefined => {
  for (const tile of tiles.values()) {
    if (tile.economicStructure?.status === "active" && tile.economicStructure.type === baseType) {
      return tile.economicStructure.ownerId;
    }
  }
  return undefined;
};

// Every other player who owns any of `partTypes` (a monument's 3 component
// types) — the pool eligible for the race-consolation manpower refund (§16)
// once someone else finishes the assembly first.
export const otherPlayersMonumentPartOwners = (
  tiles: ReadonlyMap<string, DomainTileState>,
  partTypes: readonly string[],
  winnerId: string
): string[] => {
  const partTypeSet = new Set(partTypes);
  const owners: string[] = [];
  for (const tile of tiles.values()) {
    if (
      tile.economicStructure?.type &&
      partTypeSet.has(tile.economicStructure.type) &&
      tile.economicStructure.status === "active" &&
      tile.economicStructure.ownerId &&
      tile.economicStructure.ownerId !== winnerId
    ) {
      owners.push(tile.economicStructure.ownerId);
    }
  }
  return owners;
};
