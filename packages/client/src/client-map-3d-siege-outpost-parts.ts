// Siege Outpost 3D asset — piece layout. Owns no geometry or materials: it
// writes the placement for one outpost into a caller-supplied piece writer
// (the overlay in client-map-3d-siege-outpost-overlay.ts), keeping the two
// files comfortably under the 500-line cap.
//
// The concept is one COMPACT ARMORED SIEGE MACHINE planted on the battlefield:
// a single low armored hull of blackened iron and aged brass with riveted
// plates, propped on six short stabilizing legs, carrying one large
// forward-facing siege cannon and a small rotating aether targeting device on
// the rear deck. Dark iron, aged brass, subtle cyan/violet aether glow — the
// machine is the whole silhouette; nothing around it reads as a building or
// camp.

import type { Matrix4 } from "three";
import { Euler, Quaternion, Vector3 } from "three";

export type WritePiece = (
  key: string,
  ox: number,
  oy: number,
  oz: number,
  sx?: number,
  sy?: number,
  sz?: number,
  rotY?: number,
  rotX?: number,
  rotZ?: number
) => void;

export type WritePieceAlong = (key: string, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, len: number) => void;

export type SiegeOutpostPieceCtx = {
  readonly add: WritePiece;
  readonly along: WritePieceAlong;
};

export type SiegeOutpostAnimEntry = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly phase: number;
};

export type AnimatedSet = (key: string, index: number, ox: number, oy: number, oz: number, rotY: number, rotX: number, rotZ: number) => void;

// Animated per-frame rewrite keeps a fixed piece-per-instance count so the
// overlay can size each animated slot at exactly C instances. Register the
// keys here so the overlay knows which slots to spin.
export const ANIMATED_KEYS = ["targetHead"] as const;

// The rotating aether targeting head on the rear deck.
const TARGET = { ox: -0.24, oy: 0.44, oz: 0.12 };

// ─── Static layout (one call per outpost) ──────────────────────────────
export const writeSiegeOutpostPieces = (ctx: SiegeOutpostPieceCtx, x: number, y: number, z: number): void => {
  const a = ctx.add;
  const along = ctx.along;

  // Six short stabilizing legs splayed out to the ground — the heavy
  // mechanical base the hull is planted on.
  along("legFL", x - 0.32, y + 0.13, z + 0.18, -0.18, -0.9, 0.16, 0.3);
  along("legFR", x + 0.32, y + 0.13, z + 0.18, 0.18, -0.9, 0.16, 0.3);
  along("legML", x - 0.38, y + 0.13, z, -0.22, -0.9, 0, 0.32);
  along("legMR", x + 0.38, y + 0.13, z, 0.22, -0.9, 0, 0.32);
  along("legRL", x - 0.32, y + 0.13, z - 0.18, -0.18, -0.9, -0.16, 0.3);
  along("legRR", x + 0.32, y + 0.13, z - 0.18, 0.18, -0.9, -0.16, 0.3);

  // Armored hull: one low, wide black-iron body with a brass trim band and
  // a sloped front glacis.
  a("hull", x, y + 0.16, z, 0.8, 0.22, 0.54);
  a("hullPlate", x, y + 0.285, z, 0.86, 0.02, 0.6);
  a("glacis", x + 0.47, y + 0.1, z, 0.16, 0.24, 0.52, 0, 0, -0.45);

  // Brass rivets along the hull flanks.
  a("rivetA", x - 0.36, y + 0.1, z + 0.2, 0.3, 0.3, 0.3);
  a("rivetB", x - 0.36, y + 0.1, z - 0.2, 0.3, 0.3, 0.3);
  a("rivetC", x + 0.36, y + 0.1, z + 0.2, 0.3, 0.3, 0.3);
  a("rivetD", x + 0.36, y + 0.1, z - 0.2, 0.3, 0.3, 0.3);
  a("rivetE", x, y + 0.1, z + 0.26, 0.3, 0.3, 0.3);
  a("rivetF", x, y + 0.1, z - 0.26, 0.3, 0.3, 0.3);

  // Large forward-facing siege cannon on top of the hull.
  a("turretPintle", x + 0.02, y + 0.32, z, 0.32, 0.07, 0.32);
  a("recoilHousing", x + 0.04, y + 0.4, z, 0.36, 0.16, 0.2);
  along("barrel", x + 0.34, y + 0.4, z, 1, 0, 0, 0.46);
  along("barrelBand", x + 0.18, y + 0.4, z, 1, 0, 0, 0.12);
  a("muzzleBrake", x + 0.6, y + 0.4, z, 0.09, 0.2, 0.26);

  // Glowing cyan aether capacitor on the cannon housing.
  a("coreLens", x - 0.16, y + 0.49, z, 0.75, 0.75, 0.75);

  // Rear-top aether targeting device; the head itself rotates per-frame.
  a("targetBase", x - 0.24, y + 0.3, z + 0.12, 0.16, 0.05, 0.16);
  a("targetPintle", x - 0.24, y + 0.36, z + 0.12, 0.05, 0.06, 0.05);
};

// ─── Animated layout (rewritten every frame per outpost) ───────────────
export const writeSiegeOutpostAnimated = (
  set: AnimatedSet,
  nowMs: number,
  entry: SiegeOutpostAnimEntry,
  index: number
): void => {
  const { x, y, z, phase } = entry;
  // The targeting head sweeps as it tracks; per-tile phase keeps neighbors
  // from spinning in perfect lockstep.
  const spin = nowMs * 0.0016 + phase;
  set("targetHead", index, x + TARGET.ox, y + TARGET.oy, z + TARGET.oz, spin, 0, 0);
};

// Shared matrix math for animated rewrites (imported by the overlay).

const _euler = new Euler();
const _quat = new Quaternion();
const _pos = new Vector3();
const _scale = new Vector3(1, 1, 1);

export const composeAnimatedMatrix = (matrix: Matrix4, ox: number, oy: number, oz: number, rotY: number, rotX: number, rotZ: number): void => {
  _pos.set(ox, oy, oz);
  _euler.set(rotX, rotY, rotZ, "XYZ");
  _quat.setFromEuler(_euler);
  matrix.compose(_pos, _quat, _scale);
};