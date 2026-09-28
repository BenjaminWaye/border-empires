import type { FortificationOpening, FortificationOverlayKind } from "../client-fortification-overlays/client-fortification-overlays.js";
import type { StructureKind } from "../client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";
import type { TownTier } from "../client-map-3d-town-overlay.js";

// Visual-only ?towndemo / ?fortdemo / ?structuredemo tile fakes, extracted
// from client-map-3d.ts. Each returns what to draw at a world tile relative to
// the camera origin, or undefined when its demo flag is off.
export const createDemoTileSpecs = () => {
  // Visual-only demo: ?towndemo=1 fakes a row of 5 tiers near (camX, camY)
  // so you can compare Settlement → Town → City → Great City → Metropolis
  // side-by-side without playing through them.
  const townDemoEnabled =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("towndemo") === "1";
  const TOWN_DEMO_TIERS: ReadonlyArray<TownTier> = [
    "SETTLEMENT",
    "TOWN",
    "CITY",
    "GREAT_CITY",
    "METROPOLIS"
  ];
  const isTownDemoTile = (
    wx: number,
    wy: number,
    originX: number,
    originY: number
  ): TownTier | undefined => {
    if (!townDemoEnabled) return undefined;
    if (wy !== originY) return undefined;
    const dx = wx - originX;
    if (dx < 0 || dx >= TOWN_DEMO_TIERS.length) return undefined;
    return TOWN_DEMO_TIERS[dx];
  };

  // Visual-only demo: ?fortdemo=1 fakes a row of 4 fort kinds two tiles
  // south of the camera so you can compare them side-by-side. Demo
  // forts are owned by "demo" so the cardinal-opening rule still
  // resolves (FORT next to FORT opens its first cardinal); place each
  // kind 2 tiles apart so they don't merge walls.
  const fortDemoEnabled =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("fortdemo") === "1";
  const FORT_DEMO_KINDS: ReadonlyArray<FortificationOverlayKind> = [
    "FORT",
    "WOODEN_FORT",
    "RELAY_BEACON",
    "SIEGE_OUTPOST"
  ];
  const FORT_DEMO_SPACING = 2;
  // Row 1 at camY+2: 4 kinds spaced 2 tiles apart (no wall sharing).
  // Row 2 at camY+5: a pair of FORTs touching at (camX, camY+5) and
  //                  (camX+1, camY+5) so the wall-sharing rule kicks in
  //                  — the left fort opens E, the right opens W.
  const fortDemoSpec = (
    wx: number,
    wy: number,
    originX: number,
    originY: number
  ): { kind: FortificationOverlayKind; opening: FortificationOpening } | undefined => {
    if (!fortDemoEnabled) return undefined;
    if (wy === originY + 2) {
      const dx = wx - originX;
      if (dx < 0) return undefined;
      if (dx % FORT_DEMO_SPACING !== 0) return undefined;
      const idx = dx / FORT_DEMO_SPACING;
      if (idx >= FORT_DEMO_KINDS.length) return undefined;
      const kind = FORT_DEMO_KINDS[idx];
      if (!kind) return undefined;
      return { kind, opening: "CLOSED" };
    }
    if (wy === originY + 5) {
      const dx = wx - originX;
      if (dx === 0) return { kind: "FORT", opening: "EAST" };
      if (dx === 1) return { kind: "FORT", opening: "WEST" };
    }
    return undefined;
  };

  // Visual-only demo: ?structuredemo=1 fakes a row of structures two
  // tiles north of the camera so you can eyeball each mesh side-by-side
  // without building them in-game. The MINE appears twice — once with
  // an TITANIUM load and once with a GEMS load — so the resource-aware
  // mine variant is visible. The Worldbreaker/Imperial Exchange part
  // meshes are shown too. Spaced one tile apart.
  const structureDemoEnabled =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("structuredemo") === "1";
  type StructureDemoEntry = { kind: StructureKind | "UMBRITE_RIG" | "UMBRITE_WEAPONS_FACTORY"; resource?: "TITANIUM" | "GEMS" };
  const STRUCTURE_DEMO_ENTRIES: ReadonlyArray<StructureDemoEntry> = [
    { kind: "FARMSTEAD" },
    { kind: "WATERWORKS" },
    { kind: "UMBRITE_RIG" },
    { kind: "MINE", resource: "TITANIUM" },
    { kind: "MINE", resource: "GEMS" },
    { kind: "TITANIUM_WORKS" },
    { kind: "MINTWORKS" },
    { kind: "OBSERVATORY" },
    { kind: "GRANARY" },
    { kind: "SEED_GRANARY" },
    { kind: "CENSUS_HALL" },
    { kind: "TITANIUM_WEAPONS_FACTORY" },
    { kind: "UMBRITE_WEAPONS_FACTORY" },
    { kind: "WORLD_ENGINE_PART_1" }, { kind: "WORLD_ENGINE_PART_2" }, { kind: "WORLD_ENGINE_PART_3" },
    { kind: "IMPERIAL_EXCHANGE_PART_1" }, { kind: "IMPERIAL_EXCHANGE_PART_2" }, { kind: "IMPERIAL_EXCHANGE_PART_3" }, { kind: "POPULATION_BUREAU_PART_1" }, { kind: "POPULATION_BUREAU_PART_2" }, { kind: "POPULATION_BUREAU_PART_3" }
  ];
  const structureDemoEntryFor = (wx: number, wy: number, originX: number, originY: number): StructureDemoEntry | undefined => {
    if (!structureDemoEnabled) return undefined;
    if (wy !== originY - 2) return undefined;
    const dx = wx - originX;
    if (dx < 0 || dx >= STRUCTURE_DEMO_ENTRIES.length) return undefined;
    return STRUCTURE_DEMO_ENTRIES[dx];
  };

  return { isTownDemoTile, fortDemoSpec, structureDemoEntryFor };
};
