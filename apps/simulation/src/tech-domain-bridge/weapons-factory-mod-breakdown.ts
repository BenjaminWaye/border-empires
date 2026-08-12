import {
  TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING,
  TITANIUM_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING,
  UMBRITE_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING,
  UMBRITE_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING
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

// Appends attack/defense breakdown rows for the player's Weapons Factories,
// mutating the breakdown in place — same convention as addModBreakdownEntry
// in tech-domain-bridge.ts. These are the exact empire-wide multipliers
// combat applies (see weaponsFactoryCountsForPlayer's doc comment above).
export const appendWeaponsFactoryBreakdownEntries = (
  breakdown: ModBreakdown,
  counts: { titanium: number; umbrite: number }
): void => {
  if (counts.titanium > 0) {
    breakdown.attack.push({ label: `Titanium Weapons Factory ×${counts.titanium}`, mult: 1 + counts.titanium * TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING });
    breakdown.defense.push({ label: `Titanium Weapons Factory ×${counts.titanium}`, mult: 1 + counts.titanium * TITANIUM_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING });
  }
  if (counts.umbrite > 0) {
    breakdown.attack.push({ label: `Umbrite Weapons Factory ×${counts.umbrite}`, mult: 1 + counts.umbrite * UMBRITE_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING });
    breakdown.defense.push({ label: `Umbrite Weapons Factory ×${counts.umbrite}`, mult: 1 + counts.umbrite * UMBRITE_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING });
  }
};
