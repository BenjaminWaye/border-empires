import { describe,expect,it } from "vitest";
import { NETWORK_RESOURCES,RESOURCE_NETWORKS } from "@border-empires/shared";
import { chooseBestEconomicBuild,type StructurePlannerPlayer,type StructurePlannerTile } from "./structure-command-planner.js";

describe("AI resource-network development",()=>{
  for(const resource of NETWORK_RESOURCES) it(`develops ${resource} once it has the tech, without needing a recipient building`,()=>{
    const spec=RESOURCE_NETWORKS[resource];
    const tile:StructurePlannerTile={x:10,y:10,terrain:"LAND",ownerId:"ai",ownershipState:"SETTLED",resource};
    const player:StructurePlannerPlayer={id:"ai",points:100,manpower:1000,techIds:[spec.tech],ownedStructureCounts:{},slotSupplyByResource:{FOOD:10},slotDemandByResource:{FOOD:0}};
    const lookup=new Map([["10,10",tile]]);
    expect(chooseBestEconomicBuild(player,[tile],lookup)?.structureType).toBe(spec.building);
    expect(chooseBestEconomicBuild({...player,ownedStructureCounts:{[spec.building]:4}},[tile],lookup)?.structureType).toBe(spec.building);
    expect(chooseBestEconomicBuild({...player,techIds:[]},[tile],lookup)).toBeUndefined();
  });
});

it("stops developing salvage once the +10% arms bonus is reached", () => {
  const tile: StructurePlannerTile = { x: 10, y: 10, terrain: "LAND", ownerId: "ai", ownershipState: "SETTLED", resource: "PRECURSOR_SALVAGE" };
  const player: StructurePlannerPlayer = { id: "ai", points: 100, manpower: 1000, techIds: [RESOURCE_NETWORKS.PRECURSOR_SALVAGE.tech], ownedStructureCounts: { RECLAMATION_WORKS: 10 }, slotSupplyByResource: { FOOD: 10 }, slotDemandByResource: { FOOD: 0 } };
  expect(chooseBestEconomicBuild(player, [tile], new Map([["10,10", tile]]))).toBeUndefined();
});
