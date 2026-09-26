// The secondary bodies orbiting a galaxy system (design doc §18): fixed at
// generation, derived only from the system's seasonId so the gateway, the
// client menu and the 3D scene always agree. Uses the same FNV-1a hash the
// client's Space View already used for its decorative orbit bodies, so existing
// systems keep the same number of bodies they always showed.
export type GalaxyBodyKind = "GAS_GIANT" | "ASTEROID_BELT" | "ICE_MOON";

export const GALAXY_BODY_KINDS: readonly GalaxyBodyKind[] = ["GAS_GIANT", "ASTEROID_BELT", "ICE_MOON"];

const fnv1a = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

// 2 to 4 bodies per system.
export const galaxySystemBodyCount = (seasonId: string): number => 2 + (fnv1a(`orbit:${seasonId}`) % 3);

export const galaxySystemBodies = (seasonId: string): GalaxyBodyKind[] =>
  Array.from({ length: galaxySystemBodyCount(seasonId) }, (_, i) => GALAXY_BODY_KINDS[fnv1a(`orbit:${seasonId}:${i}`) % GALAXY_BODY_KINDS.length]!);
