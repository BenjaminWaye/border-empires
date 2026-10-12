// Per-structure 2D art (public/overlays SVGs). The structure info card shows
// it as the card art, and the build menu uses it as each building's icon.
// Moved out of client-map-display.ts so both can share one table.

const STRUCTURE_INFO_ART: Readonly<Record<string, string>> = {
  MINTWORKS: "/overlays/mintworks-overlay.svg",
  GRANARY: "/overlays/incubation-engine-overlay.svg",
  CENSUS_HALL: "/overlays/census-hall-overlay.svg",
  OBSERVATORY: "/overlays/observatory-overlay.svg",
  CARAVANARY: "/overlays/trade-nexus-overlay.svg",
  UMBRITE_SYNTHESIZER: "/overlays/umbrite-synthesizer-overlay.svg",
  ADVANCED_UMBRITE_SYNTHESIZER: "/overlays/advanced-umbrite-synthesizer-overlay.svg",
  TITANIUM_WORKS: "/overlays/titanium-works-overlay.svg",
  ADVANCED_TITANIUM_WORKS: "/overlays/advanced-titanium-works-overlay.svg",
  CRYSTAL_SYNTHESIZER: "/overlays/crystal-synthesizer-overlay.svg",
  ADVANCED_CRYSTAL_SYNTHESIZER: "/overlays/advanced-crystal-synthesizer-overlay.svg",
  FOUNDRY: "/overlays/foundry-overlay.svg",
  CUSTOMS_HOUSE: "/overlays/customs-house-overlay.svg",
  CLEARING_HOUSE: "/overlays/clearing-house-overlay.svg",
  GOVERNORS_OFFICE: "/overlays/governors-office-overlay.svg",
  // GARRISON_HALL ("Ancillary Depot") and LOGISTICS_GUILD ("Ancillary
  // Factory") swap art -- no new 3D/2D assets this pass, per user decision.
  GARRISON_HALL: "/overlays/logistics-guild-overlay.svg",
  AIRPORT: "/overlays/airport-overlay.svg",
  RADAR_SYSTEM: "/overlays/radar-system-overlay.svg",
  AETHER_TOWER: "/overlays/ambaric-tower-overlay.svg",
  AEGIS_DOME: "/overlays/aegis-dome-overlay.svg",
  ASTRAL_DOCK: "/overlays/astral-dock-overlay.svg",
  RAIL_DEPOT: "/overlays/assembly-works-overlay.svg",
  IMPERIAL_EXCHANGE: "/overlays/imperial-exchange-overlay.svg",
  WORLD_ENGINE: "/overlays/world-engine-overlay.svg",
  QUARTERMASTERS_OFFICE: "/overlays/quartermasters-office-overlay.svg",
  LOGISTICS_GUILD: "/overlays/ancillary-factory-overlay.svg",
  ASSEMBLY_WORKS: "/overlays/rail-depot-overlay.svg",
  POPULATION_BUREAU: "/overlays/population-bureau-overlay.svg",
  TITANIUM_LEVY: "/overlays/titanium-levy-overlay.svg",
  // Each of the 18 monument components gets its own distinct overlay,
  // named after the component (not the monument) since each is a unique
  // structure now, not 3 identical copies of one "Part" icon. Aegis Dome and
  // Titanium Levy components have no art yet, so their cards keep the glyph.
  IMPERIAL_EXCHANGE_PART_1: "/overlays/golden-ledger-overlay.svg",
  IMPERIAL_EXCHANGE_PART_2: "/overlays/counting-engine-overlay.svg",
  IMPERIAL_EXCHANGE_PART_3: "/overlays/sovereign-seal-overlay.svg",
  WORLD_ENGINE_PART_1: "/overlays/long-barrel-overlay.svg",
  WORLD_ENGINE_PART_2: "/overlays/fracture-core-overlay.svg",
  WORLD_ENGINE_PART_3: "/overlays/sky-marking-array-overlay.svg",
  ASTRAL_DOCK_PART_1: "/overlays/launch-cradle-overlay.svg",
  ASTRAL_DOCK_PART_2: "/overlays/orbital-array-overlay.svg",
  ASTRAL_DOCK_PART_3: "/overlays/aether-sail-overlay.svg",
  POPULATION_BUREAU_PART_1: "/overlays/census-engine-overlay.svg",
  POPULATION_BUREAU_PART_2: "/overlays/registry-vault-overlay.svg",
  POPULATION_BUREAU_PART_3: "/overlays/levy-charter-overlay.svg",
  WEAPONS_WORKSHOP: "/overlays/weapons-workshop-overlay.svg",
  TITANIUM_WEAPONS_FACTORY: "/overlays/titanium-weapons-factory-overlay.svg",
  UMBRITE_WEAPONS_FACTORY: "/overlays/umbrite-weapons-factory-overlay.svg"
};

// Buildings whose info card keeps its glyph but which still have map art the
// build menu can show. Fort rings and mines use their first/closed variant.
const BUILD_MENU_EXTRA_ART: Readonly<Record<string, string>> = {
  FORT: "/overlays/fort-ring-overlay-closed.svg",
  WOODEN_FORT: "/overlays/wooden-fort-ring-overlay-closed.svg",
  SIEGE_OUTPOST: "/overlays/siege-outpost-overlay.svg",
  FARMSTEAD: "/overlays/farm-farmstead-overlay-1.svg",
  MINE: "/overlays/titanium-mine-overlay-1.svg",
  UMBRITE_RIG: "/overlays/umbrite-rig-overlay-1.svg",
  BANK: "/overlays/bank-overlay.svg",
  EXCHANGE_HOUSE: "/overlays/exchange-house-overlay.svg",
  RELAY_BEACON: "/overlays/relay-beacon-overlay.svg"
};

const lookup = (table: Readonly<Record<string, string>>, key: string): string | undefined =>
  Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;

export const structureInfoArtUrl = (key: string): string | undefined => lookup(STRUCTURE_INFO_ART, key);

export const buildMenuArtUrl = (structureType: string): string | undefined =>
  structureInfoArtUrl(structureType) ?? lookup(BUILD_MENU_EXTRA_ART, structureType);
