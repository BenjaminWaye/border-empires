import { describe,expect,it } from "vitest";
import { NETWORK_RESOURCES,RESOURCE_NETWORKS } from "@border-empires/shared";
import { chooseBestEconomicBuild,type StructurePlannerPlayer,type StructurePlannerTile } from "./structure-command-planner.js";

describe("AI resource-network development",()=>{
  for(const resource of NETWORK_RESOURCES) it(`develops ${resource} only with its tech, a beneficiary and room below the cap`,()=>{
    const spec=RESOURCE_NETWORKS[resource];
    const tile:StructurePlannerTile={x:10,y:10,terrain:"LAND",ownerId:"ai",ownershipState:"SETTLED",resource};
    const player:StructurePlannerPlayer={id:"ai",points:100,manpower:1000,techIds:[spec.tech],ownedStructureCounts:{[spec.target]:1},slotSupplyByResource:{FOOD:10},slotDemandByResource:{FOOD:0}};
    const lookup=new Map([["10,10",tile]]);
    expect(chooseBestEconomicBuild(player,[tile],lookup)?.structureType).toBe(spec.building);
    expect(chooseBestEconomicBuild({...player,techIds:[]},[tile],lookup)).toBeUndefined();
    expect(chooseBestEconomicBuild({...player,ownedStructureCounts:{}},[tile],lookup)).toBeUndefined();
    expect(chooseBestEconomicBuild({...player,ownedStructureCounts:{[spec.target]:1,[spec.building]:6}},[tile],lookup)).toBeUndefined();
  });
});
