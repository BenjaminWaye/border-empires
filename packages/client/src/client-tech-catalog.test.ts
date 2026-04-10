import { describe, expect, it } from "vitest";

import { resolveTechCatalog } from "./client-tech-catalog.js";

describe("resolveTechCatalog", () => {
  it("synthesizes fallback entries for owned tech ids when the incoming catalog is missing", () => {
    const catalog = resolveTechCatalog({
      incoming: undefined,
      previous: [],
      ownedIds: ["agriculture", "tribal-warfare"],
      choiceIds: ["bronze-working"]
    });

    expect(catalog.map((tech) => tech.id)).toEqual(["agriculture", "tribal-warfare", "bronze-working"]);
    expect(catalog[0]?.name).toBe("Agriculture");
    expect(catalog[1]?.name).toBe("Tribal Warfare");
    expect(catalog[2]?.name).toBe("Bronze Working");
  });

  it("preserves existing rich entries and backfills only the missing ids", () => {
    const catalog = resolveTechCatalog({
      incoming: [{ id: "agriculture", name: "Agriculture", description: "Food", mods: {}, requirements: { gold: 10, resources: {}, canResearch: false } }],
      previous: [],
      ownedIds: ["agriculture", "toolmaking"],
      choiceIds: []
    });

    expect(catalog).toHaveLength(2);
    expect(catalog[0]?.description).toBe("Food");
    expect(catalog[1]?.name).toBe("Toolmaking");
  });
});
