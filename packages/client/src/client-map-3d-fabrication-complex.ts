// 3D Automated Fabrication Complex (AFC) overlay — a procedural
// futuristic-steampunk fabrication reactor that visually spans its 9
// surrounding map tiles while occupying only the one center tile.
//
// Procedural hierarchy (every child is logically parented to AFC_Root at the
// instance center):
//   AFC_Root
//   └── Central_Printer
//       ├── Fabrication_Chamber   — transparent tube + bright cyan aether core
//       └── Upper_Machinery       — stacked tiers shrinking toward a cone cap
//   ├── Manipulator_Arm ×4        — spider arms splaying out, angled downward
//   ├── Module_Socket ×8          — identical hollow docking rings, 45° apart
//   └── Socket_Cables ×8          — ground cables from the base to each ring
//
// Readable silhouette: tall central cylinder → glowing fabrication chamber →
// four diagonal mechanical arms → low circular ring of eight empty bays.
//
// Construction is heavy industrial: blackened iron/steel surfaces, aged brass
// bands and joints at transitions, a compact circular mechanical base with no
// surrounding platform. Brass highlights edges/joints instead of covering
// whole surfaces; cyan emissive is restrained to the core and the orbiting
// chamber emitters.
//
// Each Module_Socket exposes a common attachment point (see
// moduleSocketAttachments) at the center of its ring so a separate
// upgrade-module asset can be spawned there. Call commit() once after adding
// instances, then update(nowMs) each frame to breathe the aether core and
// orbit the chamber emitters.

import {
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  Scene,
  TorusGeometry,
  Texture,
  Vector3
} from "three";
import { applyBuildingEnvMap } from "./client-map-3d-building-envmap/client-map-3d-building-envmap.js";

export const AFC_SOCKET_COUNT = 8;
// Radius (in map tiles) of the socket ring measured from the instance center
// to each bay center. Bays reach just short of the 3x3 tile footprint.
export const AFC_SOCKET_RING_RADIUS = 1.28;
// Usable inner radius (map tiles) of a bay that an upgrade-module asset may
// occupy.
export const AFC_BAY_INNER_RADIUS = 0.14;
// Height above the tile surface where a docked module's base should sit
// (top of the bay pad).
export const AFC_MODULE_DOCK_HEIGHT = 0.04;

export type AfcModuleSocketAttachment = {
  readonly socketIndex: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  // Azimuth of the socket from the instance center — the outward radial
  // direction the spawned module should face (rotate the module by this yaw).
  readonly yaw: number;
  readonly bayInnerRadius: number;
};

export type FabricationComplexOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
  // Common attachment points (one per Module_Socket) for spawning a separate
  // upgrade-module asset. Scene-absolute; empty for an invalid instance index.
  readonly moduleSocketAttachments: (instanceIndex: number) => readonly AfcModuleSocketAttachment[];
};

export const createFabricationComplexOverlay = (scene: Scene, maxTiles: number, buildingEnvironmentTexture?: Texture): FabricationComplexOverlay => {
  const C = maxTiles;
  const PI_2 = Math.PI / 2;
  const DOTS = 2;
  // Core heartbeat — a slow several-second beat so the glow reads as
  // contained power rather than flickering light.
  const CORE_SPEED = 0.001;
  // Chamber-emitter orbit — about one revolution per 10 seconds.
  const DOT_SPEED = 0.0006;
  const DOT_R = [0.19, 0.21] as const;
  const DOT_YS = [0.36, 0.585] as const;

  // ─── Materials (shared by piece type) ───────────────────────────────
  const ironMaterial = new MeshStandardMaterial({ color: "#22242a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const steelMaterial = new MeshStandardMaterial({ color: "#17181d", roughness: 0.62, metalness: 0.5, flatShading: true });
  const brassMaterial = new MeshStandardMaterial({ color: "#8b6c3d", roughness: 0.42, metalness: 0.85, flatShading: true });
  const brassDarkMaterial = new MeshStandardMaterial({ color: "#6f5733", roughness: 0.5, metalness: 0.8, flatShading: true });
  const pipeMaterial = new MeshStandardMaterial({ color: "#1d1f25", roughness: 0.68, metalness: 0.35, flatShading: true });
  // The fabrication chamber tube: faintly cyan-tinted glass through which the
  // aether core glows. DoubleSide renders the far tube wall when viewed
  // through the near one; depthWrite off lets the core read through it.
  const chamberGlassMaterial = new MeshStandardMaterial({
    color: "#0c2329",
    roughness: 0.25,
    metalness: 0.1,
    transparent: true,
    opacity: 0.38,
    side: DoubleSide,
    depthWrite: false,
    emissive: "#1b7282",
    emissiveIntensity: 0.2
  });
  const coreMaterial = new MeshStandardMaterial({
    color: "#05222a",
    roughness: 0.3,
    metalness: 0.15,
    flatShading: true,
    emissive: "#41f6ff",
    emissiveIntensity: 2.3
  });
  const dotMaterial = new MeshStandardMaterial({
    color: "#041c24",
    roughness: 0.3,
    metalness: 0.1,
    flatShading: true,
    emissive: "#41f6ff",
    emissiveIntensity: 1.7
  });

  // ─── Geometries (shared) ────────────────────────────────────────────
  const baseDiscGeo = new CylinderGeometry(0.52, 0.56, 0.07, 14);
  const bodyLowGeo = new CylinderGeometry(0.36, 0.4, 0.13, 12);
  const chamberGlassGeo = new CylinderGeometry(0.3, 0.3, 0.46, 14, 1, true);
  const tierLowGeo = new CylinderGeometry(0.3, 0.34, 0.13, 12);
  const tierMidGeo = new CylinderGeometry(0.26, 0.3, 0.11, 12);
  const tierHighGeo = new CylinderGeometry(0.2, 0.24, 0.11, 12);
  const topCapGeo = new ConeGeometry(0.16, 0.14, 10);
  const coreGeo = new IcosahedronGeometry(0.13, 0);
  const dotGeo = new OctahedronGeometry(0.022, 0);
  const socketPadGeo = new CylinderGeometry(0.19, 0.21, 0.04, 12);
  const socketRingGeo = new CylinderGeometry(0.16, 0.16, 0.13, 12, 1, true);
  const socketCollarGeo = new TorusGeometry(0.16, 0.02, 6, 14);
  const cableGeo = new CylinderGeometry(0.045, 0.045, 1, 7);
  const shoulderGeo = new TorusGeometry(0.075, 0.026, 6, 12);
  const upperArmGeo = new CylinderGeometry(0.042, 0.05, 1, 8);
  const elbowGeo = new TorusGeometry(0.065, 0.022, 6, 12);
  const forearmGeo = new CylinderGeometry(0.034, 0.042, 1, 8);
  const clawGeo = new CylinderGeometry(0.028, 0.034, 1, 7);

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

  make("baseDisc", baseDiscGeo, ironMaterial, 1);
  make("bodyLow", bodyLowGeo, ironMaterial, 1);
  make("chamberGlass", chamberGlassGeo, chamberGlassMaterial, 1);
  make("tierLow", tierLowGeo, steelMaterial, 1);
  make("tierMid", tierMidGeo, steelMaterial, 1);
  make("tierHigh", tierHighGeo, steelMaterial, 1);
  make("topCap", topCapGeo, brassDarkMaterial, 1);
  make("core", coreGeo, coreMaterial, 1);
  make("dot", dotGeo, dotMaterial, DOTS);
  make("socketPad", socketPadGeo, ironMaterial, AFC_SOCKET_COUNT);
  make("socketRing", socketRingGeo, steelMaterial, AFC_SOCKET_COUNT);
  make("socketCollar", socketCollarGeo, brassMaterial, AFC_SOCKET_COUNT);
  make("cable", cableGeo, pipeMaterial, AFC_SOCKET_COUNT * 2);
  make("shoulder", shoulderGeo, brassMaterial, 4);
  make("upperArm", upperArmGeo, ironMaterial, 4);
  make("elbow", elbowGeo, brassDarkMaterial, 4);
  make("forearm", forearmGeo, ironMaterial, 4);
  make("claw", clawGeo, steelMaterial, 4);

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

  // Euler aligning the +Y axis (unit-height cylinder) with a direction so a
  // cylinder can be stretched along a ray.
  const eulerFromDir = (dx: number, dy: number, dz: number): { rx: number; ry: number; rz: number } => {
    tmpDir.set(dx, dy, dz).normalize();
    tmpQuat.setFromUnitVectors(yAxis, tmpDir);
    tmpEuler.setFromQuaternion(tmpQuat);
    return { rx: tmpEuler.x, ry: tmpEuler.y, rz: tmpEuler.z };
  };

  // Euler aligning the +Z axis (torus hole) with a direction for joint rings
  // whose circular face is seen from the side.
  const eulerFromDirZ = (dx: number, dy: number, dz: number): { rx: number; ry: number; rz: number } => {
    tmpDir.set(dx, dy, dz).normalize();
    tmpQuat.setFromUnitVectors(zAxis, tmpDir);
    tmpEuler.setFromQuaternion(tmpQuat);
    return { rx: tmpEuler.x, ry: tmpEuler.y, rz: tmpEuler.z };
  };

  const addPieceAlong = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, len: number): void => {
    const e = eulerFromDir(dx, dy, dz);
    addPiece(key, wx, sy, wz, ox, oy, oz, 1, len, 1, e.ry, e.rx, e.rz);
  };

  const addTorusAlong = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): void => {
    const e = eulerFromDirZ(dx, dy, dz);
    addPiece(key, wx, sy, wz, ox, oy, oz, 1, 1, 1, e.ry, e.rx, e.rz);
  };

  // ─── AFC placement ──────────────────────────────────────────────────
  // Central_Printer: the compact circular base, opaque lower body, the
  // transparent Fabrication_Chamber around the glowing aether core, and the
  // stacked Upper_Machinery tiers above it.
  const addCentralPrinter = (wx: number, sy: number, wz: number): void => {
    addPiece("baseDisc", wx, sy, wz, 0, 0.035, 0);
    addPiece("bodyLow", wx, sy, wz, 0, 0.165, 0);
    addPiece("chamberGlass", wx, sy, wz, 0, 0.46, 0);
    addPiece("tierLow", wx, sy, wz, 0, 0.755, 0);
    addPiece("tierMid", wx, sy, wz, 0, 0.87, 0);
    addPiece("tierHigh", wx, sy, wz, 0, 0.98, 0);
    addPiece("topCap", wx, sy, wz, 0, 1.11, 0);
    addPiece("core", wx, sy, wz, 0, 0.46, 0);
    // Chamber emitters orbit the core in update(); these placeholder matrices
    // reserve the slot indices so the per-instance counts line up.
    for (let j = 0; j < DOTS; j += 1) {
      addPiece("dot", wx, sy, wz, Math.cos(j * Math.PI) * DOT_R[j]!, DOT_YS[j]!, Math.sin(j * Math.PI) * DOT_R[j]!);
    }
  };

  // Module_Socket: an empty circular bay — a short, wide, hollow docking ring
  // with a brass collar on a low pad. The pad-top center
  // (AFC_MODULE_DOCK_HEIGHT) is the common attachment point for upgrade
  // modules.
  const addModuleSocket = (wx: number, sy: number, wz: number, ang: number): void => {
    const cx = Math.cos(ang) * AFC_SOCKET_RING_RADIUS;
    const cz = Math.sin(ang) * AFC_SOCKET_RING_RADIUS;
    addPiece("socketPad", wx, sy, wz, cx, 0.02, cz);
    addPiece("socketRing", wx, sy, wz, cx, 0.105, cz);
    addPiece("socketCollar", wx, sy, wz, cx, 0.175, cz, 1, 1, 1, 0, PI_2, 0);
  };

  // Socket_Cables: two thick cables running along the ground from under the
  // base disc out to each socket's pad.
  const addSocketCable = (wx: number, sy: number, wz: number, ang: number): void => {
    const px = -Math.sin(ang);
    const pz = Math.cos(ang);
    for (const side of [-1, 1]) {
      addPieceAlong(
        "cable",
        wx, sy, wz,
        Math.cos(ang) * 0.81 + px * 0.05 * side,
        0.055,
        Math.sin(ang) * 0.81 + pz * 0.05 * side,
        Math.cos(ang) * 0.68,
        0,
        Math.sin(ang) * 0.68,
        0.68
      );
    }
  };

  // Manipulator_Arm: a spider arm splaying out from the upper machinery,
  // angled downward toward the module area and ending in the gap between two
  // bays. Two chunky segments (upper arm, forearm) with obvious circular
  // brass knuckles (shoulder, elbow) and a heavy drooping claw.
  const addManipulatorArm = (wx: number, sy: number, wz: number, ang: number): void => {
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    const px = -dz;
    const pz = dx;
    const shoulderR = 0.33;
    const elbowR = 0.64;
    const wristR = 1.14;
    const shoulderY = 0.78;
    const elbowY = 0.56;
    const wristY = 0.4;
    addTorusAlong("shoulder", wx, sy, wz, dx * shoulderR, shoulderY, dz * shoulderR, px, 0, pz);
    addPieceAlong("upperArm", wx, sy, wz, dx * shoulderR, shoulderY, dz * shoulderR, dx * (elbowR - shoulderR), elbowY - shoulderY, dz * (elbowR - shoulderR), Math.hypot(elbowR - shoulderR, shoulderY - elbowY));
    addTorusAlong("elbow", wx, sy, wz, dx * elbowR, elbowY, dz * elbowR, px, 0, pz);
    addPieceAlong("forearm", wx, sy, wz, dx * elbowR, elbowY, dz * elbowR, dx * (wristR - elbowR), wristY - elbowY, dz * (wristR - elbowR), Math.hypot(wristR - elbowR, elbowY - wristY));
    addPieceAlong("claw", wx, sy, wz, dx * wristR, wristY, dz * wristR, dx * 0.14, 0.26 - wristY, dz * 0.14, Math.hypot(0.14, wristY - 0.26));
  };

  const addAfc = (wx: number, sy: number, wz: number): void => {
    addCentralPrinter(wx, sy, wz);
    for (let k = 0; k < AFC_SOCKET_COUNT; k += 1) {
      const ang = (k * Math.PI) / 4;
      addModuleSocket(wx, sy, wz, ang);
      addSocketCable(wx, sy, wz, ang);
    }
    for (let m = 0; m < 4; m += 1) {
      addManipulatorArm(wx, sy, wz, Math.PI / 8 + (m * Math.PI) / 2);
    }
  };

  // ─── Core/chamber animation ─────────────────────────────────────────
  // The core breathes and the chamber emitters orbit; matrices are composed
  // directly (resolved meshes, no Map lookup) on every frame.
  const coreMesh = slots.get("core")?.mesh;
  const dotMesh = slots.get("dot")?.mesh;
  const animatedMeshes: readonly InstancedMesh[] = [coreMesh, dotMesh].filter((mesh): mesh is InstancedMesh => mesh !== undefined);

  type AfcRecord = { readonly x: number; readonly y: number; readonly z: number; readonly phase: number };
  const records: AfcRecord[] = [];

  // ─── Public API ─────────────────────────────────────────────────────
  const clear = (): void => {
    for (const slot of slots.values()) slot.count = 0;
    records.length = 0;
  };

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number): number => {
    if (records.length >= C) return -1;
    const hash = ((worldTileX * 92_821) ^ (worldTileY * 68_917)) >>> 0;
    const phase = ((hash % 1000) / 1000) * Math.PI * 2;
    records.push({ x: sceneX, y: surfaceY, z: sceneZ, phase });
    addAfc(sceneX, surfaceY, sceneZ);
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
      const breathe = 1 + 0.14 * Math.sin(nowMs * CORE_SPEED + rec.phase);
      if (coreMesh) {
        position.set(rec.x, rec.y + 0.46, rec.z);
        scale.set(breathe, breathe, breathe);
        matrix.compose(position, identityQuat, scale);
        coreMesh.setMatrixAt(i, matrix);
      }
      if (dotMesh) {
        for (let j = 0; j < DOTS; j += 1) {
          const a = nowMs * DOT_SPEED + rec.phase + j * Math.PI;
          position.set(rec.x + Math.cos(a) * DOT_R[j]!, rec.y + DOT_YS[j]!, rec.z + Math.sin(a) * DOT_R[j]!);
          scale.set(1, 1, 1);
          matrix.compose(position, identityQuat, scale);
          dotMesh.setMatrixAt(i * DOTS + j, matrix);
        }
      }
    }
    for (const mesh of animatedMeshes) {
      if (mesh.count === 0) continue;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const moduleSocketAttachments = (instanceIndex: number): readonly AfcModuleSocketAttachment[] => {
    if (instanceIndex < 0 || instanceIndex >= records.length) return [];
    const rec = records[instanceIndex]!;
    const out: AfcModuleSocketAttachment[] = [];
    for (let k = 0; k < AFC_SOCKET_COUNT; k += 1) {
      const a = (k * Math.PI) / 4;
      out.push({
        socketIndex: k,
        x: rec.x + Math.cos(a) * AFC_SOCKET_RING_RADIUS,
        y: rec.y + AFC_MODULE_DOCK_HEIGHT,
        z: rec.z + Math.sin(a) * AFC_SOCKET_RING_RADIUS,
        yaw: a,
        bayInnerRadius: AFC_BAY_INNER_RADIUS
      });
    }
    return out;
  };

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMaterials) m.dispose();
  };

  return { clear, addInstance, commit, update, dispose, moduleSocketAttachments };
};