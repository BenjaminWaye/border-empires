import { describe, expect, it } from "vitest";
import { NETWORK_RESOURCES, RESOURCE_NETWORKS } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { buildPlayer } from "../runtime/runtime.test-helpers.js";
import { networkSupplyWithSiphon } from "./network-supply-with-siphon.js";

for (const resource of NETWORK_RESOURCES) describe(`${resource} Siphon supply`, () => {
  const spec=RESOURCE_NETWORKS[resource];
  it("moves one working site's supply to the caster and restores it on release", () => {
    const victim=buildPlayer("victim",{techIds:new Set([spec.tech])}),caster=buildPlayer("caster");
    const site:DomainTileState={x:1,y:1,terrain:"LAND",ownerId:"victim",ownershipState:"SETTLED",resource,
      economicStructure:{ownerId:"victim",type:spec.building,status:"active"},
      sabotage:{ownerId:"caster",observatoryTileKey:"3,3",endsAt:Number.MAX_SAFE_INTEGER,outputMultiplier:0}};
    let powered=true;
    const ctx={player:(id:string)=>id==="victim"?victim:caster,ownedTiles:(id:string)=>id==="victim"?[site]:[],
      effectiveUpkeep:()=>({FOOD:powered?1:0,TITANIUM:0,CRYSTAL:0,UMBRITE:0}),
      siphonedTiles:(id:string)=>id==="caster"&&site.sabotage?[site]:[],tileSettledAtByKey:new Map<string,number>()};
    expect(networkSupplyWithSiphon(ctx,"victim")[resource]).toBe(0);
    expect(networkSupplyWithSiphon(ctx,"caster")[resource]).toBe(spec.slotsPerSite);
    powered=false;
    expect(networkSupplyWithSiphon(ctx,"caster")[resource]).toBe(0);
    powered=true;site.economicStructure!.status="under_construction";
    expect(networkSupplyWithSiphon(ctx,"caster")[resource]).toBe(0);
    site.economicStructure!.status="active";victim.techIds.clear();
    expect(networkSupplyWithSiphon(ctx,"caster")[resource]).toBe(0);
    victim.techIds.add(spec.tech);site.sabotage=undefined;
    expect(networkSupplyWithSiphon(ctx,"victim")[resource]).toBe(spec.slotsPerSite);
    expect(networkSupplyWithSiphon(ctx,"caster")[resource]).toBe(0);
  });
});
