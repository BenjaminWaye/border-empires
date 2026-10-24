// The battle marine's material: the baked vertex paint (COLOR_0, greyscale
// "how much team colour this part shows") times the side's tint, which every
// soldier model shares -- plus, for a model whose bake wrote a surface mask
// (the heavy armour, bake-popup-marine-heavy-model.py via
// bake_marine_surface.py), bare metal and glowing parts:
//   _MASK.x = bare metal, _MASK.y = glow  (three's GLTFLoader keeps the
//             custom attribute as `_mask`)
//   COLOR_0 = on metal/glow vertices, that surface's own sampled colour
//             (titanium edging, orange visor); elsewhere the usual greyscale
//             team-colour share.
//
// Bare metal renders as real metal in its own colour (nearly fully metallic,
// fairly smooth) with a hint of the team colour so a side still reads at
// battle zoom, reflecting the shared building environment map -- and only
// the metal reflects it, so the painted plates are lit exactly like the
// standard marine's. Glowing parts emit their own colour.
import { MeshStandardMaterial, type Texture } from "three";
import { getLightingSettings } from "../client-lighting-tuner/client-lighting-tuner-settings.js";

// How much of the team colour tints the bare metal: enough that a soldier
// reads as its side's at battle zoom, not so much that it stops reading as
// bare metal.
const TEAM_TINT_IN_METAL = 0.3;
const METAL_METALNESS = 0.9;
const METAL_ROUGHNESS = 0.3;
// Emission strength of glowing parts, relative to their sampled colour.
const GLOW_STRENGTH = 1.6;

export const MARINE_SURFACE_MASK_ATTRIBUTE = "_mask";

const applySurfaceMask = (material: MeshStandardMaterial): void => {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nattribute vec3 ${MARINE_SURFACE_MASK_ATTRIBUTE};\nvarying vec3 vSurfaceMask;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\nvSurfaceMask = ${MARINE_SURFACE_MASK_ATTRIBUTE};`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSurfaceMask;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vColor.rgb * mix(vec3(1.0), diffuse, ${TEAM_TINT_IN_METAL.toFixed(2)}), vSurfaceMask.x);`
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, ${METAL_METALNESS.toFixed(2)}, vSurfaceMask.x);`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, ${METAL_ROUGHNESS.toFixed(2)}, vSurfaceMask.x);`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * ${GLOW_STRENGTH.toFixed(2)} * vSurfaceMask.y;`
      )
      // Environment light only on the bare metal, not the painted plates.
      .replace("#include <lights_fragment_maps>", "#include <lights_fragment_maps>\niblIrradiance *= vSurfaceMask.x;\nradiance *= vSurfaceMask.x;");
  };
  material.customProgramCacheKey = () => "popup-marine-surface-mask";
};

/** A marine's material. `surfaceMasked` for a model carrying the `_mask`
 * attribute (the heavy armour); `envMap` is what its bare metal reflects. */
export const createMarineMaterial = (surfaceMasked: boolean, envMap?: Texture): MeshStandardMaterial => {
  // vertexColors:true multiplies the per-region greyscale painted by the
  // bake against this material's own .color (the attacker/defender tint,
  // set per marine per frame) and the scene's lighting.
  const material = new MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.4, metalness: 0.4 });
  if (!surfaceMasked) return material;
  applySurfaceMask(material);
  if (envMap) {
    material.envMap = envMap;
    material.envMapIntensity = getLightingSettings().envIntensity;
  }
  return material;
};
