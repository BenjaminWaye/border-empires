// Bare-metal + glow shading for marine models that carry a per-vertex
// surface mask (every weapons factory's specialist -- see
// packages/client/scripts/bake_marine_surface.py). The bake reads each
// model's Meshy texture once and writes:
//   _MASK.x = bare metal, _MASK.y = glow  (three's GLTFLoader keeps the
//             custom attribute as `_mask`)
//   COLOR_0 = on metal/glow vertices, that surface's own sampled colour
//             (titanium, iron, brass, cyan crystal, orange Umbrite...); on
//             painted vertices, the usual greyscale team-colour share.
//
// So one shader serves every model: bare metal renders as real metal in its
// own colour (nearly fully metallic and fairly smooth, reflecting the
// shared building environment map), faction panels stay painted in the team
// colour, and glowing parts emit their own colour. A hint of the team colour
// is kept in the metal so a side still reads at battle zoom, together with
// the panels and the occlusion silhouette.
import type { MeshStandardMaterial } from "three";

// How much of the team colour tints the bare metal: enough that a unit
// reads as its side's at battle zoom (checked in PopupMarineSkirmish), not
// so much that it stops reading as bare metal.
const TEAM_TINT_IN_METAL = 0.4;
const METAL_METALNESS = 0.9;
const METAL_ROUGHNESS = 0.3;
// Emission strength of glowing parts, relative to their sampled colour.
const GLOW_STRENGTH = 1.6;

export const MARINE_SURFACE_MASK_ATTRIBUTE = "_mask";

/** Patches a marine's standard (vertexColors) material to honour the
 * `_mask` attribute. A geometry without it reads zero and renders unchanged. */
export const applySurfaceMask = (material: MeshStandardMaterial): void => {
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
      );
  };
  material.customProgramCacheKey = () => "popup-marine-surface-mask";
};
