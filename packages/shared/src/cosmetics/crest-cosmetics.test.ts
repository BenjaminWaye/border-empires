import { describe, expect, it } from "vitest";

import {
  COSMETIC_CATALOG,
  CREST_COSMETIC_IDS,
  FREE_COSMETIC_IDS,
  accountTitleFor,
  cosmeticBelongsToSlot,
  isCrestCosmeticId,
  isFreeCosmetic,
  ownedWithFreeCosmetics,
  sanitizeCosmeticSelection
} from "./cosmetics.js";

describe("House crests", () => {
  it("offers a small set of crests in the crest slot", () => {
    expect(CREST_COSMETIC_IDS.length).toBeGreaterThanOrEqual(10);
    expect(CREST_COSMETIC_IDS.length).toBeLessThanOrEqual(16);
    for (const id of CREST_COSMETIC_IDS) expect(cosmeticBelongsToSlot(id, "crest")).toBe(true);
  });

  it("are all free for now, and only crests are free", () => {
    expect([...FREE_COSMETIC_IDS].sort()).toEqual([...CREST_COSMETIC_IDS].sort());
    expect(isFreeCosmetic("crest-anchor")).toBe(true);
    expect(isFreeCosmetic("flag-high-noble")).toBe(false);
    expect(isFreeCosmetic("nope")).toBe(false);
  });

  it("has no crown, which would read as the earned Duke title", () => {
    for (const entry of COSMETIC_CATALOG) if (entry.slot === "crest") expect(`${entry.id} ${entry.label}`).not.toMatch(/crown/i);
  });

  it("adds the free crests to what an account owns, once each", () => {
    const owned = ownedWithFreeCosmetics(["flag-high-noble", "crest-cog"]);
    expect(owned.filter((id) => id === "crest-cog")).toHaveLength(1);
    expect(owned).toContain("flag-high-noble");
    for (const id of CREST_COSMETIC_IDS) expect(owned).toContain(id);
  });

  it("does not let free crests grant a title", () => {
    expect(accountTitleFor(FREE_COSMETIC_IDS)).toBeUndefined();
  });

  it("keeps a crest in a selection and drops one in the wrong slot", () => {
    expect(sanitizeCosmeticSelection({ crest: "crest-kraken" })).toEqual({ crest: "crest-kraken" });
    expect(sanitizeCosmeticSelection({ musterFlag: "crest-kraken", crest: "flag-high-noble" })).toEqual({});
    expect(isCrestCosmeticId("crest-stag")).toBe(true);
    expect(isCrestCosmeticId("flag-high-noble")).toBe(false);
  });
});
