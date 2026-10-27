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
  it("refuses cancellation by a House outside the agreement, then permits either participant",()=>{
    const player=buildPlayer("large");
    const supply=new RuntimeResourceSupply({now:()=>1,player:()=>player,ownedTiles:()=>[],
      physicalUpkeep:()=>({FOOD:2,TITANIUM:0,CRYSTAL:0,UMBRITE:0}),networkUsed:emptyNetworkSiteCounts,
      tileSettledAtByKey:new Map<string,number>(),beforeChange:()=>undefined,invalidate:()=>undefined,changed:()=>undefined},
      [{id:"contract",proposerId:"large",targetId:"other",proposerGives:{FOOD:1},targetGives:{},startedAt:1}]);
    expect(supply.cancel("contract","stranger").ok).toBe(false);
    expect(supply.ledger.rows()).toHaveLength(1);
    expect(supply.cancel("contract","other").ok).toBe(true);
    expect(supply.ledger.rows()).toEqual([]);
    expect(supply.cancel("contract","other").ok).toBe(true);
  });

  it("does not traverse territory to count physical network sites before extraction is unlocked",()=>{
    let reads=0;
    const player=buildPlayer("new");
    const supply=new RuntimeResourceSupply({now:()=>1,player:()=>player,ownedTiles:()=>{reads++;return [];},
      physicalUpkeep:()=>({FOOD:0,TITANIUM:0,CRYSTAL:0,UMBRITE:0}),networkUsed:emptyNetworkSiteCounts,
      tileSettledAtByKey:new Map<string,number>(),beforeChange:()=>undefined,invalidate:()=>undefined,changed:()=>undefined});
    expect(supply.network("new")).toEqual(emptyNetworkSiteCounts());expect(reads).toBe(0);
  });

});
