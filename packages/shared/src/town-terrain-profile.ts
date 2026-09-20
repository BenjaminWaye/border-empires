import type { LandBiome, PopulationTier } from "./types.js";
import { TOWN_MANPOWER_BY_TIER } from "./config.js";

export type TownTerrainProfileId = "TUNDRA" | "DESERT" | "GRASS" | "COASTAL_DESERT";
export type TownTerrainProfile = {
  id: TownTerrainProfileId;
  label: string;
  goldMultiplier: number;
  manpowerCapacityMultiplier: number;
  manpowerRegenerationMultiplier: number;
  role: string;
};

export const TOWN_TERRAIN_PROFILES: Record<TownTerrainProfileId, TownTerrainProfile> = {
  TUNDRA: { id: "TUNDRA", label: "Tundra Industrial Town", goldMultiplier: 0.6, manpowerCapacityMultiplier: 0.55, manpowerRegenerationMultiplier: 0.55, role: "Industrial and military district" },
  DESERT: { id: "DESERT", label: "Desert Trade Town", goldMultiplier: 1.6, manpowerCapacityMultiplier: 0.6, manpowerRegenerationMultiplier: 0.6, role: "Trade and gold town" },
  GRASS: { id: "GRASS", label: "Grass Workforce Town", goldMultiplier: 1, manpowerCapacityMultiplier: 1, manpowerRegenerationMultiplier: 1, role: "Workforce and balanced town" },
  COASTAL_DESERT: { id: "COASTAL_DESERT", label: "Coastal Desert Trade Port", goldMultiplier: 1.75, manpowerCapacityMultiplier: 0.75, manpowerRegenerationMultiplier: 0.75, role: "Premium trade-port town" }
};

export const townTerrainProfileForBiome = (biome: LandBiome | undefined): TownTerrainProfileId => {
  if (biome === "TUNDRA") return "TUNDRA";
  if (biome === "COASTAL_SAND") return "COASTAL_DESERT";
  if (biome === "SAND") return "DESERT";
  return "GRASS";
};
export const townTerrainProfile = (profile: TownTerrainProfileId | undefined): TownTerrainProfile => TOWN_TERRAIN_PROFILES[profile ?? "GRASS"];
export const terrainAdjustedTownManpower = (tier: PopulationTier, profile: TownTerrainProfileId | undefined): { cap: number; regenPerMinute: number } => {
  const base = TOWN_MANPOWER_BY_TIER[tier];
  if (!base) return { cap: 0, regenPerMinute: 0 };
  const terrain = townTerrainProfile(profile);
  return { cap: base.cap * terrain.manpowerCapacityMultiplier, regenPerMinute: base.regenPerMinute * terrain.manpowerRegenerationMultiplier };
};
export const arsenalMultiplierForFactoryCount = (count: number): number => Math.min(2.25, 1 + 0.15 * Math.max(0, count - 1));
export const ancillaryFactoryCapacityBonus = (terrainAdjustedBaseCapacity: number, count: number, assemblyWorksActive: boolean): number =>
  Math.max(0, count) * (150 + terrainAdjustedBaseCapacity * (assemblyWorksActive ? 0.35 : 0.1));
