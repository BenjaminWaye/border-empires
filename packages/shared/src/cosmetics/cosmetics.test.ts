import { describe, expect, it } from "vitest";

import {
  COSMETIC_CATALOG,
  COSMETIC_SLOTS,
  cosmeticBelongsToSlot,
  isCosmeticId,
  isEmptyCosmeticSelection,
  sanitizeCosmeticSelection
} from "./cosmetics.js";

describe("cosmetics catalogue", () => {
  it("has unique ids that each belong to a known slot", () => {
    const ids = COSMETIC_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of COSMETIC_CATALOG) expect(COSMETIC_SLOTS).toContain(entry.slot);
  });

  it("keeps ids short, because a selection is sent to every player", () => {
    for (const entry of COSMETIC_CATALOG) expect(entry.id.length).toBeLessThanOrEqual(24);
  });

  it("recognises ids and their slots", () => {
    expect(isCosmeticId("flag-chevron")).toBe(true);
    expect(isCosmeticId("flag-unknown")).toBe(false);
    expect(cosmeticBelongsToSlot("flag-chevron", "musterFlag")).toBe(true);
    expect(cosmeticBelongsToSlot("flag-chevron", "ancillary")).toBe(false);
  });
});

describe("sanitizeCosmeticSelection", () => {
  it("keeps valid entries", () => {
    expect(sanitizeCosmeticSelection({ musterFlag: "flag-chevron", ancillary: "ancillary-ivory" })).toEqual({
      musterFlag: "flag-chevron",
      ancillary: "ancillary-ivory"
    });
  });

  it("drops unknown ids, ids in the wrong slot and unknown slots", () => {
    expect(sanitizeCosmeticSelection({ musterFlag: "ancillary-ivory", ancillary: "nope", crest: "flag-chevron" })).toEqual({});
  });

  it("treats anything that is not an object as the default look", () => {
    for (const value of [undefined, null, "flag-chevron", 3]) expect(sanitizeCosmeticSelection(value)).toEqual({});
  });

  it("reports an empty selection", () => {
    expect(isEmptyCosmeticSelection({})).toBe(true);
    expect(isEmptyCosmeticSelection({ musterFlag: "flag-chevron" })).toBe(false);
  });
});
