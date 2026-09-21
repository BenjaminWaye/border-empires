import {
  COASTAL_TOWN_MODIFIER,
  townIsCoastal,
  townTerrainProfile,
  type TownTerrainProfileId
} from "@border-empires/shared";

type TownStatModifier = {
  label: string;
  goldOutputPercent: number;
  manpowerCapacityPercent: number;
  manpowerRegenPercent: number;
};

const labelForTerrain = (profile: TownTerrainProfileId): string =>
  profile === "DESERT" || profile === "COASTAL_DESERT" ? "Trade Town" : townTerrainProfile(profile).label;

export const townCharacterLabelForProfile = (
  profile: TownTerrainProfileId,
  coastal: boolean
): string => {
  const terrainProfile = profile === "COASTAL_DESERT" ? "DESERT" : profile;
  const terrainLabel = townTerrainProfile(terrainProfile).label;
  return townIsCoastal(profile, coastal) ? `${terrainLabel} · Coastal Town` : terrainLabel;
};

export const townStatModifiersForProfile = (
  profile: TownTerrainProfileId,
  coastal: boolean
): TownStatModifier[] => {
  const terrain = townTerrainProfile(profile === "COASTAL_DESERT" ? "DESERT" : profile);
  const modifiers: TownStatModifier[] = [{
    label: labelForTerrain(profile),
    goldOutputPercent: Math.round((terrain.goldMultiplier - 1) * 100),
    manpowerCapacityPercent: Math.round((terrain.manpowerCapacityMultiplier - 1) * 100),
    manpowerRegenPercent: Math.round((terrain.manpowerRegenerationMultiplier - 1) * 100)
  }];
  if (townIsCoastal(profile, coastal)) {
    modifiers.push({
      label: "Coastal Town",
      goldOutputPercent: Math.round((COASTAL_TOWN_MODIFIER.goldMultiplier - 1) * 100),
      manpowerCapacityPercent: Math.round((COASTAL_TOWN_MODIFIER.manpowerCapacityMultiplier - 1) * 100),
      manpowerRegenPercent: Math.round((COASTAL_TOWN_MODIFIER.manpowerRegenerationMultiplier - 1) * 100)
    });
  }
  return modifiers;
};
