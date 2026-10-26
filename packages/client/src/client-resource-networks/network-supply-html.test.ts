import { describe, expect, it } from "vitest";
import { emptyNetworkSiteCounts } from "@border-empires/shared";
import { networkSupplyHtml } from "./network-supply-html.js";

describe("industrial supply display", () => {
  it("shows occupied slots, spare supply and the actual supplied output", () => {
    const supply={...emptyNetworkSiteCounts(), NEURAL_RESIN:2, CATALYTIC_DEPOSIT:1};
    const used={...emptyNetworkSiteCounts(), NEURAL_RESIN:1, CATALYTIC_DEPOSIT:1};
    const html=networkSupplyHtml({supply,used});
    expect(html).toContain("1 / 2 slots used · +12 Ancillaries/batch");
    expect(html).toContain("One slot per Ancillary Factory · 1 free");
    expect(html).toContain("1 / 1 slots used · +1.5 Coin/day");
    expect(html).not.toContain("Conductive minerals");
  });
  it("keeps campaigns without developed sites unchanged", () => {
    expect(networkSupplyHtml(undefined)).toBe("");
    expect(networkSupplyHtml({supply:emptyNetworkSiteCounts(),used:emptyNetworkSiteCounts()})).toBe("");
  });
});
