// Rigging Works (RGW) module — a compact AFC module that fabricates drilling,
// extraction and siege-support machinery: the same machinery later installed
// on Umbrite Rigs, Siege Outposts and Umbrite Weapons Factories.
//
// Local space: +X is FORWARD — the outward radial direction of the socket (its
// `yaw`). The root sits at the socket attachment point (the pad-top center, `y`
// returned by moduleSocketAttachments). Dock it with
// addInstance(att.x, att.z, att.y, att.yaw, ...) so the drill points away from
// the AFC core.
//
// Procedural hierarchy (every child is logically parented to RGW_Root at the
// bay center, yaw-aligned to face outward):
//   RGW_Root
//   ├── Seat                  — dockable circular base + brass locking lip
//   ├── Forge_Pod             — rounded black-iron pod with two brass bands
//   ├── Gearbox_Housing       — dense horizontal gearbox bedded into the pod
//   │     top, wrapped in brass drive rings, two heavy pistons braced down
//   │     onto the drill barrel
//   ├── Drill_Head            — the defining feature: a short fat auger barrel
//   │     with a conical cutting bit, steel collar and brass/cyan drive rings,
//   │     driven by a slow reciprocating honing stroke
//   ├── Cable_Drum            — one winding drum on the flank (rigging and
//   │     winch hardware is made here too), brass flanges + wound cable +
//   │     axle
//   ├── Service_Pipe          — one short pressure pipe with a brass valve
//   └── Power_Connector       — one cyan AFC power intake facing the socket
//
// Construction is heavy industrial: blackened iron/steel, aged brass at joints,
// a squat rounded pod, one oversized drill head, one chunky gearbox and one
// cable drum — a specialized fabrication cartridge, not a complete mining rig.
// The docked footprint (RIGGING_WORKS_BASE_RADIUS) fits inside
// AFC_BAY_INNER_RADIUS. Cyan is restrained to the AFC power connector and one
// slim drive ring on the drill collar.
//
// No two pieces share a coplanar surface: bands and rings protrude past the
// piece they wrap, stacked cylinders step down in radius and nested spool
// bands sit on slight axial offsets — otherwise the seams Z-fight into black
// line artifacts.

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
export const RIGGING_WORKS_SCALE = 1.33;
// Footprint radius of the dockable seat — below the AFC bay inner radius
// (0.14) so the module slots into the socket ring with clearance.
export const RIGGING_WORKS_BASE_RADIUS = 0.105 * RIGGING_WORKS_SCALE;
// Total height above the pad top (top of the gearbox housing), 0.246 × 1.33.
export const RIGGING_WORKS_MODULE_HEIGHT = 0.246 * RIGGING_WORKS_SCALE;

export type RiggingWorksModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createRiggingWorksModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): RiggingWorksModuleOverlay => {
  const C = maxInstances;
  const PI_2 = Math.PI / 2;
  // Drill honing stroke — the auger visibly reciprocates forward/back.
  const DRILL_SPEED = 0.0022;
  const DRILL_STROKE = 0.012;

  // ─── Materials (shared by piece type) ───────────────────────────────
  const ironMaterial = new MeshStandardMaterial({ color: "#22242a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const steelMaterial = new MeshStandardMaterial({ color: "#17181d", roughness: 0.62, metalness: 0.5, flatShading: true });
  const brassMaterial = new MeshStandardMaterial({ color: "#8b6c3d", roughness: 0.42, metalness: 0.85, flatShading: true });
  const brassDarkMaterial = new MeshStandardMaterial({ color: "#6f5733", roughness: 0.5, metalness: 0.8, flatShading: true });
  const pipeMaterial = new MeshStandardMaterial({ color: "#1d1f25", roughness: 0.68, metalness: 0.35, flatShading: true });
  // Restrained AFC power element: cyan connector nipple + drive ring.
  const cyanMaterial = new MeshStandardMaterial({
    color: "#05222a",
    roughness: 0.3,
    metalness: 0.1,
    flatShading: true,
    emissive: "#41f6ff",
    emissiveIntensity: 1.6
  });

  // ─── Geometries (shared) ────────────────────────────────────────────
  // Small curved parts use high segment counts so flat-shaded facets never
  // read as black crease lines (see the Siege Lens Foundry module notes).
  const baseGeo = new CylinderGeometry(0.1, 0.105, 0.032, 16);
  const baseRingGeo = new TorusGeometry(0.12, 0.012, 12, 28);
  const podGeo = new CapsuleGeometry(0.075, 0.05, 6, 16);
  const bandGeo = new TorusGeometry(0.079, 0.011, 10, 26);
  const gearboxGeo = new CapsuleGeometry(0.042, 0.07, 6, 14);
  const driveRingGeo = new TorusGeometry(0.044, 0.009, 10, 22);
  const pistonGeo = new CylinderGeometry(0.016, 0.018, 1, 10);
  const barrelGeo = new CylinderGeometry(0.042, 0.045, 0.085, 14);
  const bitGeo = new CylinderGeometry(0.014, 0.045, 0.034, 12);
  const collarGeo = new TorusGeometry(0.05, 0.013, 10, 22);
  const ringGeo = new TorusGeometry(0.047, 0.011, 10, 20);
  const cyanRingGeo = new TorusGeometry(0.044, 0.005, 8, 18);
  const flangeGeo = new TorusGeometry(0.042, 0.012, 8, 20);
  const wrapGeo = new TorusGeometry(0.03, 0.009, 8, 18);
  const axleGeo = new CylinderGeometry(0.008, 0.008, 0.11, 8);
  const connectorGeo = new CylinderGeometry(0.018, 0.019, 1, 10);
  const connectorTipGeo = new CylinderGeometry(0.012, 0.012, 0.016, 14);
  const pipeGeo = new CylinderGeometry(0.012, 0.012, 0.048, 10);
  const valveGeo = new TorusGeometry(0.017, 0.005, 8, 14);

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
  make("gearbox", gearboxGeo, steelMaterial, 1);
  make("driveRing", driveRingGeo, brassMaterial, 2);
  make("piston", pistonGeo, brassDarkMaterial, 2);
  make("barrel", barrelGeo, steelMaterial, 1);
  make("bit", bitGeo, brassDarkMaterial, 1);
  make("collar", collarGeo, steelMaterial, 1);
  make("ring", ringGeo, brassMaterial, 1);
  make("cyanRing", cyanRingGeo, cyanMaterial, 1);
  make("flange", flangeGeo, brassMaterial, 1);
  make("wrap", wrapGeo, steelMaterial, 1);
  make("axle", axleGeo, ironMaterial, 1);
  make("connector", connectorGeo, brassMaterial, 1);
  make("connectorTip", connectorTipGeo, cyanMaterial, 1);
  make("pipe", pipeGeo, steelMaterial, 1);
  make("valve", valveGeo, brassMaterial, 1);

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
    // Piece offsets and instance scale grow with RIGGING_WORKS_SCALE about the
    // dock origin; the scene-anchor position (wx, sy, wz) never scales so
    // docked instances stay on their socket.
    position.set(wx + ox * RIGGING_WORKS_SCALE, sy + oy * RIGGING_WORKS_SCALE, wz + oz * RIGGING_WORKS_SCALE);
    scale.set(sx * RIGGING_WORKS_SCALE, sy2 * RIGGING_WORKS_SCALE, sz * RIGGING_WORKS_SCALE);
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

  const addForgePod = (wx: number, sy: number, wz: number): void => {
    addPiece("pod", wx, sy, wz, 0, 0.115, 0);
    addPiece("band", wx, sy, wz, 0, 0.085, 0, 1, 1, 1, 0, PI_2, 0);
    addPiece("band", wx, sy, wz, 0, 0.155, 0, 1, 1, 1, 0, PI_2, 0);
  };

  // Gearbox housing: a dense horizontal housing bedded into the pod top, two
  // brass drive rings around it and two heavy pistons braced down onto the
  // drill barrel.
  const addGearbox = (wx: number, sy: number, wz: number): void => {
    addPiece("gearbox", wx, sy, wz, 0.005, 0.204, 0);
    addRingAlong("driveRing", wx, sy, wz, -0.028, 0.204, 0, 1, 0, 0);
    addRingAlong("driveRing", wx, sy, wz, 0.03, 0.204, 0, 1, 0, 0);
    for (const side of [-1, 1]) {
      const dx = 0.082 - 0.015;
      const dy = 0.203 - 0.243;
      const dz = -0.022 * side;
      const len = Math.hypot(dx, dy, dz);
      addPieceAlong("piston", wx, sy, wz, (0.015 + 0.082) / 2, (0.243 + 0.203) / 2, 0.028 * side, dx, dy, dz, len);
    }
  };

  // Drill_Head: the defining feature — a short fat auger barrel with a conical
  // cutting bit, steel collar and brass/cyan drive rings. The reciprocating
  // stroke is applied in update().
  const addDrillHead = (wx: number, sy: number, wz: number): void => {
    const rotY = 0;
    const rotX = 0;
    const rotZ = -PI_2;
    addPiece("barrel", wx, sy, wz, 0.105, 0.17, 0, 1, 1, 1, rotY, rotX, rotZ);
    addPiece("bit", wx, sy, wz, 0.155, 0.17, 0, 1, 1, 1, rotY, rotX, rotZ);
    addRingAlong("collar", wx, sy, wz, 0.066, 0.17, 0, 1, 0, 0);
    addRingAlong("ring", wx, sy, wz, 0.128, 0.17, 0, 1, 0, 0);
    addRingAlong("cyanRing", wx, sy, wz, 0.113, 0.17, 0, 1, 0, 0);
  };

  // Cable_Drum: one winding drum on the right-hand flank — rigging, winch and
  // extraction hardware is fabricated alongside the drilling machinery.
  const addCableDrum = (wx: number, sy: number, wz: number): void => {
    addRingAlong("flange", wx, sy, wz, 0, 0.128, -0.128, 1, 0, 0);
    addRingAlong("wrap", wx, sy, wz, 0.004, 0.128, -0.128, 1, 0, 0);
    const rotY = 0;
    const rotX = 0;
    const rotZ = -PI_2;
    addPiece("axle", wx, sy, wz, 0, 0.128, -0.128, 1, 1, 1, rotY, rotX, rotZ);
  };

  const addServicePipe = (wx: number, sy: number, wz: number): void => {
    addPiece("pipe", wx, sy, wz, -0.015, 0.185, 0.05);
    addPiece("valve", wx, sy, wz, -0.015, 0.207, 0.05, 1, 1, 1, 0, PI_2, 0);
  };

  const addPowerConnector = (wx: number, sy: number, wz: number): void => {
    addPieceAlong("connector", wx, sy, wz, -0.058, 0.1, 0, -1, 0, 0, 0.034);
    addPlateAlong("connectorTip", wx, sy, wz, -0.08, 0.1, 0, -1, 0, 0);
  };

  const addModule = (wx: number, sy: number, wz: number): void => {
    addSeat(wx, sy, wz);
    addForgePod(wx, sy, wz);
    addGearbox(wx, sy, wz);
    addDrillHead(wx, sy, wz);
    addCableDrum(wx, sy, wz);
    addServicePipe(wx, sy, wz);
    addPowerConnector(wx, sy, wz);
  };

  // ─── Drill honing animation ─────────────────────────────────────────
  // The auger group (barrel, bit, collar, rings) reciprocates along local +X.
  // Each piece's base orientation is captured once so the stroke only nudges
  // the forward position.
  const drillQuat = new Quaternion().setFromEuler(new Euler(0, 0, -PI_2, "XYZ"));
  const ringE = eulerFromDirZ(1, 0, 0);
  const ringQuat = new Quaternion().setFromEuler(new Euler(ringE.rx, ringE.ry, ringE.rz, "XYZ"));
  const drillGroup: Array<{ key: string; ox: number; oy: number; oz: number; quat: Quaternion }> = [
    { key: "barrel", ox: 0.105, oy: 0.17, oz: 0, quat: drillQuat },
    { key: "bit", ox: 0.155, oy: 0.17, oz: 0, quat: drillQuat },
    { key: "collar", ox: 0.066, oy: 0.17, oz: 0, quat: ringQuat },
    { key: "ring", ox: 0.128, oy: 0.17, oz: 0, quat: ringQuat },
    { key: "cyanRing", ox: 0.113, oy: 0.17, oz: 0, quat: ringQuat }
  ];

  type RgwRecord = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
    readonly phase: number;
  };
  const records: RgwRecord[] = [];

  // ─── Public API ─────────────────────────────────────────────────────
  const clear = (): void => {
    for (const slot of slots.values()) slot.count = 0;
    records.length = 0;
  };

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number): number => {
    if (records.length >= C) return -1;
    const hash = ((worldTileX * 92_821) ^ (worldTileY * 68_917)) >>> 0;
    const phase = ((hash % 1000) / 1000) * Math.PI * 2;
    yawQuat.setFromEuler(tmpEuler.set(0, -yaw, 0, "XYZ"));
    yawMatrix.makeRotationFromQuaternion(yawQuat);
    records.push({ x: sceneX, y: surfaceY, z: sceneZ, yaw, phase });
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

  const update = (nowMs: number): void => {
    const count = records.length;
    if (count === 0) return;
    for (let i = 0; i < count; i += 1) {
      const rec = records[i]!;
      yawQuat.setFromEuler(tmpEuler.set(0, -rec.yaw, 0, "XYZ"));
      yawMatrix.makeRotationFromQuaternion(yawQuat);
      const stroke = DRILL_STROKE * Math.sin(nowMs * DRILL_SPEED + rec.phase);
      for (const piece of drillGroup) {
        const slot = slots.get(piece.key);
        if (!slot || slot.count <= i) continue;
        position.set(rec.x + (piece.ox + stroke) * RIGGING_WORKS_SCALE, rec.y + piece.oy * RIGGING_WORKS_SCALE, rec.z + piece.oz * RIGGING_WORKS_SCALE);
        scale.set(RIGGING_WORKS_SCALE, RIGGING_WORKS_SCALE, RIGGING_WORKS_SCALE);
        pieceMatrix.compose(position, piece.quat, scale);
        matrix.multiplyMatrices(yawMatrix, pieceMatrix);
        slot.mesh.setMatrixAt(i, matrix);
      }
    }
    yawMatrix.identity();
    for (const piece of drillGroup) {
      const mesh = slots.get(piece.key)?.mesh;
      if (!mesh) continue;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMaterials) m.dispose();
  };

  return { clear, addInstance, commit, update, dispose };
};