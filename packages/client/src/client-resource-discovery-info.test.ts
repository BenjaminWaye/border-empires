import { describe, expect, it } from "vitest";
import { relatedStrategicResourcesForTech, renderResourceRevealHtml, resourceDiscoveryInfo } from "./client-resource-discovery-info.js";
import type { TechInfo } from "./client-types.js";

const baseTech: TechInfo = {
  id: "test-tech",
  name: "Test Tech",
  tier: 1,
  description: "",
  mods: {},
  requirements: { gold: 0, resources: {} }
};

describe("relatedStrategicResourcesForTech", () => {
  it("returns the strategic resources a tech costs", () => {
    const tech: TechInfo = { ...baseTech, requirements: { gold: 100, resources: { UMBRITE: 50 } } };
    expect(relatedStrategicResourcesForTech(tech)).toEqual(["UMBRITE"]);
  });

  it("returns multiple resources when a tech costs more than one", () => {
    const tech: TechInfo = { ...baseTech, requirements: { gold: 0, resources: { TITANIUM: 20, CRYSTAL: 5 } } };
    expect(relatedStrategicResourcesForTech(tech)).toEqual(["TITANIUM", "CRYSTAL"]);
  });

  it("ignores FOOD/SHARD and zero-amount resource entries", () => {
    const tech: TechInfo = { ...baseTech, requirements: { gold: 0, resources: { FOOD: 40, UMBRITE: 0 } } };
    expect(relatedStrategicResourcesForTech(tech)).toEqual([]);
  });
});

describe("resourceDiscoveryInfo", () => {
  it("gives each resource a label, glyph, color, and where-to-find hint", () => {
    for (const key of ["TITANIUM", "CRYSTAL", "UMBRITE"] as const) {
      const info = resourceDiscoveryInfo(key);
      expect(info.label.length).toBeGreaterThan(0);
      expect(info.glyph.length).toBeGreaterThan(0);
      expect(info.color).toMatch(/^#/);
      expect(info.whatItsFor.length).toBeGreaterThan(0);
      expect(info.whereToFind.length).toBeGreaterThan(0);
    }
  });
});

describe("renderResourceRevealHtml", () => {
  it("renders nothing for a tech with no strategic resource cost", () => {
    expect(renderResourceRevealHtml(baseTech)).toBe("");
  });

  it("renders a Resource revealed card for a tech that costs Umbrite", () => {
    const tech: TechInfo = { ...baseTech, requirements: { gold: 0, resources: { UMBRITE: 50 } } };
    const html = renderResourceRevealHtml(tech);
    expect(html).toContain("Resource revealed");
    expect(html).toContain("UMBRITE");
    expect(html).toContain("dense forests");
  });
});
