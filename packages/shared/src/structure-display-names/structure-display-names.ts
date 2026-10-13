// Single source of truth for player-facing structure names, shared by the
// client (tile menus, tech chips, activity dashboard, ...) and the simulation
// (rejection toasts, economy breakdown labels), so neither side ever shows an
// internal type constant or keeps its own copy that drifts out of sync.
import type { EconomicStructureType, FortVariant, SiegeOutpostVariant } from "../types.js";

export type StructureDisplayKey = EconomicStructureType | FortVariant | SiegeOutpostVariant | "OBSERVATORY";

export const STRUCTURE_DISPLAY_NAMES: Readonly<Record<StructureDisplayKey, string>> = {
  FORT: "Fort",
  TITANIUM_BASTION: "Titanium Bastion",
  THUNDER_BASTION: "Thunder Bastion",
  OBSERVATORY: "Aether Tower",
  SIEGE_OUTPOST: "Siege Battery",
  SIEGE_TOWER: "Siege Tower",
  DREAD_TOWER: "Dread Tower",
  FARMSTEAD: "Hydrogarden",
  WATERWORKS: "Hydroworks",
  UMBRITE_RIG: "Umbrite Rig",
  MINE: "Mine",
  GRANARY: "Incubation Engine",
  CENSUS_HALL: "Census Hall",
  CLEARING_HOUSE: "Clearing House",
  AIRPORT: "Sky Dock",
  AETHER_TOWER: "Ambaric Transformer",
  WOODEN_FORT: "Palisade",
  RELAY_BEACON: "Relay Beacon",
  CARAVANARY: "Trade Nexus",
  // converter-mode-flip plan §Phase 6: these buildings now run either
  // direction (Refine gold->resource, or Sell off resource->gold), so the
  // display name is direction-neutral. The underlying type constants
  // (UMBRITE_SYNTHESIZER/TITANIUM_WORKS/ADVANCED_*) are unchanged — they're
  // persisted identifiers, this is a copy-only change.
  UMBRITE_SYNTHESIZER: "Umbrite Works",
  ADVANCED_UMBRITE_SYNTHESIZER: "High-Yield Umbrite Works",
  TITANIUM_WORKS: "Titanium Works",
  ADVANCED_TITANIUM_WORKS: "High-Yield Titanium Works",
  CRYSTAL_SYNTHESIZER: "Aether Condenser",
  ADVANCED_CRYSTAL_SYNTHESIZER: "High-Yield Aether Condenser",
  FOUNDRY: "Ore Refinery",
  GARRISON_HALL: "Ancillary Depot",
  CUSTOMS_HOUSE: "Harbor Exchange",
  GOVERNORS_OFFICE: "Ministry Hall",
  RADAR_SYSTEM: "Resonance Grid",
  QUARTERMASTERS_OFFICE: "Quartermaster's Office",
  LOGISTICS_GUILD: "Ancillary Factory",
  ASSEMBLY_WORKS: "Reserve Lattice",
  ASTRAL_DOCK_PART_1: "Launch Cradle",
  ASTRAL_DOCK_PART_2: "Orbital Array",
  ASTRAL_DOCK_PART_3: "Aether Sail",
  ASTRAL_DOCK: "Astral Dock",
  RAIL_DEPOT: "Neural Works",
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
  WORLD_ENGINE: "Sovereign Siege Engine",
  POPULATION_BUREAU_PART_1: "Census Engine",
  POPULATION_BUREAU_PART_2: "Registry Vault",
  POPULATION_BUREAU_PART_3: "Levy Charter",
  POPULATION_BUREAU: "Census Directorate",
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

const hasStructureDisplayName = (type: string): type is StructureDisplayKey =>
  Object.prototype.hasOwnProperty.call(STRUCTURE_DISPLAY_NAMES, type);

// Turns an internal identifier like "SOME_NEW_THING" into "Some new thing".
const humanizeStructureId = (type: string): string => {
  const words = type.toLowerCase().split("_").filter(Boolean).join(" ");
  return words ? words[0]!.toUpperCase() + words.slice(1) : type;
};

/**
 * Player-facing name for any structure id, including ids that arrive as plain
 * strings (wire payloads, activity cards). An id missing from the map is shown
 * humanized rather than as the raw constant.
 */
export const structureDisplayName = (type: string): string =>
  hasStructureDisplayName(type) ? STRUCTURE_DISPLAY_NAMES[type] : humanizeStructureId(type);

