import { describe, expect, it } from "vitest";
import { Scene, InstancedMesh, Box3 } from "three";
import { NETWORK_RESOURCES, RESOURCE_NETWORKS, networkBuildAction } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import { resourceBuildActions } from "../client-tile-action-logic/client-resource-build-actions.js";
import { structureTypeForTileAction, requiredTechForTileAction } from "../client-tile-action-support/client-tile-action-support.js";
import { presentTechLockedTileAction } from "../client-tile-action-support/client-tech-locked-tile-action.js";
import { createResourceOverlay } from "../client-map-3d-resource-overlay.js";
import { createStructureOverlay, isStructureHandledBy3D } from "../client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";
import { createContactShadowOverlay } from "../client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import { resolvedMapResource3D, shouldRenderRawResource } from "./network-resource-3d.js";
import type { Tile } from "../client-types.js";

for (const resource of NETWORK_RESOURCES) describe(resource, () => {
  const spec=RESOURCE_NETWORKS[resource];
  const tile: Tile={x:10,y:10,terrain:"LAND",ownerId:"p",ownershipState:"SETTLED",resource};
  it("offers a locked Manifest link, then dispatches the correct build with FOOD upkeep", () => {
    const state=createInitialState();state.me="p";
    state.resourceSlots={supply:{FOOD:5,TITANIUM:0,CRYSTAL:0,UMBRITE:0},demand:{FOOD:0,TITANIUM:0,CRYSTAL:0,UMBRITE:0}};
    const deps={structureCostText:()=>"120 manpower",buildDetailTextForAction:()=>"Develop this deposit",availability:(_type:string,ok:boolean,reason:string,cost:string):[boolean,string,string]=>[ok,reason,cost]};
    const locked=resourceBuildActions(state,tile,false,"",deps)[0]!;
    const shown=presentTechLockedTileAction(locked,state,requiredTechForTileAction);
    expect(shown?.disabled).toBe(true);expect(shown?.techLinkId).toBe(spec.tech);
    state.techIds=[spec.tech];
    const ready=resourceBuildActions(state,tile,false,"",deps)[0]!;
    expect(ready.disabled).toBe(false);
    expect(ready.cost).toContain("Upkeep:");expect(ready.cost).toContain("FOOD");
    expect(structureTypeForTileAction(ready.id)).toBe(spec.building);
    expect(ready.id).toBe(networkBuildAction(resource));
    expect(resourceBuildActions(state,tile,true,"",deps)[0]?.disabled).toBe(true);
  });
  it("renders actual instanced 3D geometry for the raw site and its building, then disposes it", () => {
    const scene=new Scene();const deposits=createResourceOverlay(scene,1);
    deposits.addInstance(0,0,0,resource,10,10);deposits.commit();
    const rawMeshes=scene.children.filter((child): child is InstancedMesh=>child instanceof InstancedMesh && child.count>0);
    expect(rawMeshes.length).toBeGreaterThan(0);
    const rawBounds=new Box3().setFromObject(scene);expect(rawBounds.isEmpty()).toBe(false);
    deposits.dispose();expect(scene.children).toHaveLength(0);
    const shadows=createContactShadowOverlay(scene,2);const buildings=createStructureOverlay(scene,1,shadows);
    expect(isStructureHandledBy3D(spec.building)).toBe(true);
    buildings.addInstance(0,0,0,spec.building);buildings.commit();
    expect(scene.children.some(child=>child instanceof InstancedMesh && child.count>0)).toBe(true);
    buildings.dispose();shadows.dispose();expect(scene.children).toHaveLength(0);
    expect(resolvedMapResource3D(10,10,"LAND",tile,false,"GRASS",false)).toBe(resource);
    expect(shouldRenderRawResource(resource,tile)).toBe(true);
    expect(shouldRenderRawResource(resource,{...tile,economicStructure:{ownerId:"p",type:spec.building,status:"active"}})).toBe(false);
  });
});
