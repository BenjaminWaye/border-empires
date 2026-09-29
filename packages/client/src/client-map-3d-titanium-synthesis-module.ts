// Titanium Synthesis (TIT) module — a compact attachable AFC module that
// synthesizes high-grade titanium feedstock for industrial production. It
// CREATES the titanium material itself, under heat and pressure, rather than
// shaping stock that already exists.
//
// Local space: +X is FORWARD — the outward radial direction of the socket (its
// `yaw`). The root sits at the socket attachment point (the pad-top center, `y`
// returned by moduleSocketAttachments). Dock it with
// addInstance(att.x, att.z, att.y, att.yaw, ...) so the viewing slit faces
// away from the AFC core.
//
// Procedural hierarchy (every child is logically parented to TIT_Root at the bay
// center, yaw-aligned to face outward):
//   TIT_Root
//   ├── Seat                — dockable circular base + brass locking lip
//   ├── Pod                 — the same low blackened capsule every other family
//   │   docks with, carrying one brass band, only lightly squashed because a
//   │   vertical crucible needs clearance, not headroom
//   ├── Crucible            — THE dominant mechanism: one large VERTICAL pressure
//   │   │   vessel rising from the pod's centre, its belly sunk well below the
//   │   │   pod crown so it is cast into the pod rather than balanced on it
//   │   ├── Compression_Bands — three broad aged-brass hoops up the vessel, the
//   │   │   strongest read in the silhouette
//   │   ├── Cap_Ring         — a heavy brass ring closing the vessel's mouth
//   │   ├── Viewing_Slit     — a narrow reinforced window up the front face
//   │   │   showing the white-hot interior: titanium forming under extreme
//   │   │   heat. This is the ONE genuinely bright surface in the ring
//   │   └── Cyan_Collar      — a small ring where the vessel meets the pod, the
//   │       family's restrained AFC power accent
//   ├── Injectors           — two opposing assemblies at the crucible's base,
//   │   │   angled slightly upward so their noses climb into the lower flank
//   │   ├── Pressure_Valves  — one stub and handwheel on each injector
//   │   └── Feed_Pipes       — one short heavy run per injector, carrying charge
//   │       up off the pod's shoulder
//   └── Rear_Coupling       — one heavy rear AFC coupling: thick steel stub,
//         brass collar ring and a cyan contact tip
//
// Construction is a pressure crucible, not a forge and not a foundry: the
// vessel is closed and heavily banded, the heat is seen only as a thin
// incandescent line through a slit, and there is no open bowl, no exposed pool
// and no spill. That is the whole separation from the Titanium Forge Module —
// the Forge is wide, open and molten at the top; this is tall, sealed and hot
// only where you can see a seam of it.
//
// This is the ring's only tall, narrow family, and that inverts which constraint
// binds. Every other family spreads its mechanism sideways and is capped by the
// bay inner radius (0.14 world, 0.105 local); here the crucible is slim in
// radius (0.045) and the binding limit is the module height cap, at the cap
// ring's top — 0.24 × 1.33 = 0.3192, under the 0.34 ceiling.

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
  createTitaniumSynthesisParts,
  podTopAt,
  TIT_BAND,
  TIT_CAP,
  TIT_CRUCIBLE,
  TIT_INJECTOR,
  TIT_PIPE,
  TIT_POD,
  TIT_SLIT,
  TIT_VALVE
} from "./client-map-3d-titanium-synthesis-parts.js";

// Uniform 33% scale-up applied to every module-local position and instance
// scale about the dock origin, matching the other AFC module families.
export const TITANIUM_SYNTHESIS_SCALE = 1.33;
// Footprint radius of the dockable seat — below the AFC bay inner radius
// (0.14) so the module slots into the socket ring with clearance.
export const TITANIUM_SYNTHESIS_BASE_RADIUS = 0.105 * TITANIUM_SYNTHESIS_SCALE;
// Total height above the pad top. The highest point is the crucible's cap ring,
// which sits above the vessel's mouth: (0.238 + 0.0095) × 1.33.
export const TITANIUM_SYNTHESIS_MODULE_HEIGHT = (TIT_CAP.y + TIT_CAP.tube) * TITANIUM_SYNTHESIS_SCALE;

export type TitaniumSynthesisModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createTitaniumSynthesisModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): TitaniumSynthesisModuleOverlay => {
  const C = maxInstances;
  const PI_2 = Math.PI / 2;
  // The part catalogue — every geometry, material and profile constant this
  // module is built from — lives in its own module. This overlay only decides
  // where each piece sits.
  const { geometries: geo, materials: mat } = createTitaniumSynthesisParts();

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
  make("crucible", geo.crucible, mat.steel, 1);
  make("crucibleBand", geo.crucibleBand, mat.brass, 3);
  make("capRing", geo.capRing, mat.brass, 1);
  make("collar", geo.collar, mat.cyan, 1);
  make("slitFrame", geo.slitFrame, mat.steel, 1);
  make("slitGlow", geo.slitGlow, mat.whiteHot, 1);
  make("slitEdge", geo.slitEdge, mat.brass, 2);
  make("injector", geo.injector, mat.steel, 2);
  make("injectorBand", geo.injectorBand, mat.brass, 2);
  make("valveStem", geo.valveStem, mat.brass, 2);
  make("valveKnob", geo.valveKnob, mat.brass, 2);
  make("pipe", geo.feedPipe, mat.pipe, 2);
  make("pipeFlange", geo.feedFlange, mat.brass, 2);
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
    // Piece offsets and instance scale grow with TITANIUM_SYNTHESIS_SCALE about
    // the dock origin, so world offsets are left unscaled by design.
    position.set(ox * TITANIUM_SYNTHESIS_SCALE, oy * TITANIUM_SYNTHESIS_SCALE, oz * TITANIUM_SYNTHESIS_SCALE);
    scale.set(sx * TITANIUM_SYNTHESIS_SCALE, sy2 * TITANIUM_SYNTHESIS_SCALE, sz * TITANIUM_SYNTHESIS_SCALE);
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
    addPiece("pod", wx, sy, wz, 0, TIT_POD.y, 0, 1, 1, TIT_POD.squash);
    addPiece("podBand", wx, sy, wz, 0, 0.085, 0, 1, 1, 1, 0, PI_2, 0);
  };

  // Crucible: the vertical vessel with its three broad hoops, its cap ring, its
  // cyan collar and the slit window. The hoops, cap and collar are tori around
  // the vertical axis, so each is laid flat — a torus's hole already runs along
  // its own Z, so a band around a standing vessel is a quarter turn about X.
  const addCrucible = (wx: number, sy: number, wz: number): void => {
    addPiece("crucible", wx, sy, wz, 0, TIT_CRUCIBLE.y, 0);
    for (const y of [TIT_BAND.y0, TIT_BAND.y1, TIT_BAND.y2]) {
      addRingAlong("crucibleBand", wx, sy, wz, 0, y, 0, 0, 1, 0);
    }
    addRingAlong("capRing", wx, sy, wz, 0, TIT_CAP.y, 0, 0, 1, 0);
    addRingAlong("collar", wx, sy, wz, 0, TIT_CRUCIBLE.y - TIT_CRUCIBLE.height * 0.5 + 0.004, 0, 0, 1, 0);
    addPiece("slitFrame", wx, sy, wz, TIT_SLIT.frameX, TIT_SLIT.y, 0);
    addPiece("slitGlow", wx, sy, wz, TIT_SLIT.glowX, TIT_SLIT.y, 0);
    for (const side of [1, -1]) {
      addPiece("slitEdge", wx, sy, wz, TIT_SLIT.edgeX, TIT_SLIT.y, TIT_SLIT.edgeGap * side);
    }
  };

  // The components of a tilted injector's unit axis, used to walk from the
  // injector's centre to its ends. `distance` is signed along the axis, so a
  // negative distance walks toward the outer end.
  const axisDy = (distance: number): number => {
    const len = Math.hypot(TIT_INJECTOR.rise, 1);
    return (TIT_INJECTOR.rise / len) * distance;
  };
  const axisDz = (side: number, distance: number): number => {
    const len = Math.hypot(TIT_INJECTOR.rise, 1);
    return (-side / len) * distance;
  };

  // Injectors: two opposing assemblies at the crucible's base, each angled
  // slightly upward so its nose climbs into the vessel's lower flank. Their
  // inner ends deliberately overlap the shell — a visible butt joint would read
  // as two loose barrels parked beside a vessel, whereas the overlap reads as
  // nozzles driven into it. Each carries a brass band near its outer end and a
  // stubbed pressure valve with a handwheel on top, so the pair is legibly
  // valved rather than just symmetric.
  const addInjectors = (wx: number, sy: number, wz: number): void => {
    for (const side of [1, -1]) {
      const cz = TIT_INJECTOR.z * side;
      // The body is a Y-axis cylinder, so it is aimed with eulerFromDir (which
      // turns Y onto the axis). Its axis points inward and upward: from the
      // outer end (low and wide) to the inner end (high and narrow).
      const axis = eulerFromDir(0, TIT_INJECTOR.rise, -side);
      addPiece("injector", wx, sy, wz, 0, TIT_INJECTOR.y, cz, 1, 1, 1, axis.ry, axis.rx, axis.rz);
      // Band around the body, three quarters of the way out toward the outer end.
      const band = TIT_INJECTOR.length * 0.5 * 0.7;
      addRingAlong(
        "injectorBand",
        wx,
        sy,
        wz,
        0,
        TIT_INJECTOR.y + axisDy(-band),
        cz + axisDz(side, -band),
        0,
        TIT_INJECTOR.rise,
        -side
      );
      // Valve: a short brass stub rising from the injector's back, topped with a
      // handwheel lying flat, like every other wheel in the ring.
      const valveBase = TIT_INJECTOR.y + TIT_INJECTOR.radius + TIT_VALVE.lift;
      addPiece("valveStem", wx, sy, wz, 0, valveBase - TIT_VALVE.stemHeight * 0.5, cz);
      addPiece("valveKnob", wx, sy, wz, 0, valveBase + TIT_VALVE.stemHeight * 0.5, cz, 1, 1, 1, 0, PI_2, 0);
    }
  };

  // Feed_Pipes: one short heavy run per injector, lifting charge up off the pod's
  // shoulder into the injector's underside. They have to land on the pod's
  // CURVED shoulder, so the foot height comes from the pod's own surface
  // function — a flat guessed height would float the pipe or bury its end.
  const addFeedPipes = (wx: number, sy: number, wz: number): void => {
    for (const side of [1, -1]) {
      const cz = TIT_INJECTOR.z * side;
      const topX = 0;
      const topY = TIT_INJECTOR.y - TIT_INJECTOR.radius + 0.002;
      const topZ = cz;
      const footX = 0.02;
      const footZ = 0.058 * side;
      const footY = podTopAt(Math.hypot(footX, footZ)) + 0.001;
      const dx = topX - footX;
      const dy = topY - footY;
      const dz = topZ - footZ;
      const len = Math.hypot(dx, dy, dz);
      addPieceAlong("pipe", wx, sy, wz, (topX + footX) * 0.5, (topY + footY) * 0.5, (topZ + footZ) * 0.5, dx, dy, dz, len);
      addRingAlong(
        "pipeFlange",
        wx,
        sy,
        wz,
        (topX + footX) * 0.5 + (dx / len) * (len * 0.5 - 0.005),
        (topY + footY) * 0.5 + (dy / len) * (len * 0.5 - 0.005),
        (topZ + footZ) * 0.5 + (dz / len) * (len * 0.5 - 0.005),
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
    addCrucible(wx, sy, wz);
    addInjectors(wx, sy, wz);
    addFeedPipes(wx, sy, wz);
    addRearCoupling(wx, sy, wz);
  };

  // ─── Static asset ───────────────────────────────────────────────────
  // This module carries no idle animation (nothing flows, the valves do not
  // turn and the slit does not pulse): it renders once and `update` is a no-op
  // that keeps the interactive harness uniform across module families.
  type TitRecord = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
  };
  const records: TitRecord[] = [];

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

  // No idle animation on this synthesiser: the crucible holds its charge and the
  // valves do not move, with `update` kept on the overlay contract so the
  // interactive harness (per-module and AFC update loops) stays uniform across
  // all module families.
  const update = (_nowMs: number): void => {};

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMaterials) m.dispose();
  };

  return { clear, addInstance, commit, update, dispose };
};
