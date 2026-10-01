// Ancillary Control Core (ACC) module — a compact attachable AFC module that
// coordinates auxiliary production systems and raises how many industrial
// processes a settlement can run in parallel. It is a controller, not a miner,
// a refinery or a generator: one central processor core governs four
// subordinate relay blocks, and the whole machine is deliberately quieter than
// the power-heavy families.
//
// Local space: +X is FORWARD — the outward radial direction of the socket (its
// `yaw`). The root sits at the socket attachment point (the pad-top center, `y`
// returned by moduleSocketAttachments). Dock it with
// addInstance(att.x, att.z, att.y, att.yaw, ...) so the control core faces away
// from the AFC core.
//
// Procedural hierarchy (every child is logically parented to ACC_Root at the
// bay center, yaw-aligned to face outward):
//   ACC_Root
//   ├── Seat                — dockable circular base + brass locking lip
//   ├── Pod                 — the same low blackened capsule every other family
//   │     docks with, carrying one brass band
//   ├── Control_Core        — THE dominant mechanism: one squat VERTICAL
//   │   │   processor housing mounted through the pod's crown, clamped by two
//   │   │   heavy brass bands and finned on its lower half
//   │   ├── Glow_Core       — a small contained cyan light behind a cage
//   │   └── Cage            — four thin brass rods and two hoops around the
//   │       glow, so the core reads as a guarded control light, not a lamp
//   ├── Control_Arms★4      — four evenly spaced articulated arms at the
//   │   │   cardinal azimuths, each a shoulder joint, a thick conduit run, an
//   │   │   elbow joint and a kinked drop out to a squat vertical relay block
//   │   └── Relay_Blocks★4  — the subordinate systems each arm rules; their
//   │       brass collars tie them back to the central core
//   ├── Power_Conduits      — two thick runs around the rear bracing the
//   │   │   housing down onto the pod, flanking the coupling
//   └── Rear_Coupling       — one heavy rear AFC connector: thick steel stub,
//         brass collar ring and a cyan contact tip
//
// This is a static family like every other module except the Catalyst Fabricator:
// the controller's authority reads from its silhouette — a single commanding
// tower ringed by four reaching arms — not from any moving part, so `update` is
// a no-op that keeps the interactive harness uniform across module families.
//
// The arms set this family's width and the AFC bay inner radius (0.14 world,
// 0.105 local) caps it: the relay blocks' outer faces read 0.098 off-axis, under
// the limit. The module's height is pinned by the cage, the tallest point:
// 0.221 × 1.33 = 0.2939, well under the 0.34 ceiling.

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
  ACC_ARM,
  ACC_ARM_AZIMUTHS,
  ACC_CAGE,
  ACC_CAGE_HOOP_Y,
  ACC_CAGE_ROD_AZIMUTHS,
  ACC_CAGE_ROD_Y,
  ACC_CLAMP,
  ACC_CLAMP_Y,
  ACC_CONDUIT,
  ACC_CORE,
  ACC_FIN,
  ACC_FIN_Y,
  ACC_GLOW,
  ACC_POD,
  createAncillaryControlCoreParts
} from "./client-map-3d-ancillary-control-core-parts.js";

// Uniform 33% scale-up applied to every module-local position and instance
// scale about the dock origin, matching the other AFC module families.
export const ANCILLARY_CONTROL_CORE_SCALE = 1.33;
// Footprint radius of the dockable seat — below the AFC bay inner radius
// (0.14) so the module slots into the socket ring with clearance.
export const ANCILLARY_CONTROL_CORE_BASE_RADIUS = 0.105 * ANCILLARY_CONTROL_CORE_SCALE;
// Total height above the pad top. The highest point is the cage's top hoop,
// not the relay blocks or the arms: (0.218 + 0.003) × 1.33.
export const ANCILLARY_CONTROL_CORE_MODULE_HEIGHT = (ACC_CAGE_HOOP_Y[1] + ACC_CAGE.hoopTube) * ANCILLARY_CONTROL_CORE_SCALE;

export type AncillaryControlCoreModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createAncillaryControlCoreModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): AncillaryControlCoreModuleOverlay => {
  const C = maxInstances;
  const PI_2 = Math.PI / 2;
  // The part catalogue — every geometry, material and profile constant this
  // module is built from — lives in its own module. This overlay only decides
  // where each piece sits.
  const { geometries: geo, materials: mat } = createAncillaryControlCoreParts();

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
  make("core", geo.core, mat.steel, 1);
  make("clamp", geo.clamp, mat.brass, 2);
  make("fin", geo.fin, mat.steel, 3);
  make("glow", geo.glow, mat.cyan, 1);
  make("cageRod", geo.cageRod, mat.brass, 4);
  make("cageHoop", geo.cageHoop, mat.brass, 2);
  make("shoulder", geo.shoulder, mat.brass, 4);
  make("upperArm", geo.upperArm, mat.pipe, 4);
  make("elbow", geo.elbow, mat.brass, 4);
  make("lowerArm", geo.lowerArm, mat.pipe, 4);
  make("relay", geo.relay, mat.steel, 4);
  make("relayCollar", geo.relayCollar, mat.brass, 4);
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
    // Piece offsets and instance scale grow with ANCILLARY_CONTROL_CORE_SCALE
    // about the dock origin, so world offsets are left unscaled by design.
    position.set(ox * ANCILLARY_CONTROL_CORE_SCALE, oy * ANCILLARY_CONTROL_CORE_SCALE, oz * ANCILLARY_CONTROL_CORE_SCALE);
    scale.set(sx * ANCILLARY_CONTROL_CORE_SCALE, sy2 * ANCILLARY_CONTROL_CORE_SCALE, sz * ANCILLARY_CONTROL_CORE_SCALE);
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
    addPiece("pod", wx, sy, wz, 0, ACC_POD.y, 0, 1, 1, ACC_POD.squash);
    addPiece("podBand", wx, sy, wz, 0, 0.085, 0, 1, 1, 1, 0, PI_2, 0);
  };

  // Control_Core: the squat vertical processor housing, its brass clamp bands
  // and the compact cooling fins. Everything stands on the module's own centre
  // line — the tower the four arms radiate from.
  const addControlCore = (wx: number, sy: number, wz: number): void => {
    addPiece("core", wx, sy, wz, 0, ACC_CORE.y, 0);
    for (const y of ACC_CLAMP_Y) addRingAlong("clamp", wx, sy, wz, 0, y, 0, 0, 1, 0);
    for (const y of ACC_FIN_Y) addPiece("fin", wx, sy, wz, 0, y, 0);
    // The restrained glow core, read through the cage. Four thin rods at the
    // diagonal azimuths so the cage never hides behind the cardinal arms.
    addPiece("glow", wx, sy, wz, 0, ACC_GLOW.y, 0);
    for (const a of ACC_CAGE_ROD_AZIMUTHS) {
      addPieceAlong("cageRod", wx, sy, wz, Math.cos(a) * ACC_CAGE.radius, ACC_CAGE_ROD_Y, Math.sin(a) * ACC_CAGE.radius, 0, 1, 0, ACC_CAGE.rodLength);
    }
    for (const y of ACC_CAGE_HOOP_Y) addRingAlong("cageHoop", wx, sy, wz, 0, y, 0, 0, 1, 0);
  };

  // Control_Arms: four articulated arms at the cardinal azimuths. Each runs a
  // shoulder joint on the housing flank, a thick conduit up and out to an
  // elbow, then a kinked drop to a squat relay block standing at the outer end
  // — the four subordinate systems the core coordinates.
  const addControlArms = (wx: number, sy: number, wz: number): void => {
    for (const a of ACC_ARM_AZIMUTHS) {
      const ux = Math.cos(a);
      const uz = Math.sin(a);
      addPiece("shoulder", wx, sy, wz, ACC_ARM.shoulderR * ux, ACC_ARM.shoulderY, ACC_ARM.shoulderR * uz);
      const uDx = (ACC_ARM.upperOut - ACC_ARM.shoulderR) * ux;
      const uDy = ACC_ARM.upperY - ACC_ARM.shoulderY;
      const uDz = (ACC_ARM.upperOut - ACC_ARM.shoulderR) * uz;
      const uLen = Math.hypot(uDx, uDy, uDz);
      addPieceAlong(
        "upperArm",
        wx,
        sy,
        wz,
        (ACC_ARM.shoulderR + ACC_ARM.upperOut) * 0.5 * ux,
        (ACC_ARM.shoulderY + ACC_ARM.upperY) * 0.5,
        (ACC_ARM.shoulderR + ACC_ARM.upperOut) * 0.5 * uz,
        uDx,
        uDy,
        uDz,
        uLen
      );
      addPiece("elbow", wx, sy, wz, ACC_ARM.elbowR * ux, ACC_ARM.elbowY, ACC_ARM.elbowR * uz);
      const lDx = (ACC_ARM.lowerOut - ACC_ARM.elbowR) * ux;
      const lDy = ACC_ARM.relayY - ACC_ARM.elbowY;
      const lDz = (ACC_ARM.lowerOut - ACC_ARM.elbowR) * uz;
      const lLen = Math.hypot(lDx, lDy, lDz);
      addPieceAlong(
        "lowerArm",
        wx,
        sy,
        wz,
        (ACC_ARM.elbowR + ACC_ARM.lowerOut) * 0.5 * ux,
        (ACC_ARM.elbowY + ACC_ARM.relayY) * 0.5,
        (ACC_ARM.elbowR + ACC_ARM.lowerOut) * 0.5 * uz,
        lDx,
        lDy,
        lDz,
        lLen
      );
      addPiece("relay", wx, sy, wz, ACC_ARM.relayCenterR * ux, ACC_ARM.relayY, ACC_ARM.relayCenterR * uz);
      addRingAlong("relayCollar", wx, sy, wz, ACC_ARM.relayCenterR * ux, ACC_ARM.collarY, ACC_ARM.relayCenterR * uz, 0, 1, 0);
    }
  };

  // Power_Conduits: two thick runs around the rear, bracing the housing down
  // onto the pod band either side of the coupling.
  const addPowerConduits = (wx: number, sy: number, wz: number): void => {
    for (const side of [1, -1]) {
      const dx = ACC_CONDUIT.top.x - ACC_CONDUIT.foot.x;
      const dy = ACC_CONDUIT.top.y - ACC_CONDUIT.foot.y;
      const len = Math.hypot(dx, dy);
      addPieceAlong(
        "conduit",
        wx,
        sy,
        wz,
        (ACC_CONDUIT.foot.x + ACC_CONDUIT.top.x) * 0.5,
        (ACC_CONDUIT.foot.y + ACC_CONDUIT.top.y) * 0.5,
        ACC_CONDUIT.z * side,
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
    addControlCore(wx, sy, wz);
    addControlArms(wx, sy, wz);
    addPowerConduits(wx, sy, wz);
    addRearCoupling(wx, sy, wz);
  };

  // ─── Static asset ───────────────────────────────────────────────────
  // This module carries no idle animation (a controller's authority reads from
  // its silhouette, not from any moving part): it renders once and `update` is
  // a no-op that keeps the interactive harness uniform across module families.
  type AccRecord = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
  };
  const records: AccRecord[] = [];

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

  // No idle animation on this control core: nothing sweeps and nothing pulses,
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