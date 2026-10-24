// The battle marine's material, with an optional titanium trim: an empire
// that owns a Titanium Weapons Factory sends its soldiers with polished
// titanium on their shoulder plates and chest (popup-marine-gear.ts).
//
// No separate model: the marine's baked vertex paint
// (bake-popup-marine-titan-model.py's REGION_VALUES) gives every bone region
// its own grey, exported as linear COLOR_0:
//   shoulder plates 0.888  -> trimmed, all round (they are pauldrons)
//   chest (Spine02) 0.831  -> trimmed on the front of the torso only
//   backpack 0.791         -> never trimmed (the bake calls this group
//                             "neck", but every vertex of it sits behind the
//                             body: it is the pack, not armour)
//   upper arms 0.571 and everything darker -> never trimmed
// Front/back comes from the bind-pose position (the model faces +Z), so the
// split holds however the soldier is animated. A per-marine uniform switches
// the trim on, so trimmed and plain marines share one material setup and one
// model.
//
// The trimmed plates render as titanium (its own champagne grey, nearly fully
// metallic, fairly smooth) carrying a hint of the team colour so the side
// still reads at battle zoom; everything else keeps the team paint. Metal
// needs something to reflect, so trimmed marines get the shared building
// environment map -- masked to the plates, so the rest of the body is lit
// exactly as before. Plain marines keep its intensity at 0 and look exactly
// as they did before.
import { Color, MeshStandardMaterial, type Texture } from "three";
import { getLightingSettings } from "../client-lighting-tuner/client-lighting-tuner-settings.js";

// Linear COLOR_0 bands (see the table above): chest-and-up vs the backpack,
// and shoulders vs the chest.
const CHEST_LOW = 0.805;
const CHEST_HIGH = 0.82;
const SHOULDER_LOW = 0.855;
const SHOULDER_HIGH = 0.87;
// Bind-pose Z (model units, forward = +Z) behind which the chest is the back
// of the torso, under the pack. The backpack itself starts at -0.002.
const CHEST_BACK_Z = -0.003;
const CHEST_FRONT_Z = -0.001;
const TITANIUM = new Color("#b4afa4");
// Share of the team colour kept in the titanium.
const TEAM_TINT_IN_TITANIUM = 0.4;
const TITANIUM_METALNESS = 0.9;
const TITANIUM_ROUGHNESS = 0.28;

const smoothstep = (lo: number, hi: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

/** How much titanium a vertex gets (0..1), from its linear COLOR_0 grey and
 * bind-pose Z: the same mask the shader below applies per fragment, kept in
 * TS so tests can check it against the real model's paint. */
export const titaniumTrimWeight = (paint: number, bindZ: number): number => {
  const shoulderPlate = smoothstep(SHOULDER_LOW, SHOULDER_HIGH, paint);
  const chestPlate =
    smoothstep(CHEST_LOW, CHEST_HIGH, paint) * (1 - shoulderPlate) * smoothstep(CHEST_BACK_Z, CHEST_FRONT_Z, bindZ);
  return Math.max(shoulderPlate, chestPlate);
};

export type MarineMaterial = {
  material: MeshStandardMaterial;
  /** Turns the titanium trim on or off for this marine. */
  setTitaniumTrim: (on: boolean) => void;
};

export const createMarineMaterial = (envMap?: Texture): MarineMaterial => {
  // vertexColors:true multiplies the per-region greyscale painted by
  // bake-popup-marine-titan-model.py's paint pass against this material's own
  // .color (the attacker/defender tint, set per marine per frame) and the
  // scene's lighting. That paint is deliberately greyscale: every value is
  // "how much team colour does this part show".
  const material = new MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.4, metalness: 0.4 });
  const trim = { value: 0 };
  if (envMap) {
    material.envMap = envMap;
    material.envMapIntensity = 0;
  }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTitaniumTrim = trim;
    shader.uniforms.uTitanium = { value: TITANIUM };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vBindZ;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBindZ = position.z;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTitaniumTrim;\nuniform vec3 uTitanium;\nvarying float vBindZ;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
float shoulderPlate = smoothstep(${SHOULDER_LOW}, ${SHOULDER_HIGH}, vColor.g);
float chestPlate = smoothstep(${CHEST_LOW}, ${CHEST_HIGH}, vColor.g) * (1.0 - shoulderPlate)
  * smoothstep(${CHEST_BACK_Z}, ${CHEST_FRONT_Z}, vBindZ);
float titaniumPlate = uTitaniumTrim * max(shoulderPlate, chestPlate);
diffuseColor.rgb = mix(diffuseColor.rgb, uTitanium * mix(vec3(1.0), diffuse, ${TEAM_TINT_IN_TITANIUM.toFixed(2)}), titaniumPlate);`
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, ${TITANIUM_METALNESS.toFixed(2)}, titaniumPlate);`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, ${TITANIUM_ROUGHNESS.toFixed(2)}, titaniumPlate);`
      )
      // Environment light only on the titanium, not the painted suit.
      .replace("#include <lights_fragment_maps>", "#include <lights_fragment_maps>\niblIrradiance *= titaniumPlate;\nradiance *= titaniumPlate;");
  };
  material.customProgramCacheKey = () => "popup-marine-titanium-trim";
  return {
    material,
    setTitaniumTrim: (on) => {
      trim.value = on ? 1 : 0;
      if (envMap) material.envMapIntensity = on ? getLightingSettings().envIntensity : 0;
    }
  };
};
