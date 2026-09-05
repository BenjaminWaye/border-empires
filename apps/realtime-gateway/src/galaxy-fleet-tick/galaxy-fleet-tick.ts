import { computeFleetDamage, isReconOnlyComposition, type FleetComposition } from "../galaxy-fleet-config/galaxy-fleet-config.js";
import type { GalaxyFleetOrderOutcome } from "../galaxy-fleet-store/galaxy-fleet-store.js";

// Pure raid resolution (§13's formula): "Garrison cancels incoming raid
// damage 1:1 up to its own Production value... breaking a full-health
// Sector needs damage exceeding (Stability + Garrison)." Kept separate
// from galaxy-fleet-scheduler.ts (wall-clock/store wiring) the same way
// galaxy-senate-tick.ts is split from galaxy-senate-scheduler.ts.
export const resolveFleetRaid = (input: {
  composition: FleetComposition;
  garrisonProduction: number;
  currentStability: number;
}): GalaxyFleetOrderOutcome => {
  const damageDealt = computeFleetDamage(input.composition);

  if (isReconOnlyComposition(input.composition)) {
    return {
      reconOnly: true,
      damageDealt: 0,
      garrisonAbsorbed: 0,
      netDamage: 0,
      stabilityBefore: input.currentStability,
      stabilityAfter: input.currentStability,
      revealedGarrison: input.garrisonProduction
    };
  }

  const garrisonAbsorbed = Math.min(damageDealt, input.garrisonProduction);
  const netDamage = damageDealt - garrisonAbsorbed;
  const stabilityAfter = Math.max(0, input.currentStability - netDamage);

  return {
    reconOnly: false,
    damageDealt,
    garrisonAbsorbed,
    netDamage,
    stabilityBefore: input.currentStability,
    stabilityAfter
  };
};
