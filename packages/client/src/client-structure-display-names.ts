// Single source of truth for structure display names — every other module
// that needs a building's name (tech-unlock chips, tech-effect blurbs, tile
// overview modifiers, build-action labels) imports STRUCTURE_DISPLAY_NAMES
// or calls economicStructureName instead of hardcoding its own copy of the
// string, so a rename here can't silently drift out of sync elsewhere the
// way GRANARY -> "Incubation Engine" once did. Split out of
// client-map-display.ts (already over the repo's 500-line file cap) rather
// than growing that file further.
import type { EconomicStructureType, StructureInfoKey } from "./client-map-display.js";

export const STRUCTURE_DISPLAY_NAMES: Partial<Record<EconomicStructureType | StructureInfoKey, string>> = {
  FORT: "Fort",
  TITANIUM_BASTION: "Titanium Bastion",
  THUNDER_BASTION: "Thunder Bastion",
  OBSERVATORY: "Aether Tower",
  SIEGE_OUTPOST: "Siege Outpost",
  SIEGE_TOWER: "Siege Tower",
  DREAD_TOWER: "Dread Tower",
  FARMSTEAD: "Farmstead",
  WATERWORKS: "Waterworks",
  UMBRITE_RIG: "Umbrite Rig",
  MINE: "Mine",
  GRANARY: "Incubation Engine",
  SEED_GRANARY: "Seed Granary",
  CENSUS_HALL: "Census Hall",
  CLEARING_HOUSE: "Clearing House",
  AIRPORT: "Aetherport",
  AETHER_TOWER: "Ambaric Transformer Station",
  WOODEN_FORT: "Palisade",
  RELAY_BEACON: "Relay Beacon",
  CARAVANARY: "Trade Nexus",
  // converter-mode-flip plan §Phase 6: these buildings now run either
  // direction (Refine gold->resource, or Sell off resource->gold), so the
  // display name is direction-neutral. The underlying type constants
  // (UMBRITE_SYNTHESIZER/TITANIUM_WORKS/ADVANCED_*) are unchanged — they're
  // persisted identifiers, this is a copy-only change.
  UMBRITE_SYNTHESIZER: "Umbrite Works",
  ADVANCED_UMBRITE_SYNTHESIZER: "Advanced Umbrite Works",
  TITANIUM_WORKS: "Titanium Works",
  ADVANCED_TITANIUM_WORKS: "Advanced Titanium Works",
  CRYSTAL_SYNTHESIZER: "Aether Condenser",
  ADVANCED_CRYSTAL_SYNTHESIZER: "Advanced Aether Condenser",
  FOUNDRY: "Foundry",
  GARRISON_HALL: "Ancillary Factory",
  CUSTOMS_HOUSE: "Harbor Exchange",
  GOVERNORS_OFFICE: "Ministry Hall",
  RADAR_SYSTEM: "Resonance Grid",
  QUARTERMASTERS_OFFICE: "Quartermaster's Office",
  LOGISTICS_GUILD: "Logistics Guild",
  ASSEMBLY_WORKS: "Assembly Works",
  ASTRAL_DOCK_PART_1: "Launch Cradle",
  ASTRAL_DOCK_PART_2: "Orbital Array",
  ASTRAL_DOCK_PART_3: "Aether Sail",
  ASTRAL_DOCK: "Astral Dock",
  RAIL_DEPOT: "Rail Depot",
  IMPERIAL_EXCHANGE_PART_1: "Golden Ledger",
  IMPERIAL_EXCHANGE_PART_2: "Counting Engine",
  IMPERIAL_EXCHANGE_PART_3: "Sovereign Seal",
  WORLD_ENGINE_PART_1: "The Long Barrel",
  WORLD_ENGINE_PART_2: "Fracture Core",
  WORLD_ENGINE_PART_3: "Sky-Marking Array",
  IMPERIAL_EXCHANGE: "Imperial Exchange",
  AEGIS_DOME_PART_1: "Shield Lattice",
  AEGIS_DOME_PART_2: "Ward Anchor",
  AEGIS_DOME_PART_3: "Aegis Crown",
  AEGIS_DOME: "Aegis Dome",
  WORLD_ENGINE: "Worldbreaker Cannon",
  POPULATION_BUREAU_PART_1: "Census Engine",
  POPULATION_BUREAU_PART_2: "Registry Vault",
  POPULATION_BUREAU_PART_3: "Levy Charter",
  POPULATION_BUREAU: "Population Bureau",
  TITANIUM_LEVY_PART_1: "Muster Klaxon",
  TITANIUM_LEVY_PART_2: "Titanium Standard",
  TITANIUM_LEVY_PART_3: "Levy Writ",
  TITANIUM_LEVY: "The Titanium Levy",
  // WEAPONS_WORKSHOP is retired (no longer in STRUCTURE_REGISTRY, no tech
  // unlocks it) but kept here so any pre-existing copy still displays a name.
  WEAPONS_WORKSHOP: "Weapons Workshop",
  TITANIUM_WEAPONS_FACTORY: "Titanium Weapons Factory",
  UMBRITE_WEAPONS_FACTORY: "Umbrite Weapons Factory",
  MINTWORKS: "Mintworks"
};

export const economicStructureName = (type: EconomicStructureType | StructureInfoKey): string =>
  STRUCTURE_DISPLAY_NAMES[type] ?? "Mintworks";
