// 3D Relay Beacon overlay — a slender, lightly-crewed frontier observation
// tower. Four dark-iron lattice legs converge into a small enclosed deck where
// geared brass periscopes sweep the horizon; a vertical spindle drives a
// slowly-rotating brass heliograph mirror array above the deck, while
// pressure-fed amber signal lamps and an aether-gas tank with brass feed
// pipes mark it as an outpost of industry rather than war. Tall, open and
// unarmoured (no walls, crenellation or weapon mounts) so it reads instantly
// against the squat Siege Battery. Call commit() after adding instances, then
// update(nowMs) every frame to spin the mirror array.

import { Euler, Matrix4, Quaternion, Scene, Texture, Vector3 } from "three";
import { createRelayBeaconAssets, GEARS_PER_BEACON, MIRRORS_PER_BEACON } from "./client-map-3d-relay-beacon-assets.js";

export type RelayBeaconOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number, disabled?: boolean) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

const PI_2 = Math.PI / 2;
const ARRAY_SPEED = 0.0006;
const HUB_Y = 1.58;
const MIRROR_RADIUS = 0.115;

// The mirror-array pieces (plates + drive gears) are the only animated parts.
// Each piece stores its offset from the hub centre (lx,ly,lz), the yaw it has
// when the array angle is 0, and a fixed tilt so the plates catch the light
// from different directions as the array sweeps.
type ArrayPiece = {
  readonly key: "mirror" | "arrayGear";
  readonly slotIndex: number;
  readonly lx: number;
  readonly ly: number;
  readonly lz: number;
  readonly baseYaw: number;
  readonly rotX: number;
  readonly rotZ: number;
};

const buildArrayPieces = (): ArrayPiece[] => {
  const pieces: ArrayPiece[] = [];
  for (let i = 0; i < MIRRORS_PER_BEACON; i += 1) {
    const baseA = (i * Math.PI) / 3 + (i % 2) * 0.22;
    pieces.push({
      key: "mirror",
      slotIndex: i,
      lx: Math.cos(baseA) * MIRROR_RADIUS,
      ly: 0.06,
      lz: Math.sin(baseA) * MIRROR_RADIUS,
      baseYaw: PI_2 - baseA,
      rotX: i % 2 === 0 ? 0.38 : -0.3,
      rotZ: ((i % 3) - 1) * 0.22
    });
  }
  pieces.push({ key: "arrayGear", slotIndex: 0, lx: 0.055, ly: 0.004, lz: 0, baseYaw: 0.3, rotX: 0, rotZ: 0 });
  pieces.push({ key: "arrayGear", slotIndex: 1, lx: -0.055, ly: 0.004, lz: 0, baseYaw: 1.9, rotX: 0, rotZ: 0 });
  return pieces;
};

const arrayPieces = buildArrayPieces();

type RelayBeaconInstance = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly phase: number;
  readonly disabled: boolean;
};

export const createRelayBeaconOverlay = (
  scene: Scene,
  maxTiles: number,
  buildingEnvironmentTexture?: Texture
): RelayBeaconOverlay => {
  const C = maxTiles;

  const { slots, dispose: disposeAssets } = createRelayBeaconAssets(scene, C, buildingEnvironmentTexture);

  // ─── Helpers ────────────────────────────────────────────────────────
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const identityQuat = new Quaternion();
  const tmpEuler = new Euler();
  const tmpQuat = new Quaternion();
  const tmpDir = new Vector3();
  const yAxis = new Vector3(0, 1, 0);
  const zAxis = new Vector3(0, 0, 1);

  const addPiece = (
    key: string,
    wx: number,
    sy: number,
    wz: number,
    ox: number,
    oy: number,
    oz: number,
    sx = 1,
    sz = 1,
    sy2 = 1,
    rotY = 0,
    rotX = 0,
    rotZ = 0
  ): void => {
    const slot = slots.get(key);
    if (!slot || slot.count >= slot.cap) return;
    position.set(wx + ox, sy + oy, wz + oz);
    scale.set(sx, sy2, sz);
    if (rotX === 0 && rotY === 0 && rotZ === 0) {
      matrix.compose(position, identityQuat, scale);
    } else {
      tmpEuler.set(rotX, rotY, rotZ, "XYZ");
      tmpQuat.setFromEuler(tmpEuler);
      matrix.compose(position, tmpQuat, scale);
    }
    slot.mesh.setMatrixAt(slot.count, matrix);
    slot.count += 1;
  };

  const eulerFromDir = (dx: number, dy: number, dz: number): { rx: number; ry: number; rz: number } => {
    tmpDir.set(dx, dy, dz).normalize();
    tmpQuat.setFromUnitVectors(yAxis, tmpDir);
    tmpEuler.setFromQuaternion(tmpQuat);
    return { rx: tmpEuler.x, ry: tmpEuler.y, rz: tmpEuler.z };
  };

  // Variant that aligns the torus hole axis (local Z) with the direction,
  // so joint rings wrap around their pipes.
  const eulerFromDirZ = (dx: number, dy: number, dz: number): { rx: number; ry: number; rz: number } => {
    tmpDir.set(dx, dy, dz).normalize();
    tmpQuat.setFromUnitVectors(zAxis, tmpDir);
    tmpEuler.setFromQuaternion(tmpQuat);
    return { rx: tmpEuler.x, ry: tmpEuler.y, rz: tmpEuler.z };
  };

  const addPieceAlong = (
    key: string,
    wx: number,
    sy: number,
    wz: number,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    len: number
  ): void => {
    const e = eulerFromDir(dx, dy, dz);
    addPiece(key, wx, sy, wz, ox, oy, oz, 1, 1, len, e.ry, e.rx, e.rz);
  };

  const addTorusAlong = (
    key: string,
    wx: number,
    sy: number,
    wz: number,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number
  ): void => {
    const e = eulerFromDirZ(dx, dy, dz);
    addPiece(key, wx, sy, wz, ox, oy, oz, 1, 1, 1, e.ry, e.rx, e.rz);
  };

  // ─── Beacon placement ───────────────────────────────────────────────
  const addBeacon = (wx: number, sy: number, wz: number): void => {
    // Small mechanical anchor base + control housing.
    for (const ax of [-0.26, 0.26]) {
      for (const az of [-0.26, 0.26]) {
        addPiece("anchor", wx, sy, wz, ax, 0.02, az);
      }
    }
    addPiece("baseBox", wx, sy, wz, 0, 0.05, 0);
    addPiece("baseVent", wx, sy, wz, 0, 0.05, 0.131);

    // Aether-gas pressure tank on the rear corner, piped up the tower.
    addPiece("tank", wx, sy, wz, 0.24, 0.2, -0.16);
    addPiece("tankBand", wx, sy, wz, 0.24, 0.11, -0.16, 1, 1, 1, 0, PI_2, 0);
    addPiece("tankBand", wx, sy, wz, 0.24, 0.29, -0.16, 1, 1, 1, 0, PI_2, 0);
    addPiece("tankCap", wx, sy, wz, 0.24, 0.378, -0.16);
    addPiece("tankValve", wx, sy, wz, 0.24, 0.412, -0.16);
    addPiece("valveWheel", wx, sy, wz, 0.24, 0.438, -0.16);

    // Slender lattice column with a brass band.
    addPiece("column", wx, sy, wz, 0, 0.7, 0, 1, 1, 1.16);
    addPiece("columnBand", wx, sy, wz, 0, 0.95, 0, 1, 1, 1, 0, PI_2, 0);

    // Four converging dark-iron lattice legs.
    for (const lx of [-0.26, 0.26]) {
      for (const lz of [-0.26, 0.26]) {
        const dx = -lx * 0.423;
        const dz = -lz * 0.423;
        const len = Math.sqrt(dx * dx + 1.265 * 1.265 + dz * dz);
        addPieceAlong("leg", wx, sy, wz, lx * 0.789, 0.6675, lz * 0.789, dx, 1.265, dz, len);
      }
    }

    // Cross braces on the front face (two X levels).
    addPieceAlong("brace", wx, sy, wz, 0, 0.72, 0.21, 0.42, 0.4, 0, 0.58);
    addPieceAlong("brace", wx, sy, wz, 0, 0.72, 0.21, -0.42, 0.4, 0, 0.58);
    addPieceAlong("brace", wx, sy, wz, 0, 1.12, 0.21, 0.42, 0.36, 0, 0.553);
    addPieceAlong("brace", wx, sy, wz, 0, 1.12, 0.21, -0.42, 0.36, 0, 0.553);

    // Brass feed pipes from tank and base up to the deck.
    addPieceAlong("pipe", wx, sy, wz, 0.145, 0.85, -0.13, -0.11, 0.86, 0.06, 0.869);
    addPieceAlong("pipe", wx, sy, wz, -0.1, 0.695, 0.18, 0.08, 1.13, -0.08, 1.135);
    addTorusAlong("pipeJoint", wx, sy, wz, 0.16, 0.68, -0.14, -0.11, 0.86, 0.06);
    addTorusAlong("pipeJoint", wx, sy, wz, -0.12, 0.41, 0.2, 0.08, 1.13, -0.08);
    addTorusAlong("pipeJoint", wx, sy, wz, -0.075, 1.03, 0.16, 0.08, 1.13, -0.08);

    // Observation deck: platform, railing and enclosed optics box.
    addPiece("platform", wx, sy, wz, 0, 1.31, 0);
    addPiece("rail", wx, sy, wz, 0, 1.34, 0);
    addPiece("obsBox", wx, sy, wz, 0, 1.4, -0.01);
    addPiece("obsWindow", wx, sy, wz, 0, 1.4, 0.056);

    // Heliograph spindle, hub and array disc (static; plates animate).
    addPiece("spindle", wx, sy, wz, 0, 1.49, 0, 1, 1, 0.33);
    addPiece("hub", wx, sy, wz, 0, HUB_Y, 0);
    addPiece("arrayRing", wx, sy, wz, 0, 1.6, 0, 1, 1, 1, 0, PI_2, 0);
    for (const piece of arrayPieces) {
      addPiece(piece.key, wx, sy, wz, piece.lx, HUB_Y + piece.ly, piece.lz, 1, 1, 1, piece.baseYaw, piece.rotX, piece.rotZ);
    }

    // Geared brass periscopes sweeping out over the deck edge.
    addPeriscope(wx, sy, wz, 0.1, 1.34, 0.1, 0.44, -0.8, 0.28);
    addPeriscope(wx, sy, wz, -0.1, 1.34, 0.1, -0.44, -0.8, 0.28);
    addPeriscope(wx, sy, wz, 0, 1.35, -0.12, 0, -0.84, -0.5);

    // Pressure-fed amber signal lamps on the deck edge.
    addLamp(wx, sy, wz, 0.15, 0.09);
    addLamp(wx, sy, wz, -0.15, 0.09);
    addLamp(wx, sy, wz, 0, -0.16);
  };

  const addPeriscope = (wx: number, sy: number, wz: number, px: number, py: number, pz: number, dx: number, dy: number, dz: number): void => {
    const dirLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const ux = dx / dirLen;
    const uy = dy / dirLen;
    const uz = dz / dirLen;
    addPiece("periscopeGear", wx, sy, wz, px, py - 0.012, pz);
    addPieceAlong("periscopeTube", wx, sy, wz, px + ux * 0.12, py + uy * 0.12, pz + uz * 0.12, ux, uy, uz, 0.24);
    addPieceAlong("periscopeEyepiece", wx, sy, wz, px + ux * 0.22, py + uy * 0.22, pz + uz * 0.22, ux, uy, uz, 1);
    addPieceAlong("periscopeLens", wx, sy, wz, px + ux * 0.25, py + uy * 0.25, pz + uz * 0.25, ux, uy, uz, 1);
  };

  const addLamp = (wx: number, sy: number, wz: number, lx: number, lz: number): void => {
    addPieceAlong("lampBracket", wx, sy, wz, lx, 1.37, lz, 0, 0.1, 0, 1);
    addPiece("lampHousing", wx, sy, wz, lx, 1.42, lz);
    addPiece("lampGlow", wx, sy, wz, lx, 1.425, lz);
    addPiece("lampCage", wx, sy, wz, lx, 1.42, lz, 1, 1, 1, 0, PI_2, 0);
  };

  const instances: RelayBeaconInstance[] = [];

  // ─── Public API ─────────────────────────────────────────────────────
  const clear = (): void => {
    for (const slot of slots.values()) slot.count = 0;
    instances.length = 0;
  };

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number, disabled = false): void => {
    // The mirror/gear animation buffers (and every static-piece buffer) are
    // preallocated for `C` beacons; instances beyond that would index past
    // the InstancedMesh's typed arrays in update(), so drop the excess here
    // rather than let addPiece's per-slot cap silently desync from `instances`.
    if (instances.length >= C) return;
    const hash = ((worldTileX * 92_821) ^ (worldTileY * 68_917)) >>> 0;
    const phase = ((hash % 1000) / 1000) * Math.PI * 2;
    instances.push({ x: sceneX, y: surfaceY, z: sceneZ, phase, disabled });
    addBeacon(sceneX, surfaceY, sceneZ);
  };

  const commit = (): void => {
    for (const slot of slots.values()) {
      const { mesh, count } = slot;
      mesh.count = count;
      if (count === 0) continue;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const update = (nowMs: number): void => {
    const count = instances.length;
    if (count === 0) return;
    const mirrorSlot = slots.get("mirror");
    const gearSlot = slots.get("arrayGear");
    for (let i = 0; i < count; i += 1) {
      const t = instances[i]!;
      const angle = t.disabled ? t.phase : nowMs * ARRAY_SPEED + t.phase;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const baseX = t.x;
      const baseY = t.y + HUB_Y;
      const baseZ = t.z;
      for (const piece of arrayPieces) {
        const slot = piece.key === "mirror" ? mirrorSlot : gearSlot;
        if (!slot) continue;
        const wx = baseX + piece.lx * cosA - piece.lz * sinA;
        const wz = baseZ + piece.lx * sinA + piece.lz * cosA;
        position.set(wx, baseY + piece.ly, wz);
        scale.set(1, 1, 1);
        tmpEuler.set(piece.rotX, piece.baseYaw + angle, piece.rotZ, "XYZ");
        tmpQuat.setFromEuler(tmpEuler);
        matrix.compose(position, tmpQuat, scale);
        const perKey = piece.key === "mirror" ? MIRRORS_PER_BEACON : GEARS_PER_BEACON;
        slot.mesh.setMatrixAt(i * perKey + piece.slotIndex, matrix);
      }
    }
    if (mirrorSlot && mirrorSlot.count > 0) {
      mirrorSlot.mesh.instanceMatrix.clearUpdateRanges();
      mirrorSlot.mesh.instanceMatrix.addUpdateRange(0, mirrorSlot.count * 16);
      mirrorSlot.mesh.instanceMatrix.needsUpdate = true;
    }
    if (gearSlot && gearSlot.count > 0) {
      gearSlot.mesh.instanceMatrix.clearUpdateRanges();
      gearSlot.mesh.instanceMatrix.addUpdateRange(0, gearSlot.count * 16);
      gearSlot.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => disposeAssets();

  return { clear, addInstance, commit, update, dispose };
};
