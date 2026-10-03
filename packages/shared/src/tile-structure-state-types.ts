// State shapes for the structure fields on a Tile (fort / siegeOutpost /
// observatory / afc / economicStructure), extracted from types.ts. See
// docs/structure-slot-unification-plan.md for where these are heading.
//
// activatedAt: when the structure went active, set on build completion and
// refreshed on capture -- ranks which structure loses power first on a
// resource-slot shortfall (§5.4: newest built-or-captured goes dormant first).
import type { ConverterMode } from "./economic-structure.js";
import type {
  AfcStatus,
  EconomicStructureType,
  FortStatus,
  FortVariant,
  ObservatoryStatus,
  PlayerId,
  SiegeOutpostStatus,
  SiegeOutpostVariant
} from "./types.js";

export type TileFortState = {
  ownerId: PlayerId;
  status: FortStatus;
  variant?: FortVariant;
  // Set while a fort-family upgrade is under_construction: the tier that keeps
  // standing (and defending) until the new one completes.
  upgradingFrom?: FortVariant;
  completesAt?: number;
  activatedAt?: number;
  disabledUntil?: number;
};

export type TileSiegeOutpostState = {
  ownerId: PlayerId;
  status: SiegeOutpostStatus;
  variant?: SiegeOutpostVariant;
  completesAt?: number;
  activatedAt?: number;
};

export type TileObservatoryState = {
  ownerId: PlayerId;
  status: ObservatoryStatus;
  completesAt?: number;
  activatedAt?: number;
  cooldownUntil?: number;
  siphon?: { targetX: number; targetY: number; tileKeys: string[]; startedAt: number };
};

export type TileAfcState = {
  ownerId: PlayerId;
  status: AfcStatus;
  activatedAt?: number;
  // Tech ids of AFC_MODULE-category Manifests installed here. Modules without
  // a matching houseModules entry are captured copies (including legacy
  // saves created before provenance was added).
  modules?: string[];
  // The researched, House-owned copy of each module. A player may redeploy
  // this one between their AFCs; captured copies deliberately stay put.
  houseModules?: string[];
};

export type TileEconomicStructureState = {
  ownerId: PlayerId;
  type: EconomicStructureType;
  status: "under_construction" | "active" | "inactive" | "removing";
  completesAt?: number;
  activatedAt?: number;
  disabledUntil?: number;
  inactiveReason?: "manual" | "upkeep";
  converterMode?: ConverterMode;
  modeLockedUntil?: number;
};
