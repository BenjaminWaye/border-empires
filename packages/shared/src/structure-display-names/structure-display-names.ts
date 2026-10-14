// Single source of truth for player-facing structure names, shared by the
// client (tile menus, tech chips, activity dashboard, ...) and the simulation
// (rejection toasts, economy breakdown labels), so neither side ever shows an
// internal type constant or keeps its own copy that drifts out of sync.
// Structure ids follow these names (TRADE_NEXUS = "Trade Nexus"); when a
// building is renamed, rename its id too and add the old spelling to
// legacy-structure-names.ts so saved data keeps loading.
import type { EconomicStructureType, FortVariant, SiegeBatteryVariant } from "../types.js";

export type StructureDisplayKey = EconomicStructureType | FortVariant | SiegeBatteryVariant | "OBSERVATORY";

export const STRUCTURE_DISPLAY_NAMES: Readonly<Record<StructureDisplayKey, string>> = {
  FORT: "Fort",
  TITANIUM_BASTION: "Titanium Bastion",
  THUNDER_BASTION: "Thunder Bastion",
  OBSERVATORY: "Aether Tower",
  SIEGE_BATTERY: "Siege Battery",
  SIEGE_TOWER: "Siege Tower",
  DREAD_TOWER: "Dread Tower",
  HYDROGARDEN: "Hydrogarden",
  HYDROWORKS: "Hydroworks",
  UMBRITE_RIG: "Umbrite Rig",
  MINE: "Mine",
  INCUBATION_ENGINE: "Incubation Engine",
  CENSUS_HALL: "Census Hall",
  CLEARING_HOUSE: "Clearing House",
  SKY_DOCK: "Sky Dock",
  AMBARIC_TRANSFORMER: "Ambaric Transformer",
  PALISADE: "Palisade",
  RELAY_BEACON: "Relay Beacon",
  TRADE_NEXUS: "Trade Nexus",
  // converter-mode-flip plan §Phase 6: these buildings run either direction
  // (Refine gold->resource, or Sell off resource->gold), so the names are
  // direction-neutral.
  UMBRITE_WORKS: "Umbrite Works",
  HIGH_YIELD_UMBRITE_WORKS: "High-Yield Umbrite Works",
  TITANIUM_WORKS: "Titanium Works",
  HIGH_YIELD_TITANIUM_WORKS: "High-Yield Titanium Works",
  AETHER_CONDENSER: "Aether Condenser",
  HIGH_YIELD_AETHER_CONDENSER: "High-Yield Aether Condenser",
  ORE_REFINERY: "Ore Refinery",
  ANCILLARY_DEPOT: "Ancillary Depot",
  HARBOR_EXCHANGE: "Harbor Exchange",
  MINISTRY_HALL: "Ministry Hall",
  RESONANCE_GRID: "Resonance Grid",
  QUARTERMASTERS_OFFICE: "Quartermaster's Office",
  ANCILLARY_FACTORY: "Ancillary Factory",
  RESERVE_LATTICE: "Reserve Lattice",
  ASTRAL_DOCK_PART_1: "Launch Cradle",
  ASTRAL_DOCK_PART_2: "Orbital Array",
  ASTRAL_DOCK_PART_3: "Aether Sail",
  ASTRAL_DOCK: "Astral Dock",
  NEURAL_WORKS: "Neural Works",
  IMPERIAL_EXCHANGE_PART_1: "Golden Ledger",
  IMPERIAL_EXCHANGE_PART_2: "Counting Engine",
  IMPERIAL_EXCHANGE_PART_3: "Sovereign Seal",
  SOVEREIGN_SIEGE_ENGINE_PART_1: "The Long Barrel",
  SOVEREIGN_SIEGE_ENGINE_PART_2: "Fracture Core",
  SOVEREIGN_SIEGE_ENGINE_PART_3: "Sky-Marking Array",
  IMPERIAL_EXCHANGE: "Imperial Exchange",
  AEGIS_DOME_PART_1: "Shield Lattice",
  AEGIS_DOME_PART_2: "Ward Anchor",
  AEGIS_DOME_PART_3: "Aegis Crown",
  AEGIS_DOME: "Aegis Dome",
  SOVEREIGN_SIEGE_ENGINE: "Sovereign Siege Engine",
  CENSUS_DIRECTORATE_PART_1: "Census Engine",
  CENSUS_DIRECTORATE_PART_2: "Registry Vault",
  CENSUS_DIRECTORATE_PART_3: "Levy Charter",
  CENSUS_DIRECTORATE: "Census Directorate",
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

