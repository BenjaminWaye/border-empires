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
  it("returns the resource a tech reveals via effects.revealResource", () => {
    const tech: TechInfo = { ...baseTech, effects: { revealResource: "umbrite" } };
    expect(relatedStrategicResourcesForTech(tech)).toEqual(["UMBRITE"]);
  });

  it("matches revealResource case-insensitively", () => {
    const tech: TechInfo = { ...baseTech, effects: { revealResource: "TITANIUM" } };
    expect(relatedStrategicResourcesForTech(tech)).toEqual(["TITANIUM"]);
  });

  it("ignores revealResource categories with no strategic-resource art (e.g. food)", () => {
    const tech: TechInfo = { ...baseTech, effects: { revealResource: "food" } };
    expect(relatedStrategicResourcesForTech(tech)).toEqual([]);
  });

  it("returns nothing for a tech with no revealResource effect", () => {
    const tech: TechInfo = { ...baseTech, effects: { unlockForts: true } };
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
  it("renders nothing for a tech that doesn't reveal a strategic resource", () => {
    expect(renderResourceRevealHtml(baseTech)).toBe("");
  });

  it("renders a Resource revealed card for the tech that reveals Umbrite", () => {
    const tech: TechInfo = { ...baseTech, effects: { unlockUmbriteRig: true, revealResource: "umbrite" } };
    const html = renderResourceRevealHtml(tech);
    expect(html).toContain("Resource revealed");
    expect(html).toContain("UMBRITE");
    expect(html).toContain("dense forests");
  });
});
