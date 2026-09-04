import type { DomainPlayer } from "@border-empires/game-domain";

// Techs that unlock a structure/ability gated on isStructurePowered (a
// nearby active Ambaric Transformer Station / Aether Tower) -- Imperial
// Exchange, Titanium Levy, World Engine, Aegis Dome, Astral Dock, Airport,
// Radar System -- but whose own branch has nothing to do with the tower's.
// Researching any tech in this set also grants "plastics" (the id
// TECH_REQUIREMENTS_BY_STRUCTURE gates AETHER_TOWER on -- see
// structure-registry-economic.ts), so the tower becomes buildable the
// moment a player commits to any one of the structures that depends on
// its power. "plastics" is deliberately NOT a standalone entry in
// tech-tree.json: it only ever exists in a player's techIds as a side
// effect of researching one of the techs below, never as its own research
// choice.
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
 * "plastics" for free, so the tower becomes buildable the moment a player
 * commits to any one of the structures that depends on its power -- no
 * separate research needed.
 */
export function grantAetherTowerUnlockIfLinked(player: Pick<DomainPlayer, "techIds">, techId: string): void {
  if (TECHS_THAT_ALSO_UNLOCK_AETHER_TOWER.has(techId)) player.techIds.add(AETHER_TOWER_TECH_ID);
}
