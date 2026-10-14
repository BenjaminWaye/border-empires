// Per-structure 2D art (public/overlays SVGs). The structure info card shows
// it as the card art, and the build menu and the Manifest detail's "What you
// get" rows use it as each building's icon. Moved out of client-map-display.ts
// so they all share one table.

const STRUCTURE_INFO_ART: Readonly<Record<string, string>> = {
  MINTWORKS: "/overlays/mintworks-overlay.svg",
  INCUBATION_ENGINE: "/overlays/incubation-engine-overlay.svg",
  CENSUS_HALL: "/overlays/census-hall-overlay.svg",
  OBSERVATORY: "/overlays/observatory-overlay.svg",
  TRADE_NEXUS: "/overlays/trade-nexus-overlay.svg",
  UMBRITE_WORKS: "/overlays/umbrite-works-overlay.svg",
  HIGH_YIELD_UMBRITE_WORKS: "/overlays/high-yield-umbrite-works-overlay.svg",
  TITANIUM_WORKS: "/overlays/titanium-works-overlay.svg",
  HIGH_YIELD_TITANIUM_WORKS: "/overlays/high-yield-titanium-works-overlay.svg",
  AETHER_CONDENSER: "/overlays/aether-condenser-overlay.svg",
  HIGH_YIELD_AETHER_CONDENSER: "/overlays/high-yield-aether-condenser-overlay.svg",
  ORE_REFINERY: "/overlays/ore-refinery-overlay.svg",
  HARBOR_EXCHANGE: "/overlays/harbor-exchange-overlay.svg",
  CLEARING_HOUSE: "/overlays/clearing-house-overlay.svg",
  MINISTRY_HALL: "/overlays/ministry-hall-overlay.svg",
  // ANCILLARY_DEPOT ("Ancillary Depot") has its own storage-drum art;
  // ANCILLARY_FACTORY ("Ancillary Factory") keeps the hopper manufactory.
  ANCILLARY_DEPOT: "/overlays/ancillary-depot-overlay.svg",
  SKY_DOCK: "/overlays/sky-dock-overlay.svg",
  RESONANCE_GRID: "/overlays/resonance-grid-overlay.svg",
  AMBARIC_TRANSFORMER: "/overlays/ambaric-tower-overlay.svg",
  AEGIS_DOME: "/overlays/aegis-dome-overlay.svg",
  ASTRAL_DOCK: "/overlays/astral-dock-overlay.svg",
  NEURAL_WORKS: "/overlays/neural-works-overlay.svg",
  IMPERIAL_EXCHANGE: "/overlays/imperial-exchange-overlay.svg",
  SOVEREIGN_SIEGE_ENGINE: "/overlays/sovereign-siege-engine-overlay.svg",
  QUARTERMASTERS_OFFICE: "/overlays/quartermasters-office-overlay.svg",
  ANCILLARY_FACTORY: "/overlays/ancillary-factory-overlay.svg",
  RESERVE_LATTICE: "/overlays/reserve-lattice-overlay.svg",
  CENSUS_DIRECTORATE: "/overlays/census-directorate-overlay.svg",
  TITANIUM_LEVY: "/overlays/titanium-levy-overlay.svg",
  // Each of the 18 monument components gets its own distinct overlay,
  // named after the component (not the monument) since each is a unique
  // structure now, not 3 identical copies of one "Part" icon. Aegis Dome and
  // Titanium Levy components have no art yet, so their cards keep the glyph.
  IMPERIAL_EXCHANGE_PART_1: "/overlays/golden-ledger-overlay.svg",
  IMPERIAL_EXCHANGE_PART_2: "/overlays/counting-engine-overlay.svg",
  IMPERIAL_EXCHANGE_PART_3: "/overlays/sovereign-seal-overlay.svg",
  SOVEREIGN_SIEGE_ENGINE_PART_1: "/overlays/long-barrel-overlay.svg",
  SOVEREIGN_SIEGE_ENGINE_PART_2: "/overlays/fracture-core-overlay.svg",
  SOVEREIGN_SIEGE_ENGINE_PART_3: "/overlays/sky-marking-array-overlay.svg",
  ASTRAL_DOCK_PART_1: "/overlays/launch-cradle-overlay.svg",
  ASTRAL_DOCK_PART_2: "/overlays/orbital-array-overlay.svg",
  ASTRAL_DOCK_PART_3: "/overlays/aether-sail-overlay.svg",
  CENSUS_DIRECTORATE_PART_1: "/overlays/census-engine-overlay.svg",
  CENSUS_DIRECTORATE_PART_2: "/overlays/registry-vault-overlay.svg",
  CENSUS_DIRECTORATE_PART_3: "/overlays/levy-charter-overlay.svg",
  WEAPONS_WORKSHOP: "/overlays/weapons-workshop-overlay.svg",
  TITANIUM_WEAPONS_FACTORY: "/overlays/titanium-weapons-factory-overlay.svg",
  UMBRITE_WEAPONS_FACTORY: "/overlays/umbrite-weapons-factory-overlay.svg"
};

// Buildings whose info card keeps its glyph but which still have map art the
// build menu can show. Fort rings and mines use their first/closed variant.
// Each entry is the art the 2D map draws for that building: Hydrogarden (the
// renamed Farmstead) is the hydroponic dome and Hydroworks keeps the old
// hydrogarden overlay (client-map-render-resource-overlays.ts); bastions draw
// the fort ring and siege/dread towers the siege battery
// (client-map-overlay-images.ts, client-fortification-overlays.ts).
const BUILD_MENU_EXTRA_ART: Readonly<Record<string, string>> = {
  FORT: "/overlays/fort-ring-overlay-closed.svg",
  TITANIUM_BASTION: "/overlays/fort-ring-overlay-closed.svg",
  THUNDER_BASTION: "/overlays/fort-ring-overlay-closed.svg",
  PALISADE: "/overlays/palisade-ring-overlay-closed.svg",
  SIEGE_BATTERY: "/overlays/siege-battery-overlay.svg",
  SIEGE_TOWER: "/overlays/siege-battery-overlay.svg",
  DREAD_TOWER: "/overlays/siege-battery-overlay.svg",
  HYDROGARDEN: "/overlays/farm-hydroponic-overlay-1.svg",
  HYDROWORKS: "/overlays/farm-hydrogarden-overlay-1.svg",
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
