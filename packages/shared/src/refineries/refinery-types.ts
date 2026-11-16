// Town refineries (docs/territory-development-plan.md, Phase 2). A refinery
// stands on a town's support ring and processes one strategic deposit field;
// a booster on the same town's ring raises every processed tile of its
// resource by one more slot. Pure constants and type guards only; the field,
// link and processing rules live beside this file.
import type { EconomicStructureType, OwnershipState, ResourceType, Terrain } from "../types.js";

/** Extra slots each processed, garrisoned field tile gives. */
export const REFINERY_SLOTS_PER_TILE = 2;
/** Further slots per processed tile while the town has the matching booster. */
export const REFINERY_BOOSTER_SLOTS_PER_TILE = 1;

export type RefineryFieldResource = "TITANIUM" | "UMBRITE" | "GEMS";
export type RefineryType = "TITANIUM_REFINERY" | "UMBRITE_REFINERY" | "CRYSTAL_REFINERY";
export type RefineryBoosterType = "TITANIUM_SMELTER" | "UMBRITE_DISTILLERY" | "CRYSTAL_CUTTER";

export const REFINERY_TYPE_BY_RESOURCE: Readonly<Record<RefineryFieldResource, RefineryType>> = {
  TITANIUM: "TITANIUM_REFINERY",
  UMBRITE: "UMBRITE_REFINERY",
  GEMS: "CRYSTAL_REFINERY"
};

export const REFINERY_BOOSTER_TYPE_BY_RESOURCE: Readonly<Record<RefineryFieldResource, RefineryBoosterType>> = {
  TITANIUM: "TITANIUM_SMELTER",
  UMBRITE: "UMBRITE_DISTILLERY",
  GEMS: "CRYSTAL_CUTTER"
};

export const REFINERY_FIELD_RESOURCE_BY_TYPE: Readonly<Record<RefineryType, RefineryFieldResource>> = {
  TITANIUM_REFINERY: "TITANIUM",
  UMBRITE_REFINERY: "UMBRITE",
  CRYSTAL_REFINERY: "GEMS"
};

export const REFINERY_TYPES: readonly RefineryType[] = ["TITANIUM_REFINERY", "UMBRITE_REFINERY", "CRYSTAL_REFINERY"];
export const REFINERY_BOOSTER_TYPES: readonly RefineryBoosterType[] = ["TITANIUM_SMELTER", "UMBRITE_DISTILLERY", "CRYSTAL_CUTTER"];

export const isRefineryType = (type: string | undefined): type is RefineryType =>
  type === "TITANIUM_REFINERY" || type === "UMBRITE_REFINERY" || type === "CRYSTAL_REFINERY";

export const isRefineryBoosterType = (type: string | undefined): type is RefineryBoosterType =>
  type === "TITANIUM_SMELTER" || type === "UMBRITE_DISTILLERY" || type === "CRYSTAL_CUTTER";

export const isRefineryFieldResource = (resource: string | undefined): resource is RefineryFieldResource =>
  resource === "TITANIUM" || resource === "UMBRITE" || resource === "GEMS";

/** Persisted on a refinery's economic structure record: the anchor tile of its field and when it was assigned. */
export type RefineryFieldAssignment = { x: number; y: number; assignedAt: number };

/**
 * Derived (never persisted) per-viewer status the simulation attaches to a
 * refinery's economic-structure JSON. The owner gets the field and output;
 * other viewers only learn whether it is linked.
 */
export type RefineryWireStatus =
  | { fieldX: number; fieldY: number; linked: boolean; processedTiles: number }
  | { unassigned: true }
  | { linked: boolean };

/** The tile fields the refinery rules read. Structural, so domain and wire-parsed tiles both fit. */
export type RefineryTile = {
  x: number;
  y: number;
  terrain: Terrain;
  resource?: ResourceType | undefined;
  ownerId?: string | undefined;
  ownershipState?: OwnershipState | undefined;
  town?: { populationTier?: string | undefined } | null | undefined;
  economicStructure?: RefineryStructureRecord | null | undefined;
};

export type RefineryStructureRecord = {
  ownerId: string;
  type: EconomicStructureType;
  status: string;
  refineryField?: RefineryFieldAssignment | undefined;
};

/** Which town's support ring a tile belongs to for this owner ("x,y"), if any. */
export type RefineryTownResolver = (ownerId: string, x: number, y: number) => string | undefined;
