// Hive Mind II (HMM2) module — the upgraded evolution of the Hive Mind AFC
// module, an attachable module that coordinates an autonomous military command
// network for Thunder Bastions. Command is now split across TWO coordinated
// minds: two dark metallic command cores stand side by side above the pod
// inside a shared brass gimbal frame, linked by a thick glowing
// synchronization bridge. A broad flat brass signal ring girdles the pair and
// rotates slowly about the module's vertical axis, three brass teeth on its
// outer edge making the spin legible, and four relay nodes sit symmetrically at
// the 45° diagonals, each piped into its own nearest core by a short rigid
// conduit and marked with a restrained cyan signal light. A cyan pulse slides
// along the bridge — the "both minds agree" heartbeat.
//
// Local space: +X is FORWARD — the outward radial direction of the socket (its
// `yaw`). The root sits at the socket attachment point (the pad-top center, `y`
// returned by moduleSocketAttachments). Dock it with
// addInstance(att.x, att.z, att.y, att.yaw, ...) so the twin cores face away
// from the AFC core.
//
// Procedural hierarchy (every child is logically parented to HMM2_Root at the
// bay center, yaw-aligned to face outward):
//   HMM2_Root
//   ├── Seat                — dockable circular base + brass locking lip
//   ├── Pod                 — the same low blackened capsule every other family
//   │     docks with, carrying one brass band
//   ├── Command_Assembly    — THE dominant mechanism: the twin command cores
//   │   │   standing side by side along Z, cradled in the brass gimbal frame
//   │   ├── Twin_Cores★2    — two identical faceted dark-steel orbs, the
//   │   │   module's tallest point (two coordinated minds)
//   │   ├── Gimbal★2        — the brass crescent cradles under them
//   │   ├── Gimbal_Spine    — the ONE central brass spine rising through the
//   │   │   gap between the pair into the bridge underside: both orbs hang on a
//   │   │   single shared brass frame
//   │   ├── Bridge          — the thick dark-steel synchronization slab linking
//   │   │   the cores across the seam
//   │   ├── Pulse           — the cyan command pulse sliding along the bridge
//   │   │   top (the family's one other moving part)
//   │   ├── Signal_Ring     — the broad flat brass ring girdling the pair,
//   │   │   rotating slowly about the vertical axis
//   │   └── Teeth★3         — brass teeth on the ring's outer edge that make
//   │       its rotation legible
//   ├── Relays★4            — four secondary nodes at the 45° diagonals, below
//   │   │   the ring, each with a cyan signal light on its outer face
//   │   └── Conduits★4      — short rigid dark-steel rods piping each relay into
//   │       its own nearest core: information flows in, commands flow back out
//   └── Rear_Coupling       — one heavy rear AFC connector: thick steel stub,
//         brass collar ring and a cyan contact tip
//
// This is an animated family: the signal ring's teeth precess it and the bridge
// pulse slides — the ring itself is a flat torus, rotationally symmetric about
// its spin axis, so only the teeth and the pulse move. Everything else renders
// once and holds still.
//
// The teeth set this family's width and the AFC bay inner radius (0.14 world)
// caps it: the teeth's outer faces read 0.1015 local (0.135 world), under the
// limit, and the signal ring 0.133. The module's height is pinned by the twin
// cores' crown — the tallest point: 0.2255 × 1.33 = 0.2999, under the 0.34
// ceiling.

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
  HMM2_BRIDGE,
  HMM2_CONDUIT,
  HMM2_CORE,
  HMM2_GIMBAL,
  HMM2_GIMBAL_SPINE,
  HMM2_POD,
  HMM2_PULSE,
  HMM2_RELAY,
  HMM2_RELAY_AZIMUTHS,
  HMM2_RING,
  HMM2_RING_SPEED_MS,
  HMM2_RING_START_ROLL,
  HMM2_SIGNAL_LIGHT,
  HMM2_TOOTH,
  HMM2_TOOTH_COUNT,
  HMM2_TOWER_TOP,
  HMM2_TWIN,
  createHiveMindIiParts
} from "./client-map-3d-hive-mind-ii-parts.js";

// Uniform 33% scale-up applied to every module-local position and instance
// scale about the dock origin, matching the other AFC module families.
export const HIVE_MIND_II_SCALE = 1.33;
// Footprint radius of the dockable seat — below the AFC bay inner radius
// (0.14) so the module slots into the socket ring with clearance.
export const HIVE_MIND_II_BASE_RADIUS = 0.105 * HIVE_MIND_II_SCALE;
// Total height above the pad top. The highest point is the twin cores' crown,
// not the signal ring or the bridge: 0.2255 × 1.33.
export const HIVE_MIND_II_MODULE_HEIGHT = HMM2_TOWER_TOP * HIVE_MIND_II_SCALE;

export type HiveMindIiModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createHiveMindIiModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): HiveMindIiModuleOverlay => {
  const C = maxInstances;
  const PI_2 = Math.PI / 2;
  const TWO_PI_OVER_3 = (Math.PI * 2) / 3;
  // The part catalogue — every geometry, material and profile constant this
  // module is built from — lives in its own module. This overlay only decides
  // where each piece sits.
  const { geometries: geo, materials: mat } = createHiveMindIiParts();

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
  make("core", geo.core, mat.steel, 2);
  make("bridge", geo.bridge, mat.steel, 1);
  make("pulse", geo.pulse, mat.cyan, 1);
  make("gimbal", geo.gimbal, mat.brass, 2);
  make("gimbalSpine", geo.gimbalSpine, mat.brass, 1);
  make("ring", geo.ring, mat.brass, 1);
  make("tooth", geo.tooth, mat.brass, HMM2_TOOTH_COUNT);
  make("relay", geo.relay, mat.iron, HMM2_RELAY_AZIMUTHS.length);
  make("conduit", geo.conduit, mat.steel, HMM2_RELAY_AZIMUTHS.length);
  make("light", geo.light, mat.cyan, HMM2_RELAY_AZIMUTHS.length);
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
  const qRoll = new Quaternion();
  const ringQuat = new Quaternion();

  const addPiece = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, sx = 1, sz = 1, sy2 = 1, rotY = 0, rotX = 0, rotZ = 0): void => {
    const slot = slots.get(key);
    if (!slot || slot.count >= slot.cap) return;
    // Piece offsets and instance scale grow with HIVE_MIND_II_SCALE about the
    // dock origin, so world offsets are left unscaled by design.
    position.set(ox * HIVE_MIND_II_SCALE, oy * HIVE_MIND_II_SCALE, oz * HIVE_MIND_II_SCALE);
    scale.set(sx * HIVE_MIND_II_SCALE, sy2 * HIVE_MIND_II_SCALE, sz * HIVE_MIND_II_SCALE);
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

  // A single piece placed with an explicit orientation quaternion.
  const addComposed = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, quat: Quaternion): void => {
    const slot = slots.get(key);
    if (!slot || slot.count >= slot.cap) return;
    position.set(ox * HIVE_MIND_II_SCALE, oy * HIVE_MIND_II_SCALE, oz * HIVE_MIND_II_SCALE);
    scale.set(HIVE_MIND_II_SCALE, HIVE_MIND_II_SCALE, HIVE_MIND_II_SCALE);
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
    addPiece("pod", wx, sy, wz, 0, HMM2_POD.y, 0, 1, 1, HMM2_POD.squash);
    addPiece("podBand", wx, sy, wz, 0, 0.085, 0, 1, 1, 1, 0, PI_2, 0);
  };

  // Command_Assembly: the two faceted dark-steel cores standing side by side
  // along the module's Z axis, each cradled in a flat brass crescent at its own
  // z-plane, joined by the thick dark-steel synchronization bridge. One central
  // brass spine threads the gap between the pair and runs from the pod crown up
  // through the bridge underside — the shared member that makes the whole frame
  // one mechanism.
  const addCommandAssembly = (wx: number, sy: number, wz: number): void => {
    addPiece("core", wx, sy, wz, 0, HMM2_TWIN.y, HMM2_TWIN.dz);
    addPiece("core", wx, sy, wz, 0, HMM2_TWIN.y, -HMM2_TWIN.dz);
    ringQuat.copy(qHoleUp);
    addComposed("gimbal", wx, sy, wz, 0, HMM2_GIMBAL.y, HMM2_TWIN.dz, ringQuat);
    addComposed("gimbal", wx, sy, wz, 0, HMM2_GIMBAL.y, -HMM2_TWIN.dz, ringQuat);
    const spineY = (HMM2_GIMBAL_SPINE.y0 + HMM2_GIMBAL_SPINE.y1) / 2;
    const spineLen = HMM2_GIMBAL_SPINE.y1 - HMM2_GIMBAL_SPINE.y0;
    addPiece("gimbalSpine", wx, sy, wz, 0, spineY, 0, 1, 1, spineLen);
    addPiece("bridge", wx, sy, wz, 0, HMM2_TWIN.y, 0);
    // The signal ring itself is flat (a torus is rotationally symmetric about
    // its spin axis), so it is placed once and never re-emitted — only its
    // teeth move. qHoleUp stands the torus up so it girdles the cores.
    ringQuat.copy(qHoleUp);
    addComposed("ring", wx, sy, wz, 0, HMM2_RING.y, 0, ringQuat);
  };

  // Signal_Ring teeth: the ring's rotation is made legible by three brass
  // teeth orbiting on its outer edge at the advancing roll angle.
  const addSignalRingTeeth = (wx: number, sy: number, wz: number, rollAz: number): void => {
    for (let k = 0; k < HMM2_TOOTH_COUNT; k += 1) {
      const a = rollAz + k * TWO_PI_OVER_3;
      addPiece("tooth", wx, sy, wz, Math.cos(a) * HMM2_TOOTH.radius, HMM2_TOOTH.y, Math.sin(a) * HMM2_TOOTH.radius);
    }
  };

  // The bridge's cyan pulse: a restrained signal sliding along the bridge top,
  // reversing at each end of the visible seam so the two minds read as linked.
  const addBridgePulse = (wx: number, sy: number, wz: number, nowMs: number): void => {
    const pulseZ = HMM2_PULSE.travel * Math.sin(nowMs * HMM2_PULSE.speed);
    addPiece("pulse", wx, sy, wz, 0, HMM2_PULSE.y, pulseZ);
  };

  // Relays: four secondary nodes at the 45° diagonal azimuths, below the ring,
  // each piped into its OWN nearest core (the core on the relay's Z side) by a
  // short rigid conduit that reaches from the relay centre to the core centre,
  // and each carrying one cyan signal light on its outward face.
  const addRelayNetwork = (wx: number, sy: number, wz: number): void => {
    for (const a of HMM2_RELAY_AZIMUTHS) {
      const ux = Math.cos(a);
      const uz = Math.sin(a);
      const relayX = HMM2_RELAY.radius * ux;
      const relayZ = HMM2_RELAY.radius * uz;
      const coreZ = Math.sign(uz) * HMM2_TWIN.dz;
      addPiece("relay", wx, sy, wz, relayX, HMM2_RELAY.y, relayZ);
      const dx = 0 - relayX;
      const dy = HMM2_TWIN.y - HMM2_RELAY.y;
      const dz = coreZ - relayZ;
      const len = Math.hypot(dx, dy, dz);
      // Centred on the midpoint between the relay and its paired core so the
      // whole span is covered, both ends embedding into their bodies.
      addPieceAlong("conduit", wx, sy, wz, relayX / 2, (HMM2_RELAY.y + HMM2_TWIN.y) / 2, (relayZ + coreZ) / 2, dx, dy, dz, len);
      addPiece("light", wx, sy, wz, HMM2_SIGNAL_LIGHT.radius * ux, HMM2_SIGNAL_LIGHT.y, HMM2_SIGNAL_LIGHT.radius * uz);
    }
  };

  const addRearCoupling = (wx: number, sy: number, wz: number): void => {
    addPieceAlong("coupling", wx, sy, wz, -0.058, 0.085, 0, -1, 0, 0, 0.05);
    addRingAlong("couplingRing", wx, sy, wz, -0.056, 0.085, 0, 1, 0, 0);
    addPieceAlong("couplingTip", wx, sy, wz, -0.088, 0.085, 0, -1, 0, 0, 0.016);
  };

  const addModule = (wx: number, sy: number, wz: number, rollAz: number, nowMs: number): void => {
    addSeat(wx, sy, wz);
    addPod(wx, sy, wz);
    addCommandAssembly(wx, sy, wz);
    addSignalRingTeeth(wx, sy, wz, rollAz);
    addBridgePulse(wx, sy, wz, nowMs);
    addRelayNetwork(wx, sy, wz);
    addRearCoupling(wx, sy, wz);
  };

  // ─── Animated asset ─────────────────────────────────────────────────
  type Hmm2Record = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
  };
  const records: Hmm2Record[] = [];

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
    addModule(sceneX, surfaceY, sceneZ, HMM2_RING_START_ROLL, 0);
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

  // The moving parts — the ring's teeth (orbiting at the advancing roll) and
  // the bridge pulse (sliding along its seam). They are re-emitted from the
  // record list and pushed back through commit, which rewrites the update ranges
  // for the moving slots. The ring itself and everything else are emitted once
  // at addInstance and hold still.
  const update = (nowMs: number): void => {
    const rollAz = HMM2_RING_START_ROLL + nowMs * HMM2_RING_SPEED_MS;
    slots.get("tooth")!.count = 0;
    slots.get("pulse")!.count = 0;
    for (const r of records) {
      yawQuat.setFromEuler(tmpEuler.set(0, -r.yaw, 0, "XYZ"));
      yawMatrix.makeRotationFromQuaternion(yawQuat);
      addSignalRingTeeth(r.x, r.y, r.z, rollAz);
      addBridgePulse(r.x, r.y, r.z, nowMs);
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