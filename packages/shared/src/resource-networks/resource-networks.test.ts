import { describe, expect, it } from "vitest";
import { NETWORK_RESOURCES, RESOURCE_NETWORKS, effectiveNetworkSites, emptyNetworkSiteCounts, networkCreditPerMinute, networkFactoryRegenPerMinute } from "./resource-networks.js";
import { ClientMessageSchema } from "../messages/messages.js";
import { structureShowsOnTile } from "../structure-placement.js";

describe("resource networks", () => {
  it("rewards the first three sites fully and the next three at half value, then stops", () => {
    expect([0,1,2,3,4,5,6,7,100].map(effectiveNetworkSites)).toEqual([0,1,2,3,3.5,4,4.5,4.5,4.5]);
  });
  it("adds 4 resin and 2 mineral Ancillaries per factory per four-hour batch, with no storage bonus", () => {
    const counts = { ...emptyNetworkSiteCounts(), NEURAL_RESIN: 2, CONDUCTIVE_MINERALS: 1 };
    expect(networkFactoryRegenPerMinute(counts, 3) * 240).toBeCloseTo(30);
    expect(networkFactoryRegenPerMinute(counts, 0)).toBe(0);
    expect(networkFactoryRegenPerMinute({ ...counts, NEURAL_RESIN: 100, CONDUCTIVE_MINERALS: 100 }, 1) * 240).toBeCloseTo(27);
  });
  it("keeps exports and manufacturing distinct", () => {
    const counts = { ...emptyNetworkSiteCounts(), PRECURSOR_SALVAGE: 2, CATALYTIC_DEPOSIT: 1, LUXURY_BIOTA: 1 };
    expect(networkCreditPerMinute(counts, "MANUFACTORY", 2) * 1440).toBe(2);
    expect(networkCreditPerMinute(counts, "TRADE_NEXUS", 1) * 1440).toBe(1);
  });
  for (const resource of NETWORK_RESOURCES) {
    it(`${resource}: accepts the real build wire command and restricts placement to its deposit`, () => {
      const building = RESOURCE_NETWORKS[resource].building;
      expect(ClientMessageSchema.parse({ type: "BUILD_ECONOMIC_STRUCTURE", x: 10, y: 10, structureType: building })).toMatchObject({ structureType: building });
      expect(structureShowsOnTile(building, { ownershipState: "SETTLED", resource })).toBe(true);
      expect(structureShowsOnTile(building, { ownershipState: "SETTLED", resource: "FARM" })).toBe(false);
      expect(structureShowsOnTile(building, { ownershipState: "SETTLED" })).toBe(false);
    });
  }
});
