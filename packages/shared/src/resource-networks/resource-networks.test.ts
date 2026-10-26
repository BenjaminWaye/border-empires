import { describe, expect, it } from "vitest";
import { NETWORK_RESOURCES, RESOURCE_NETWORKS, suppliedNetworkBuildings, emptyNetworkSiteCounts, networkCreditPerMinute, networkFactoryRegenPerMinute } from "./resource-networks.js";
import { ClientMessageSchema } from "../messages/messages.js";
import { structureShowsOnTile } from "../structure-placement.js";

describe("resource networks", () => {
  it("consumes one supply slot per beneficiary without fractions or an arbitrary empire cap", () => {
    expect([0,1,2,3,6,100].map(slots => suppliedNetworkBuildings(slots, 3))).toEqual([0,1,2,3,3,3]);
    expect(suppliedNetworkBuildings(100, 100)).toBe(100);
  });
  it("adds 12 resin and 6 mineral Ancillaries only to supplied factories, without storage bonuses", () => {
    const counts = { ...emptyNetworkSiteCounts(), NEURAL_RESIN: 2, CONDUCTIVE_MINERALS: 1 };
    expect(networkFactoryRegenPerMinute(counts, 3) * 240).toBeCloseTo(30);
    expect(networkFactoryRegenPerMinute(counts, 30) * 240).toBeCloseTo(30);
    expect(networkFactoryRegenPerMinute(counts, 1) * 240).toBeCloseTo(18);
    expect(networkFactoryRegenPerMinute(counts, 0)).toBe(0);
    expect(networkFactoryRegenPerMinute({ ...counts, NEURAL_RESIN: 100, CONDUCTIVE_MINERALS: 100 }, 1) * 240).toBeCloseTo(18);
  });
  it("one credit slot can supply one relevant building, and idle supply grants no credit", () => {
    const counts = { ...emptyNetworkSiteCounts(), PRECURSOR_SALVAGE: 2, CATALYTIC_DEPOSIT: 1, LUXURY_BIOTA: 1 };
    expect(networkCreditPerMinute(counts, "MANUFACTORY", 2) * 1440).toBe(3);
    expect(networkCreditPerMinute(counts, "MANUFACTORY", 20) * 1440).toBe(3);
    expect(networkCreditPerMinute(counts, "TRADE_NEXUS", 1) * 1440).toBe(3);
    expect(networkCreditPerMinute(counts, "TRADE_NEXUS", 0)).toBe(0);
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
