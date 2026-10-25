import {
  AdditiveBlending, MeshBasicMaterial, MeshDepthMaterial, MeshStandardMaterial, RGBADepthPacking,
  type Texture
} from "three";
import { applyTownSpin, applyTownSteam } from "../client-map-3d-town-overlay/town-animation-shaders.js";
import { applyBuildingEnvMap } from "../client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { applyMarbleFinish } from "../client-map-3d-muster-banner/muster-banner-marble-material.js";
import { TOWN_PLINTH_LEDGES } from "../client-map-3d-town-overlay/town-parts.js";
import type { DistrictLayer } from "./district-geometry.js";

type DistrictMaterial = MeshStandardMaterial | MeshBasicMaterial | MeshDepthMaterial;

// Instance state = [operational/animation enabled, construction cut height].
// Shared materials stay shared; dormant sites never dim another building.
const instanceState = (material: DistrictMaterial, layer: DistrictLayer | "depth"): void => {
  const hook = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    hook.call(material, shader, renderer);
    shader.vertexShader = "attribute vec2 districtState;\nvarying vec2 vDistrictState;\nvarying float vDistrictHeight;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader
      .replaceAll("uTownTime * animA.w", "uTownTime * animA.w * districtState.x")
      .replace("#include <project_vertex>", "vDistrictState = districtState; vDistrictHeight = transformed.y;\n#include <project_vertex>");
    shader.fragmentShader = "varying vec2 vDistrictState;\nvarying float vDistrictHeight;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>",
      "#include <clipping_planes_fragment>\nif (vDistrictHeight > vDistrictState.y) discard;");
    if (layer === "glow" || layer === "halo") shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= mix(0.18, 1.0, vDistrictState.x);");
    if (layer === "steam") shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vDistrictState.x;");
  };
  material.customProgramCacheKey = () => `${key}-district-${layer}`;
};

export const createDistrictMaterials = (envMap?: Texture): {
  readonly layers: Readonly<Record<DistrictLayer, MeshStandardMaterial | MeshBasicMaterial>>;
  readonly depth: MeshDepthMaterial;
  readonly dispose: () => void;
} => {
  const solid = (roughness: number, metalness: number): MeshStandardMaterial => {
    const material = new MeshStandardMaterial({ vertexColors: true, roughness, metalness, flatShading: true });
    applyBuildingEnvMap(material, envMap);
    return material;
  };
  const plinth = solid(0.22, 0);
  applyMarbleFinish(plinth, TOWN_PLINTH_LEDGES);
  const layers = {
    body: solid(0.82, 0.02), metal: solid(0.45, 0.7), glass: solid(0.2, 0.85), plinth,
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    halo: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: 0.32,
      blending: AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    steam: new MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.6, roughness: 1, depthWrite: false })
  };
  for (const [key, material] of Object.entries(layers)) {
    if (key === "steam") applyTownSteam(material);
    else if (key !== "plinth") applyTownSpin(material, key === "glow" || key === "halo");
  }
  for (const layer of ["body", "metal", "glass", "plinth", "glow", "halo", "steam"] as const) instanceState(layers[layer], layer);
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  applyTownSpin(depth);
  instanceState(depth, "depth");
  return { layers, depth, dispose: () => { for (const material of Object.values(layers)) material.dispose(); depth.dispose(); } };
};
