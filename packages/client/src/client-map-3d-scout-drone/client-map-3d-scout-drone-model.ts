import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Material
} from "three";

// The scout drone's body (docs/explore-scout-plan.md): one of the AFC's courier drones
// (client-map-3d-construction/client-map-3d-construction-drone-draw.ts) refitted with sensors
// instead of a winch. Same family look -- a blackened-steel hull on four aged-brass arms ending in
// ducted fans, a cyan belly light, white and red nav lights -- but a longer, slimmer hull with a
// glowing sensor lens under the nose and a short antenna mast. Built drone-local with the nose
// toward +Z and the hull centre at the origin; the overlay (client-map-3d-scout-drone-overlay.ts)
// scales, places, yaws and leans it every frame.

export const SCOUT_DRONE_ROTORS = 4;
const ROTOR_REACH = 0.19;
const DUCT_RADIUS = 0.075;
const HULL = { width: 0.12, height: 0.06, length: 0.3 } as const;

const BRASS = "#a8844a";
const STEEL = "#2a3038";
const SENSOR_CYAN = "#4fd8ff";

export type ScoutDroneModel = {
  readonly root: Group;
  /** The four fan rotors, spun by the overlay (neighbours counter-rotate). */
  readonly rotors: readonly Group[];
  /** Belly light and sensor lens materials, pulsed by the overlay. */
  readonly sensorGlow: MeshBasicMaterial;
  /** The blinking red tail light. */
  readonly tailLight: Mesh;
  readonly dispose: () => void;
};

export const createScoutDroneModel = (): ScoutDroneModel => {
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const geo = <T extends BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const mat = <T extends Material>(m: T): T => {
    materials.push(m);
    return m;
  };
  const hullMaterial = mat(new MeshStandardMaterial({ color: STEEL, roughness: 0.45, metalness: 0.7, flatShading: true }));
  const brassMaterial = mat(new MeshStandardMaterial({ color: BRASS, roughness: 0.4, metalness: 0.75, flatShading: true, side: DoubleSide }));
  const sensorGlow = mat(new MeshBasicMaterial({ toneMapped: false, color: SENSOR_CYAN }));
  const bladeMaterial = mat(new MeshBasicMaterial({ toneMapped: false, color: "#9fe9ff", transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false }));
  const navWhite = mat(new MeshBasicMaterial({ toneMapped: false, color: "#fff3d9" }));
  const navRed = mat(new MeshBasicMaterial({ toneMapped: false, color: "#ff3a24" }));

  const root = new Group();
  root.name = "scout-drone";
  const add = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };

  // Hull: a long box with a tapered nose cone and a dorsal spine.
  add(new Mesh(geo(new BoxGeometry(HULL.width, HULL.height, HULL.length)), hullMaterial), 0, 0, 0);
  const nose = add(new Mesh(geo(new CylinderGeometry(0.012, HULL.width * 0.5, 0.09, 6)), hullMaterial), 0, 0, HULL.length / 2 + 0.045);
  nose.rotation.x = Math.PI / 2;
  add(new Mesh(geo(new BoxGeometry(0.035, 0.022, HULL.length * 0.7)), brassMaterial), 0, HULL.height / 2 + 0.011, -0.02);
  // Antenna mast with a white tip.
  add(new Mesh(geo(new CylinderGeometry(0.004, 0.004, 0.09, 4)), brassMaterial), 0, HULL.height / 2 + 0.065, -HULL.length * 0.32);
  add(new Mesh(geo(new SphereGeometry(0.009, 6, 4)), navWhite), 0, HULL.height / 2 + 0.11, -HULL.length * 0.32);
  // Sensor turret under the nose: a brass collar around a glowing cyan lens.
  add(new Mesh(geo(new CylinderGeometry(0.03, 0.034, 0.025, 8)), brassMaterial), 0, -HULL.height / 2 - 0.012, HULL.length * 0.28);
  add(new Mesh(geo(new SphereGeometry(0.024, 10, 6)), sensorGlow), 0, -HULL.height / 2 - 0.028, HULL.length * 0.28);
  // Belly light and nav lights.
  add(new Mesh(geo(new SphereGeometry(0.014, 6, 4)), sensorGlow), 0, -HULL.height / 2 - 0.004, -0.04);
  add(new Mesh(geo(new SphereGeometry(0.01, 6, 4)), navWhite), 0, 0, HULL.length / 2 + 0.092);
  const tailLight = add(new Mesh(geo(new SphereGeometry(0.012, 6, 4)), navRed), 0, 0.012, -HULL.length / 2 - 0.006);

  // Four brass arms to four ducted fans.
  const armGeometry = geo(new BoxGeometry(0.022, 0.016, ROTOR_REACH));
  const ductGeometry = geo(new TorusGeometry(DUCT_RADIUS, 0.012, 6, 18));
  const hubGeometry = geo(new CylinderGeometry(0.014, 0.014, 0.03, 6));
  const bladeGeometry = geo(new BoxGeometry(DUCT_RADIUS * 1.75, 0.004, 0.018));
  const rotors: Group[] = [];
  for (let k = 0; k < SCOUT_DRONE_ROTORS; k += 1) {
    const angle = Math.PI / 4 + (k * Math.PI) / 2;
    const ax = Math.sin(angle) * ROTOR_REACH;
    const az = Math.cos(angle) * ROTOR_REACH;
    const arm = add(new Mesh(armGeometry, brassMaterial), ax / 2, 0.006, az / 2);
    arm.rotation.y = angle;
    const duct = add(new Mesh(ductGeometry, brassMaterial), ax, 0.014, az);
    duct.rotation.x = Math.PI / 2;
    add(new Mesh(hubGeometry, hullMaterial), ax, 0.01, az);
    const rotor = new Group();
    rotor.position.set(ax, 0.022, az);
    for (let b = 0; b < 2; b += 1) {
      const blade = new Mesh(bladeGeometry, bladeMaterial);
      blade.rotation.y = (b * Math.PI) / 2;
      rotor.add(blade);
    }
    root.add(rotor);
    rotors.push(rotor);
  }

  return {
    root,
    rotors,
    sensorGlow,
    tailLight,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    }
  };
};
