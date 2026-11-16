import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  type BufferGeometry,
  type Material,
  type Texture
} from "three";
import { applyBuildingEnvMap } from "../client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import {
  SCOUT_ANTENNA_TIP,
  SCOUT_BELLY_LIGHT,
  SCOUT_DUCT_INNER,
  SCOUT_GIMBAL,
  SCOUT_TAIL_LIGHT,
  buildScoutAirframe,
  buildScoutGimbal,
  buildScoutRotorBlades,
  buildScoutRotorDisc,
  scoutRotorCentres
} from "./client-map-3d-scout-drone-geometry.js";
import { makeGlowTexture, makeRotorBlurTexture } from "./client-map-3d-scout-drone-textures.js";

// The scout drone (docs/explore-scout-plan.md): one of the AFC's courier drones refitted for
// reconnaissance. Same family as the courier (client-map-3d-construction/): blackened steel,
// aged bronze, cyan lights -- but a sculpted, lathe-turned fuselage with a glass sensor bay and
// smoked nose dome, ring-wing ducts with rounded intake lips, tapered struts, motor pods, a V-tail
// and a sensor gimbal under the nose. Metal uses the map's building environment map, as the
// buildings do, so it picks up the same reflections. The overlay
// (client-map-3d-scout-drone-overlay.ts) poses it every frame through the handles returned here.

const STEEL = "#20252c";
const BRONZE = "#b48a4c";
const CYAN = new Color("#4fd8ff");
const NAV_RED = new Color("#ff3b26");
const NAV_GREEN = new Color("#3dff8a");
const STROBE = new Color("#fff4e0");

export type ScoutLight = { readonly glow: Sprite; readonly material: SpriteMaterial; readonly base: Color; readonly size: number };

export type ScoutDroneModel = {
  readonly root: Group;
  /** Each rotor: its blade group (spun) and the blur disc's material (faded in with speed). */
  readonly rotors: ReadonlyArray<{ readonly blades: Mesh; readonly disc: MeshBasicMaterial }>;
  /** Yaws to pan the sensor; its child `gimbalTilt` pitches it toward the ground. */
  readonly gimbalPan: Group;
  readonly gimbalTilt: Group;
  readonly lens: MeshStandardMaterial;
  readonly lights: { readonly lens: ScoutLight; readonly belly: ScoutLight; readonly navLeft: ScoutLight; readonly navRight: ScoutLight; readonly strobe: ScoutLight; readonly antenna: ScoutLight };
  /** Drone-local positions of the two nav lights, for the light trails. */
  readonly navLeftLocal: { x: number; y: number; z: number };
  readonly navRightLocal: { x: number; y: number; z: number };
  readonly dispose: () => void;
};

export const createScoutDroneModel = (envMap?: Texture): ScoutDroneModel => {
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const keep = <T extends Material>(m: T): T => {
    materials.push(m);
    return m;
  };
  const steel = keep(new MeshPhysicalMaterial({ color: STEEL, metalness: 0.82, roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.22 }));
  const bronze = keep(new MeshStandardMaterial({ color: BRONZE, metalness: 0.92, roughness: 0.3 }));
  const glass = keep(new MeshPhysicalMaterial({ color: "#09161d", metalness: 0.15, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04, emissive: "#0c3a48", emissiveIntensity: 0.55 }));
  const bladeMaterial = keep(new MeshStandardMaterial({ color: "#14181d", metalness: 0.5, roughness: 0.45, side: DoubleSide }));
  const lens = keep(new MeshStandardMaterial({ color: "#041a22", emissive: CYAN, emissiveIntensity: 2.6, metalness: 0.2, roughness: 0.2 }));
  for (const m of [steel, bronze, glass, bladeMaterial]) applyBuildingEnvMap(m, envMap);

  const root = new Group();
  root.name = "scout-drone";
  const airframe = buildScoutAirframe();
  geometries.push(airframe.steel, airframe.bronze, airframe.glass);
  root.add(new Mesh(airframe.steel, steel), new Mesh(airframe.bronze, bronze), new Mesh(airframe.glass, glass));

  // Rotors: blades for low speed (spin-up on launch, spin-down on landing), a blur disc at speed.
  const glowTexture = makeGlowTexture();
  const blurTexture = makeRotorBlurTexture();
  const bladeGeometry = buildScoutRotorBlades();
  const discGeometry = buildScoutRotorDisc();
  geometries.push(bladeGeometry, discGeometry);
  const centres = scoutRotorCentres();
  const rotors = centres.map(({ x, z }) => {
    const blades = new Mesh(bladeGeometry, bladeMaterial);
    blades.position.set(x, 0.016, z);
    const discMaterial = keep(new MeshBasicMaterial({ toneMapped: false, color: "#8fa6b4", map: blurTexture, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }));
    const disc = new Mesh(discGeometry, discMaterial);
    disc.position.set(x, 0.018, z);
    disc.renderOrder = 1;
    root.add(blades, disc);
    return { blades, disc: discMaterial };
  });

  // The sensor gimbal under the nose.
  const gimbal = buildScoutGimbal();
  geometries.push(gimbal.yoke, gimbal.ball, gimbal.lens);
  const gimbalPan = new Group();
  gimbalPan.position.set(0, SCOUT_GIMBAL.y, SCOUT_GIMBAL.z);
  gimbalPan.add(new Mesh(gimbal.yoke, bronze));
  const gimbalTilt = new Group();
  gimbalTilt.add(new Mesh(gimbal.ball, steel), new Mesh(gimbal.lens, lens));
  gimbalPan.add(gimbalTilt);
  root.add(gimbalPan);

  // Lights: a small emissive bead each, plus an additive glow sprite that blooms around it.
  const bead = new SphereGeometry(1, 10, 8);
  geometries.push(bead);
  const light = (x: number, y: number, z: number, color: Color, size: number, beadSize: number, parent: Group = root): ScoutLight => {
    const beadMaterial = keep(new MeshStandardMaterial({ color: "#000000", emissive: color, emissiveIntensity: 3 }));
    const mesh = new Mesh(bead, beadMaterial);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(beadSize);
    const material = keep(new SpriteMaterial({ toneMapped: false, map: glowTexture, color: color.clone(), transparent: true, blending: AdditiveBlending, depthWrite: false }));
    const glow = new Sprite(material);
    glow.position.set(x, y, z);
    glow.scale.setScalar(size);
    parent.add(mesh, glow);
    return { glow, material, base: color, size };
  };
  const tipOffset = SCOUT_DUCT_INNER + 0.02;
  const frontLeft = centres[1]!;
  const frontRight = centres[0]!;
  const navLeftLocal = { x: frontLeft.x + Math.sin(frontLeft.angle) * tipOffset, y: 0.02, z: frontLeft.z + Math.cos(frontLeft.angle) * tipOffset };
  const navRightLocal = { x: frontRight.x + Math.sin(frontRight.angle) * tipOffset, y: 0.02, z: frontRight.z + Math.cos(frontRight.angle) * tipOffset };
  const lights = {
    lens: light(0, 0, 0.024, CYAN, 0.07, 0.004, gimbalTilt),
    belly: light(0, SCOUT_BELLY_LIGHT.y, SCOUT_BELLY_LIGHT.z, CYAN, 0.09, 0.008),
    navLeft: light(navLeftLocal.x, navLeftLocal.y, navLeftLocal.z, NAV_RED, 0.07, 0.006),
    navRight: light(navRightLocal.x, navRightLocal.y, navRightLocal.z, NAV_GREEN, 0.07, 0.006),
    strobe: light(0, SCOUT_TAIL_LIGHT.y, SCOUT_TAIL_LIGHT.z, STROBE, 0.12, 0.006),
    antenna: light(0, SCOUT_ANTENNA_TIP.y, SCOUT_ANTENNA_TIP.z, NAV_RED, 0.05, 0.004)
  };

  return {
    root,
    rotors,
    gimbalPan,
    gimbalTilt,
    lens,
    lights,
    navLeftLocal,
    navRightLocal,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      glowTexture?.dispose();
      blurTexture?.dispose();
    }
  };
};
