import { MeshDepthMaterial, RGBADepthPacking, type IUniform, type Material, type Object3D, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { STORM_FIELD_GLSL } from "./client-map-3d-unexplored-storm-field-glsl.js";

// The storm is a flat sheet just above flat ground (UNEXPLORED_STORM_Y), so
// anything taller on the fog's first ring -- trees, palms, mountain
// massifs, hill domes -- would rise straight through the cloud and over the
// brass edge. Flagged materials are fitted to the same rounded contour the
// storm draws:
//   "feature" (trees, palms, mountains -- instanced): each instance is kept
//     or hidden whole by where it stands. One whose base is under the cloud
//     (or within a whisker of the brass line) is dropped -- as the cloud's
//     edge drifts over it, it's swallowed; one standing in the glimpse is
//     drawn whole. "Near" is about a tenth of a tile, a canopy's reach, so no
//     tree's crown spills over the line. Cutting them at the line instead left
//     sliced-open trees and box-cut mountains: a flat sheet can't hide the
//     cut face of something tall.
//   "ground" (heightfield, hill domes, skirts): never cut -- through the
//     clear strip just inside the brass line you see the ground a little
//     further out (parallax under the sheet), so a cut there shows the void
//     as a dark seam. Instead its vertices are pressed down to just under
//     the sheet as they near the contour: hills slope down to meet the brass
//     line, and everything past it lies under the opaque cloud.
// Tiles in sight and remembered tiles are never touched.

const STORM_CLIP_FLAG = "unexploredStormClip";

export type StormClipKind = "feature" | "ground";

export type StormClipUniforms = {
  readonly uStormClipMask: IUniform;
  readonly uStormClipMaskMin: IUniform;
  readonly uStormClipMaskSize: IUniform;
  readonly uStormClipOrigin: IUniform;
  readonly uStormClipTime: IUniform;
  /** World y of the storm sheet (UNEXPLORED_STORM_Y). */
  readonly uStormClipPlaneY: IUniform;
};

/** Flags a material to be fitted under the unexplored storm. */
export const markUnexploredStormClip = <T extends Material>(material: T, kind: StormClipKind = "feature"): T => {
  material.userData[STORM_CLIP_FLAG] = kind;
  return material;
};

// Vertex stage only. stormClipField returns the storm's contour field s
// (soft field + edge wobble + clearance; > 1 on deep fog, -1 on fully
// explored tiles).
const CLIP_DECL = `
uniform sampler2D uStormClipMask;
uniform vec2 uStormClipMaskMin;
uniform vec2 uStormClipMaskSize;
uniform vec2 uStormClipOrigin;
uniform float uStormClipTime;
uniform float uStormClipPlaneY;
${STORM_FIELD_GLSL}
float stormClipField(vec2 sceneXZ) {
  vec2 uvTile = (floor(sceneXZ) + 0.5 - uStormClipMaskMin) / uStormClipMaskSize;
  if (uvTile.x < 0.0 || uvTile.y < 0.0 || uvTile.x > 1.0 || uvTile.y > 1.0) return -1.0;
  vec4 m = texture2D(uStormClipMask, uvTile);
  if (m.r < 0.002) return -1.0; // fully explored; a tile still rolling back stays fitted under the cloud
  if (m.g > 0.99) return 2.0;
  vec2 uv = (sceneXZ - uStormClipMaskMin) / uStormClipMaskSize;
  float s = stormSoftField(uStormClipMask, uv, uStormClipMaskSize) + stormEdgeNoise(sceneXZ + uStormClipOrigin, uStormClipTime) * 0.1;
  return stormClearanceField(s, stormExploredDistance(uStormClipMask, uStormClipMaskMin, uStormClipMaskSize, sceneXZ));
}
// How unexplored the tiles a tile-edge vertex sits on are (max R of the 2 or
// 4 tiles sharing it); 0 off tile edges, or with no unexplored tile there.
float stormClipEdgeUnexplored(vec2 sceneXZ) {
  vec2 edgeDist = abs(fract(sceneXZ + 0.5) - 0.5);
  if (min(edgeDist.x, edgeDist.y) > 0.01) return 0.0;
  float u = 0.0;
  for (int j = -1; j <= 1; j += 2) {
    for (int i = -1; i <= 1; i += 2) {
      vec2 uv = (floor(sceneXZ + vec2(float(i), float(j)) * 0.02) + 0.5 - uStormClipMaskMin) / uStormClipMaskSize;
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) continue;
      u = max(u, texture2D(uStormClipMask, uv).r);
    }
  }
  return u;
}
`;

// Collapses the whole instance to one point outside the clip volume. Past
// the explored side the contour field climbs ~1.2 per tile (the clearance
// ramp), so 0.12 below STORM_EDGE is ~0.1 tile inside the line.
const FEATURE_VERTEX = `
#ifdef USE_INSTANCING
{
  vec2 stormOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
  if (stormClipField(stormOrigin) > STORM_EDGE - 0.12) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
}
#endif
`;

// Ground meshes are unrotated and unscaled, so a world-y shift is a local
// one. Pressed 0.04 under the sheet: much closer and the brass line
// depth-fights the ground beneath it at a distance. Fully pressed 0.05
// inside the contour (about 0.04 tile before the brass line). The clearance
// term makes s 0 on explored land's edge, so explored ground inside a tile
// never moves, and it eases with a tile's exploredness during a reveal --
// the pressing lets go only as the cloud actually parts.
//
// That alone leaves the main grid poking through: it only has vertices at
// tile corners, and a fog-ring tile's corners on the explored side sit at
// s ~ 0, so they never press. Mountain ground there stands at ~0.3 (over the
// sheet), so the triangle from that corner into the fog stays above the
// sheet for most of its length -- a straight-edged wedge of bare ground
// through the storm and over the brass line. So any tile-edge vertex that
// touches an unexplored tile is pressed too. Those vertices are shared with
// the explored tile across the edge, so its fog-side edge dips with them:
// by ~0.1 on a mountain (under its massif), at most ~0.025 on the highest
// flat land (tundra/snow), and not at all on grass, sand and the like. It
// holds until that tile is ~80% rolled back, by which point the clearance
// has already pulled the cloud off it. Ground already under the press level
// skips the edge lookup -- it has nothing to press.
const GROUND_VERTEX = `
{
  vec3 stormGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  float stormPressLevel = uStormClipPlaneY - 0.04;
  float stormGroundS = stormClipField(stormGroundWorld.xz);
  float stormPress = stormGroundS < 0.0 ? 0.0 : smoothstep(STORM_EDGE - 0.12, STORM_EDGE - 0.05, stormGroundS);
  if (stormGroundWorld.y > stormPressLevel) stormPress = max(stormPress, smoothstep(0.0, 0.2, stormClipEdgeUnexplored(stormGroundWorld.xz)));
  transformed.y -= stormPress * max(0.0, stormGroundWorld.y - stormPressLevel);
}
`;

const injectAfter = (source: string, include: string, code: string): string => {
  if (!source.includes(include)) throw new Error(`unexplored storm clip: shader has no ${include}`);
  return source.replace(include, `${include}\n${code}`);
};

/** Patches one material (keeping any onBeforeCompile it already has). */
export const applyUnexploredStormClip = (material: Material, uniforms: StormClipUniforms, kind: StormClipKind = "feature"): void => {
  const previousOnBeforeCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer): void => {
    previousOnBeforeCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = injectAfter(shader.vertexShader, "#include <common>", CLIP_DECL);
    if (kind === "feature") {
      shader.vertexShader = injectAfter(shader.vertexShader, "#include <project_vertex>", FEATURE_VERTEX);
      return;
    }
    shader.vertexShader = injectAfter(shader.vertexShader, "#include <begin_vertex>", GROUND_VERTEX);
  };
  material.customProgramCacheKey = (): string => `${previousCacheKey.call(material)}|unexploredStormClip:${kind}`;
  material.needsUpdate = true;
};

/**
 * Patches every flagged material in the scene not patched yet, and gives each
 * shadow-casting mesh that uses one a matching shadow-depth material -- the
 * default one would still cast the unpressed hills and clipped trees, and
 * the shadow of a hill's old top lands as a dark band on the pressed ground.
 * Cheap to call on each terrain rebuild: layers create their meshes once, so
 * after the first pass this is just a scene walk.
 */
export const applyUnexploredStormClipToScene = (root: Object3D, uniforms: StormClipUniforms, patched: WeakSet<object>): void => {
  root.traverse((object) => {
    const material = (object as Object3D & { material?: Material | Material[] }).material;
    if (!material) return;
    let shadowKind: StormClipKind | undefined;
    for (const entry of Array.isArray(material) ? material : [material]) {
      const kind = entry.userData[STORM_CLIP_FLAG] as StormClipKind | undefined;
      if (kind !== "feature" && kind !== "ground") continue;
      shadowKind = shadowKind ?? kind;
      if (patched.has(entry)) continue;
      patched.add(entry);
      applyUnexploredStormClip(entry, uniforms, kind);
    }
    if (!shadowKind || !object.castShadow || patched.has(object)) return;
    patched.add(object);
    const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
    applyUnexploredStormClip(depth, uniforms, shadowKind);
    object.customDepthMaterial = depth;
  });
};
