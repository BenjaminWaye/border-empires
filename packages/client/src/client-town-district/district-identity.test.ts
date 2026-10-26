import { describe, expect, it } from "vitest";
import { DISTRICT_BUILDING_KINDS } from "./district-catalog.js";
import { silhouettes, similarity } from "./district-silhouettes.js";

describe("support building visual identity", () => {
  it("keeps all 903 pairs distinct as small monochrome silhouettes", () => {
    const models = DISTRICT_BUILDING_KINDS.map(kind => ({ kind, masks: silhouettes(kind) }));
    const collisions: string[] = [];
    for (let i = 0; i < models.length; i += 1) for (let j = i + 1; j < models.length; j += 1) {
      const a = models[i]!, b = models[j]!;
      const score = similarity(a.masks, b.masks);
      if (score > 0.86) collisions.push(`${a.kind} / ${b.kind}: ${(score * 100).toFixed(1)}%`);
    }
    expect(collisions, "Near-interchangeable outlines across three camera directions").toEqual([]);
  });
});
