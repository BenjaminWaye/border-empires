import type { Scene, WebGLRenderer } from "three";
import { createAtmosphere, type AtmosphereResources } from "../../../client/src/client-map-3d-atmosphere.js";

/** Asset previews have no visibility mask. The default unexplored sheet
 * otherwise covers every prop below y=0.27, including the fish basins. */
export const createResourcePreviewAtmosphere = (scene: Scene, renderer?: WebGLRenderer): AtmosphereResources => {
  const atmosphere = createAtmosphere(scene, renderer);
  atmosphere.unexploredStorm.mesh.visible = false;
  return atmosphere;
};
