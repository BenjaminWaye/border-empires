import { describe, expect, it } from "vitest";
import { emptyNetworkSiteCounts } from "@border-empires/shared";
import { networkSupplyHtml } from "./network-supply-html.js";

describe("industrial supply display", () => {
  it("shows what each frontier resource you hold is doing", () => {
    const supply={...emptyNetworkSiteCounts(), LUXURY_BIOTA:2, PRECURSOR_SALVAGE:3};
    const used={...supply, LUXURY_BIOTA:1};
    const html=networkSupplyHtml({supply,used});
    expect(html).toContain("Luxury biota ×2");
    expect(html).toContain("4 biota slots");
    expect(html).toContain("1 site spare");
    expect(html).toContain("+3% attack and defense");
    expect(html).not.toContain("manpower per refill");
  });
  it("keeps campaigns without developed sites unchanged", () => {
    expect(networkSupplyHtml(undefined)).toBe("");
    expect(networkSupplyHtml({supply:emptyNetworkSiteCounts(),used:emptyNetworkSiteCounts()})).toBe("");
  });
});
