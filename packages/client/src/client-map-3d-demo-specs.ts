// Visual-demo spec builders for the 3D map, extracted from client-map-3d.ts.
// ?fortdemo=1 fakes a row of fort kinds two tiles south of the camera so each
// mesh can be eyeballed side-by-side; ?structuredemo=1 does the same for
// structures two tiles north. Both are URL-gated and harmless in production.

import type { FortificationOpening, FortificationOverlayKind } from "./client-fortification-overlays/client-fortification-overlays.js";
import type { StructureKind } from "./client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";

const fortDemoEnabled =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("fortdemo") === "1";

const structureDemoEnabled =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("structuredemo") === "1";

// Demo forts are owned by "demo" so the cardinal-opening rule still resolves
// (FORT next to FORT opens its first cardinal); place each kind 2 tiles
// apart so they don't merge walls.
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
export const fortDemoSpecFor = (
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

export type StructureDemoEntry = { kind: StructureKind | "UMBRITE_RIG" | "UMBRITE_WEAPONS_FACTORY"; resource?: "TITANIUM" | "GEMS" };

// The MINE appears twice (TITANIUM and GEMS loads) so the resource-aware mine
// variant is visible. The Worldbreaker/Imperial Exchange/Population Bureau
// part meshes are shown too, spaced one tile apart.
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

export const structureDemoEntryFor = (wx: number, wy: number, originX: number, originY: number): StructureDemoEntry | undefined => {
  if (!structureDemoEnabled) return undefined;
  if (wy !== originY - 2) return undefined;
  const dx = wx - originX;
  if (dx < 0 || dx >= STRUCTURE_DEMO_ENTRIES.length) return undefined;
  return STRUCTURE_DEMO_ENTRIES[dx];
};