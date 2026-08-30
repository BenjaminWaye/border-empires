import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("converter toggle regression guard", () => {
  it("wires enable and disable converter actions through the tile menu and action flow", () => {
    const logic = clientSource("../client-tile-action-logic/client-tile-action-logic.ts");
    const converterMenu = clientSource("../client-converter-menu.ts");
    const flow = clientSource("../client-action-flow.ts");
    const converterActions = clientSource("../client-converter-actions.ts");
    expect(converterMenu).toContain('id: "disable_converter_structure" as TileActionDef["id"]');
    expect(converterMenu).toContain('id: "enable_converter_structure" as TileActionDef["id"]');
    expect(flow).toContain("handleConverterTileAction");
    expect(converterActions).toContain('type: "SET_CONVERTER_STRUCTURE_ENABLED"');
    expect(converterActions).toContain('type: "SET_CONVERTER_STRUCTURE_MODE"');
    expect(converterMenu).toContain('id: "set_converter_structure_mode" as TileActionDef["id"]');
  });

  it("preloads and renders the base crystal synthesizer overlay", () => {
    const overlayImages = clientSource("../client-map-render/client-map-overlay-images.ts");
    const loop = clientSource("../client-runtime-loop.ts");
    expect(overlayImages).toContain('CRYSTAL_SYNTHESIZER: loadOverlayImage("crystal-synthesizer-overlay.svg")');
    expect(loop).toContain("const overlay = deps.structureOverlayImages[t.economicStructure.type];");
  });

  it("keeps live-map overlays in sync with dedicated structure art", () => {
    const overlayImages = clientSource("../client-map-render/client-map-overlay-images.ts");
    const loop = clientSource("../client-runtime-loop.ts");
    const dedicatedStructureOverlays = [
      ["CLEARING_HOUSE", "clearing-house-overlay.svg"],
      ["AIRPORT", "airport-overlay.svg"],
      ["CARAVANARY", "trade-nexus-overlay.svg"],
      ["FOUNDRY", "foundry-overlay.svg"],
      ["GARRISON_HALL", "ancillary-factory-overlay.svg"],
      ["CUSTOMS_HOUSE", "customs-house-overlay.svg"],
      ["RAIL_DEPOT", "rail-depot-overlay.svg"],
      ["GOVERNORS_OFFICE", "governors-office-overlay.svg"],
      ["RADAR_SYSTEM", "radar-system-overlay.svg"],
      ["AEGIS_DOME", "aegis-dome-overlay.svg"],
      ["ASTRAL_DOCK", "astral-dock-overlay.svg"],
      ["IMPERIAL_EXCHANGE", "imperial-exchange-overlay.svg"],
      ["WORLD_ENGINE", "world-engine-overlay.svg"],
      ["QUARTERMASTERS_OFFICE", "quartermasters-office-overlay.svg"],
      ["LOGISTICS_GUILD", "logistics-guild-overlay.svg"],
      ["ASSEMBLY_WORKS", "assembly-works-overlay.svg"],
      ["POPULATION_BUREAU", "population-bureau-overlay.svg"],
      ["TITANIUM_LEVY", "titanium-levy-overlay.svg"],
      // GRANARY/AETHER_TOWER are the real wire-protocol structure types for
      // Incubation Engine/Ambaric Transformer Station (display names only) — using the
      // display names here previously let this test pass while the real
      // structureOverlayImages entries pointed at the wrong/missing art.
      ["GRANARY", "incubation-engine-overlay.svg"],
      ["AETHER_TOWER", "ambaric-tower-overlay.svg"]
    ] as const;

    for (const [structureType, asset] of dedicatedStructureOverlays) {
      expect(overlayImages).toContain(`${structureType}: loadOverlayImage("${asset}")`);
    }
    expect(loop).toContain("const overlay = deps.structureOverlayImages[t.economicStructure.type];");
  });
});
