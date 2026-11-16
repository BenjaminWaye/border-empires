import { Color, DoubleSide, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, type CanvasTexture, type Material, type Texture } from "three";
import { applyBuildingEnvMap } from "../client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { makeGlowTexture, makePointGlowTexture, makeRotorBlurTexture } from "./client-map-3d-scout-drone-textures.js";
import { applyScoutRimLight } from "./client-map-3d-scout-drone-rim-light.js";

// Materials for the Sentinel (client-map-3d-scout-drone-model.ts), in the stylised, painted look
// of a game asset rather than a photo: a dark grey satin paint (the pods' tops included) (low metalness, a soft sheen,
// occlusion baked into vertex colours and a faint cool fresnel rim light from
// client-map-3d-scout-drone-rim-light.ts, so it separates from dark terrain), a slightly darker
// paint for the pods' inset panels, darker graphite still for the seams, joints, arms and hubs,
// dark glass for the eye's rings, an emissive cyan pupil (with a catch-light) and LED slots -- the
// highlights on the dark body -- and dark rotor blades that stay visible over a faint blur disc. Building
// environment reflections at a reduced share. Built once; the overlay only tweaks a few scalars.

export const SCOUT_CYAN = new Color("#4fd8ff");
const SCOUT_RIM = new Color("#9fc4ff");
const ENV_SHARE = 0.35;

export type ScoutDroneMaterials = {
  readonly paint: MeshStandardMaterial;
  readonly inset: MeshStandardMaterial;
  readonly graphite: MeshStandardMaterial;
  /** The eye's dark glass rings. */
  readonly eyeGlass: MeshPhysicalMaterial;
  /** The eye's pupil; its emissive intensity dims past the border, never off. */
  readonly pupil: MeshStandardMaterial;
  /** The two LED slots on the body's lower front; dim past the border, never off. */
  readonly frontSlots: MeshStandardMaterial;
  /** The cyan LEDs on the rear pods: running lights, off past the border. */
  readonly podSlots: MeshStandardMaterial;
  /** The pupil's small catch-light. */
  readonly catchLight: MeshBasicMaterial;
  /** Rotor blades: thinned out (never gone) as the blur disc fades in. */
  readonly blades: MeshPhysicalMaterial;
  readonly glowTexture: CanvasTexture | null;
  /** A small, sharp point of light with a tight halo: the strobe. */
  readonly pointGlowTexture: CanvasTexture | null;
  /** A fresh blur-disc material (one per rotor, so each can fade on its own). */
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
  const glowTexture = makeGlowTexture();
  const pointGlowTexture = makePointGlowTexture();
  const blurTexture = makeRotorBlurTexture();

  const paint = keep(new MeshStandardMaterial({ color: "#4a4f55", vertexColors: true, metalness: 0.08, roughness: 0.52 }));
  const inset = keep(new MeshStandardMaterial({ color: "#3a3e43", metalness: 0.08, roughness: 0.6 }));
  const graphite = keep(new MeshStandardMaterial({ color: "#24282d", metalness: 0.3, roughness: 0.55 }));
  const eyeGlass = keep(new MeshPhysicalMaterial({ color: "#07090c", metalness: 0.1, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08, side: DoubleSide }));
  const pupil = keep(new MeshStandardMaterial({ color: "#041a22", emissive: SCOUT_CYAN, emissiveIntensity: 2.6, roughness: 0.2, side: DoubleSide }));
  const frontSlots = keep(new MeshStandardMaterial({ color: "#021015", emissive: SCOUT_CYAN, emissiveIntensity: 1.8, roughness: 0.3 }));
  const podSlots = keep(new MeshStandardMaterial({ color: "#021015", emissive: SCOUT_CYAN, emissiveIntensity: 1.8, roughness: 0.3 }));
  const catchLight = keep(new MeshBasicMaterial({ toneMapped: false, color: "#e8fbff" }));
  const blades = keep(new MeshPhysicalMaterial({ color: "#1a1d21", metalness: 0.15, roughness: 0.62, clearcoat: 0, clearcoatRoughness: 0.5, side: DoubleSide, transparent: true }));
  for (const m of [paint, inset, graphite, eyeGlass, blades]) {
    applyBuildingEnvMap(m, envMap);
    m.envMapIntensity *= ENV_SHARE;
  }
  eyeGlass.envMapIntensity *= 2.5; // the eye's glass rings carry a soft, readable reflection
  applyScoutRimLight(paint, SCOUT_RIM, 0.32);
  const makeDisc = (): MeshBasicMaterial =>
    keep(new MeshBasicMaterial({ toneMapped: false, color: "#8e9ba5", map: blurTexture, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }));

  return {
    paint,
    inset,
    graphite,
    eyeGlass,
    pupil,
    frontSlots,
    podSlots,
    catchLight,
    blades,
    glowTexture,
    pointGlowTexture,
    makeDisc,
    keep,
    dispose: () => {
      for (const m of owned) m.dispose();
      glowTexture?.dispose();
      pointGlowTexture?.dispose();
      blurTexture?.dispose();
    }
  };
};
