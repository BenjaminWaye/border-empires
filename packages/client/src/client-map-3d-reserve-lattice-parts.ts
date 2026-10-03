// The part catalogue for the Reserve Lattice (RL) module: every geometry and
// material the module is built from, plus the profile constants the placement
// code builds against.
//
// This lives apart from the module itself because a part catalogue is a
// self-contained unit of work — it declares what the reserve bank is made of,
// and the module file only decides where each piece sits. It is also the only
// place that needs to change when a piece's proportions move.
//
// MAIN_READ: the whole point of this family is one oversized cage-like lattice
// drum laid HORIZONTALLY across the top of the pod — thick brass ribs wrapped
// around a dark inner steel cylinder, seven thin steel bars tying the ribs into
// a lattice, a ring of five restrained cyan nodes along the top ridge, and a
// faint contained glow held inside the lattice where the ribs are swept aside
// at the drum's centre. The module stores capacity, patterns and dormant
// production, it does not generate: the glow is a dim, guarded light inside the
// cell, never a bright reactor, and the whole drum reads as a battery bank the
// settlement keeps in reserve. The two numbers that make it read that way are
// how far the drum towers clear of the pod crown (so the barrel dominates the
// silhouette) and that the drum's ends overhang the pod and are clamped at
// either end, a heavy thing parked across the body rather than a fin on it.
//
// Strong readable silhouette from strategy-game camera distance, in the shared
// materials of the ring: blackened iron, dark steel, aged brass and the
// family's restrained cyan storage-light accent.
//
// Local axes (shared with every AFC family): +X is FORWARD — the socket's
// outward radial direction — and the rear coupling hangs at -X. The drum lies
// across the pod along the local Z axis, tangential to the ring.

import { BufferGeometry, CapsuleGeometry, CylinderGeometry, MeshStandardMaterial, SphereGeometry, TorusGeometry } from "three";

// Pod: the same 0.075 radius capsule every other family docks with, squashed
// only far enough that the reserve drum crossing its crown still reads as a
// barrel laid across the top rather than half-buried in it.
export const RL_POD = { y: 0.082, squash: 0.74, radius: 0.075 };
export const RL_POD_CROWN = RL_POD.y + (RL_POD.radius + 0.01) * RL_POD.squash;
// The DOME mechanism — the oversized cage-like lattice drum. It lies along the
// local Z axis (across the pod, tangential to the ring), with its centre only a
// little above the pod crown so the barrel reads as mounted through the pod,
// and it is longer than the pod is wide so its ends overhang and are clamped.
export const RL_DRUM = { radius: 0.05, halfLength: 0.084, y: 0.188 };
// Dark_Inner_Cylinder: the steel bank the lattice wraps — the stored-capacity
// mass at the heart of the cell.
export const RL_DRUM_CORE = { radius: 0.038, length: 0.15 };
// Ribs: four thick aged-brass hoops laid along the barrel, spaced evenly and
// sweeping aside at the very centre so the stored glow inside reads through the
// lattice open between them.
export const RL_RIB = { radius: 0.05, tube: 0.0045 };
export const RL_RIB_Z = [-0.07, -0.035, 0.035, 0.07] as const;
// Bars: seven thin steel rails running the length of the drum on the cage
// circle, tying the ribs together into the lattice. The rail that would sit
// exactly under the pod is omitted, so nothing dips below the crown.
export const RL_BAR = { radius: 0.0022, length: 0.12 };
export const RL_BAR_AZIMUTHS = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, (5 * Math.PI) / 4, (7 * Math.PI) / 4] as const;
// Clamps: one compact locking clamp at either end of the drum, biting around
// the muzzle of the barrel. Their outer corners set this family's width:
// hypot(0.058, 0.084) = 0.102 local, inside the 0.105 local cap the shared AFC
// bay (0.14 world) allows.
export const RL_CLAMP = { radius: 0.052, tube: 0.006 };
export const RL_CLAMP_Z = [-0.084, 0.084] as const;
// Highlight_Glow: the faint contained glow held in the lattice at the drum's
// centre — stored energy / suspended fabrication data, not a reactor. It floats
// between the dark inner cylinder and the cage, only just above the steel.
export const RL_GLOW = { radius: 0.006, length: 0.05, y: 0.2265, z: 0 };
// Nodes: several cyan-lit node dots spaced evenly along the drum's top ridge —
// the frame's indicator lights for the stored charge. The top of these dots is
// the module's tallest point.
export const RL_NODE = { radius: 0.005, lift: 0.004 };
export const RL_NODE_Z = [-0.064, -0.032, 0, 0.032, 0.064] as const;
// The cage's top rail is the highest point of the drum.
export const RL_DRUM_TOP = RL_DRUM.y + RL_DRUM.radius;
// Retaining_Conduits: two heavy runs tying the drum down and back into the pod
// low on the rear, feeding the lattice cell from the AFC.
export const RL_CONDUIT = {
  radius: 0.009,
  z: 0.036,
  foot: { x: -0.055, y: 0.1 },
  top: { x: 0.048, y: 0.172 }
} as const;
// The module's tallest point: the indicator nodes sitting on the cage's top
// rail, 0.247 local = 0.3285 world, under the 0.34 ceiling.
export const RL_TOWER_TOP = RL_DRUM_TOP + RL_NODE.lift + RL_NODE.radius;

export type ReserveLatticeMaterials = {
  readonly iron: MeshStandardMaterial;
  readonly steel: MeshStandardMaterial;
  readonly brass: MeshStandardMaterial;
  readonly pipe: MeshStandardMaterial;
  // The family's restrained storage-light accent: the cyan indicator nodes on
  // the drum's top ridge and the rear coupling's contact tip. Bright enough to
  // read as an active reserve on the map, never bright enough to read as a
  // power plant.
  readonly cyan: MeshStandardMaterial;
  // The dim contained glow inside the lattice — deliberately fainter than the
  // indicator nodes, so it suggests stored capacity rather than generation.
  readonly glowDim: MeshStandardMaterial;
};

export type ReserveLatticeGeometries = {
  readonly base: BufferGeometry;
  readonly baseRing: BufferGeometry;
  readonly pod: BufferGeometry;
  readonly podBand: BufferGeometry;
  readonly drumCore: BufferGeometry;
  readonly rib: BufferGeometry;
  readonly bar: BufferGeometry;
  readonly clamp: BufferGeometry;
  readonly glow: BufferGeometry;
  readonly node: BufferGeometry;
  readonly conduit: BufferGeometry;
  readonly coupling: BufferGeometry;
  readonly couplingRing: BufferGeometry;
  readonly couplingTip: BufferGeometry;
};

export type ReserveLatticeParts = {
  readonly geometries: ReserveLatticeGeometries;
  readonly materials: ReserveLatticeMaterials;
};

export const createReserveLatticeParts = (): ReserveLatticeParts => {
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
    emissiveIntensity: 1.0
  });
  const glowDim = new MeshStandardMaterial({
    color: "#0d2430",
    roughness: 0.32,
    metalness: 0.15,
    flatShading: true,
    emissive: "#37b6d6",
    emissiveIntensity: 0.7
  });

  // Small curved parts use high segment counts so flat-shaded facets never read
  // as black crease lines (see the Siege Lens Foundry module notes).
  return {
    materials: { iron, steel, brass, pipe, cyan, glowDim },
    geometries: {
      base: new CylinderGeometry(0.1, 0.105, 0.032, 16),
      baseRing: new TorusGeometry(0.12, 0.012, 12, 28),
      pod: new CapsuleGeometry(RL_POD.radius, 0.02, 6, 16),
      podBand: new TorusGeometry(0.079, 0.011, 10, 26),
      // The lattice drum: the dark inner steel cylinder the cage wraps, the
      // thick brass ribs, the thin steel lattice bars and the end clamps.
      drumCore: new CylinderGeometry(RL_DRUM_CORE.radius, RL_DRUM_CORE.radius, 1, 14),
      rib: new TorusGeometry(RL_RIB.radius, RL_RIB.tube, 8, 22),
      bar: new CylinderGeometry(RL_BAR.radius, RL_BAR.radius, 1, 6),
      clamp: new TorusGeometry(RL_CLAMP.radius, RL_CLAMP.tube, 10, 18),
      // The faint contained glow and the cyan indicator nodes on the ridge.
      glow: new CylinderGeometry(RL_GLOW.radius, RL_GLOW.radius, 1, 10),
      node: new SphereGeometry(RL_NODE.radius, 10, 8),
      conduit: new CylinderGeometry(RL_CONDUIT.radius, RL_CONDUIT.radius, 1, 8),
      // Rear coupling, as on every other family.
      coupling: new CylinderGeometry(0.024, 0.026, 1, 12),
      couplingRing: new TorusGeometry(0.03, 0.011, 10, 20),
      couplingTip: new CylinderGeometry(0.014, 0.014, 0.016, 14)
    }
  };
};