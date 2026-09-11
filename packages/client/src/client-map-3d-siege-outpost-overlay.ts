// 3D Siege Outpost overlay — FORWARD ATTACK BASE. Where the Relay Beacon is a
// tall, unarmed observation tower, this is a wide, low, heavily-engineered
// staging ground: a dark-iron command platform with brass trim, a short
// command mast topped by a glowing aether lens wrapped in two rotating brass
// rings, and around it ammo crates, a weapon rack, supply containers,
// workshops with steam vents, fuel tanks, a loading crane, a winch, fabbed
// cable runs and two forward deployment ramps. Low-and-wide silhouette, no
// walls. Every slot is its own InstancedMesh; piece placement lives in
// client-map-3d-siege-outpost-parts.ts. Call commit() after addInstance(),
// then update(nowMs) every frame to spin the rings, steam and semaphore and
// wave the flags.

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
  TorusGeometry,
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
  const ironMaterial = new MeshStandardMaterial({ color: "#2b2d33", roughness: 0.55, metalness: 0.55, flatShading: true });
  const steelMaterial = new MeshStandardMaterial({ color: "#191a20", roughness: 0.62, metalness: 0.5, flatShading: true });
  const brassMaterial = new MeshStandardMaterial({ color: "#8a6b3c", roughness: 0.42, metalness: 0.85, flatShading: true });
  const brassBrightMaterial = new MeshStandardMaterial({ color: "#a5864d", roughness: 0.3, metalness: 0.92, flatShading: true });
  const mechMaterial = new MeshStandardMaterial({ color: "#4a443c", roughness: 0.72, metalness: 0.3, flatShading: true });
  const woodMaterial = new MeshStandardMaterial({ color: "#6b4a2f", roughness: 0.9, metalness: 0, flatShading: true });
  const canvasMaterial = new MeshStandardMaterial({ color: "#5a5248", roughness: 0.85, metalness: 0, flatShading: true });
  const flagsMaterial = new MeshStandardMaterial({ color: "#8a1f1c", roughness: 0.7, metalness: 0, flatShading: true });
  const aetherMaterial = new MeshStandardMaterial({ color: "#124a43", roughness: 0.25, metalness: 0.4, flatShading: true, emissive: "#2fd8c4", emissiveIntensity: 1.6 });
  const aetherPipeMaterial = new MeshStandardMaterial({ color: "#3a1c55", roughness: 0.4, metalness: 0.5, flatShading: true, emissive: "#8f55d6", emissiveIntensity: 1.1 });
  const lampGlowMaterial = new MeshStandardMaterial({ color: "#4a2a10", roughness: 0.4, metalness: 0.15, flatShading: true, emissive: "#ff9d3d", emissiveIntensity: 1.4 });
  const steamMaterial = new MeshStandardMaterial({ color: "#cfd4d6", roughness: 0.6, metalness: 0, transparent: true, opacity: 0.35 });

  // ─── Geometries (shared) ────────────────────────────────────────────
  const boxGeo = new BoxGeometry(1, 1, 1);
  const mastGeo = new CylinderGeometry(0.028, 0.038, 1, 8);
  const pipeGeo = new CylinderGeometry(0.016, 0.016, 1, 6);
  const beamGeo = new CylinderGeometry(0.012, 0.012, 1, 6);
  const gunGeo = new CylinderGeometry(0.011, 0.011, 1, 6);
  const jibGeo = new CylinderGeometry(0.016, 0.012, 1, 6);
  const cableGeo = new CylinderGeometry(0.006, 0.006, 1, 5);
  const wireGeo = new CylinderGeometry(0.005, 0.005, 1, 5);
  const tankGeo = new CylinderGeometry(0.055, 0.055, 1, 10);
  const tankBandGeo = new TorusGeometry(0.06, 0.011, 6, 10);
  const ventRingGeo = new TorusGeometry(0.05, 0.008, 5, 8);
  const mastBandGeo = new TorusGeometry(0.05, 0.009, 6, 10);
  const aetherBandGeo = new TorusGeometry(0.034, 0.008, 5, 8);
  const aetherCollarGeo = new TorusGeometry(0.04, 0.009, 5, 8);
  const aetherCoreGeo = new SphereGeometry(0.04, 10, 8);
  const lensTipGeo = new SphereGeometry(0.026, 8, 6);
  const cranePostGeo = new CylinderGeometry(0.022, 0.028, 1, 8);
  const craneHookGeo = new SphereGeometry(0.016, 6, 4);
  const winchDrumGeo = new CylinderGeometry(0.055, 0.055, 0.07, 10);
  const lampStandGeo = new CylinderGeometry(0.013, 0.017, 1, 6);
  const lampHousingGeo = new CylinderGeometry(0.03, 0.025, 0.06, 8);
  const lampGlowGeo = new SphereGeometry(0.02, 8, 6);
  const flagPostGeo = new CylinderGeometry(0.011, 0.014, 1, 6);
  const semiPostGeo = new CylinderGeometry(0.013, 0.016, 1, 6);
  const ringGeo = new TorusGeometry(0.095, 0.011, 6, 16);
  const flagGeo = new BoxGeometry(0.05, 0.035, 0.012);
  const steamGeo = new SphereGeometry(0.02, 6, 5);
  const semaArmGeo = new BoxGeometry(0.012, 0.03, 0.075);

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
    ["plinth", boxGeo, ironMaterial, 1],
    ["plinthTrim", boxGeo, brassBrightMaterial, 1],
    ["apron", boxGeo, ironMaterial, 1],
    ["deckL", boxGeo, steelMaterial, 1],
    ["deckR", boxGeo, steelMaterial, 1],
    ["platform", boxGeo, ironMaterial, 1],
    ["platformRim", boxGeo, brassMaterial, 1],
    ["mast", mastGeo, ironMaterial, 1],
    ["mastBand", mastBandGeo, brassBrightMaterial, 1],
    ["aetherCore", aetherCoreGeo, aetherMaterial, 1],
    ["aetherCollar", aetherCollarGeo, brassMaterial, 1],
    ["lensTip", lensTipGeo, aetherMaterial, 1],
    ["aetherPipe", pipeGeo, aetherPipeMaterial, 2],
    ["aetherBand", aetherBandGeo, brassMaterial, 1],
    ["shopL", boxGeo, mechMaterial, 1],
    ["roofL", boxGeo, steelMaterial, 1],
    ["ventRingL", ventRingGeo, brassMaterial, 1],
    ["shopR", boxGeo, mechMaterial, 1],
    ["roofR", boxGeo, steelMaterial, 1],
    ["ventRingR", ventRingGeo, brassMaterial, 1],
    ["tank", tankGeo, steelMaterial, 2],
    ["tankBand", tankBandGeo, brassMaterial, 4],
    ["tankPipe", pipeGeo, brassMaterial, 1],
    ["pipeUp", pipeGeo, brassMaterial, 1],
    ["containerA", boxGeo, canvasMaterial, 1],
    ["containerBandA", boxGeo, brassMaterial, 2],
    ["containerB", boxGeo, canvasMaterial, 1],
    ["crate", boxGeo, woodMaterial, 3],
    ["rackPost", boxGeo, woodMaterial, 2],
    ["rackBeam", beamGeo, woodMaterial, 2],
    ["rackGun", gunGeo, steelMaterial, 1],
    ["cranePost", cranePostGeo, steelMaterial, 1],
    ["craneJib", jibGeo, woodMaterial, 1],
    ["craneCable", cableGeo, steelMaterial, 1],
    ["craneHook", craneHookGeo, brassMaterial, 1],
    ["winchBase", boxGeo, mechMaterial, 1],
    ["winchDrum", winchDrumGeo, steelMaterial, 1],
    ["winchCable", cableGeo, steelMaterial, 1],
    ["wire", wireGeo, brassMaterial, 2],
    ["rampL", boxGeo, steelMaterial, 1],
    ["rampR", boxGeo, steelMaterial, 1],
    ["rampRailL", boxGeo, brassMaterial, 1],
    ["rampRailR", boxGeo, brassMaterial, 1],
    ["rampSide", boxGeo, steelMaterial, 1],
    ["lampStand", lampStandGeo, brassMaterial, 4],
    ["lampHousing", lampHousingGeo, brassMaterial, 4],
    ["lampGlow", lampGlowGeo, lampGlowMaterial, 4],
    ["flagPost", flagPostGeo, steelMaterial, 2],
    ["semiPost", semiPostGeo, steelMaterial, 1],
    ["semiArmA", boxGeo, woodMaterial, 1]
  ];
  for (const [key, geo, mat, per] of pieceSpecs) make(key, geo, mat, C * per);

  // Animated slots hold exactly one matrix per outpost, rewritten each frame.
  const animatedSpecs: ReadonlyArray<readonly [string, BufferGeometry, MeshStandardMaterial]> = [
    ["ringLow", ringGeo, brassMaterial],
    ["ringHigh", ringGeo, brassBrightMaterial],
    ["flagL", flagGeo, flagsMaterial],
    ["flagR", flagGeo, flagsMaterial],
    ["steamL", steamGeo, steamMaterial],
    ["steamR", steamGeo, steamMaterial],
    ["semaArm", semaArmGeo, woodMaterial]
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