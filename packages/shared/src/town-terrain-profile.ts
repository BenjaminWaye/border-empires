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

export const COASTAL_TOWN_MODIFIER = {
  goldMultiplier: 1.2,
  manpowerCapacityMultiplier: 1.2,
  manpowerRegenerationMultiplier: 1.2
} as const;

export const TOWN_TERRAIN_PROFILES: Record<TownTerrainProfileId, TownTerrainProfile> = {
  TUNDRA: { id: "TUNDRA", label: "Tundra Town", goldMultiplier: 0.6, manpowerCapacityMultiplier: 0.55, manpowerRegenerationMultiplier: 0.55, role: "Arsenal and hard-industry district" },
  DESERT: { id: "DESERT", label: "Sunscorched Trade Town", goldMultiplier: 1.6, manpowerCapacityMultiplier: 0.6, manpowerRegenerationMultiplier: 0.6, role: "Mercantile district" },
  GRASS: { id: "GRASS", label: "Fertile Plains Town", goldMultiplier: 1, manpowerCapacityMultiplier: 1, manpowerRegenerationMultiplier: 1, role: "Civic workforce and balanced support" },
  // Kept only to read towns created before coastal became a separate axis.
  // Use townTerrainModifiers() for all output calculations.
  COASTAL_DESERT: { id: "COASTAL_DESERT", label: "Coastal Town", goldMultiplier: 1.6, manpowerCapacityMultiplier: 0.6, manpowerRegenerationMultiplier: 0.6, role: "Coastal district" }
};

export const townTerrainProfileForBiome = (biome: LandBiome | undefined): TownTerrainProfileId => {
  if (biome === "TUNDRA") return "TUNDRA";
  if (biome === "COASTAL_SAND") return "DESERT";
  if (biome === "SAND") return "DESERT";
  return "GRASS";
};

// Seasons that began before terrain town economies shipped have no persisted
// profile on their existing towns. Their mechanical biome has always been
// snapshotted, so resolve that durable map identity before falling back to
// Grass. Stored profiles still win: a town's character never changes when a
// later visual or terrain presentation changes around it.
export const resolvedTownTerrainProfileId = (
  profile: TownTerrainProfileId | undefined,
  biome: LandBiome | undefined
): TownTerrainProfileId => profile ?? townTerrainProfileForBiome(biome);

export const townTerrainProfile = (profile: TownTerrainProfileId | undefined): TownTerrainProfile => TOWN_TERRAIN_PROFILES[profile ?? "GRASS"];

export const townIsCoastal = (profile: TownTerrainProfileId | undefined, coastal = false): boolean =>
  coastal || profile === "COASTAL_DESERT";

export const resolvedTownCoastal = (
  profile: TownTerrainProfileId | undefined,
  biome: LandBiome | undefined,
  coastal = false
): boolean => townIsCoastal(profile, coastal || (!profile && biome === "COASTAL_SAND"));

export const townTerrainModifiers = (
  profile: TownTerrainProfileId | undefined,
  coastal = false
): TownTerrainProfile & { coastal: boolean } => {
  const terrain = townTerrainProfile(profile === "COASTAL_DESERT" ? "DESERT" : profile);
  const isCoastal = townIsCoastal(profile, coastal);
  if (!isCoastal) return { ...terrain, coastal: false };
  return {
    ...terrain,
    coastal: true,
    goldMultiplier: terrain.goldMultiplier * COASTAL_TOWN_MODIFIER.goldMultiplier,
    manpowerCapacityMultiplier: terrain.manpowerCapacityMultiplier * COASTAL_TOWN_MODIFIER.manpowerCapacityMultiplier,
    manpowerRegenerationMultiplier: terrain.manpowerRegenerationMultiplier * COASTAL_TOWN_MODIFIER.manpowerRegenerationMultiplier
  };
};

export const terrainAdjustedTownManpower = (tier: PopulationTier, profile: TownTerrainProfileId | undefined, coastal = false): { cap: number; regenPerMinute: number } => {
  const base = TOWN_MANPOWER_BY_TIER[tier];
  if (!base) return { cap: 0, regenPerMinute: 0 };
  const terrain = townTerrainModifiers(profile, coastal);
  return { cap: base.cap * terrain.manpowerCapacityMultiplier, regenPerMinute: base.regenPerMinute * terrain.manpowerRegenerationMultiplier };
};
export const arsenalMultiplierForFactoryCount = (count: number): number => Math.min(2.25, 1 + 0.15 * Math.max(0, count - 1));
export const ancillaryFactoryCapacityBonus = (terrainAdjustedBaseCapacity: number, count: number, assemblyWorksActive: boolean): number =>
  Math.max(0, count) * (150 + terrainAdjustedBaseCapacity * (assemblyWorksActive ? 0.35 : 0.1));
