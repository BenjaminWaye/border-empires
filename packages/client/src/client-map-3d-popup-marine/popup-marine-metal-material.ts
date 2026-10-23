// Bare-metal + glow shading for marine models that carry a per-vertex
// surface mask (the titanium war-walker -- see
// bake-popup-marine-titanium-model.py's "surface classes"). The bake reads
// Meshy's texture once and writes `_MASK` (x = bare titanium, y = crystal
// glow); three's GLTFLoader keeps that custom attribute as `_mask`.
//
// Without the mask, the whole walker would be team paint x greyscale like
// the infantry, and titanium would read as just another colour. With it,
// bare titanium renders as real metal (its own champagne grey, nearly fully
// metallic and fairly smooth, reflecting the shared building environment
// map), the faction panels stay painted in the team colour, and the cyan
// crystal lenses glow. A hint of the team colour is kept in the metal so a
// side still reads at battle zoom, together with the panels and the
// occlusion silhouette.
import { Color, type MeshStandardMaterial } from "three";

// Champagne grey of the walker's titanium in Meshy's texture.
const TITANIUM = new Color("#d4cdbd");
// Cyan of the crystal lenses (lore: crystal is usable aether).
const CRYSTAL_GLOW = new Color("#5ef2ff").multiplyScalar(1.6);
// How much of the team colour tints the bare metal: enough that a walker
// reads as its side's blue- or red-steel at battle zoom (checked in
// PopupMarineSkirmish), not so much that it stops reading as titanium.
const TEAM_TINT_IN_METAL = 0.4;
const METAL_METALNESS = 0.9;
const METAL_ROUGHNESS = 0.3;

export const MARINE_SURFACE_MASK_ATTRIBUTE = "_mask";

/** Patches a marine's standard material to honour the `_mask` attribute. A
 * geometry without that attribute reads it as zero and renders unchanged. */
export const applySurfaceMask = (material: MeshStandardMaterial): void => {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTitanium = { value: TITANIUM };
    shader.uniforms.uCrystalGlow = { value: CRYSTAL_GLOW };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nattribute vec3 ${MARINE_SURFACE_MASK_ATTRIBUTE};\nvarying vec3 vSurfaceMask;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\nvSurfaceMask = ${MARINE_SURFACE_MASK_ATTRIBUTE};`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSurfaceMask;\nuniform vec3 uTitanium;\nuniform vec3 uCrystalGlow;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uTitanium * mix(vec3(1.0), diffuse, ${TEAM_TINT_IN_METAL.toFixed(2)}), vSurfaceMask.x);`
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, ${METAL_METALNESS.toFixed(2)}, vSurfaceMask.x);`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, ${METAL_ROUGHNESS.toFixed(2)}, vSurfaceMask.x);`
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += uCrystalGlow * vSurfaceMask.y;");
  };
  material.customProgramCacheKey = () => "popup-marine-surface-mask";
};
