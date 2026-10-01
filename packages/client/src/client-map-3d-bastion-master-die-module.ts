// Bastion Master-Die (BMD) module — a compact attachable AFC module that
// fabricates the massive standardized armor sections required for Titanium
// Bastions. It holds the specialized master tooling for fortress hulls: one
// huge armored stamping die on top of the pod, a giant press block that forms
// full armor plates rather than working metal generally.
//
// Local space: +X is FORWARD — the outward radial direction of the socket (its
// `yaw`). The root sits at the socket attachment point (the pad-top center, `y`
// returned by moduleSocketAttachments). Dock it with
// addInstance(att.x, att.z, att.y, att.yaw, ...) so the coupling faces the AFC
// core.
//
// Procedural hierarchy (every child is logically parented to BMD_Root at the bay
// center, yaw-aligned to face outward):
//   BMD_Root
//   ├── Seat                  — dockable circular base + brass locking lip
//   ├── Pod                   — the same low blackened capsule every other
//   │     family docks with, carrying one brass band
//   ├── Die_Press             — THE dominant mechanism: one huge armored
//   │   │   stamping die mounted on the pod — a giant press block
//   │   ├── Lower_Die         — the broad angular armor-bed platen integrated
//   │   │   straight into the module body
//   │   ├── Heat_Seam         — the thin restrained orange glow of the
//   │   │   red-hot blank held in the narrow bite between the platens
//   │   ├── Upper_Die         — the thick opposing platen, marginally wider
//   │   │   than the bed it lands on
//   │   ├── Hydraulic_Ram     — the short oversized ram sitting on the upper
//   │   │   die, fatter than the frame legs
//   │   ├── Legs★2 + caps     — thick hydraulic cylinders straddling the press
//   │   │   in the Z direction, carrying the header down to the pod
//   │   └── Header            — the heavy crown bridging the two legs and
//   │       driving its weight straight down through the ram onto the dies
//   ├── Feed_Slot             — one reinforced titanium-grey tray on the front
//   │     feeding raw blanks into the gap, edged by two brass cheeks
//   └── Rear_Coupling         — one heavy rear AFC connector: thick steel stub,
//         brass collar ring and a cyan contact tip
//
// This is a static family like every other module except the Catalyst
// Fabricator: mass-production of fortress armor reads from the silhouette — a
// giant press block of two broad platens, a heavy header and an oversized ram —
// not from any moving part, so `update` is a no-op that keeps the interactive
// harness uniform across module families.
//
// The press block sets this family's width and the shared AFC bay inner radius
// (0.14 world, 0.105 local) caps it: the header's corners read 0.089 local =
// 0.119 world, inside the limit. The module's height is pinned by the header's
// crown, the tallest point: 0.247 × 1.33 = 0.3285, under the 0.34 ceiling.

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
  BMD_COUPLING,
  BMD_COUPLING_TIP,
  BMD_FEED,
  BMD_FEED_CHEEK,
  BMD_HEADER,
  BMD_LEG,
  BMD_LEG_CAP,
  BMD_LOWER_DIE,
  BMD_POD,
  BMD_RAM,
  BMD_RAM_COLLAR,
  BMD_SEAM,
  BMD_TOWER_TOP,
  BMD_UPPER_DIE,
  createBastionMasterDieParts
} from "./client-map-3d-bastion-master-die-parts.js";

// Uniform 33% scale-up applied to every module-local position and instance
// scale about the dock origin, matching the other AFC module families.
export const BASTION_MASTER_DIE_SCALE = 1.33;
// Footprint radius of the dockable seat — below the AFC bay inner radius
// (0.14) so the module slots into the socket ring with clearance.
export const BASTION_MASTER_DIE_BASE_RADIUS = 0.105 * BASTION_MASTER_DIE_SCALE;
// Total height above the pad top. The highest point is the crown of the press
// header, not the dies or the legs: 0.247 × 1.33.
export const BASTION_MASTER_DIE_MODULE_HEIGHT = BMD_TOWER_TOP * BASTION_MASTER_DIE_SCALE;

export type BastionMasterDieModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createBastionMasterDieModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): BastionMasterDieModuleOverlay => {
  const C = maxInstances;
  const PI_2 = Math.PI / 2;
  const { geometries: geo, materials: mat } = createBastionMasterDieParts();

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
  make("lowerDie", geo.lowerDie, mat.steelTitan, 1);
  make("upperDie", geo.upperDie, mat.steelTitan, 1);
  make("seam", geo.seam, mat.orange, 1);
  make("ram", geo.ram, mat.steel, 1);
  make("ramCollar", geo.ramCollar, mat.brass, 1);
  make("header", geo.header, mat.steel, 1);
  make("leg", geo.leg, mat.steel, 2);
  make("legCap", geo.legCap, mat.brass, 2);
  make("feed", geo.feed, mat.steelTitan, 1);
  make("feedCheek", geo.feedCheek, mat.brass, 2);
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
    // Piece offsets and instance scale grow with BASTION_MASTER_DIE_SCALE
    // about the dock origin, so world offsets are left unscaled by design.
    position.set(ox * BASTION_MASTER_DIE_SCALE, oy * BASTION_MASTER_DIE_SCALE, oz * BASTION_MASTER_DIE_SCALE);
    scale.set(sx * BASTION_MASTER_DIE_SCALE, sy2 * BASTION_MASTER_DIE_SCALE, sz * BASTION_MASTER_DIE_SCALE);
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
    addPiece("pod", wx, sy, wz, 0, BMD_POD.y, 0, 1, 1, BMD_POD.squash);
    addPiece("podBand", wx, sy, wz, 0, 0.085, 0, 1, 1, 1, 0, PI_2, 0);
  };

  // Die_Press: THE dominant mechanism — one huge armored stamping die on top of
  // the pod. The broad angular lower platen is integrated straight into the
  // body, the upper platen hangs beneath the short oversized ram, the ram is
  // driven by the header bridging two thick hydraulic legs, and a thin
  // restrained orange seam glows in the narrow bite where the red-hot blank is
  // being stamped.
  const addDiePress = (wx: number, sy: number, wz: number): void => {
    addPiece("lowerDie", wx, sy, wz, 0, BMD_LOWER_DIE.y, 0);
    addPiece("seam", wx, sy, wz, 0, BMD_SEAM.y, 0);
    addPiece("upperDie", wx, sy, wz, 0, BMD_UPPER_DIE.y, 0);
    addPieceAlong("ram", wx, sy, wz, 0, BMD_RAM.y, 0, 0, 1, 0, BMD_RAM.length);
    addPiece("ramCollar", wx, sy, wz, 0, BMD_RAM_COLLAR.y, 0, 1, 1, 1, 0, PI_2, 0);
    addPiece("header", wx, sy, wz, 0, BMD_HEADER.y, 0);
    for (const side of [1, -1]) {
      addPieceAlong("leg", wx, sy, wz, 0, BMD_LEG.center, BMD_LEG.z * side, 0, 1, 0, BMD_LEG.length);
      addPieceAlong("legCap", wx, sy, wz, 0, BMD_LEG_CAP.y, BMD_LEG.z * side, 0, 1, 0, BMD_LEG_CAP.length);
    }
  };

  // Feed_Slot: one reinforced titanium-grey tray on the front funnelling raw
  // blanks into the gap, edged by two brass cheeks.
  const addFeedSlot = (wx: number, sy: number, wz: number): void => {
    addPiece("feed", wx, sy, wz, BMD_FEED.x, BMD_FEED.y, 0);
    for (const side of [1, -1]) {
      addPiece("feedCheek", wx, sy, wz, BMD_FEED.x, BMD_FEED.y - 0.001, BMD_FEED_CHEEK.z * side);
    }
  };

  const addRearCoupling = (wx: number, sy: number, wz: number): void => {
    addPieceAlong("coupling", wx, sy, wz, BMD_COUPLING.stub, BMD_COUPLING.y, 0, -1, 0, 0, BMD_COUPLING.length);
    addRingAlong("couplingRing", wx, sy, wz, BMD_COUPLING.ring, BMD_COUPLING.y, 0, 1, 0, 0);
    addPieceAlong("couplingTip", wx, sy, wz, BMD_COUPLING.tip, BMD_COUPLING.y, 0, -1, 0, 0, BMD_COUPLING_TIP.length);
  };

  const addModule = (wx: number, sy: number, wz: number): void => {
    addSeat(wx, sy, wz);
    addPod(wx, sy, wz);
    addDiePress(wx, sy, wz);
    addFeedSlot(wx, sy, wz);
    addRearCoupling(wx, sy, wz);
  };

  // ─── Static asset ───────────────────────────────────────────────────
  // This module carries no idle animation (mass-production of fortress armor
  // reads from its silhouette — a giant press block of two broad platens, a
  // heavy header and an oversized ram — not from any moving part): it renders
  // once and `update` is a no-op that keeps the interactive harness uniform
  // across module families.
  type BmdRecord = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
  };
  const records: BmdRecord[] = [];

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

  // No idle animation on this master die: nothing stamps and nothing pulses,
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