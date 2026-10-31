import { createRelayBeaconOverlay } from "../client-map-3d-relay-beacon-overlay.js";
import { createAmbaricTransformerOverlay } from "../client-map-3d-ambaric-transformer-overlay.js";
import { Box3, InstancedMesh, Mesh, type Scene, type Texture } from "three";
import { createDistrictOverlay } from "../client-town-district/district-overlay.js";
import { createFortOverlay } from "../client-map-3d-fort-overlay.js";
import { createSiegeTowerOverlay } from "../client-map-3d-siege-tower-overlay.js";
import { createUmbriteExtractionRigOverlay } from "../client-map-3d-umbrite-extraction-rig.js";
import { createStructureOverlay } from "../client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";
import { createContactShadowOverlay } from "../client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import { structureOverlayRoute } from "../client-structure-info-catalog/structure-overlay-route.js";
import type { StructureInfoKey } from "../client-map-display.js";

export type StructureReviewModel = { readonly bounds: Box3; readonly update: (now: number) => void; readonly dispose: () => void };
export const createStructureReviewModel = (scene: Scene, kind: StructureInfoKey, envMap?: Texture, contactShadows = true, mineResource: "TITANIUM" | "GEMS" = "TITANIUM"): StructureReviewModel => {
  const before = new Set(scene.children);
  const route = structureOverlayRoute(kind);
  let update: (now: number) => void = () => {};
  let dispose: () => void;
  switch (route.family) {
    case "relay": {
      const model = createRelayBeaconOverlay(scene, 1, envMap);
      model.addInstance(0, 0, 0, 0, 0); model.commit();
      update = model.update; dispose = model.dispose; break;
    }
    case "aether-tower": {
      const model = createAmbaricTransformerOverlay(scene, 1, envMap);
      model.addInstance(0, 0, 0, 0, 0); model.commit();
      update = model.update; dispose = model.dispose; break;
    }
    case "district": {
      const model = createDistrictOverlay(scene, 1, envMap);
      model.add({ kind: route.kind, x: 0, z: 0, y: 0, foundation: true, operational: true }); model.commit();
      update = model.update; dispose = model.dispose; break;
    }
    case "fort": {
      const model = createFortOverlay(scene, 1, envMap);
      model.addInstance(0, 0, 0, route.kind, "CLOSED", 0, 0); model.commit();
      update = model.tick; dispose = model.dispose; break;
    }
    case "siege-tower": {
      const model = createSiegeTowerOverlay(scene, 1, () => "lens", envMap);
      model.addInstance(0, 0, 0, 100, 100, route.kind); model.commit();
      update = now => { model.update(now); }; dispose = model.dispose; break;
    }
    case "umbrite-rig": {
      const model = createUmbriteExtractionRigOverlay(scene, 1, envMap);
      model.addInstance(0, 0, 0, 100, 100); model.commit();
      dispose = model.dispose; break;
    }
    case "generic": {
      const shadows = contactShadows ? createContactShadowOverlay(scene, 1) : {
        clear: () => {}, addShadow: () => {}, commit: () => {}, dispose: () => {}
      };
      const model = createStructureOverlay(scene, 1, shadows, envMap);
      model.addInstance(0, 0, 0, route.kind, route.kind === "MINE" ? mineResource : undefined); model.commit(); shadows.commit();
      update = model.update; dispose = () => { model.dispose(); shadows.dispose(); }; break;
    }
  }
  const bounds = new Box3();
  for (const child of scene.children) {
    if (before.has(child)) continue;
    child.updateMatrixWorld(true);
    child.traverse(object => {
      if (!(object instanceof Mesh) || (object instanceof InstancedMesh && object.count === 0)) return;
      // Frame the physical building, excluding long translucent combat beams.
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.every(material => material.transparent)) return;
      bounds.union(new Box3().setFromObject(object));
    });
  }
  return { bounds, update, dispose };
};
