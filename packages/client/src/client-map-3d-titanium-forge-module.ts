// Titanium Forge (TFM) module — a compact war-forge cartridge that docks into
// one Automated Fabrication Complex Module_Socket bay.
//
// Local space: +X is FORWARD — the outward radial direction of the socket (its
// `yaw`). The root sits at the socket attachment point (the pad-top center, `y`
// returned by moduleSocketAttachments). Dock it with
// addInstance(att.x, att.z, att.y, att.yaw, ...) so the forge mouth faces away
// from the AFC core.
//
// Procedural hierarchy (every child is logically parented to TFM_Root at the
// bay center, yaw-aligned to face outward):
//   TFM_Root
//   ├── Seat                  — dockable circular base + brass locking lip
//   ├── Forge_Pod             — rounded blackened-iron pod with two brass
//   │                            structural bands and a firebrick shroud
//   ├── Forge_Chamber         — the exposed front/top firing position:
//   │     thick brass-and-steel ring, radial reinforcement ribs, molten
//   │     titanium glowing orange, white-hot core in the bowl
//   ├── Press_Ram             — chunky overhead ram and two compression jaws
//   │                            that pinch the heated stock
//   ├── Service_Pipes         — two short pressure pipes with brass valve
//   │                            collars on the pod rear
//   ├── Side_Braces           — two reinforced diagonal struts to the seat
//   └── Power_Connector       — one cyan AFC power intake facing the socket
//
// Construction is heavy industrial: blackened iron/steel, aged brass at joints,
// a squat domed pod, one big hot forge mouth and one chunky press — a
// specialized fabrication cartridge inserted into the AFC, not a standalone
// factory. The docked footprint (TITANIUM_FORGE_BASE_RADIUS) fits inside
// AFC_BAY_INNER_RADIUS. Cyan is restrained to the AFC power connector.
//
// No two pieces share a coplanar surface: bands and rings protrude past the
// piece they wrap, discs sit at different depths along the forge axis, and
// stacked cylinders step down in radius — otherwise the seams Z-fight into
// black line artifacts.

import {
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  DoubleSide,
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
// scale about the dock origin, matching the Siege Lens Foundry module family.
export const TITANIUM_FORGE_SCALE = 1.33;
// Footprint radius of the dockable seat — below the AFC bay inner radius
// (0.14) so the module slots into the socket ring with clearance.
export const TITANIUM_FORGE_BASE_RADIUS = 0.105 * TITANIUM_FORGE_SCALE;
// Total height above the pad top (top of the press-ram cap), 0.246 × 1.33.
export const TITANIUM_FORGE_MODULE_HEIGHT = 0.246 * TITANIUM_FORGE_SCALE;

export type TitaniumForgeModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createTitaniumForgeModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): TitaniumForgeModuleOverlay => {
  const C = maxInstances;
  const PI_2 = Math.PI / 2;
  // Forge-heart shimmer — the molten bowl and white-hot core pulse in place.
  const FORGE_SPEED = 0.0035;
  const FORGE_AMPLITUDE = 0.16;
  // Forge mouth axis: out of the pod front-top at ~45°, local +X forward.
  const forgeAxis = new Vector3(0.7, 0.72, 0).normalize();
  // Orthonormal basis of the mouth-ring plane, for the radial ribs.
  const ringU = new Vector3().crossVectors(forgeAxis, new Vector3(0, 0, 1)).normalize();
  const ringV = new Vector3().crossVectors(forgeAxis, ringU);
  // Mouth center sits ~0.018 outside the pod radius (0.075 at pod center
  // (0, 0.12, 0)) so the ring, bowl and jaws hang proud of the body and the
  // molten faces read from outside rather than hiding inside the pod.
  const mouth = new Vector3(0.075, 0.175, 0);

  // ─── Materials (shared by piece type) ───────────────────────────────
  const ironMaterial = new MeshStandardMaterial({ color: "#22242a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const steelMaterial = new MeshStandardMaterial({ color: "#17181d", roughness: 0.62, metalness: 0.5, flatShading: true });
  const brassMaterial = new MeshStandardMaterial({ color: "#8b6c3d", roughness: 0.42, metalness: 0.85, flatShading: true });
  const brassDarkMaterial = new MeshStandardMaterial({ color: "#6f5733", roughness: 0.5, metalness: 0.8, flatShading: true });
  const pipeMaterial = new MeshStandardMaterial({ color: "#1d1f25", roughness: 0.68, metalness: 0.35, flatShading: true });
  // Molten titanium in the forge bowl: orange heat that reads through shadows.
  const forgeHotMaterial = new MeshStandardMaterial({
    color: "#3a0d02",
    roughness: 0.3,
    metalness: 0.1,
    flatShading: true,
    emissive: "#ff7b29",
    emissiveIntensity: 2.3
  });
  // The white-hot core at the bottom of the bowl.
  const forgeWhiteMaterial = new MeshStandardMaterial({
    color: "#5a2a05",
    roughness: 0.25,
    metalness: 0.05,
    flatShading: true,
    emissive: "#ffe9b8",
    emissiveIntensity: 3.0
  });
  // Restrained AFC power element: the cyan connector nipple fed from the socket.
  const connectorGlowMaterial = new MeshStandardMaterial({
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
  const shroudGeo = new CylinderGeometry(0.055, 0.075, 0.03, 14);
  const mouthRingGeo = new TorusGeometry(0.055, 0.018, 10, 24);
  const innerRingGeo = new TorusGeometry(0.045, 0.01, 10, 24);
  const hotGeo = new CylinderGeometry(0.032, 0.035, 0.012, 18);
  const whiteGeo = new CylinderGeometry(0.02, 0.022, 0.01, 16);
  const ribGeo = new CylinderGeometry(0.012, 0.014, 1, 8);
  const ramGeo = new CylinderGeometry(0.03, 0.034, 0.05, 8);
  const ramCapGeo = new CylinderGeometry(0.034, 0.037, 0.012, 10);
  const jawGeo = new CylinderGeometry(0.017, 0.019, 1, 10);
  const jawTipGeo = new CylinderGeometry(0.013, 0.014, 0.02, 12);
  const pipeGeo = new CylinderGeometry(0.013, 0.013, 0.05, 10);
  const valveGeo = new TorusGeometry(0.018, 0.005, 8, 14);
  const braceGeo = new CylinderGeometry(0.014, 0.016, 1, 8);
  const connectorGeo = new CylinderGeometry(0.018, 0.019, 1, 10);
  const connectorTipGeo = new CylinderGeometry(0.012, 0.012, 0.016, 14);

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
  make("shroud", shroudGeo, brassDarkMaterial, 1);
  make("mouthRing", mouthRingGeo, brassMaterial, 1);
  make("innerRing", innerRingGeo, steelMaterial, 1);
  make("hot", hotGeo, forgeHotMaterial, 1);
  make("white", whiteGeo, forgeWhiteMaterial, 1);
  make("rib", ribGeo, steelMaterial, 6);
  make("ram", ramGeo, ironMaterial, 1);
  make("ramCap", ramCapGeo, brassMaterial, 1);
  make("jaw", jawGeo, brassDarkMaterial, 2);
  make("jawTip", jawTipGeo, steelMaterial, 2);
  make("pipe", pipeGeo, steelMaterial, 2);
  make("valve", valveGeo, brassMaterial, 2);
  make("brace", braceGeo, steelMaterial, 2);
  make("connector", connectorGeo, brassMaterial, 1);
  make("connectorTip", connectorTipGeo, connectorGlowMaterial, 1);

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
    // Piece offsets and instance scale grow with TITANIUM_FORGE_SCALE about
    // the dock origin; the scene-anchor position (wx, sy, wz) never scales so
    // docked instances stay on their socket.
    position.set(wx + ox * TITANIUM_FORGE_SCALE, sy + oy * TITANIUM_FORGE_SCALE, wz + oz * TITANIUM_FORGE_SCALE);
    scale.set(sx * TITANIUM_FORGE_SCALE, sy2 * TITANIUM_FORGE_SCALE, sz * TITANIUM_FORGE_SCALE);
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

  // A thin disc/plate whose flat face is perpendicular to a direction (its own
  // geometry height is the thickness — rotated, not scaled).
  const addPlateAlong = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): void => {
    const e = eulerFromDir(dx, dy, dz);
    addPiece(key, wx, sy, wz, ox, oy, oz, 1, 1, 1, e.ry, e.rx, e.rz);
  };

  // A torus with its hole aligned along a direction (a ring my eye sees as a
  // flat band around a forward axis).
  const addRingAlong = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): void => {
    const e = eulerFromDirZ(dx, dy, dz);
    addPiece(key, wx, sy, wz, ox, oy, oz, 1, 1, 1, e.ry, e.rx, e.rz);
  };

  // ─── Module placement ───────────────────────────────────────────────
  const addSeat = (wx: number, sy: number, wz: number): void => {
    addPiece("base", wx, sy, wz, 0, 0.016, 0);
    addPiece("baseRing", wx, sy, wz, 0, 0.032, 0, 1, 1, 1, 0, PI_2, 0);
  };

  // Forge_Pod: the squat rounded pod body with two brass structural bands.
  const addForgePod = (wx: number, sy: number, wz: number): void => {
    addPiece("pod", wx, sy, wz, 0, 0.12, 0);
    addPiece("band", wx, sy, wz, 0, 0.085, 0, 1, 1, 1, 0, PI_2, 0);
    addPiece("band", wx, sy, wz, 0, 0.155, 0, 1, 1, 1, 0, PI_2, 0);
  };

  // Forge_Chamber: the exposed front/top firing position — a firebrick shroud
  // recessed into the pod, a thick brass ring and inner steel ring around the
  // molten titanium bowl (orange) with a white-hot core, and six radial
  // reinforcement ribs in the ring plane.
  const addForgeChamber = (wx: number, sy: number, wz: number): void => {
    addPlateAlong("shroud", wx, sy, wz, mouth.x - forgeAxis.x * 0.035, mouth.y - forgeAxis.y * 0.035, 0, forgeAxis.x, forgeAxis.y, 0);
    addRingAlong("mouthRing", wx, sy, wz, mouth.x, mouth.y, 0, forgeAxis.x, forgeAxis.y, 0);
    addRingAlong("innerRing", wx, sy, wz, mouth.x - forgeAxis.x * 0.005, mouth.y - forgeAxis.y * 0.005, 0, forgeAxis.x, forgeAxis.y, 0);
    addPlateAlong("hot", wx, sy, wz, mouth.x - forgeAxis.x * 0.0075, mouth.y - forgeAxis.y * 0.0075, 0, forgeAxis.x, forgeAxis.y, 0);
    addPlateAlong("white", wx, sy, wz, mouth.x - forgeAxis.x * 0.022, mouth.y - forgeAxis.y * 0.022, 0, forgeAxis.x, forgeAxis.y, 0);
    const ribRadius = 0.095;
    for (let i = 0; i < 6; i += 1) {
      const ang = (i * Math.PI) / 3;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const rx = ringU.x * cos + ringV.x * sin;
      const ry = ringU.y * cos + ringV.y * sin;
      const rz = ringU.z * cos + ringV.z * sin;
      addPieceAlong("rib", wx, sy, wz, mouth.x + rx * ribRadius, mouth.y + ry * ribRadius, rz * ribRadius, rx, ry, rz, 0.038);
    }
  };

  // Press_Ram: a chunky overhead ram above the mouth plus two compression
  // jaws angling down into the bowl — visibly shaping the heated titanium.
  const addPressRam = (wx: number, sy: number, wz: number): void => {
    addPiece("ram", wx, sy, wz, 0.05, 0.221, 0);
    addPiece("ramCap", wx, sy, wz, 0.05, 0.24, 0);
    // Bowl point the jaws pinch: just inside the mouth plane.
    const bx = mouth.x - forgeAxis.x * 0.004;
    const by = mouth.y - forgeAxis.y * 0.004;
    for (const side of [-1, 1]) {
      const dx = bx - 0.05;
      const dy = by - 0.19;
      const dz = -0.052 * side;
      const len = Math.hypot(dx, dy, dz);
      const nx = dx / len;
      const ny = dy / len;
      const nz = dz / len;
      addPieceAlong("jaw", wx, sy, wz, 0.05, 0.19, 0.052 * side, nx, ny, nz, len);
      addPlateAlong("jawTip", wx, sy, wz, bx, by, -0.052 * side, nx, ny, nz);
    }
  };

  // Service_Pipes: two short pressure pipes with brass valve collars on the
  // pod rear deck.
  const addServicePipes = (wx: number, sy: number, wz: number): void => {
    addPiece("pipe", wx, sy, wz, -0.018, 0.195, -0.062);
    addPiece("pipe", wx, sy, wz, -0.018, 0.195, 0.062);
    addPiece("valve", wx, sy, wz, -0.018, 0.2225, -0.062, 1, 1, 1, 0, PI_2, 0);
    addPiece("valve", wx, sy, wz, -0.018, 0.2225, 0.062, 1, 1, 1, 0, PI_2, 0);
  };

  // Two reinforced diagonal side braces tying the pod flanks to the seat.
  const addSideBraces = (wx: number, sy: number, wz: number): void => {
    for (const side of [-1, 1]) {
      const toX = 0.035;
      const toY = 0.13;
      const toZ = 0.056 * side;
      const fromX = 0.005;
      const fromY = 0.045;
      const fromZ = 0.072 * side;
      const dx = toX - fromX;
      const dy = toY - fromY;
      const dz = toZ - fromZ;
      const len = Math.hypot(dx, dy, dz);
      addPieceAlong("brace", wx, sy, wz, (toX + fromX) / 2, (toY + fromY) / 2, (toZ + fromZ) / 2, dx, dy, dz, len);
    }
  };

  // Power_Connector: one AFC intake stub with a cyan nipple facing the socket.
  const addPowerConnector = (wx: number, sy: number, wz: number): void => {
    addPieceAlong("connector", wx, sy, wz, -0.058, 0.1, 0, -1, 0, 0, 0.034);
    addPlateAlong("connectorTip", wx, sy, wz, -0.08, 0.1, 0, -1, 0, 0);
  };

  const addModule = (wx: number, sy: number, wz: number): void => {
    addSeat(wx, sy, wz);
    addForgePod(wx, sy, wz);
    addForgeChamber(wx, sy, wz);
    addPressRam(wx, sy, wz);
    addServicePipes(wx, sy, wz);
    addSideBraces(wx, sy, wz);
    addPowerConnector(wx, sy, wz);
  };

  // ─── Forge-heart animation ──────────────────────────────────────────
  // The molten bowl and white-hot core sit on discs whose flat faces face the
  // forge axis; the quaternion maps local +Y onto that axis (same rotation the
  // addPlateAlong placement uses) so the pulse never breaks orientation.
  const forgeQuat = new Quaternion().setFromUnitVectors(yAxis, forgeAxis);
  const hotOffset = new Vector3(mouth.x - forgeAxis.x * 0.0075, mouth.y - forgeAxis.y * 0.0075, 0);
  const whiteOffset = new Vector3(mouth.x - forgeAxis.x * 0.022, mouth.y - forgeAxis.y * 0.022, 0);
  const hotMesh = slots.get("hot")?.mesh;
  const whiteMesh = slots.get("white")?.mesh;

  type TfmRecord = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
    readonly phase: number;
  };
  const records: TfmRecord[] = [];

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
    if (count === 0 || hotMesh === undefined || whiteMesh === undefined) return;
    for (let i = 0; i < count; i += 1) {
      const rec = records[i]!;
      yawQuat.setFromEuler(tmpEuler.set(0, -rec.yaw, 0, "XYZ"));
      yawMatrix.makeRotationFromQuaternion(yawQuat);
      const breathe = 1 + FORGE_AMPLITUDE * Math.sin(nowMs * FORGE_SPEED + rec.phase);
      position.set(rec.x + hotOffset.x * TITANIUM_FORGE_SCALE, rec.y + hotOffset.y * TITANIUM_FORGE_SCALE, rec.z + hotOffset.z * TITANIUM_FORGE_SCALE);
      scale.set(breathe * TITANIUM_FORGE_SCALE, breathe * TITANIUM_FORGE_SCALE, breathe * TITANIUM_FORGE_SCALE);
      pieceMatrix.compose(position, forgeQuat, scale);
      matrix.multiplyMatrices(yawMatrix, pieceMatrix);
      hotMesh.setMatrixAt(i, matrix);
      position.set(rec.x + whiteOffset.x * TITANIUM_FORGE_SCALE, rec.y + whiteOffset.y * TITANIUM_FORGE_SCALE, rec.z + whiteOffset.z * TITANIUM_FORGE_SCALE);
      pieceMatrix.compose(position, forgeQuat, scale);
      matrix.multiplyMatrices(yawMatrix, pieceMatrix);
      whiteMesh.setMatrixAt(i, matrix);
    }
    yawMatrix.identity();
    for (const mesh of [hotMesh, whiteMesh]) {
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