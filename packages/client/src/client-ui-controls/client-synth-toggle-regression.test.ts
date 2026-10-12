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

  it("preloads and renders the base aether condenser overlay", () => {
    const overlayImages = clientSource("../client-map-render/client-map-overlay-images.ts");
    const loop = clientSource("../client-runtime-loop.ts");
    expect(overlayImages).toContain('AETHER_CONDENSER: loadOverlayImage("aether-condenser-overlay.svg")');
    expect(loop).toContain("const overlay = deps.structureOverlayImages[t.economicStructure.type];");
  });

  it("keeps live-map overlays in sync with dedicated structure art", () => {
    const overlayImages = clientSource("../client-map-render/client-map-overlay-images.ts");
    const loop = clientSource("../client-runtime-loop.ts");
    const dedicatedStructureOverlays = [
      ["CLEARING_HOUSE", "clearing-house-overlay.svg"],
      ["SKY_DOCK", "sky-dock-overlay.svg"],
      ["TRADE_NEXUS", "trade-nexus-overlay.svg"],
      ["ORE_REFINERY", "ore-refinery-overlay.svg"],
      // ANCILLARY_DEPOT ("Ancillary Depot") got its own storage-drum overlay;
      // ANCILLARY_FACTORY ("Ancillary Factory") keeps the hopper manufactory.
      // NEURAL_WORKS ("Neural Works") and RESERVE_LATTICE ("Reserve Lattice")
      // still swap.
      ["ANCILLARY_DEPOT", "ancillary-depot-overlay.svg"],
      ["HARBOR_EXCHANGE", "harbor-exchange-overlay.svg"],
      ["NEURAL_WORKS", "neural-works-overlay.svg"],
      ["MINISTRY_HALL", "ministry-hall-overlay.svg"],
      ["RESONANCE_GRID", "resonance-grid-overlay.svg"],
      ["AEGIS_DOME", "aegis-dome-overlay.svg"],
      ["ASTRAL_DOCK", "astral-dock-overlay.svg"],
      ["IMPERIAL_EXCHANGE", "imperial-exchange-overlay.svg"],
      ["SOVEREIGN_SIEGE_ENGINE", "sovereign-siege-engine-overlay.svg"],
      ["QUARTERMASTERS_OFFICE", "quartermasters-office-overlay.svg"],
      ["ANCILLARY_FACTORY", "ancillary-factory-overlay.svg"],
      ["RESERVE_LATTICE", "reserve-lattice-overlay.svg"],
      ["CENSUS_DIRECTORATE", "census-directorate-overlay.svg"],
      ["TITANIUM_LEVY", "titanium-levy-overlay.svg"],
      // INCUBATION_ENGINE/AMBARIC_TRANSFORMER are the real wire-protocol structure types for
      // Incubation Engine/Ambaric Transformer Station (display names only) — using the
      // display names here previously let this test pass while the real
      // structureOverlayImages entries pointed at the wrong/missing art.
      ["INCUBATION_ENGINE", "incubation-engine-overlay.svg"],
      ["AMBARIC_TRANSFORMER", "ambaric-tower-overlay.svg"]
    ] as const;

    for (const [structureType, asset] of dedicatedStructureOverlays) {
      expect(overlayImages).toContain(`${structureType}: loadOverlayImage("${asset}")`);
    }
    expect(loop).toContain("const overlay = deps.structureOverlayImages[t.economicStructure.type];");
  });
});
