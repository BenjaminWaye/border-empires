import { describe, expect, it } from "vitest";

import { CREST_COSMETIC_IDS } from "./cosmetics.js";
import { defaultHouseCrestFor } from "./default-house-crest.js";

describe("defaultHouseCrestFor", () => {
  it("gives the AIs the catalogue in order, so the first twelve differ", () => {
    const crests = Array.from({ length: CREST_COSMETIC_IDS.length }, (_, index) => defaultHouseCrestFor(`ai-${index + 1}`));
    expect(crests).toEqual([...CREST_COSMETIC_IDS]);
    expect(defaultHouseCrestFor(`ai-${CREST_COSMETIC_IDS.length + 1}`)).toBe(CREST_COSMETIC_IDS[0]);
  });

  it("gives any other id a stable catalogue crest", () => {
    const crest = defaultHouseCrestFor("guest-7f3a");
    expect(CREST_COSMETIC_IDS).toContain(crest);
    expect(defaultHouseCrestFor("guest-7f3a")).toBe(crest);
    const spread = new Set(Array.from({ length: 200 }, (_, index) => defaultHouseCrestFor(`guest-${index}`)));
    expect(spread.size).toBe(CREST_COSMETIC_IDS.length);
  });
});
