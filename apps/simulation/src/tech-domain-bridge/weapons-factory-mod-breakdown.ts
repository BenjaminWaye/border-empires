import {
  TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING,
  TITANIUM_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING,
  UMBRITE_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING,
  UMBRITE_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING,
  WEAPONS_WORKSHOP_ATTACK_MULT_PER_BUILDING,
  WEAPONS_WORKSHOP_DEFENSE_MULT_PER_BUILDING,
  salvageArmsMultiplier
} from "@border-empires/shared";
import type { ModBreakdown } from "./tech-domain-bridge.js";

// Empire-wide count of active Titanium/Umbrite Weapons Factories the player
// owns. Combat reads this exact same empire-wide total (see
// titaniumWeaponsFactoryAttackMultForPlayer/etc. in runtime-combat-support.ts)
// — not scoped to any particular town's connected network.
export const weaponsFactoryCountsForPlayer = (
  playerId: string,
  tiles: Iterable<{ ownerId?: string | undefined; economicStructure?: { type?: string | undefined; status?: string | undefined } | undefined }>
): { titanium: number; umbrite: number } => {
  let titanium = 0;
  let umbrite = 0;
  for (const tile of tiles) {
    if (tile.ownerId !== playerId || tile.economicStructure?.status !== "active") continue;
    if (tile.economicStructure.type === "TITANIUM_WEAPONS_FACTORY") titanium += 1;
    else if (tile.economicStructure.type === "UMBRITE_WEAPONS_FACTORY") umbrite += 1;
  }
  return { titanium, umbrite };
};

/**
 * Counts behind the weapons rows. titanium/umbrite are raw copies (the row
 * label); the optional equivalents are concentratedFactoryEquivalent, which
 * is what combat actually multiplies by (towns supported by several factories
 * count each copy for more). Without them the raw count stands in, which is
 * only exact when no town is supported by more than one factory.
 */
export type WeaponsFactoryBreakdownCounts = {
  titanium: number;
  umbrite: number;
  titaniumEquivalent?: number;
  umbriteEquivalent?: number;
  /** Legacy Weapons Workshops still owned from before their retirement. */
  workshop?: number;
  /** Reclamation Works still holding loads (precursor salvage arms). */
  salvage?: number;
};

// Appends attack/defense breakdown rows for the player's weapons industry,
// mutating the breakdown in place — same convention as addModBreakdownEntry
// in tech-domain-bridge.ts. Mirrors the infrastructure rows of
// attackerInfrastructure/defenderInfrastructure in shared frontier-combat.ts,
// so the profile's Attack/Defense matches the battle screen's base strength.
export const appendWeaponsFactoryBreakdownEntries = (
  breakdown: ModBreakdown,
  counts: WeaponsFactoryBreakdownCounts,
  defenseContributionMult = 1
): void => {
  const workshop = counts.workshop ?? 0;
  if (workshop > 0) {
    breakdown.attack.push({ label: `Weapons Workshop ×${workshop}`, mult: 1 + workshop * WEAPONS_WORKSHOP_ATTACK_MULT_PER_BUILDING });
    breakdown.defense.push({ label: `Weapons Workshop ×${workshop}`, mult: 1 + workshop * WEAPONS_WORKSHOP_DEFENSE_MULT_PER_BUILDING });
  }
  if (counts.titanium > 0) {
    const eq = counts.titaniumEquivalent ?? counts.titanium;
    breakdown.attack.push({ label: `Titanium Weapons Factory ×${counts.titanium}`, mult: 1 + eq * TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING });
    breakdown.defense.push({ label: `Titanium Weapons Factory ×${counts.titanium}`, mult: 1 + eq * TITANIUM_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING * defenseContributionMult });
  }
  if (counts.umbrite > 0) {
    const eq = counts.umbriteEquivalent ?? counts.umbrite;
    breakdown.attack.push({ label: `Umbrite Weapons Factory ×${counts.umbrite}`, mult: 1 + eq * UMBRITE_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING });
    breakdown.defense.push({ label: `Umbrite Weapons Factory ×${counts.umbrite}`, mult: 1 + eq * UMBRITE_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING * defenseContributionMult });
  }
  const salvage = salvageArmsMultiplier(counts.salvage ?? 0);
  if (salvage !== 1) {
    breakdown.attack.push({ label: "Precursor salvage", mult: salvage });
    breakdown.defense.push({ label: "Precursor salvage", mult: salvage });
  }
};
