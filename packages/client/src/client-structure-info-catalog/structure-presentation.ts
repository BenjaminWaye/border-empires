import type { StructureInfoKey } from "../client-map-display.js";

// Presentation only. Names come from structureDisplayName; behavior comes
// from structureModelBriefFor and the live game-domain modifier catalog.
export type StructurePresentation = { readonly glyph: string; readonly placement: string };
export const STRUCTURE_PRESENTATION: Readonly<Record<StructureInfoKey, StructurePresentation>> = {
  FORT: {
    glyph: "🛡",
    placement: "Build on a garrisoned border tile or dock you own."
  },
  TITANIUM_BASTION: {
    glyph: "🛡",
    placement: "Upgrade an existing Fort on its current tile."
  },
  THUNDER_BASTION: {
    glyph: "🛡",
    placement: "Upgrade an existing Titanium Bastion on its current tile."
  },
  OBSERVATORY: {
    glyph: "◉",
    placement: "Build on empty garrisoned land only. Not on towns, docks, or resource tiles."
  },
  PALISADE: {
    glyph: "🪵",
    placement: "Build on a garrisoned tile you own. Like a Fort, it can share its tile with a Relay Beacon or Harbor Exchange."
  },
  HYDROGARDEN: {
    glyph: "🌾",
    placement: "Build on a garrisoned farm resource tile you own."
  },
  UMBRITE_RIG: {
    glyph: "🦊",
    placement: "Build on a garrisoned umbrite resource tile you own."
  },
  MINE: {
    glyph: "⛏",
    placement: "Build on a garrisoned titanium or crystal resource tile you own."
  },
  MANUFACTORY: {
    glyph: "⚙",
    placement: "Build on an open garrisoned town or support tile you own."
  },
  CLEARING_HOUSE: {
    glyph: "⌂",
    placement: "Build on an open garrisoned support tile for a town with a connected city network."
  },
  TRADE_NEXUS: {
    glyph: "⚖",
    placement: "Build on an open garrisoned support tile for a town you own."
  },
  RELAY_BEACON: {
    glyph: "⚑",
    placement: "Build on an owned border tile with no town, resource, dock, or other structure."
  },
  SIEGE_TOWER: {
    glyph: "⚔",
    placement: "Upgrade an existing Siege Battery on its current tile."
  },
  DREAD_TOWER: {
    glyph: "⚔",
    placement: "Upgrade an existing Siege Tower on its current tile."
  },
  ORE_REFINERY: {
    glyph: "🏭",
    placement: "Build on an open garrisoned support tile for a town you own."
  },
  HARBOR_EXCHANGE: {
    glyph: "⚓",
    placement: "Build on a garrisoned dock tile you own."
  },
  ASTRAL_DOCK_PART_1: {
    glyph: "🚀",
    placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component."
  },
  ASTRAL_DOCK_PART_2: {
    glyph: "🛰",
    placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component."
  },
  ASTRAL_DOCK_PART_3: {
    glyph: "⛵",
    placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component."
  },
  ASTRAL_DOCK: {
    glyph: "✶",
    placement: "Place on any garrisoned tile you own after finishing 3 Astral Dock Parts. Consumes all 3 parts on completion."
  },
  NEURAL_WORKS: {
    glyph: "🚉",
    placement: "Build on an open garrisoned support tile for a town you own."
  },
  HYDROWORKS: {
    glyph: "💧",
    placement: "Build on any garrisoned land tile. Does not need a resource tile."
  },
  MINISTRY_HALL: {
    glyph: "🏛",
    placement: "Build on an open garrisoned support tile for a town you own."
  },
  ANCILLARY_DEPOT: {
    glyph: "🪖",
    placement: "Build on an open garrisoned support tile for a town you own."
  },
  WEAPONS_WORKSHOP: {
    glyph: "🗡",
    placement: "Build on an open garrisoned support tile for a town you own. No per-town limit."
  },
  TITANIUM_WEAPONS_FACTORY: {
    glyph: "🛡",
    placement: "Build on an open garrisoned support tile for a town you own. No per-town limit."
  },
  UMBRITE_WEAPONS_FACTORY: {
    glyph: "🗡",
    placement: "Build on an open garrisoned support tile for a town you own. No per-town limit."
  },
  SKY_DOCK: {
    glyph: "✈",
    placement: "Build on garrisoned land you own."
  },
  AMBARIC_TRANSFORMER: {
    glyph: "⚡",
    placement: "Build on garrisoned land you own."
  },
  RESONANCE_GRID: {
    glyph: "📡",
    placement: "Build on garrisoned land you own."
  },
  IMPERIAL_EXCHANGE_PART_1: {
    glyph: "📖",
    placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component."
  },
  IMPERIAL_EXCHANGE_PART_2: {
    glyph: "🧮",
    placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component."
  },
  IMPERIAL_EXCHANGE_PART_3: {
    glyph: "🔏",
    placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component."
  },
  SOVEREIGN_SIEGE_ENGINE_PART_1: {
    glyph: "🎯",
    placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component."
  },
  SOVEREIGN_SIEGE_ENGINE_PART_2: {
    glyph: "💥",
    placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component."
  },
  SOVEREIGN_SIEGE_ENGINE_PART_3: {
    glyph: "🔭",
    placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component."
  },
  IMPERIAL_EXCHANGE: {
    glyph: "✶",
    placement: "Place on any garrisoned tile you own after finishing 3 Imperial Exchange Parts. Consumes all 3 parts on completion."
  },
  SOVEREIGN_SIEGE_ENGINE: {
    glyph: "✸",
    placement: "Place on any garrisoned tile you own after finishing 3 Sovereign Siege Engine Parts. Consumes all 3 parts on completion."
  },
  AEGIS_DOME_PART_1: {
    glyph: "🛡",
    placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component."
  },
  AEGIS_DOME_PART_2: {
    glyph: "⚓",
    placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component."
  },
  AEGIS_DOME_PART_3: {
    glyph: "👑",
    placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component."
  },
  AEGIS_DOME: {
    glyph: "⬡",
    placement: "Place on any garrisoned tile you own after finishing 3 Aegis Dome Parts. Consumes all 3 parts on completion."
  },
  QUARTERMASTERS_OFFICE: {
    glyph: "🎖",
    placement: "Build on garrisoned land you own."
  },
  ANCILLARY_FACTORY: {
    glyph: "📦",
    placement: "Build on an open garrisoned support tile for a town you own."
  },
  RESERVE_LATTICE: {
    glyph: "🏗",
    placement: "Build on an open garrisoned support tile for a town you own."
  },
  CENSUS_DIRECTORATE_PART_1: {
    glyph: "📋",
    placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component."
  },
  CENSUS_DIRECTORATE_PART_2: {
    glyph: "🗄",
    placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component."
  },
  CENSUS_DIRECTORATE_PART_3: {
    glyph: "📜",
    placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component."
  },
  CENSUS_DIRECTORATE: {
    glyph: "◈",
    placement: "Place on any garrisoned tile you own after finishing 3 Census Directorate Parts. Consumes all 3 parts on completion."
  },
  TITANIUM_LEVY_PART_1: {
    glyph: "📢",
    placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component."
  },
  TITANIUM_LEVY_PART_2: {
    glyph: "🚩",
    placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component."
  },
  TITANIUM_LEVY_PART_3: {
    glyph: "📃",
    placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component."
  },
  TITANIUM_LEVY: {
    glyph: "⬢",
    placement: "Place on any garrisoned tile you own after finishing 3 Titanium Levy Parts. Consumes all 3 parts on completion."
  },
  SIEGE_BATTERY: {
    glyph: "⚔",
    placement: "Build on a garrisoned border tile you own."
  },
  UMBRITE_WORKS: {
    glyph: "📦",
    placement: "Build on an open garrisoned support tile for a town you own."
  },
  HIGH_YIELD_UMBRITE_WORKS: {
    glyph: "🧵",
    placement: "Upgrade an existing Umbrite Works on its current support tile."
  },
  TITANIUM_WORKS: {
    glyph: "⚙",
    placement: "Build on an open garrisoned support tile for a town you own."
  },
  HIGH_YIELD_TITANIUM_WORKS: {
    glyph: "⚙",
    placement: "Upgrade an existing Titanium Works on its current support tile."
  },
  AETHER_CONDENSER: {
    glyph: "💎",
    placement: "Build on an open garrisoned support tile for a town you own."
  },
  HIGH_YIELD_AETHER_CONDENSER: {
    glyph: "💠",
    placement: "Upgrade an existing Aether Condenser on its current support tile."
  },
  INCUBATION_ENGINE: {
    glyph: "◉",
    placement: "Build on an open garrisoned support tile for a town you own."
  },
  CENSUS_HALL: {
    glyph: "⌘",
    placement: "Build on an open garrisoned support tile for a town you own."
  },
};
