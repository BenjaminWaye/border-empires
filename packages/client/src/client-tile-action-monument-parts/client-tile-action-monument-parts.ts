import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";
import type { SupportTownStructureKey } from "../client-support-structures/client-support-structures.js";

// Extracted out of client-tile-action-logic.ts so that file stays net-smaller
// (500-line budget, AGENTS.md) -- the monument-component build-menu data and
// its per-player ownership check, pulled out as one cohesive piece with its
// own ownership.

// All 18 monument component types, across all 6 monuments — used to check
// "does this town already host a monument component of any kind" without
// hand-listing 6 or 18 types at each call site.
export const MONUMENT_COMPONENT_TYPES: readonly SupportTownStructureKey[] = [
  "IMPERIAL_EXCHANGE_PART_1", "IMPERIAL_EXCHANGE_PART_2", "IMPERIAL_EXCHANGE_PART_3",
  "WORLD_ENGINE_PART_1", "WORLD_ENGINE_PART_2", "WORLD_ENGINE_PART_3",
  "AEGIS_DOME_PART_1", "AEGIS_DOME_PART_2", "AEGIS_DOME_PART_3",
  "ASTRAL_DOCK_PART_1", "ASTRAL_DOCK_PART_2", "ASTRAL_DOCK_PART_3",
  "POPULATION_BUREAU_PART_1", "POPULATION_BUREAU_PART_2", "POPULATION_BUREAU_PART_3",
  "TITANIUM_LEVY_PART_1", "TITANIUM_LEVY_PART_2", "TITANIUM_LEVY_PART_3"
];

// Every monument's 3 uniquely-named components share the exact same gating
// shape (Great City/Monumental City, no other monument component already in
// that city, the monument's own tech researched) — generated from one table
// instead of 18 hand-copied blocks.
export type MonumentComponentBuildDef = {
  actionId: TileActionDef["id"];
  structureType: NonNullable<Tile["economicStructure"]>["type"];
  actionLabel: string;
  techId: string;
  techLabel: string;
  monumentLabel: string;
};

export const MONUMENT_COMPONENT_BUILD_DEFS: readonly MonumentComponentBuildDef[] = [
  { actionId: "build_imperial_exchange_part_1", structureType: "IMPERIAL_EXCHANGE_PART_1", actionLabel: "Build Golden Ledger", techId: "urban-mintworks", techLabel: "Imperial Exchange", monumentLabel: "Imperial Exchange" },
  { actionId: "build_imperial_exchange_part_2", structureType: "IMPERIAL_EXCHANGE_PART_2", actionLabel: "Build Counting Engine", techId: "urban-mintworks", techLabel: "Imperial Exchange", monumentLabel: "Imperial Exchange" },
  { actionId: "build_imperial_exchange_part_3", structureType: "IMPERIAL_EXCHANGE_PART_3", actionLabel: "Build Sovereign Seal", techId: "urban-mintworks", techLabel: "Imperial Exchange", monumentLabel: "Imperial Exchange" },
  { actionId: "build_world_engine_part_1", structureType: "WORLD_ENGINE_PART_1", actionLabel: "Build The Long Barrel", techId: "world-engine", techLabel: "Worldbreaker Cannon", monumentLabel: "Worldbreaker Cannon" },
  { actionId: "build_world_engine_part_2", structureType: "WORLD_ENGINE_PART_2", actionLabel: "Build Fracture Core", techId: "world-engine", techLabel: "Worldbreaker Cannon", monumentLabel: "Worldbreaker Cannon" },
  { actionId: "build_world_engine_part_3", structureType: "WORLD_ENGINE_PART_3", actionLabel: "Build Sky-Marking Array", techId: "world-engine", techLabel: "Worldbreaker Cannon", monumentLabel: "Worldbreaker Cannon" },
  { actionId: "build_aegis_dome_part_1", structureType: "AEGIS_DOME_PART_1", actionLabel: "Build Shield Lattice", techId: "aegis-dome", techLabel: "Aegis Dome", monumentLabel: "Aegis Dome" },
  { actionId: "build_aegis_dome_part_2", structureType: "AEGIS_DOME_PART_2", actionLabel: "Build Ward Anchor", techId: "aegis-dome", techLabel: "Aegis Dome", monumentLabel: "Aegis Dome" },
  { actionId: "build_aegis_dome_part_3", structureType: "AEGIS_DOME_PART_3", actionLabel: "Build Aegis Crown", techId: "aegis-dome", techLabel: "Aegis Dome", monumentLabel: "Aegis Dome" },
  { actionId: "build_astral_dock_part_1", structureType: "ASTRAL_DOCK_PART_1", actionLabel: "Build Launch Cradle", techId: "astral-dock", techLabel: "Astral Dock", monumentLabel: "Astral Dock" },
  { actionId: "build_astral_dock_part_2", structureType: "ASTRAL_DOCK_PART_2", actionLabel: "Build Orbital Array", techId: "astral-dock", techLabel: "Astral Dock", monumentLabel: "Astral Dock" },
  { actionId: "build_astral_dock_part_3", structureType: "ASTRAL_DOCK_PART_3", actionLabel: "Build Aether Sail", techId: "astral-dock", techLabel: "Astral Dock", monumentLabel: "Astral Dock" },
  { actionId: "build_population_bureau_part_1", structureType: "POPULATION_BUREAU_PART_1", actionLabel: "Build Census Engine", techId: "demographic-registry", techLabel: "Demographic Registry", monumentLabel: "Population Bureau" },
  { actionId: "build_population_bureau_part_2", structureType: "POPULATION_BUREAU_PART_2", actionLabel: "Build Registry Vault", techId: "demographic-registry", techLabel: "Demographic Registry", monumentLabel: "Population Bureau" },
  { actionId: "build_population_bureau_part_3", structureType: "POPULATION_BUREAU_PART_3", actionLabel: "Build Levy Charter", techId: "demographic-registry", techLabel: "Demographic Registry", monumentLabel: "Population Bureau" },
  { actionId: "build_titanium_levy_part_1", structureType: "TITANIUM_LEVY_PART_1", actionLabel: "Build Muster Klaxon", techId: "grand-levy-doctrine", techLabel: "Grand Levy Doctrine", monumentLabel: "The Titanium Levy" },
  { actionId: "build_titanium_levy_part_2", structureType: "TITANIUM_LEVY_PART_2", actionLabel: "Build Titanium Standard", techId: "grand-levy-doctrine", techLabel: "Grand Levy Doctrine", monumentLabel: "The Titanium Levy" },
  { actionId: "build_titanium_levy_part_3", structureType: "TITANIUM_LEVY_PART_3", actionLabel: "Build Levy Writ", techId: "grand-levy-doctrine", techLabel: "Grand Levy Doctrine", monumentLabel: "The Titanium Levy" }
];

// Mirrors the server's per-player, global "already built this exact part"
// gate (§16, monument components are uniquely-named one-of structures, not
// stackable) -- runtime-structure-command-handlers.ts's BUILD_INVALID reject
// on a repeat of the same PART_n type, which only looks at an active or
// under_construction structure. Matched here exactly (status checked, not
// just type/owner) so a part mid-demolition ("removing") -- legally
// rebuildable server-side -- doesn't stay wrongly disabled on the client.
// townHasAnyMonumentPart (the caller's own check) only catches a second
// *different* component going up in the SAME city; without this scan the
// button stayed enabled for the same part in a different city and the
// player only found out it was rejected after submitting.
export const playerOwnsActiveOrBuildingMonumentPart = (
  state: ClientState,
  partType: NonNullable<Tile["economicStructure"]>["type"]
): boolean => {
  for (const tile of state.tiles.values()) {
    const structure = tile.economicStructure;
    if (
      structure?.ownerId === state.me &&
      structure.type === partType &&
      (structure.status === "active" || structure.status === "under_construction")
    ) {
      return true;
    }
  }
  return false;
};
