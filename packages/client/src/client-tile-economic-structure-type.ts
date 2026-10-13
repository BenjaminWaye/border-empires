// The client's view of a tile's economic structure, extracted from client-types.ts (500-line cap).
// pausedAt: construction is on hold while the tile is under attack; remaining time is frozen at that instant.
export type ClientTileEconomicStructure = {
  ownerId: string;
  type:
    | "HYDROGARDEN"
    | "HYDROWORKS"
    | "UMBRITE_RIG"
    | "MINE"
    | "MINTWORKS"
    | "INCUBATION_ENGINE"
    | "CENSUS_HALL"
    | "CLEARING_HOUSE"
    | "SKY_DOCK"
    | "AMBARIC_TRANSFORMER"
    | "PALISADE"
    | "RELAY_BEACON"
    | "UMBRITE_WORKS"
    | "HIGH_YIELD_UMBRITE_WORKS"
    | "TITANIUM_WORKS"
    | "HIGH_YIELD_TITANIUM_WORKS"
    | "AETHER_CONDENSER"
    | "HIGH_YIELD_AETHER_CONDENSER"
    | "TRADE_NEXUS"
    | "ORE_REFINERY"
    | "ANCILLARY_DEPOT"
    | "HARBOR_EXCHANGE"
    | "NEURAL_WORKS"
    | "MINISTRY_HALL"
    | "RESONANCE_GRID"
    | "QUARTERMASTERS_OFFICE"
    | "ANCILLARY_FACTORY"
    | "RESERVE_LATTICE"
    | "ASTRAL_DOCK_PART_1"
    | "ASTRAL_DOCK_PART_2"
    | "ASTRAL_DOCK_PART_3"
    | "ASTRAL_DOCK"
    | "IMPERIAL_EXCHANGE_PART_1"
    | "IMPERIAL_EXCHANGE_PART_2"
    | "IMPERIAL_EXCHANGE_PART_3"
    | "SOVEREIGN_SIEGE_ENGINE_PART_1"
    | "SOVEREIGN_SIEGE_ENGINE_PART_2"
    | "SOVEREIGN_SIEGE_ENGINE_PART_3"
    | "AEGIS_DOME_PART_1"
    | "AEGIS_DOME_PART_2"
    | "AEGIS_DOME_PART_3"
    | "CENSUS_DIRECTORATE_PART_1"
    | "CENSUS_DIRECTORATE_PART_2"
    | "CENSUS_DIRECTORATE_PART_3"
    | "TITANIUM_LEVY_PART_1"
    | "TITANIUM_LEVY_PART_2"
    | "TITANIUM_LEVY_PART_3"
    | "IMPERIAL_EXCHANGE"
    | "SOVEREIGN_SIEGE_ENGINE"
    | "AEGIS_DOME"
    | "CENSUS_DIRECTORATE"
    | "TITANIUM_LEVY"
    | "WEAPONS_WORKSHOP"
    | "TITANIUM_WEAPONS_FACTORY"
    | "UMBRITE_WEAPONS_FACTORY";
  status: "under_construction" | "active" | "inactive" | "removing";
  completesAt?: number;
  startedAt?: number;
  pausedAt?: number;
  disabledUntil?: number;
  inactiveReason?: "manual" | "upkeep";
  converterMode?: "SYNTHESIZE" | "EXCHANGE"; modeLockedUntil?: number; powered?: boolean; bombardCooldownUntil?: number;
};
