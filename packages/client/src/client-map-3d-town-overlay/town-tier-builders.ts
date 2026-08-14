import { TOWN_TIERS, type PieceList } from "./town-tier-shapes.js";
import type { TownColorName, TownPiece, TownSlotKey, TownTier } from "./town-tier-shapes.js";

export { TOWN_TIERS };
export type { PieceList, TownColorName, TownPiece, TownSlotKey, TownTier };

type BoxOpts = {
  readonly w?: number;
  readonly h?: number;
  readonly d?: number;
  readonly color?: TownColorName;
  readonly ry?: number;
};

type CylOpts = {
  readonly r?: number;
  readonly h?: number;
  readonly color?: TownColorName;
  readonly ry?: number;
};

type SegmentOpts = {
  readonly color?: TownColorName;
  readonly w?: number;
};

const push = (list: PieceList, piece: TownPiece): void => {
  list.push(piece);
};

export const piece = (
  list: PieceList,
  slot: TownSlotKey,
  x: number,
  y: number,
  z: number,
  opts: { readonly ry?: number; readonly sx?: number; readonly sy?: number; readonly sz?: number; readonly color?: TownColorName } = {}
): void => {
  push(list, { slot, x, y, z, ...opts });
};

export const box = (list: PieceList, x: number, z: number, y: number, opts: BoxOpts = {}): void => {
  const { w = 0.4, h = 0.5, d = w, color = "stone", ry } = opts;
  push(list, { slot: "cube", x, y: y + h / 2, z, sx: w, sy: h, sz: d, color, ...(ry !== undefined ? { ry } : {}) });
};

export const slab = (list: PieceList, x: number, z: number, y: number, opts: BoxOpts = {}): void => {
  const { w = 0.5, h = 0.1, d = w, color = "stoneLight", ry } = opts;
  push(list, { slot: "slab", x, y: y + h / 2, z, sx: w, sy: h / 0.35, sz: d, color, ...(ry !== undefined ? { ry } : {}) });
};

export const roof = (list: PieceList, x: number, z: number, y: number, opts: BoxOpts = {}): void => {
  const { w = 0.5, h = 0.3, d = w, color = "roofRed", ry } = opts;
  push(list, { slot: "pyramid", x, y: y + h / 2, z, sx: w, sy: h / 0.55, sz: d, color, ...(ry !== undefined ? { ry } : {}) });
};

export const cyl = (list: PieceList, x: number, z: number, y: number, opts: CylOpts = {}): void => {
  const { r = 0.15, h = 0.5, color = "iron", ry } = opts;
  push(list, { slot: "cyl", x, y: y + h / 2, z, sx: r / 0.3, sy: h, sz: r / 0.3, color, ...(ry !== undefined ? { ry } : {}) });
};

export const cone = (list: PieceList, x: number, z: number, y: number, opts: CylOpts = {}): void => {
  const { r = 0.15, h = 0.3, color = "slate", ry } = opts;
  push(list, { slot: "cone", x, y: y + h / 2, z, sx: r / 0.5, sy: h / 0.5, sz: r / 0.5, color, ...(ry !== undefined ? { ry } : {}) });
};

export const flare = (list: PieceList, x: number, z: number, y: number, opts: CylOpts = {}): void => {
  const { r = 0.2, h = 0.5, color = "brass", ry } = opts;
  push(list, { slot: "cylFlare", x, y: y + h / 2, z, sx: r / 0.3, sy: h / 0.5, sz: r / 0.3, color, ...(ry !== undefined ? { ry } : {}) });
};

export const dome = (list: PieceList, x: number, z: number, y: number, opts: { readonly r?: number; readonly color?: TownColorName } = {}): void => {
  const { r = 0.2, color = "slate" } = opts;
  push(list, { slot: "dome", x, y, z, sx: r / 0.35, sy: r / 0.35, sz: r / 0.35, color });
};

export const gear = (list: PieceList, x: number, z: number, y: number, opts: { readonly r?: number; readonly color?: TownColorName; readonly ry?: number } = {}): void => {
  const { r = 0.16, color = "brass", ry = 0.4 } = opts;
  push(list, { slot: "gear", x, y, z, sx: r / 0.19, sy: 1, sz: r / 0.19, color, ry });
};

export const piston = (list: PieceList, x: number, z: number, y: number, opts: { readonly h?: number; readonly color?: TownColorName; readonly ry?: number } = {}): void => {
  const { h = 0.5, color = "ironDark", ry = 0 } = opts;
  push(list, { slot: "piston", x, y: y + h / 2, z, sy: h / 0.5, color, ry });
};

const segment = (
  list: PieceList,
  slot: TownSlotKey,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  y: number,
  opts: SegmentOpts = {}
): void => {
  const { color } = opts;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len <= 0.001) return;
  push(list, {
    slot,
    x: (x1 + x2) / 2,
    y,
    z: (z1 + z2) / 2,
    sx: len,
    sy: 1,
    sz: 1,
    ry: Math.atan2(-dz, dx),
    ...(color !== undefined ? { color } : {})
  });
};

export const beam = (list: PieceList, x1: number, z1: number, x2: number, z2: number, y: number, opts: { readonly color?: TownColorName } = {}): void => {
  segment(list, "beam", x1, z1, x2, z2, y, opts);
};

export const pipe = (list: PieceList, x1: number, z1: number, x2: number, z2: number, y: number, opts: { readonly color?: TownColorName } = {}): void => {
  segment(list, "pipe", x1, z1, x2, z2, y, opts);
};

export const aetherLine = (list: PieceList, x1: number, z1: number, x2: number, z2: number, y: number): void => {
  segment(list, "aetherBeam", x1, z1, x2, z2, y);
};

export const lamp = (list: PieceList, x: number, z: number, y: number, opts: { readonly h?: number } = {}): void => {
  const { h = 0.34 } = opts;
  piston(list, x, z, y, { h });
  push(list, { slot: "aetherLamp", x, y: y + h + 0.12, z });
  push(list, { slot: "amberGlow", x, y: y + h + 0.06, z });
};

export const cottage = (list: PieceList, x: number, z: number, y: number, opts: { readonly w?: number; readonly body?: TownColorName; readonly roofColor?: TownColorName; readonly ry?: number } = {}): void => {
  const { w = 0.34, body = "wood", roofColor = "roofRed", ry } = opts;
  box(list, x, z, y, { w, h: w * 0.8, d: w, color: body, ...(ry !== undefined ? { ry } : {}) });
  roof(list, x, z, y + w * 0.8, { w: w * 1.15, h: w * 0.75, d: w * 1.15, color: roofColor, ry: ry ?? 0 });
};

export const block = (list: PieceList, x: number, z: number, y: number, opts: BoxOpts = {}): void => {
  const { w = 0.42, h = 0.55, d = w, color = "stone", ry } = opts;
  box(list, x, z, y, { w, h, d, color, ...(ry !== undefined ? { ry } : {}) });
  slab(list, x, z, y + h, { w: w * 1.06, h: 0.1, d: d * 1.06, color: "slate", ...(ry !== undefined ? { ry } : {}) });
};

export const blockStorey = (list: PieceList, x: number, z: number, y: number, opts: { readonly w?: number; readonly floors?: number; readonly color?: TownColorName } = {}): void => {
  const { w = 0.42, floors = 3, color = "stone" } = opts;
  const stepHeight = 0.3;
  let step = 0;
  for (let i = 0; i < floors; i += 1) {
    const ww = w * (1 - i * 0.12);
    box(list, x, z, y + step, { w: ww, h: stepHeight, d: ww, color });
    step += stepHeight;
  }
  slab(list, x, z, y + step, { w: w * 0.4, h: 0.1, d: w * 0.4, color: "slate" });
};

export const tower = (list: PieceList, x: number, z: number, y: number, opts: { readonly h?: number; readonly r?: number; readonly color?: TownColorName; readonly cap?: TownColorName } = {}): void => {
  const { h = 0.8, r = 0.12, color = "iron", cap = "slate" } = opts;
  cyl(list, x, z, y, { r, h, color });
  cone(list, x, z, y + h, { r: r * 1.15, h: r * 1.1, color: cap });
};

export const needle = (list: PieceList, x: number, z: number, y: number, opts: { readonly h?: number; readonly color?: TownColorName } = {}): void => {
  const { h = 1.0, color = "ironDark" } = opts;
  cyl(list, x, z, y, { r: 0.045, h, color });
};

export const workshop = (list: PieceList, x: number, z: number, y: number, opts: { readonly w?: number; readonly h?: number; readonly body?: TownColorName; readonly roofColor?: TownColorName; readonly chimney?: TownColorName } = {}): void => {
  const { w = 0.36, h = 0.4, body = "stone", roofColor = "slate", chimney = "brass" } = opts;
  box(list, x, z, y, { w, h, d: w, color: body });
  roof(list, x, z, y + h, { w: w * 1.1, h: 0.22, d: w * 1.1, color: roofColor });
  cyl(list, x + w * 0.3, z - w * 0.25, y + h, { r: 0.05, h: 0.32, color: chimney });
  cone(list, x + w * 0.3, z - w * 0.25, y + h + 0.32, { r: 0.07, h: 0.12, color: "ironDark" });
};

export const gearWall = (list: PieceList, x: number, z: number, y: number, opts: { readonly w?: number; readonly h?: number; readonly color?: TownColorName; readonly gearColor?: TownColorName } = {}): void => {
  const { w = 0.4, h = 0.3, color = "iron", gearColor = "brass" } = opts;
  slab(list, x, z, y, { w, h, d: 0.08, color });
  gear(list, x, z + 0.05, y + h * 0.6, { r: 0.13, color: gearColor });
};

export const domeOn = (list: PieceList, x: number, z: number, y: number, opts: { readonly r?: number; readonly h?: number; readonly color?: TownColorName } = {}): void => {
  const { r = 0.2, h = 0.18, color = "stone" } = opts;
  cyl(list, x, z, y, { r, h, color });
  dome(list, x, z, y + h, { r: r * 1.02, color: "slate" });
};

export const orbTopper = (list: PieceList, x: number, z: number, y: number): void => {
  push(list, { slot: "aetherOrb", x, y, z });
  push(list, { slot: "amberGlow", x, y: y - 0.08, z });
};

export const gearDeck = (list: PieceList, x: number, z: number, y: number, opts: { readonly r?: number; readonly color?: TownColorName } = {}): void => {
  const { r = 0.18, color = "brass" } = opts;
  gear(list, x, z, y, { r, color });
  push(list, { slot: "aetherOrb", x, y, z });
};

export const crane = (list: PieceList, x: number, z: number, y: number, opts: { readonly h?: number; readonly reach?: number } = {}): void => {
  const { h = 0.7, reach = 0.3 } = opts;
  cyl(list, x, z, y, { r: 0.05, h, color: "ironDark" });
  gearDeck(list, x, z, y + h, { r: 0.14 });
  beam(list, x, z, x - reach, z, y + h + 0.08, { color: "woodLight" });
  piston(list, x - reach, z, y + h + 0.02, { h: 0.16, color: "brass" });
};
