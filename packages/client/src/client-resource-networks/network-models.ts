import { NETWORK_VARIANTS, type NetworkVariant } from "./network-variants.js";
import { isNetworkResource, type NetworkResource } from "@border-empires/shared";
import { MeshStandardMaterial, type Scene, type Texture } from "three";
import { createDistrictGeometryFromModel, type DistrictGeometry } from "../client-town-district/district-geometry.js";
import { createModelOverlay, type ModelOverlay } from "../client-town-district/model-overlay.js";
import { createDistrictMaterials } from "../client-town-district/district-materials.js";
import { buildNetworkSite } from "./network-sites.js";
import { buildNetworkInstallation } from "./network-installations.js";

/** 3D and SVG exports share the town's production kit, palette and model source. */
export const createNetworkGeometry = (resource: NetworkResource, developed: boolean, variant: NetworkVariant = 0): DistrictGeometry =>
  createDistrictGeometryFromModel(t => developed ? buildNetworkInstallation(t, resource) : buildNetworkSite(t, resource, variant));

type NetworkModelKey = `${NetworkResource}:${NetworkVariant}`;
type NetworkPlacement = Parameters<ModelOverlay<NetworkResource>["add"]>[0] & {readonly variant?: NetworkVariant};
export type NetworkOverlay = Omit<ModelOverlay<NetworkResource>, "add"> & {readonly add:(placement:NetworkPlacement)=>void};

export const createNetworkOverlay = (scene: Scene, maxTiles: number, developed: boolean, envMap?: Texture): NetworkOverlay => {
  // Fifteen finite raw-site kinds, allocated lazily and capped by visible tiles.
  const overlay = createModelOverlay<NetworkModelKey>(scene, maxTiles,
    key => {
      const [resource,value] = (key ?? "").split(":");
      if (!isNetworkResource(resource)) throw new Error("A frontier model requires a resource kind");
      const variant = NETWORK_VARIANTS.find(candidate => String(candidate) === value) ?? 0;
      return createNetworkGeometry(resource, developed, variant);
    }, envMap, 0, environment => {
      const materials = createDistrictMaterials(environment);
      if (materials.layers.body instanceof MeshStandardMaterial) {
        materials.layers.body.flatShading = false;
        materials.layers.body.roughness = 0.9;
      }
      if (developed && materials.layers.glass instanceof MeshStandardMaterial) {
        materials.layers.glass.transparent = true;
        materials.layers.glass.opacity = 0.3;
        materials.layers.glass.depthWrite = false;
        materials.layers.glass.metalness = 0.15;
      }
      return materials;
    });
  return {...overlay, add: placement => {
    if (!placement.kind) throw new Error("A frontier placement requires a resource kind");
    const variant = developed ? 0 : placement.variant ?? 0;
    overlay.add({...placement,kind:`${placement.kind}:${variant}`});
  }};
};
