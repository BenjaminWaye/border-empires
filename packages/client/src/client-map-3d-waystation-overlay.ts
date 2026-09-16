// 3D Waystation overlay — a small frontier trading-post rig: a riveted
// anchor plate and brass-banded plinth carry a tapered mast up to a caged
// lens housing (dim while dormant, full emissive cyan once activated). A
// slanted dark-iron shelter with a door seam and stovepipe vent sits beside
// the mast, with strapped supply crates, a rope-topped barrel and a guy-wire
// ground stake filling out the footprint. A small brass weathercock atop the
// shelter roof turns slowly — the only animated part, driven from
// update(nowMs) (mirroring the relay beacon's rotating heliograph array
// technique). Call commit() after adding instances, then update(nowMs) every
// frame to spin the vane and pulse the lens.

import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  Texture,
  TorusGeometry,
  Vector3
} from "three";
import { applyBuildingEnvMap } from "./client-map-3d-building-envmap/client-map-3d-building-envmap.js";

export type WaystationOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (
    centerX: number,
    centerZ: number,
    surfaceY: number,
    worldX: number,
    worldZ: number,
    waystation: { activated: boolean }
  ) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

const PI_2 = Math.PI / 2;
const VANE_SPEED = 0.00035;
const VANE_Y = 0.52;
const CRATE_COUNT = 3;
const STRAPS_PER_CRATE = 2;

// Per-instance crate/prop placement is hash-derived (like the relay beacon's
// mirror-array phase), so it lives here as a small table of angular slots
// rather than fixed offsets — each entry describes where around the mast
// footprint a prop sits, in units of "phase turns" applied at instance time.
type PropSlot = { readonly angleTurns: number; readonly radius: number };
const cratePropSlots: readonly PropSlot[] = [
  { angleTurns: 0.12, radius: 0.34 },
  { angleTurns: 0.46, radius: 0.3 },
  { angleTurns: 0.78, radius: 0.33 }
];
const barrelPropSlot: PropSlot = { angleTurns: 0.62, radius: 0.24 };
const stakePropSlot: PropSlot = { angleTurns: 0.9, radius: 0.4 };

type WaystationInstance = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly phase: number;
  activated: boolean;
};

export const createWaystationOverlay = (
  scene: Scene,
  maxTiles: number,
  buildingEnvironmentTexture?: Texture
): WaystationOverlay => {
  const C = maxTiles;
  const group = new Group();
  group.name = "waystation-overlay";
  scene.add(group);

  // ─── Materials ───────────────────────────────────────────────────────
  const ironMaterial = new MeshStandardMaterial({ color: "#2c2e34", roughness: 0.55, metalness: 0.55, flatShading: true });
  const brassMaterial = new MeshStandardMaterial({ color: "#8a6b3c", roughness: 0.42, metalness: 0.85, flatShading: true });
  const brassBrightMaterial = new MeshStandardMaterial({ color: "#a5864d", roughness: 0.3, metalness: 0.92, flatShading: true });
  const mechMaterial = new MeshStandardMaterial({ color: "#4a443c", roughness: 0.72, metalness: 0.3, flatShading: true });
  const glassMaterial = new MeshStandardMaterial({ color: "#22303a", roughness: 0.12, metalness: 0.55, flatShading: true });
  const lensMaterial = new MeshStandardMaterial({
    color: "#123a40",
    roughness: 0.2,
    metalness: 0.2,
    flatShading: true,
    emissive: "#39c4dd",
    emissiveIntensity: 0.3
  });
  const fabricMaterial = new MeshStandardMaterial({ color: "#6b5a3f", roughness: 0.85, metalness: 0.05, flatShading: true });
  for (const mat of [ironMaterial, brassMaterial, brassBrightMaterial, mechMaterial, glassMaterial, lensMaterial, fabricMaterial]) {
    applyBuildingEnvMap(mat, buildingEnvironmentTexture);
  }

  // ─── Geometries ─────────────────────────────────────────────────────
  const anchorBaseGeo = new BoxGeometry(0.32, 0.04, 0.32);
  const anchorRivetGeo = new CylinderGeometry(0.018, 0.018, 0.05, 6);
  const plinthGeo = new CylinderGeometry(0.09, 0.11, 0.14, 10);
  const plinthBandGeo = new TorusGeometry(0.095, 0.012, 6, 10);
  const mastGeo = new CylinderGeometry(0.035, 0.06, 0.85, 8);
  const mastBandGeo = new TorusGeometry(0.05, 0.009, 6, 10);
  const lensCageRingGeo = new TorusGeometry(0.078, 0.011, 6, 12);
  const lensCageStrutGeo = new CylinderGeometry(0.008, 0.008, 1, 5);
  const lensGeo = new IcosahedronGeometry(0.062, 0);
  const lensGearGeo = new CylinderGeometry(0.05, 0.05, 0.02, 10);
  const roofGeo = new BoxGeometry(0.36, 0.03, 0.3);
  const shelterBodyGeo = new BoxGeometry(0.28, 0.22, 0.24);
  const doorSeamGeo = new BoxGeometry(0.09, 0.16, 0.012);
  const windowSeamGeo = new BoxGeometry(0.07, 0.05, 0.012);
  const ventGeo = new CylinderGeometry(0.018, 0.018, 0.15, 6);
  const crateBodyGeo = new BoxGeometry(0.14, 0.14, 0.14);
  const crateStrapGeo = new BoxGeometry(0.152, 0.02, 0.02);
  const barrelGeo = new CylinderGeometry(0.07, 0.07, 0.16, 10);
  const ropeCoilGeo = new TorusGeometry(0.055, 0.014, 6, 12);
  const groundStakeGeo = new CylinderGeometry(0.012, 0.012, 0.24, 6);
  const vaneSpindleGeo = new CylinderGeometry(0.01, 0.01, 0.07, 6);
  const vaneArmGeo = new BoxGeometry(0.19, 0.012, 0.045);

  // ─── InstancedMesh registry ─────────────────────────────────────────
  type Slot = { mesh: InstancedMesh; count: number; cap: number };
  const slots = new Map<string, Slot>();

  const make = (key: string, geo: BufferGeometry, mat: MeshStandardMaterial, cap: number): Slot => {
    const mesh = new InstancedMesh(geo, mat, cap);
    mesh.frustumCulled = false;
    mesh.count = 0;
    group.add(mesh);
    const slot: Slot = { mesh, count: 0, cap };
    slots.set(key, slot);
    return slot;
  };

  make("anchorBase", anchorBaseGeo, ironMaterial, C);
  make("anchorRivet", anchorRivetGeo, mechMaterial, C * 4);
  make("plinth", plinthGeo, ironMaterial, C);
  make("plinthBand", plinthBandGeo, brassMaterial, C);
  make("mast", mastGeo, brassMaterial, C);
  make("mastBand", mastBandGeo, brassMaterial, C * 2);
  make("lensCageRing", lensCageRingGeo, brassBrightMaterial, C * 2);
  make("lensCageStrut", lensCageStrutGeo, brassBrightMaterial, C * 4);
  make("lens", lensGeo, lensMaterial, C);
  make("lensGear", lensGearGeo, mechMaterial, C);
  make("roof", roofGeo, ironMaterial, C);
  make("shelterBody", shelterBodyGeo, ironMaterial, C);
  make("doorSeam", doorSeamGeo, mechMaterial, C);
  make("windowSeam", windowSeamGeo, glassMaterial, C);
  make("vent", ventGeo, mechMaterial, C);
  make("crateBody", crateBodyGeo, brassMaterial, C * CRATE_COUNT);
  make("crateStrap", crateStrapGeo, fabricMaterial, C * CRATE_COUNT * STRAPS_PER_CRATE);
  make("barrel", barrelGeo, ironMaterial, C);
  make("ropeCoil", ropeCoilGeo, fabricMaterial, C * 2);
  make("groundStake", groundStakeGeo, brassMaterial, C);
  make("vaneSpindle", vaneSpindleGeo, mechMaterial, C);
  make("vaneArm", vaneArmGeo, brassBrightMaterial, C);

  // ─── Helpers (same pattern as relay beacon overlay) ─────────────────
  const matrix = new Matrix4();
  const position = new Vector3();
  const scaleVec = new Vector3();
  const identityQuat = new Quaternion();
  const tmpEuler = new Euler();
  const tmpQuat = new Quaternion();
  const tmpDir = new Vector3();
  const yAxis = new Vector3(0, 1, 0);

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
    scaleVec.set(sx, sy2, sz);
    if (rotX === 0 && rotY === 0 && rotZ === 0) {
      matrix.compose(position, identityQuat, scaleVec);
    } else {
      tmpEuler.set(rotX, rotY, rotZ, "XYZ");
      tmpQuat.setFromEuler(tmpEuler);
      matrix.compose(position, tmpQuat, scaleVec);
    }
    slot.mesh.setMatrixAt(slot.count, matrix);
    slot.count += 1;
  };

  const eulerFromDir = (dx: number, dy: number, dz: number): { rx: number; ry: number; rz: number } => {
    tmpDir.set(dx, dy, dz).normalize();
    tmpQuat.setFromUnitVectors(yAxis, tmpDir);
    tmpEuler.setFromQuaternion(tmpQuat);
    return { rx: tmpEuler.x, ry: tmpEuler.y, rz: tmpEuler.z };
  };

  const addPieceAlong = (
    key: string,
    wx: number,
    sy: number,
    wz: number,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    len: number
  ): void => {
    const e = eulerFromDir(dx, dy, dz);
    addPiece(key, wx, sy, wz, ox, oy, oz, 1, 1, len, e.ry, e.rx, e.rz);
  };

  // ─── Waystation placement ───────────────────────────────────────────
  const addWaystation = (wx: number, sy: number, wz: number, phase: number): void => {
    // Riveted square anchor plate with four corner rivets.
    addPiece("anchorBase", wx, sy, wz, 0, 0.02, 0);
    for (const ax of [-0.12, 0.12]) {
      for (const az of [-0.12, 0.12]) {
        addPiece("anchorRivet", wx, sy, wz, ax, 0.045, az);
      }
    }

    // Plinth/collar at the mast's foot with a brass band.
    addPiece("plinth", wx, sy, wz, 0, 0.11, 0);
    addPiece("plinthBand", wx, sy, wz, 0, 0.16, 0, 1, 1, 1, 0, PI_2, 0);

    // Tapered brass mast with two ring bands.
    addPiece("mast", wx, sy, wz, 0, 0.605, 0);
    addPiece("mastBand", wx, sy, wz, 0, 0.35, 0, 1, 1, 1, 0, PI_2, 0);
    addPiece("mastBand", wx, sy, wz, 0, 0.75, 0, 1, 1, 1, 0, PI_2, 0);

    // Caged lens housing: two brass rings joined by four vertical struts,
    // wrapping the glowing lens with a small gear/dial at the housing base.
    addPiece("lensCageRing", wx, sy, wz, 0, 0.93, 0, 1, 1, 1, 0, PI_2, 0);
    addPiece("lensCageRing", wx, sy, wz, 0, 1.02, 0, 1, 1, 1, 0, PI_2, 0);
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2;
      addPiece("lensCageStrut", wx, sy, wz, Math.cos(a) * 0.078, 0.975, Math.sin(a) * 0.078, 1, 1, 0.09);
    }
    addPiece("lens", wx, sy, wz, 0, 0.975, 0);
    addPiece("lensGear", wx, sy, wz, 0, 0.885, 0);

    // Slanted dark-iron shelter with a door/window seam and roof vent,
    // offset from the mast so both read clearly.
    const shx = -0.42;
    const shz = -0.12;
    addPiece("shelterBody", wx, sy, wz, shx, 0.13, shz);
    addPiece("doorSeam", wx, sy, wz, shx, 0.1, shz + 0.126);
    addPiece("windowSeam", wx, sy, wz, shx - 0.09, 0.16, shz + 0.126);
    addPiece("roof", wx, sy, wz, shx, 0.255, shz, 1, 1, 1, 0, 0, 0.16);
    addPiece("vent", wx, sy, wz, shx + 0.1, 0.36, shz - 0.05, 1, 1, 1, 0, 0.2, 0.1);

    // Weathercock atop the roof (the only animated piece — see update()).
    // A static placeholder bumps the slot count so commit() allocates it;
    // update() overwrites its matrix every frame, same as the relay
    // beacon's mirror-array pieces.
    addPiece("vaneSpindle", wx, sy, wz, shx, 0.315, shz, 1, 1, 1, 0, 0, 0.16);
    addPiece("vaneArm", wx, sy, wz, shx, VANE_Y, shz);

    // Strapped supply crates around the mast footprint, hash-derived offsets.
    for (const slot of cratePropSlots) {
      const a = phase + slot.angleTurns * Math.PI * 2;
      const cx = Math.cos(a) * slot.radius;
      const cz = Math.sin(a) * slot.radius;
      addPiece("crateBody", wx, sy, wz, cx, 0.07, cz, 1, 1, 1, a);
      addPiece("crateStrap", wx, sy, wz, cx, 0.11, cz, 1, 1, 1, a);
      addPiece("crateStrap", wx, sy, wz, cx, 0.05, cz, 1, 1, 1, a + PI_2);
    }

    // Rope-topped supply barrel accent.
    const ba = phase + barrelPropSlot.angleTurns * Math.PI * 2;
    const bx = Math.cos(ba) * barrelPropSlot.radius;
    const bz = Math.sin(ba) * barrelPropSlot.radius;
    addPiece("barrel", wx, sy, wz, bx, 0.08, bz);
    addPiece("ropeCoil", wx, sy, wz, bx, 0.155, bz, 1, 1, 1, 0, PI_2, 0);
    addPiece("ropeCoil", wx, sy, wz, bx, 0.175, bz, 0.75, 0.75, 1, 0, PI_2, 0);

    // Brass ground-stake / guy-wire anchor offset from the mast base.
    const sa = phase + stakePropSlot.angleTurns * Math.PI * 2;
    const sx = Math.cos(sa) * stakePropSlot.radius;
    const sz = Math.sin(sa) * stakePropSlot.radius;
    addPieceAlong("groundStake", wx, sy, wz, sx, 0.02, sz, -0.12, 0.24, -0.06, 0.28);
  };

  const instances: WaystationInstance[] = [];

  // ─── Public API ─────────────────────────────────────────────────────
  const clear = (): void => {
    for (const slot of slots.values()) slot.count = 0;
    instances.length = 0;
  };

  const addInstance = (
    centerX: number,
    centerZ: number,
    surfaceY: number,
    worldX: number,
    worldZ: number,
    waystation: { activated: boolean }
  ): void => {
    // Every static-piece buffer is preallocated for `C` waystations; more
    // than that would index past the InstancedMesh's typed arrays in
    // update(), so drop the excess rather than let the per-slot cap
    // silently desync from `instances`.
    if (instances.length >= C) return;
    const hash = ((worldX * 73_193) ^ (worldZ * 51_487)) >>> 0;
    const phase = ((hash % 1000) / 1000) * Math.PI * 2;
    instances.push({ x: centerX, y: surfaceY, z: centerZ, phase, activated: waystation.activated });
    addWaystation(centerX, surfaceY, centerZ, phase);
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
    const count = instances.length;
    if (count === 0) return;

    // Pulse the lens gently while dormant, hold bright while activated.
    let anyDormant = false;
    let anyActivated = false;
    for (const inst of instances) {
      if (inst.activated) anyActivated = true;
      else anyDormant = true;
    }
    if (anyActivated && !anyDormant) {
      lensMaterial.emissiveIntensity = 1.35;
    } else if (!anyActivated) {
      lensMaterial.emissiveIntensity = 0.3 + 0.15 * (0.5 + 0.5 * Math.sin(nowMs * 0.0016));
    } else {
      lensMaterial.emissiveIntensity = 0.85;
    }

    // Spin the weathercock vane on top of each shelter roof.
    const vaneSlot = slots.get("vaneArm");
    if (vaneSlot && vaneSlot.count > 0) {
      for (let i = 0; i < count; i += 1) {
        const inst = instances[i]!;
        const angle = nowMs * VANE_SPEED + inst.phase;
        position.set(inst.x - 0.42, inst.y + VANE_Y, inst.z - 0.12);
        scaleVec.set(1, 1, 1);
        tmpEuler.set(0, angle, 0, "XYZ");
        tmpQuat.setFromEuler(tmpEuler);
        matrix.compose(position, tmpQuat, scaleVec);
        vaneSlot.mesh.setMatrixAt(i, matrix);
      }
      vaneSlot.mesh.instanceMatrix.clearUpdateRanges();
      vaneSlot.mesh.instanceMatrix.addUpdateRange(0, vaneSlot.count * 16);
      vaneSlot.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    scene.remove(group);
    [
      anchorBaseGeo, anchorRivetGeo, plinthGeo, plinthBandGeo, mastGeo, mastBandGeo,
      lensCageRingGeo, lensCageStrutGeo, lensGeo, lensGearGeo, roofGeo, shelterBodyGeo,
      doorSeamGeo, windowSeamGeo, ventGeo, crateBodyGeo, crateStrapGeo, barrelGeo,
      ropeCoilGeo, groundStakeGeo, vaneSpindleGeo, vaneArmGeo
    ].forEach((g) => g.dispose());
    [ironMaterial, brassMaterial, brassBrightMaterial, mechMaterial, glassMaterial, lensMaterial, fabricMaterial].forEach((m) =>
      m.dispose()
    );
  };

  return { group, clear, addInstance, commit, update, dispose };
};
