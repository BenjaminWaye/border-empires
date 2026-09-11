// Siege Outpost 3D asset — piece layout. Owns no geometry or materials: it
// writes the placement for one outpost into a caller-supplied piece writer
// (the overlay in client-map-3d-siege-outpost-overlay.ts), keeping the two
// files comfortably under the 500-line cap.
//
// The concept is a FORWARD ATTACK BASE: a wide, low, heavily engineered
// staging ground rather than a tower. A dark-iron command platform with brass
// trim sits at the heart of a cluster of connected mechanical decks; a short
// command mast is topped by a glowing aether lens wrapped in two rotating
// brass rings. Around it: ammo crates, a weapon rack, supply containers,
// small engineering workshops with steam vents, fuel tanks with brass feed
// pipes, a winch, a compact loading crane, fabricated cables/wires, and two
// forward-facing deployment ramps. Signal lamps, ward flags and a semaphore
// arm reinforce the army-of-the-frontier story. Low and wide silhouette, no
// walls, no fortress masonry.

import type { Matrix4 } from "three";
import { Euler, Quaternion, Vector3 } from "three";

const PI_2 = Math.PI / 2;

export const REAR_Z = -0.08;
export const MAST_TOP_Y = 0.685;

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

// Orientations above the dial are baked into writeAnimatedPieces; the pieces
// that only need a hash-seeded phase get theirs from the instance record.
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
export const ANIMATED_KEYS = ["ringLow", "ringHigh", "flagL", "flagR", "steamL", "steamR", "semaArm"] as const;

const RING_Y = [0.63, 0.71];
const RING_SPEED = [0.0009, 0.00062];
const RING_TILT = [PI_2 - 0.22, PI_2 + 0.16];

const FLAG_L = { ox: -0.2, oy: 0.375, oz: -0.21 };
const FLAG_R = { ox: 0.28, oy: 0.33, oz: -0.17 };
const STEAM_L = { ox: -0.335, oy: 0.44, oz: 0.06 };
const STEAM_R = { ox: 0.335, oy: 0.44, oz: 0.06 };
const SEMAPHORE = { ox: -0.4, oy: 0.33, oz: 0.1 };

// ─── Static layout (one call per outpost) ──────────────────────────────
export const writeSiegeOutpostPieces = (ctx: SiegeOutpostPieceCtx, x: number, y: number, z: number): void => {
  const a = ctx.add;
  const along = ctx.along;

  // Low ground plinth: the whole camp is one parked platform.
  a("plinth", x, y + 0.045, z - 0.02, 0.94, 0.09, 0.54);
  a("plinthTrim", x, y + 0.107, z - 0.275, 0.98, 0.018, 0.03);

  // Front staging apron (deployment side) and its forward rail.
  a("apron", x, y + 0.085, z + 0.34, 0.6, 0.09, 0.2);

  // Two mechanical side decks bolted onto the platform.
  a("deckL", x - 0.335, y + 0.105, z - 0.04, 0.33, 0.09, 0.22);
  a("deckR", x + 0.335, y + 0.105, z - 0.04, 0.33, 0.09, 0.22);

  // Armoured brass-trimmed command platform.
  a("platform", x, y + 0.155, REAR_Z, 0.46, 0.14, 0.3);
  a("platformRim", x, y + 0.228, REAR_Z, 0.5, 0.02, 0.34);

  // Command mast: dark iron, brass band, aether lens above.
  a("mast", x, y + 0.43, REAR_Z, 1, 0.4, 1);
  a("mastBand", x, y + 0.505, REAR_Z, 1, 1, 1, 0, PI_2, 0);
  a("aetherCore", x, y + 0.685, REAR_Z, 1, 1, 1);
  a("aetherCollar", x, y + 0.65, REAR_Z, 1, 1, 1, 0, PI_2, 0);
  a("lensTip", x, y + 0.735, REAR_Z, 1, 1, 1);

  // Aether conduits: violet feed pipes drinking from the fringes.
  along("aetherPipe", x - 0.18, y + 0.38, REAR_Z - 0.01, 0.3, 0.24, 0.03, 0.39);
  along("aetherPipe", x + 0.26, y + 0.16, z - 0.16, -0.24, 0.08, 0.12, 0.25);
  a("aetherBand", x, y + 0.26, REAR_Z, 1, 1, 1, 0, PI_2, 0);

  // Small engineering workshops on both side decks (steam vents on the roofs).
  a("shopL", x - 0.335, y + 0.2, z + 0.06, 0.15, 0.16, 0.14);
  a("roofL", x - 0.335, y + 0.3, z + 0.06, 0.17, 0.025, 0.16);
  a("ventRingL", x - 0.335, y + 0.315, z + 0.06, 1, 1, 1, 0, PI_2, 0);
  a("shopR", x + 0.335, y + 0.2, z + 0.06, 0.15, 0.16, 0.14);
  a("roofR", x + 0.335, y + 0.3, z + 0.06, 0.17, 0.025, 0.16);
  a("ventRingR", x + 0.335, y + 0.315, z + 0.06, 1, 1, 1, 0, PI_2, 0);

  // Fuel tanks with brass bands, piped toward the mast.
  a("tank", x - 0.41, y + 0.2, z - 0.18, 1, 0.22, 1);
  a("tank", x - 0.29, y + 0.2, z - 0.18, 1, 0.22, 1);
  a("tankBand", x - 0.41, y + 0.13, z - 0.18, 1, 1, 1, 0, PI_2, 0);
  a("tankBand", x - 0.41, y + 0.26, z - 0.18, 1, 1, 1, 0, PI_2, 0);
  a("tankBand", x - 0.29, y + 0.13, z - 0.18, 1, 1, 1, 0, PI_2, 0);
  a("tankBand", x - 0.29, y + 0.26, z - 0.18, 1, 1, 1, 0, PI_2, 0);
  along("tankPipe", x - 0.35, y + 0.135, REAR_Z, 0.22, 0.02, 0.03, 0.22);
  along("pipeUp", x + 0.05, y + 0.31, REAR_Z, 0, 1, 0, 0.3);

  // Strapped supply containers on the right deck.
  a("containerA", x + 0.315, y + 0.225, z - 0.17, 0.16, 0.15, 0.18);
  a("containerBandA", x + 0.315, y + 0.235, z - 0.17, 0.165, 0.02, 0.185);
  a("containerBandA", x + 0.315, y + 0.165, z - 0.17, 0.165, 0.02, 0.185);
  a("containerB", x + 0.215, y + 0.2, z - 0.22, 0.12, 0.12, 0.14);

  // Ammo crates stacked on the forward apron.
  a("crate", x + 0.2, y + 0.185, z + 0.34, 0.1, 0.1, 0.11);
  a("crate", x + 0.195, y + 0.265, z + 0.345, 0.095, 0.095, 0.105, 0.2);
  a("crate", x + 0.29, y + 0.175, z + 0.29, 0.085, 0.09, 0.09, -0.4);

  // Timber weapon rack with a siege rifle on the rails.
  a("rackPost", x - 0.25, y + 0.205, z + 0.4, 0.02, 0.15, 0.02);
  a("rackPost", x - 0.17, y + 0.205, z + 0.4, 0.02, 0.15, 0.02);
  along("rackBeam", x - 0.21, y + 0.24, z + 0.4, 1, 0, 0, 0.1);
  along("rackBeam", x - 0.21, y + 0.3, z + 0.4, 1, 0, 0, 0.1);
  along("rackGun", x - 0.21, y + 0.345, z + 0.4, 1, 0, 0, 0.14);

  // Compact loading crane on the apron front-left.
  a("cranePost", x - 0.14, y + 0.31, z + 0.4, 1, 0.36, 1);
  along("craneJib", x - 0.03, y + 0.45, z + 0.415, 0.26, -0.03, 0.05, 0.27);
  along("craneCable", x + 0.11, y + 0.34, z + 0.435, 0, -1, 0, 0.22);
  a("craneHook", x + 0.11, y + 0.225, z + 0.435, 0.03, 0.03, 0.03);

  // Winch on the right deck hauling a cable toward the gate.
  a("winchBase", x + 0.43, y + 0.19, z + 0.1, 0.1, 0.07, 0.08);
  a("winchDrum", x + 0.43, y + 0.225, z + 0.1, 1, 1, 1);
  along("winchCable", x + 0.425, y + 0.185, z + 0.2, -0.01, -0.07, 0.2, 0.21);

  // Fabbed cable runs between the platform and side decks.
  along("wire", x - 0.165, y + 0.145, z - 0.05, 0.16, 0.03, 0, 0.165);
  along("wire", x + 0.165, y + 0.145, z + 0.02, -0.16, 0.03, 0, 0.165);

  // Forward deployment ramps: two sloping plates with outer rails.
  a("rampL", x - 0.075, y + 0.075, z + 0.47, 0.1, 0.02, 0.26, 0, -0.18, 0);
  a("rampR", x + 0.075, y + 0.075, z + 0.47, 0.1, 0.02, 0.26, 0, -0.18, 0);
  a("rampRailL", x - 0.11, y + 0.1, z + 0.47, 0.014, 0.014, 0.26, 0, -0.18, 0);
  a("rampRailR", x + 0.11, y + 0.1, z + 0.47, 0.014, 0.014, 0.26, 0, -0.18, 0);
  a("rampSide", x - 0.51, y + 0.055, z - 0.04, 0.28, 0.02, 0.1, 0, 0, 0.16);

  // Signal lamps on the apron corners and perimeter.
  a("lampStand", x - 0.1, y + 0.21, z + 0.3, 1, 0.16, 1);
  a("lampHousing", x - 0.1, y + 0.315, z + 0.3, 1, 1, 1);
  a("lampGlow", x - 0.1, y + 0.32, z + 0.3, 1, 1, 1);
  a("lampStand", x + 0.34, y + 0.2, z + 0.3, 1, 0.15, 1);
  a("lampHousing", x + 0.34, y + 0.3, z + 0.3, 1, 1, 1);
  a("lampGlow", x + 0.34, y + 0.305, z + 0.3, 1, 1, 1);
  a("lampStand", x + 0.06, y + 0.195, z - 0.28, 1, 0.13, 1);
  a("lampHousing", x + 0.06, y + 0.29, z - 0.28, 1, 1, 1);
  a("lampGlow", x + 0.06, y + 0.295, z - 0.28, 1, 1, 1);
  a("lampStand", x + 0.42, y + 0.215, z - 0.16, 1, 0.14, 1);
  a("lampHousing", x + 0.42, y + 0.315, z - 0.16, 1, 1, 1);
  a("lampGlow", x + 0.42, y + 0.32, z - 0.16, 1, 1, 1);

  // Ward flag phases on the rear bulk.
  a("flagPost", x - 0.2, y + 0.22, z - 0.22, 1, 0.3, 1);
  a("flagPost", x + 0.28, y + 0.2, z - 0.18, 1, 0.26, 1);

  // Semaphore mast with a fixed lower arm.
  a("semiPost", x - 0.4, y + 0.19, z + 0.1, 1, 0.24, 1);
  a("semiArmA", x - 0.4, y + 0.27, z + 0.1, 0.06, 0.16, 0.02, -0.5, 0, 0.3);
};

// ─── Animated layout (rewritten every frame per outpost) ───────────────
export const writeSiegeOutpostAnimated = (
  set: AnimatedSet,
  nowMs: number,
  entry: SiegeOutpostAnimEntry,
  index: number
): void => {
  const { x, y, z, phase } = entry;
  const t = nowMs + phase * 1000;

  // Rotating brass rings around the aether lens.
  set("ringLow", index, x, y + RING_Y[0]!, REAR_Z, t * RING_SPEED[0]!, 0, RING_TILT[0]!);
  set("ringHigh", index, x, y + RING_Y[1]!, REAR_Z, -t * RING_SPEED[1]!, 0, RING_TILT[1]!);

  // Waving ward flags.
  const sway = Math.sin(t * 0.003) * 0.14;
  set("flagL", index, x + FLAG_L.ox, y + FLAG_L.oy, z + FLAG_L.oz, 0.6 + sway * 0.5, 0, sway);
  set("flagR", index, x + FLAG_R.ox, y + FLAG_R.oy, z + FLAG_R.oz, 2.5 - sway * 0.5, 0, -sway);

  // Steam venting from the workshop roofs (looping rise).
  const riseA = (t * 0.001 + phase * 3) % 3;
  set("steamL", index, x + STEAM_L.ox + Math.sin(riseA * 5) * 0.03, y + STEAM_L.oy + riseA * 0.14, z + STEAM_L.oz + Math.cos(riseA * 4) * 0.02, 1, 0, 0);
  const riseB = (t * 0.0012 + phase * 3) % 3;
  set("steamR", index, x + STEAM_R.ox + Math.sin(riseB * 5 + 1) * 0.03, y + STEAM_R.oy + riseB * 0.14, z + STEAM_R.oz + Math.cos(riseB * 4 + 2) * 0.02, 1, 0, 0);

  // Semaphore upper arm swinging against the sky.
  set("semaArm", index, x + SEMAPHORE.ox, y + SEMAPHORE.oy, z + SEMAPHORE.oz, 0.2 + Math.sin(t * 0.0015) * 0.55, 0, 0.55);
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