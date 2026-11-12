// Part tables for the 3D harbour: the quay on a dock tile and the landing
// slipways on the beaches beside it (its landing ground). Both are modelled
// facing +z (the sea); the overlay rotates each instance toward its water.
// Units are tiles: x and z span -0.5..0.5, y is height above the land surface.
//
// Look: the shared structure palette (client-map-3d-town-overlay/town-mesh-builder.ts
// TOWN_COLORS, the refineries, mines and Harbor Exchange) -- a black-and-gold
// marble quay on a charcoal marble course with a brass inlay, grey stone,
// blackened iron and aged brass, warm lamplight. The quay keeps its layout
// (client-wreck-models/dock-fire-model.ts burns on these positions).
//
// Lore (docs/lore/galactic-lore.md §10 "What a harbour looks like"): a House
// port -- powered gantry, cell bank, sealed containers and the armoured troop
// carriers that make sea crossings (§11); coasts back Coin through freight and
// tolls; a harbour puts landings ashore at the quay or on the beaches beside
// it, supplied by sea. It is a transport hub, not a fortification: no guns, no walls.

export const HARBOUR_SLOT = {
  marble: 0,
  ironEdge: 1,
  deck: 2,
  pile: 3,
  post: 4,
  wall: 5,
  glass: 6,
  trim: 7,
  lampGlow: 8,
  brass: 9,
  ironRod: 10,
  cell: 11,
  crate: 12,
  drum: 13,
  status: 14,
  hull: 15,
  hullDrum: 16,
  course: 17,
  ironCap: 18,
  brassDrum: 19
} as const;

export type HarbourSlot = (typeof HARBOUR_SLOT)[keyof typeof HARBOUR_SLOT];

/** Which unit geometry a slot uses: a 1x1x1 box, or a cylinder 1 across and 1 tall. */
export type HarbourShape = "box" | "cylinder";

export type HarbourPart = {
  readonly slot: HarbourSlot;
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly rx: number;
  readonly ry: number;
  readonly rz: number;
  /** Slipway parts kept when the beach also holds another structure (the shrunk slipway). */
  readonly core: boolean;
};

const PIO2 = Math.PI / 2;

const part = (slot: HarbourSlot, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0, core = false): HarbourPart =>
  ({ slot, cx, cy, cz, sx, sy, sz, rx, ry, rz, core });

// A cylinder of the given thickness from a to b (rigging, cables, booms).
const rod = (slot: HarbourSlot, a: readonly [number, number, number], b: readonly [number, number, number], thickness: number, core = false): HarbourPart => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz);
  return part(
    slot, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2,
    thickness, length, thickness,
    Math.acos(Math.min(1, Math.max(-1, dy / length))), Math.atan2(dx, dz), 0, core
  );
};

const S = HARBOUR_SLOT;

/** The harbour quay on the dock tile. */
export const QUAY_PARTS: readonly HarbourPart[] = [
  // Marble quay like the structures' plinths: a charcoal course, a brass inlay
  // and a black-and-gold top (paving at y = 0.085), iron-capped along the sea edge.
  part(S.course, 0, 0.03, -0.12, 0.9, 0.06, 0.64),
  part(S.brass, 0, 0.065, -0.12, 0.885, 0.012, 0.625),
  part(S.marble, 0, 0.078, -0.12, 0.86, 0.014, 0.6),
  part(S.ironEdge, 0, 0.09, 0.185, 0.88, 0.02, 0.035),
  // Harbour control office: grey stone under a brass cornice and iron roof
  // slab, an iron door, a lit glazed band, the toll board and a sensor mast.
  part(S.ironEdge, -0.24, 0.15, -0.117, 0.07, 0.12, 0.012),
  part(S.wall, -0.24, 0.2, -0.24, 0.28, 0.23, 0.24),
  part(S.trim, -0.24, 0.322, -0.24, 0.3, 0.016, 0.26),
  part(S.ironEdge, -0.24, 0.34, -0.24, 0.26, 0.02, 0.22),
  part(S.glass, -0.24, 0.25, -0.117, 0.24, 0.05, 0.008),
  part(S.lampGlow, -0.24, 0.222, -0.115, 0.24, 0.008, 0.008),
  part(S.brass, -0.24, 0.3, -0.113, 0.14, 0.018, 0.01),
  part(S.ironRod, -0.33, 0.43, -0.31, 0.016, 0.16, 0.016),
  part(S.status, -0.33, 0.515, -0.31, 0.022, 0.022, 0.022),
  // Iron-plated pier on blackened piles, brass-railed along its sea end.
  part(S.deck, 0.06, 0.075, 0.37, 0.3, 0.035, 0.4),
  part(S.trim, 0.06, 0.1, 0.565, 0.3, 0.014, 0.014),
  part(S.pile, -0.06, -0.03, 0.3, 0.045, 0.22, 0.045),
  part(S.pile, 0.18, -0.03, 0.3, 0.045, 0.22, 0.045),
  part(S.pile, -0.06, -0.03, 0.52, 0.045, 0.22, 0.045),
  part(S.pile, 0.18, -0.03, 0.52, 0.045, 0.22, 0.045),
  // Lamp posts along the sea edge, as on the structures' platforms: blackened post, brass collar, warm lamp.
  part(S.post, -0.37, 0.13, 0.15, 0.045, 0.09, 0.045),
  part(S.post, 0.37, 0.13, 0.15, 0.045, 0.09, 0.045),
  part(S.brassDrum, -0.37, 0.18, 0.15, 0.055, 0.014, 0.055),
  part(S.brassDrum, 0.37, 0.18, 0.15, 0.055, 0.014, 0.055),
  part(S.lampGlow, -0.37, 0.2, 0.15, 0.028, 0.026, 0.028),
  part(S.lampGlow, 0.37, 0.2, 0.15, 0.028, 0.026, 0.028),
  // Powered gantry crane: two iron legs with cyan status strips, a brass-striped
  // beam reaching out over the pier, its trolley, hoist line and a lifted container.
  part(S.ironEdge, 0.2, 0.29, -0.33, 0.05, 0.41, 0.05),
  part(S.ironEdge, 0.2, 0.29, 0.12, 0.05, 0.41, 0.05),
  part(S.ironEdge, 0.2, 0.52, 0.07, 0.06, 0.05, 0.9),
  part(S.trim, 0.2, 0.548, 0.07, 0.066, 0.008, 0.9),
  part(S.status, 0.226, 0.29, -0.33, 0.004, 0.3, 0.02),
  part(S.status, 0.226, 0.29, 0.12, 0.004, 0.3, 0.02),
  part(S.brass, 0.2, 0.48, 0.34, 0.08, 0.03, 0.08),
  rod(S.ironRod, [0.2, 0.465, 0.34], [0.2, 0.33, 0.34], 0.01),
  part(S.crate, 0.2, 0.29, 0.34, 0.08, 0.07, 0.14),
  // Power-cell bank feeding the crane: a brass-banded cell with a lit charge ring.
  part(S.cell, 0.36, 0.16, -0.18, 0.11, 0.15, 0.11),
  part(S.brassDrum, 0.36, 0.2, -0.18, 0.12, 0.016, 0.12),
  part(S.status, 0.36, 0.24, -0.18, 0.06, 0.01, 0.06),
  // Sealed cargo containers waiting on the quay, and brass fuel drums.
  part(S.crate, -0.02, 0.135, -0.02, 0.16, 0.1, 0.09),
  part(S.crate, 0.02, 0.135, 0.08, 0.16, 0.1, 0.09),
  part(S.crate, 0.0, 0.235, 0.03, 0.15, 0.1, 0.09, 0, 0.1),
  part(S.status, 0.02, 0.16, 0.126, 0.1, 0.008, 0.004),
  part(S.drum, -0.13, 0.125, 0.1, 0.06, 0.08, 0.06),
  part(S.drum, -0.16, 0.125, 0.03, 0.06, 0.08, 0.06),
  // Harbour beacon on the pier head, for the sea lane.
  part(S.ironRod, 0.2, 0.22, 0.52, 0.025, 0.26, 0.025),
  part(S.lampGlow, 0.2, 0.37, 0.52, 0.045, 0.045, 0.045),
  part(S.ironCap, 0.2, 0.41, 0.52, 0.06, 0.04, 0.06),
  // Armoured troop carrier moored alongside (world bible §11): plated hull with
  // a raked bow door, brass waterline, a bridge with a lit screen, sensor mast and gangway.
  part(S.hull, -0.19, 0.0, 0.37, 0.17, 0.09, 0.34),
  part(S.hull, -0.19, 0.02, 0.565, 0.17, 0.05, 0.09, -0.6),
  part(S.trim, -0.19, 0.035, 0.37, 0.176, 0.012, 0.346),
  part(S.deck, -0.19, 0.05, 0.37, 0.15, 0.012, 0.32),
  part(S.wall, -0.19, 0.1, 0.29, 0.11, 0.08, 0.1),
  part(S.lampGlow, -0.19, 0.115, 0.341, 0.08, 0.02, 0.004),
  part(S.hullDrum, -0.19, 0.155, 0.27, 0.05, 0.03, 0.05),
  part(S.ironRod, -0.19, 0.22, 0.27, 0.012, 0.1, 0.012),
  part(S.status, -0.19, 0.275, 0.27, 0.018, 0.018, 0.018),
  part(S.deck, -0.07, 0.065, 0.4, 0.1, 0.01, 0.05)
];

// The slipway ramp falls from the beach into the sea at this pitch.
const RAMP_PITCH = Math.atan2(0.16, 0.77);

/** A landing slipway on a beach of the dock's landing ground. `core` parts form the shrunk slipway. */
export const SLIPWAY_PARTS: readonly HarbourPart[] = [
  // Iron-plated ramp with brass rails running down into the water from a marble head.
  part(S.deck, 0, -0.02, 0.24, 0.34, 0.03, 0.78, RAMP_PITCH, 0, 0, true),
  part(S.trim, -0.1, 0.0, 0.24, 0.025, 0.02, 0.78, RAMP_PITCH, 0, 0, true),
  part(S.trim, 0.1, 0.0, 0.24, 0.025, 0.02, 0.78, RAMP_PITCH, 0, 0, true),
  part(S.course, 0, 0.025, -0.2, 0.42, 0.05, 0.14),
  part(S.brass, 0, 0.054, -0.2, 0.41, 0.008, 0.13),
  part(S.marble, 0, 0.064, -0.2, 0.39, 0.012, 0.11),
  // Armoured landing barge hauled up the ramp, bow door lowered toward the
  // beach, brass gunwales, a grey wheelhouse and its sensor mast.
  part(S.hull, 0, 0.05, 0.25, 0.22, 0.08, 0.34, RAMP_PITCH, 0, 0, true),
  part(S.ironEdge, 0, 0.065, 0.045, 0.2, 0.015, 0.1, -0.5, 0, 0, true),
  part(S.trim, -0.11, 0.1, 0.25, 0.015, 0.03, 0.32, RAMP_PITCH, 0, 0, true),
  part(S.trim, 0.11, 0.1, 0.25, 0.015, 0.03, 0.32, RAMP_PITCH, 0, 0, true),
  part(S.wall, 0, 0.12, 0.36, 0.12, 0.07, 0.08, RAMP_PITCH, 0, 0, true),
  part(S.ironRod, 0, 0.19, 0.38, 0.012, 0.1, 0.012, 0, 0, 0, true),
  part(S.status, 0, 0.245, 0.38, 0.018, 0.018, 0.018, 0, 0, 0, true),
  // Winch hauling the barge up, a lamp post for night landings, and containers brought by sea.
  part(S.ironEdge, 0.21, 0.12, -0.3, 0.05, 0.18, 0.05),
  part(S.brassDrum, 0.21, 0.17, -0.25, 0.05, 0.1, 0.05, 0, 0, PIO2),
  rod(S.ironRod, [0.21, 0.17, -0.24], [0, 0.1, 0.08], 0.01),
  part(S.post, -0.22, 0.14, -0.3, 0.035, 0.22, 0.035),
  part(S.lampGlow, -0.22, 0.27, -0.3, 0.04, 0.04, 0.04),
  part(S.ironCap, -0.22, 0.305, -0.3, 0.05, 0.03, 0.05),
  part(S.crate, -0.22, 0.08, -0.1, 0.13, 0.08, 0.08, 0, 0.2),
  part(S.crate, -0.27, 0.075, 0.0, 0.11, 0.07, 0.07, 0, -0.35),
  part(S.drum, 0.24, 0.08, -0.1, 0.06, 0.08, 0.06)
];

/** Shrunk slipway: core parts at this scale, pushed seaward so the ramp sits on the waterline beside the tile's other structure. */
export const SHRUNK_SLIPWAY_SCALE = 0.6;
export const SHRUNK_SLIPWAY_SEAWARD_OFFSET = 0.32;

/** (shape, material key) for every slot, in HARBOUR_SLOT order. Material keys are createDockOverlay's. */
export const HARBOUR_SLOT_LOOKS: ReadonlyArray<readonly [HarbourShape, string]> = [
  ["box", "blackMarble"], ["box", "iron"], ["box", "plate"], ["cylinder", "ironDark"], ["cylinder", "ironDark"],
  ["box", "stone"], ["box", "glass"], ["box", "brassDark"], ["box", "lampGlow"], ["box", "brass"],
  ["cylinder", "iron"], ["cylinder", "ironDark"], ["box", "crate"], ["cylinder", "brassDark"], ["box", "status"],
  ["box", "hull"], ["cylinder", "hull"], ["box", "charcoalMarble"], ["cylinder", "iron"], ["cylinder", "brass"]
];
