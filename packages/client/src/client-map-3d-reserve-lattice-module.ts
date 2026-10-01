// Reserve Lattice (RL) module — a compact attachable AFC module that stores and
// regulates a settlement's reserve manpower capacity, fabrication patterns and
// dormant production potential. It is a reserve bank, not a miner or a
// generator: one oversized cage-like lattice drum laid horizontally across the
// pod holds everything the settlement keeps in store.
//
// Local space: +X is FORWARD — the outward radial direction of the socket (its
// `yaw`). The root sits at the socket attachment point (the pad-top center, `y`
// returned by moduleSocketAttachments). Dock it with
// addInstance(att.x, att.z, att.y, att.yaw, ...) so the coupling faces the AFC
// core.
//
// Procedural hierarchy (every child is logically parented to RL_Root at the bay
// center, yaw-aligned to face outward):
//   RL_Root
//   ├── Seat                — dockable circular base + brass locking lip
//   ├── Pod                 — the same low blackened capsule every other family
//   │     docks with, carrying one brass band
//   ├── Reserve_Drum        — THE dominant mechanism: one oversized cage-like
//   │   │   lattice drum lying across the pod along the local Z axis,
//   │   │   tangential to the ring
//   │   ├── Dark_Cylinder   — the inner steel bank the cage wraps
//   │   ├── Ribs★4          — thick aged-brass hoops laid evenly along the
//   │   │   barrel, swept aside at the centre
//   │   ├── Bars★7          — thin steel rails dissolving the cage circle into
//   │   │   a lattice that the glow reads through
//   │   ├── Clamps★2        — one compact locking clamp at either end
//   │   ├── Store_Glow      — the faint dim cyan core held inside the lattice
//   │   └── Nodes★5         — cyan indicator dots along the drum's top ridge
//   ├── Retaining_Conduits  — two heavy runs tying the drum down into the rear
//   │   of the pod, feeding the cell from the AFC
//   └── Rear_Coupling       — one heavy rear AFC connector: thick steel stub,
//         brass collar ring and a cyan contact tip
//
// This is a static family like every other module except the Catalyst
// Fabricator: stored capacity reads from the silhouette — one big barrel of a
// cage lying across the pod — not from any moving part, so `update` is a no-op
// that keeps the interactive harness uniform across module families.
//
// The drum sets this family's width and the shared AFC bay inner radius
// (0.14 world, 0.105 local) caps it: the end clamps read 0.092 off-axis, under
// the limit. The module's height is pinned by the indicator nodes on the
// cage's top rail, the tallest point: 0.247 × 1.33 = 0.3285, under the 0.34
// ceiling.

import {
  BufferGeometry,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  Texture,
  Vector3
} from "three";
import { applyBuildingEnvMap } from "./client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import {
  RL_BAR,
  RL_BAR_AZIMUTHS,
  RL_CLAMP,
  RL_CLAMP_Z,
  RL_CONDUIT,
  RL_DRUM,
  RL_DRUM_CORE,
  RL_DRUM_TOP,
  RL_GLOW,
  RL_NODE,
  RL_NODE_Z,
  RL_POD,
  RL_RIB,
  RL_RIB_Z,
  RL_TOWER_TOP,
  createReserveLatticeParts
} from "./client-map-3d-reserve-lattice-parts.js";

// Uniform 33% scale-up applied to every module-local position and instance
// scale about the dock origin, matching the other AFC module families.
export const RESERVE_LATTICE_SCALE = 1.33;
// Footprint radius of the dockable seat — below the AFC bay inner radius
// (0.14) so the module slots into the socket ring with clearance.
export const RESERVE_LATTICE_BASE_RADIUS = 0.105 * RESERVE_LATTICE_SCALE;
// Total height above the pad top. The highest point is the indicator nodes on
// the drum's top ridge, not the ribs or the clamps: 0.247 × 1.33.
export const RESERVE_LATTICE_MODULE_HEIGHT = RL_TOWER_TOP * RESERVE_LATTICE_SCALE;

export type ReserveLatticeModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createReserveLatticeModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): ReserveLatticeModuleOverlay => {
  const C = maxInstances;
  const PI_2 = Math.PI / 2;
  const { geometries: geo, materials: mat } = createReserveLatticeParts();

  // ─── InstancedMesh registry ────────────────────────────────────────
  type Slot = { mesh: InstancedMesh; count: number; cap: number };
  const slots = new Map<string, Slot>();
  const ownedGeos = new Set<BufferGeometry>();
  const ownedMaterials = new Set<MeshStandardMaterial>();

  const make = (key: string, geometry: BufferGeometry, material: MeshStandardMaterial, perInstance: number): Slot => {
    applyBuildingEnvMap(material, buildingEnvironmentTexture);
    const mesh = new InstancedMesh(geometry, material, C * perInstance);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    const slot: Slot = { mesh, count: 0, cap: C * perInstance };
    slots.set(key, slot);
    ownedGeos.add(geometry);
    ownedMaterials.add(material);
    return slot;
  };

  make("base", geo.base, mat.iron, 1);
  make("baseRing", geo.baseRing, mat.brass, 1);
  make("pod", geo.pod, mat.iron, 1);
  make("podBand", geo.podBand, mat.brass, 1);
  make("drumCore", geo.drumCore, mat.steel, 1);
  make("rib", geo.rib, mat.brass, 4);
  make("bar", geo.bar, mat.steel, 7);
  make("clamp", geo.clamp, mat.brass, 2);
  make("glow", geo.glow, mat.glowDim, 1);
  make("node", geo.node, mat.cyan, 5);
  make("conduit", geo.conduit, mat.pipe, 2);
  make("coupling", geo.coupling, mat.steel, 1);
  make("couplingRing", geo.couplingRing, mat.brass, 1);
  make("couplingTip", geo.couplingTip, mat.cyan, 1);

  // ─── Helpers ────────────────────────────────────────────────────────
  const matrix = new Matrix4();
  const pieceMatrix = new Matrix4();
  const yawMatrix = new Matrix4();
  const originMatrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const yawQuat = new Quaternion();
  const pieceQuat = new Quaternion();
  const tmpEuler = new Euler();
  const tmpDir = new Vector3();
  const yAxis = new Vector3(0, 1, 0);
  const zAxis = new Vector3(0, 0, 1);

  const addPiece = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, sx = 1, sz = 1, sy2 = 1, rotY = 0, rotX = 0, rotZ = 0): void => {
    const slot = slots.get(key);
    if (!slot || slot.count >= slot.cap) return;
    // Piece offsets and instance scale grow with RESERVE_LATTICE_SCALE about
    // the dock origin, so world offsets are left unscaled by design.
    position.set(ox * RESERVE_LATTICE_SCALE, oy * RESERVE_LATTICE_SCALE, oz * RESERVE_LATTICE_SCALE);
    scale.set(sx * RESERVE_LATTICE_SCALE, sy2 * RESERVE_LATTICE_SCALE, sz * RESERVE_LATTICE_SCALE);
    if (rotX === 0 && rotY === 0 && rotZ === 0) {
      pieceQuat.identity();
    } else {
      tmpEuler.set(rotX, rotY, rotZ, "XYZ");
      pieceQuat.setFromEuler(tmpEuler);
    }
    pieceMatrix.compose(position, pieceQuat, scale);
    // Yaw about the module's OWN dock point: world = origin + yaw·localOffset.
    // Folding the origin into the rotation (yaw·(origin + localOffset)) would
    // swing the whole module around the world origin instead, throwing a docked
    // module clean off its socket — on the AFC's socket ring that lands a module
    // most of a bay away from the socket it was handed.
    originMatrix.makeTranslation(wx, sy, wz);
    matrix.multiplyMatrices(originMatrix, yawMatrix).multiply(pieceMatrix);
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
    addPiece("pod", wx, sy, wz, 0, RL_POD.y, 0, 1, 1, RL_POD.squash);
    addPiece("podBand", wx, sy, wz, 0, 0.085, 0, 1, 1, 1, 0, PI_2, 0);
  };

  // Reserve_Drum: THE dominant mechanism — the oversized cage-like lattice drum
  // lying across the pod along the local Z axis. Thick brass ribs around a dark
  // inner steel cylinder, the ribs tied into a lattice by thin steel bars, one
  // compact clamp at either end, and the drum's centre swept open to hold the
  // faint stored glow that the lattice lets you read through.
  const addReserveDrum = (wx: number, sy: number, wz: number): void => {
    addPieceAlong("drumCore", wx, sy, wz, 0, RL_DRUM.y, 0, 0, 0, 1, RL_DRUM_CORE.length);
    for (const z of RL_RIB_Z) addRingAlong("rib", wx, sy, wz, 0, RL_DRUM.y, z, 0, 0, 1);
    for (const a of RL_BAR_AZIMUTHS) {
      addPieceAlong("bar", wx, sy, wz, Math.cos(a) * RL_DRUM.radius, RL_DRUM.y + Math.sin(a) * RL_DRUM.radius, 0, 0, 0, 1, RL_BAR.length);
    }
    for (const z of RL_CLAMP_Z) addRingAlong("clamp", wx, sy, wz, 0, RL_DRUM.y, z, 0, 0, 1);
    // The faint contained glow, held in the lattice between the steel and the
    // cage where the ribs are swept aside — stored capacity, not a reactor.
    addPieceAlong("glow", wx, sy, wz, 0, RL_GLOW.y, RL_GLOW.z, 0, 0, 1, RL_GLOW.length);
    for (const z of RL_NODE_Z) addPiece("node", wx, sy, wz, 0, RL_DRUM_TOP + RL_NODE.lift, z);
  };

  // Retaining_Conduits: two heavy runs tying the drum down and back into the
  // rear of the pod either side of the coupling, feeding the lattice cell from
  // the AFC.
  const addRetainingConduits = (wx: number, sy: number, wz: number): void => {
    for (const side of [1, -1]) {
      const dx = RL_CONDUIT.top.x - RL_CONDUIT.foot.x;
      const dy = RL_CONDUIT.top.y - RL_CONDUIT.foot.y;
      const len = Math.hypot(dx, dy);
      addPieceAlong(
        "conduit",
        wx,
        sy,
        wz,
        (RL_CONDUIT.foot.x + RL_CONDUIT.top.x) * 0.5,
        (RL_CONDUIT.foot.y + RL_CONDUIT.top.y) * 0.5,
        RL_CONDUIT.z * side,
        dx,
        dy,
        0,
        len
      );
    }
  };

  const addRearCoupling = (wx: number, sy: number, wz: number): void => {
    addPieceAlong("coupling", wx, sy, wz, -0.058, 0.085, 0, -1, 0, 0, 0.05);
    addRingAlong("couplingRing", wx, sy, wz, -0.056, 0.085, 0, 1, 0, 0);
    addPieceAlong("couplingTip", wx, sy, wz, -0.088, 0.085, 0, -1, 0, 0, 0.016);
  };

  const addModule = (wx: number, sy: number, wz: number): void => {
    addSeat(wx, sy, wz);
    addPod(wx, sy, wz);
    addReserveDrum(wx, sy, wz);
    addRetainingConduits(wx, sy, wz);
    addRearCoupling(wx, sy, wz);
  };

  // ─── Static asset ───────────────────────────────────────────────────
  // This module carries no idle animation (stored capacity reads from its
  // silhouette — one big barrel of a cage across the pod — not from any moving
  // part): it renders once and `update` is a no-op that keeps the interactive
  // harness uniform across module families.
  type RlRecord = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
  };
  const records: RlRecord[] = [];

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

  // No idle animation on this reserve bank: nothing sweeps and nothing pulses,
  // with `update` kept on the overlay contract so the interactive harness
  // (per-module and AFC update loops) stays uniform across all module families.
  const update = (_nowMs: number): void => {};

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMaterials) m.dispose();
  };

  return { clear, addInstance, commit, update, dispose };
};