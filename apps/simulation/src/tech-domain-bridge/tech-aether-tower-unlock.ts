import type { DomainPlayer } from "@border-empires/game-domain";

// Techs that unlock a structure/ability gated on isStructurePowered (a
// nearby active Ambaric Transformer Station / Aether Tower) -- Imperial
// Exchange, Titanium Levy, World Engine, Aegis Dome, Astral Dock, Airport,
// Radar System -- but whose own branch has nothing to do with the tower's
// (plastics/industrial-extraction). Without this, researching e.g. Grand
// Bazaars for the Imperial Exchange left its levy permanently unusable
// unless the player also detoured through an entire unrelated tech branch
// just to be *able* to build the tower it needs power from, with no
// warning anywhere that the two were linked.
//
// Split out of tech-domain-bridge.ts (already over the repo's 500-line soft
// cap) so this addition doesn't grow that file further -- see
// scripts/check-file-line-limits.mjs.
export const TECHS_THAT_ALSO_UNLOCK_AETHER_TOWER = new Set([
  "urban-mintworks", // Grand Bazaars -> Imperial Exchange
  "grand-levy-doctrine", // -> Titanium Levy
  "world-engine", // Worldbreaker Doctrine -> World Engine
  "aegis-dome", // Aegis Doctrine -> Aegis Dome
  "astral-dock", // Astral Doctrine -> Astral Dock
  "aeronautics", // Sky Vessel Engineering -> Airport
  "radar" // Resonance Detection -> Radar System
]);

export const AETHER_TOWER_TECH_ID = "plastics";

/**
 * Researching any tech in TECHS_THAT_ALSO_UNLOCK_AETHER_TOWER also grants
 * "plastics" (Ambaric Engineering, the tech that unlocks the tower itself)
 * for free, so the tower becomes buildable the moment a player commits to
 * any one of the structures that depends on its power -- no separate
 * research, and no redundant "unlocks Aether Towers" prompt once it's
 * already owned (reachableTechChoices already excludes owned techs from
 * future choices).
 */
export function grantAetherTowerUnlockIfLinked(player: Pick<DomainPlayer, "techIds">, techId: string): void {
  if (TECHS_THAT_ALSO_UNLOCK_AETHER_TOWER.has(techId)) player.techIds.add(AETHER_TOWER_TECH_ID);
}
