import { AdditiveBlending, Color, Group, Mesh, MeshStandardMaterial, SphereGeometry, Sprite, SpriteMaterial, type BufferGeometry, type MeshBasicMaterial, type MeshPhysicalMaterial, type Texture } from "three";
import {
  SCOUT_GIMBAL,
  SCOUT_LEG_HINGE,
  SCOUT_MOTOR_Y,
  SCOUT_PROP_Y,
  SCOUT_STATUS_LIGHT,
  SCOUT_STROBE,
  buildScoutAirframe,
  scoutRotorCentres
} from "./client-map-3d-scout-drone-geometry.js";
import { SCOUT_GIMBAL_TILT_Y, SCOUT_LENS_Z, SCOUT_REC_LIGHT, buildScoutGimbal, buildScoutLeg, buildScoutPropBlades, buildScoutPropDisc } from "./client-map-3d-scout-drone-parts.js";
import { SCOUT_CYAN, createScoutDroneMaterials } from "./client-map-3d-scout-drone-materials.js";

// The scout drone (docs/explore-scout-plan.md), the "Survey Quad": a realistic, high-end mapping
// drone the AFC builds and launches. A satin graphite domed shell with one hatch seam and twin
// obstacle-sensor lenses on the nose, over a rounded battery pack (brass latch, charge LEDs),
// a thin polished trim along the shell's rim, carbon arms tapering out to compact brushed
// aluminium motors with brass caps, aerofoil props behind thin guards, a 3-axis camera gimbal
// under the nose (layered lens, REC light), and landing gear -- struts with rounded knees and a
// foot bar with rubber caps -- that folds up in flight. Geometry: -geometry.ts and -parts.ts; materials: -materials.ts.
// The overlay (client-map-3d-scout-drone-overlay.ts) poses it every frame through these handles.

const NAV_RED = new Color("#ff3b26");
const NAV_GREEN = new Color("#3dff8a");
const STROBE = new Color("#fff4e0");
const REC_RED = new Color("#ff2a1a");

/** A light: its glow sprite (material tinted per frame), its emissive bead, base colour and glow size. */
export type ScoutLight = { readonly glow: Sprite; readonly material: SpriteMaterial; readonly bead: MeshStandardMaterial; readonly base: Color; readonly size: number };

export type ScoutDroneModel = {
  readonly root: Group;
  /** Each prop: its blades (spun) and the blur disc's material (faded in with speed). */
  readonly rotors: ReadonlyArray<{ readonly blades: Mesh; readonly disc: MeshBasicMaterial }>;
  /** Drone-local prop centres, for the rotor wash on the ground. */
  readonly rotorLocal: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number }>;
  /** The blades' shared material: faded out as the blur discs fade in. */
  readonly bladeMaterial: MeshStandardMaterial;
  /** Yaws to pan the camera; its child `gimbalTilt` pitches it toward the ground. */
  readonly gimbalPan: Group;
  readonly gimbalTilt: Group;
  /** The lens iris (emissive cyan). */
  readonly lens: MeshStandardMaterial;
  /** Obstacle-sensor and camera lens glass: a faint cyan glint, dimmed when running dark. */
  readonly glass: MeshPhysicalMaterial;
  /** The charge LEDs on the battery's back. */
  readonly leds: MeshStandardMaterial;
  /** Landing legs, hinged on the chassis: rotation.z folds them up (left -, right +). */
  readonly legs: { readonly left: Group; readonly right: Group };
  readonly lights: { readonly lens: ScoutLight; readonly status: ScoutLight; readonly navLeft: ScoutLight; readonly navRight: ScoutLight; readonly strobe: ScoutLight; readonly rec: ScoutLight };
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

  const a = buildScoutAirframe();
  root.add(
    new Mesh(geo(a.shell), m.shell),
    new Mesh(geo(a.chassis), m.chassis),
    new Mesh(geo(a.arms), m.carbon),
    new Mesh(geo(a.bells), m.aluminium),
    new Mesh(geo(a.frame), m.frame),
    new Mesh(geo(a.trim), m.trim),
    new Mesh(geo(a.brass), m.brass),
    new Mesh(geo(a.glass), m.glass),
    new Mesh(geo(a.leds), m.leds)
  );

  // Props: aerofoil blades at low speed (spin-up on launch, spin-down on landing), a soft disc at speed.
  const centres = scoutRotorCentres();
  const bladeGeometry = geo(buildScoutPropBlades());
  const discGeometry = geo(buildScoutPropDisc());
  const rotorLocal = centres.map(({ x, z }) => ({ x, y: SCOUT_PROP_Y, z }));
  const rotors = centres.map(({ x, z }) => {
    const blades = new Mesh(bladeGeometry, m.blades);
    blades.position.set(x, SCOUT_PROP_Y, z);
    const discMaterial = m.makeDisc();
    const disc = new Mesh(discGeometry, discMaterial);
    disc.position.set(x, SCOUT_PROP_Y + 0.001, z);
    disc.renderOrder = 1;
    root.add(blades, disc);
    return { blades, disc: discMaterial };
  });

  // Landing gear, hinged on the chassis sides.
  const leg = (side: 1 | -1): Group => {
    const group = new Group();
    group.position.set(side * SCOUT_LEG_HINGE.x, SCOUT_LEG_HINGE.y, 0);
    const parts = buildScoutLeg(side);
    group.add(new Mesh(geo(parts.strut), m.frame), new Mesh(geo(parts.rubber), m.rubber));
    root.add(group);
    return group;
  };
  const legs = { left: leg(-1), right: leg(1) };

  // The 3-axis camera gimbal under the nose.
  const gimbal = buildScoutGimbal();
  const gimbalPan = new Group();
  gimbalPan.position.set(0, SCOUT_GIMBAL.y, SCOUT_GIMBAL.z);
  gimbalPan.add(new Mesh(geo(gimbal.yoke), m.frame));
  const gimbalTilt = new Group();
  gimbalTilt.position.y = SCOUT_GIMBAL_TILT_Y;
  const outerGlass = new Mesh(geo(gimbal.glass), m.lensGlass);
  outerGlass.renderOrder = 2; // over the iris ring and element it lets through
  gimbalTilt.add(
    new Mesh(geo(gimbal.camera), m.chassis),
    new Mesh(geo(gimbal.barrel), m.aluminium),
    new Mesh(geo(gimbal.irisRing), m.frame),
    new Mesh(geo(gimbal.iris), m.lens),
    outerGlass
  );
  gimbalPan.add(gimbalTilt);
  root.add(gimbalPan);

  // Lights: a crisp emissive LED each, plus a small soft halo sprite.
  const bead = geo(new SphereGeometry(1, 6, 4));
  const light = (x: number, y: number, z: number, color: Color, size: number, beadSize: number, parent: Group = root, map = m.glowTexture): ScoutLight => {
    const beadMaterial = m.keep(new MeshStandardMaterial({ color: "#000000", emissive: color, emissiveIntensity: 3 }));
    const mesh = new Mesh(bead, beadMaterial);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(beadSize);
    const material = m.keep(new SpriteMaterial({ toneMapped: false, map, color: color.clone(), transparent: true, blending: AdditiveBlending, depthWrite: false }));
    const glow = new Sprite(material);
    glow.position.set(x, y, z);
    glow.scale.setScalar(size);
    parent.add(mesh, glow);
    return { glow, material, bead: beadMaterial, base: color, size };
  };
  // Nav lights on the outer ends of the front arms, at the motor bases.
  const frontLeft = centres[1]!;
  const frontRight = centres[0]!;
  const out = 0.024; // just outside the motor bell
  const navY = SCOUT_MOTOR_Y + 0.004;
  const navLeftLocal = { x: frontLeft.x + Math.sin(frontLeft.angle) * out, y: navY, z: frontLeft.z + Math.cos(frontLeft.angle) * out };
  const navRightLocal = { x: frontRight.x + Math.sin(frontRight.angle) * out, y: navY, z: frontRight.z + Math.cos(frontRight.angle) * out };
  const lights = {
    lens: light(0, 0, SCOUT_LENS_Z - 0.004, SCOUT_CYAN, 0.03, 0.002, gimbalTilt),
    status: light(0.024, SCOUT_STATUS_LIGHT.y, SCOUT_STATUS_LIGHT.z, SCOUT_CYAN, 0.012, 0.0016, root, m.pointGlowTexture), // a small status LED, never a lamp
    navLeft: light(navLeftLocal.x, navLeftLocal.y, navLeftLocal.z, NAV_RED, 0.036, 0.0035),
    navRight: light(navRightLocal.x, navRightLocal.y, navRightLocal.z, NAV_GREEN, 0.036, 0.0035),
    // The strobe: a tiny, sharp point with a tight halo (dark between flashes).
    strobe: light(0, SCOUT_STROBE.y, SCOUT_STROBE.z, STROBE, 0.01, 0.0016, root, m.pointGlowTexture),
    rec: light(SCOUT_REC_LIGHT.x, SCOUT_REC_LIGHT.y, SCOUT_REC_LIGHT.z, REC_RED, 0.016, 0.0018, gimbalTilt)
  };

  return {
    root,
    rotors,
    rotorLocal,
    bladeMaterial: m.blades,
    gimbalPan,
    gimbalTilt,
    lens: m.lens,
    glass: m.glass,
    leds: m.leds,
    legs,
    lights,
    navLeftLocal,
    navRightLocal,
    dispose: () => {
      for (const g of geometries) g.dispose();
      m.dispose();
    }
  };
};
