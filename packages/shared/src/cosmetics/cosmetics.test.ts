import { describe, expect, it } from "vitest";

import {
  COSMETIC_CATALOG,
  COSMETIC_SLOTS,
  cosmeticBelongsToSlot,
  isCosmeticId,
  isEmptyCosmeticSelection,
  sanitizeCosmeticSelection,
  COSMETIC_PRODUCTS,
  accountTitleFor,
  cosmeticProduct,
  isAccountTitle,
  isCosmeticId
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
    expect(isCosmeticId("flag-high-noble")).toBe(true);
    expect(isCosmeticId("flag-unknown")).toBe(false);
    expect(cosmeticBelongsToSlot("flag-high-noble", "musterFlag")).toBe(true);
    expect(cosmeticBelongsToSlot("flag-unknown", "musterFlag")).toBe(false);
  });
});

describe("sanitizeCosmeticSelection", () => {
  it("keeps valid entries", () => {
    expect(sanitizeCosmeticSelection({ musterFlag: "flag-high-noble" })).toEqual({ musterFlag: "flag-high-noble" });
  });

  it("keeps one choice per slot, and drops an id shown in the wrong slot", () => {
    expect(sanitizeCosmeticSelection({ musterFlag: "flag-high-noble", ancillaries: "ancillaries-lancet-guard" })).toEqual({
      musterFlag: "flag-high-noble",
      ancillaries: "ancillaries-lancet-guard"
    });
    expect(sanitizeCosmeticSelection({ musterFlag: "ancillaries-lancet-guard", ancillaries: "flag-high-noble" })).toEqual({});
  });

  it("drops unknown ids and unknown slots", () => {
    expect(sanitizeCosmeticSelection({ musterFlag: "nope", crest: "flag-high-noble" })).toEqual({});
  });

  it("treats anything that is not an object as the default look", () => {
    for (const value of [undefined, null, "flag-high-noble", 3]) expect(sanitizeCosmeticSelection(value)).toEqual({});
  });

  it("reports an empty selection", () => {
    expect(isEmptyCosmeticSelection({})).toBe(true);
    expect(isEmptyCosmeticSelection({ musterFlag: "flag-high-noble" })).toBe(false);
  });
});

describe("COSMETIC_PRODUCTS", () => {
  it("sells the title of Count for USD 4.99 with both High-noble cosmetics", () => {
    expect(cosmeticProduct("title-count")).toEqual({
      id: "title-count",
      name: "Claim the title of Count",
      priceUsdCents: 499,
      grants: ["flag-high-noble", "ancillaries-lancet-guard"],
      title: "Count"
    });
    expect(cosmeticProduct("nope")).toBeUndefined();
  });

  it("only grants cosmetics that exist, under unique product ids", () => {
    expect(new Set(COSMETIC_PRODUCTS.map((product) => product.id)).size).toBe(COSMETIC_PRODUCTS.length);
    for (const product of COSMETIC_PRODUCTS) for (const id of product.grants) expect(isCosmeticId(id)).toBe(true);
  });
});

describe("accountTitleFor", () => {
  it("makes an account a Count only while it owns everything the product grants", () => {
    expect(accountTitleFor(["flag-high-noble", "ancillaries-lancet-guard"])).toBe("Count");
    expect(accountTitleFor(["flag-high-noble"])).toBeUndefined();
    expect(accountTitleFor([])).toBeUndefined();
  });

  it("recognises only known titles", () => {
    expect(isAccountTitle("Count")).toBe(true);
    expect(isAccountTitle("Duke")).toBe(false);
    expect(isAccountTitle(undefined)).toBe(false);
  });
});
