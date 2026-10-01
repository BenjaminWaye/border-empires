// The part catalogue for the Thunderplate Induction (TPL) module: every
// geometry and material the module is built from, plus the profile constants
// the placement code builds against.
//
// This lives apart from the module itself because a part catalogue is a
// self-contained unit of work — it declares what the induction rig is made of,
// and the module file only decides where each piece sits. It is also the only
// place that needs to change when a piece's proportions move.
//
// MAIN_READ: this module manufactures electrically charged armor plate for
// Thunder Bastions, and the whole point of the family is ONE dominant readable
// mechanism: a huge induction coil wrapped around a thick armored plate blank.
// The blank hangs horizontal above the pod — a heavy, unfinished titanium-grey
// slab (paler inset where it has not been charged yet) — and three broad
// copper coil loops stand on edge around it, hugging the blank tight like a
// solenoid magnetized around its length. Two chunky electrode columns rise at
// the plate's long ends and reach in with a contact pad a few millimetres off
// the metal; a bright cyan-white arc jumps each gap between the energizing
// contacts and the plate. On the pod behind, a compact transformer block feeds
// the whole rig. It is electrically energized armor production, deliberately
// distinct from the Bastion Master-Die which physically stamps armor instead.
//
// Strong readable silhouette from strategy-game camera distance — rounded pod +
// thick armor plate + oversized induction coil + two chunky electrode arms with
// glowing arcs — in the shared materials of the ring: blackened iron, dark
// steel, titanium-grey armor, aged brass, aged copper coils, and a bright
// cyan-white electrical glow.
//
// Local axes (shared with every AFC family): +X is FORWARD — the socket's
// outward radial direction — and the rear coupling hangs at -X. The plate and
// its coil sit centred on the pod with their long axis along X; the two
// electrode columns straddle the plate's long ends in X, and the transformer
// block rides the pod behind the blank.

import { BoxGeometry, BufferGeometry, CapsuleGeometry, CylinderGeometry, MeshStandardMaterial, TorusGeometry } from "three";

// Pod: the same 0.075 radius capsule every other family docks with.
export const TPL_POD = { y: 0.082, squash: 0.74, radius: 0.075 };
export const TPL_POD_CROWN = TPL_POD.y + (TPL_POD.radius + 0.01) * TPL_POD.squash;
// Plate: the heavy unfinished armor blank held horizontal above the pod — a
// thick slab of titanium-grey armor steel, read as an armor plate mid-production.
export const TPL_PLATE = { w: 0.095, h: 0.018, d: 0.075, y: 0.185 };
// Plate_Blank: a paler inner panel on the blank's top showing the armor has not
// been charged — the unfinished region of the plate.
export const TPL_PLATE_BLANK = { w: 0.075, h: 0.006, d: 0.055, y: 0.194 };
// Coil_Ring: the oversized induction coil — three BROAD copper loops standing
// on edge around the plate's short dimension (axis along X), far thicker than
// wire so the coil reads as one dominant machine.
export const TPL_COIL_RING = { radius: 0.045, tube: 0.0065, y: 0.185 };
export const TPL_RING_STATIONS_X = [-0.032, 0, 0.032];
// Electrode: two chunky vertical columns rising at the plate's long ends, each
// with a brass collar at its base and a horizontal head reaching in toward the
// plate's end face, leaving a narrow air gap for the arc.
export const TPL_ELECTRODE_COLUMN = { w: 0.02, d: 0.02, yC: 0.193, h: 0.094, x: 0.078 };
export const TPL_ELECTRODE_COLLAR = { w: 0.024, d: 0.024, h: 0.006, y: 0.154, x: 0.078 };
export const TPL_ELECTRODE_HEAD = { x: 0.06, w: 0.016, h: 0.012, d: 0.014, y: 0.185 };
// Arc: a bright cyan-white electric spark jumping each contact gap. Two small
// nodes per side, offset vertically, read as a live arc rather than a wire.
export const TPL_ARC = { w: 0.006, h: 0.004, d: 0.005, x: 0.04975, nodeYs: [0.1885, 0.1815] };
// Transformer: the compact capacitor block on the pod behind the assembly,
// feeding the induction system, capped in brass and finned in copper.
export const TPL_CAPACITOR = { w: 0.024, h: 0.03, d: 0.05, x: -0.05, y: 0.15 };
export const TPL_CAPACITOR_CAP = { w: 0.028, h: 0.006, d: 0.054, x: -0.05, y: 0.168 };
export const TPL_CAPACITOR_FIN = { w: 0.004, h: 0.02, d: 0.012, x: -0.058, y: 0.15, z: 0.014 };
// The module's tallest point: the electrode columns' terminals, 0.24 local =
// 0.3192 world, under the 0.34 ceiling.
export const TPL_TOWER_TOP = TPL_ELECTRODE_COLUMN.yC + TPL_ELECTRODE_COLUMN.h * 0.5;

export type ThunderplateInductionMaterials = {
  readonly iron: MeshStandardMaterial;
  readonly steel: MeshStandardMaterial;
  // The armor-grade titanium steel the plate blank is hammered out of — clearly
  // lighter than the blackened iron frame so the blank hits the eye first.
  readonly steelTitan: MeshStandardMaterial;
  // The paler un-energized inset of the unfinished blank.
  readonly blankSteel: MeshStandardMaterial;
  readonly brass: MeshStandardMaterial;
  // The aged copper the broad coil loops are wound from — warmer and more
  // reddish than the brass trim, so the coil reads as its own material.
  readonly copper: MeshStandardMaterial;
  // The bright cyan-white electric arcs, the family's defining glow, plus the
  // cyan AFC contact tip on the rear coupling.
  readonly arc: MeshStandardMaterial;
  readonly cyan: MeshStandardMaterial;
};

export type ThunderplateInductionGeometries = {
  readonly base: BufferGeometry;
  readonly baseRing: BufferGeometry;
  readonly pod: BufferGeometry;
  readonly podBand: BufferGeometry;
  readonly plate: BufferGeometry;
  readonly blank: BufferGeometry;
  readonly ring: BufferGeometry;
  readonly column: BufferGeometry;
  readonly columnCollar: BufferGeometry;
  readonly head: BufferGeometry;
  readonly arc: BufferGeometry;
  readonly capacitor: BufferGeometry;
  readonly capacitorCap: BufferGeometry;
  readonly capacitorFin: BufferGeometry;
  readonly coupling: BufferGeometry;
  readonly couplingRing: BufferGeometry;
  readonly couplingTip: BufferGeometry;
};

export type ThunderplateInductionParts = {
  readonly geometries: ThunderplateInductionGeometries;
  readonly materials: ThunderplateInductionMaterials;
};

export const createThunderplateInductionParts = (): ThunderplateInductionParts => {
  const iron = new MeshStandardMaterial({ color: "#22242a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const steel = new MeshStandardMaterial({ color: "#17181d", roughness: 0.62, metalness: 0.5, flatShading: true });
  const steelTitan = new MeshStandardMaterial({ color: "#8e9497", roughness: 0.42, metalness: 0.72, flatShading: true });
  const blankSteel = new MeshStandardMaterial({ color: "#a9b0b6", roughness: 0.45, metalness: 0.68, flatShading: true });
  const brass = new MeshStandardMaterial({ color: "#8b6c3d", roughness: 0.42, metalness: 0.85, flatShading: true });
  const copper = new MeshStandardMaterial({ color: "#9c5a35", roughness: 0.38, metalness: 0.9, flatShading: true });
  const arc = new MeshStandardMaterial({
    color: "#101a1d",
    roughness: 0.3,
    metalness: 0.1,
    flatShading: true,
    emissive: "#c9f7ff",
    emissiveIntensity: 1.0
  });
  const cyan = new MeshStandardMaterial({
    color: "#0d2430",
    roughness: 0.32,
    metalness: 0.15,
    flatShading: true,
    emissive: "#37b6d6",
    emissiveIntensity: 1.0
  });

  // Small curved parts use high segment counts so flat-shaded facets never read
  // as black crease lines (see the Siege Lens Foundry module notes).
  return {
    materials: { iron, steel, steelTitan, blankSteel, brass, copper, arc, cyan },
    geometries: {
      base: new CylinderGeometry(0.1, 0.105, 0.032, 16),
      baseRing: new TorusGeometry(0.12, 0.012, 12, 28),
      pod: new CapsuleGeometry(TPL_POD.radius, 0.02, 6, 16),
      podBand: new TorusGeometry(0.079, 0.011, 10, 26),
      // The heavy unfinished armor blank and its paler inner region.
      plate: new BoxGeometry(TPL_PLATE.w, TPL_PLATE.h, TPL_PLATE.d),
      blank: new BoxGeometry(TPL_PLATE_BLANK.w, TPL_PLATE_BLANK.h, TPL_PLATE_BLANK.d),
      // The three broad coil loops — ring tori with their hole along X.
      ring: new TorusGeometry(TPL_COIL_RING.radius, TPL_COIL_RING.tube, 9, 28),
      // The two chunky electrode columns, their brass collars and reaching heads.
      column: new BoxGeometry(TPL_ELECTRODE_COLUMN.w, TPL_ELECTRODE_COLUMN.h, TPL_ELECTRODE_COLUMN.d),
      columnCollar: new BoxGeometry(TPL_ELECTRODE_COLLAR.w, TPL_ELECTRODE_COLLAR.h, TPL_ELECTRODE_COLLAR.d),
      head: new BoxGeometry(TPL_ELECTRODE_HEAD.w, TPL_ELECTRODE_HEAD.h, TPL_ELECTRODE_HEAD.d),
      // The bright cyan-white arc nodes.
      arc: new BoxGeometry(TPL_ARC.w, TPL_ARC.h, TPL_ARC.d),
      // The compact transformer block behind the assembly.
      capacitor: new BoxGeometry(TPL_CAPACITOR.w, TPL_CAPACITOR.h, TPL_CAPACITOR.d),
      capacitorCap: new BoxGeometry(TPL_CAPACITOR_CAP.w, TPL_CAPACITOR_CAP.h, TPL_CAPACITOR_CAP.d),
      capacitorFin: new BoxGeometry(TPL_CAPACITOR_FIN.w, TPL_CAPACITOR_FIN.h, TPL_CAPACITOR_FIN.d),
      // Rear coupling, as on every other family.
      coupling: new CylinderGeometry(0.024, 0.026, 1, 12),
      couplingRing: new TorusGeometry(0.03, 0.011, 10, 20),
      couplingTip: new CylinderGeometry(0.014, 0.014, 0.016, 14)
    }
  };
};