import { MONUMENTAL_STRUCTURE_TYPES, type MonumentalStructureType } from "./types.js";

// Single source of truth for which tech researches into which monument
// (tech-tree.json's `effects.unlockX` boolean on each tech, mirrored here so
// simulation and client agree on the mapping without either one parsing the
// other's tree). A monument is season-unique (see monument-uniqueness.ts,
// apps/simulation) — once anyone's assembly is complete, the tech that
// unlocks it becomes pointless to research for everyone who doesn't already
// have it, so both the research reject-gate and the tech-tree UI need this
// mapping to lock the tech and explain why.
export const MONUMENT_UNLOCK_TECH_ID: Record<MonumentalStructureType, string> = {
  IMPERIAL_EXCHANGE: "urban-mintworks",
  WORLD_ENGINE: "world-engine",
  AEGIS_DOME: "aegis-dome",
  ASTRAL_DOCK: "astral-dock",
  POPULATION_BUREAU: "demographic-registry",
  TITANIUM_LEVY: "grand-levy-doctrine"
};

const MONUMENT_TYPE_BY_UNLOCK_TECH_ID: ReadonlyMap<string, MonumentalStructureType> = new Map(
  MONUMENTAL_STRUCTURE_TYPES.map((type) => [MONUMENT_UNLOCK_TECH_ID[type], type] as const)
);

export const monumentTypeForUnlockTechId = (techId: string): MonumentalStructureType | undefined =>
  MONUMENT_TYPE_BY_UNLOCK_TECH_ID.get(techId);
