import { NETWORK_RESOURCES, RESOURCE_NETWORKS, WORLD_WIDTH, WORLD_HEIGHT, type NetworkResource } from "@border-empires/shared";
import { MeshStandardMaterial, type Scene, type Texture } from "three";
import { createDistrictGeometryFromModel, type DistrictGeometry } from "../client-town-district/district-geometry.js";
import { createModelOverlay, type ModelOverlay } from "../client-town-district/model-overlay.js";
import { createDistrictMaterials } from "../client-town-district/district-materials.js";
import { buildNetworkSite } from "./network-sites.js";
import { buildNetworkInstallation } from "./network-installations.js";

/** 3D and SVG exports share the town's production kit, palette and model source. */
export const createNetworkGeometry = (resource: NetworkResource, developed: boolean): DistrictGeometry =>
  createDistrictGeometryFromModel(t => developed ? buildNetworkInstallation(t, resource) : buildNetworkSite(t, resource));

export const createNetworkOverlay = (scene: Scene, maxTiles: number, developed: boolean, envMap?: Texture): ModelOverlay<NetworkResource> => {
  // Sparse sites cannot consume a visible-terrain-sized buffer per model.
  // The finite catalogue grows buffers only when used, up to four wrapped maps.
  const scale = WORLD_WIDTH * WORLD_HEIGHT / (640 * 320);
  const budget = NETWORK_RESOURCES.reduce((sum, resource) => sum + RESOURCE_NETWORKS[resource].sitesPerStandardMap, 0);
  return createModelOverlay(scene, Math.min(maxTiles, Math.max(32, Math.ceil(budget * scale) * 4)),
    resource => {
      if (!resource) throw new Error("A frontier model requires a resource kind");
      return createNetworkGeometry(resource, developed);
    }, envMap, 0, environment => {
      const materials = createDistrictMaterials(environment);
      if (developed && materials.layers.glass instanceof MeshStandardMaterial) {
        materials.layers.glass.transparent = true;
        materials.layers.glass.opacity = 0.3;
        materials.layers.glass.depthWrite = false;
        materials.layers.glass.metalness = 0.15;
      }
      return materials;
    });
};
