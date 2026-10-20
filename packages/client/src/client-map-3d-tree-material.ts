// Shared material for the hand-built tree models (client-map-3d-tree-models.ts):
// vertex-coloured, matte, multiplied by the per-instance colour
// (client-map-3d-tree-variation.ts), with two shader additions:
//   wind  -- every tree bends gently in one shared breeze, weighted by the
//            geometry's aTreeSway (roots still, crown moving) and slowly
//            gusting. Each tree's phase comes from its instance yaw, which is
//            hashed from its WORLD tile (stable across terrain rebuilds), not
//            from its scene position (which shifts whenever the scene origin
//            re-anchors -- that would make every tree twitch on a rebuild).
//            Driven by a time uniform in the shader, never baked into instance
//            matrices: rebuildVisibleTerrain() also fires on camera pans, so
//            anything sampled there jumps on every pan.
//   rim   -- leaves and needles (aTreeFoliage) pick up a soft light along
//            their silhouette, so canopies read as soft, light-catching masses
//            against the ground instead of dark cut-outs.
// The shadow pass doesn't sway (the storm-clip depth material replaces it);
// at a sway of ~1/100 tile that mismatch is invisible.
import { DoubleSide, FrontSide, MeshStandardMaterial, type InstancedMesh, type IUniform } from "three";
import { markUnexploredStormClip } from "./client-map-3d-unexplored-storm/client-map-3d-unexplored-storm-clip.js";

// Breeze direction in world space (x, z), and how far a crown moves.
const WIND_X = 0.8;
const WIND_Z = 0.6;
const WIND_AMPLITUDE = 0.013;
const RIM_STRENGTH = 0.2;

const windTime: IUniform<number> = { value: 0 };

const VERTEX_DECL = `
uniform float uTreeWindTime;
attribute float aTreeSway;
attribute float aTreeFoliage;
varying float vTreeFoliage;
`;

// The breeze is a world-space push, turned into the instance's local frame
// (its yaw is column 0 of the instance matrix) so every tree leans the same way.
const VERTEX_WIND = `
vTreeFoliage = aTreeFoliage;
#ifdef USE_INSTANCING
{
  vec2 treeAxis = normalize(vec2(instanceMatrix[0].x, instanceMatrix[0].z) + vec2(1e-5, 0.0));
  float treePhase = atan(treeAxis.y, treeAxis.x);
  float treeGust = 0.55 + 0.45 * sin(uTreeWindTime * 0.31 + treePhase * 0.4);
  float treePush = (0.6 + 0.4 * sin(uTreeWindTime * 1.7 + treePhase)) * treeGust * aTreeSway * ${WIND_AMPLITUDE.toFixed(4)};
  float treeFlutter = sin(uTreeWindTime * 3.1 + treePhase * 2.0 + position.y * 9.0) * aTreeFoliage * aTreeSway * ${(WIND_AMPLITUDE * 0.25).toFixed(4)};
  vec2 treeWorld = vec2(${WIND_X.toFixed(2)}, ${WIND_Z.toFixed(2)}) * (treePush + treeFlutter);
  transformed.x += treeAxis.x * treeWorld.x + treeAxis.y * treeWorld.y;
  transformed.z += -treeAxis.y * treeWorld.x + treeAxis.x * treeWorld.y;
}
#endif
`;

const FRAGMENT_RIM = `
{
  float treeRim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
  totalEmissiveRadiance += diffuseColor.rgb * treeRim * ${RIM_STRENGTH.toFixed(2)} * vTreeFoliage;
}
`;

const replaceInclude = (source: string, include: string, code: string): string => {
  if (!source.includes(include)) throw new Error(`tree material: shader has no ${include}`);
  return source.replace(include, `${include}\n${code}`);
};

/** `doubleSided`: for thin, open geometry (palm fronds) seen from both sides. */
export const createTreeMaterial = (options: { readonly doubleSided?: boolean } = {}): MeshStandardMaterial => {
  const material = new MeshStandardMaterial({
    color: "#ffffff",
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    side: options.doubleSided ? DoubleSide : FrontSide
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTreeWindTime = windTime;
    shader.vertexShader = replaceInclude(shader.vertexShader, "#include <common>", VERTEX_DECL);
    shader.vertexShader = replaceInclude(shader.vertexShader, "#include <begin_vertex>", VERTEX_WIND);
    shader.fragmentShader = replaceInclude(shader.fragmentShader, "#include <common>", "varying float vTreeFoliage;");
    shader.fragmentShader = replaceInclude(shader.fragmentShader, "#include <emissivemap_fragment>", FRAGMENT_RIM);
  };
  material.customProgramCacheKey = () => "tree-wind-rim";
  return markUnexploredStormClip(material);
};

/** Advances the shared breeze clock whenever `mesh` is drawn. */
export const driveTreeWind = (mesh: InstancedMesh): void => {
  mesh.onBeforeRender = () => {
    windTime.value = performance.now() / 1000;
  };
};
