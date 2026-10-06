// The client's view of a tile's economic structure, extracted from client-types.ts (500-line cap).
// pausedAt: construction is on hold while the tile is under attack; remaining time is frozen at that instant.
export type ClientTileEconomicStructure = {
  ownerId: string;
  type:
    | "FARMSTEAD"
    | "WATERWORKS"
    | "UMBRITE_RIG"
    | "MINE"
    | "MINTWORKS"
    | "GRANARY"
    | "CENSUS_HALL"
    | "CLEARING_HOUSE"
    | "AIRPORT"
    | "AETHER_TOWER"
    | "WOODEN_FORT"
    | "RELAY_BEACON"
    | "UMBRITE_SYNTHESIZER"
    | "ADVANCED_UMBRITE_SYNTHESIZER"
    | "TITANIUM_WORKS"
    | "ADVANCED_TITANIUM_WORKS"
    | "CRYSTAL_SYNTHESIZER"
    | "ADVANCED_CRYSTAL_SYNTHESIZER"
    | "CARAVANARY"
    | "FOUNDRY"
    | "GARRISON_HALL"
    | "CUSTOMS_HOUSE"
    | "RAIL_DEPOT"
    | "GOVERNORS_OFFICE"
    | "RADAR_SYSTEM"
    | "QUARTERMASTERS_OFFICE"
    | "LOGISTICS_GUILD"
    | "ASSEMBLY_WORKS"
    | "ASTRAL_DOCK_PART_1"
    | "ASTRAL_DOCK_PART_2"
    | "ASTRAL_DOCK_PART_3"
    | "ASTRAL_DOCK"
    | "IMPERIAL_EXCHANGE_PART_1"
    | "IMPERIAL_EXCHANGE_PART_2"
    | "IMPERIAL_EXCHANGE_PART_3"
    | "WORLD_ENGINE_PART_1"
    | "WORLD_ENGINE_PART_2"
    | "WORLD_ENGINE_PART_3"
    | "AEGIS_DOME_PART_1"
    | "AEGIS_DOME_PART_2"
    | "AEGIS_DOME_PART_3"
    | "POPULATION_BUREAU_PART_1"
    | "POPULATION_BUREAU_PART_2"
    | "POPULATION_BUREAU_PART_3"
    | "TITANIUM_LEVY_PART_1"
    | "TITANIUM_LEVY_PART_2"
    | "TITANIUM_LEVY_PART_3"
    | "IMPERIAL_EXCHANGE"
    | "WORLD_ENGINE"
    | "AEGIS_DOME"
    | "POPULATION_BUREAU"
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
