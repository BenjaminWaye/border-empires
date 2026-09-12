// 3D Siege Outpost overlay — COMPACT ARMORED SIEGE MACHINE. One low armored
// hull of blackened iron and aged brass on six short stabilizing legs,
// carrying one large forward-facing siege cannon and a small rotating aether
// targeting device with a violet glow. Dark iron, aged brass, subtle
// cyan/violet aether glow — the machine is the whole silhouette. Every slot
// is its own InstancedMesh; piece placement lives in
// client-map-3d-siege-outpost-parts.ts. Call commit() after addInstance(),
// then update(nowMs) every frame to sweep the targeting head.

import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3
} from "three";
import {
  ANIMATED_KEYS,
  composeAnimatedMatrix,
  writeSiegeOutpostAnimated,
  writeSiegeOutpostPieces
} from "./client-map-3d-siege-outpost-parts.js";
import type { AnimatedSet, SiegeOutpostAnimEntry, SiegeOutpostPieceCtx, WritePiece, WritePieceAlong } from "./client-map-3d-siege-outpost-parts.js";

export type SiegeOutpostOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createSiegeOutpostOverlay = (scene: Scene, maxTiles: number): SiegeOutpostOverlay => {
  const C = maxTiles;

  // ─── Materials (shared by piece type) ───────────────────────────────
  const ironMaterial = new MeshStandardMaterial({ color: "#2b2d33", roughness: 0.55, metalness: 0.6, flatShading: true });
  const blackIronMaterial = new MeshStandardMaterial({ color: "#191a20", roughness: 0.62, metalness: 0.5, flatShading: true });
  const brassMaterial = new MeshStandardMaterial({ color: "#8a6b3c", roughness: 0.42, metalness: 0.85, flatShading: true });
  const brassBrightMaterial = new MeshStandardMaterial({ color: "#a5864d", roughness: 0.3, metalness: 0.92, flatShading: true });
  const lensMaterial = new MeshStandardMaterial({ color: "#0a1520", roughness: 0.2, metalness: 0.3, emissive: "#39e6ff", emissiveIntensity: 2.4, flatShading: true });
  const violetMaterial = new MeshStandardMaterial({ color: "#3a2a4d", roughness: 0.35, metalness: 0.6, emissive: "#a05cff", emissiveIntensity: 1.6, flatShading: true });

  // ─── Geometries (shared) ────────────────────────────────────────────
  const boxGeo = new BoxGeometry(1, 1, 1);
  const strutGeo = new CylinderGeometry(0.035, 0.05, 1, 6);
  const barrelGeo = new CylinderGeometry(0.07, 0.075, 1, 8);
  const sphereGeo = new SphereGeometry(0.05, 8, 6);
  const headGeo = new BoxGeometry(0.1, 0.04, 0.055);

  // ─── InstancedMesh registry ────────────────────────────────────────
  type Slot = { mesh: InstancedMesh; count: number; cap: number };
  const slots = new Map<string, Slot>();
  const geos = new Set<BufferGeometry>();
  const mats = new Set<MeshStandardMaterial>();

  const make = (key: string, geo: BufferGeometry, mat: MeshStandardMaterial, cap: number): void => {
    const mesh = new InstancedMesh(geo, mat, cap);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    slots.set(key, { mesh, count: 0, cap });
    geos.add(geo);
    mats.add(mat);
  };

  // [key, geometry, material, instances-per-outpost]
  const pieceSpecs: ReadonlyArray<readonly [string, BufferGeometry, MeshStandardMaterial, number]> = [
    ["hull", boxGeo, blackIronMaterial, 1],
    ["hullPlate", boxGeo, brassMaterial, 1],
    ["glacis", boxGeo, blackIronMaterial, 1],
    ["legFL", strutGeo, ironMaterial, 1],
    ["legFR", strutGeo, ironMaterial, 1],
    ["legML", strutGeo, ironMaterial, 1],
    ["legMR", strutGeo, ironMaterial, 1],
    ["legRL", strutGeo, ironMaterial, 1],
    ["legRR", strutGeo, ironMaterial, 1],
    ["rivetA", sphereGeo, brassMaterial, 1],
    ["rivetB", sphereGeo, brassMaterial, 1],
    ["rivetC", sphereGeo, brassMaterial, 1],
    ["rivetD", sphereGeo, brassMaterial, 1],
    ["rivetE", sphereGeo, brassMaterial, 1],
    ["rivetF", sphereGeo, brassMaterial, 1],
    ["turretPintle", boxGeo, brassMaterial, 1],
    ["recoilHousing", boxGeo, blackIronMaterial, 1],
    ["barrel", barrelGeo, ironMaterial, 1],
    ["barrelBand", barrelGeo, brassBrightMaterial, 1],
    ["muzzleBrake", boxGeo, blackIronMaterial, 1],
    ["coreLens", sphereGeo, lensMaterial, 1],
    ["targetBase", boxGeo, brassMaterial, 1],
    ["targetPintle", boxGeo, blackIronMaterial, 1]
  ];
  for (const [key, geo, mat, per] of pieceSpecs) make(key, geo, mat, C * per);

  // Animated slots hold exactly one matrix per outpost, rewritten each frame.
  const animatedSpecs: ReadonlyArray<readonly [string, BufferGeometry, MeshStandardMaterial]> = [
    ["targetHead", headGeo, violetMaterial]
  ];
  for (const [key, geo, mat] of animatedSpecs) make(key, geo, mat, C);

  // ─── Matrix helpers ────────────────────────────────────────────────
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3(1, 1, 1);
  const identityQuat = new Quaternion();
  const tmpEuler = new Euler();
  const tmpQuat = new Quaternion();
  const yAxis = new Vector3(0, 1, 0);
  const dir = new Vector3();

  const add: WritePiece = (key, ox, oy, oz, sx = 1, sy = 1, sz = 1, rotY = 0, rotX = 0, rotZ = 0): void => {
    const slot = slots.get(key);
    if (!slot || slot.count >= slot.cap) return;
    position.set(ox, oy, oz);
    scale.set(sx, sy, sz);
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

  const along: WritePieceAlong = (key, ox, oy, oz, dx, dy, dz, len): void => {
    dir.set(dx, dy, dz).normalize();
    tmpQuat.setFromUnitVectors(yAxis, dir);
    tmpEuler.setFromQuaternion(tmpQuat);
    add(key, ox, oy, oz, 1, len, 1, tmpEuler.y, tmpEuler.x, tmpEuler.z);
  };

  const pieceCtx: SiegeOutpostPieceCtx = { add, along };

  const animatedSet: AnimatedSet = (key, index, ox, oy, oz, rotY, rotX, rotZ): void => {
    const slot = slots.get(key);
    if (!slot) return;
    composeAnimatedMatrix(matrix, ox, oy, oz, rotY, rotX, rotZ);
    slot.mesh.setMatrixAt(index, matrix);
  };

  // ─── Placement ─────────────────────────────────────────────────────
  const instances: SiegeOutpostAnimEntry[] = [];

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number): void => {
    if (instances.length >= C) return;
    writeSiegeOutpostPieces(pieceCtx, sceneX, surfaceY, sceneZ);
    const hash = ((worldTileX * 92_821) ^ (worldTileY * 68_917)) >>> 0;
    const phase = ((hash % 1000) / 1000) * Math.PI * 2;
    instances.push({ x: sceneX, y: surfaceY, z: sceneZ, phase });
  };

  const markRanges = (slot: Slot): void => {
    slot.mesh.instanceMatrix.clearUpdateRanges();
    slot.mesh.instanceMatrix.addUpdateRange(0, slot.count * 16);
    slot.mesh.instanceMatrix.needsUpdate = true;
  };

  const commit = (): void => {
    for (const key of ANIMATED_KEYS) {
      const slot = slots.get(key);
      if (!slot) continue;
      slot.count = instances.length;
      slot.mesh.count = instances.length;
    }
    for (const slot of slots.values()) {
      slot.mesh.count = slot.count;
      if (slot.count > 0) markRanges(slot);
    }
    // Seed the animated slots so a freshly built outpost never shows a
    // single frame of origin-stacked identity matrices before update() runs.
    const stamp = Date.now();
    for (let i = 0; i < instances.length; i += 1) {
      writeSiegeOutpostAnimated(animatedSet, stamp, instances[i]!, i);
    }
    for (const key of ANIMATED_KEYS) {
      const slot = slots.get(key);
      if (slot && slot.count > 0) markRanges(slot);
    }
  };

  const clear = (): void => {
    for (const slot of slots.values()) slot.count = 0;
    instances.length = 0;
  };

  const update = (nowMs: number): void => {
    const count = instances.length;
    if (count === 0) return;
    for (let i = 0; i < count; i += 1) {
      writeSiegeOutpostAnimated(animatedSet, nowMs, instances[i]!, i);
    }
    for (const key of ANIMATED_KEYS) {
      const slot = slots.get(key);
      if (!slot || slot.count === 0) continue;
      markRanges(slot);
    }
  };

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    for (const geo of geos) geo.dispose();
    for (const mat of mats) mat.dispose();
  };

  return { clear, addInstance, commit, update, dispose };
};