// Matterwright Retort (MWR) module — a compact attachable AFC module that
// refines unstable matter and transmutes aether-infused materials into usable
// industrial compounds. The world's slow alchemist: it heats, separates,
// condenses and recombines feedstock, it does not generate power.
//
// Local space: +X is FORWARD — the outward radial direction of the socket (its
// `yaw`). The root sits at the socket attachment point (the pad-top center, `y`
// returned by moduleSocketAttachments). Dock it with
// addInstance(att.x, att.z, att.y, att.yaw, ...) so the feed port faces away
// from the AFC core.
//
// Procedural hierarchy (every child is logically parented to MWR_Root at the bay
// center, yaw-aligned to face outward):
//   MWR_Root
//   ├── Seat                — dockable circular base + brass locking lip
//   ├── Pod                 — a very low, wide blackened pod (squatter than the
//   │     other families) carrying one brass band, flattened to buy the
//   │     headroom the oversized retort needs
//   ├── Retort              — THE dominant mechanism: one oversized squat
//   │   │   pressure chamber, a wide low ellipsoid whose width (0.164) beats
//   │   │   the pod's own 0.15 so it reads as the module's head from a
//   │   │   strategy camera
//   │   ├── Neck_Collar      — thick brass collar clamping the vessel to the
//   │   │     pod crown, seated so the vessel's belly is buried in the pod
//   │   ├── Bands + Seam     — two thick aged-brass hoops with a narrow
//   │   │     glowing violet reaction seam between them, sunk into the
//   │   │     groove so the pressure light reads as leaking through a
//   │   │     reinforced joint rather than painted on
//   │   ├── Window           — one small reinforced porthole on the front
//   │   │     flank, a dim violet sight-glass inside a brass bezel
//   │   └── Pressure_Valve   — one chunky valve assembly: a stout stem out of
//   │         the vessel's upper flank carrying a brass handwheel with four
//   │         spokes, angled up so it stays inside the height cap
//   ├── Condensers          — two SMALLER dark steel cylinders standing on the
//   │   │   pod's shoulders, one to each side: brass foot and cap rings, one
//   │   │   dim violet sight-glass band each
//   ├── Process_Pipes       — two short heavy pipes leaving the vessel's lower
//   │   │   flank and dropping into the condensers' caps, each with a brass
//   │   │   flange where it breaks the vessel's skin
//   ├── Feed_Port           — one reinforced intake on the front-lower flank: a
//   │   │   brass funnel with a heavy beaded rim, braced down onto the pod
//   │   │   crown, where raw material enters the system
//   └── Rear_Coupling       — one heavy rear AFC coupling: thick steel stub,
//         brass collar ring and a violet contact tip
//
// Construction is an alchemical still, not a reactor: the glow is one narrow
// seam around the vessel's waist plus small sight-glasses, never a single
// exposed emitter or coil bundle, so the silhouette says pressure and
// refinement rather than power generation. The material language deliberately
// shifts off the cyan of the power families to a cyan-violet reaction glow —
// violet is the aether reacting, not aether being spent as energy.
//
// The retort is the reason this family's pod is the flattest of all. The
// shared dock envelope caps a module at 0.34 world units (0.256 local) and the
// oversized vessel alone wants ~0.10 local of the 0.256, so the pod is
// squashed to 0.68 on Y — keeping the shared 0.075 radius footprint, the same
// circular dock interface and the same blackened-iron/aged-brass language as
// every other family.
//
// No two pieces share a coplanar surface: the seam sits in the groove between
// the two brass hoops, the porthole glass stands proud inside its bezel, the
// window and valve break the vessel's curved skin, and the pipe flanges and
// feed-port beaded rim sit clear of the surfaces they join — otherwise the
// seams Z-fight into black line artifacts.

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
  createMatterwrightRetortParts,
  MWR_COND,
  MWR_POD,
  MWR_POD_CROWN,
  MWR_RETORT,
  MWR_RETORT_HALF,
  MWR_VALVE,
  MWR_VALVE_DIR,
  MWR_WHEEL_U,
  MWR_WHEEL_V
} from "./client-map-3d-matterwright-retort-parts.js";

// Uniform 33% scale-up applied to every module-local position and instance
// scale about the dock origin, matching the other AFC module families.
export const MATTERWRIGHT_RETORT_SCALE = 1.33;
// Footprint radius of the dockable seat — below the AFC bay inner radius
// (0.14) so the module slots into the socket ring with clearance.
export const MATTERWRIGHT_RETORT_BASE_RADIUS = 0.105 * MATTERWRIGHT_RETORT_SCALE;
// Total height above the pad top (the pressure valve's handwheel rim), which
// is the highest point on the module — 0.241 × 1.33.
export const MATTERWRIGHT_RETORT_MODULE_HEIGHT = 0.241 * MATTERWRIGHT_RETORT_SCALE;

export type MatterwrightRetortModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createMatterwrightRetortModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): MatterwrightRetortModuleOverlay => {
  const C = maxInstances;
  const PI_2 = Math.PI / 2;
  // The part catalogue — every geometry, material and profile constant this
  // module is built from — lives in its own module. This overlay only decides
  // where each piece sits.
  const { geometries: geo, materials: mat } = createMatterwrightRetortParts();

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
  make("neckCollar", geo.neckCollar, mat.brass, 1);
  make("retort", geo.retort, mat.steel, 1);
  make("bandLower", geo.bandLower, mat.brass, 1);
  make("seam", geo.seam, mat.violetBright, 1);
  make("bandUpper", geo.bandUpper, mat.brass, 1);
  make("capKnob", geo.capKnob, mat.brass, 1);
  make("windowBezel", geo.windowBezel, mat.brass, 1);
  make("windowGlass", geo.windowGlass, mat.violet, 1);
  make("valveStem", geo.valveStem, mat.steel, 1);
  make("valveWheel", geo.valveWheel, mat.brass, 1);
  make("valveHub", geo.valveHub, mat.brass, 1);
  make("valveSpoke", geo.valveSpoke, mat.brass, 4);
  make("condBody", geo.condBody, mat.steel, 2);
  make("condRing", geo.condRing, mat.brass, 4);
  make("condGlass", geo.condGlass, mat.violet, 2);
  make("pipe", geo.pipe, mat.pipe, 2);
  make("pipeFlange", geo.pipeFlange, mat.brass, 2);
  make("feedFunnel", geo.feedFunnel, mat.brass, 1);
  make("feedRing", geo.feedRing, mat.brass, 1);
  make("feedStub", geo.feedStub, mat.pipe, 1);
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
    // Piece offsets and instance scale grow with MATTERWRIGHT_RETORT_SCALE
    // about the dock origin, so world offsets are left unscaled by design.
    position.set(ox * MATTERWRIGHT_RETORT_SCALE, oy * MATTERWRIGHT_RETORT_SCALE, oz * MATTERWRIGHT_RETORT_SCALE);
    scale.set(sx * MATTERWRIGHT_RETORT_SCALE, sy2 * MATTERWRIGHT_RETORT_SCALE, sz * MATTERWRIGHT_RETORT_SCALE);
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

  // The point where a ray from the retort's centre leaves its skin. Everything
  // that breaks the vessel's surface — the window bezel, the valve stem, the
  // pipe flanges, the feed port — is anchored through this, so nothing floats
  // off the hull or buries its mounting in it.
  const retortSurface = (dx: number, dy: number, dz: number): Vector3 => {
    const len = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const uz = dz / len;
    const k = Math.sqrt((ux / MWR_RETORT.radius) ** 2 + (uy / MWR_RETORT_HALF) ** 2 + (uz / MWR_RETORT.radius) ** 2);
    return new Vector3(ux / k, MWR_RETORT.y + uy / k, uz / k);
  };

  // ─── Module placement ───────────────────────────────────────────────
  const addSeat = (wx: number, sy: number, wz: number): void => {
    addPiece("base", wx, sy, wz, 0, 0.016, 0);
    addPiece("baseRing", wx, sy, wz, 0, 0.032, 0, 1, 1, 1, 0, PI_2, 0);
  };

  const addPod = (wx: number, sy: number, wz: number): void => {
    // The pod is squashed on Y only, so it keeps the shared 0.075 radius
    // footprint and the same circular dock interface as every other family.
    addPiece("pod", wx, sy, wz, 0, MWR_POD.y, 0, 1, 1, MWR_POD.squash);
    addPiece("podBand", wx, sy, wz, 0, 0.085, 0, 1, 1, 1, 0, PI_2, 0);
  };

  // Retort: the vessel itself, sunk into the pod crown, wearing its brass
  // hoops, the glowing seam between them, a cap knob and a neck collar that
  // clamps it to the pod.
  const addRetort = (wx: number, sy: number, wz: number): void => {
    addPiece("retort", wx, sy, wz, 0, MWR_RETORT.y, 0, 1, 1, MWR_RETORT.squash);
    addPiece("neckCollar", wx, sy, wz, 0, 0.145, 0, 1, 1, 1, 0, PI_2, 0);
    addPiece("bandLower", wx, sy, wz, 0, 0.17, 0, 1, 1, 1, 0, PI_2, 0);
    addPiece("seam", wx, sy, wz, 0, MWR_RETORT.y, 0, 1, 1, 1, 0, PI_2, 0);
    addPiece("bandUpper", wx, sy, wz, 0, 0.195, 0, 1, 1, 1, 0, PI_2, 0);
    addPiece("capKnob", wx, sy, wz, 0, MWR_RETORT.y + MWR_RETORT_HALF - 0.005, 0);
  };

  // Window: one small reinforced porthole on the front flank, glass standing
  // proud inside a brass bezel so the two never share a plane.
  const addWindow = (wx: number, sy: number, wz: number): void => {
    const dir = new Vector3(0.93, 0.18, 0.32).normalize();
    const mount = retortSurface(dir.x, dir.y, dir.z);
    addRingAlong("windowBezel", wx, sy, wz, mount.x, mount.y, mount.z, dir.x, dir.y, dir.z);
    addFlatAlong("windowGlass", wx, sy, wz, mount.x + dir.x * 0.003, mount.y + dir.y * 0.003, mount.z + dir.z * 0.003, dir.x, dir.y, dir.z);
  };

  // Pressure_Valve: a stout stem out of the vessel's upper flank carrying a
  // brass handwheel, angled up so the wheel stays inside the height cap and
  // reads clear of the vessel's crown from a strategy camera.
  const addPressureValve = (wx: number, sy: number, wz: number): void => {
    const mount = retortSurface(MWR_VALVE_DIR.x, MWR_VALVE_DIR.y, MWR_VALVE_DIR.z);
    addPieceAlong("valveStem", wx, sy, wz, mount.x, mount.y, mount.z, MWR_VALVE_DIR.x, MWR_VALVE_DIR.y, MWR_VALVE_DIR.z, MWR_VALVE.stemLength);
    const hubX = mount.x + MWR_VALVE_DIR.x * (MWR_VALVE.stemLength + 0.004);
    const hubY = mount.y + MWR_VALVE_DIR.y * (MWR_VALVE.stemLength + 0.004);
    const hubZ = mount.z + MWR_VALVE_DIR.z * (MWR_VALVE.stemLength + 0.004);
    addRingAlong("valveWheel", wx, sy, wz, hubX, hubY, hubZ, MWR_VALVE_DIR.x, MWR_VALVE_DIR.y, MWR_VALVE_DIR.z);
    addFlatAlong("valveHub", wx, sy, wz, hubX, hubY, hubZ, MWR_VALVE_DIR.x, MWR_VALVE_DIR.y, MWR_VALVE_DIR.z);
    // Four spokes on the fixed wheel basis, so the wheel reads as a handwheel
    // rather than a bare hoop.
    for (const deg of [45, 135, 225, 315]) {
      const a = (deg * Math.PI) / 180;
      const sx = MWR_WHEEL_U.x * Math.cos(a) + MWR_WHEEL_V.x * Math.sin(a);
      const sy2 = MWR_WHEEL_U.y * Math.cos(a) + MWR_WHEEL_V.y * Math.sin(a);
      const sz2 = MWR_WHEEL_U.z * Math.cos(a) + MWR_WHEEL_V.z * Math.sin(a);
      addPieceAlong(
        "valveSpoke",
        wx,
        sy,
        wz,
        hubX + sx * MWR_VALVE.spokeLength * 0.5,
        hubY + sy2 * MWR_VALVE.spokeLength * 0.5,
        hubZ + sz2 * MWR_VALVE.spokeLength * 0.5,
        sx,
        sy2,
        sz2,
        MWR_VALVE.spokeLength
      );
    }
  };

  // Condensers: two compact steel tanks on the pod's shoulders, one to each
  // side of the vessel, each with brass foot and cap rings and one dim violet
  // sight-glass band.
  const addCondensers = (wx: number, sy: number, wz: number): void => {
    for (const side of [1, -1]) {
      const cz = MWR_COND.z * side;
      addPiece("condBody", wx, sy, wz, MWR_COND.x, MWR_COND.y, cz);
      addPiece("condRing", wx, sy, wz, MWR_COND.x, MWR_COND.y - MWR_COND.height / 2 + 0.004, cz, 1, 1, 1, 0, PI_2, 0);
      addPiece("condRing", wx, sy, wz, MWR_COND.x, MWR_COND.y + MWR_COND.height / 2 - 0.004, cz, 1, 1, 1, 0, PI_2, 0);
      addPiece("condGlass", wx, sy, wz, MWR_COND.x, MWR_COND.y + 0.002, cz, 1, 1, 1, 0, PI_2, 0);
    }
  };

  // Process_Pipes: two short heavy runs leaving the vessel's lower flank and
  // dropping into the condensers' caps, flanged where they break the skin. The
  // entry direction is aimed below the vessel's waist on purpose: the retort
  // bulges out to 0.082 at its equator, so a pipe leaving any higher would dive
  // straight back through the hull on its way to the tanks.
  const addProcessPipes = (wx: number, sy: number, wz: number): void => {
    for (const side of [1, -1]) {
      const dir = new Vector3(0.15, -0.3, 0.94 * side).normalize();
      const entry = retortSurface(dir.x, dir.y, dir.z);
      const endX = MWR_COND.x;
      const endY = MWR_COND.y + MWR_COND.height / 2 - 0.002;
      const endZ = MWR_COND.z * side;
      const dx = endX - entry.x;
      const dy = endY - entry.y;
      const dz = endZ - entry.z;
      const len = Math.hypot(dx, dy, dz);
      addPieceAlong("pipe", wx, sy, wz, (entry.x + endX) / 2, (entry.y + endY) / 2, (entry.z + endZ) / 2, dx, dy, dz, len);
      // The flange rides just clear of the hull so it stays visible.
      addRingAlong("pipeFlange", wx, sy, wz, entry.x + (dx / len) * 0.006, entry.y + (dy / len) * 0.006, entry.z + (dz / len) * 0.006, dx, dy, dz);
    }
  };

  // Feed_Port: a reinforced brass intake on the front-lower flank where raw
  // material enters, its mouth facing down and forward, braced back onto the
  // pod crown so it reads as mounted rather than stuck on.
  const addFeedPort = (wx: number, sy: number, wz: number): void => {
    const dir = new Vector3(0.9, -0.36, 0.24).normalize();
    const mount = retortSurface(dir.x, dir.y, dir.z);
    addFlatAlong("feedFunnel", wx, sy, wz, mount.x + dir.x * 0.006, mount.y + dir.y * 0.006, mount.z + dir.z * 0.006, dir.x, dir.y, dir.z);
    addRingAlong("feedRing", wx, sy, wz, mount.x + dir.x * 0.017, mount.y + dir.y * 0.017, mount.z + dir.z * 0.017, dir.x, dir.y, dir.z);
    // Brace: a short strut from the funnel's back down to the pod's shoulder.
    const braceX = mount.x * 0.62;
    const braceZ = mount.z * 0.62;
    const braceTop = MWR_POD_CROWN - 0.006;
    const dx = mount.x - braceX;
    const dy = mount.y - braceTop;
    const dz = mount.z - braceZ;
    addPieceAlong("feedStub", wx, sy, wz, (braceX + mount.x) / 2, (braceTop + mount.y) / 2, (braceZ + mount.z) / 2, dx, dy, dz, Math.hypot(dx, dy, dz));
  };

  const addRearCoupling = (wx: number, sy: number, wz: number): void => {
    addPieceAlong("coupling", wx, sy, wz, -0.058, 0.085, 0, -1, 0, 0, 0.05);
    addRingAlong("couplingRing", wx, sy, wz, -0.056, 0.085, 0, 1, 0, 0);
    addFlatAlong("couplingTip", wx, sy, wz, -0.088, 0.085, 0, -1, 0, 0);
  };

  const addModule = (wx: number, sy: number, wz: number): void => {
    addSeat(wx, sy, wz);
    addPod(wx, sy, wz);
    addRetort(wx, sy, wz);
    addWindow(wx, sy, wz);
    addPressureValve(wx, sy, wz);
    addCondensers(wx, sy, wz);
    addProcessPipes(wx, sy, wz);
    addFeedPort(wx, sy, wz);
    addRearCoupling(wx, sy, wz);
  };

  // ─── Static asset ───────────────────────────────────────────────────
  // This module carries no idle animation (the reaction seam holds and the
  // pipes do not flow): it renders once and `update` is a no-op that keeps the
  // interactive harness uniform across module families.
  type MwrRecord = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
  };
  const records: MwrRecord[] = [];

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

  // No idle animation on this still: the reaction seam holds with `update` kept
  // on the overlay contract so the interactive harness (per-module and AFC
  // update loops) stays uniform across all module families.
  const update = (_nowMs: number): void => {};

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMaterials) m.dispose();
  };

  return { clear, addInstance, commit, update, dispose };
};
