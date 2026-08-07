import type { EconomicStructureType, PlayerId, TileKey } from "./types.js";

export type ConverterMode = "SYNTHESIZE" | "EXCHANGE";

export interface EconomicStructure {
  id: string;
  type: EconomicStructureType;
  tileKey: TileKey;
  ownerId: PlayerId;
  status: "under_construction" | "active" | "inactive" | "removing";
  completesAt?: number;
  disabledUntil?: number;
  inactiveReason?: "manual" | "upkeep";
  previousStatus?: "active" | "inactive";
  nextUpkeepAt: number;
  powered?: boolean;
  bombardCooldownUntil?: number;
  converterMode?: ConverterMode;
  modeLockedUntil?: number;
}
