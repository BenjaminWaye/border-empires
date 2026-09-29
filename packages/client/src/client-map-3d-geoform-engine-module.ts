// Geoform Engine (GFE) module — a compact attachable AFC module that
// fabricates and calibrates extreme terrain-shaping machinery: the planetary
// crust-compactors and landform presses installed on terraforming platforms.
//
// Local space: +X is FORWARD — the outward radial direction of the socket (its
// `yaw`). The root sits at the socket attachment point (the pad-top center, `y`
// returned by moduleSocketAttachments). Dock it with
// addInstance(att.x, att.z, att.y, att.yaw, ...) so the press head faces away
// from the AFC core.
//
// Procedural hierarchy (every child is logically parented to GFE_Root at the
// bay center, yaw-aligned to face outward):
//   GFE_Root
//   ├── Seat                  — dockable circular base + brass locking lip
//   ├── Engine_Pod            — rounded blackened pod with two brass bands
//   ├── Accumulator_Bank      — two heavy vertical pressure cylinders with
//   │     brass caps standing on the pod's rear shoulder
//   ├── Press_Mount           — reinforced brass collar where the piston is
//   │     anchored into the pod's front
//   ├── Geoform_Piston        — the defining feature: a MASSIVE telescoping
//   │     geological piston angled down-forward out of the mount, a thick
//   │     sleeve stepping down to a slim rod
//   ├── Compaction_Head       — an oversized dark-steel press head with a
//   │     heavy brass shoulder band and four breaker teeth reaching down to
//   │     the crust, stopping just above the pad line so nothing clips
//   │     through the socket pad when docked
//   ├── Hydraulic_Struts      — four thick steel struts caging the piston from
//   │     the mount collar to the head
//   ├── Armored_Conduits      — two short armored hydraulic feeds from the
//   │     pod's lower flank into the underside of the mount, each with a
//   │     brass collar ring
//   ├── Pressure_Gauge        — one small cyan aether gauge on the pod flank
//   └── Rear_Coupling         — one heavy rear AFC coupling: thick steel stub,
//         brass collar ring and a bright cyan contact tip
//
// Construction is heavy industrial: blackened iron/steel, aged brass at joints,
// a squat rounded pod and one gigantic downward press — a landform-cracking
// cartridge, not an extraction tool. The docked footprint
// seat (GEOFORM_BASE_RADIUS) fits inside AFC_BAY_INNER_RADIUS, as with every
// other family. Cyan stays on the gauge and the rear contact tip; there is
// deliberately no orange forge glow.
//
// Deliberately broader and heavier than the Rigging Works drill: RGW is a slim
// auger barrel on a gearbox bedded into the pod crown, while GFE drives a wide
// press head down into the terrain under a four-strut hydraulic cage.
//
// No two pieces share a coplanar surface: the piston rod terminates inside
// the head drum, the press face's back cap is buried inside that drum, the
// teeth are placed off the press face, and the accumulator caps sit at their
// own height — otherwise the seams Z-fight into black line artifacts.

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
export const GEOFORM_SCALE = 1.33;
// Footprint radius of the dockable seat — below the AFC bay inner radius
// (0.14) so the module slots into the socket ring with clearance.
export const GEOFORM_BASE_RADIUS = 0.105 * GEOFORM_SCALE;
// Total height above the pad top (top of the accumulator caps), 0.252 × 1.33.
export const GEOFORM_MODULE_HEIGHT = 0.252 * GEOFORM_SCALE;

export type GeoformEngineModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createGeoformEngineModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): GeoformEngineModuleOverlay => {
  const C = maxInstances;
  const PI_2 = Math.PI / 2;
  // The press axis: down-forward out of the pod's front at ~52° below
  // horizontal, so the head drives into the ground ahead of the socket.
  const AXIS = { x: 0.62, y: -0.785 };
  // Perpendicular (in the pod's X–Y plane) to the press axis — the "up" side of
  // the hydraulic cage.
  const PERP = { x: -AXIS.y, y: AXIS.x };
  // The brass mount collar on the pod's front, where the piston is anchored.
  // It stands clear of the pod hull (the collar's rearmost point sits ~0.01
  // outside the pod surface) so the press is visibly cantilevered off the pod
  // and the feed conduits can reach it — and so the breaker teeth stop just
  // above the pad line instead of clipping through the socket pad.
  const MOUNT = { x: 0.145, y: 0.17 };
  // Distance from the mount out to the head center along the axis.
  const STROKE = 0.132;
  // Strut cage offsets off the press axis, in the plane perpendicular to it.
  const STRUT_UPPER = 0.058;
  const STRUT_UPPER_Z = 0.028;
  const STRUT_SIDE_Z = 0.062;
  // Breaker teeth ring the head face at this radius off the axis.
  const TOOTH_R = 0.046;
  // Accumulators stand on the pod's rear shoulder.
  const ACC_X = -0.03;
  const ACC_Z = 0.045;
  const ACC_Y = 0.217;

  // ─── Materials (shared by piece type) ───────────────────────────────
  const ironMaterial = new MeshStandardMaterial({ color: "#22242a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const steelMaterial = new MeshStandardMaterial({ color: "#17181d", roughness: 0.62, metalness: 0.5, flatShading: true });
  const brassMaterial = new MeshStandardMaterial({ color: "#8b6c3d", roughness: 0.42, metalness: 0.85, flatShading: true });
  const brassDarkMaterial = new MeshStandardMaterial({ color: "#6f5733", roughness: 0.5, metalness: 0.8, flatShading: true });
  const pipeMaterial = new MeshStandardMaterial({ color: "#1d1f25", roughness: 0.68, metalness: 0.35, flatShading: true });
  // Restrained cyan aether accents — the pressure gauge and the rear contact
  // tip only; this is a landform press, not a reactor.
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
  const podGeo = new CapsuleGeometry(0.075, 0.05, 6, 16);
  const bandGeo = new TorusGeometry(0.079, 0.011, 10, 26);
  // The press mount, its brass collar ringed on the piston axis.
  const collarGeo = new TorusGeometry(0.062, 0.015, 10, 24);
  // The telescoping piston: a thick sleeve stepping down to a slim rod.
  const sleeveGeo = new CylinderGeometry(0.038, 0.038, 1, 12);
  const pistonBandGeo = new TorusGeometry(0.044, 0.012, 10, 20);
  const rodGeo = new CylinderGeometry(0.027, 0.027, 1, 10);
  // The oversized compaction head: fat steel drum, brass shoulder, press face.
  const headShellGeo = new CylinderGeometry(0.062, 0.062, 1, 14);
  const headBandGeo = new TorusGeometry(0.066, 0.013, 10, 24);
  const headFaceGeo = new CylinderGeometry(0.05, 0.05, 1, 14);
  const toothGeo = new CylinderGeometry(0.012, 0.012, 1, 8);
  // Four thick hydraulic struts caging the piston.
  const strutGeo = new CylinderGeometry(0.016, 0.016, 1, 10);
  // The accumulator bank on the pod's rear shoulder.
  const pressureGeo = new CylinderGeometry(0.021, 0.021, 1, 12);
  const pressureCapGeo = new TorusGeometry(0.021, 0.008, 8, 18);
  // Short armored conduits from the pod flank into the press mount.
  const conduitGeo = new CylinderGeometry(0.013, 0.013, 1, 8);
  const conduitRingGeo = new TorusGeometry(0.017, 0.006, 8, 16);
  const couplingGeo = new CylinderGeometry(0.024, 0.026, 1, 12);
  const couplingRingGeo = new TorusGeometry(0.03, 0.011, 10, 20);
  const couplingTipGeo = new CylinderGeometry(0.014, 0.014, 0.016, 14);
  const gaugeGeo = new CylinderGeometry(0.013, 0.013, 0.008, 12);

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
  make("collar", collarGeo, brassMaterial, 1);
  make("sleeve", sleeveGeo, steelMaterial, 1);
  make("pistonBand", pistonBandGeo, brassMaterial, 1);
  make("rod", rodGeo, steelMaterial, 1);
  make("headShell", headShellGeo, ironMaterial, 1);
  make("headBand", headBandGeo, brassMaterial, 1);
  make("headFace", headFaceGeo, steelMaterial, 1);
  make("tooth", toothGeo, steelMaterial, 4);
  make("strut", strutGeo, pipeMaterial, 4);
  make("pressure", pressureGeo, steelMaterial, 2);
  make("pressureCap", pressureCapGeo, brassMaterial, 2);
  make("conduit", conduitGeo, pipeMaterial, 2);
  make("conduitRing", conduitRingGeo, brassDarkMaterial, 2);
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
    // Piece offsets and instance scale grow with GEOFORM_SCALE about the dock
    // origin; the scene-anchor position (wx, sy, wz) never scales so docked
    // instances stay on their socket.
    position.set(wx + ox * GEOFORM_SCALE, sy + oy * GEOFORM_SCALE, wz + oz * GEOFORM_SCALE);
    scale.set(sx * GEOFORM_SCALE, sy2 * GEOFORM_SCALE, sz * GEOFORM_SCALE);
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

  const addPod = (wx: number, sy: number, wz: number): void => {
    addPiece("pod", wx, sy, wz, 0, 0.115, 0);
    addPiece("band", wx, sy, wz, 0, 0.085, 0, 1, 1, 1, 0, PI_2, 0);
    addPiece("band", wx, sy, wz, 0, 0.155, 0, 1, 1, 1, 0, PI_2, 0);
  };

  // Accumulator_Bank: two heavy pressure cylinders standing on the pod's rear
  // shoulder, each capped with a brass ring — the hydraulic reservoir feeding
  // the press.
  const addAccumulatorBank = (wx: number, sy: number, wz: number): void => {
    for (const flank of [-1, 1]) {
      addPieceAlong("pressure", wx, sy, wz, ACC_X, ACC_Y, ACC_Z * flank, 0, 1, 0, 0.05);
      addRingAlong("pressureCap", wx, sy, wz, ACC_X, ACC_Y + 0.027, ACC_Z * flank, 0, 1, 0);
    }
  };

  // Press_Mount: the reinforced brass collar on the pod's front where the
  // piston is anchored, and the telescoping piston stepping down out of it.
  const addPressMount = (wx: number, sy: number, wz: number): void => {
    addRingAlong("collar", wx, sy, wz, MOUNT.x, MOUNT.y, 0, AXIS.x, AXIS.y, 0);
    addPieceAlong("sleeve", wx, sy, wz, MOUNT.x + AXIS.x * 0.03, MOUNT.y + AXIS.y * 0.03, 0, AXIS.x, AXIS.y, 0, 0.05);
    addRingAlong("pistonBand", wx, sy, wz, MOUNT.x + AXIS.x * 0.062, MOUNT.y + AXIS.y * 0.062, 0, AXIS.x, AXIS.y, 0);
    addPieceAlong("rod", wx, sy, wz, MOUNT.x + AXIS.x * 0.093, MOUNT.y + AXIS.y * 0.093, 0, AXIS.x, AXIS.y, 0, 0.055);
  };

  // Compaction_Head: the oversized press head at the end of the stroke — a
  // fat steel drum with a heavy brass shoulder band, a broad press face and
  // four breaker teeth reaching down to the crust. The press face's back cap
  // is buried inside the drum (never coplanar with its end cap) and the rod
  // terminates inside the drum, so the head reads as one solid casting.
  const addCompactionHead = (wx: number, sy: number, wz: number): void => {
    const hx = MOUNT.x + AXIS.x * STROKE;
    const hy = MOUNT.y + AXIS.y * STROKE;
    addPieceAlong("headShell", wx, sy, wz, hx, hy, 0, AXIS.x, AXIS.y, 0, 0.04);
    addRingAlong("headBand", wx, sy, wz, hx - AXIS.x * 0.018, hy - AXIS.y * 0.018, 0, AXIS.x, AXIS.y, 0);
    addPieceAlong("headFace", wx, sy, wz, hx + AXIS.x * 0.024, hy + AXIS.y * 0.024, 0, AXIS.x, AXIS.y, 0, 0.016);
    // Four breaker teeth on the press face's rim, biting into the crust.
    const tx = hx + AXIS.x * 0.026;
    const ty = hy + AXIS.y * 0.026;
    addPieceAlong("tooth", wx, sy, wz, tx + PERP.x * TOOTH_R, ty + PERP.y * TOOTH_R, 0, AXIS.x, AXIS.y, 0, 0.026);
    addPieceAlong("tooth", wx, sy, wz, tx - PERP.x * TOOTH_R, ty - PERP.y * TOOTH_R, 0, AXIS.x, AXIS.y, 0, 0.026);
    addPieceAlong("tooth", wx, sy, wz, tx, ty, TOOTH_R, AXIS.x, AXIS.y, 0, 0.026);
    addPieceAlong("tooth", wx, sy, wz, tx, ty, -TOOTH_R, AXIS.x, AXIS.y, 0, 0.026);
  };

  // Hydraulic_Struts: four thick struts caging the piston from the mount collar
  // to the head — two over the top, two at the flanks. This is what makes the
  // press read as a planet-scale machine rather than a drill. Each offset is
  // [distance off the press axis in the pod plane, offset across it].
  const addHydraulicStruts = (wx: number, sy: number, wz: number): void => {
    const cage: Array<[number, number]> = [
      [STRUT_UPPER, STRUT_UPPER_Z],
      [STRUT_UPPER, -STRUT_UPPER_Z],
      [0, STRUT_SIDE_Z],
      [0, -STRUT_SIDE_Z]
    ];
    for (const [offAxis, offZ] of cage) {
      const midX = MOUNT.x + PERP.x * offAxis + AXIS.x * 0.0575;
      const midY = MOUNT.y + PERP.y * offAxis + AXIS.y * 0.0575;
      addPieceAlong("strut", wx, sy, wz, midX, midY, offZ, AXIS.x, AXIS.y, 0, 0.115);
    }
  };

  // Armored_Conduits: two short armored hydraulic feeds from the pod's lower
  // flank into the underside of the press mount, each with a brass collar
  // ring. They bridge the gap between hull and cantilevered mount, so the press
  // visibly hangs off the pod rather than floating.
  const CONDUIT_FEED = { perp: -0.062, z: 0.045, startX: 0.055, startY: 0.09, startZ: 0.05 };
  const addArmoredConduits = (wx: number, sy: number, wz: number): void => {
    for (const flank of [-1, 1]) {
      const startX = CONDUIT_FEED.startX;
      const startY = CONDUIT_FEED.startY;
      const startZ = CONDUIT_FEED.startZ * flank;
      const endX = MOUNT.x + PERP.x * CONDUIT_FEED.perp;
      const endY = MOUNT.y + PERP.y * CONDUIT_FEED.perp;
      const endZ = CONDUIT_FEED.z * flank;
      const dx = endX - startX;
      const dy = endY - startY;
      const dz = endZ - startZ;
      const len = Math.hypot(dx, dy, dz);
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      const midZ = (startZ + endZ) / 2;
      addPieceAlong("conduit", wx, sy, wz, midX, midY, midZ, dx, dy, dz, len);
      addRingAlong("conduitRing", wx, sy, wz, midX, midY, midZ, dx, dy, dz);
    }
  };

  const addRearCoupling = (wx: number, sy: number, wz: number): void => {
    addPieceAlong("coupling", wx, sy, wz, -0.052, 0.1, 0, -1, 0, 0, 0.05);
    addRingAlong("couplingRing", wx, sy, wz, -0.05, 0.1, 0, 1, 0, 0);
    addPlateAlong("couplingTip", wx, sy, wz, -0.082, 0.1, 0, -1, 0, 0);
  };

  const addModule = (wx: number, sy: number, wz: number): void => {
    addSeat(wx, sy, wz);
    addPod(wx, sy, wz);
    addAccumulatorBank(wx, sy, wz);
    addPressMount(wx, sy, wz);
    addCompactionHead(wx, sy, wz);
    addHydraulicStruts(wx, sy, wz);
    addArmoredConduits(wx, sy, wz);
    addPiece("gauge", wx, sy, wz, 0.025, 0.185, 0.06, 1, 1, 1, 0, PI_2, 0);
    addRearCoupling(wx, sy, wz);
  };

  // ─── Static asset ───────────────────────────────────────────────────
  // This module carries no idle animation (no piston stroke, no gauge pulse):
  // it renders once and `update` is a no-op that keeps the interactive
  // harness uniform across module families.
  type GfeRecord = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
  };
  const records: GfeRecord[] = [];

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

  // No idle animation on this cartridge: the press sits mid-stroke, static.
  // Keeping the method on the overlay contract so the interactive harness
  // (per-module and AFC update loops) stays uniform across all module families.
  const update = (_nowMs: number): void => {};

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMaterials) m.dispose();
  };

  return { clear, addInstance, commit, update, dispose };
};