import { describe, expect, it } from "vitest";
import { renderStructureInfoOverlay } from "./client-structure-info-overlay.js";
import { structureInfoForKey } from "../client-map-display.js";

describe("renderStructureInfoOverlay monument components checklist", () => {
  const structureInfoDeps = { formatCooldownShort: () => "10m", prettyToken: (value: string) => value };
  const boundStructureInfoForKey = (type: Parameters<typeof structureInfoForKey>[0]) => structureInfoForKey(type, structureInfoDeps);

  it("lists all 3 components as Not built and reads not-ready when the player owns none", () => {
    const html = renderStructureInfoOverlay("ASTRAL_DOCK", boundStructureInfoForKey, new Set());
    expect(html).toContain("Monument Components");
    expect(html).toContain("Launch Cradle");
    expect(html).toContain("Orbital Array");
    expect(html).toContain("Aether Sail");
    expect(html).toContain("0/3");
    expect(html).toContain("Monument not ready");
    expect(html).not.toContain("structure-info-component-complete");
  });

  it("marks owned components Complete and reads Monument Ready once all 3 are owned", () => {
    const html = renderStructureInfoOverlay(
      "ASTRAL_DOCK",
      boundStructureInfoForKey,
      new Set(["ASTRAL_DOCK_PART_1", "ASTRAL_DOCK_PART_2", "ASTRAL_DOCK_PART_3"])
    );
    expect(html).toContain("3/3");
    expect(html).toContain("Monument Ready");
    expect(html.match(/structure-info-component-complete/g)?.length).toBe(3);
  });

  it("omits the checklist entirely for a non-monument structure", () => {
    const html = renderStructureInfoOverlay("FORT", boundStructureInfoForKey, new Set());
    expect(html).not.toContain("Monument Components");
  });
});
