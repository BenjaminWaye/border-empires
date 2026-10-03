// Hive Mind (HMM) module — a compact attachable AFC module that coordinates an
// additional autonomous military command network for Thunder Bastions. It is a
// coordinator, not a generator: one large faceted command orb above the pod
// holds the network, braced in a heavy three-claw brass support frame, and three
// relay nodes orbit it at 120°, piped into the orb by thick rigid conduits. A
// slim brass scan ring precesses slowly around the orb and three restrained cyan
// signal lights mark the relays' outward faces.
//
// Local space: +X is FORWARD — the outward radial direction of the socket (its
// `yaw`). The root sits at the socket attachment point (the pad-top center, `y`
// returned by moduleSocketAttachments). Dock it with
// addInstance(att.x, att.z, att.y, att.yaw, ...) so the command node faces away
// from the AFC core.
//
// Procedural hierarchy (every child is logically parented to HMM_Root at the
// bay center, yaw-aligned to face outward):
//   HMM_Root
//   ├── Seat                — dockable circular base + brass locking lip
//   ├── Pod                 — the same low blackened capsule every other family
//   │     docks with, carrying one brass band
//   ├── Command_Node        — THE dominant mechanism: one large faceted
//   │   │   metallic orb of dark steel mounted above the pod's crown
//   │   ├── Support_Claws★3 — the heavy brass frame: three thick claw arcs at
//   │   │   the 120° azimuths gripping the orb from outside
//   │   └── Sensor_Ring     — the small rotating brass scan ring, a slim torus
//   │       that precesses around the orb inside the claw frame (the only
//   │       moving part on this family)
//   ├── Relays★3            — three secondary nodes at the same 120° azimuths,
//   │   │   on a lower ring, each with a cyan signal light on its outer face
//   │   └── Conduits★3       — thick rigid dark-steel lines piping each relay
//   │       into the orb: information flows in, commands flow back out
//   └── Rear_Coupling       — one heavy rear AFC connector: thick steel stub,
//         brass collar ring and a cyan contact tip
//
// This is an animated family: the scan ring is the family's one moving element,
// a slow precession that reads as a commander's steady survey of the battlefield
// — never a frantic fan. Everything else renders once and holds still.
//
// The relays' signal lights set this family's width and the AFC bay inner radius
// (0.14 world, 0.105 local) caps it: the light outer faces read 0.102 off-axis,
// under the limit, and the back claw arcs 0.08. The module's height is pinned by
// the command orb's crown — the tallest point: 0.2473 × 1.33 = 0.3289, under the
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
  HMM_CONDUIT,
  HMM_CORE,
  HMM_CRADLE,
  HMM_CRADLE_AZIMUTHS,
  HMM_POD,
  HMM_RELAY,
  HMM_RELAY_AZIMUTHS,
  HMM_SENSOR_RING,
  HMM_SENSOR_RING_SPEED_MS,
  HMM_SENSOR_RING_START_ROLL,
  HMM_SIGNAL_LIGHT,
  HMM_TOWER_TOP,
  createHiveMindParts
} from "./client-map-3d-hive-mind-parts.js";

// Uniform 33% scale-up applied to every module-local position and instance
// scale about the dock origin, matching the other AFC module families.
export const HIVE_MIND_SCALE = 1.33;
// Footprint radius of the dockable seat — below the AFC bay inner radius
// (0.14) so the module slots into the socket ring with clearance.
export const HIVE_MIND_BASE_RADIUS = 0.105 * HIVE_MIND_SCALE;
// Total height above the pad top. The highest point is the command orb's crown,
// not the scan ring or the claw frame: 0.2473 × 1.33.
export const HIVE_MIND_MODULE_HEIGHT = HMM_TOWER_TOP * HIVE_MIND_SCALE;

export type HiveMindModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createHiveMindModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): HiveMindModuleOverlay => {
  const C = maxInstances;
  const PI_2 = Math.PI / 2;
  // The part catalogue — every geometry, material and profile constant this
  // module is built from — lives in its own module. This overlay only decides
  // where each piece sits.
  const { geometries: geo, materials: mat } = createHiveMindParts();

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
  make("core", geo.core, mat.steel, 1);
  make("claw", geo.claw, mat.brass, 3);
  make("sensorRing", geo.sensorRing, mat.brass, 1);
  make("relay", geo.relay, mat.iron, 3);
  make("conduit", geo.conduit, mat.steel, 3);
  make("light", geo.light, mat.cyan, 3);
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
  const qHoleUp = new Quaternion().setFromUnitVectors(zAxis, yAxis);
  const qTilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), HMM_SENSOR_RING.tilt);
  const qRoll = new Quaternion();
  const ringQuat = new Quaternion();

  const addPiece = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, sx = 1, sz = 1, sy2 = 1, rotY = 0, rotX = 0, rotZ = 0): void => {
    const slot = slots.get(key);
    if (!slot || slot.count >= slot.cap) return;
    // Piece offsets and instance scale grow with HIVE_MIND_SCALE about the dock
    // origin, so world offsets are left unscaled by design.
    position.set(ox * HIVE_MIND_SCALE, oy * HIVE_MIND_SCALE, oz * HIVE_MIND_SCALE);
    scale.set(sx * HIVE_MIND_SCALE, sy2 * HIVE_MIND_SCALE, sz * HIVE_MIND_SCALE);
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

  // A single piece placed with an explicit orientation quaternion. The plain
  // Euler path cannot express "tilt, then roll" or "fold the hole up, then aim"
  // — those compositions live here instead and both the claw frame and the scan
  // ring ride it.
  const addComposed = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, quat: Quaternion): void => {
    const slot = slots.get(key);
    if (!slot || slot.count >= slot.cap) return;
    position.set(ox * HIVE_MIND_SCALE, oy * HIVE_MIND_SCALE, oz * HIVE_MIND_SCALE);
    scale.set(HIVE_MIND_SCALE, HIVE_MIND_SCALE, HIVE_MIND_SCALE);
    pieceMatrix.compose(position, quat, scale);
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
    addPiece("pod", wx, sy, wz, 0, HMM_POD.y, 0, 1, 1, HMM_POD.squash);
    addPiece("podBand", wx, sy, wz, 0, 0.085, 0, 1, 1, 1, 0, PI_2, 0);
  };

  // Command_Node: the faceted dark-steel orb mounted on the module's centre
  // line, braced by the three brass claw arcs that grip it from outside. Each
  // claw's arc is centered, so one shared geometry serves all three: fold the
  // hole up, then roll about the module's vertical axis to aim the arc's
  // bisector at its azimuth — the rim stays perfectly horizontal the whole way.
  const addCommandNode = (wx: number, sy: number, wz: number): void => {
    addPiece("core", wx, sy, wz, 0, HMM_CORE.y, 0);
    for (const a of HMM_CRADLE_AZIMUTHS) {
      qRoll.setFromAxisAngle(yAxis, a);
      ringQuat.copy(qRoll).multiply(qHoleUp);
      addComposed("claw", wx, sy, wz, 0, HMM_CORE.y, 0, ringQuat);
    }
  };

  // Relays: three secondary nodes at the 120° azimuths, on a lower ring than
  // the claws so they clear the frame, each piped into the orb by a thick rigid
  // conduit that reaches from the orb's surface at that height to the relay's
  // inner face, and each carrying one cyan signal light on its outward face.
  const addRelayNetwork = (wx: number, sy: number, wz: number): void => {
    for (const [i, a] of HMM_RELAY_AZIMUTHS.entries()) {
      const ux = Math.cos(a);
      const uz = Math.sin(a);
      addPiece("relay", wx, sy, wz, HMM_RELAY.radius * ux, HMM_RELAY.y, HMM_RELAY.radius * uz);
      addPiece("conduit", wx, sy, wz, HMM_CONDUIT.radius * ux, HMM_CONDUIT.y, HMM_CONDUIT.radius * uz, 1, 1, 1, a, 0, 0);
      addPiece("light", wx, sy, wz, HMM_SIGNAL_LIGHT.radius * ux, HMM_SIGNAL_LIGHT.y, HMM_SIGNAL_LIGHT.radius * uz);
    }
  };

  // Sensor_Ring: the family's one moving part. The geometry torus lies flat
  // (hole along Z); this composed orientation tips it up to ring the orb and
  // THEN precesses it about the module's vertical axis — qRoll·qTilt·qHoleUp —
  // so as `rollAz` advances the scan ring's high point rides around the orb.
  // The plain Euler path cannot express that (tilt-then-roll), so the ring is
  // composed from the three quaternions directly and carried by addComposed.
  const addSensorRing = (wx: number, sy: number, wz: number, rollAz: number): void => {
    qRoll.setFromAxisAngle(yAxis, rollAz);
    ringQuat.copy(qRoll).multiply(qTilt).multiply(qHoleUp);
    addComposed("sensorRing", wx, sy, wz, 0, HMM_SENSOR_RING.y, 0, ringQuat);
  };

  const addRearCoupling = (wx: number, sy: number, wz: number): void => {
    addPieceAlong("coupling", wx, sy, wz, -0.058, 0.085, 0, -1, 0, 0, 0.05);
    addRingAlong("couplingRing", wx, sy, wz, -0.056, 0.085, 0, 1, 0, 0);
    addPieceAlong("couplingTip", wx, sy, wz, -0.088, 0.085, 0, -1, 0, 0, 0.016);
  };

  const addModule = (wx: number, sy: number, wz: number, rollAz: number): void => {
    addSeat(wx, sy, wz);
    addPod(wx, sy, wz);
    addCommandNode(wx, sy, wz);
    addSensorRing(wx, sy, wz, rollAz);
    addRelayNetwork(wx, sy, wz);
    addRearCoupling(wx, sy, wz);
  };

  // ─── Animated asset ─────────────────────────────────────────────────
  type HmmRecord = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
  };
  const records: HmmRecord[] = [];

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
    addModule(sceneX, surfaceY, sceneZ, HMM_SENSOR_RING_START_ROLL);
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

  // The scan ring: the only piece that moves. It is re-emitted from the record
  // list at the advancing roll angle and pushed back through commit, which
  // rewrites the update range for the moving slot. Everything else is emitted
  // once at addInstance and holds still.
  const update = (nowMs: number): void => {
    const rollAz = HMM_SENSOR_RING_START_ROLL + nowMs * HMM_SENSOR_RING_SPEED_MS;
    slots.get("sensorRing")!.count = 0;
    for (const r of records) {
      yawQuat.setFromEuler(tmpEuler.set(0, -r.yaw, 0, "XYZ"));
      yawMatrix.makeRotationFromQuaternion(yawQuat);
      addSensorRing(r.x, r.y, r.z, rollAz);
      yawMatrix.identity();
    }
    commit();
  };

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMaterials) m.dispose();
  };

  return { clear, addInstance, commit, update, dispose };
};