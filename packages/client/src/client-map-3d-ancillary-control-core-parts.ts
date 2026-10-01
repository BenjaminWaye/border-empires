// The part catalogue for the Ancillary Control Core (ACC) module: every
// geometry and material the module is built from, plus the profile constants the
// placement code builds against.
//
// This lives apart from the module itself because a part catalogue is a
// self-contained unit of work — it declares what the control core is made of,
// and the module file only decides where each piece sits. It is also the only
// place that needs to change when a piece's proportions move.
//
// MAIN_READ: the whole point of this family is one big central CONTROL CORE
// mounted above the pod — a squat vertical processor housing carrying a small
// glowing cyan core behind a reinforced brass cage on top, ringed by four evenly
// spaced articulated control arms that each end in a relay block. The module is
// a coordinator, not a generator: the only light is the small restrained cyan
// core inside the cage, and the relay blocks read as subordinate machines joined
// back to that core by thick conduits. The two numbers that make it read that
// way are how far the housing towers clear of the pod crown (so the control core
// dominates the silhouette) and that the four arms all poke out radially at the
// same height, one machine reaching in four directions.
//
// Strong readable silhouette from strategy-game camera distance, in the shared
// materials of the ring: blackened iron, dark steel, aged brass and the family's
// restrained cyan control-light accent.

import { BufferGeometry, CapsuleGeometry, CylinderGeometry, MeshStandardMaterial, SphereGeometry, TorusGeometry } from "three";

// Pod: the same 0.075 radius capsule every other family docks with, squashed
// only far enough that the control core standing on its crown still towers
// clear of it.
export const ACC_POD = { y: 0.082, squash: 0.74, radius: 0.075 };
export const ACC_POD_CROWN = ACC_POD.y + (ACC_POD.radius + 0.01) * ACC_POD.squash;
// Core: the dominant mechanism — the squat cylindrical processor housing mounted
// above the pod. Its centre is sunk so the housing's lower half passes through
// the pod's crown and reads as mounted through the pod rather than balanced on
// it, exactly the way the horizontal vessel families mount their barrels.
export const ACC_CORE = { radius: 0.05, length: 0.05, y: 0.157 };
export const ACC_CORE_TOP = ACC_CORE.y + ACC_CORE.length * 0.5;
// Cooling_Fins: three compact thin discs around the housing's lower half, the
// radiator fins of the processor plant. The three heights sit between the brass
// clamp bands.
export const ACC_FIN = { radius: 0.055, length: 0.005 };
export const ACC_FIN_Y = [0.142, 0.153, 0.164] as const;
// Clamp_Bands: heavy aged-brass hoops reinforcing the housing top and bottom.
export const ACC_CLAMP = { radius: 0.054, tube: 0.008 };
export const ACC_CLAMP_Y = [0.135, 0.174] as const;
// Glow_Core: the small restrained cyan core, exposed at the top of the housing
// and read through the cage rather than blazing.
export const ACC_GLOW = { radius: 0.013, length: 0.03, y: 0.199 };
// Cage: a reinforced brass cage around the glow core — four thin vertical rods
// plus two hoops, so the core reads as a contained control light, not a lamp.
export const ACC_CAGE = { radius: 0.0205, rodRadius: 0.0022, rodLength: 0.04, hoopTube: 0.003 };
export const ACC_CAGE_ROD_Y = 0.2;
export const ACC_CAGE_HOOP_Y = [0.184, 0.218] as const;
// The cage rods stand at the diagonal azimuths (45° off the cardinal arms) so
// the cage reads as a lattice around the glow rather than hiding behind the
// four control arms.
export const ACC_CAGE_ROD_AZIMUTHS = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4] as const;
// Arms: one articulated control arm per cardinal azimuth, from the housing's
// upper flank out to a relay block. Each arm is a shoulder joint, a thick
// upward conduit run to an elbow joint, a kinked drop and a squat vertical
// relay block standing at the outer end — the four subordinate systems the core
// coordinates. The relay's outer face sets this family's width: 0.096 local,
// inside the 0.10525 local cap the shared AFC bay (0.14 world) allows.
export const ACC_ARM = {
  shoulderR: 0.05,
  shoulderY: 0.18,
  shoulderRadius: 0.0075,
  upperR: 0.007,
  upperOut: 0.062,
  upperY: 0.1825,
  elbowR: 0.062,
  elbowY: 0.1825,
  elbowRadius: 0.006,
  lowerR: 0.006,
  lowerOut: 0.07,
  relayY: 0.168,
  relayCenterR: 0.082,
  relayRadius: 0.014,
  relayLength: 0.034,
  collarY: 0.17,
  collarRadius: 0.016,
  collarTube: 0.004
} as const;
export const ACC_ARM_AZIMUTHS = [0, Math.PI / 2, Math.PI, -Math.PI / 2] as const;
// Power_Conduits: two thick runs bracing the rear of the pod up into the lower
// housing, flanking the rear coupling — the module's own power feed.
export const ACC_CONDUIT = {
  radius: 0.008,
  z: 0.026,
  foot: { x: -0.048, y: 0.088 },
  top: { x: -0.039, y: 0.148 }
} as const;
// The cage's top hoop is the tallest point of the whole module.
export const ACC_TOWER_TOP = ACC_CAGE_HOOP_Y[1] + ACC_CAGE.hoopTube;

export type AncillaryControlCoreMaterials = {
  readonly iron: MeshStandardMaterial;
  readonly steel: MeshStandardMaterial;
  readonly brass: MeshStandardMaterial;
  readonly pipe: MeshStandardMaterial;
  // The family's restrained control-light accent: the small cyan glow core at
  // the top of the processor housing (and the rear coupling's contact tip).
  // Bright enough to read as an active controller on the map, never bright
  // enough to read as a power plant.
  readonly cyan: MeshStandardMaterial;
};

export type AncillaryControlCoreGeometries = {
  readonly base: BufferGeometry;
  readonly baseRing: BufferGeometry;
  readonly pod: BufferGeometry;
  readonly podBand: BufferGeometry;
  readonly core: BufferGeometry;
  readonly clamp: BufferGeometry;
  readonly fin: BufferGeometry;
  readonly glow: BufferGeometry;
  readonly cageRod: BufferGeometry;
  readonly cageHoop: BufferGeometry;
  readonly shoulder: BufferGeometry;
  readonly upperArm: BufferGeometry;
  readonly elbow: BufferGeometry;
  readonly lowerArm: BufferGeometry;
  readonly relay: BufferGeometry;
  readonly relayCollar: BufferGeometry;
  readonly conduit: BufferGeometry;
  readonly coupling: BufferGeometry;
  readonly couplingRing: BufferGeometry;
  readonly couplingTip: BufferGeometry;
};

export type AncillaryControlCoreParts = {
  readonly geometries: AncillaryControlCoreGeometries;
  readonly materials: AncillaryControlCoreMaterials;
};

export const createAncillaryControlCoreParts = (): AncillaryControlCoreParts => {
  const iron = new MeshStandardMaterial({ color: "#22242a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const steel = new MeshStandardMaterial({ color: "#17181d", roughness: 0.62, metalness: 0.5, flatShading: true });
  const brass = new MeshStandardMaterial({ color: "#8b6c3d", roughness: 0.42, metalness: 0.85, flatShading: true });
  const pipe = new MeshStandardMaterial({ color: "#2c2f36", roughness: 0.55, metalness: 0.6, flatShading: true });
  const cyan = new MeshStandardMaterial({
    color: "#0d2430",
    roughness: 0.32,
    metalness: 0.15,
    flatShading: true,
    emissive: "#37b6d6",
    emissiveIntensity: 1.2
  });

  // Small curved parts use high segment counts so flat-shaded facets never read
  // as black crease lines (see the Siege Lens Foundry module notes).
  return {
    materials: { iron, steel, brass, pipe, cyan },
    geometries: {
      base: new CylinderGeometry(0.1, 0.105, 0.032, 16),
      baseRing: new TorusGeometry(0.12, 0.012, 12, 28),
      pod: new CapsuleGeometry(ACC_POD.radius, 0.02, 6, 16),
      podBand: new TorusGeometry(0.079, 0.011, 10, 26),
      // Control core: the squat vertical processor housing, its brass clamp
      // bands and the compact cooling fins on its lower half.
      core: new CylinderGeometry(ACC_CORE.radius, ACC_CORE.radius, ACC_CORE.length, 16),
      clamp: new TorusGeometry(ACC_CLAMP.radius, ACC_CLAMP.tube, 10, 20),
      fin: new CylinderGeometry(ACC_FIN.radius, ACC_FIN.radius, ACC_FIN.length, 14),
      // The restrained glow core and its brass cage.
      glow: new CylinderGeometry(ACC_GLOW.radius, ACC_GLOW.radius, ACC_GLOW.length, 12),
      cageRod: new CylinderGeometry(ACC_CAGE.rodRadius, ACC_CAGE.rodRadius, 1, 8),
      cageHoop: new TorusGeometry(ACC_CAGE.radius, ACC_CAGE.hoopTube, 8, 16),
      // The four articulated control arms and their relay blocks.
      shoulder: new SphereGeometry(ACC_ARM.shoulderRadius, 10, 8),
      upperArm: new CylinderGeometry(ACC_ARM.upperR, ACC_ARM.upperR, 1, 8),
      elbow: new SphereGeometry(ACC_ARM.elbowRadius, 8, 6),
      lowerArm: new CylinderGeometry(ACC_ARM.lowerR, ACC_ARM.lowerR, 1, 8),
      relay: new CylinderGeometry(ACC_ARM.relayRadius, ACC_ARM.relayRadius, ACC_ARM.relayLength, 12),
      relayCollar: new TorusGeometry(ACC_ARM.collarRadius, ACC_ARM.collarTube, 8, 14),
      conduit: new CylinderGeometry(ACC_CONDUIT.radius, ACC_CONDUIT.radius, 1, 8),
      // Rear coupling, as on every other family.
      coupling: new CylinderGeometry(0.024, 0.026, 1, 12),
      couplingRing: new TorusGeometry(0.03, 0.011, 10, 20),
      couplingTip: new CylinderGeometry(0.014, 0.014, 0.016, 14)
    }
  };
};