import { describe, expect, it } from "vitest";
import type { TechCatalogEntry } from "../../../simulation/src/tech-domain-bridge/tech-domain-bridge.js";
import { buildInitTechCatalog } from "./init-payload-catalogs.js";

describe("buildInitTechCatalog", () => {
  // Regression: the client's AFC "Call down" actions and module-gated builds
  // key off manifestCategory, which the catalog used to drop entirely.
  it("forwards manifestCategory so the client can recognise AFC modules", () => {
    const techs = [
      { id: "masonry", tier: 1, name: "Masonry", description: "", manifestCategory: "AFC_MODULE" },
      { id: "agriculture", tier: 1, name: "Agriculture", description: "" }
    ] as unknown as TechCatalogEntry[];

    const catalog = buildInitTechCatalog(techs, { researchedCount: 0, techChoices: [], availableGold: 0, availableStrategic: {} });

    expect(catalog[0]?.manifestCategory).toBe("AFC_MODULE");
    expect(catalog[1]).not.toHaveProperty("manifestCategory");
  });
});
