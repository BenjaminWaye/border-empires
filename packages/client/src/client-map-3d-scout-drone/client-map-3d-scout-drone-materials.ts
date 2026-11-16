import { Color, DoubleSide, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Vector2, type CanvasTexture, type Material, type Texture } from "three";
import { applyBuildingEnvMap } from "../client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { makeBellTextures, makeCarbonTextures, makeChassisTextures, makeShellTextures, type ScoutTextureSet } from "./client-map-3d-scout-drone-surface.js";
import { makeGlowTexture, makeRotorBlurTexture } from "./client-map-3d-scout-drone-textures.js";

// Materials for the Survey Quad (client-map-3d-scout-drone-model.ts): a premium, believable finish
// in the established palette. A satin, lightly clearcoated graphite shell with fine grain and one
// hatch seam; a matte, finely grained battery chassis; carbon-fibre arms; machined aluminium motor
// bells with brushing and a fine vent band; brass caps and latch; dark obstacle-sensor glass with
// a faint cyan glint; a cyan lens iris and charge LEDs. Shell and chassis
// carry baked occlusion in vertex colours. Building environment map reflections are applied at a
// reduced share. Built once; the overlay only tweaks a few scalars per frame.

export const SCOUT_CYAN = new Color("#4fd8ff");
const ENV_SHARE = 0.4;

export type ScoutDroneMaterials = {
  readonly shell: MeshPhysicalMaterial;
  readonly chassis: MeshStandardMaterial;
  readonly carbon: MeshStandardMaterial;
  readonly aluminium: MeshStandardMaterial;
  readonly frame: MeshStandardMaterial;
  readonly brass: MeshStandardMaterial;
  /** Obstacle-sensor and camera lens glass; a faint cyan glint, dimmed when running dark. */
  readonly glass: MeshPhysicalMaterial;
  /** The lens iris; its emissive intensity follows the running lights (dims, never off). */
  readonly lens: MeshStandardMaterial;
  /** The charge LEDs; dimmed when running dark. */
  readonly leds: MeshStandardMaterial;
  /** Prop blades: fade out as the blur disc fades in. */
  readonly blades: MeshPhysicalMaterial;
  readonly glowTexture: CanvasTexture | null;
  /** A fresh blur-disc material (one per prop, so each can fade on its own). */
  readonly makeDisc: () => MeshBasicMaterial;
  readonly keep: <T extends Material>(material: T) => T;
  readonly dispose: () => void;
};

export const createScoutDroneMaterials = (envMap?: Texture): ScoutDroneMaterials => {
  const owned: Material[] = [];
  const keep = <T extends Material>(m: T): T => {
    owned.push(m);
    return m;
  };
  const textures: ScoutTextureSet[] = [];
  const tex = (t: ScoutTextureSet | null): ScoutTextureSet | null => {
    if (t) textures.push(t);
    return t;
  };
  const shellTex = tex(makeShellTextures());
  const chassisTex = tex(makeChassisTextures());
  const carbonTex = tex(makeCarbonTextures());
  const bellTex = tex(makeBellTextures());
  chassisTex?.roughnessMap.repeat.set(30, 30);
  carbonTex?.roughnessMap.repeat.set(2, 12);
  carbonTex?.normalMap?.repeat.set(2, 12);
  const glowTexture = makeGlowTexture();
  const blurTexture = makeRotorBlurTexture();

  const shell = keep(
    new MeshPhysicalMaterial({
      color: "#474d55",
      vertexColors: true,
      metalness: 0.1,
      roughness: 0.55,
      clearcoat: 0.15,
      clearcoatRoughness: 0.5,
      ...(shellTex ? { map: shellTex.map, roughnessMap: shellTex.roughnessMap, normalMap: shellTex.normalMap, normalScale: new Vector2(0.6, 0.6) } : {})
    })
  );
  const chassis = keep(new MeshStandardMaterial({ color: "#1e2126", vertexColors: true, metalness: 0.1, roughness: 0.78, ...(chassisTex ? { roughnessMap: chassisTex.roughnessMap } : {}) }));
  const carbon = keep(
    new MeshStandardMaterial({
      color: "#16181c",
      vertexColors: true,
      metalness: 0.3,
      roughness: 0.38,
      ...(carbonTex ? { roughnessMap: carbonTex.roughnessMap, normalMap: carbonTex.normalMap, normalScale: new Vector2(0.12, 0.12) } : {})
    })
  );
  const aluminium = keep(new MeshStandardMaterial({ color: "#9aa0a6", metalness: 0.85, roughness: 0.38, side: DoubleSide, ...(bellTex ? { map: bellTex.map, roughnessMap: bellTex.roughnessMap } : {}) }));
  const frame = keep(new MeshStandardMaterial({ color: "#15171b", metalness: 0.35, roughness: 0.45 }));
  const brass = keep(new MeshStandardMaterial({ color: "#a8844e", metalness: 0.9, roughness: 0.4 }));
  const glass = keep(new MeshPhysicalMaterial({ color: "#03080b", metalness: 0.1, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05, emissive: SCOUT_CYAN, emissiveIntensity: 0.04, side: DoubleSide }));
  const lens = keep(new MeshStandardMaterial({ color: "#041a22", emissive: SCOUT_CYAN, emissiveIntensity: 2.4, metalness: 0.3, roughness: 0.15, side: DoubleSide }));
  const leds = keep(new MeshStandardMaterial({ color: "#021015", emissive: SCOUT_CYAN, emissiveIntensity: 2, roughness: 0.3 }));
  const blades = keep(new MeshPhysicalMaterial({ color: "#121418", metalness: 0.2, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.3, side: DoubleSide, transparent: true }));
  for (const m of [shell, chassis, carbon, aluminium, frame, brass, glass, blades]) {
    applyBuildingEnvMap(m, envMap);
    m.envMapIntensity *= ENV_SHARE;
  }
  shell.envMapIntensity *= 0.45; // graphite with a soft satin sheen, never chrome
  brass.envMapIntensity *= 0.6; // crisp but small highlights, so the caps never read as lamps
  glass.envMapIntensity *= 0.3; // dark glass: a subtle reflection, not a mirror
  const makeDisc = (): MeshBasicMaterial =>
    keep(new MeshBasicMaterial({ toneMapped: false, color: "#8e9ba5", map: blurTexture, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }));

  return {
    shell,
    chassis,
    carbon,
    aluminium,
    frame,
    brass,
    glass,
    lens,
    leds,
    blades,
    glowTexture,
    makeDisc,
    keep,
    dispose: () => {
      for (const m of owned) m.dispose();
      for (const t of textures) t.dispose();
      glowTexture?.dispose();
      blurTexture?.dispose();
    }
  };
};
