import { describe, expect, it, vi } from "vitest";
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

  it("refreshes supply for both a siphoned owner and a trading caster when sabotage changes",()=>{
    let siphoned=false;
    const beforeChange=vi.fn(),invalidate=vi.fn(),publish=vi.fn();
    const supply=new RuntimeResourceSupply({now:()=>10,player:id=>buildPlayer(id),ownedTiles:()=>[],
      physicalUpkeep:id=>({FOOD:id==="caster" ? Number(siphoned) : Number(!siphoned),TITANIUM:0,CRYSTAL:0,UMBRITE:0}),
      networkUsed:emptyNetworkSiteCounts,tileSettledAtByKey:new Map<string,number>(),beforeChange,invalidate,changed:()=>undefined,publish},
      [{id:"contract",proposerId:"caster",targetId:"buyer",proposerGives:{FOOD:1},targetGives:{},startedAt:1}]);
    expect(supply.ledger.allocation(10).fulfilled.has("contract")).toBe(false);
    const oldTile={x:1,y:1,terrain:"LAND" as const,ownerId:"victim",ownershipState:"SETTLED" as const,resource:"FARM" as const};
    const next={...oldTile,sabotage:{ownerId:"caster",observatoryTileKey:"4,4",endsAt:Number.MAX_SAFE_INTEGER,outputMultiplier:0}};
    supply.sourceWillChange(oldTile,next);siphoned=true;supply.sourceDidChange(oldTile,next);supply.sourceChangesPublished(oldTile,next);
    expect(beforeChange).toHaveBeenCalledWith(10,expect.arrayContaining(["caster","buyer"]));
    expect(invalidate).toHaveBeenCalledWith(expect.arrayContaining(["caster","buyer"]));
    expect(supply.ledger.allocation(10).fulfilled.has("contract")).toBe(true);
    expect(publish).toHaveBeenCalled();
    supply.sourceWillChange(next,oldTile);siphoned=false;supply.sourceDidChange(next,oldTile);
    expect(supply.ledger.allocation(10).fulfilled.has("contract")).toBe(false);
  });

  it("settles and invalidates a non-trading caster when its external supplier loses FOOD",()=>{
    const beforeChange=vi.fn(),invalidate=vi.fn(),publish=vi.fn();
    const drained={x:1,y:1,terrain:"LAND" as const,ownerId:"victim",ownershipState:"SETTLED" as const,resource:"NEURAL_RESIN" as const,
      economicStructure:{ownerId:"victim",type:"RESIN_EXTRACTOR" as const,status:"active" as const},
      sabotage:{ownerId:"caster",observatoryTileKey:"4,4",endsAt:Number.MAX_SAFE_INTEGER,outputMultiplier:0}};
    const supply=new RuntimeResourceSupply({now:()=>10,player:id=>buildPlayer(id),ownedTiles:()=>[],
      physicalUpkeep:()=>({FOOD:0,TITANIUM:0,CRYSTAL:0,UMBRITE:0}),networkUsed:emptyNetworkSiteCounts,
      siphonCasterIds:()=>["caster"],siphonedTiles:id=>id==="caster"?[drained]:[],
      tileSettledAtByKey:new Map<string,number>(),beforeChange,invalidate,changed:()=>undefined,publish});
    const food={x:2,y:1,terrain:"LAND" as const,ownerId:"victim",ownershipState:"SETTLED" as const,resource:"FARM" as const};
    const lost={...food,ownerId:"enemy"};
    supply.sourceWillChange(food,lost);supply.sourceDidChange(food,lost);supply.sourceChangesPublished(food,lost);
    expect(beforeChange).toHaveBeenCalledWith(10,expect.arrayContaining(["victim","caster"]));
    expect(invalidate).toHaveBeenCalledWith(expect.arrayContaining(["caster"]));
    expect(publish).toHaveBeenCalledWith(expect.arrayContaining(["caster"]));
  });

});
