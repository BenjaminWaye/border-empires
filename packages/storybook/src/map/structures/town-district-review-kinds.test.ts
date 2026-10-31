import { describe, expect, it } from "vitest";
import { STRUCTURE_REGISTRY } from "@border-empires/shared";
import { DISTRICT_MODEL_BRIEFS } from "../../../../client/src/client-town-district/district-model-briefs.js";
import { CURRENT_DISTRICT_KINDS, RETIRED_DISTRICT_KINDS } from "./town-district-review-kinds.js";

describe("current district 3D review", () => {
  it("never presents retired save-compatible types as current buildings", () => {
    expect(CURRENT_DISTRICT_KINDS).toHaveLength(41);
    expect(CURRENT_DISTRICT_KINDS).not.toContain("QUARTERMASTERS_OFFICE");
    expect(CURRENT_DISTRICT_KINDS).not.toContain("WEAPONS_WORKSHOP");
    expect(RETIRED_DISTRICT_KINDS).toEqual(["WEAPONS_WORKSHOP", "QUARTERMASTERS_OFFICE"]);
    for (const kind of CURRENT_DISTRICT_KINDS) {
      expect(STRUCTURE_REGISTRY[kind], kind).toBeDefined();
      expect(DISTRICT_MODEL_BRIEFS[kind].role.length, kind).toBeGreaterThan(25);
      expect(DISTRICT_MODEL_BRIEFS[kind].landmark.length, kind).toBeGreaterThan(15);
    }
  });
});
