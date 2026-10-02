// Thunderplate Induction (TPL) module — a compact attachable AFC module that
// fabricates electrically charged armor plate and the induction systems fitted
// to Thunder Bastions. It takes formed armor and imbues it with an active
// electrical field — deliberately the mirror image of the Bastion Master-Die,
// which physically stamps armor into shape instead.
//
// Local space: +X is FORWARD — the outward radial direction of the socket (its
// `yaw`). The root sits at the socket attachment point (the pad-top center, `y`
// returned by moduleSocketAttachments). Dock it with
// addInstance(att.x, att.z, att.y, att.yaw, ...) so the coupling faces the AFC
// core.
//
// Procedural hierarchy (every child is logically parented to TPL_Root at the bay
// center, yaw-aligned to face outward):
//   TPL_Root
//   ├── Seat                  — dockable circular base + brass locking lip
//   ├── Pod                   — the same low blackened capsule every other
//   │     family docks with, carrying one brass band
//   ├── Blank_Plate           — THE dominant mechanism: one heavy unfinished
//   │   │   titanium-grey armor slab held HORIZONTAL above the pod, with a
//   │   │   paler un-energized inset on its top
//   │   └── Induction_Coil    — three BROAD aged-copper loops standing on edge
//   │       around the blank's short dimension, hugging it tight and reading as
//   │       a solenoid wrapped around the plate's length
//   ├── Electrodes★2          — chunky blackened columns at the plate's long
//   │   │   ends, each with a brass collar at its base and a head reaching to a
//   │   │   contact pad a few millimetres off the plate's end face
//   │   └── Arcs (4 nodes)    — bright cyan-white electric sparks jumping the
//   │         contact gaps, the family's defining glow
//   ├── Transformer           — a compact capacitor block on the pod behind the
//   │     assembly (brass-capped, copper-finned) feeding the induction system
//   └── Rear_Coupling         — one heavy rear AFC connector: thick steel stub,
//         brass collar ring and a cyan contact tip
//
// This is a static family like every other module except the Catalyst
// Fabricator: induction energy reads from the silhouette — a huge coil wrapped
// around a clamped plate with live arcs jumping to riveted electrode arms — not
// from any moving part, so `update` is a no-op that keeps the interactive
// harness uniform across module families.
//
// The coil and the electrodes set this family's width and the shared AFC bay
// inner radius (0.14 world, 0.105 local) caps it: the electrode columns read
// 0.088 local = 0.117 world, inside the limit. The module's height is pinned by
// the electrode terminals, the tallest point: 0.24 × 1.33 = 0.3192, under the
// 0.34 ceiling.

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
  TPL_ARC,
  TPL_CAPACITOR,
  TPL_CAPACITOR_CAP,
  TPL_CAPACITOR_FIN,
  TPL_ELECTRODE_COLLAR,
  TPL_ELECTRODE_COLUMN,
  TPL_ELECTRODE_HEAD,
  TPL_PLATE,
  TPL_PLATE_BLANK,
  TPL_POD,
  TPL_RING_STATIONS_X,
  TPL_TOWER_TOP,
  createThunderplateInductionParts
} from "./client-map-3d-thunderplate-induction-parts.js";

// Uniform 33% scale-up applied to every module-local position and instance
// scale about the dock origin, matching the other AFC module families.
export const THUNDERPLATE_INDUCTION_SCALE = 1.33;
// Footprint radius of the dockable seat — below the AFC bay inner radius
// (0.14) so the module slots into the socket ring with clearance.
export const THUNDERPLATE_INDUCTION_BASE_RADIUS = 0.105 * THUNDERPLATE_INDUCTION_SCALE;
// Total height above the pad top. The highest point is the electrode columns'
// terminals, not the coil rings or the blank: 0.24 × 1.33.
export const THUNDERPLATE_INDUCTION_MODULE_HEIGHT = TPL_TOWER_TOP * THUNDERPLATE_INDUCTION_SCALE;

export type ThunderplateInductionModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createThunderplateInductionModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): ThunderplateInductionModuleOverlay => {
  const C = maxInstances;
  const PI_2 = Math.PI / 2;
  const { geometries: geo, materials: mat } = createThunderplateInductionParts();

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
  make("plate", geo.plate, mat.steelTitan, 1);
  make("blank", geo.blank, mat.blankSteel, 1);
  make("ring", geo.ring, mat.copper, TPL_RING_STATIONS_X.length);
  make("column", geo.column, mat.iron, 2);
  make("columnCollar", geo.columnCollar, mat.brass, 2);
  make("head", geo.head, mat.steel, 2);
  make("arc", geo.arc, mat.arc, 4);
  make("capacitor", geo.capacitor, mat.steel, 1);
  make("capacitorCap", geo.capacitorCap, mat.brass, 1);
  make("capacitorFin", geo.capacitorFin, mat.copper, 2);
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
    // Piece offsets and instance scale grow with THUNDERPLATE_INDUCTION_SCALE
    // about the dock origin, so world offsets are left unscaled by design.
    position.set(ox * THUNDERPLATE_INDUCTION_SCALE, oy * THUNDERPLATE_INDUCTION_SCALE, oz * THUNDERPLATE_INDUCTION_SCALE);
    scale.set(sx * THUNDERPLATE_INDUCTION_SCALE, sy2 * THUNDERPLATE_INDUCTION_SCALE, sz * THUNDERPLATE_INDUCTION_SCALE);
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
    addPiece("pod", wx, sy, wz, 0, TPL_POD.y, 0, 1, 1, TPL_POD.squash);
    addPiece("podBand", wx, sy, wz, 0, 0.085, 0, 1, 1, 1, 0, PI_2, 0);
  };

  // Blank_Plate: THE dominant mechanism — one heavy unfinished titanium-grey
  // armor slab held horizontal above the pod, with a paler inset where it has
  // not yet been charged.
  const addBlankPlate = (wx: number, sy: number, wz: number): void => {
    addPiece("plate", wx, sy, wz, 0, TPL_PLATE.y, 0);
    addPiece("blank", wx, sy, wz, 0, TPL_PLATE_BLANK.y, 0);
  };

  // Induction_Coil: three broad copper loops standing on edge around the
  // blank's short dimension, axis along X, hugging the plate tight.
  const addCoil = (wx: number, sy: number, wz: number): void => {
    for (const station of TPL_RING_STATIONS_X) {
      addRingAlong("ring", wx, sy, wz, station, TPL_PLATE.y, 0, 1, 0, 0);
    }
  };

  // Electrodes: two chunky blackened columns at the plate's long ends, each
  // with a brass collar at its base and a head reaching to a contact pad just
  // off the plate's end face; two bright cyan-white arcs jump each gap.
  const addElectrodes = (wx: number, sy: number, wz: number): void => {
    for (const side of [1, -1]) {
      addPiece("column", wx, sy, wz, side * TPL_ELECTRODE_COLUMN.x, TPL_ELECTRODE_COLUMN.yC, 0);
      addPiece("columnCollar", wx, sy, wz, side * TPL_ELECTRODE_COLLAR.x, TPL_ELECTRODE_COLLAR.y, 0);
      addPiece("head", wx, sy, wz, side * TPL_ELECTRODE_HEAD.x, TPL_ELECTRODE_HEAD.y, 0);
      for (const nodeY of TPL_ARC.nodeYs) {
        addPiece("arc", wx, sy, wz, side * TPL_ARC.x, nodeY, 0);
      }
    }
  };

  // Transformer: a compact capacitor block on the pod behind the assembly,
  // brass-capped and copper-finned, feeding the induction system.
  const addTransformer = (wx: number, sy: number, wz: number): void => {
    addPiece("capacitor", wx, sy, wz, TPL_CAPACITOR.x, TPL_CAPACITOR.y, 0);
    addPiece("capacitorCap", wx, sy, wz, TPL_CAPACITOR_CAP.x, TPL_CAPACITOR_CAP.y, 0);
    for (const side of [1, -1]) {
      addPiece("capacitorFin", wx, sy, wz, TPL_CAPACITOR_FIN.x, TPL_CAPACITOR_FIN.y, side * TPL_CAPACITOR_FIN.z);
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
    addBlankPlate(wx, sy, wz);
    addCoil(wx, sy, wz);
    addElectrodes(wx, sy, wz);
    addTransformer(wx, sy, wz);
    addRearCoupling(wx, sy, wz);
  };

  // ─── Static asset ───────────────────────────────────────────────────
  // This module carries no idle animation (induction energy reads from its
  // silhouette — a huge coil wrapped around a clamped plate with live arcs
  // jumping the energized electrode arms — not from any moving part): it
  // renders once and `update` is a no-op that keeps the interactive harness
  // uniform across module families.
  type TplRecord = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
  };
  const records: TplRecord[] = [];

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

  // No idle animation on this induction rig: nothing crawls and nothing pulses,
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