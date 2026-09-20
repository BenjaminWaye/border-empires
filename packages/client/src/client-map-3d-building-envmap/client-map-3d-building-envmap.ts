import type { MeshStandardMaterial, Texture } from "three";

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
  if (envMap && !mat.envMap) mat.envMap = envMap;
};
