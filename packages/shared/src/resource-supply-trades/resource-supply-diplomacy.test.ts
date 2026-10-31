import { describe, expect, it } from "vitest";
import { aiCounterOffer, evaluateAiOffer, netValueToAi, DiplomacyTermsSchema, swapDiplomacyTerms, describeDiplomacyTermsForRecipient, type AiDiplomacyPricing } from "../diplomacy-terms/diplomacy-terms.js";
const pricing: AiDiplomacyPricing = { required:{truce12:2,truce24:4,alliance:0},shardCoinValue:25,aiHoldings:{gold:10,shard:0,resources:{FOOD:2}} };
const terms={give:{gold:0,shard:0,resources:{NEURAL_RESIN:1}},ask:{gold:0,shard:0},supplyDurationHours:12 as const};
describe("resource diplomacy terms and AI parity",()=>{
  it("uses a daily negotiation value for open-ended supply and rejects unsupported requested supply",()=>{
    expect(netValueToAi(terms,25)).toBe(4);
    expect(evaluateAiOffer(pricing,"truce",12,terms)).toEqual({accepts:true});
    expect(netValueToAi({...terms,supplyDurationHours:24},25)).toBe(4);
    expect(evaluateAiOffer(pricing,"truce",12,{...terms,ask:{gold:0,shard:0,resources:{FOOD:3}}})).toMatchObject({accepts:false,reason:"aiCannotPay"});
  });
  it("retains the supply term and swaps directions in counters and card descriptions",()=>{
    expect(swapDiplomacyTerms(terms)).toMatchObject({ask:terms.give,supplyDurationHours:12});
    expect(describeDiplomacyTermsForRecipient(terms,"Milo")).toContain("1 Neural resin supply slot; resource supply until cancelled");
    const counter=aiCounterOffer(pricing,"truce",12,{...terms,give:{gold:0,shard:0}}, {gold:0,shard:0,resources:{NEURAL_RESIN:1}});
    expect(counter.kind).toBe("counter");
    if (counter.kind !== "counter") throw new Error("Expected a resource counter offer");
    expect(counter.terms.give.resources?.NEURAL_RESIN).toBe(1);
    expect(evaluateAiOffer(pricing,"truce",12,counter.terms)).toEqual({accepts:true});
  });
  it("rejects negative, fractional, stockpiled Shard, unknown resources and invalid terms",()=>{
    for (const resources of [{FOOD:-1},{FOOD:0.5},{SHARD:1},{COPPER:1}]) expect(DiplomacyTermsSchema.safeParse({...terms,give:{gold:0,shard:0,resources}}).success).toBe(false);
    expect(DiplomacyTermsSchema.safeParse({...terms,supplyDurationHours:36}).success).toBe(false);
  });
});
