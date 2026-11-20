import type { Material } from "three";

// The scout drone's vision ring and radar sweep (client-map-3d-scout-drone-ground-fx.ts) are one
// flat disc at the height of the ground under the drone. Rising ground, trees or the coast inside
// the circle sat in front of it in the depth buffer and cut chunks out of the ring. This pulls the
// disc's depth toward the camera along each vertex's own view ray -- the screen position is
// unchanged, only the depth test moves -- so anything less than SCOUT_RING_DEPTH_PULL deep in front
// of it no longer hides it, while the drone itself (cruising ~1.95 above the ground) still draws
// over the disc. Compiled once; nothing changes per frame.

/** Scene units the ring's depth is pulled toward the camera; below the drone's cruise height. */
export const SCOUT_RING_DEPTH_PULL = 1.2;

export const SCOUT_RING_DEPTH_PULL_GLSL = [
  "#include <project_vertex>",
  `mvPosition.xyz *= max(0.0, 1.0 - ${SCOUT_RING_DEPTH_PULL.toFixed(2)} / max(length(mvPosition.xyz), 0.0001));`,
  "gl_Position = projectionMatrix * mvPosition;"
].join("\n");

export const applyScoutRingDepthPull = (material: Material): void => {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", SCOUT_RING_DEPTH_PULL_GLSL);
  };
  material.customProgramCacheKey = () => "scout-ring-depth-pull";
};
