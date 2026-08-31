// 3D Aether Tower — body module. One instance of the empire's Aether
// transmission spire: a dark-iron hexagonal plinth anchoring a narrow tapering
// brass shaft, strung with copper bands, vertical conduits and hipped support
// struts. Around the glowing cyan aether core float several brass energy rings
// with travelling light beads, flanked by geometric prism emitters; a spinal
// aether conduit feeds a tall spire finial while free-floating motes spiral
// upward past the core — a machine built to reach into and manipulate the
// Aether, not an observatory.
//
// This module writes *pieces* for one tower into a caller-supplied slot
// writer; it never owns geometry or materials. The overlay builds those slots
// and drives writeTowerPieces per instance, then rewriteTowerAnimated every
// frame to spin the rings, wind the cogs and carry the motes upward.
//
// Animated slots use a fixed stride per tower (recorded as the base index of
// the first piece of that key for the instance) so update() can overwrite
// exactly the used prefix of each InstancedMesh without re-uploading the whole
// buffer.

import { Euler, Matrix4, Quaternion, Vector3 } from "three";

export type WritePiece = (
  key: string,
  ox: number,
  oy: number,
  oz: number,
  sx?: number,
  sz?: number,
  sy?: number,
  rotY?: number,
  rotX?: number,
  rotZ?: number
) => void;

export type TowerBodyContext = {
  readonly addPiece: WritePiece;
  readonly addPieceAlong: (key: string, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, len: number) => void;
};

export type TowerPlacement = {
  readonly x: number;
  readonly z: number;
  readonly phase: number;
  // 0..3 — how strongly this tower gathers the surrounding network.
  readonly level: number;
  // Ring scale for the synchronized nexus assembly (0 hides it entirely).
  readonly nexus: number;
};

export type RewriteSet = (key: string, index: number, matrix: Matrix4) => void;
export type RewriteCtx = {
  readonly set: RewriteSet;
  readonly markDirty: (key: string) => void;
};

export type TowerAnimEntry = TowerPlacement & {
  readonly bases: Readonly<Record<string, number>>;
};

// ─── Dimensions (shared with the overlay's geometry construction) ──────────
export const TOWER = {
  plinthRadiusTop: 0.34,
  plinthRadiusBottom: 0.38,
  plinthHeight: 0.07,
  plinthTrimRadius: 0.375,
  groundGlyphRadius: 0.48,
  rivetCount: 4,
  shaftShoulderRadius: 0.14,
  shaftRadiusTop: 0.07,
  shaftRadiusBottom: 0.1,
  shaftBaseY: 0.12,
  shaftTopY: 1.12,
  conduitRadius: 0.09,
  coreY: 0.72,
  coreRadius: 0.17,
  coreTall: 1.55,
  coreInnerRadius: 0.105,
  emitterRadius: 0.19,
  emitterLen: 0.16,
  emitterTipRadius: 0.3,
  spinalBottomY: 0.45,
  spinalTopY: 1.52,
  spireBaseY: 1.14,
  spireTopY: 2.3,
  spireBandY: 1.86,
  spireTipY: 2.34,
  gearX: 0.145,
  gearY: 0.18,
  gearRadius: 0.08,
  gearTeeth: 4,
  cogCount: 2,
  // Floating core rings (3 per tower) and their light beads (1 each).
  ringCount: 3,
  ringRadius: 0.31,
  ringY: [0.5, 0.72, 0.94],
  ringTiltX: [0.0, 0.2, -0.18],
  ringTiltZ: [0.14, 0.0, 0.16],
  ringSpeed: [0.0006, 0.00082, 0.0005],
  beadsPerRing: 1,
  // Synchronized nexus rings (always reserved; scaled to zero when alone).
  nexusRingCount: 3,
  nexusRingRadius: 0.46,
  nexusRingTiltX: [0.6, 1.05, 0.85],
  nexusRingTiltZ: [0.35, -0.42, 0.55],
  nexusRingSpeed: [0.00055, 0.0007, 0.00062],
  nexusScaleByLevel: [0.0001, 0.5, 0.8, 1.15],
  nexusGlyphByLevel: [0.0001, 0.55, 0.82, 1.08],
  nexusHaloCount: 1,
  // Free motes spiralling upward beside the core (2 per tower).
  moteCount: 2,
  moteRadius: [0.34, 0.3, 0.37],
  moteLowY: [0.28, 0.95, 1.4],
  moteHighY: [0.62, 1.5, 2.02],
  moteOrbitSpeed: [0.0011, 0.0015, 0.0009],
  moteRisePeriod: [2600, 1900, 3400]
};

const PI_2 = Math.PI / 2;

export const makeTowerStep = (index: number, count: number): number => (index / count) * Math.PI * 2;

export const writeTowerPieces = (ctx: TowerBodyContext, t: TowerPlacement): void => {
  const { addPiece, addPieceAlong } = ctx;
  const nex = t.nexus;

  // Hexagonal dark-iron plinth with rivets, a brass trim ring and the ground
  // glyph that grows as the tower joins the network.
  addPiece("plinth", 0, TOWER.plinthHeight / 2, 0);
  addPiece("plinthTrim", 0, TOWER.plinthHeight + 0.008, 0, 1, 1, 1, 0, PI_2, 0);
  // The ground glyph and nexus assembly scale to zero on a solo tower; skip
  // them entirely so their instances, buffers and per-frame rewrites are
  // avoided until the tower actually joins the network.
  if (nex > 0.001) {
    addPiece("groundGlyph", 0, 0.02, 0, nex, nex, 1, 0, PI_2, 0);
  }
  for (let i = 0; i < TOWER.rivetCount; i += 1) {
    const a = makeTowerStep(i, TOWER.rivetCount);
    addPiece("rivet", Math.cos(a) * (TOWER.plinthTrimRadius - 0.05), TOWER.plinthHeight + 0.006, Math.sin(a) * (TOWER.plinthTrimRadius - 0.05));
  }

  // Tapering brass shaft with copper bands and a wide iron shoulder.
  addPiece("shaftShoulder", 0, 0.09, 0);
  addPiece("shaft", 0, (TOWER.shaftBaseY + TOWER.shaftTopY) / 2, 0, 1, 1, TOWER.shaftTopY - TOWER.shaftBaseY);
  addPiece("band", 0, 0.34, 0, 1, 1, 1, 0, PI_2, 0);
  addPiece("band", 0, 0.8, 0, 1, 1, 1, 0, PI_2, 0);

  // Vertical conduits hugging the shaft.
  const shaftLen = TOWER.shaftTopY - TOWER.shaftBaseY;
  const cd = TOWER.conduitRadius;
  for (const [ox, oz] of [[cd, cd], [-cd, -cd], [cd, -cd], [-cd, cd]] as const) {
    addPiece("conduit", ox, (TOWER.shaftBaseY + TOWER.shaftTopY) / 2, oz, 1, 1, shaftLen);
  }

  // Hipped iron struts bracing the shoulder up into the core region.
  for (let i = 0; i < 4; i += 1) {
    const a = makeTowerStep(i, 4) + Math.PI / 4;
    addPieceAlong("strut", Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15, Math.cos(a) * 0.03, 0.33, Math.sin(a) * 0.03, 0.34);
  }

  // Two standing brass cogs wound by the aether stream (disc + teeth each).
  for (let g = 0; g < TOWER.cogCount; g += 1) {
    const gx = g === 0 ? TOWER.gearX : -TOWER.gearX;
    addPiece("cog", gx, TOWER.gearY, 0, 1, 1, 1, 0, 0, 0);
    for (let i = 0; i < TOWER.gearTeeth; i += 1) {
      const a = makeTowerStep(i, TOWER.gearTeeth);
      addPiece("cogTooth", gx + Math.cos(a) * (TOWER.gearRadius + 0.008), TOWER.gearY, Math.sin(a) * (TOWER.gearRadius + 0.008), 1, 1, 1, a);
    }
  }

  // Glowing aether core: outer halo, sculpted core and bright core shaft.
  addPiece("coreHalo", 0, TOWER.coreY, 0, 1, 1, 1.62);
  addPiece("core", 0, TOWER.coreY, 0, 1, 1, TOWER.coreTall);
  addPiece("coreInner", 0, TOWER.coreY, 0, 1, 1, 1.5);
  if (nex > 0.001) {
    for (let h = 0; h < TOWER.nexusHaloCount; h += 1) {
      const w = h === 0 ? 1.75 : 2.25;
      addPiece("nexusHalo", 0, TOWER.coreY, 0, nex * w, nex * w, nex * w * 1.6, 0, 0.4 + h * 0.25, 0);
    }
  }

  // Geometric brass emitters beaming outward from the core on the diagonals.
  for (let i = 0; i < 4; i += 1) {
    const a = makeTowerStep(i, 4) + Math.PI / 4;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    addPieceAlong("emitter", cx * (TOWER.emitterRadius - 0.02), TOWER.coreY, cz * (TOWER.emitterRadius - 0.02), cx, 0, cz, TOWER.emitterLen);
    addPiece("emitterTip", cx * TOWER.emitterTipRadius, TOWER.coreY, cz * TOWER.emitterTipRadius, 1, 1, 1, 0, a, 0);
  }

  // Spinal aether conduit conveying energy up to the spire finial.
  addPiece("spinal", 0, (TOWER.spinalBottomY + TOWER.spinalTopY) / 2, 0, 1, 1, TOWER.spinalTopY - TOWER.spinalBottomY);

  // Floating brass energy rings, then their light beads (each key contiguous
  // so the animated rewrite can address them by base index + offset).
  for (let r = 0; r < TOWER.ringCount; r += 1) {
    addPiece("ringCore", 0, TOWER.ringY[r]!, 0, 1, 1, 1, 0, PI_2 + TOWER.ringTiltX[r]!, TOWER.ringTiltZ[r]!);
  }
  for (let r = 0; r < TOWER.ringCount; r += 1) {
    for (let b = 0; b < TOWER.beadsPerRing; b += 1) {
      const ba = (b / TOWER.beadsPerRing) * Math.PI * 2;
      addPiece("ringNode", Math.cos(ba) * TOWER.ringRadius, TOWER.ringY[r]!, Math.sin(ba) * TOWER.ringRadius, 1, 1, 1, 0, 0, 0);
    }
  }

  // Synchronized nexus rings + beads (scale 0 when solo), plus one additive
  // glow ring that marks the field at core height.
  if (nex > 0.001) {
    for (let r = 0; r < TOWER.nexusRingCount; r += 1) {
      addPiece("nexusRing", 0, TOWER.coreY, 0, nex, nex, nex, 0, TOWER.nexusRingTiltX[r]!, TOWER.nexusRingTiltZ[r]!);
    }
    for (let r = 0; r < TOWER.nexusRingCount; r += 1) {
      for (let b = 0; b < TOWER.beadsPerRing; b += 1) {
        const ba = (b / TOWER.beadsPerRing) * Math.PI * 2;
        addPiece("nexusRingNode", Math.cos(ba) * nex * TOWER.nexusRingRadius, TOWER.coreY, Math.sin(ba) * nex * TOWER.nexusRingRadius, 1, 1, 1, 0, 0, 0);
      }
    }
    addPiece("nexusGlow", 0, TOWER.coreY + 0.12, 0, nex, nex, 1, 0, PI_2, 0);
  }

  // Spire: copper-banded brass needle with a glowing finial cap.
  addPiece("spire", 0, (TOWER.spireBaseY + TOWER.spireTopY) / 2, 0, 1, 1, TOWER.spireTopY - TOWER.spireBaseY);
  addPiece("spireBand", 0, TOWER.spireBandY, 0, 1, 1, 1, 0, PI_2, 0);
  addPiece("spireTip", 0, TOWER.spireTipY, 0);

  // Free-floating motes spiralling upward along the tower.
  for (let m = 0; m < TOWER.moteCount; m += 1) {
    addPiece("mote", TOWER.moteRadius[m]!, TOWER.moteLowY[m]!, 0, 1, 1, 1, 0, 0, 0);
  }
};
// ─── Animated rewriting ────────────────────────────────────────────────────
// Scratch allocators shared across rewrite helpers (single-threaded).
const scrMatrix = new Matrix4();
const scrPos = new Vector3();
const scrScale = new Vector3();
const scrQuat = new Quaternion();
const scrEuler = new Euler();

export const composePieceMatrix = (
  x: number,
  y: number,
  z: number,
  rotX = 0,
  rotY = 0,
  rotZ = 0,
  sx = 1,
  sy = 1,
  sz = 1
): Matrix4 => {
  scrEuler.set(rotX, rotY, rotZ, "XYZ");
  scrQuat.setFromEuler(scrEuler);
  scrPos.set(x, y, z);
  scrScale.set(sx, sy, sz);
  return scrMatrix.compose(scrPos, scrQuat, scrScale);
};

// A bead riding the rim of a (possibly tilted) ring. The ring's plane is the
// result of rotating its local XZ circle by the same Euler the ring mesh uses,
// so the bead position is just (r·cos, centerY, r·sin) — the spin rotates the
// whole assembly when the update loop hands the ring its per-frame yaw.
const ringBeadMatrix = (
  radius: number,
  beadAngle: number,
  centerX: number,
  centerY: number,
  centerZ: number,
  scale: number
): Matrix4 =>
  scrMatrix.compose(
    scrPos.set(centerX + Math.cos(beadAngle) * radius, centerY, centerZ + Math.sin(beadAngle) * radius),
    scrQuat.identity(),
    scrScale.set(scale, scale, scale * 1.2)
  );

export const ANIMATED_BODY_KEYS = [
  "ringCore",
  "ringNode",
  "cog",
  "cogTooth",
  "nexusRing",
  "nexusRingNode",
  "mote"
] as const;

export const rewriteTowerAnimated = (ctx: RewriteCtx, t: TowerAnimEntry, nowMs: number): void => {
  const { bases } = t;
  const set = (key: string, k: number, m: Matrix4): void => {
    ctx.set(key, bases[key]! + k, m);
  };

  for (let r = 0; r < TOWER.ringCount; r += 1) {
    const spin = nowMs * TOWER.ringSpeed[r]! + t.phase;
    const bob = Math.sin(nowMs * 0.001 + t.phase + r) * 0.012;
    set("ringCore", r, composePieceMatrix(t.x, TOWER.ringY[r]! + bob, t.z, PI_2 + TOWER.ringTiltX[r]!, spin, TOWER.ringTiltZ[r]!));
    for (let b = 0; b < TOWER.beadsPerRing; b += 1) {
      const ba = (b / TOWER.beadsPerRing) * Math.PI * 2 + spin;
      set("ringNode", r * TOWER.beadsPerRing + b, ringBeadMatrix(TOWER.ringRadius, ba, t.x, TOWER.ringY[r]! + bob, t.z, 1));
    }
  }

  // Synchronized nexus ring assembly; solo towers never wrote these slots
  // (see writeTowerPieces), so their base indices stay unset and we skip the
  // per-frame rewrites that would otherwise recompose zero-scale matrices.
  if (bases["nexusRing"] !== undefined) {
    for (let r = 0; r < TOWER.nexusRingCount; r += 1) {
      const spin = nowMs * TOWER.nexusRingSpeed[r]! + t.phase * 0.7;
      const nex = t.nexus;
      const radius = TOWER.nexusRingRadius * nex;
      const rx = TOWER.nexusRingTiltX[r]!;
      const rz = TOWER.nexusRingTiltZ[r]!;
      set("nexusRing", r, composePieceMatrix(t.x, TOWER.coreY, t.z, rx, spin, rz, nex, nex, nex));
      for (let b = 0; b < TOWER.beadsPerRing; b += 1) {
        const ba = (b / TOWER.beadsPerRing) * Math.PI * 2 + spin;
        set("nexusRingNode", r * TOWER.beadsPerRing + b, ringBeadMatrix(radius, ba, t.x, TOWER.coreY, t.z, nex));
      }
    }
  }

  // Standing cogs: the disc spins and the teeth ride the rim.
  for (let g = 0; g < TOWER.cogCount; g += 1) {
    const gx = g === 0 ? TOWER.gearX : -TOWER.gearX;
    const spin = nowMs * 0.0014 + t.phase + g * 1.1;
    set("cog", g, composePieceMatrix(t.x + gx, TOWER.gearY, t.z, 0, spin, 0));
    for (let i = 0; i < TOWER.gearTeeth; i += 1) {
      const a = makeTowerStep(i, TOWER.gearTeeth) + spin;
      set("cogTooth", g * TOWER.gearTeeth + i, composePieceMatrix(
        t.x + gx + Math.cos(a) * (TOWER.gearRadius + 0.008),
        TOWER.gearY,
        t.z + Math.sin(a) * (TOWER.gearRadius + 0.008),
        0, a, 0
      ));
    }
  }

  // Motes spiral upward along the tower on their own circuits.
  for (let m = 0; m < TOWER.moteCount; m += 1) {
    const rise = ((nowMs / TOWER.moteRisePeriod[m]!) + t.phase / (Math.PI * 2) + m / TOWER.moteCount) % 1;
    const y = TOWER.moteLowY[m]! + (TOWER.moteHighY[m]! - TOWER.moteLowY[m]!) * rise;
    const a = nowMs * TOWER.moteOrbitSpeed[m]! + t.phase + m * 2.1;
    const pulse = 0.82 + 0.18 * Math.sin(nowMs * 0.003 + t.phase * 2 + m);
    set("mote", m, composePieceMatrix(t.x + Math.cos(a) * TOWER.moteRadius[m]!, y, t.z + Math.sin(a) * TOWER.moteRadius[m]!, 0, 0, 0, pulse, pulse, pulse));
  }

  for (const key of ANIMATED_BODY_KEYS) ctx.markDirty(key);
};