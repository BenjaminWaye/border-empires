// Transposition Array (TRA) module — a compact AFC module that fabricates the
// machinery later used to capture and redirect aether from one location or
// system to another (the Aether Siphon family).
//
// Local space: +X is FORWARD — the outward radial direction of the socket (its
// `yaw`). The root sits at the socket attachment point (the pad-top center, `y`
// returned by moduleSocketAttachments). Dock it with
// addInstance(att.x, att.z, att.y, att.yaw, ...) so the array faces away from
// the AFC core.
//
// Procedural hierarchy (every child is logically parented to TraRoot at the
// bay center, yaw-aligned to face outward):
//   TraRoot
//   ├── Seat                  — dockable circular base + brass locking lip
//   ├── Pod                   — rounded black-iron pod with two brass bands
//   ├── Transfer_Array        — the defining feature: a pair of opposed
//   │     transfer rings, one slightly above the other, with a bright vertical
//   │     cyan energy channel suspended between them, pulling aether inward
//   ├── Flank_Conduits        — two thick curved conduits feeding from the
//   │     rings down into the pod body
//   └── Rear_Coupling         — one heavy rear AFC coupling: thick steel stub,
//   │     brass collar ring and a bright cyan contact tip
//
// Construction is compact and squat: rounded pod, two large transfer rings and
// a bright energy column — a capture/transfer cartridge, not a generator or
// EMP stack. The docked footprint (TRANSPOSITION_ARRAY_BASE_RADIUS) fits inside
// AFC_BAY_INNER_RADIUS. The flank bands are deliberately thick C-shaped feeds
// (not the Aether Resonance Core's three thin fanned coil arcs) so it reads as
// siphoning, not power generation.
//
// No two pieces share a coplanar surface: the rings sit proud of the pod
// facade, the conduit arcs are stepped off the pod shell, and the energy
// column passes between the two ring openings so the seams never Z-fight into
// black line artifacts.

import {
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  TorusGeometry,
  Texture,
  Vector3
} from "three";
import { applyBuildingEnvMap } from "./client-map-3d-building-envmap/client-map-3d-building-envmap.js";

// Uniform 33% scale-up applied to every module-local position and instance
// scale about the dock origin, matching the other AFC module families.
export const TRANSPOSITION_ARRAY_SCALE = 1.33;
// Footprint radius of the dockable seat — below the AFC bay inner radius
// (0.14) so the module slots into the socket ring with clearance.
export const TRANSPOSITION_ARRAY_BASE_RADIUS = 0.105 * TRANSPOSITION_ARRAY_SCALE;
// Total height above the pad top (top of the upper transfer ring), 0.254 × 1.33.
export const TRANSPOSITION_ARRAY_MODULE_HEIGHT = 0.254 * TRANSPOSITION_ARRAY_SCALE;

export type TranspositionArrayModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createTranspositionArrayModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): TranspositionArrayModuleOverlay => {
  const C = maxInstances;
  const PI_2 = Math.PI / 2;
  // The flank conduits are thick bands sweeping ~150° around the pod side.
  const CONDUIT_ARC = 2.6;

  // ─── Materials (shared by piece type) ───────────────────────────────
  const ironMaterial = new MeshStandardMaterial({ color: "#22242a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const steelMaterial = new MeshStandardMaterial({ color: "#17181d", roughness: 0.62, metalness: 0.5, flatShading: true });
  const brassMaterial = new MeshStandardMaterial({ color: "#8b6c3d", roughness: 0.42, metalness: 0.85, flatShading: true });
  const brassDarkMaterial = new MeshStandardMaterial({ color: "#6f5733", roughness: 0.5, metalness: 0.8, flatShading: true });
  const pipeMaterial = new MeshStandardMaterial({ color: "#1d1f25", roughness: 0.68, metalness: 0.35, flatShading: true });
  // Strong cyan aether energy on the suspended channel (emissive; no orange).
  const cyanMaterial = new MeshStandardMaterial({
    color: "#05222a",
    roughness: 0.3,
    metalness: 0.1,
    flatShading: true,
    emissive: "#41f6ff",
    emissiveIntensity: 2.0
  });
  const cyanBrightMaterial = new MeshStandardMaterial({
    color: "#06303a",
    roughness: 0.25,
    metalness: 0.05,
    flatShading: true,
    emissive: "#9ff6ff",
    emissiveIntensity: 3.0
  });

  // ─── Geometries (shared) ────────────────────────────────────────────
  // Small curved parts use high segment counts so flat-shaded facets never
  // read as black crease lines (see the Siege Lens Foundry module notes).
  const baseGeo = new CylinderGeometry(0.1, 0.105, 0.032, 16);
  const baseRingGeo = new TorusGeometry(0.12, 0.012, 12, 28);
  const podGeo = new CapsuleGeometry(0.075, 0.05, 6, 16);
  const bandGeo = new TorusGeometry(0.079, 0.011, 10, 26);
  const transferRingGeo = new TorusGeometry(0.056, 0.02, 12, 28);
  const energyColGeo = new CylinderGeometry(0.026, 0.026, 1, 14);
  const energyCoreGeo = new CylinderGeometry(0.013, 0.013, 1, 12);
  const conduitGeo = new TorusGeometry(0.05, 0.024, 10, 20, CONDUIT_ARC);
  const couplingGeo = new CylinderGeometry(0.024, 0.026, 1, 12);
  const couplingRingGeo = new TorusGeometry(0.03, 0.011, 10, 20);
  const couplingTipGeo = new CylinderGeometry(0.014, 0.014, 0.016, 14);

  // ─── InstancedMesh registry ────────────────────────────────────────
  type Slot = { mesh: InstancedMesh; count: number; cap: number };
  const slots = new Map<string, Slot>();
  const ownedGeos = new Set<BufferGeometry>();
  const ownedMaterials = new Set<MeshStandardMaterial>();

  const make = (key: string, geo: BufferGeometry, mat: MeshStandardMaterial, perInstance: number): Slot => {
    applyBuildingEnvMap(mat, buildingEnvironmentTexture);
    const mesh = new InstancedMesh(geo, mat, C * perInstance);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    const slot: Slot = { mesh, count: 0, cap: C * perInstance };
    slots.set(key, slot);
    ownedGeos.add(geo);
    ownedMaterials.add(mat);
    return slot;
  };

  make("base", baseGeo, ironMaterial, 1);
  make("baseRing", baseRingGeo, brassMaterial, 1);
  make("pod", podGeo, ironMaterial, 1);
  make("band", bandGeo, brassMaterial, 2);
  make("transferRing", transferRingGeo, brassMaterial, 2);
  make("energyCol", energyColGeo, cyanMaterial, 1);
  make("energyCore", energyCoreGeo, cyanBrightMaterial, 1);
  make("conduit", conduitGeo, pipeMaterial, 2);
  make("coupling", couplingGeo, steelMaterial, 1);
  make("couplingRing", couplingRingGeo, brassMaterial, 1);
  make("couplingTip", couplingTipGeo, cyanMaterial, 1);

  // ─── Helpers ────────────────────────────────────────────────────────
  const matrix = new Matrix4();
  const pieceMatrix = new Matrix4();
  const yawMatrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const yawQuat = new Quaternion();
  const pieceQuat = new Quaternion();
  const tmpEuler = new Euler();
  const tmpDir = new Vector3();
  const yAxis = new Vector3(0, 1, 0);
  const zAxis = new Vector3(0, 0, 1);
  const xAxis = new Vector3(1, 0, 0);

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
    // Piece offsets and instance scale grow with TRANSPOSITION_ARRAY_SCALE
    // about the dock origin; the scene-anchor position (wx, sy, wz) never
    // scales so docked instances stay on their socket.
    position.set(wx + ox * TRANSPOSITION_ARRAY_SCALE, sy + oy * TRANSPOSITION_ARRAY_SCALE, wz + oz * TRANSPOSITION_ARRAY_SCALE);
    scale.set(sx * TRANSPOSITION_ARRAY_SCALE, sy2 * TRANSPOSITION_ARRAY_SCALE, sz * TRANSPOSITION_ARRAY_SCALE);
    if (rotX === 0 && rotY === 0 && rotZ === 0) {
      pieceQuat.identity();
    } else {
      tmpEuler.set(rotX, rotY, rotZ, "XYZ");
      pieceQuat.setFromEuler(tmpEuler);
    }
    // Piece-local transform first, then the module's yaw.
    pieceMatrix.compose(position, pieceQuat, scale);
    matrix.multiplyMatrices(yawMatrix, pieceMatrix);
    slot.mesh.setMatrixAt(slot.count, matrix);
    slot.count += 1;
  };

  // Places a piece with a caller-supplied orientation quaternion (used for the
  // flank conduits, whose arc is spun around the forward axis to hug the pod).
  const addPieceQuat = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, quat: Quaternion): void => {
    const slot = slots.get(key);
    if (!slot || slot.count >= slot.cap) return;
    position.set(wx + ox * TRANSPOSITION_ARRAY_SCALE, sy + oy * TRANSPOSITION_ARRAY_SCALE, wz + oz * TRANSPOSITION_ARRAY_SCALE);
    scale.set(TRANSPOSITION_ARRAY_SCALE, TRANSPOSITION_ARRAY_SCALE, TRANSPOSITION_ARRAY_SCALE);
    pieceMatrix.compose(position, quat, scale);
    matrix.multiplyMatrices(yawMatrix, pieceMatrix);
    slot.mesh.setMatrixAt(slot.count, matrix);
    slot.count += 1;
  };

  const eulerFromDir = (dx: number, dy: number, dz: number): { rx: number; ry: number; rz: number } => {
    tmpDir.set(dx, dy, dz).normalize();
    pieceQuat.setFromUnitVectors(yAxis, tmpDir);
    tmpEuler.setFromQuaternion(pieceQuat);
    return { rx: tmpEuler.x, ry: tmpEuler.y, rz: tmpEuler.z };
  };

  const eulerFromDirZ = (dx: number, dy: number, dz: number): { rx: number; ry: number; rz: number } => {
    tmpDir.set(dx, dy, dz).normalize();
    pieceQuat.setFromUnitVectors(zAxis, tmpDir);
    tmpEuler.setFromQuaternion(pieceQuat);
    return { rx: tmpEuler.x, ry: tmpEuler.y, rz: tmpEuler.z };
  };

  // A cylinder of geometry length 1 stretched along a direction: the rod's
  // length goes into the Y (cylinder axis) scale slot, not a lateral one.
  const addPieceAlong = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, len: number): void => {
    const e = eulerFromDir(dx, dy, dz);
    addPiece(key, wx, sy, wz, ox, oy, oz, 1, 1, len, e.ry, e.rx, e.rz);
  };

  // A thin disc/plate whose flat face is perpendicular to a direction.
  const addPlateAlong = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): void => {
    const e = eulerFromDir(dx, dy, dz);
    addPiece(key, wx, sy, wz, ox, oy, oz, 1, 1, 1, e.ry, e.rx, e.rz);
  };

  // A torus with its hole aligned along a direction (a band around an axis).
  const addRingAlong = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): void => {
    const e = eulerFromDirZ(dx, dy, dz);
    addPiece(key, wx, sy, wz, ox, oy, oz, 1, 1, 1, e.ry, e.rx, e.rz);
  };

  // ─── Module placement ───────────────────────────────────────────────
  const addSeat = (wx: number, sy: number, wz: number): void => {
    addPiece("base", wx, sy, wz, 0, 0.016, 0);
    addPiece("baseRing", wx, sy, wz, 0, 0.032, 0, 1, 1, 1, 0, PI_2, 0);
  };

  const addPod = (wx: number, sy: number, wz: number): void => {
    addPiece("pod", wx, sy, wz, 0, 0.115, 0);
    addPiece("band", wx, sy, wz, 0, 0.085, 0, 1, 1, 1, 0, PI_2, 0);
    addPiece("band", wx, sy, wz, 0, 0.155, 0, 1, 1, 1, 0, PI_2, 0);
  };

  // Transfer_Array: a pair of opposed brass rings, one slightly above the
  // other, with a bright vertical cyan energy channel suspended between their
  // openings. The lower ring sits slightly proud in front, the upper slightly
  // receded — the pair reads as pulling aether inward and passing it through.
  const addTransferArray = (wx: number, sy: number, wz: number): void => {
    addRingAlong("transferRing", wx, sy, wz, 0.098, 0.114, 0, 1, 0, 0);
    addRingAlong("transferRing", wx, sy, wz, 0.118, 0.178, 0, 1, 0, 0);
    addPieceAlong("energyCol", wx, sy, wz, 0.108, 0.146, 0, 0, 1, 0, 0.07);
    addPieceAlong("energyCore", wx, sy, wz, 0.108, 0.146, 0, 0, 1, 0, 0.07);
  };

  // Two thick curved conduits hugging the pod flanks, arcing from the ring
  // area down into the body — a siphon feed, deliberately not the ARC family's
  // three thin fanned coil arcs.
  const addFlankConduits = (wx: number, sy: number, wz: number): void => {
    const alignE = eulerFromDirZ(1, 0, 0);
    const alignQuat = new Quaternion().setFromEuler(new Euler(alignE.rx, alignE.ry, alignE.rz, "XYZ"));
    const spinQuat = new Quaternion();
    for (const flank of [-1, 1]) {
      spinQuat.setFromAxisAngle(xAxis, flank * 0.5);
      pieceQuat.copy(alignQuat).multiply(spinQuat);
      addPieceQuat("conduit", wx, sy, wz, 0.05, 0.16, 0.06 * flank, pieceQuat);
    }
  };

  const addRearCoupling = (wx: number, sy: number, wz: number): void => {
    addPieceAlong("coupling", wx, sy, wz, -0.052, 0.1, 0, -1, 0, 0, 0.05);
    addRingAlong("couplingRing", wx, sy, wz, -0.05, 0.1, 0, 1, 0, 0);
    addPlateAlong("couplingTip", wx, sy, wz, -0.082, 0.1, 0, -1, 0, 0);
  };

  const addModule = (wx: number, sy: number, wz: number): void => {
    addSeat(wx, sy, wz);
    addPod(wx, sy, wz);
    addTransferArray(wx, sy, wz);
    addFlankConduits(wx, sy, wz);
    addRearCoupling(wx, sy, wz);
  };

  // ─── Static asset ───────────────────────────────────────────────────
  // This module carries no idle animation (no energy pulse, no ring spin): it
  // renders once and `update` is a no-op that keeps the interactive harness
  // uniform across module families.
  type TraRecord = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
  };
  const records: TraRecord[] = [];

  // ─── Public API ─────────────────────────────────────────────────────
  const clear = (): void => {
    for (const slot of slots.values()) slot.count = 0;
    records.length = 0;
  };

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, _worldTileX: number, _worldTileY: number): number => {
    if (records.length >= C) return -1;
    yawQuat.setFromEuler(tmpEuler.set(0, -yaw, 0, "XYZ"));
    yawMatrix.makeRotationFromQuaternion(yawQuat);
    records.push({ x: sceneX, y: surfaceY, z: sceneZ, yaw });
    addModule(sceneX, surfaceY, sceneZ);
    yawMatrix.identity();
    return records.length - 1;
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

  // No idle animation on this cartridge: the transfer array sits static.
  // Keeping the method on the overlay contract so the interactive harness
  // (per-module and AFC update loops) stays uniform across all module families.
  const update = (_nowMs: number): void => {};

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMaterials) m.dispose();
  };

  return { clear, addInstance, commit, update, dispose };
};