// The part catalogue for the Matterwright Retort (MWR) module: every geometry
// and material the module is built from, plus the profile constants the
// placement code builds against.
//
// This lives apart from the module itself because a part catalogue is a
// self-contained unit of work — it declares what the still is made of, and the
// module file only decides where each piece sits. It is also the only place
// that needs to change when a piece's proportions move, so keeping it separate
// keeps the placement code readable.
//
// The retort profile is squashed on Y only (one shared instance scale), so a
// piece's XZ footprint is its unscaled radius while its height rides the Y
// scale. Braces and flanges are sized against those footprints so nothing
// Z-fights against a curved skin.

import { BufferGeometry, CapsuleGeometry, CylinderGeometry, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector3 } from "three";

// Pod: the same 0.075 radius capsule every other family docks with, squashed
// hard on Y. Its crown lands at POD_CROWN, which is where the retort's belly is
// buried.
export const MWR_POD = { y: 0.082, squash: 0.68, radius: 0.075 };
export const MWR_POD_CROWN = MWR_POD.y + (MWR_POD.radius + 0.01) * MWR_POD.squash;
// Retort: a squat pressure chamber — a sphere squashed to 0.6 on Y, so it reads
// as a wide vessel rather than a ball. Its belly is sunk into the pod crown so
// it looks cast onto the pod, not balanced on it.
export const MWR_RETORT = { radius: 0.082, squash: 0.6, y: MWR_POD_CROWN + 0.082 * 0.6 - 0.009 };
export const MWR_RETORT_HALF = MWR_RETORT.radius * MWR_RETORT.squash;
// Condensers: two small tanks flanking the vessel, standing on the pod's
// shoulders. Deliberately well under the retort's height so the vessel keeps
// the silhouette's top note.
export const MWR_COND = { radius: 0.024, height: 0.042, y: 0.123, x: 0.03, z: 0.066 };
// Valve handwheel basis: the wheel's plane is perpendicular to the valve stem,
// and its four spokes are laid out on this fixed basis so they land in the same
// clock position on every instance.
export const MWR_VALVE_DIR = new Vector3(0.848, 0.424, 0.318).normalize();
export const MWR_WHEEL_U = new Vector3().crossVectors(MWR_VALVE_DIR, new Vector3(0, 0, 1)).normalize();
export const MWR_WHEEL_V = new Vector3().crossVectors(MWR_VALVE_DIR, MWR_WHEEL_U).normalize();
export const MWR_VALVE = { stemLength: 0.026, wheelRadius: 0.015, wheelTube: 0.0045, spokeLength: 0.013 };

export type MatterwrightRetortMaterials = {
  readonly iron: MeshStandardMaterial;
  readonly steel: MeshStandardMaterial;
  readonly brass: MeshStandardMaterial;
  readonly pipe: MeshStandardMaterial;
  readonly violet: MeshStandardMaterial;
  readonly violetBright: MeshStandardMaterial;
};

export type MatterwrightRetortGeometries = {
  readonly base: BufferGeometry;
  readonly baseRing: BufferGeometry;
  readonly pod: BufferGeometry;
  readonly podBand: BufferGeometry;
  readonly neckCollar: BufferGeometry;
  readonly retort: BufferGeometry;
  readonly bandLower: BufferGeometry;
  readonly seam: BufferGeometry;
  readonly bandUpper: BufferGeometry;
  readonly capKnob: BufferGeometry;
  readonly windowBezel: BufferGeometry;
  readonly windowGlass: BufferGeometry;
  readonly valveStem: BufferGeometry;
  readonly valveWheel: BufferGeometry;
  readonly valveHub: BufferGeometry;
  readonly valveSpoke: BufferGeometry;
  readonly condBody: BufferGeometry;
  readonly condRing: BufferGeometry;
  readonly condGlass: BufferGeometry;
  readonly pipe: BufferGeometry;
  readonly pipeFlange: BufferGeometry;
  readonly feedFunnel: BufferGeometry;
  readonly feedRing: BufferGeometry;
  readonly feedStub: BufferGeometry;
  readonly coupling: BufferGeometry;
  readonly couplingRing: BufferGeometry;
  readonly couplingTip: BufferGeometry;
};

export type MatterwrightRetortParts = {
  readonly geometries: MatterwrightRetortGeometries;
  readonly materials: MatterwrightRetortMaterials;
};

export const createMatterwrightRetortParts = (): MatterwrightRetortParts => {
  const iron = new MeshStandardMaterial({ color: "#22242a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const steel = new MeshStandardMaterial({ color: "#17181d", roughness: 0.62, metalness: 0.5, flatShading: true });
  const brass = new MeshStandardMaterial({ color: "#8b6c3d", roughness: 0.42, metalness: 0.85, flatShading: true });
  const pipe = new MeshStandardMaterial({ color: "#2c2f36", roughness: 0.55, metalness: 0.6, flatShading: true });
  // Cyan-violet reaction light. The seam around the vessel's waist is the one
  // bright source in the module; the porthole, the condenser sight-glasses and
  // the rear contact tip reuse the dimmer violet so the seam stays the read.
  const violet = new MeshStandardMaterial({
    color: "#1b1030",
    roughness: 0.3,
    metalness: 0.1,
    flatShading: true,
    emissive: "#7b5cff",
    emissiveIntensity: 2.0
  });
  const violetBright = new MeshStandardMaterial({
    color: "#241545",
    roughness: 0.25,
    metalness: 0.05,
    flatShading: true,
    emissive: "#b892ff",
    emissiveIntensity: 3.0
  });

  // Small curved parts use high segment counts so flat-shaded facets never read
  // as black crease lines (see the Siege Lens Foundry module notes).
  return {
    materials: { iron, steel, brass, pipe, violet, violetBright },
    geometries: {
      base: new CylinderGeometry(0.1, 0.105, 0.032, 16),
      baseRing: new TorusGeometry(0.12, 0.012, 12, 28),
      pod: new CapsuleGeometry(MWR_POD.radius, 0.02, 6, 16),
      podBand: new TorusGeometry(0.079, 0.011, 10, 26),
      // The sphere carries every Y squash through its instance scale, so one
      // geometry serves the vessel and its profile maths.
      retort: new SphereGeometry(MWR_RETORT.radius, 18, 12),
      // Brass hoops and the seam between them. The seam's tube is thinner than
      // both hoops', so it reads as light leaking out of the groove they form.
      bandLower: new TorusGeometry(0.083, 0.01, 10, 26),
      bandUpper: new TorusGeometry(0.081, 0.01, 10, 26),
      seam: new TorusGeometry(0.0835, 0.005, 8, 28),
      neckCollar: new TorusGeometry(0.06, 0.008, 10, 24),
      capKnob: new CylinderGeometry(0.013, 0.016, 0.014, 10),
      // Window: a brass bezel with the sight-glass standing proud inside it.
      windowBezel: new TorusGeometry(0.018, 0.005, 8, 20),
      windowGlass: new CylinderGeometry(0.015, 0.015, 0.004, 14),
      // Pressure_Valve: stem, handwheel, hub and four spokes.
      valveStem: new CylinderGeometry(0.008, 0.01, 1, 10),
      valveWheel: new TorusGeometry(MWR_VALVE.wheelRadius, MWR_VALVE.wheelTube, 8, 20),
      valveHub: new CylinderGeometry(0.005, 0.005, 0.009, 10),
      valveSpoke: new CylinderGeometry(0.002, 0.002, 1, 6),
      // Condensers: body, brass foot/cap ring, sight-glass band.
      condBody: new CylinderGeometry(MWR_COND.radius, MWR_COND.radius, MWR_COND.height, 14),
      condRing: new TorusGeometry(0.0255, 0.005, 8, 20),
      condGlass: new TorusGeometry(0.0245, 0.004, 8, 20),
      // Process_Pipes: heavy insulated runs with a brass flange at the vessel.
      pipe: new CylinderGeometry(0.009, 0.009, 1, 10),
      pipeFlange: new TorusGeometry(0.0115, 0.004, 8, 16),
      // Feed_Port: a brass funnel with a beaded rim, braced back to the pod.
      feedFunnel: new CylinderGeometry(0.02, 0.012, 0.026, 12),
      feedRing: new TorusGeometry(0.021, 0.005, 8, 20),
      feedStub: new CylinderGeometry(0.006, 0.006, 1, 8),
      coupling: new CylinderGeometry(0.024, 0.026, 1, 12),
      couplingRing: new TorusGeometry(0.03, 0.011, 10, 20),
      couplingTip: new CylinderGeometry(0.014, 0.014, 0.016, 14)
    }
  };
};
