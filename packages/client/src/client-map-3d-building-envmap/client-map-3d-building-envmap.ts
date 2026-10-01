import type { Material, Mesh, MeshStandardMaterial, Object3D, Texture } from "three";
import { getLightingSettings } from "../client-lighting-tuner/client-lighting-tuner-settings.js";

// Shared one-liner for every structure/decoration overlay that builds its own
// InstancedMeshes directly instead of going through the shared
// client-map-3d-structure-builder.ts choke point (relay beacon, aether
// tower, resource deposits/rigs, forts, watchtowers, docks, resource-overlay
// piece props) -- each of those needed the exact same wiring
// client-map-3d-structure-builder.ts's makeSlot already does for the
// families that DO go through it. See client-map-3d-atmosphere.ts's
// AtmosphereResources doc comment for why this is given directly to each
// material's own `envMap` rather than to `scene.environment`.
export const applyBuildingEnvMap = (mat: MeshStandardMaterial, envMap: Texture | undefined): void => {
  if (!envMap) return;
  if (!mat.envMap) mat.envMap = envMap;
  // A material built after the lighting tuner moved the slider still needs to start at the tuned strength.
  if (mat.envMap === envMap) mat.envMapIntensity = getLightingSettings().envIntensity;
};

// Re-scales every material already wired to the building environment map.
// Only runs when the lighting tuner's slider moves, not per frame.
export const setBuildingEnvIntensity = (root: Object3D, envMap: Texture | undefined, intensity: number): void => {
  if (!envMap) return;
  root.traverse((object) => {
    const material = (object as Mesh).material as Material | Material[] | undefined;
    if (!material) return;
    for (const mat of Array.isArray(material) ? material : [material]) {
      const standard = mat as MeshStandardMaterial;
      if (standard.envMap === envMap) standard.envMapIntensity = intensity;
    }
  });
};
