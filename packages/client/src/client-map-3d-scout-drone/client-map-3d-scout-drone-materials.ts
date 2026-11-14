import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Vector2,
  type CanvasTexture,
  type Material,
  type Texture
} from "three";
import { applyBuildingEnvMap } from "../client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { addScoutRimLight, makeScoutPanelMaps, makeScoutWearMap } from "./client-map-3d-scout-drone-surface.js";
import { makeGlowTexture, makeRotorBlurTexture } from "./client-map-3d-scout-drone-textures.js";

// Materials for the scout drone (client-map-3d-scout-drone-model.ts). The AFC family palette --
// blackened steel, aged bronze, cyan light -- as PBR on the map's building environment map:
// panelled two-tone gunmetal hull plates, darker gunmetal structure, worn bronze trim, smoked
// sensor glass, matte black intakes, cyan emissive seams, and the transparent effect materials
// (rotor blur, exhaust glow, light glows). Grazing facets get a cool fresnel rim so the dark
// craft separates from dark terrain. Built once; the overlay only tweaks a few scalars per frame.

export const SCOUT_CYAN = new Color("#4fd8ff");
const RIM = new Color("#7fb8d8");

export type ScoutDroneMaterials = {
  readonly hull: MeshPhysicalMaterial;
  readonly steel: MeshPhysicalMaterial;
  readonly bronze: MeshStandardMaterial;
  readonly glass: MeshPhysicalMaterial;
  readonly dark: MeshStandardMaterial;
  /** Cyan seam lines and the sensor lens; their emissive intensity follows the running lights. */
  readonly seams: MeshStandardMaterial;
  readonly lens: MeshStandardMaterial;
  /** Rotor blades: fade out as the blur disc fades in. */
  readonly blades: MeshStandardMaterial;
  readonly exhaust: MeshBasicMaterial;
  readonly glowTexture: CanvasTexture | null;
  readonly blurTexture: CanvasTexture | null;
  /** A fresh blur-disc material (one per rotor, so each can fade on its own). */
  readonly makeDisc: () => MeshBasicMaterial;
  /** Keep a material for disposal. */
  readonly keep: <T extends Material>(material: T) => T;
  readonly dispose: () => void;
};

export const createScoutDroneMaterials = (envMap?: Texture): ScoutDroneMaterials => {
  const owned: Material[] = [];
  const keep = <T extends Material>(m: T): T => {
    owned.push(m);
    return m;
  };
  const panels = makeScoutPanelMaps();
  const wear = makeScoutWearMap();
  const glowTexture = makeGlowTexture();
  const blurTexture = makeRotorBlurTexture();

  // Hull plates: vertex colours give the two-tone facets, the panel maps the seams and rivets.
  const hull = keep(
    new MeshPhysicalMaterial({
      color: "#4a5360",
      vertexColors: true,
      metalness: 0.78,
      roughness: 0.42,
      clearcoat: 0.45,
      clearcoatRoughness: 0.3,
      flatShading: true,
      ...(panels ? { map: panels.map, normalMap: panels.normalMap, roughnessMap: panels.roughnessMap, normalScale: new Vector2(0.9, 0.9) } : {})
    })
  );
  const steel = keep(new MeshPhysicalMaterial({ color: "#262c34", metalness: 0.85, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.22, flatShading: true }));
  const bronze = keep(new MeshStandardMaterial({ color: "#d4a560", metalness: 0.95, roughness: 0.3, flatShading: true, ...(wear ? { map: wear } : {}) }));
  const glass = keep(new MeshPhysicalMaterial({ color: "#09161d", metalness: 0.2, roughness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.25, emissive: "#0c3a48", emissiveIntensity: 0.6, flatShading: true }));
  const dark = keep(new MeshStandardMaterial({ color: "#07090b", metalness: 0.2, roughness: 0.85, flatShading: true }));
  const seams = keep(new MeshStandardMaterial({ color: "#02161c", emissive: SCOUT_CYAN, emissiveIntensity: 2.2, roughness: 0.4 }));
  const lens = keep(new MeshStandardMaterial({ color: "#041a22", emissive: SCOUT_CYAN, emissiveIntensity: 2.6, metalness: 0.2, roughness: 0.2 }));
  const blades = keep(new MeshStandardMaterial({ color: "#1a1f25", metalness: 0.6, roughness: 0.4, side: DoubleSide, transparent: true, flatShading: true }));
  const exhaust = keep(new MeshBasicMaterial({ toneMapped: false, color: "#9fe6ff", map: glowTexture, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
  for (const m of [hull, steel, bronze, glass, blades]) applyBuildingEnvMap(m, envMap);
  addScoutRimLight(hull, RIM, 0.55);
  addScoutRimLight(steel, RIM, 0.4);

  const makeDisc = (): MeshBasicMaterial =>
    keep(new MeshBasicMaterial({ toneMapped: false, color: "#8fa6b4", map: blurTexture, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }));

  return {
    hull,
    steel,
    bronze,
    glass,
    dark,
    seams,
    lens,
    blades,
    exhaust,
    glowTexture,
    blurTexture,
    makeDisc,
    keep,
    dispose: () => {
      for (const m of owned) m.dispose();
      panels?.dispose();
      wear?.dispose();
      glowTexture?.dispose();
      blurTexture?.dispose();
    }
  };
};
