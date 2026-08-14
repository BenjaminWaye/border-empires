import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  OctahedronGeometry,
  SphereGeometry
} from "three";

// Shared vocabulary for the five steampunk settlement tiers. Each tier
// layers the SAME low/mid-poly piece slots in a different composition, so
// the whole progression reads as one city family growing from a frontier
// pump-house to a monumental aether metropolis.

export type TownTier = "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";

// ---------------------------------------------------------------- palette

export const TOWN_PALETTE = {
  ironDark: "#2e3138",
  iron: "#454a52",
  charcoal: "#23262b",
  stone: "#8a8478",
  stoneLight: "#b5ae9f",
  brass: "#b3833a",
  brassDark: "#7a5a26",
  brassLight: "#d4a653",
  wood: "#54361f",
  woodLight: "#6b4a30",
  slate: "#4c5663",
  slateLight: "#66707e",
  roofRed: "#8c4030"
} as const;

export type TownColorName = keyof typeof TOWN_PALETTE;

// ------------------------------------------------------------- slot keys

// Colorable slots share one instanced material; per-instance colour is
// written via setColorAt, so a slot's palette-consistent tint stays cheap.
export type ColorableTownSlot =
  | "cube"
  | "slab"
  | "beam"
  | "pyramid"
  | "cone"
  | "cyl"
  | "cylFlare"
  | "dome"
  | "pipe"
  | "gear"
  | "piston";

// Glow slots render with dedicated fixed emissive materials (no instance
// colour): aether-teal for aether power, warm amber for clockwork signal.
export type GlowTownSlot = "aetherLamp" | "aetherOrb" | "aetherBeam" | "amberGlow";

export type TownSlotKey = ColorableTownSlot | GlowTownSlot;

export type TownSlotKind = "iron" | "aether" | "amber";

// Every slot geometry is modelled at unit scale (roughly 1×1×1 in the
// tile's local space); the engine scales per piece.
export type TownSlotDef = {
  readonly key: TownSlotKey;
  readonly kind: TownSlotKind;
  // Capacity multiplier: cap = ceil(maxTiles * factor).
  readonly factor: number;
  readonly makeGeo: () =>
    | BoxGeometry
    | ConeGeometry
    | CylinderGeometry
    | OctahedronGeometry
    | SphereGeometry;
};

const box = (w: number, h: number, d: number): BoxGeometry => new BoxGeometry(w, h, d);

export const TOWN_SLOT_DEFS: ReadonlyArray<TownSlotDef> = [
  // Structural iron/stone/brass family.
  { key: "cube", kind: "iron", factor: 3.0, makeGeo: () => box(1, 1, 1) },
  { key: "slab", kind: "iron", factor: 3.0, makeGeo: () => box(1, 0.08, 1) },
  { key: "beam", kind: "iron", factor: 1.5, makeGeo: () => box(1, 0.09, 0.09) },
  { key: "pyramid", kind: "iron", factor: 2.0, makeGeo: () => {
    const g = new ConeGeometry(0.85, 0.55, 4, 1);
    g.rotateY(Math.PI / 4);
    return g;
  } },
  { key: "cone", kind: "iron", factor: 2.0, makeGeo: () => new ConeGeometry(0.55, 1, 8, 1) },
  { key: "cyl", kind: "iron", factor: 2.5, makeGeo: () => new CylinderGeometry(0.5, 0.5, 1, 8, 1) },
  { key: "cylFlare", kind: "iron", factor: 2.0, makeGeo: () => new CylinderGeometry(0.42, 0.62, 1, 8, 1) },
  { key: "dome", kind: "iron", factor: 1.5, makeGeo: () => new SphereGeometry(0.5, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2) },
  { key: "pipe", kind: "iron", factor: 2.5, makeGeo: () => {
    const g = new CylinderGeometry(0.05, 0.05, 1, 6, 1);
    g.rotateX(Math.PI / 2);
    return g;
  } },
  { key: "gear", kind: "iron", factor: 2.0, makeGeo: () => new CylinderGeometry(0.5, 0.5, 0.09, 12, 1) },
  { key: "piston", kind: "iron", factor: 1.5, makeGeo: () => new CylinderGeometry(0.035, 0.035, 1, 6, 1) },
  // Emissive aether/amber glows (fixed materials, no per-instance colour).
  { key: "aetherLamp", kind: "aether", factor: 2.5, makeGeo: () => new OctahedronGeometry(0.55) },
  { key: "aetherOrb", kind: "aether", factor: 1.0, makeGeo: () => new SphereGeometry(0.5, 12, 10) },
  { key: "aetherBeam", kind: "aether", factor: 1.5, makeGeo: () => box(1, 0.06, 0.06) },
  { key: "amberGlow", kind: "amber", factor: 1.5, makeGeo: () => new OctahedronGeometry(0.55) }
];

// ------------------------------------------------------------- piece model

export type TownPiece =
  | {
      readonly slot: GlowTownSlot;
      readonly x: number;
      readonly z: number;
      readonly y: number;
      readonly sx: number;
      readonly sy: number;
      readonly sz: number;
      readonly ry: number;
    }
  | {
      readonly slot: ColorableTownSlot;
      readonly color: TownColorName;
      readonly x: number;
      readonly z: number;
      readonly y: number;
      readonly sx: number;
      readonly sy: number;
      readonly sz: number;
      readonly ry: number;
    };

export type TownLayout = ReadonlyArray<TownPiece>;

// ------------------------------------------------------------------ DSL

// y is the piece CENTER in tile-local space, measured above the tile
// surface. Geometry is modelled unit-scale around its own origin, so the
// composition helpers below translate to "place X resting on top of Y".

export const piece = (
  slot: ColorableTownSlot,
  color: TownColorName,
  x: number,
  z: number,
  y: number,
  sx = 1,
  sy = 1,
  sz = 1,
  ry = 0
): TownPiece => ({ slot, color, x, z, y, sx, sy, sz, ry });

export const glow = (
  slot: GlowTownSlot,
  x: number,
  z: number,
  y: number,
  sx = 1,
  sy = 1,
  sz = 1,
  ry = 0
): TownPiece => ({ slot, x, z, y, sx, sy, sz, ry });

// Rectangular building with a pyramid roof.
export const cottage = (
  x: number,
  z: number,
  w: number,
  h: number,
  d: number,
  wall: TownColorName,
  roof: TownColorName = "charcoal"
): TownPiece[] => [
  piece("cube", wall, x, z, h * 0.5, w, h, d),
  piece("pyramid", roof, x, z, h + 0.275, (w * 1.14) / 1.7, 1, (d * 1.14) / 1.7)
];

// Flat-topped multi-storey block with a coping trim.
export const block = (
  x: number,
  z: number,
  w: number,
  h: number,
  d: number,
  wall: TownColorName,
  trim: TownColorName = "slateLight"
): TownPiece[] => [
  piece("cube", wall, x, z, h * 0.5, w, h, d),
  piece("slab", trim, x, z, h + 0.045, w * 1.04, 1.1, d * 1.04)
];

export const blockStorey = (
  x: number,
  z: number,
  w: number,
  hFloor: number,
  d: number,
  wall: TownColorName,
  base: number,
  trim: TownColorName = "slateLight"
): TownPiece[] => [
  piece("cube", wall, x, z, base + hFloor * 0.5, w * 0.94, hFloor, d * 0.94),
  piece("slab", trim, x, z, base + hFloor + 0.045, w * 0.97, 1.1, d * 0.97)
];

// Flared smokestack with a cone cap.
export const tower = (
  x: number,
  z: number,
  h: number,
  body: TownColorName = "brass",
  cap: TownColorName = "brassDark",
  w = 1,
  base = 0
): TownPiece[] => [
  piece("cylFlare", body, x, z, base + h * 0.5, w, h, w),
  piece("cone", cap, x, z, base + h + 0.18, w * 0.9, 0.36, w * 0.9)
];

// Narrow clockwork needle (lighthouse / pylon torso).
export const needle = (
  x: number,
  z: number,
  h: number,
  body: TownColorName = "iron",
  base = 0,
  w = 0.1
): TownPiece[] => [piece("cyl", body, x, z, base + h * 0.5, w, h, w)];

// Workhouse: box body + thin chimney + a couple of low vents.
export const workshop = (
  x: number,
  z: number,
  w: number,
  h: number,
  d: number,
  wall: TownColorName,
  roof: TownColorName = "slateLight",
  stackH: number,
  stack: TownColorName = "charcoal"
): TownPiece[] => [
  ...block(x, z, w, h, d, wall, roof),
  piece("cyl", stack, x + w * 0.32, z - d * 0.26, h + stackH * 0.5, 0.05, stackH, 0.05),
  piece("dome", stack, x + w * 0.32, z - d * 0.26, h + stackH + 0.1, 0.05, 0.05, 0.05),
  piece("cyl", stack, x - w * 0.3, z + 0.05, 0.16, 0.05, 0.12, 0.05)
];

// Gear bolted to a wall or stack. `d` is the gear diameter in tile units.
export const gearWall = (
  x: number,
  z: number,
  yBase: number,
  d: number,
  col: TownColorName = "brass"
): TownPiece[] => [piece("gear", col, x, z, yBase + 0.05, d, 1, d)];

// Aether conduit line (raised glowing beam).
export const aetherLine = (
  x: number,
  z: number,
  y: number,
  len: number,
  ry = 0,
  slot: GlowTownSlot = "aetherBeam"
): TownPiece[] => [glow(slot, x, z, y, len, 1, 1, ry)];

// Overhead pipe run on thin posts.
export const pipeLine = (
  x: number,
  z: number,
  y: number,
  len: number,
  ry = 0,
  col: TownColorName = "ironDark"
): TownPiece[] => [piece("pipe", col, x, z, y, len, 1, 1, ry)];

// Street lamp: thin post + aether crystal.
export const lamp = (x: number, z: number, postH: number): TownPiece[] => [
  piece("piston", "ironDark", x, z, postH * 0.38, 1, postH * 0.76, 1),
  glow("aetherLamp", x, z, postH * 0.76 + 0.03, 0.1, 0.1, 0.1)
];

// Dome cap resting on a surface. Scaled so a small w gives a squat hat
// instead of a tall glass dome floating above the base.
export const domeOn = (
  x: number,
  z: number,
  base: number,
  w: number,
  col: TownColorName = "brass"
): TownPiece[] => [piece("dome", col, x, z, base + w * 0.5, w * 2, w * 2, w * 2)];

// Aether orb resting on a surface with a tiny spire tip.
export const orbTopper = (
  x: number,
  z: number,
  base: number,
  s: number
): TownPiece[] => [
  glow("aetherOrb", x, z, base + s, s * 2, s * 2, s * 2),
  glow("amberGlow", x, z, base + s * 2 + 0.02, s, s, s)
];

// Small flat rotary gear atop a boss.
export const gearDeck = (
  x: number,
  z: number,
  y: number,
  d: number,
  col: TownColorName = "brass"
): TownPiece[] => [piece("gear", col, x, z, y + 0.05, d, 1, d)];