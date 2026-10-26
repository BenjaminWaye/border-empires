import { describe, expect, it } from "vitest";
import { emptyNetworkSiteCounts, ResourceSupplyOfferSchema } from "@border-empires/shared";
import { buildPlayer } from "../runtime/runtime.test-helpers.js";
import { RuntimeResourceSupply } from "./runtime-resource-supply.js";
describe("resource trade inventory projection",()=>{
  it("keeps a very large empire's offer inventory within the quantity accepted by the wire schema",()=>{
    const player=buildPlayer("large");
    const supply=new RuntimeResourceSupply({now:()=>1,player:()=>player,ownedTiles:()=>[],
      physicalUpkeep:()=>({FOOD:20000,TITANIUM:0,CRYSTAL:0,UMBRITE:0}),networkUsed:emptyNetworkSiteCounts,
      tileSettledAtByKey:new Map<string,number>(),beforeChange:()=>undefined,invalidate:()=>undefined,changed:()=>undefined});
    expect(supply.available("large").FOOD).toBe(10000);
    expect(ResourceSupplyOfferSchema.safeParse(supply.available("large")).success).toBe(true);
  });
});
