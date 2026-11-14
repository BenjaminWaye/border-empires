import { AdditiveBlending, Color, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, Sprite, SpriteMaterial, Vector3, type BufferGeometry, type MeshBasicMaterial, type Texture } from "three";
import { SCOUT_ANTENNA_TIP, SCOUT_BELLY_LIGHT, SCOUT_GIMBAL, SCOUT_SKID_HINGE, SCOUT_TAIL_LIGHT, buildScoutAirframe } from "./client-map-3d-scout-drone-geometry.js";
import {
  SCOUT_DUCT_INNER,
  SCOUT_ROTOR_REACH,
  buildDuctCowl,
  buildDuctInternals,
  buildScoutExhaust,
  buildScoutGimbal,
  buildScoutRotorBlades,
  buildScoutRotorDisc,
  buildScoutSkid,
  placed,
  mergeParts,
  scoutRotorCentres
} from "./client-map-3d-scout-drone-propulsion.js";
import { SCOUT_CYAN, createScoutDroneMaterials } from "./client-map-3d-scout-drone-materials.js";

// The scout drone (docs/explore-scout-plan.md): one of the AFC's courier drones refitted for
// reconnaissance, in the AFC family's blackened steel, aged bronze and cyan light. A hard-surface
// hero asset: a faceted, panelled arrowhead hull with bronze-trimmed, bolted chines and cyan
// emissive seams, a faceted canopy, a belly sensor pod with its gimbal, chevron House markings,
// greebles, chamfered octagonal ducts with stators, vanes, hubs and five-blade rotors, exhaust glow
// beneath, and landing skids that fold away in flight. Geometry: client-map-3d-scout-drone-geometry.ts
// and -propulsion.ts; materials: -materials.ts. The overlay (client-map-3d-scout-drone-overlay.ts)
// poses it every frame through the handles returned here.

const NAV_RED = new Color("#ff3b26");
const NAV_GREEN = new Color("#3dff8a");
const STROBE = new Color("#fff4e0");

/** A light: its glow sprite (material tinted per frame), its emissive bead, base colour and glow size. */
export type ScoutLight = { readonly glow: Sprite; readonly material: SpriteMaterial; readonly bead: MeshStandardMaterial; readonly base: Color; readonly size: number };

export type ScoutDroneModel = {
  readonly root: Group;
  /** Each rotor: its blade group (spun) and the blur disc's material (faded in with speed). */
  readonly rotors: ReadonlyArray<{ readonly blades: Mesh; readonly disc: MeshBasicMaterial }>;
  /** The blades' shared material: faded out as the blur discs fade in. */
  readonly bladeMaterial: MeshStandardMaterial;
  /** Yaws to pan the sensor; its child `gimbalTilt` pitches it toward the ground. */
  readonly gimbalPan: Group;
  readonly gimbalTilt: Group;
  readonly lens: MeshStandardMaterial;
  /** Cyan seam lines: dimmed, never fully off, when running dark. */
  readonly seams: MeshStandardMaterial;
  /** Exhaust glow under the ducts: scales with rotor speed, fades when running dark. */
  readonly exhaust: MeshBasicMaterial;
  /** Landing skids, hinged on the hull sides: rotation.z folds them up (left +, right -). */
  readonly skids: { readonly left: Group; readonly right: Group };
  readonly lights: { readonly lens: ScoutLight; readonly belly: ScoutLight; readonly navLeft: ScoutLight; readonly navRight: ScoutLight; readonly strobe: ScoutLight; readonly antenna: ScoutLight };
  /** Drone-local positions of the two nav lights, for the light trails. */
  readonly navLeftLocal: { x: number; y: number; z: number };
  readonly navRightLocal: { x: number; y: number; z: number };
  readonly dispose: () => void;
};

export const createScoutDroneModel = (envMap?: Texture): ScoutDroneModel => {
  const geometries: BufferGeometry[] = [];
  const geo = (g: BufferGeometry): BufferGeometry => {
    geometries.push(g);
    return g;
  };
  const m = createScoutDroneMaterials(envMap);
  const root = new Group();
  root.name = "scout-drone";

  const airframe = buildScoutAirframe();
  root.add(
    new Mesh(geo(airframe.hull), m.hull),
    new Mesh(geo(airframe.steel), m.steel),
    new Mesh(geo(airframe.bronze), m.bronze),
    new Mesh(geo(airframe.glass), m.glass),
    new Mesh(geo(airframe.dark), m.dark),
    new Mesh(geo(airframe.seams), m.seams)
  );

  // Ducts: cowls, lips and internals for all four fans merged per material.
  const centres = scoutRotorCentres();
  const cowl = buildDuctCowl();
  const internals = buildDuctInternals();
  const at = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);
  root.add(
    new Mesh(geo(mergeParts(centres.map(({ x, z }) => placed(cowl, at(x, 0.012, z))))), m.steel),
    new Mesh(geo(mergeParts(centres.map(({ x, z }) => placed(internals.lip, at(x, 0.012, z))))), m.bronze),
    new Mesh(geo(mergeParts(centres.map(({ x, z }) => placed(internals.stator, at(x, 0.012, z))))), m.steel)
  );
  for (const g of [cowl, internals.lip, internals.stator]) g.dispose();
  // Diamond-section struts, tapering toward the cowl, from the chines out to each duct.
  const strutUp = new Vector3(0, 1, 0);
  const strut = new CylinderGeometry(0.008, 0.013, 1, 4);
  const strutParts = centres.map(({ x, z, angle }) => {
    const from = at(Math.sin(angle) * 0.055, 0.0, Math.cos(angle) * 0.055);
    const to = at(x * (1 - SCOUT_DUCT_INNER / SCOUT_ROTOR_REACH), 0.01, z * (1 - SCOUT_DUCT_INNER / SCOUT_ROTOR_REACH));
    const dir = to.clone().sub(from);
    const length = dir.length();
    return placed(strut, from.clone().add(to).multiplyScalar(0.5), new Quaternion().setFromUnitVectors(strutUp, dir.normalize()), new Vector3(1, length, 1));
  });
  strut.dispose();
  root.add(new Mesh(geo(mergeParts(strutParts)), m.bronze));

  // Rotors: blades for low speed (spin-up on launch, spin-down on landing), a blur disc at speed.
  const bladeGeometry = geo(buildScoutRotorBlades());
  const discGeometry = geo(buildScoutRotorDisc());
  const rotors = centres.map(({ x, z }) => {
    const blades = new Mesh(bladeGeometry, m.blades);
    blades.position.set(x, 0.022, z);
    const discMaterial = m.makeDisc();
    const disc = new Mesh(discGeometry, discMaterial);
    disc.position.set(x, 0.024, z);
    disc.renderOrder = 1;
    root.add(blades, disc);
    return { blades, disc: discMaterial };
  });
  const exhaust = new Mesh(geo(buildScoutExhaust(centres, -0.024)), m.exhaust);
  exhaust.renderOrder = 2;
  root.add(exhaust);

  // Landing skids, hinged on the hull sides.
  const skid = (side: 1 | -1): Group => {
    const group = new Group();
    group.position.set(side * SCOUT_SKID_HINGE.x, SCOUT_SKID_HINGE.y, 0);
    group.add(new Mesh(geo(buildScoutSkid(side)), m.steel));
    root.add(group);
    return group;
  };
  const skids = { left: skid(-1), right: skid(1) };

  // The sensor gimbal under the belly pod.
  const gimbal = buildScoutGimbal();
  const gimbalPan = new Group();
  gimbalPan.position.set(0, SCOUT_GIMBAL.y, SCOUT_GIMBAL.z);
  gimbalPan.add(new Mesh(geo(gimbal.yoke), m.bronze));
  const gimbalTilt = new Group();
  gimbalTilt.add(new Mesh(geo(gimbal.ball), m.steel), new Mesh(geo(gimbal.lens), m.lens));
  gimbalPan.add(gimbalTilt);
  root.add(gimbalPan);

  // Lights: a small faceted emissive bead each, plus an additive glow sprite that blooms around it.
  const bead = geo(new SphereGeometry(1, 6, 4));
  const light = (x: number, y: number, z: number, color: Color, size: number, beadSize: number, parent: Group = root): ScoutLight => {
    const beadMaterial = m.keep(new MeshStandardMaterial({ color: "#000000", emissive: color, emissiveIntensity: 3 }));
    const mesh = new Mesh(bead, beadMaterial);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(beadSize);
    const material = m.keep(new SpriteMaterial({ toneMapped: false, map: m.glowTexture, color: color.clone(), transparent: true, blending: AdditiveBlending, depthWrite: false }));
    const glow = new Sprite(material);
    glow.position.set(x, y, z);
    glow.scale.setScalar(size);
    parent.add(mesh, glow);
    return { glow, material, bead: beadMaterial, base: color, size };
  };
  const tipOffset = SCOUT_DUCT_INNER + 0.026;
  const frontLeft = centres[1]!;
  const frontRight = centres[0]!;
  const navLeftLocal = { x: frontLeft.x + Math.sin(frontLeft.angle) * tipOffset, y: 0.022, z: frontLeft.z + Math.cos(frontLeft.angle) * tipOffset };
  const navRightLocal = { x: frontRight.x + Math.sin(frontRight.angle) * tipOffset, y: 0.022, z: frontRight.z + Math.cos(frontRight.angle) * tipOffset };
  const lights = {
    lens: light(0, 0, 0.024, SCOUT_CYAN, 0.07, 0.004, gimbalTilt),
    belly: light(0, SCOUT_BELLY_LIGHT.y, SCOUT_BELLY_LIGHT.z, SCOUT_CYAN, 0.055, 0.006),
    navLeft: light(navLeftLocal.x, navLeftLocal.y, navLeftLocal.z, NAV_RED, 0.07, 0.006),
    navRight: light(navRightLocal.x, navRightLocal.y, navRightLocal.z, NAV_GREEN, 0.07, 0.006),
    strobe: light(0, SCOUT_TAIL_LIGHT.y, SCOUT_TAIL_LIGHT.z, STROBE, 0.12, 0.006),
    antenna: light(0, SCOUT_ANTENNA_TIP.y, SCOUT_ANTENNA_TIP.z, NAV_RED, 0.05, 0.004)
  };

  return {
    root,
    rotors,
    bladeMaterial: m.blades,
    gimbalPan,
    gimbalTilt,
    lens: m.lens,
    seams: m.seams,
    exhaust: m.exhaust,
    skids,
    lights,
    navLeftLocal,
    navRightLocal,
    dispose: () => {
      for (const g of geometries) g.dispose();
      m.dispose();
    }
  };
};
