// Neural Assembly Core (NAC) module — a compact attachable AFC module that
// fabricates and coordinates advanced neural-control systems for automated
// industry and manpower infrastructure. It is a machine-intelligence workbench,
// not a power plant: one large exposed spherical neural core floats above the
// pod, cradled in a brass gimbal frame and probed by four conductor arms, as if
// the AFC is writing and calibrating neural patterns into it.
//
// Local space: +X is FORWARD — the outward radial direction of the socket (its
// `yaw`). The root sits at the socket attachment point (the pad-top center, `y`
// returned by moduleSocketAttachments). Dock it with
// addInstance(att.x, att.z, att.y, att.yaw, ...) so the coupling faces the AFC
// core.
//
// Procedural hierarchy (every child is logically parented to NAC_Root at the bay
// center, yaw-aligned to face outward):
//   NAC_Root
//   ├── Seat                    — dockable circular base + brass locking lip
//   ├── Pod                     — the same low blackened capsule every other
//   │     family docks with, carrying one brass band
//   ├── Housing                 — the compact lower processor housing: a stocky
//   │   │   steel block on the pod crown with one brass clamp band, holding the
//   │   │   neural circuitry the whole head returns to
//   │   └── (Suspension_Post)   — a thin pipe column rising to the sphere
//   ├── Neural_Head             — THE dominant mechanism: one large exposed
//   │   │   spherical neural core SUSPENDED inside a brass gimbal frame above
//   │   │   the pod
//   │   ├── Sphere              — the dark smoky-glass neural core itself
//   │   ├── Pathways★3          — broad glowing cyan rings crossed over the
//   │   │   sphere (two latitudes + one meridian), reading as neural activity
//   │   ├── Gimbal_Frame        — two crossed brass hoops through the sphere's
//   │   │   centre (one in the forward plane, one across it)
//   │   └── Conductor_Arms★4    — shoulder joints on the housing flank, upper
//   │       runs up-and-out to elbows seated on the gimbal, and contact prongs
//   │       reaching inward to hover just off the sphere's surface
//   ├── Data_Conduits           — two heavy runs feeding the housing back into
//   │     the AFC low on the rear, either side of the coupling
//   └── Rear_Coupling           — one heavy rear AFC connector: thick steel stub,
//         brass collar ring and a cyan contact tip
//
// This is a static family like every other module except the Catalyst
// Fabricator: the neural-writing read comes from the silhouette — a suspended
// dark sphere in a brass gimbal, probed by four arms — not from any moving
// part, so `update` is a no-op that keeps the interactive harness uniform
// across module families.
//
// The conductor arms' elbows set this family's width and the shared AFC bay
// inner radius (0.14 world, 0.105 local) caps them: elbows read 0.064 local =
// 0.085 world, inside the limit. The module's height is pinned by the peak of
// the gimbal's outer hoop, the tallest point: 0.248 × 1.33 = 0.3298, under the
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
  NAC_ARM,
  NAC_ARM_AZIMUTHS,
  NAC_CONDUIT,
  NAC_GIMBAL,
  NAC_GLASS,
  NAC_HOUSING,
  NAC_PATHWAY,
  NAC_PATHWAY_LATITUDE_LIFT,
  NAC_POD,
  NAC_POST,
  NAC_TOWER_TOP,
  createNeuralAssemblyCoreParts
} from "./client-map-3d-neural-assembly-core-parts.js";

// Uniform 33% scale-up applied to every module-local position and instance
// scale about the dock origin, matching the other AFC module families.
export const NEURAL_ASSEMBLY_CORE_SCALE = 1.33;
// Footprint radius of the dockable seat — below the AFC bay inner radius
// (0.14) so the module slots into the socket ring with clearance.
export const NEURAL_ASSEMBLY_CORE_BASE_RADIUS = 0.105 * NEURAL_ASSEMBLY_CORE_SCALE;
// Total height above the pad top. The highest point is the peak of the gimbal's
// outer hoop over the suspended sphere, not the sphere or the arms: 0.248 ×
// 1.33.
export const NEURAL_ASSEMBLY_CORE_MODULE_HEIGHT = NAC_TOWER_TOP * NEURAL_ASSEMBLY_CORE_SCALE;

export type NeuralAssemblyCoreModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createNeuralAssemblyCoreModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): NeuralAssemblyCoreModuleOverlay => {
  const C = maxInstances;
  const PI_2 = Math.PI / 2;
  const { geometries: geo, materials: mat } = createNeuralAssemblyCoreParts();

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
  make("housing", geo.housing, mat.steel, 1);
  make("housingBand", geo.housingBand, mat.brass, 1);
  make("post", geo.post, mat.pipe, 1);
  make("sphere", geo.glass, mat.smokyGlass, 1);
  make("pathway", geo.pathway, mat.cyan, 3);
  make("gimbalOuter", geo.gimbalOuter, mat.brass, 1);
  make("gimbalInner", geo.gimbalInner, mat.brass, 1);
  make("shoulder", geo.shoulder, mat.steel, 4);
  make("upperArm", geo.upperArm, mat.pipe, 4);
  make("elbow", geo.elbow, mat.brass, 4);
  make("prong", geo.prong, mat.pipe, 4);
  make("conduit", geo.conduit, mat.pipe, 2);
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
    // Piece offsets and instance scale grow with NEURAL_ASSEMBLY_CORE_SCALE
    // about the dock origin, so world offsets are left unscaled by design.
    position.set(ox * NEURAL_ASSEMBLY_CORE_SCALE, oy * NEURAL_ASSEMBLY_CORE_SCALE, oz * NEURAL_ASSEMBLY_CORE_SCALE);
    scale.set(sx * NEURAL_ASSEMBLY_CORE_SCALE, sy2 * NEURAL_ASSEMBLY_CORE_SCALE, sz * NEURAL_ASSEMBLY_CORE_SCALE);
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
    addPiece("pod", wx, sy, wz, 0, NAC_POD.y, 0, 1, 1, NAC_POD.squash);
    addPiece("podBand", wx, sy, wz, 0, 0.085, 0, 1, 1, 1, 0, PI_2, 0);
  };

  // Housing: the compact lower processor housing on the pod crown, holding the
  // neural circuitry the arms, gimbal and conduits all return to. It reads as a
  // stocky steel control block under the floated sphere.
  const addHousing = (wx: number, sy: number, wz: number): void => {
    addPieceAlong("housing", wx, sy, wz, 0, NAC_HOUSING.y, 0, 0, 1, 0, NAC_HOUSING.length);
    addPiece("housingBand", wx, sy, wz, 0, NAC_HOUSING.y + 0.005, 0, 1, 1, 1, 0, PI_2, 0);
  };

  // Neural_Head: THE dominant mechanism — the large exposed spherical neural
  // core suspended inside a brass gimbal frame. A dark smoky-glass sphere hangs
  // on a thin post over the housing, three broad cyan pathway rings are crossed
  // over its surface (latitude, equator and meridian), and two crossed brass
  // hoops cradle it — suspended means the whole sphere clears the pod crown.
  const addNeuralHead = (wx: number, sy: number, wz: number): void => {
    const housingTop = NAC_HOUSING.y + NAC_HOUSING.length * 0.5;
    const postLength = NAC_GLASS.y - housingTop;
    addPieceAlong("post", wx, sy, wz, 0, housingTop + postLength * 0.5, 0, 0, 1, 0, postLength);
    addPiece("sphere", wx, sy, wz, 0, NAC_GLASS.y, 0);
    // The three glowing cyan pathways traced across the dark core.
    addPiece("pathway", wx, sy, wz, 0, NAC_GLASS.y, 0, 1, 1, 1, 0, PI_2, 0);
    addPiece("pathway", wx, sy, wz, 0, NAC_GLASS.y + NAC_PATHWAY_LATITUDE_LIFT, 0, 1, 1, 1, 0, PI_2, 0);
    addRingAlong("pathway", wx, sy, wz, 0, NAC_GLASS.y, 0, 0, 0, 1);
    // The brass gimbal cradling the core: one hoop in the forward plane, one
    // across it, both through the sphere's centre.
    addRingAlong("gimbalOuter", wx, sy, wz, 0, NAC_GLASS.y, 0, 0, 0, 1);
    addRingAlong("gimbalInner", wx, sy, wz, 0, NAC_GLASS.y, 0, 1, 0, 0);
  };

  // Conductor_Arms: four thick articulated arms at the cardinal azimuths. Each
  // anchors in a shoulder joint on the housing flank, runs up-and-out through an
  // elbow that seats ON the gimbal's outer hoop, and ends in a short contact
  // prong reaching back inward to hover just off the sphere's surface — the AFC
  // writing and calibrating neural patterns into the core.
  const addConductorArms = (wx: number, sy: number, wz: number): void => {
    for (const a of NAC_ARM_AZIMUTHS) {
      const ax = Math.cos(a);
      const az = Math.sin(a);
      addPiece("shoulder", wx, sy, wz, ax * NAC_ARM.shoulderR, NAC_ARM.shoulderY, az * NAC_ARM.shoulderR);
      const riseX = (NAC_ARM.upperOut - NAC_ARM.shoulderR) * ax;
      const riseY = NAC_ARM.upperY - NAC_ARM.shoulderY;
      const riseZ = (NAC_ARM.upperOut - NAC_ARM.shoulderR) * az;
      const upperLen = Math.hypot(riseX, riseY, riseZ);
      addPieceAlong(
        "upperArm",
        wx,
        sy,
        wz,
        (NAC_ARM.shoulderR + NAC_ARM.upperOut) * 0.5 * ax,
        (NAC_ARM.shoulderY + NAC_ARM.upperY) * 0.5,
        (NAC_ARM.shoulderR + NAC_ARM.upperOut) * 0.5 * az,
        riseX,
        riseY,
        riseZ,
        upperLen
      );
      addPiece("elbow", wx, sy, wz, NAC_ARM.upperOut * ax, NAC_ARM.upperY, NAC_ARM.upperOut * az);
      const diveX = (NAC_ARM.prongTip - NAC_ARM.upperOut) * ax;
      const diveZ = (NAC_ARM.prongTip - NAC_ARM.upperOut) * az;
      const prongLen = Math.hypot(diveX, diveZ);
      addPieceAlong(
        "prong",
        wx,
        sy,
        wz,
        (NAC_ARM.upperOut + NAC_ARM.prongTip) * 0.5 * ax,
        NAC_ARM.upperY,
        (NAC_ARM.upperOut + NAC_ARM.prongTip) * 0.5 * az,
        diveX,
        0,
        diveZ,
        prongLen
      );
    }
  };

  // Data_Conduits: two heavy runs feeding the neural housing back into the AFC
  // low on the rear, either side of the coupling.
  const addDataConduits = (wx: number, sy: number, wz: number): void => {
    for (const side of [1, -1]) {
      const dx = NAC_CONDUIT.top.x - NAC_CONDUIT.foot.x;
      const dy = NAC_CONDUIT.top.y - NAC_CONDUIT.foot.y;
      const len = Math.hypot(dx, dy);
      addPieceAlong(
        "conduit",
        wx,
        sy,
        wz,
        (NAC_CONDUIT.foot.x + NAC_CONDUIT.top.x) * 0.5,
        (NAC_CONDUIT.foot.y + NAC_CONDUIT.top.y) * 0.5,
        NAC_CONDUIT.z * side,
        dx,
        dy,
        0,
        len
      );
    }
  };

  const addRearCoupling = (wx: number, sy: number, wz: number): void => {
    addPieceAlong("coupling", wx, sy, wz, -0.058, 0.085, 0, -1, 0, 0, 0.05);
    addRingAlong("couplingRing", wx, sy, wz, -0.056, 0.085, 0, 1, 0, 0);
    addPieceAlong("couplingTip", wx, sy, wz, -0.088, 0.085, 0, -1, 0, 0, 0.016);
  };

  const addModule = (wx: number, sy: number, wz: number): void => {
    addSeat(wx, sy, wz);
    addPod(wx, sy, wz);
    addHousing(wx, sy, wz);
    addNeuralHead(wx, sy, wz);
    addConductorArms(wx, sy, wz);
    addDataConduits(wx, sy, wz);
    addRearCoupling(wx, sy, wz);
  };

  // ─── Static asset ───────────────────────────────────────────────────
  // This module carries no idle animation (the neural-writing read comes from
  // its silhouette — a suspended dark sphere in a curved brass gimbal, probed
  // by four arms — not from any moving part): it renders once and `update` is a
  // no-op that keeps the interactive harness uniform across module families.
  type NacRecord = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
  };
  const records: NacRecord[] = [];

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

  // No idle animation on this neural assembler: nothing sweeps and nothing
  // pulses, with `update` kept on the overlay contract so the interactive
  // harness (per-module and AFC update loops) stays uniform across all module
  // families.
  const update = (_nowMs: number): void => {};

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMaterials) m.dispose();
  };

  return { clear, addInstance, commit, update, dispose };
};