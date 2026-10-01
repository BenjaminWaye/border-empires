// Catalyst Fabricator (CAT) module — a compact attachable AFC module that
// manufactures the advanced industrial catalysts that unlock the Umbrite Works,
// the Titanium Works and the Aether Condensers. It is a precision chemical
// fabricator rather than a miner or a refinery: three charge feeds go in at the
// top and one catalyst product comes out at the far end.
//
// Local space: +X is FORWARD — the outward radial direction of the socket (its
// `yaw`). The root sits at the socket attachment point (the pad-top center, `y`
// returned by moduleSocketAttachments). Dock it with
// addInstance(att.x, att.z, att.y, att.yaw, ...) so the output chamber faces
// away from the AFC core.
//
// Procedural hierarchy (every child is logically parented to CAT_Root at the
// bay center, yaw-aligned to face outward):
//   CAT_Root
//   ├── Seat                — dockable circular base + brass locking lip
//   ├── Pod                 — the same low blackened capsule every other family
//   │     docks with, carrying one brass band
//   ├── Drum                — THE dominant mechanism: one large ROTATING
//   │   │   multi-chamber barrel lying across the pod on the Z axis, its lower
//   │   │   half passing through the pod's crown so it is mounted through the
//   │   │   pod rather than balanced on it
//   │   ├── Chamber★3       — three thick cylindrical sections in cyan / violet
//   │   │   / ice, each its own glow and material feed
//   │   ├── Port_Arc★3      — three bright partial rings, one per chamber, the
//   │   │   ONLY thing that moves: as the rotor turns the arcs sweep around the
//   │   │   drum like the ports of a rotary fabricator
//   │   └── Partition/End_Rings — heavy brass hoops clamping the barrel between
//   │       the chambers and closing its ends
//   ├── Canisters           — three short tapered injector canisters, one at
//   │   │   each chamber's apex, feeding charge down from the top; each with a
//   │   │   brass seat collar and a nozzle spearing the shell
//   ├── Output_Chamber      — the single compact product outlet on the drum's
//   │   │   OPPOSITE side (+Z end), coaxial with the barrel, with a violet
//   │   │   product port and a pressure valve on its crown
//   └── Rear_Coupling       — one heavy rear AFC coupling: thick steel stub,
//         brass collar ring and a cyan contact tip
//
// This is the ring's first animated family. Everything about the drum except
// the port arcs is axisymmetric and can be emitted once; the three arcs are
// re-emitted every update at CAT_DRUM_START_AZIMUTH + nowMs * CAT_DRUM_SPEED_MS,
// which is how the rotation is driven and how the regression suite can see it.
//
// The drum sets this family's width and the AFC bay inner radius (0.14 world,
// 0.105 local) caps it: the widest elevated part is the ends — the end rings'
// 0.0615 outer tube reads 0.09 off-axis, under the limit. The module's height
// is pinned by the canisters, the tallest point: 0.2455 × 1.33 = 0.3265, well
// under the 0.34 ceiling.

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
  CAT_CANISTER,
  CAT_COLLAR,
  CAT_DRUM,
  CAT_DRUM_SPEED_MS,
  CAT_DRUM_START_AZIMUTH,
  CAT_END_RING,
  CAT_NOZZLE,
  CAT_OUTPUT,
  CAT_OUTPUT_COLLAR,
  CAT_PARTITION,
  CAT_POD,
  CAT_PORT,
  CAT_SEGMENT_Z,
  CAT_VALVE,
  CAT_WINDOW_OFFSET,
  createCatalystFabricatorParts
} from "./client-map-3d-catalyst-fabricator-parts.js";

// Uniform 33% scale-up applied to every module-local position and instance
// scale about the dock origin, matching the other AFC module families.
export const CATALYST_FABRICATOR_SCALE = 1.33;
// Footprint radius of the dockable seat — below the AFC bay inner radius
// (0.14) so the module slots into the socket ring with clearance.
export const CATALYST_FABRICATOR_BASE_RADIUS = 0.105 * CATALYST_FABRICATOR_SCALE;
// Total height above the pad top. The highest point is the top of the three
// feed canisters, not the drum: (0.2225 + 0.023) × 1.33.
export const CATALYST_FABRICATOR_MODULE_HEIGHT = (CAT_CANISTER.y + CAT_CANISTER.length * 0.5) * CATALYST_FABRICATOR_SCALE;

export type CatalystFabricatorModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

// Chamber and port keys, indexed by CAT_SEGMENT_Z order. The ice chamber is the
// rear (-Z) one and the violet chamber sits nearest the output at +Z.
const SEGMENT_KEYS = ["segmentIce", "segmentCyan", "segmentViolet"] as const;
const WINDOW_KEYS = ["windowIce", "windowCyan", "windowViolet"] as const;

export const createCatalystFabricatorModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): CatalystFabricatorModuleOverlay => {
  const C = maxInstances;
  const PI_2 = Math.PI / 2;
  // The part catalogue — every geometry, material and profile constant this
  // module is built from — lives in its own module. This overlay only decides
  // where each piece sits.
  const { geometries: geo, materials: mat } = createCatalystFabricatorParts();
  const segmentMats = [mat.segmentIce, mat.segmentCyan, mat.segmentViolet];
  const windowMats = [mat.windowIce, mat.windowCyan, mat.windowViolet];

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
  make("barrel", geo.barrel, mat.steel, 1);
  for (let i = 0; i < SEGMENT_KEYS.length; i += 1) make(SEGMENT_KEYS[i]!, geo.segment, segmentMats[i]!, 1);
  make("partition", geo.partition, mat.brass, 2);
  make("endRing", geo.endRing, mat.brass, 2);
  for (let i = 0; i < WINDOW_KEYS.length; i += 1) make(WINDOW_KEYS[i]!, geo.windowArc, windowMats[i]!, 1);
  make("canister", geo.canister, mat.steel, 3);
  make("canisterCollar", geo.canisterCollar, mat.brass, 3);
  make("canisterNozzle", geo.canisterNozzle, mat.pipe, 3);
  make("output", geo.output, mat.steel, 1);
  make("outputCollar", geo.outputCollar, mat.brass, 1);
  make("outputPort", geo.outputPort, mat.violet, 1);
  make("valveStem", geo.valveStem, mat.brass, 1);
  make("valveKnob", geo.valveKnob, mat.brass, 1);
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

  const addPiece = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, sx = 1, sz = 1, sy2 = 1, rotY = 0, rotX = 0, rotZ = 0): void => {
    const slot = slots.get(key);
    if (!slot || slot.count >= slot.cap) return;
    // Piece offsets and instance scale grow with CATALYST_FABRICATOR_SCALE about
    // the dock origin, so world offsets are left unscaled by design.
    position.set(ox * CATALYST_FABRICATOR_SCALE, oy * CATALYST_FABRICATOR_SCALE, oz * CATALYST_FABRICATOR_SCALE);
    scale.set(sx * CATALYST_FABRICATOR_SCALE, sy2 * CATALYST_FABRICATOR_SCALE, sz * CATALYST_FABRICATOR_SCALE);
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

  // A piece kept at its baked size, with its flat face perpendicular to a
  // direction. This is the counterpart to addPieceAlong for geometry that is
  // NOT a unit-length rod: passing such a piece's length to addPieceAlong would
  // scale a baked height by itself and crush it flat.
  const addFlatAlong = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): void => {
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
    addPiece("pod", wx, sy, wz, 0, CAT_POD.y, 0, 1, 1, CAT_POD.squash);
    addPiece("podBand", wx, sy, wz, 0, 0.085, 0, 1, 1, 1, 0, PI_2, 0);
  };

  // Drum: the barrel, the three chambers, the partition and end hoops. Every
  // one of these is axisymmetric about the barrel's Z axis, so only their
  // quarter turn to lie down appears in their matrices — the ports (emitted
  // separately) are what carries the rotation.
  const addDrum = (wx: number, sy: number, wz: number): void => {
    addPiece("barrel", wx, sy, wz, 0, CAT_DRUM.y, 0, 1, 1, 1, 0, PI_2, 0);
    for (const [i, z] of CAT_SEGMENT_Z.entries()) {
      addPiece(SEGMENT_KEYS[i]!, wx, sy, wz, 0, CAT_DRUM.y, z, 1, 1, 1, 0, PI_2, 0);
    }
    for (const z of [CAT_PARTITION.z, -CAT_PARTITION.z]) {
      addRingAlong("partition", wx, sy, wz, 0, CAT_DRUM.y, z, 0, 0, 1);
    }
    for (const z of [CAT_END_RING.z, -CAT_END_RING.z]) {
      addRingAlong("endRing", wx, sy, wz, 0, CAT_DRUM.y, z, 0, 0, 1);
    }
  };

  // The three port arcs, one per chamber, each at the rotor angle plus its own
  // fixed azimuth offset. A quarter turn lays the arc cylinder onto the drum
  // axis, and the rotY carries the sweep: the arc's geometry bisector points
  // +X, the lay-down maps geometry +X onto world +X (Rx(π/2)·Ry(φ) =
  // Rz(φ)·Rx(π/2) — the sweep about the drum axis), so the rotY angle IS the
  // world aim of the arc's centre at any rotor angle.
  const emitWindows = (wx: number, sy: number, wz: number, az: number): void => {
    for (const [i, z] of CAT_SEGMENT_Z.entries()) {
      addPiece(WINDOW_KEYS[i]!, wx, sy, wz, 0, CAT_DRUM.y, z, 1, 1, 1, az + CAT_WINDOW_OFFSET[i]!, PI_2, 0);
    }
  };

  // Canisters: three short chutes standing at each chamber's apex, feeding the
  // drum from the top. Fixed — they are the drum's feed line, not part of the
  // rotor, so the ports sweep past them as the drum turns.
  const addCanisters = (wx: number, sy: number, wz: number): void => {
    for (const z of CAT_SEGMENT_Z) {
      addPiece("canister", wx, sy, wz, 0, CAT_CANISTER.y, z);
      addRingAlong("canisterCollar", wx, sy, wz, 0, CAT_COLLAR.y, z, 0, 1, 0);
      addPiece("canisterNozzle", wx, sy, wz, 0, CAT_NOZZLE.y, z);
    }
  };

  // Output_Chamber: the single product outlet on the drum's far +Z end,
  // coaxial with the barrel, carrying a violet port and a pressure valve on its
  // crown.
  const addOutput = (wx: number, sy: number, wz: number): void => {
    addPiece("output", wx, sy, wz, 0, CAT_DRUM.y, CAT_OUTPUT.z, 1, 1, 1, 0, PI_2, 0);
    addRingAlong("outputCollar", wx, sy, wz, 0, CAT_DRUM.y, CAT_OUTPUT_COLLAR.z, 0, 0, 1);
    addPiece("outputPort", wx, sy, wz, 0, CAT_DRUM.y, CAT_PORT.z, 1, 1, 1, 0, PI_2, 0);
    const valveBase = CAT_DRUM.y + CAT_OUTPUT.radius + CAT_VALVE.lift;
    addPiece("valveStem", wx, sy, wz, 0, valveBase - CAT_VALVE.stemHeight * 0.5, CAT_OUTPUT.z);
    addPiece("valveKnob", wx, sy, wz, 0, valveBase + CAT_VALVE.stemHeight * 0.5, CAT_OUTPUT.z, 1, 1, 1, 0, PI_2, 0);
  };

  const addRearCoupling = (wx: number, sy: number, wz: number): void => {
    addPieceAlong("coupling", wx, sy, wz, -0.058, 0.085, 0, -1, 0, 0, 0.05);
    addRingAlong("couplingRing", wx, sy, wz, -0.056, 0.085, 0, 1, 0, 0);
    addFlatAlong("couplingTip", wx, sy, wz, -0.088, 0.085, 0, -1, 0, 0);
  };

  const addModule = (wx: number, sy: number, wz: number, az: number): void => {
    addSeat(wx, sy, wz);
    addPod(wx, sy, wz);
    addDrum(wx, sy, wz);
    emitWindows(wx, sy, wz, az);
    addCanisters(wx, sy, wz);
    addOutput(wx, sy, wz);
    addRearCoupling(wx, sy, wz);
  };

  // ─── Animated asset ─────────────────────────────────────────────────
  type CatRecord = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
  };
  const records: CatRecord[] = [];

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
    addModule(sceneX, surfaceY, sceneZ, CAT_DRUM_START_AZIMUTH);
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

  // The rotor: only the three port arcs move. Every other piece is emitted once
  // at addInstance, so the sweep is re-emitted from the record list and pushed
  // back through commit, which rewrites the update ranges for the moving slots.
  const update = (nowMs: number): void => {
    const az = CAT_DRUM_START_AZIMUTH + nowMs * CAT_DRUM_SPEED_MS;
    for (const key of WINDOW_KEYS) slots.get(key)!.count = 0;
    for (const r of records) {
      yawQuat.setFromEuler(tmpEuler.set(0, -r.yaw, 0, "XYZ"));
      yawMatrix.makeRotationFromQuaternion(yawQuat);
      emitWindows(r.x, r.y, r.z, az);
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