import { NETWORK_RESOURCES, RESOURCE_NETWORKS } from "@border-empires/shared";
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

describe("Relay Beacon build-time label", () => {
  const info = (ownedCountOfType: number) =>
    structureInfoForKey("RELAY_BEACON", { formatCooldownShort: (ms) => `${ms}ms`, prettyToken: (value) => value, ownedCountOfType });

  it("reads instant for a player's first 5 beacons and the flat minute from the 6th", () => {
    expect(info(0).buildTimeLabel).toBe("0ms");
    expect(info(4).buildTimeLabel).toBe("0ms");
    expect(info(5).buildTimeLabel).toBe("60000ms");
  });
});

describe("structure technology unlocks", () => {
  const catalog = [
    { id: "neural-resin-processing", name: "Neural Resin Processing Warrant" },
    { id: "organized-supply", name: "Reserve Custody Cadre" },
    { id: "frontier-concessions", name: "Frontier Export Charter" },
    { id: "trade", name: "Industrial Tooling Module" }
  ];
  const info = (type: Parameters<typeof structureInfoForKey>[0]) => structureInfoForKey(type, { formatCooldownShort: () => "1m", prettyToken: value => value });
  it.each(NETWORK_RESOURCES)("%s installation names and links its unlocking technology", resource => {
    const spec = RESOURCE_NETWORKS[resource];
    const html = renderStructureInfoOverlay(spec.building, info, undefined, catalog);
    expect(html).toContain("Unlocked by");
    expect(html).toContain(`data-view-tech="${spec.tech}"`);
    expect(html).toContain(catalog.find(tech => tech.id === spec.tech)!.name);
  });
  it("escapes catalog names in the unlock link", () => {
    const html = renderStructureInfoOverlay("CULTIVATION_ESTATE", info, undefined, [{ id: "frontier-concessions", name: "Charter <test>" }]);
    expect(html).toContain("Charter &lt;test&gt;");
    expect(html).not.toContain("Charter <test>");
  });
  it("does not invent a technology requirement for a Relay Beacon", () => {
    expect(renderStructureInfoOverlay("RELAY_BEACON", info, undefined, catalog)).not.toContain("Unlocked by");
  });
});
