/**
 * §5.4 dormancy lookup for a single structure on a single tile — extracted
 * out of Runtime.isStructureDormant so runtime.ts stays net-smaller
 * (500-line budget, AGENTS.md). Pure: it takes the tile and the player's
 * already-computed dormancy sets and answers whether this structure is
 * currently short one of its required resource slots.
 */

import type { DomainTileState } from "@border-empires/game-domain";
import { structureSlotRequirements, type SlotStructureType } from "@border-empires/shared";
import type { ResourceSlotDormancy } from "./../resource-slot-view/resource-slot-view.js";

export type DormancyStructureField = "fort" | "observatory" | "siegeOutpost" | "economicStructure";

/** The slot-catalog key a tile's structure field maps to (fort/siege carry a variant, economic a type). */
export const slotStructureTypeForField = (
  structure: NonNullable<DomainTileState[DormancyStructureField]>,
  field: DormancyStructureField
): SlotStructureType => {
  if (field === "fort" || field === "siegeOutpost") {
    return ((structure as { variant?: string }).variant ?? (field === "fort" ? "FORT" : "SIEGE_OUTPOST")) as SlotStructureType;
  }
  if (field === "observatory") return "OBSERVATORY" as SlotStructureType;
  return (structure as { type: string }).type as SlotStructureType;
};

export const isStructureDormantForTile = (input: {
  tile: DomainTileState | undefined;
  tileKey: string;
  playerId: string;
  field: DormancyStructureField;
  dormancy: () => ResourceSlotDormancy;
}): boolean => {
  const structure = input.tile?.[input.field];
  if (!structure || structure.ownerId !== input.playerId) return false;
  const requirements = structureSlotRequirements(slotStructureTypeForField(structure, input.field));
  if (requirements.length === 0) return false;
  const dormancy = input.dormancy();
  const key = `${input.tileKey}:${input.field}`;
  return requirements.some((req) => dormancy[req.resource].has(key));
};
