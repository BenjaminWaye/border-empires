// Stratospheric Dockyard (SDY) module — a compact attachable AFC module that
// fabricates, assembles and services airborne docking infrastructure: the hull
// sections, spine booms and nacelle collars welded into the great sky docks.
//
// Local space: +X is FORWARD — the outward radial direction of the socket (its
// `yaw`). The root sits at the socket attachment point (the pad-top center, `y`
// returned by moduleSocketAttachments). Dock it with
// addInstance(att.x, att.z, att.y, att.yaw, ...) so the cradle faces away from
// the AFC core.
//
// Procedural hierarchy (every child is logically parented to SDY_Root at the
// bay center, yaw-aligned to face outward):
//   SDY_Root
//   ├── Seat                  — dockable circular base + brass locking lip
//   ├── Dock_Pod              — a low, wide blackened pod (deliberately
//   │     squatter than the taller families) carrying two brass bands
//   ├── Cradle_Plinth         — a low iron plinth with a brass rim on the pod's
//   │     crown: the docking cradle's mounting deck
//   ├── Docking_Cradle        — THE dominant mechanism: two heavy curved
//   │     support arms rising from the plinth and curling inward, forming a
//   │     wide open U around an empty central bay where an aerial hull section
//   │     is held during assembly, each arm banded by a brass clamp collar
//   ├── Lifting_Mast          — a short vertical mast on the pod's rear deck
//   │     with a brass base collar, capped by a chunky winch/capstan drum
//   │     with two brass end flanges and one cyan load gauge
//   ├── Hoist_Cables          — two thick cables running from the winch drum
//   │     forward to a brass lifting eye on each cradle arm tip
//   └── Rear_Coupling         — one heavy rear AFC coupling: thick steel stub,
//         brass collar ring and a bright cyan contact tip
//
// Construction is a heavy lifting rig: a squat rounded pod, one oversized
// open cradle and a short rear mast. It reads as the machine that lifts and
// holds aerial components in place — not a sky dock in its own right (no deck,
// no roof, no landing platform), and deliberately not a vehicle: there are no
// wings, no propellers, no nacelles and no fuselage.
//
// The cradle is the reason this family's pod is low and wide. The shared dock
// envelope caps a module at 0.34 world units tall (0.256 local), and the taller
// families spend nearly all of that on a pod whose crown reaches 0.215 — which
// leaves no room at all for an open cradle above it. A squashed 0.12-tall pod
// buys a 0.10-tall, 0.11-wide empty cradle bay that stays the loudest shape in
// the silhouette while keeping the same footprint, scale, dock interface and
// blackened-iron/aged-brass material language as every other family.
//
// No two pieces share a coplanar surface: the plinth's rim ring is seated into
// the plinth, the arm tips carry raised brass lifting eyes, and the winch
// flanges sit proud of the drum — otherwise the seams Z-fight into black line
// artifacts.

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
export const STRATODOCK_SCALE = 1.33;
// Footprint radius of the dockable seat — below the AFC bay inner radius
// (0.14) so the module slots into the socket ring with clearance.
export const STRATODOCK_BASE_RADIUS = 0.105 * STRATODOCK_SCALE;
// Total height above the pad top (top of the cradle arm tips and their brass
// lifting eyes), 0.252 × 1.33.
export const STRATODOCK_MODULE_HEIGHT = 0.252 * STRATODOCK_SCALE;

export type StratosphericDockyardModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createStratosphericDockyardModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): StratosphericDockyardModuleOverlay => {
  const C = maxInstances;
  const PI_2 = Math.PI / 2;
  // Docking_Cradle: the arms stand on the plinth rim and curl inward. Each arm
  // is a short arc of a large circle so it rises almost vertically and only
  // tucks in ~0.02 at the tip, keeping the bay between the arms wide open.
  // A quarter arc would sweep as far inward as it rises and close the bay shut.
  const CRADLE = {
    footZ: 0.075, // arm centerline at the plinth
    postTopY: 0.19, // where the post hands off to the arc
    arcRadius: 0.06,
    arcSweep: 0.84, // radians; rises 0.045, tucks 0.02
    arcCenterZ: 0.015,
    tipY: 0.2348, // postTopY + arcRadius·sin(arcSweep)
    tipZ: 0.055, // arcCenterZ + arcRadius·cos(arcSweep)
    tube: 0.015
  };
  // Lifting_Mast: a short rear mast with a capstan winch at its head.
  const MAST = { x: -0.058, baseY: 0.12, topY: 0.24, winchY: 0.205, winchR: 0.031 };

  // ─── Materials (shared by piece type) ───────────────────────────────
  const ironMaterial = new MeshStandardMaterial({ color: "#22242a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const steelMaterial = new MeshStandardMaterial({ color: "#17181d", roughness: 0.62, metalness: 0.5, flatShading: true });
  const brassMaterial = new MeshStandardMaterial({ color: "#8b6c3d", roughness: 0.42, metalness: 0.85, flatShading: true });
  // Restrained cyan aether accents — the winch load gauge and the rear contact
  // tip only; this is a lifting rig, not a reactor.
  const cyanMaterial = new MeshStandardMaterial({
    color: "#05222a",
    roughness: 0.3,
    metalness: 0.1,
    flatShading: true,
    emissive: "#41f6ff",
    emissiveIntensity: 2.0
  });

  // ─── Geometries (shared) ────────────────────────────────────────────
  // Small curved parts use high segment counts so flat-shaded facets never
  // read as black crease lines (see the Siege Lens Foundry module notes).
  const baseGeo = new CylinderGeometry(0.1, 0.105, 0.032, 16);
  const baseRingGeo = new TorusGeometry(0.12, 0.012, 12, 28);
  // A squashed capsule: a low, wide rounded pod so the cradle can dominate.
  const podGeo = new CapsuleGeometry(0.065, 0.02, 6, 16);
  const bandGeo = new TorusGeometry(0.068, 0.011, 10, 26);
  // Cradle_Plinth: the cradle's mounting deck on the pod's crown.
  const plinthGeo = new CylinderGeometry(0.082, 0.086, 0.022, 14);
  const plinthRimGeo = new TorusGeometry(0.084, 0.009, 10, 26);
  // Docking_Cradle: heavy arm posts plus the inward-curling arc tips.
  const postGeo = new CylinderGeometry(0.017, 0.017, 1, 10);
  const armArcGeo = new TorusGeometry(CRADLE.arcRadius, CRADLE.tube, 8, 18, CRADLE.arcSweep);
  const clampGeo = new TorusGeometry(0.021, 0.008, 8, 18);
  // Lifting_Mast: rear mast, capstan drum, flanges, cables and lifting eyes.
  const mastGeo = new CylinderGeometry(0.014, 0.014, 1, 10);
  const mastCollarGeo = new TorusGeometry(0.019, 0.008, 8, 18);
  const winchGeo = new CylinderGeometry(0.024, 0.024, 1, 12);
  const winchFlangeGeo = new CylinderGeometry(0.031, 0.031, 0.01, 14);
  const cableGeo = new CylinderGeometry(0.005, 0.005, 1, 6);
  const cableEyeGeo = new TorusGeometry(0.011, 0.005, 8, 14);
  const couplingGeo = new CylinderGeometry(0.024, 0.026, 1, 12);
  const couplingRingGeo = new TorusGeometry(0.03, 0.011, 10, 20);
  const couplingTipGeo = new CylinderGeometry(0.014, 0.014, 0.016, 14);
  const gaugeGeo = new CylinderGeometry(0.012, 0.012, 0.008, 12);

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
  make("plinth", plinthGeo, ironMaterial, 1);
  make("plinthRim", plinthRimGeo, brassMaterial, 1);
  make("post", postGeo, ironMaterial, 2);
  make("armArc", armArcGeo, ironMaterial, 2);
  make("clamp", clampGeo, brassMaterial, 2);
  make("mast", mastGeo, ironMaterial, 1);
  make("mastCollar", mastCollarGeo, brassMaterial, 1);
  make("winch", winchGeo, steelMaterial, 1);
  make("winchFlange", winchFlangeGeo, brassMaterial, 2);
  make("cable", cableGeo, steelMaterial, 2);
  make("cableEye", cableEyeGeo, brassMaterial, 2);
  make("coupling", couplingGeo, steelMaterial, 1);
  make("couplingRing", couplingRingGeo, brassMaterial, 1);
  make("couplingTip", couplingTipGeo, cyanMaterial, 1);
  make("gauge", gaugeGeo, cyanMaterial, 1);

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
    // Piece offsets and instance scale grow with STRATODOCK_SCALE about the
    // dock origin; the scene-anchor position (wx, sy, wz) never scales so
    // docked instances stay on their socket.
    position.set(wx + ox * STRATODOCK_SCALE, sy + oy * STRATODOCK_SCALE, wz + oz * STRATODOCK_SCALE);
    scale.set(sx * STRATODOCK_SCALE, sy2 * STRATODOCK_SCALE, sz * STRATODOCK_SCALE);
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

  // Dock_Pod: a low, wide blackened pod. sy2 squashes the capsule vertically so
  // the cradle above it stays the dominant shape.
  const addDockPod = (wx: number, sy: number, wz: number): void => {
    addPiece("pod", wx, sy, wz, 0, 0.082, 0, 1, 1, 0.8);
    addPiece("band", wx, sy, wz, 0, 0.078, 0, 1, 1, 1, 0, PI_2, 0);
    addPiece("band", wx, sy, wz, 0, 0.096, 0, 1, 1, 1, 0, PI_2, 0);
  };

  // Cradle_Plinth: the low iron deck with a brass rim that the cradle arms
  // stand on. The rim ring is seated into the plinth's own side wall so the two
  // are never coplanar.
  const addCradlePlinth = (wx: number, sy: number, wz: number): void => {
    addPiece("plinth", wx, sy, wz, 0, 0.148, 0);
    addPiece("plinthRim", wx, sy, wz, 0, 0.159, 0, 1, 1, 1, 0, PI_2, 0);
  };

  // Docking_Cradle: two heavy arms rising from the plinth and curling inward,
  // forming a wide open U around an empty bay. The arc is pre-baked as a
  // partial torus in its own XY plane, so a yaw of ∓90° stands it up in the
  // Z–Y plane with the arc sweeping from the arm's outer edge up to its tip.
  const addDockingCradle = (wx: number, sy: number, wz: number): void => {
    for (const flank of [-1, 1]) {
      const footZ = CRADLE.footZ * flank;
      // The post is a mid-pointed segment from the plinth rim up to the arc's
      // lower end, so its ends meet the plinth and the arc with no gap.
      addPieceAlong("post", wx, sy, wz, 0, (0.15 + CRADLE.postTopY) / 2, footZ, 0, 1, 0, CRADLE.postTopY - 0.15);
      addPiece("armArc", wx, sy, wz, 0, CRADLE.postTopY, CRADLE.arcCenterZ * flank, 1, 1, 1, flank === 1 ? -PI_2 : PI_2);
      addRingAlong("clamp", wx, sy, wz, 0, 0.168, footZ, 0, 1, 0);
    }
  };

  // Lifting_Mast: a short vertical mast on the pod's rear deck, capped by a
  // chunky capstan winch with brass end flanges and one cyan load gauge.
  const addLiftingMast = (wx: number, sy: number, wz: number): void => {
    addPieceAlong("mast", wx, sy, wz, MAST.x, (MAST.baseY + MAST.topY) / 2, 0, 0, 1, 0, MAST.topY - MAST.baseY);
    addRingAlong("mastCollar", wx, sy, wz, MAST.x, MAST.baseY + 0.012, 0, 0, 1, 0);
    addPieceAlong("winch", wx, sy, wz, MAST.x, MAST.winchY, 0, 0, 0, 1, 0.044);
    for (const flank of [-1, 1]) {
      addPieceAlong("winchFlange", wx, sy, wz, MAST.x, MAST.winchY, 0.026 * flank, 0, 0, 1, 0.01);
    }
    addPiece("gauge", wx, sy, wz, 0.02, 0.1, 0.055, 1, 1, 1, 0, PI_2, 0);
  };

  // Hoist_Cables: two thick cables from the winch drum's crown forward to a
  // brass lifting eye on each cradle arm tip — the rig actually reaching for the
  // component it is about to lift.
  const addHoistCables = (wx: number, sy: number, wz: number): void => {
    const startX = MAST.x;
    const startY = MAST.winchY + 0.029;
    const tipX = 0;
    for (const flank of [-1, 1]) {
      const tipZ = CRADLE.tipZ * flank;
      const dx = tipX - startX;
      const dy = CRADLE.tipY - startY;
      const dz = tipZ;
      const len = Math.hypot(dx, dy, dz);
      addPieceAlong("cable", wx, sy, wz, (tipX + startX) / 2, (CRADLE.tipY + startY) / 2, tipZ / 2, dx, dy, dz, len);
      addRingAlong("cableEye", wx, sy, wz, tipX, CRADLE.tipY, tipZ, dx, dy, dz);
    }
  };

  const addRearCoupling = (wx: number, sy: number, wz: number): void => {
    addPieceAlong("coupling", wx, sy, wz, -0.052, 0.088, 0, -1, 0, 0, 0.05);
    addRingAlong("couplingRing", wx, sy, wz, -0.05, 0.088, 0, 1, 0, 0);
    addPlateAlong("couplingTip", wx, sy, wz, -0.082, 0.088, 0, -1, 0, 0);
  };

  const addModule = (wx: number, sy: number, wz: number): void => {
    addSeat(wx, sy, wz);
    addDockPod(wx, sy, wz);
    addCradlePlinth(wx, sy, wz);
    addDockingCradle(wx, sy, wz);
    addLiftingMast(wx, sy, wz);
    addHoistCables(wx, sy, wz);
    addRearCoupling(wx, sy, wz);
  };

  // ─── Static asset ───────────────────────────────────────────────────
  // This module carries no idle animation (the winch does not turn and the
  // cables do not sway): it renders once and `update` is a no-op that keeps the
  // interactive harness uniform across module families.
  type SdyRecord = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
  };
  const records: SdyRecord[] = [];

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

  // No idle animation on this rig: the winch sits still with its cables slack-
  // straight to the cradle. Keeping the method on the overlay contract so the
  // interactive harness (per-module and AFC update loops) stays uniform across
  // all module families.
  const update = (_nowMs: number): void => {};

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMaterials) m.dispose();
  };

  return { clear, addInstance, commit, update, dispose };
};