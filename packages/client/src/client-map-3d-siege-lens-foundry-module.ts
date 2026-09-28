// Siege Lens Foundry (SLF) module — a compact war-optics fabrication
// attachment that docks into one Automated Fabrication Complex Module_Socket
// bay.
//
// Local space: +X is FORWARD — the outward radial direction of the socket
// (its `yaw`). The root sits at the socket attachment point (the pad-top
// center, `y` returned by moduleSocketAttachments). Dock it with
// addInstance(att.x, att.z, att.y, att.yaw, ...) so the lens aims away from
// the AFC core.
//
// Procedural hierarchy (every child is logically parented to SLF_Root at the
// bay center, yaw-aligned to face outward):
//   SLF_Root
//   ├── Seat                  — dockable circular base + brass locking lip
//   ├── Foundry_Body          — hexagonal furnace stack, exhaust vent, two
//   │                            pressure tanks with steel caps
//   ├── Siege_Lens            — the oversized brass-and-steel focusing
//   │                            assembly: flange, barrel, muzzle, optic
//   │                            glass, three concentric focusing rings and a
//   │                            cyan aether core in the beam chamber
//   ├── Manipulator_Clamp ×2  — articulated handling arms on the flanks,
//   │                            each holding a lens blank in mid-process
//   └── Power_Couplings       — conduit stubs running out to the socket
//                                collar so the module draws power from the AFC.
//
// Construction is heavy industrial: blackened iron/steel, aged brass at
// joints and transitions, a hexagonal furnace core and pressure tanks; cyan
// aether is restrained to the vent slit and the lens core. The docked
// footprint (SIEGE_LENS_BASE_RADIUS) fits inside AFC_BAY_INNER_RADIUS.
//
// No two pieces share a coplanar surface: transition bands (base lip, body
// band, barrel flange) are sized to protrude past the piece they wrap, and
// stacked cylinders step down in radius so their walls never overlap at the
// exact same distance from the axis — otherwise the seams Z-fight into black
// line artifacts.

import {
  BufferGeometry,
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
// scale about the dock origin. Keeps the seat planted on the pad while growing
// the whole silhouette (footprint always below AFC_BAY_INNER_RADIUS = 0.14).
export const SIEGE_LENS_SCALE = 1.33;
// Footprint radius of the dockable seat — guaranteed below the AFC bay inner
// radius (0.14) so the module slots into the socket ring with clearance
// (0.105 × 1.33 ≈ 0.1397 < 0.14).
export const SIEGE_LENS_BASE_RADIUS = 0.105 * SIEGE_LENS_SCALE;
// Total height above the pad top (top of the furnace stack), 0.248 × 1.33.
export const SIEGE_LENS_MODULE_HEIGHT = 0.248 * SIEGE_LENS_SCALE;

export type SiegeLensFoundryModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createSiegeLensFoundryModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): SiegeLensFoundryModuleOverlay => {
  const C = maxInstances;
  const PI_2 = Math.PI / 2;
  // Lens-core heartbeat — slow, contained, powering the focusing chamber.
  const CORE_SPEED = 0.0012;

  // ─── Materials (shared by piece type) ───────────────────────────────
  const ironMaterial = new MeshStandardMaterial({ color: "#22242a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const steelMaterial = new MeshStandardMaterial({ color: "#17181d", roughness: 0.62, metalness: 0.5, flatShading: true });
  const brassMaterial = new MeshStandardMaterial({ color: "#8b6c3d", roughness: 0.42, metalness: 0.85, flatShading: true });
  const brassDarkMaterial = new MeshStandardMaterial({ color: "#6f5733", roughness: 0.5, metalness: 0.8, flatShading: true });
  const pipeMaterial = new MeshStandardMaterial({ color: "#1d1f25", roughness: 0.68, metalness: 0.35, flatShading: true });
  // The optic glass of the lens front and the blanks being worked: dark
  // cyan-tinted glass that lets the lens-core glow read through the face.
  // polygonOffset bias wins the depth test against the opaque rings it sits
  // among, so the disc never Z-fights into black seams.
  const opticGlassMaterial = new MeshStandardMaterial({
    color: "#0b1b21",
    roughness: 0.2,
    metalness: 0.15,
    transparent: true,
    opacity: 0.9,
    side: DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    emissive: "#0c4a58",
    emissiveIntensity: 0.35
  });
  // Restrained aether glow: the vent slit wrap and the beam-chamber lens core.
  const glowMaterial = new MeshStandardMaterial({
    color: "#041c24",
    roughness: 0.3,
    metalness: 0.1,
    flatShading: true,
    emissive: "#41f6ff",
    emissiveIntensity: 2.1
  });
  const ventMaterial = new MeshStandardMaterial({
    color: "#05222a",
    roughness: 0.3,
    metalness: 0.1,
    flatShading: true,
    emissive: "#41f6ff",
    emissiveIntensity: 1.4
  });

  // ─── Geometries (shared) ────────────────────────────────────────────
  // Small curved parts (rings, bands, flanges, barrels) use high segment
  // counts: under flatShading an 8-segment torus tube or a 10-segment
  // cylinder reads as a faceted shell with a dark normal-kink crease around
  // every facet — visible as "black lines" all over the model. Higher
  // tessellation shrinks each kink below visibility while keeping the
  // blocky-industrial flat-shaded look of the larger forms.
  const baseGeo = new CylinderGeometry(0.1, 0.105, 0.032, 16);
  // Outward-protruding locking lip: sits beyond the base edge (inner radius
  // 0.108 > base bottom 0.105) so its band never shares a surface with it.
  const baseRingGeo = new TorusGeometry(0.12, 0.012, 12, 28);
  const hexBodyGeo = new CylinderGeometry(0.075, 0.085, 0.09, 8);
  const bodyBandGeo = new TorusGeometry(0.078, 0.009, 12, 28);
  const bodyTopGeo = new CylinderGeometry(0.065, 0.072, 0.05, 14);
  const stackGeo = new CylinderGeometry(0.026, 0.028, 0.06, 10);
  const ventGlowGeo = new CylinderGeometry(0.03, 0.034, 0.014, 14);
  const tankGeo = new CylinderGeometry(0.02, 0.02, 0.085, 10);
  const capGeo = new CylinderGeometry(0.0215, 0.024, 0.018, 14);
  // The barrel shells step down in radius at every joint so no two stacked
  // cylinders have matching walls; flange/wrap pieces protrude past the one
  // inside them.
  const lensHousingGeo = new CylinderGeometry(0.075, 0.0765, 0.075, 18);
  const lensMuzzleGeo = new CylinderGeometry(0.07, 0.078, 0.03, 18);
  const barrelFlangeGeo = new TorusGeometry(0.082, 0.009, 12, 28);
  const opticGeo = new CylinderGeometry(0.05, 0.055, 0.014, 26);
  const ring1Geo = new TorusGeometry(0.062, 0.009, 12, 26);
  const ring2Geo = new TorusGeometry(0.048, 0.007, 12, 24);
  const ring3Geo = new TorusGeometry(0.035, 0.0055, 12, 20);
  const lensCoreGeo = new CylinderGeometry(0.02, 0.022, 0.012, 20);
  const lensTipGeo = new TorusGeometry(0.026, 0.004, 12, 16);
  const clampShoulderGeo = new TorusGeometry(0.02, 0.008, 10, 18);
  const clampUpperGeo = new CylinderGeometry(0.01, 0.011, 1, 8);
  const clampElbowGeo = new TorusGeometry(0.014, 0.006, 10, 16);
  const clampLowerGeo = new CylinderGeometry(0.008, 0.009, 1, 8);
  const clampFingerGeo = new CylinderGeometry(0.0065, 0.007, 1, 8);
  const lensBlankGeo = new CylinderGeometry(0.016, 0.016, 0.006, 18);
  const cableGeo = new CylinderGeometry(0.009, 0.009, 1, 9);

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
  make("hexBody", hexBodyGeo, ironMaterial, 1);
  make("bodyBand", bodyBandGeo, brassMaterial, 1);
  make("bodyTop", bodyTopGeo, steelMaterial, 1);
  make("stack", stackGeo, pipeMaterial, 1);
  make("ventGlow", ventGlowGeo, ventMaterial, 1);
  make("tankL", tankGeo, brassMaterial, 1);
  make("tankR", tankGeo, brassMaterial, 1);
  make("capL", capGeo, steelMaterial, 1);
  make("capR", capGeo, steelMaterial, 1);
  make("lensHousing", lensHousingGeo, brassMaterial, 1);
  make("lensMuzzle", lensMuzzleGeo, ironMaterial, 1);
  make("barrelFlange", barrelFlangeGeo, steelMaterial, 1);
  make("glass", opticGeo, opticGlassMaterial, 1);
  make("ring1", ring1Geo, steelMaterial, 1);
  make("ring2", ring2Geo, brassMaterial, 1);
  make("ring3", ring3Geo, brassDarkMaterial, 1);
  make("lensCore", lensCoreGeo, glowMaterial, 1);
  make("lensTip", lensTipGeo, steelMaterial, 1);
  make("clampShoulder", clampShoulderGeo, brassMaterial, 2);
  make("clampUpper", clampUpperGeo, ironMaterial, 2);
  make("clampElbow", clampElbowGeo, brassDarkMaterial, 2);
  make("clampLower", clampLowerGeo, ironMaterial, 2);
  make("clampFinger", clampFingerGeo, steelMaterial, 2);
  make("lensBlank", lensBlankGeo, opticGlassMaterial, 2);
  make("cableL", cableGeo, pipeMaterial, 1);
  make("cableR", cableGeo, pipeMaterial, 1);

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
    // Piece offsets and instance scale grow with SIEGE_LENS_SCALE about the
    // dock origin (the seat bottom at the socket point); the scene-anchor
    // position (wx, sy, wz) is the dock itself and must NOT scale or every
    // docked instance would drift off its socket.
    position.set(wx + ox * SIEGE_LENS_SCALE, sy + oy * SIEGE_LENS_SCALE, wz + oz * SIEGE_LENS_SCALE);
    scale.set(sx * SIEGE_LENS_SCALE, sy2 * SIEGE_LENS_SCALE, sz * SIEGE_LENS_SCALE);
    if (rotX === 0 && rotY === 0 && rotZ === 0) {
      pieceQuat.identity();
    } else {
      tmpEuler.set(rotX, rotY, rotZ, "XYZ");
      pieceQuat.setFromEuler(tmpEuler);
    }
    // Piece-local transform first, then the module's yaw: column-major
    // matrix multiply couples the two rotations before the translate so the
    // whole module turns to face its socket azimuth.
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

  const addPieceAlong = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, len: number): void => {
    const e = eulerFromDir(dx, dy, dz);
    // `len` goes into the sy2 (Y-axis) scale slot — the cylinder's own axis —
    // so the piece is a short rod along the direction. Passing it to sz instead
    // would leave the rod a full cylinder-height (1 unit) long and squashed
    // sideways, reading as black slabs sticking out of the module.
    addPiece(key, wx, sy, wz, ox, oy, oz, 1, 1, len, e.ry, e.rx, e.rz);
  };

  // A torus with its hole aligned along a direction (a ring my eye sees as a
  // flat band around a forward axis).
  const addRingAlong = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): void => {
    const e = eulerFromDirZ(dx, dy, dz);
    addPiece(key, wx, sy, wz, ox, oy, oz, 1, 1, 1, e.ry, e.rx, e.rz);
  };

  // ─── Module placement ───────────────────────────────────────────────
  // Seat: the circular dockable base with a brass locking lip that visibly
  // bites into the socket collar when the module drops in.
  const addSeat = (wx: number, sy: number, wz: number): void => {
    addPiece("base", wx, sy, wz, 0, 0.016, 0);
    addPiece("baseRing", wx, sy, wz, 0, 0.032, 0, 1, 1, 1, 0, PI_2, 0);
  };

  // Foundry_Body: squat hexagonal furnace stack, exhaust vent (with aether
  // glow slit at its root) and two pressure tanks riding the rear.
  const addFoundryBody = (wx: number, sy: number, wz: number): void => {
    addPiece("hexBody", wx, sy, wz, 0, 0.095, 0);
    addPiece("bodyBand", wx, sy, wz, 0, 0.139, 0, 1, 1, 1, 0, PI_2, 0);
    addPiece("bodyTop", wx, sy, wz, 0, 0.18, 0);
    addPiece("stack", wx, sy, wz, -0.03, 0.218, -0.05);
    addPiece("ventGlow", wx, sy, wz, -0.03, 0.19, -0.05);
    addPiece("tankL", wx, sy, wz, -0.035, 0.112, -0.07);
    addPiece("tankR", wx, sy, wz, -0.035, 0.112, 0.07);
    addPiece("capL", wx, sy, wz, -0.035, 0.1605, -0.07);
    addPiece("capR", wx, sy, wz, -0.035, 0.1605, 0.07);
  };

  // Siege_Lens: the oversized forward-facing focusing assembly. Its axis runs
  // along local +X (rotZ = -90° swings the +Y cylinder axis forward), welded
  // to the body through a protruding steel flange at the rear and ending in a
  // three-ring aperture around the glowing beam chamber up front.
  const addSiegeLens = (wx: number, sy: number, wz: number): void => {
    const axisX = 0;
    const rotAxis = { rotY: 0, rotX: 0, rotZ: -PI_2 };
    addRingAlong("barrelFlange", wx, sy, wz, 0.0475, 0.13, axisX, 1, 0, 0);
    addPiece("lensHousing", wx, sy, wz, 0.0775, 0.13, axisX, 1, 1, 1, rotAxis.rotY, rotAxis.rotX, rotAxis.rotZ);
    addPiece("lensMuzzle", wx, sy, wz, 0.135, 0.13, axisX, 1, 1, 1, rotAxis.rotY, rotAxis.rotX, rotAxis.rotZ);
    addPiece("glass", wx, sy, wz, 0.152, 0.13, axisX, 1, 1, 1, rotAxis.rotY, rotAxis.rotX, rotAxis.rotZ);
    addRingAlong("ring1", wx, sy, wz, 0.149, 0.13, axisX, 1, 0, 0);
    addRingAlong("ring2", wx, sy, wz, 0.155, 0.13, axisX, 1, 0, 0);
    addRingAlong("ring3", wx, sy, wz, 0.158, 0.13, axisX, 1, 0, 0);
    addPiece("lensCore", wx, sy, wz, 0.164, 0.13, axisX, 1, 1, 1, rotAxis.rotY, rotAxis.rotX, rotAxis.rotZ);
    addRingAlong("lensTip", wx, sy, wz, 0.166, 0.13, axisX, 1, 0, 0);
  };

  // Manipulator_Clamp: a compact two-segment handling arm on each flank of
  // the foundry, holding a lens blank in mid-process above the furnace line.
  const addClampArm = (wx: number, sy: number, wz: number, side: number): void => {
    const z1 = 0.09 * side;
    addRingAlong("clampShoulder", wx, sy, wz, 0, 0.175, z1, 1, 0, 0);
    addPieceAlong("clampUpper", wx, sy, wz, 0, 0.175, z1, 0.035, 0.037, 0.01 * side, 0.052);
    addRingAlong("clampElbow", wx, sy, wz, 0.035, 0.212, 0.1 * side, 1, 0, 0);
    addPieceAlong("clampLower", wx, sy, wz, 0.035, 0.212, 0.1 * side, 0.04, -0.022, -0.025 * side, 0.052);
    addPieceAlong("clampFinger", wx, sy, wz, 0.075, 0.19, 0.075 * side, 0.015, -0.005, -0.025 * side, 0.03);
    addPiece("lensBlank", wx, sy, wz, 0.095, 0.183, 0.03 * side, 1, 1, 1, 0, 0, -PI_2);
  };

  // Power_Couplings: conduit stubs running out past the seat lip toward the
  // socket collar, one on each side of the tank bank.
  const addPowerCouplings = (wx: number, sy: number, wz: number): void => {
    addPieceAlong("cableL", wx, sy, wz, -0.07, 0.05, -0.055, -0.075, -0.028, -0.01, 0.081);
    addPieceAlong("cableR", wx, sy, wz, -0.07, 0.05, 0.055, -0.075, -0.028, 0.01, 0.081);
  };

  const addModule = (wx: number, sy: number, wz: number): void => {
    addSeat(wx, sy, wz);
    addFoundryBody(wx, sy, wz);
    addSiegeLens(wx, sy, wz);
    addClampArm(wx, sy, wz, -1);
    addClampArm(wx, sy, wz, 1);
    addPowerCouplings(wx, sy, wz);
  };

  // ─── Lens-core animation ────────────────────────────────────────────
  const lensCoreMesh = slots.get("lensCore")?.mesh;

  const corePieceQuat = new Quaternion().setFromEuler(new Euler(0, 0, -PI_2, "XYZ"));

  type SlfRecord = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
    readonly phase: number;
  };
  const records: SlfRecord[] = [];

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
    if (count === 0 || lensCoreMesh === undefined) return;
    for (let i = 0; i < count; i += 1) {
      const rec = records[i]!;
      yawQuat.setFromEuler(tmpEuler.set(0, -rec.yaw, 0, "XYZ"));
      yawMatrix.makeRotationFromQuaternion(yawQuat);
      const breathe = 1 + 0.12 * Math.sin(nowMs * CORE_SPEED + rec.phase);
      position.set(rec.x, rec.y + 0.13 * SIEGE_LENS_SCALE, rec.z);
      scale.set(breathe * SIEGE_LENS_SCALE, breathe * SIEGE_LENS_SCALE, breathe * SIEGE_LENS_SCALE);
      pieceMatrix.compose(position, corePieceQuat, scale);
      matrix.multiplyMatrices(yawMatrix, pieceMatrix);
      lensCoreMesh.setMatrixAt(i, matrix);
    }
    yawMatrix.identity();
    lensCoreMesh.instanceMatrix.clearUpdateRanges();
    lensCoreMesh.instanceMatrix.addUpdateRange(0, count * 16);
    lensCoreMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMaterials) m.dispose();
  };

  return { clear, addInstance, commit, update, dispose };
};