import type { SeasonVictoryPathId } from "@border-empires/shared";

// Maps a season's winning victory path to the galactic-layer planet
// specialization it grants (docs/galactic-campaign-design.md §3). Pure and
// derivable from data already persisted on SeasonWinnerSnapshot/SeasonArchiveRow
// (objectiveId), so this needs no new stored field and applies retroactively
// to already-archived seasons.
export type GalaxySpecialization = "INDUSTRIAL" | "TRADE" | "EXTRACTION" | "LOGISTICS" | "CAPITAL";

export const GALAXY_SPECIALIZATION_NAME: Record<GalaxySpecialization, string> = {
  INDUSTRIAL: "Industrial",
  TRADE: "Trade",
  EXTRACTION: "Extraction",
  LOGISTICS: "Logistics",
  CAPITAL: "Capital"
};

const SPECIALIZATION_BY_VICTORY_PATH: Record<SeasonVictoryPathId, GalaxySpecialization> = {
  TOWN_CONTROL: "INDUSTRIAL",
  ECONOMIC_HEGEMONY: "TRADE",
  RESOURCE_MONOPOLY: "EXTRACTION",
  MARITIME_SUPREMACY: "LOGISTICS",
  DIPLOMATIC_DOMINANCE: "CAPITAL"
};

export const specializationForVictoryPath = (objectiveId: SeasonVictoryPathId): GalaxySpecialization =>
  SPECIALIZATION_BY_VICTORY_PATH[objectiveId];
