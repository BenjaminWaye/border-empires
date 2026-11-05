import { describe, expect, it } from "vitest";
import { emptyNetworkSiteCounts } from "@border-empires/shared";
import { networkSupplyHtml } from "./network-supply-html.js";

describe("industrial supply display", () => {
  it("shows what each frontier resource you hold is doing", () => {
    const supply={...emptyNetworkSiteCounts(), NEURAL_RESIN:2, CATALYTIC_DEPOSIT:1, LUXURY_BIOTA:2, PRECURSOR_SALVAGE:3};
    const used={...supply, LUXURY_BIOTA:1};
    const html=networkSupplyHtml({supply,used});
    expect(html).toContain("Neural resin ×2");
    expect(html).toContain("+150 manpower per refill");
    expect(html).toContain("+120 manpower per refill");
    expect(html).toContain("4 biota slots");
    expect(html).toContain("1 site spare");
    expect(html).toContain("+3% attack and defense");
    expect(html).not.toContain("Conductive minerals");
  });
  it("keeps campaigns without developed sites unchanged", () => {
    expect(networkSupplyHtml(undefined)).toBe("");
    expect(networkSupplyHtml({supply:emptyNetworkSiteCounts(),used:emptyNetworkSiteCounts()})).toBe("");
  });
});
