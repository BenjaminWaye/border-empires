// Aether Resonance Core (ARC) module — a compact AFC module that fabricates and
// calibrates aether-based structures and devices: the resonance-focusing
// machinery later installed on Umbrite Rigs, Siege Outposts and Umbrite
// Weapons Factories.
//
// Local space: +X is FORWARD — the outward radial direction of the socket (its
// `yaw`). The root sits at the socket attachment point (the pad-top center, `y`
// returned by moduleSocketAttachments). Dock it with
// addInstance(att.x, att.z, att.y, att.yaw, ...) so the core faces away from
// the AFC core.
//
// Procedural hierarchy (every child is logically parented to ARC_Root at the
// bay center, yaw-aligned to face outward):
//   ARC_Root
//   ├── Seat                  — dockable circular base + brass locking lip
//   ├── Pod                   — rounded black-iron pod with two brass bands
//   ├── Core_Assembly         — the defining feature: a glowing cyan resonance
//   │     core held in a thick brass frame ring with a steel backing ring,
//   │     wrapped by three large segmented induction-coil arcs.
//   ├── Power_Conduits        — two short vertical power conduits on the flanks
//   └── Rear_Coupling         — one heavy rear AFC coupling: thick steel stub,
//   │     brass collar ring and a bright cyan contact tip
//
// Construction is industrial and squat: rounded pod, bright central core,
// oversized surrounding coil — a specialized aether-calibration cartridge, not
// a tower or generator. The docked footprint (AETHER_CORE_BASE_RADIUS) fits
// inside AFC_BAY_INNER_RADIUS. Cyan stays on the resonance core and the rear
// contact tip; there is deliberately no orange forge glow.
//
// No two pieces share a coplanar surface: the frame and coil bands are stepped
// along the forward axis, the core discs sit proud of their backing ring, and
// the coil arcs layer on separate X planes so the seams never Z-fight into
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
export const AETHER_CORE_SCALE = 1.33;
// Footprint radius of the dockable seat — below the AFC bay inner radius
// (0.14) so the module slots into the socket ring with clearance.
export const AETHER_CORE_BASE_RADIUS = 0.105 * AETHER_CORE_SCALE;
// Total height above the pad top (top of the induction-coil arcs), 0.242 × 1.33.
export const AETHER_CORE_MODULE_HEIGHT = 0.242 * AETHER_CORE_SCALE;

export type AetherResonanceModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createAetherResonanceModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): AetherResonanceModuleOverlay => {
  const C = maxInstances;
  const PI_2 = Math.PI / 2;
  const TAU = Math.PI * 2;
  // The three induction-coil arcs each sweep half a circle, fanned 120° apart
  // and stepped along the forward axis into a segmented conductor stack.
  const COIL_ARC = Math.PI;

  // ─── Materials (shared by piece type) ───────────────────────────────
  const ironMaterial = new MeshStandardMaterial({ color: "#22242a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const steelMaterial = new MeshStandardMaterial({ color: "#17181d", roughness: 0.62, metalness: 0.5, flatShading: true });
  const brassMaterial = new MeshStandardMaterial({ color: "#8b6c3d", roughness: 0.42, metalness: 0.85, flatShading: true });
  const brassDarkMaterial = new MeshStandardMaterial({ color: "#6f5733", roughness: 0.5, metalness: 0.8, flatShading: true });
  const pipeMaterial = new MeshStandardMaterial({ color: "#1d1f25", roughness: 0.68, metalness: 0.35, flatShading: true });
  // Strong cyan resonance energy (emissive; no orange in this family).
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
  const frameRingGeo = new TorusGeometry(0.055, 0.02, 12, 28);
  const frameRearGeo = new TorusGeometry(0.048, 0.013, 10, 22);
  const coreGeo = new CylinderGeometry(0.04, 0.04, 0.035, 20);
  const coreInnerGeo = new CylinderGeometry(0.02, 0.02, 0.02, 16);
  const coilGeo = new TorusGeometry(0.082, 0.013, 8, 24, COIL_ARC);
  const conduitGeo = new CylinderGeometry(0.012, 0.013, 1, 10);
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
  make("frameRing", frameRingGeo, brassMaterial, 1);
  make("frameRear", frameRearGeo, steelMaterial, 1);
  make("core", coreGeo, cyanMaterial, 1);
  make("coreInner", coreInnerGeo, cyanBrightMaterial, 1);
  make("coil", coilGeo, brassMaterial, 3);
  make("conduit", conduitGeo, brassDarkMaterial, 2);
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
    // Piece offsets and instance scale grow with AETHER_CORE_SCALE about the
    // dock origin; the scene-anchor position (wx, sy, wz) never scales so
    // docked instances stay on their socket.
    position.set(wx + ox * AETHER_CORE_SCALE, sy + oy * AETHER_CORE_SCALE, wz + oz * AETHER_CORE_SCALE);
    scale.set(sx * AETHER_CORE_SCALE, sy2 * AETHER_CORE_SCALE, sz * AETHER_CORE_SCALE);
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
  // induction-coil arcs, whose geometry is fanned around the forward axis).
  const addPieceQuat = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, quat: Quaternion): void => {
    const slot = slots.get(key);
    if (!slot || slot.count >= slot.cap) return;
    position.set(wx + ox * AETHER_CORE_SCALE, sy + oy * AETHER_CORE_SCALE, wz + oz * AETHER_CORE_SCALE);
    scale.set(AETHER_CORE_SCALE, AETHER_CORE_SCALE, AETHER_CORE_SCALE);
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

  // Core_Assembly: the resonance core held in a thick circular brass frame with
  // a steel backing ring, wrapped by three large segmented induction-coil arcs.
  // The assembly stands proud of the pod facade so the core reads from the
  // front, in the module's upper half.
  const addCoreAssembly = (wx: number, sy: number, wz: number): void => {
    addRingAlong("frameRear", wx, sy, wz, 0.068, 0.16, 0, 1, 0, 0);
    addRingAlong("frameRing", wx, sy, wz, 0.092, 0.16, 0, 1, 0, 0);
    addPlateAlong("core", wx, sy, wz, 0.088, 0.16, 0, 1, 0, 0);
    addPlateAlong("coreInner", wx, sy, wz, 0.098, 0.16, 0, 1, 0, 0);
    // Three half-circle conductor arcs fanned 120° apart on stepped forward
    // planes — a segmented induction coil channelling energy toward the core.
    const alignE = eulerFromDirZ(1, 0, 0);
    const alignQuat = new Quaternion().setFromEuler(new Euler(alignE.rx, alignE.ry, alignE.rz, "XYZ"));
    const spinQuat = new Quaternion();
    const layers = [
      { x: 0.084, spin: 0 },
      { x: 0.092, spin: TAU / 3 },
      { x: 0.1, spin: (TAU * 2) / 3 }
    ];
    for (const layer of layers) {
      spinQuat.setFromAxisAngle(xAxis, layer.spin);
      pieceQuat.copy(alignQuat).multiply(spinQuat);
      addPieceQuat("coil", wx, sy, wz, layer.x, 0.16, 0, pieceQuat);
    }
  };

  const addPowerConduits = (wx: number, sy: number, wz: number): void => {
    for (const side of [-1, 1]) {
      addPieceAlong("conduit", wx, sy, wz, -0.02, 0.13, 0.105 * side, 0, 1, 0, 0.06);
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
    addCoreAssembly(wx, sy, wz);
    addPowerConduits(wx, sy, wz);
    addRearCoupling(wx, sy, wz);
  };

  // ─── Static asset ───────────────────────────────────────────────────
  // This module carries no idle animation (no core breathing, no coil spin):
  // it renders once and `update` is a no-op that keeps the interactive harness
  // uniform across module families.
  type ArcRecord = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
  };
  const records: ArcRecord[] = [];

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

  // No idle animation on this cartridge: the resonance core sits static.
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