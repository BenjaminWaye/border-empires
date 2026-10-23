// Per-tree variation for the instanced forests (client-map-3d-forest.ts,
// client-map-3d-tropical-forest.ts): each tree gets its own turn, a slight
// lean, a height/width jitter and a colour shift, so a forest tile reads as
// individual trees rather than one model stamped nine times. Everything is
// hashed from the tile's WORLD coordinates plus the tree's slot in its
// layout -- never the scene position, which drifts between terrain rebuilds
// -- so the same tree always stands the same way.
import { Quaternion, Vector3, type Color, type Matrix4 } from "three";
import { mountainHash01 } from "../client-map-mountain-variation/client-map-mountain-variation.js";

const MAX_LEAN = 0.07; // radians
const HEIGHT_SPREAD = 0.14;
const WIDTH_SPREAD = 0.12;
const LIGHTNESS_SPREAD = 0.16;
const WARMTH_SPREAD = 0.06;

const UP = new Vector3(0, 1, 0);
const yawQuat = new Quaternion();
const leanQuat = new Quaternion();
const leanAxis = new Vector3();
const position = new Vector3();
const scale = new Vector3();

// The mountains' well-mixed world hash, not the forest's tileHash: tileHash
// only varies its low bits between neighbouring salts, so sibling trees came
// out nearly the same shade.
const hash01 = mountainHash01;

/**
 * One tree to place. Mutable so each forest can reuse a single scratch
 * object across a rebuild instead of allocating one per tree.
 */
export type TreePlacement = {
  x: number;
  y: number;
  z: number;
  /** The layout's size for this slot. */
  scale: number;
  worldX: number;
  worldZ: number;
  /** Slot within the tile's layout; keeps each tree's roll distinct. */
  slot: number;
  /** Remembered-tile colour, multiplied in (client-map-3d-instance-tint.ts). */
  tint: Color | undefined;
};

export const createTreePlacement = (): TreePlacement => ({ x: 0, y: 0, z: 0, scale: 1, worldX: 0, worldZ: 0, slot: 0, tint: undefined });

/** Writes the tree's instance matrix and colour into `matrix` / `color`. */
export const composeTreeInstance = (placement: Readonly<TreePlacement>, matrix: Matrix4, color: Color): void => {
  const { worldX, worldZ, slot } = placement;
  const salt = 100 + slot * 8;
  yawQuat.setFromAxisAngle(UP, hash01(worldX, worldZ, salt) * Math.PI * 2);
  const leanDirection = hash01(worldX, worldZ, salt + 1) * Math.PI * 2;
  leanAxis.set(Math.cos(leanDirection), 0, Math.sin(leanDirection));
  leanQuat.setFromAxisAngle(leanAxis, hash01(worldX, worldZ, salt + 2) * MAX_LEAN);
  const height = placement.scale * (1 - HEIGHT_SPREAD / 2 + hash01(worldX, worldZ, salt + 3) * HEIGHT_SPREAD);
  const width = placement.scale * (1 - WIDTH_SPREAD / 2 + hash01(worldX, worldZ, salt + 4) * WIDTH_SPREAD);
  matrix.compose(position.set(placement.x, placement.y, placement.z), leanQuat.multiply(yawQuat), scale.set(width, height, width));

  const light = 1 - LIGHTNESS_SPREAD / 2 + hash01(worldX, worldZ, salt + 5) * LIGHTNESS_SPREAD;
  const warm = (hash01(worldX, worldZ, salt + 6) - 0.5) * WARMTH_SPREAD;
  color.setRGB(light + warm, light, light - warm);
  if (placement.tint) color.multiply(placement.tint);
};
