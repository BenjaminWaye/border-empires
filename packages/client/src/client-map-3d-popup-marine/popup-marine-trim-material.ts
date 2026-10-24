// The battle marine's material, with an optional titanium trim: an empire
// that owns a Titanium Weapons Factory sends its soldiers with polished
// titanium on their shoulder plates and chest (popup-marine-gear.ts).
//
// No separate model: the marine's baked vertex paint
// (bake-popup-marine-titan-model.py's REGION_VALUES) already marks the armour
// plates -- the shoulders, collar and chest plate are the only regions painted
// above ~0.9 (exported as linear ~0.79-0.89), while the next brightest region,
// the upper arms, sits at ~0.57 linear. A smoothstep between the two picks out
// exactly those plates, and a per-marine uniform switches the trim on, so
// trimmed and plain marines share one material setup and one model.
//
// The trimmed plates render as titanium (its own champagne grey, nearly fully
// metallic, fairly smooth) carrying a hint of the team colour so the side
// still reads at battle zoom; everything else keeps the team paint. Metal
// needs something to reflect, so trimmed marines get the shared building
// environment map; plain marines keep its intensity at 0 and look exactly as
// they did before.
import { Color, MeshStandardMaterial, type Texture } from "three";
import { getLightingSettings } from "../client-lighting-tuner/client-lighting-tuner-settings.js";

// Linear COLOR_0 band separating the armour plates from everything else.
const PLATE_LOW = 0.66;
const PLATE_HIGH = 0.74;
const TITANIUM = new Color("#b4afa4");
// Share of the team colour kept in the titanium.
const TEAM_TINT_IN_TITANIUM = 0.4;
const TITANIUM_METALNESS = 0.9;
const TITANIUM_ROUGHNESS = 0.28;

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
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTitaniumTrim;\nuniform vec3 uTitanium;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
float titaniumPlate = uTitaniumTrim * smoothstep(${PLATE_LOW.toFixed(2)}, ${PLATE_HIGH.toFixed(2)}, vColor.g);
diffuseColor.rgb = mix(diffuseColor.rgb, uTitanium * mix(vec3(1.0), diffuse, ${TEAM_TINT_IN_TITANIUM.toFixed(2)}), titaniumPlate);`
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, ${TITANIUM_METALNESS.toFixed(2)}, titaniumPlate);`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, ${TITANIUM_ROUGHNESS.toFixed(2)}, titaniumPlate);`
      );
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
