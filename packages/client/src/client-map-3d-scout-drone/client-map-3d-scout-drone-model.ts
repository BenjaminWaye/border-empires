import { AdditiveBlending, BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, Sprite, SpriteMaterial, type BufferGeometry, type MeshBasicMaterial, type MeshPhysicalMaterial, type Texture } from "three";
import { SCOUT_PROP_Y, scoutPodCentres, spherePoint, type ScoutPodName } from "./client-map-3d-scout-drone-geometry.js";
import { SCOUT_EYE_PIVOT_Z, buildScoutBody } from "./client-map-3d-scout-drone-body.js";
import { buildScoutPods, buildScoutRotorBlades, buildScoutRotorDisc, scoutPodTip } from "./client-map-3d-scout-drone-pods.js";
import { SCOUT_CYAN, createScoutDroneMaterials } from "./client-map-3d-scout-drone-materials.js";

// The scout drone (docs/explore-scout-plan.md), the "Sentinel": a stylised recon drone the AFC
// builds and launches. A dark grey sphere of large panels with darker seams, one big camera
// eye in front (dark bezel, glass rings, a glowing cyan pupil that tracks the ground), two cyan
// LED slots below it, two thin antennas on the top rear, and four short dark arms out to oval
// rotor pods, each with a large open three-blade rotor. The pod LEDs are its running lights: red
// on the front-left pod, green on the front-right, cyan on the rear pods, and a white strobe on
// the rear-left tip. A small REC light sits beside the eye. Geometry: -geometry.ts, -body.ts and
// -pods.ts; materials: -materials.ts. The overlay (client-map-3d-scout-drone-overlay.ts) poses it
// every frame through these handles.

const NAV_RED = new Color("#ff3b26");
const NAV_GREEN = new Color("#3dff8a");
const STROBE = new Color("#fff4e0");
const REC_RED = new Color("#ff2a1a");

/** A light: its glow sprite (material tinted per frame), its emissive bead, base colour and glow size. */
export type ScoutLight = { readonly glow: Sprite; readonly material: SpriteMaterial; readonly bead: MeshStandardMaterial; readonly base: Color; readonly size: number };

export type ScoutDroneModel = {
  readonly root: Group;
  /** Each rotor: its blades (spun) and the blur disc's material (faded in with speed). */
  readonly rotors: ReadonlyArray<{ readonly blades: Mesh; readonly disc: MeshBasicMaterial }>;
  /** Drone-local rotor centres, for the rotor wash on the ground. */
  readonly rotorLocal: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number }>;
  /** The blades' shared material: faded out as the blur discs fade in. */
  readonly bladeMaterial: MeshPhysicalMaterial;
  /** The eye's tracking part (step, inner glass ring, pupil): pitched and panned toward the ground. */
  readonly eye: Group;
  /** The pupil (emissive cyan) and the lower-front LED slots: dimmed past the border, never off. */
  readonly pupil: MeshStandardMaterial;
  readonly frontSlots: MeshStandardMaterial;
  /** The rear pods' cyan LEDs: running lights. */
  readonly podSlots: MeshStandardMaterial;
  readonly lights: { readonly eye: ScoutLight; readonly navLeft: ScoutLight; readonly navRight: ScoutLight; readonly strobe: ScoutLight; readonly rec: ScoutLight };
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

  const body = buildScoutBody();
  const pods = buildScoutPods();
  root.add(
    new Mesh(geo(body.paint), m.paint),
    new Mesh(geo(body.graphite), m.graphite),
    new Mesh(geo(body.antennas), m.graphite),
    new Mesh(geo(body.slots), m.frontSlots),
    new Mesh(geo(body.insets), m.eyeGlass),
    new Mesh(geo(body.eyeGlass), m.eyeGlass),
    new Mesh(geo(pods.graphite), m.graphite),
    new Mesh(geo(pods.paint), m.paint),
    new Mesh(geo(pods.inset), m.inset)
  );
  // The eye's tracking part, pivoting on the nose axis inside the bezel.
  const eye = new Group();
  eye.position.z = SCOUT_EYE_PIVOT_Z;
  eye.add(new Mesh(geo(body.irisStep), m.graphite), new Mesh(geo(body.irisGlass), m.eyeGlass), new Mesh(geo(body.pupil), m.pupil), new Mesh(geo(body.catchLight), m.catchLight));
  root.add(eye);

  // Rotors: blades at low speed (spool-up on launch, spin-down on landing), a soft disc at speed.
  const centres = scoutPodCentres();
  const bladeGeometry = geo(buildScoutRotorBlades());
  const discGeometry = geo(buildScoutRotorDisc());
  const rotorLocal = centres.map(({ x, z }) => ({ x, y: SCOUT_PROP_Y, z }));
  const rotors = centres.map(({ x, z }) => {
    const blades = new Mesh(bladeGeometry, m.blades);
    blades.position.set(x, SCOUT_PROP_Y, z);
    const discMaterial = m.makeDisc();
    const disc = new Mesh(discGeometry, discMaterial);
    disc.position.set(x, SCOUT_PROP_Y + 0.002, z);
    disc.renderOrder = 1;
    root.add(blades, disc);
    return { blades, disc: discMaterial };
  });

  // Lights: a crisp emissive LED each, plus a small soft halo sprite.
  const led = geo(new BoxGeometry(1, 0.5, 0.6));
  const light = (at: { x: number; y: number; z: number }, color: Color, size: number, beadSize: number, parent: Group = root, map = m.glowTexture): ScoutLight => {
    const beadMaterial = m.keep(new MeshStandardMaterial({ color: "#000000", emissive: color, emissiveIntensity: 3 }));
    const mesh = new Mesh(led, beadMaterial);
    mesh.position.set(at.x, at.y, at.z);
    mesh.scale.setScalar(beadSize);
    mesh.rotation.y = Math.atan2(at.x, at.z); // its long side across the radial direction
    const material = m.keep(new SpriteMaterial({ toneMapped: false, map, color: color.clone(), transparent: true, blending: AdditiveBlending, depthWrite: false }));
    const glow = new Sprite(material);
    glow.position.set(at.x, at.y, at.z);
    glow.scale.setScalar(size);
    parent.add(mesh, glow);
    return { glow, material, bead: beadMaterial, base: color, size };
  };
  const tip = (name: ScoutPodName): { x: number; y: number; z: number } => {
    const p = scoutPodTip(centres.find((c) => c.name === name)!.angle);
    return { x: p.x, y: p.y, z: p.z };
  };
  const navLeftLocal = tip("frontLeft");
  const navRightLocal = tip("frontRight");
  const rearRight = tip("rearRight");
  const rearLeft = tip("rearLeft");
  // The rear pods' cyan LEDs (running lights, dimmed with the nav lights).
  for (const at of [rearRight, rearLeft]) {
    const mesh = new Mesh(led, m.podSlots);
    mesh.position.set(at.x, at.y, at.z);
    mesh.scale.setScalar(0.009);
    mesh.lookAt(at.x * 2, at.y, at.z * 2);
    root.add(mesh);
  }
  const recAt = spherePoint(0.74, 0.95, 0.0855);
  const lights = {
    eye: light({ x: 0, y: 0, z: 0.0012 }, SCOUT_CYAN, 0.018, 0.001, eye),
    navLeft: light(navLeftLocal, NAV_RED, 0.04, 0.009),
    navRight: light(navRightLocal, NAV_GREEN, 0.04, 0.009),
    // The strobe: a tiny, sharp point with a tight halo above the rear-left tip (dark between flashes).
    strobe: light({ x: rearLeft.x, y: rearLeft.y + 0.008, z: rearLeft.z }, STROBE, 0.012, 0.003, root, m.pointGlowTexture),
    rec: light(recAt, REC_RED, 0.014, 0.0035)
  };

  return {
    root,
    rotors,
    rotorLocal,
    bladeMaterial: m.blades,
    eye,
    pupil: m.pupil,
    frontSlots: m.frontSlots,
    podSlots: m.podSlots,
    lights,
    navLeftLocal,
    navRightLocal,
    dispose: () => {
      for (const g of geometries) g.dispose();
      m.dispose();
    }
  };
};
