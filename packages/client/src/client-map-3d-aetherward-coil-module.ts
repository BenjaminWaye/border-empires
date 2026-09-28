// Aetherward Coil (AWC) module — a compact attachable AFC module that
// fabricates and tunes defensive aether-field technology: the shield,
// field-projection and containment machinery used on defensive structures.
//
// Local space: +X is FORWARD — the outward radial direction of the socket (its
// `yaw`). The root sits at the socket attachment point (the pad-top center, `y`
// returned by moduleSocketAttachments). Dock it with
// addInstance(att.x, att.z, att.y, att.yaw, ...) so the coil faces away from
// the AFC core.
//
// Procedural hierarchy (every child is logically parented to AWC_Root at the
// bay center, yaw-aligned to face outward):
//   AWC_Root
//   ├── Seat                  — dockable circular base + brass locking lip
//   ├── Pod                   — rounded blackened pod with two brass bands
//   ├── Coil_Assembly         — the defining feature: ONE oversized horseshoe
//   │     coil of thick aged brass riding the pod crown, its open mouth
//   │     facing outward (+X), cradling a small suspended cyan aether node
//   ├── Brass_Base            — thick brass collarring where the coil is
//   │     anchored on the pod, plus brass hubs under the two coil prongs
//   ├── Feed_Conduits         — two thick insulated conduits running from the
//   │     coil prongs down into the module body
//   └── Rear_Coupling         — one heavy rear AFC coupling: thick steel stub,
//   │     brass collar ring and a bright cyan contact tip
//
// Construction is compact and quiet: rounded pod, one oversized horseshoe coil
// and a glowing contained node — a field-shaping cartridge, not a weapon,
// antenna or generator. The docked footprint (AETHERWARD_BASE_RADIUS) fits
// inside AFC_BAY_INNER_RADIUS. Cyan stays on the suspended aether node and the
// rear contact tip; there is deliberately no orange forge glow.
//
// The coil's ~275° sweep leaves an open mouth at the module's front where the
// node floats — a containment cradle, unlike the Aether Resonance Core's three
// fanned conductor arcs or the Transposition Array's opposed transfer rings.
//
// No two pieces share a coplanar surface: the horseshoe ring passes around the
// pod crown at its own height, the brass collar steps off the pod wall, and
// the ball and conduits are stepped off the ring plane — otherwise the seams
// Z-fight into black line artifacts.

import {
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
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
export const AETHERWARD_COIL_SCALE = 1.33;
// Footprint radius of the dockable seat — below the AFC bay inner radius
// (0.14) so the module slots into the socket ring with clearance.
export const AETHERWARD_COIL_BASE_RADIUS = 0.105 * AETHERWARD_COIL_SCALE;
// Total height above the pad top (top of the horseshoe coil ring), 0.197 × 1.33.
export const AETHERWARD_COIL_MODULE_HEIGHT = 0.197 * AETHERWARD_COIL_SCALE;

export type AetherwardCoilModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createAetherwardCoilModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): AetherwardCoilModuleOverlay => {
  const C = maxInstances;
  const PI_2 = Math.PI / 2;
  const TAU = Math.PI * 2;
  // The horseshoe coil sweeps ~275° around the pod crown, leaving an open ~85°
  // mouth at the front (outward) where the field node floats between the two
  // prongs.
  const COIL_ARC = 4.8;
  // Spins the ring so its open mouth centers exactly on +X (the outward socket
  // direction) instead of sitting just to one side of it.
  const MOUTH_OFFSET = TAU - COIL_ARC;

  // ─── Materials (shared by piece type) ───────────────────────────────
  const ironMaterial = new MeshStandardMaterial({ color: "#22242a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const steelMaterial = new MeshStandardMaterial({ color: "#17181d", roughness: 0.62, metalness: 0.5, flatShading: true });
  const brassMaterial = new MeshStandardMaterial({ color: "#8b6c3d", roughness: 0.42, metalness: 0.85, flatShading: true });
  const brassDarkMaterial = new MeshStandardMaterial({ color: "#6f5733", roughness: 0.5, metalness: 0.8, flatShading: true });
  const pipeMaterial = new MeshStandardMaterial({ color: "#1d1f25", roughness: 0.68, metalness: 0.35, flatShading: true });
  // Strong cyan aether energy on the suspended containment node (emissive; no
  // orange — this is a field shaper, not a forge).
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
  const coilGeo = new TorusGeometry(0.095, 0.022, 12, 26, COIL_ARC);
  const collarGeo = new TorusGeometry(0.085, 0.03, 10, 24);
  const hubGeo = new TorusGeometry(0.024, 0.012, 10, 20);
  const nodeGeo = new IcosahedronGeometry(0.022, 0);
  const nodeCoreGeo = new IcosahedronGeometry(0.013, 0);
  const conduitGeo = new CylinderGeometry(0.017, 0.019, 1, 10);
  const conduitRingGeo = new TorusGeometry(0.021, 0.007, 8, 16);
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
  make("coil", coilGeo, brassMaterial, 1);
  make("collar", collarGeo, brassMaterial, 1);
  make("hub", hubGeo, brassMaterial, 2);
  make("node", nodeGeo, cyanMaterial, 1);
  make("nodeCore", nodeCoreGeo, cyanBrightMaterial, 1);
  make("conduit", conduitGeo, pipeMaterial, 2);
  make("conduitRing", conduitRingGeo, brassDarkMaterial, 2);
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
  const spinQuat = new Quaternion();
  const tmpEuler = new Euler();
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
    // Piece offsets and instance scale grow with AETHERWARD_COIL_SCALE about
    // the dock origin; the scene-anchor position (wx, sy, wz) never scales so
    // docked instances stay on their socket.
    position.set(wx + ox * AETHERWARD_COIL_SCALE, sy + oy * AETHERWARD_COIL_SCALE, wz + oz * AETHERWARD_COIL_SCALE);
    scale.set(sx * AETHERWARD_COIL_SCALE, sy2 * AETHERWARD_COIL_SCALE, sz * AETHERWARD_COIL_SCALE);
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

  // Places a piece with a caller-supplied orientation quaternion (used to lay
  // the horseshoe coil flat and spin its open mouth onto the forward axis).
  const addPieceQuat = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, quat: Quaternion): void => {
    const slot = slots.get(key);
    if (!slot || slot.count >= slot.cap) return;
    position.set(wx + ox * AETHERWARD_COIL_SCALE, sy + oy * AETHERWARD_COIL_SCALE, wz + oz * AETHERWARD_COIL_SCALE);
    scale.set(AETHERWARD_COIL_SCALE, AETHERWARD_COIL_SCALE, AETHERWARD_COIL_SCALE);
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

  // Coil_Assembly: the horseshoe coil — a thick aged-brass hoop laid around
  // the pod crown, swept 275° so its open ~85° mouth faces outward (+X), with
  // a small suspended cyan aether node cradled in that notch between the two
  // prongs. The ring's far arc passes behind the pod so the machine reads as
  // a quiet field-shaping cradle.
  const addCoilAssembly = (wx: number, sy: number, wz: number): void => {
    const alignE = eulerFromDirZ(0, 1, 0);
    const alignQuat = new Quaternion().setFromEuler(new Euler(alignE.rx, alignE.ry, alignE.rz, "XYZ"));
    spinQuat.setFromAxisAngle(yAxis, MOUTH_OFFSET);
    pieceQuat.copy(alignQuat).multiply(spinQuat);
    addPieceQuat("coil", wx, sy, wz, 0.02, 0.175, 0, pieceQuat);
    addPiece("node", wx, sy, wz, 0.11, 0.178, 0);
    addPiece("nodeCore", wx, sy, wz, 0.11, 0.181, 0);
  };

  // Brass_Base: a thick brass collarring seated on the pod's shoulder where
  // the coil is anchored, plus two brass hubs under the coil's front prongs.
  const addBrassBase = (wx: number, sy: number, wz: number): void => {
    addRingAlong("collar", wx, sy, wz, 0.03, 0.165, 0, 0, 1, 0);
    addRingAlong("hub", wx, sy, wz, 0.095, 0.164, 0.064, 0, 1, 0);
    addRingAlong("hub", wx, sy, wz, 0.095, 0.164, -0.064, 0, 1, 0);
  };

  // Feed_Conduits: two thick insulated conduits running from the coil prongs
  // down into the module body, each with a brass collar ring.
  const addFeedConduits = (wx: number, sy: number, wz: number): void => {
    for (const flank of [-1, 1]) {
      const startX = 0.095;
      const startY = 0.172;
      const endX = 0.03;
      const endY = 0.1;
      const dx = endX - startX;
      const dy = endY - startY;
      const len = Math.hypot(dx, dy);
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      addPieceAlong("conduit", wx, sy, wz, midX, midY, 0.06 * flank, dx, dy, 0, len);
      addRingAlong("conduitRing", wx, sy, wz, midX, midY, 0.06 * flank, dx, dy, 0);
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
    addCoilAssembly(wx, sy, wz);
    addBrassBase(wx, sy, wz);
    addFeedConduits(wx, sy, wz);
    addRearCoupling(wx, sy, wz);
  };

  // ─── Static asset ───────────────────────────────────────────────────
  // This module carries no idle animation (no node pulse, no coil spin): it
  // renders once and `update` is a no-op that keeps the interactive harness
  // uniform across module families.
  type AwcRecord = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
  };
  const records: AwcRecord[] = [];

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

  // No idle animation on this cartridge: the horseshoe coil sits static.
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