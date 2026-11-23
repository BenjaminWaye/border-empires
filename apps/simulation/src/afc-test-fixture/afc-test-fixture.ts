import { FORT_TIER_ORDER, SIEGE_TIER_ORDER, fortTierTechId, siegeTierTechId } from "@border-empires/shared";
import { techEntryById } from "../tech-domain-bridge/tech-domain-bridge.js";

// An installed module unlocks its building or tier without research
// (afc-module-build-access.ts), and a fresh Fort/Siege build takes the best
// unlocked tier. Installing the tier modules here would make every fixture
// player build Thunder Bastions and Dread Towers, so the tier stays decided
// by each test's researched techIds.
const TIER_MODULE_TECH_IDS = new Set([...FORT_TIER_ORDER.map(fortTierTechId), ...SIEGE_TIER_ORDER.map(siegeTierTechId)].filter((id): id is string => id !== undefined));

/**
 * Structure builds whose tech is an AFC_MODULE Manifest require an active AFC
 * with that module installed. Tests that grant techIds directly (bypassing
 * research-time commissioning) add this tile so those builds stay reachable.
 * Placed at (1, 1), clear of the coordinates the structure tests use.
 */
export const afcModuleFixtureTile = (ownerId: string) => ({
  x: 1,
  y: 1,
  terrain: "LAND" as const,
  ownerId,
  ownershipState: "SETTLED" as const,
  afc: {
    ownerId,
    status: "active" as const,
    activatedAt: 0,
    modules: [...techEntryById.values()].filter((tech) => tech.manifestCategory === "AFC_MODULE" && !TIER_MODULE_TECH_IDS.has(tech.id)).map((tech) => tech.id)
  }
});
