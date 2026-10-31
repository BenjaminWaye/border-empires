// Part tables for the 3D harbour: the quay on a dock tile and the landing
// slipways on the beaches beside it (its landing ground). Both are modelled
// facing +z (the sea); the overlay rotates each instance toward its water.
// Units are tiles: x and z span -0.5..0.5, y is height above the land surface.
//
// Lore (docs/lore/galactic-lore.md): frontier ground runs on ordinary
// machinery -- coal, steam, timber and iron, no aether-work (§4); coasts back
// Coin through freight and tolls (§11); a harbour puts landings ashore at the
// quay or on the beaches beside it, and those landings are supplied by sea
// (§10). It is a transport hub, not a fortification: no guns, no walls.

export const HARBOUR_SLOT = {
  stone: 0,
  ironEdge: 1,
  deck: 2,
  pile: 3,
  bollard: 4,
  plaster: 5,
  roof: 6,
  darkTimber: 7,
  lampGlow: 8,
  brass: 9,
  ironRod: 10,
  boiler: 11,
  crate: 12,
  barrel: 13,
  coal: 14,
  hull: 15,
  paddleBox: 16,
  railIron: 17,
  ironCap: 18,
  brassDrum: 19
} as const;

export type HarbourSlot = (typeof HARBOUR_SLOT)[keyof typeof HARBOUR_SLOT];

/** Which unit geometry a slot uses: a 1x1x1 box, a cylinder or cone 1 across and 1 tall, or a square pyramid. */
export type HarbourShape = "box" | "cylinder" | "cone" | "pyramid";

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
  // Stone quay on the landward half, iron-capped along its sea edge, and a timber pier on piles reaching over the water.
  part(S.stone, 0, 0.04, -0.12, 0.88, 0.08, 0.62),
  part(S.ironEdge, 0, 0.085, 0.185, 0.88, 0.02, 0.035),
  part(S.deck, 0.06, 0.075, 0.37, 0.3, 0.04, 0.4),
  part(S.pile, -0.06, -0.03, 0.3, 0.045, 0.22, 0.045),
  part(S.pile, 0.18, -0.03, 0.3, 0.045, 0.22, 0.045),
  part(S.pile, -0.06, -0.03, 0.52, 0.045, 0.22, 0.045),
  part(S.pile, 0.18, -0.03, 0.52, 0.045, 0.22, 0.045),
  part(S.bollard, -0.34, 0.11, 0.15, 0.045, 0.05, 0.045),
  part(S.bollard, 0.36, 0.11, 0.15, 0.045, 0.05, 0.045),
  // Toll and harbourmaster's house: lit windows, a toll board over the door, slate roof and chimney.
  part(S.plaster, -0.24, 0.2, -0.24, 0.28, 0.24, 0.24),
  part(S.roof, -0.24, 0.39, -0.24, 0.34, 0.14, 0.3),
  part(S.stone, -0.33, 0.43, -0.3, 0.05, 0.14, 0.05),
  part(S.darkTimber, -0.24, 0.15, -0.115, 0.07, 0.12, 0.012),
  part(S.lampGlow, -0.32, 0.24, -0.115, 0.05, 0.05, 0.012),
  part(S.lampGlow, -0.16, 0.24, -0.115, 0.05, 0.05, 0.012),
  part(S.brass, -0.24, 0.3, -0.113, 0.12, 0.03, 0.01),
  // Coal-fired steam derrick: boiler and funnel, mast, boom out over the pier, stays, and a hoisted crate.
  part(S.boiler, 0.25, 0.13, -0.2, 0.14, 0.1, 0.14),
  part(S.ironCap, 0.31, 0.25, -0.26, 0.035, 0.14, 0.035),
  part(S.ironRod, 0.25, 0.38, -0.2, 0.04, 0.42, 0.04),
  rod(S.ironRod, [0.25, 0.28, -0.2], [0.2, 0.62, 0.3], 0.03),
  rod(S.ironRod, [0.25, 0.59, -0.2], [0.2, 0.62, 0.3], 0.012),
  rod(S.ironRod, [0.25, 0.59, -0.2], [0.33, 0.09, -0.42], 0.012),
  rod(S.ironRod, [0.2, 0.62, 0.3], [0.2, 0.31, 0.3], 0.01),
  part(S.crate, 0.2, 0.27, 0.3, 0.09, 0.09, 0.09, 0, 0.3),
  part(S.brassDrum, 0.25, 0.2, -0.09, 0.06, 0.12, 0.06, 0, 0, PIO2),
  part(S.coal, 0.37, 0.11, -0.02, 0.13, 0.07, 0.13),
  // Freight waiting on the quay.
  part(S.crate, -0.02, 0.125, -0.02, 0.09, 0.09, 0.09),
  part(S.crate, 0.07, 0.12, -0.05, 0.08, 0.08, 0.08, 0, 0.4),
  part(S.crate, 0.0, 0.205, -0.03, 0.07, 0.07, 0.07, 0, -0.3),
  part(S.barrel, -0.09, 0.12, 0.1, 0.06, 0.08, 0.06),
  part(S.barrel, -0.16, 0.12, 0.08, 0.06, 0.08, 0.06),
  // Harbour lamp on the pier head, for the sea lane.
  part(S.ironRod, 0.2, 0.22, 0.52, 0.025, 0.26, 0.025),
  part(S.lampGlow, 0.2, 0.37, 0.52, 0.045, 0.045, 0.045),
  part(S.ironCap, 0.2, 0.41, 0.52, 0.06, 0.04, 0.06),
  // Paddle-steamer ferry moored alongside: hull, deck, cabin, funnel, side wheel and gangplank.
  part(S.hull, -0.19, 0.0, 0.4, 0.16, 0.08, 0.38),
  part(S.deck, -0.19, 0.045, 0.4, 0.15, 0.012, 0.36),
  part(S.plaster, -0.19, 0.09, 0.37, 0.1, 0.07, 0.14),
  part(S.lampGlow, -0.19, 0.095, 0.299, 0.06, 0.025, 0.01),
  part(S.ironCap, -0.19, 0.17, 0.42, 0.04, 0.12, 0.04),
  part(S.brassDrum, -0.19, 0.225, 0.42, 0.046, 0.015, 0.046),
  part(S.paddleBox, -0.28, 0.04, 0.42, 0.12, 0.04, 0.12, 0, 0, PIO2),
  part(S.deck, -0.07, 0.065, 0.4, 0.1, 0.01, 0.05)
];

// The slipway ramp falls from the beach into the sea at this pitch.
const RAMP_PITCH = Math.atan2(0.16, 0.77);

/** A landing slipway on a beach of the dock's landing ground. `core` parts form the shrunk slipway. */
export const SLIPWAY_PARTS: readonly HarbourPart[] = [
  // Timber ramp with iron rails running down into the water.
  part(S.deck, 0, -0.02, 0.24, 0.34, 0.03, 0.78, RAMP_PITCH, 0, 0, true),
  part(S.railIron, -0.1, 0.0, 0.24, 0.025, 0.02, 0.78, RAMP_PITCH, 0, 0, true),
  part(S.railIron, 0.1, 0.0, 0.24, 0.025, 0.02, 0.78, RAMP_PITCH, 0, 0, true),
  part(S.stone, 0, 0.03, -0.2, 0.42, 0.06, 0.14),
  // Flat-bottomed landing barge hauled up the ramp, bow ramp lowered toward the beach.
  part(S.hull, 0, 0.05, 0.25, 0.22, 0.08, 0.34, RAMP_PITCH, 0, 0, true),
  part(S.railIron, 0, 0.065, 0.045, 0.2, 0.015, 0.1, -0.5, 0, 0, true),
  part(S.deck, -0.11, 0.1, 0.25, 0.015, 0.03, 0.32, RAMP_PITCH, 0, 0, true),
  part(S.deck, 0.11, 0.1, 0.25, 0.015, 0.03, 0.32, RAMP_PITCH, 0, 0, true),
  part(S.plaster, 0, 0.12, 0.36, 0.12, 0.07, 0.08, RAMP_PITCH, 0, 0, true),
  part(S.ironCap, 0, 0.18, 0.38, 0.035, 0.1, 0.035, 0, 0, 0, true),
  // Winch hauling the barge up, a lantern for night landings, and supplies brought by sea.
  part(S.darkTimber, 0.21, 0.12, -0.3, 0.05, 0.18, 0.05),
  part(S.brassDrum, 0.21, 0.17, -0.25, 0.05, 0.1, 0.05, 0, 0, PIO2),
  rod(S.ironRod, [0.21, 0.17, -0.24], [0, 0.1, 0.08], 0.01),
  part(S.ironRod, -0.22, 0.14, -0.3, 0.02, 0.22, 0.02),
  part(S.lampGlow, -0.22, 0.27, -0.3, 0.04, 0.04, 0.04),
  part(S.ironCap, -0.22, 0.305, -0.3, 0.05, 0.03, 0.05),
  part(S.crate, -0.2, 0.08, -0.12, 0.08, 0.08, 0.08, 0, 0.2),
  part(S.crate, -0.29, 0.075, -0.04, 0.07, 0.07, 0.07, 0, -0.35),
  part(S.barrel, 0.24, 0.08, -0.1, 0.06, 0.08, 0.06)
];

/** Shrunk slipway: core parts at this scale, pushed seaward so the ramp sits on the waterline beside the tile's other structure. */
export const SHRUNK_SLIPWAY_SCALE = 0.6;
export const SHRUNK_SLIPWAY_SEAWARD_OFFSET = 0.32;

/** (shape, material key) for every slot, in HARBOUR_SLOT order. */
export const HARBOUR_SLOT_LOOKS: ReadonlyArray<readonly [HarbourShape, string]> = [
  ["box", "stone"], ["box", "iron"], ["box", "deck"], ["cylinder", "darkTimber"], ["cylinder", "iron"],
  ["box", "plaster"], ["pyramid", "slate"], ["box", "darkTimber"], ["box", "lampGlow"], ["box", "brass"],
  ["cylinder", "iron"], ["cylinder", "boilerIron"], ["box", "crate"], ["cylinder", "barrel"], ["cone", "coal"],
  ["box", "hull"], ["cylinder", "hull"], ["box", "iron"], ["cylinder", "iron"], ["cylinder", "brass"]
];
