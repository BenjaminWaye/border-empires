import { describe, expect, it } from "vitest";
import { allocateResourceSupplyAgreements, ResourceSupplyOfferSchema, type ResourceSupplyAgreement } from "./resource-supply-trades.js";
const deal = (changes: Partial<ResourceSupplyAgreement> = {}): ResourceSupplyAgreement => ({
  id: "deal", proposerId: "a", targetId: "b", proposerGives: { FOOD: 3 }, targetGives: { NEURAL_RESIN: 1 }, startedAt: 1, expiresAt: 100, ...changes
});
describe("renewable resource supply contracts", () => {
  it("resolves upkeep transfers before network capacity without creating resource stockpiles", () => {
    const allocation = allocateResourceSupplyAgreements([deal()], 50, (id, phase, flows) =>
      phase === "upkeep" ? id === "a" ? { FOOD: 3 } : {} : id === "b" && flows.get("b")!.incoming.FOOD >= 3 ? { NEURAL_RESIN: 1 } : {});
    expect(allocation.fulfilled.has("deal")).toBe(true);
    expect(allocation.flows.get("a")!.incoming.NEURAL_RESIN).toBe(1);
    expect(allocation.flows.get("a")!.outgoing.FOOD).toBe(3);
    expect(allocation.flows.get("b")!.incoming.FOOD).toBe(3);
    expect(allocation.flows.get("b")!.outgoing.NEURAL_RESIN).toBe(1);
  });
  it("suspends both directions if either supplier loses its backing", () => {
    const allocation = allocateResourceSupplyAgreements([deal()], 50, (id, phase) => phase === "upkeep" && id === "a" ? { FOOD: 3 } : {});
    expect(allocation.suspended.has("deal")).toBe(true);
    expect(allocation.flows.size).toBe(0);
  });
  it("keeps older deals ahead of newer commitments without allocating the same slot twice", () => {
    const old = deal({ id: "old", proposerGives: { FOOD: 2 }, targetGives: {} });
    const newer = deal({ id: "new", targetId: "c", startedAt: 2, proposerGives: { FOOD: 2 }, targetGives: {} });
    const allocation = allocateResourceSupplyAgreements([newer, old], 50, id => id === "a" ? { FOOD: 3 } : {});
    expect([...allocation.fulfilled]).toEqual(["old"]);
    expect([...allocation.suspended]).toEqual(["new"]);
    expect(allocation.flows.get("a")!.outgoing.FOOD).toBe(2);
  });
  it("cannot mint supply by circulating imports, and stops at the exact expiry", () => {
    const cycle = deal({ targetGives: { FOOD: 3 } });
    expect(allocateResourceSupplyAgreements([cycle], 50, () => ({})).fulfilled.size).toBe(0);
    expect(allocateResourceSupplyAgreements([deal()], 100, () => ({ FOOD: 100, NEURAL_RESIN: 100 })).flows.size).toBe(0);
  });
  it("rejects fractional, negative and unknown resources", () => {
    expect(ResourceSupplyOfferSchema.safeParse({ FOOD: 1.5 }).success).toBe(false);
    expect(ResourceSupplyOfferSchema.safeParse({ FOOD: -1 }).success).toBe(false);
    expect(ResourceSupplyOfferSchema.safeParse({ SHARD: 1 }).success).toBe(false);
  });
  it("bounds expensive capacity reads during a world-wide network shortage",()=>{
    const rows=Array.from({length:256},(_,i)=>deal({id:`shortage-${i}`,proposerId:`from-${i}`,targetId:`to-${i}`,
      proposerGives:{NEURAL_RESIN:1},targetGives:{},expiresAt:undefined}));
    let reads=0;
    const allocation=allocateResourceSupplyAgreements(rows,50,()=>{reads++;return {};});
    expect(allocation.suspended.size).toBe(256);
    expect(allocation.fulfilled.size).toBe(0);
    expect(reads).toBeLessThanOrEqual(512);
  });

});
