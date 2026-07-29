import type { DomainTileState } from "@border-empires/game-domain";
import { MONUMENTAL_STRUCTURE_TYPES, type MonumentalStructureType } from "@border-empires/shared";

// §16 (docs/manpower-economy-rewrite-plan.md): exactly one of each monument
// type may ever be completed in a season — a runtime instance is one season
// (see season-winner-stats.ts), so there is no separate "season id" to track
// against. Base type -> its assembly-stage part type, and the reverse.
const PART_TYPE_FOR_BASE: Record<MonumentalStructureType, string> = {
  IMPERIAL_EXCHANGE: "IMPERIAL_EXCHANGE_PART",
  WORLD_ENGINE: "WORLD_ENGINE_PART",
  AEGIS_DOME: "AEGIS_DOME_PART",
  ASTRAL_DOCK: "ASTRAL_DOCK_PART"
};

const BASE_TYPE_FOR_PART: ReadonlyMap<string, MonumentalStructureType> = new Map(
  Object.entries(PART_TYPE_FOR_BASE).map(([base, part]) => [part, base as MonumentalStructureType])
);

const MONUMENTAL_STRUCTURE_TYPE_SET: ReadonlySet<string> = new Set(MONUMENTAL_STRUCTURE_TYPES);

export const isMonumentBaseType = (type: string): type is MonumentalStructureType => MONUMENTAL_STRUCTURE_TYPE_SET.has(type);

export const monumentPartTypeForBaseType = (type: MonumentalStructureType): string => PART_TYPE_FOR_BASE[type];

export const monumentBaseTypeForPartType = (type: string): MonumentalStructureType | undefined => BASE_TYPE_FOR_PART.get(type);

// Reject gate: is `type` (a monument base OR its part) already spoken for by
// a completed assembly anywhere on the map? Derived from tile state instead
// of a separately-persisted flag, so it can never drift from what's actually
// standing and needs no export/hydration plumbing of its own — a full-map
// scan is negligible cost against how rarely a monument build command fires.
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

// Every other player's completed part of `partType` — the pool eligible for
// the race-consolation manpower refund (§16) once someone else finishes the
// assembly first.
export const otherPlayersMonumentPartOwners = (
  tiles: ReadonlyMap<string, DomainTileState>,
  partType: string,
  winnerId: string
): string[] => {
  const owners: string[] = [];
  for (const tile of tiles.values()) {
    if (
      tile.economicStructure?.type === partType &&
      tile.economicStructure.status === "active" &&
      tile.economicStructure.ownerId &&
      tile.economicStructure.ownerId !== winnerId
    ) {
      owners.push(tile.economicStructure.ownerId);
    }
  }
  return owners;
};
