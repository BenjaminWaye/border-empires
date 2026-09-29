// Umbrite Synthesis (UMB) module — a compact attachable AFC module that
// synthesizes and stabilizes industrial-grade Umbrite. It grows dense
// violet-black material under pressure and keeps it stable: it is a machine for
// manufacturing a substance, not for mining one and not for refining feedstock.
//
// Local space: +X is FORWARD — the outward radial direction of the socket (its
// `yaw`). The root sits at the socket attachment point (the pad-top center, `y`
// returned by moduleSocketAttachments). Dock it with
// addInstance(att.x, att.z, att.y, att.yaw, ...) so the pressure dial faces
// away from the AFC core.
//
// Procedural hierarchy (every child is logically parented to UMB_Root at the bay
// center, yaw-aligned to face outward):
//   UMB_Root
//   ├── Seat                — dockable circular base + brass locking lip
//   ├── Pod                 — the same low blackened capsule every other family
//   │     docks with, carrying one brass band, squashed only far enough to
//   │     make room for the chamber lying across its shoulders
//   ├── Chamber             — THE dominant mechanism: one large HORIZONTAL
//   │   │   pressure vessel running across the pod on the Z axis, its lower
//   │   │   half passing through the pod's crown so it reads as mounted
//   │   │   through the pod rather than balanced on top of it
//   │   ├── Window          — a thick, dark translucent shell, so the core
//   │   │   inside reads as a mass suspended in pressure glass
//   │   ├── Umbrite_Core     — dense violet-black material forming inside the
//   │   │   window, a little shorter than the shell so the vessel's end walls
//   │   │   stay closed. Near-black and only faintly self-lit: it must look
//   │   │   heavy and slightly unnatural, never like a lamp
//   │   └── Compression_Rings — three heavy aged-brass hoops clamping the
//   │       barrel at its ends and its middle
//   ├── Injectors           — two compact cylinders coaxial with the barrel, one
//   │   │   at each end, feeding material inward, each with a brass end cap and
//   │   │   a low purple ring where material enters the vessel
//   ├── Pressure_Control    — one chunky assembly: a stout manifold standing on
//   │     the barrel's crown carrying a brass-bezelled dial on its forward
//   │     face, with a needle across the face
//   ├── Feed_Pipes          — two short reinforced runs lifting material from
//   │     the pod crown up into the barrel's underside, flanged where they
//   │     meet the shell
//   └── Rear_Coupling       — one heavy rear AFC coupling: thick steel stub,
//         brass collar ring and a violet contact tip
//
// Construction is a pressure synthesiser, not a furnace and not a refinery:
// there is no flame, no glowing coil bundle and no exposed emitter. The only
// light is a low contained purple at the injectors' inner rings and the dial
// face, while the material itself stays dark — the silhouette and the material
// language have to say "dense substance under pressure", and a bright core
// would say "power" instead.
//
// The chamber is what sets this family's width, and the AFC bay inner radius
// (0.14 world, 0.105 local) is what caps it: the barrel runs 0.145 long with a
// 0.03 injector at either end, so the assembly reaches 0.1025 local to a side
// and stays inside the shared dock footprint. That is why the pod keeps the
// shared 0.075 radius and the same circular dock interface as every other
// family rather than being widened to carry a longer barrel.
//
// No two pieces share a coplanar surface: the core is shorter than the shell so
// the end walls never Z-fight against it, the dial face stands proud inside its
// bezel, the compression rings and injector caps clear the surfaces they clamp,
// and the feed-pipe flanges sit off the barrel's curved skin.

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
  createUmbriteSynthesisParts,
  UMB_CHAMBER,
  UMB_CORE,
  UMB_GAUGE,
  UMB_INJECTOR,
  UMB_MANIFOLD,
  UMB_PIPE,
  UMB_POD,
  UMB_POD_CROWN
} from "./client-map-3d-umbrite-synthesis-parts.js";

// Uniform 33% scale-up applied to every module-local position and instance
// scale about the dock origin, matching the other AFC module families.
export const UMBRITE_SYNTHESIS_SCALE = 1.33;
// Footprint radius of the dockable seat — below the AFC bay inner radius
// (0.14) so the module slots into the socket ring with clearance.
export const UMBRITE_SYNTHESIS_BASE_RADIUS = 0.105 * UMBRITE_SYNTHESIS_SCALE;
// Total height above the pad top. The highest point is the pressure dial's
// brass bezel rather than the manifold cap, because the dial is mounted facing
// forward off the manifold and its ring stands taller than the manifold does —
// 0.235 × 1.33.
export const UMBRITE_SYNTHESIS_MODULE_HEIGHT = 0.235 * UMBRITE_SYNTHESIS_SCALE;

export type UmbriteSynthesisModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createUmbriteSynthesisModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): UmbriteSynthesisModuleOverlay => {
  const C = maxInstances;
  const PI_2 = Math.PI / 2;
  // The part catalogue — every geometry, material and profile constant this
  // module is built from — lives in its own module. This overlay only decides
  // where each piece sits.
  const { geometries: geo, materials: mat } = createUmbriteSynthesisParts();

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
  make("window", geo.window, mat.window, 1);
  make("umbrite", geo.umbrite, mat.umbrite, 1);
  make("chamberRing", geo.chamberRing, mat.brass, 3);
  make("injector", geo.injector, mat.steel, 2);
  make("injectorCap", geo.injectorCap, mat.brass, 2);
  make("injectorRing", geo.injectorRing, mat.violet, 2);
  make("manifold", geo.manifold, mat.steel, 1);
  make("manifoldCap", geo.manifoldCap, mat.brass, 1);
  make("gaugeBezel", geo.gaugeBezel, mat.brass, 1);
  make("gaugeFace", geo.gaugeFace, mat.violet, 1);
  make("gaugeNeedle", geo.gaugeNeedle, mat.brass, 1);
  make("pipe", geo.pipe, mat.pipe, 2);
  make("pipeFlange", geo.pipeFlange, mat.brass, 2);
  make("coupling", geo.coupling, mat.steel, 1);
  make("couplingRing", geo.couplingRing, mat.brass, 1);
  make("couplingTip", geo.couplingTip, mat.violet, 1);

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
    // Piece offsets and instance scale grow with UMBRITE_SYNTHESIS_SCALE about
    // the dock origin, so world offsets are left unscaled by design.
    position.set(ox * UMBRITE_SYNTHESIS_SCALE, oy * UMBRITE_SYNTHESIS_SCALE, oz * UMBRITE_SYNTHESIS_SCALE);
    scale.set(sx * UMBRITE_SYNTHESIS_SCALE, sy2 * UMBRITE_SYNTHESIS_SCALE, sz * UMBRITE_SYNTHESIS_SCALE);
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
    addPiece("pod", wx, sy, wz, 0, UMB_POD.y, 0, 1, 1, UMB_POD.squash);
    addPiece("podBand", wx, sy, wz, 0, 0.085, 0, 1, 1, 1, 0, PI_2, 0);
  };

  // Chamber: the horizontal pressure vessel with its core and hoops. The shell,
  // core and rings all share the barrel's Z axis, so they are laid out along Z
  // and turned a quarter turn about X to lie down.
  const addChamber = (wx: number, sy: number, wz: number): void => {
    addPiece("window", wx, sy, wz, 0, UMB_CHAMBER.y, 0, 1, 1, 1, 0, PI_2, 0);
    addPiece("umbrite", wx, sy, wz, 0, UMB_CHAMBER.y, 0, 1, 1, 1, 0, PI_2, 0);
    for (const z of [-UMB_CHAMBER.ringZ, 0, UMB_CHAMBER.ringZ]) {
      addRingAlong("chamberRing", wx, sy, wz, 0, UMB_CHAMBER.y, z, 0, 0, 1);
    }
  };

  // Injectors: one compact cylinder at each end of the barrel, coaxial with it,
  // feeding material inward. The purple ring sits on the barrel side of each
  // injector, where material enters the vessel.
  const addInjectors = (wx: number, sy: number, wz: number): void => {
    for (const side of [1, -1]) {
      const cz = UMB_INJECTOR.z * side;
      addPiece("injector", wx, sy, wz, 0, UMB_CHAMBER.y, cz, 1, 1, 1, 0, PI_2, 0);
      addRingAlong("injectorCap", wx, sy, wz, 0, UMB_CHAMBER.y, cz + UMB_INJECTOR.length * 0.5 * side, 0, 0, 1);
      addRingAlong("injectorRing", wx, sy, wz, 0, UMB_CHAMBER.y, cz - UMB_INJECTOR.length * 0.5 * side, 0, 0, 1);
    }
  };

  // Pressure_Control: a stout manifold on the barrel's crown carrying a dial
  // that faces forward, so a player reading the module from the strategy camera
  // sees the gauge rather than the back of the manifold.
  const addPressureControl = (wx: number, sy: number, wz: number): void => {
    addPiece("manifold", wx, sy, wz, 0, UMB_MANIFOLD.y, 0);
    addPiece("manifoldCap", wx, sy, wz, 0, UMB_MANIFOLD.y + UMB_MANIFOLD.height * 0.5 - 0.002, 0, 1, 1, 1, 0, PI_2, 0);
    addRingAlong("gaugeBezel", wx, sy, wz, UMB_GAUGE.x, UMB_MANIFOLD.y, 0, 1, 0, 0);
    addFlatAlong("gaugeFace", wx, sy, wz, UMB_GAUGE.faceX, UMB_MANIFOLD.y, 0, 1, 0, 0);
    // The needle lies across the dial face, angled off vertical so the gauge
    // reads as a reading rather than a blank plate.
    addPieceAlong("gaugeNeedle", wx, sy, wz, UMB_GAUGE.faceX + 0.004, UMB_MANIFOLD.y + 0.004, 0, 0.25, 0.97, 0, 0.018);
  };

  // Feed_Pipes: two short reinforced runs bracing the injectors down onto the
  // pod's shoulders. They cannot meet the barrel's underside: the vessel passes
  // THROUGH the pod's upper half, so its lower skin is buried and only its crown
  // and its overhanging ends are exposed. Anchoring the lines to the injectors
  // is both the only place they can attach and the honest read — they are what
  // carries the barrel's weight either side of the pod.
  const addFeedPipes = (wx: number, sy: number, wz: number): void => {
    for (const side of [1, -1]) {
      const innerZ = UMB_INJECTOR.z * side - UMB_INJECTOR.length * 0.5 * side;
      const footY = UMB_POD_CROWN - 0.022;
      const footX = 0.028;
      const footZ = 0.055 * side;
      const dx = footX;
      const dy = footY - (UMB_CHAMBER.y - UMB_INJECTOR.radius);
      const dz = footZ - innerZ;
      const len = Math.hypot(dx, dy, dz);
      addPieceAlong(
        "pipe",
        wx,
        sy,
        wz,
        (footX + 0) * 0.5,
        (footY + UMB_CHAMBER.y - UMB_INJECTOR.radius) * 0.5,
        (footZ + innerZ) * 0.5,
        dx,
        dy,
        dz,
        len
      );
      addRingAlong(
        "pipeFlange",
        wx,
        sy,
        wz,
        (dx / len) * 0.004,
        UMB_CHAMBER.y - UMB_INJECTOR.radius + (dy / len) * 0.004,
        innerZ + (dz / len) * 0.004,
        dx,
        dy,
        dz
      );
    }
  };

  const addRearCoupling = (wx: number, sy: number, wz: number): void => {
    addPieceAlong("coupling", wx, sy, wz, -0.058, 0.085, 0, -1, 0, 0, 0.05);
    addRingAlong("couplingRing", wx, sy, wz, -0.056, 0.085, 0, 1, 0, 0);
    addFlatAlong("couplingTip", wx, sy, wz, -0.088, 0.085, 0, -1, 0, 0);
  };

  const addModule = (wx: number, sy: number, wz: number): void => {
    addSeat(wx, sy, wz);
    addPod(wx, sy, wz);
    addChamber(wx, sy, wz);
    addInjectors(wx, sy, wz);
    addPressureControl(wx, sy, wz);
    addFeedPipes(wx, sy, wz);
    addRearCoupling(wx, sy, wz);
  };

  // ─── Static asset ───────────────────────────────────────────────────
  // This module carries no idle animation (nothing flows and the dial does not
  // sweep): it renders once and `update` is a no-op that keeps the interactive
  // harness uniform across module families.
  type UmbRecord = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
  };
  const records: UmbRecord[] = [];

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

  // No idle animation on this synthesiser: the core holds and the dial does not
  // move, with `update` kept on the overlay contract so the interactive harness
  // (per-module and AFC update loops) stays uniform across all module families.
  const update = (_nowMs: number): void => {};

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMaterials) m.dispose();
  };

  return { clear, addInstance, commit, update, dispose };
};
