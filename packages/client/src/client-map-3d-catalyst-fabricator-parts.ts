// The part catalogue for the Catalyst Fabricator (CAT) module: every geometry
// and material the module is built from, plus the profile constants the
// placement code builds against.
//
// This lives apart from the module itself because a part catalogue is a
// self-contained unit of work — it declares what the fabricator is made of, and
// the module file only decides where each piece sits. It is also the only place
// that needs to change when a piece's proportions move.
//
// MAIN_READ: the whole point of this family is one oversized ROTATING
// multi-chamber fabrication drum lying across the pod on the Z axis. The two
// numbers that make it read that way are how far the drum's curtain clears the
// pod crown (so it towers over the base instead of hiding behind it) and that
// the drum is split into three distinct chambers. The rotation is carried by
// three bright port arcs that sweep around the drum as the rotor turns; the
// chambers themselves stay put, one per colour, so the sweep reads as a
// multi-chamber drum rather than a striped barrel.
//
// This is the fabrication workhorse of the ring and also its first animated
// family: every other module renders once and holds still. The drum's port ring
// is the exception, and it is what the regression suite has to be able to see —
// a mutation that stops the rotor leaves every cylinder parameter identical and
// only a matrix-level check catches it.

import { BufferGeometry, CapsuleGeometry, CylinderGeometry, MeshStandardMaterial, TorusGeometry } from "three";

// Pod: the same 0.075 radius capsule every other family docks with, squashed
// far enough that the drum lying across its crown still towers clear of it.
export const CAT_POD = { y: 0.082, squash: 0.74, radius: 0.075 };
export const CAT_POD_CROWN = CAT_POD.y + (CAT_POD.radius + 0.01) * CAT_POD.squash;
// Drum: the dominant mechanism — one large barrel lying across the pod on the
// Z axis. Its centre is sunk so the barrel's lower half passes through the
// pod's crown and reads as mounted through the pod rather than balanced on it.
export const CAT_DRUM = { y: 0.152, radius: 0.045, length: 0.13 };
// Chamber: one of the three thick cylindrical sections the barrel is divided
// into. Each chamber is a short coloured cylinder (its own glow or material
// feed) set side by side along the drum, one per CANDIDATE feed.
export const CAT_SEGMENT = { radius: 0.0495, length: 0.036 };
// The three chambers' centres along the drum axis, from the rear (-Z, ice) to
// the front (+Z, violet — nearest the output chamber that shares its colouring).
export const CAT_SEGMENT_Z = [-0.0433, 0, 0.0433] as const;
const WINDOW_THETA_LENGTH = 0.92;
// Port arc: a partial ring standing proud of its chamber's shell, showing the
// chamber's colour as a bright strip. It is an OPEN cylinder (thetaStart and
// thetaLength are genuinely partial), mounted rotated onto the drum axis, and
// its azimuth is what the rotation animates. CylinderGeometry's theta=0 points
// +Z, so backing the bisector onto geometry +X (thetaStart=π/2−θ/2) means the
// module can aim the arc's centre precisely with a single sweep angle, and the
// azimuth probe reads that centre directly out of the rendered vertices.
export const CAT_WINDOW = {
  radius: 0.0525,
  length: 0.028,
  thetaLength: WINDOW_THETA_LENGTH,
  thetaStart: Math.PI / 2 - WINDOW_THETA_LENGTH / 2
} as const;
// The three port arcs' fixed azimuth offsets from the rotor, so the chambers
// read as distinct readouts rather than one merged strip. Their values only
// matter relative to each other: the rotor angle adds to all three.
export const CAT_WINDOW_OFFSET = [-0.55, 0, 0.55] as const;
// How fast the rotor sweeps and where it points at t=0. The rotor angle is
// START + nowMs * SPEED, and the port arcs sit at that angle plus their own
// offset, so all three sweep together.
export const CAT_DRUM_SPEED_MS = 0.0004;
export const CAT_DRUM_START_AZIMUTH = -0.5;
// Partition_Rings: heavy brass hoops clamping the barrel between chambers.
export const CAT_PARTITION = { radius: 0.0525, tube: 0.008, z: 0.0217 };
// End_Rings: the same heavy hoop closing each end of the barrel.
export const CAT_END_RING = { radius: 0.0535, tube: 0.008, z: 0.065 };
// Canisters: three short tapered injector canisters standing at each chamber's
// apex, feeding charge down into the drum from the top. A chamber's own feed,
// so there are as many canisters as chambers.
export const CAT_CANISTER = { radiusTop: 0.0115, radiusBottom: 0.0145, length: 0.046, y: 0.2225 };
export const CAT_CANISTER_Z = CAT_SEGMENT_Z;
// Nozzle and collar: where each canister spears into its chamber's shell — a
// short wide stub sunk below the shell top, wrapped by a brass seat ring.
export const CAT_NOZZLE = { radius: 0.017, length: 0.013, y: 0.196 };
export const CAT_COLLAR = { radius: 0.0165, tube: 0.0035, y: 0.2025 };
// Output_Chamber: the single compact product outlet, coaxial with the barrel at
// its +Z end — the opposite side of the drum from the three feeds.
export const CAT_OUTPUT = { radius: 0.024, length: 0.026, z: 0.08 };
export const CAT_OUTPUT_COLLAR = { radius: 0.0265, tube: 0.005, z: 0.066 };
export const CAT_PORT = { radius: 0.012, length: 0.008, z: 0.094 };
// Pressure_Valve: one stub and handwheel on the output chamber's crown.
export const CAT_VALVE = { lift: 0.008, stemRadius: 0.004, stemHeight: 0.013, knobRadius: 0.008, knobTube: 0.0025 };

// The drum's visible curtain: the top of the three chambers' shells. This is
// the number the regression suite compares to the pod crown to pin MAIN_READ.
export const CAT_DRUM_TOP_Y = CAT_DRUM.y + CAT_SEGMENT.radius;

export type CatalystFabricatorMaterials = {
  readonly iron: MeshStandardMaterial;
  readonly steel: MeshStandardMaterial;
  readonly brass: MeshStandardMaterial;
  readonly pipe: MeshStandardMaterial;
  // The three chambers: subdued coloured metals, one per feed line. Each is the
  // "internal glow or material feed" of its chamber — bright enough to tell the
  // three chambers apart at strategy distance, never bright enough to read as a
  // lamp. They carry the family's cyan / violet / ice palette.
  readonly segmentCyan: MeshStandardMaterial;
  readonly segmentViolet: MeshStandardMaterial;
  readonly segmentIce: MeshStandardMaterial;
  // The three port arcs: the same three colours, dramatically brighter, on a
  // near-white body — the rotor that visibly sweeps around the drum.
  readonly windowCyan: MeshStandardMaterial;
  readonly windowViolet: MeshStandardMaterial;
  readonly windowIce: MeshStandardMaterial;
  // Restrained accents: cyan on the rear coupling's contact tip, violet on the
  // output chamber's product port.
  readonly cyan: MeshStandardMaterial;
  readonly violet: MeshStandardMaterial;
};

export type CatalystFabricatorGeometries = {
  readonly base: BufferGeometry;
  readonly baseRing: BufferGeometry;
  readonly pod: BufferGeometry;
  readonly podBand: BufferGeometry;
  readonly barrel: BufferGeometry;
  readonly segment: BufferGeometry;
  readonly windowArc: BufferGeometry;
  readonly partition: BufferGeometry;
  readonly endRing: BufferGeometry;
  readonly canister: BufferGeometry;
  readonly canisterCollar: BufferGeometry;
  readonly canisterNozzle: BufferGeometry;
  readonly output: BufferGeometry;
  readonly outputCollar: BufferGeometry;
  readonly outputPort: BufferGeometry;
  readonly valveStem: BufferGeometry;
  readonly valveKnob: BufferGeometry;
  readonly coupling: BufferGeometry;
  readonly couplingRing: BufferGeometry;
  readonly couplingTip: BufferGeometry;
};

export type CatalystFabricatorParts = {
  readonly geometries: CatalystFabricatorGeometries;
  readonly materials: CatalystFabricatorMaterials;
};

export const createCatalystFabricatorParts = (): CatalystFabricatorParts => {
  const iron = new MeshStandardMaterial({ color: "#22242a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const steel = new MeshStandardMaterial({ color: "#17181d", roughness: 0.62, metalness: 0.5, flatShading: true });
  const brass = new MeshStandardMaterial({ color: "#8b6c3d", roughness: 0.42, metalness: 0.85, flatShading: true });
  const pipe = new MeshStandardMaterial({ color: "#2c2f36", roughness: 0.55, metalness: 0.6, flatShading: true });
  // Chamber metals: dark bodies in each colour family with a modest emissive
  // lift, so the three chambers read as charged but not lit. The violet chamber
  // is deliberately the same family as the Umbrite works it feeds.
  const segmentCyan = new MeshStandardMaterial({
    color: "#0e2c38",
    roughness: 0.4,
    metalness: 0.45,
    flatShading: true,
    emissive: "#37b6d6",
    emissiveIntensity: 0.6
  });
  const segmentViolet = new MeshStandardMaterial({
    color: "#261444",
    roughness: 0.4,
    metalness: 0.45,
    flatShading: true,
    emissive: "#8a5bd6",
    emissiveIntensity: 0.6
  });
  const segmentIce = new MeshStandardMaterial({
    color: "#0d3136",
    roughness: 0.4,
    metalness: 0.45,
    flatShading: true,
    emissive: "#7fdcea",
    emissiveIntensity: 0.6
  });
  // Port arcs: near-white bodies with a strong matching emissive, so each port
  // reads as a hot strip of its chamber's colour against the dark shell.
  const windowCyan = new MeshStandardMaterial({
    color: "#0a3f4d",
    roughness: 0.3,
    metalness: 0.2,
    flatShading: true,
    emissive: "#4cc8e8",
    emissiveIntensity: 2.4
  });
  const windowViolet = new MeshStandardMaterial({
    color: "#2b1a55",
    roughness: 0.3,
    metalness: 0.2,
    flatShading: true,
    emissive: "#9a6cf5",
    emissiveIntensity: 2.4
  });
  const windowIce = new MeshStandardMaterial({
    color: "#0b4046",
    roughness: 0.3,
    metalness: 0.2,
    flatShading: true,
    emissive: "#8be4f5",
    emissiveIntensity: 2.4
  });
  const cyan = new MeshStandardMaterial({
    color: "#0d2430",
    roughness: 0.32,
    metalness: 0.15,
    flatShading: true,
    emissive: "#37b6d6",
    emissiveIntensity: 1.2
  });
  const violet = new MeshStandardMaterial({
    color: "#1b1030",
    roughness: 0.3,
    metalness: 0.1,
    flatShading: true,
    emissive: "#8a5bd6",
    emissiveIntensity: 1.6
  });

  // Small curved parts use high segment counts so flat-shaded facets never read
  // as black crease lines (see the Siege Lens Foundry module notes).
  return {
    materials: { iron, steel, brass, pipe, segmentCyan, segmentViolet, segmentIce, windowCyan, windowViolet, windowIce, cyan, violet },
    geometries: {
      base: new CylinderGeometry(0.1, 0.105, 0.032, 16),
      baseRing: new TorusGeometry(0.12, 0.012, 12, 28),
      pod: new CapsuleGeometry(CAT_POD.radius, 0.02, 6, 16),
      podBand: new TorusGeometry(0.079, 0.011, 10, 26),
      // Drum: the barrel, one chamber cylinder (shared by the three coloured
      // chambers), the swept port arc, and the partition and end rings that
      // clamp the assembly.
      barrel: new CylinderGeometry(CAT_DRUM.radius, CAT_DRUM.radius, CAT_DRUM.length, 16),
      segment: new CylinderGeometry(CAT_SEGMENT.radius, CAT_SEGMENT.radius, CAT_SEGMENT.length, 16),
      windowArc: new CylinderGeometry(CAT_WINDOW.radius, CAT_WINDOW.radius, CAT_WINDOW.length, 20, 1, true, CAT_WINDOW.thetaStart, CAT_WINDOW.thetaLength),
      partition: new TorusGeometry(CAT_PARTITION.radius, CAT_PARTITION.tube, 10, 24),
      endRing: new TorusGeometry(CAT_END_RING.radius, CAT_END_RING.tube, 10, 24),
      // Canisters: tapered body, brass seat collar, and the nozzle that spears
      // the shell. The taper makes each read as a feed chute rather than a pipe.
      canister: new CylinderGeometry(CAT_CANISTER.radiusTop, CAT_CANISTER.radiusBottom, CAT_CANISTER.length, 12),
      canisterCollar: new TorusGeometry(CAT_COLLAR.radius, CAT_COLLAR.tube, 8, 16),
      canisterNozzle: new CylinderGeometry(CAT_NOZZLE.radius, CAT_NOZZLE.radius, CAT_NOZZLE.length, 12),
      // Output chamber: body, brass collar at the barrel, and the violet port.
      output: new CylinderGeometry(CAT_OUTPUT.radius, CAT_OUTPUT.radius, CAT_OUTPUT.length, 14),
      outputCollar: new TorusGeometry(CAT_OUTPUT_COLLAR.radius, CAT_OUTPUT_COLLAR.tube, 8, 16),
      outputPort: new CylinderGeometry(CAT_PORT.radius, CAT_PORT.radius, CAT_PORT.length, 12),
      valveStem: new CylinderGeometry(CAT_VALVE.stemRadius, CAT_VALVE.stemRadius + 0.001, CAT_VALVE.stemHeight, 8),
      valveKnob: new TorusGeometry(CAT_VALVE.knobRadius, CAT_VALVE.knobTube, 8, 14),
      // Rear coupling, as on every other family.
      coupling: new CylinderGeometry(0.024, 0.026, 1, 12),
      couplingRing: new TorusGeometry(0.03, 0.011, 10, 20),
      couplingTip: new CylinderGeometry(0.014, 0.014, 0.016, 14)
    }
  };
};