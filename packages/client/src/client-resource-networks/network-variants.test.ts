// @vitest-environment happy-dom
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BufferAttribute, InstancedMesh, Scene } from "three";
import { NETWORK_RESOURCES, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { createNetworkGeometry, createNetworkOverlay } from "./network-models.js";
import { NETWORK_VARIANTS, networkDepositFilename, networkVariantForTile } from "./network-variants.js";
import { resourceOverlayForTile } from "../client-map-render/client-map-render-resource-overlays.js";
import { createResourceOverlay } from "../client-map-3d-resource-overlay.js";

describe("three authored resource deposit variants",()=>{
  for(const resource of NETWORK_RESOURCES)it(`${resource} has three distinct complete meshes and matching 2D choices`,()=>{
    const fingerprints=new Set<string>();
    for(const variant of NETWORK_VARIANTS){
      const model=createNetworkGeometry(resource,false,variant),hash=createHash("sha256");
      for(const geometry of Object.values(model.layers)){
        const positions=geometry.getAttribute("position");
        if(positions instanceof BufferAttribute){
          hash.update(new Uint8Array(positions.array.buffer,positions.array.byteOffset,positions.array.byteLength));
          for(let i=0;i<positions.count;i++){
            expect(Number.isFinite(positions.getY(i))).toBe(true);
            expect(Math.abs(positions.getX(i))).toBeLessThan(0.5);
            expect(Math.abs(positions.getZ(i))).toBeLessThan(0.5);
          }
        }
        geometry.dispose();
      }
      fingerprints.add(hash.digest("hex"));
    }
    expect(fingerprints.size).toBe(3);
    const choices=new Set<number>();
    for(let x=0;x<16;x++){
      const variant=networkVariantForTile(x,7);choices.add(variant);
      expect(resourceOverlayForTile({x,y:7,terrain:"LAND",resource})?.src).toContain(`/overlays/${networkDepositFilename(resource,variant)}?`);
    }
    expect(choices.size).toBe(3);
  });
  it("keeps tile selection unchanged at world seams and through camera-relative placement",()=>{
    expect(networkVariantForTile(-1,-1)).toBe(networkVariantForTile(WORLD_WIDTH-1,WORLD_HEIGHT-1));
    const scene=new Scene(),overlay=createResourceOverlay(scene,4);
    const resource="CONDUCTIVE_MINERALS",variant=networkVariantForTile(7,9);
    const active=()=>scene.children.filter(child=>child instanceof InstancedMesh&&child.count>0&&child.name.includes(resource)).map(child=>child.name).sort();
    overlay.addInstance(7,9,0,resource,7,9);overlay.commit();const first=active();
    expect(first.length).toBeGreaterThan(0);expect(first.every(name=>name.includes(`${resource}:${variant}`))).toBe(true);
    overlay.clear();overlay.addInstance(7-WORLD_WIDTH,9-WORLD_HEIGHT,0,resource,7,9);overlay.commit();
    expect(active()).toEqual(first);overlay.dispose();
  });
  it("allocates only the fifteen finite raw models and releases all instance buffers",()=>{
    const scene=new Scene(),overlay=createNetworkOverlay(scene,15,false);
    for(const resource of NETWORK_RESOURCES)for(const variant of NETWORK_VARIANTS)overlay.add({x:variant,y:0,z:0,kind:resource,variant,operational:true,foundation:false});
    overlay.commit();expect(overlay.diagnostics.instances).toBe(15);expect(overlay.diagnostics.slots).toBe(15);expect(overlay.diagnostics.overflow).toBe(0);
    overlay.dispose();expect(scene.children).toHaveLength(0);
  });
});
