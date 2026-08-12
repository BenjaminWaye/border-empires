import {
  TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING,
  TITANIUM_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING,
  UMBRITE_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING,
  UMBRITE_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING
} from "@border-empires/shared";
import type { ModBreakdown } from "./tech-domain-bridge.js";

// Empire-wide count of active Titanium/Umbrite Weapons Factories the player
// owns, used only for the tech sidebar's informational breakdown below —
// NOT the value combat actually reads (that's scoped to a single connected
// town network, see networkWeaponsFactoryCountsForOrigin in runtime.ts).
// This total is the upper bound a player could reach if every factory they
// own were connected into one network.
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

// Appends informational (non-authoritative) attack/defense breakdown rows
// for the player's Weapons Factories, mutating the breakdown in place —
// same convention as addModBreakdownEntry in tech-domain-bridge.ts.
export const appendWeaponsFactoryBreakdownEntries = (
  breakdown: ModBreakdown,
  counts: { titanium: number; umbrite: number }
): void => {
  if (counts.titanium > 0) {
    breakdown.attack.push({ label: `Titanium Weapons Factory ×${counts.titanium} (max, if networked together)`, mult: 1 + counts.titanium * TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING });
    breakdown.defense.push({ label: `Titanium Weapons Factory ×${counts.titanium} (max, if networked together)`, mult: 1 + counts.titanium * TITANIUM_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING });
  }
  if (counts.umbrite > 0) {
    breakdown.attack.push({ label: `Umbrite Weapons Factory ×${counts.umbrite} (max, if networked together)`, mult: 1 + counts.umbrite * UMBRITE_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING });
    breakdown.defense.push({ label: `Umbrite Weapons Factory ×${counts.umbrite} (max, if networked together)`, mult: 1 + counts.umbrite * UMBRITE_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING });
  }
};
