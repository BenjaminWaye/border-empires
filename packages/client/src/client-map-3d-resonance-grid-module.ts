// Resonance Grid (RSG) module — a compact attachable AFC module that fabricates
// and synchronizes distributed aether-field infrastructure: the survey pylons,
// lattice anchors and phase towers wired into a region's aether grid.
//
// Local space: +X is FORWARD — the outward radial direction of the socket (its
// `yaw`). The root sits at the socket attachment point (the pad-top center, `y`
// returned by moduleSocketAttachments). Dock it with
// addInstance(att.x, att.z, att.y, att.yaw, ...) so the triad faces away from
// the AFC core.
//
// Procedural hierarchy (every child is logically parented to RSG_Root at the
// bay center, yaw-aligned to face outward):
//   RSG_Root
//   ├── Seat                  — dockable circular base + brass locking lip
//   ├── Grid_Pod              — a low, wide blackened pod (deliberately
//   │     squatter than the taller families) carrying two brass bands
//   ├── Node_Triad            — THE dominant mechanism: three large resonance
//   │   │   nodes in a triangle above the pod, one forward and two aft. Each
//   │   │   node is a thick aged-brass rim, a dark steel mid band and a
//   │   │   glowing cyan core, all leaning 30° outward so their holes read as
//   │   │   ellipses from the strategy camera
//   │   ├── Conductor_Arms    — three short rigid brass arms on the nodes'
//   │   │   mid bands, closing the triangle so the nodes visibly lock into a
//   │   │   phase-locked network rather than three separate emitters
//   │   ├── Support_Column    — one stout steel column with a brass capital
//   │   │   carrying the whole arm truss, and through it all three nodes, on
//   │   │   the single shared phase at the triangle's centre
//   ├── Central_Synchronizer  — a compact steel drum seated on the pod's crown
//   │     at the centre of the triangle, with a brass collar and one small
//   │     cyan phase lens (deliberately dimmer than the three node cores)
//   ├── Power_Conduits        — three thick insulated conduits running from the
//   │     synchronizer's lower rim back and down into the pod's rear shoulder
//   └── Rear_Coupling         — one heavy rear AFC coupling: thick steel stub,
//         brass collar ring and a bright cyan contact tip
//
// Construction is a networked instrument, not a reactor: the glow lives in three
// separate ring cores that share one synchronizer, so the silhouette reads as
// distributed field control. This is the deliberate opposite of the Aether
// Resonance Core family, which spends the same envelope on ONE dominant
// central core ringed by coils — here there is no single large emitter, only
// three equal nodes on a triangle.
//
// The triad is the reason this family's pod is low. The shared dock envelope
// caps a module at 0.34 world units tall (0.256 local), and the taller families
// spend nearly all of that on a pod whose crown reaches 0.215 — which leaves no
// room at all for elevated nodes above it. A vertically squashed pod (same
// 0.075 radius footprint, same dock interface, same blackened-iron/aged-brass
// material language as every other family) buys the 0.05 of headroom the three
// leaning rings need. The triangle deliberately overhangs that low pod a little —
// the nodes have to be the dominant read, not the pod — while every ring still
// stays well inside the seat lip's own radius, so the family still clears its
// socket and reads as one compact instrument.
//
// No two pieces share a coplanar surface: the synchronizer's phase lens is sunk
// into the drum's cap, the pod bands are seated into the squashed pod's
// shoulders, and the conduit glands sit proud of the drum — otherwise the seams
// Z-fight into black line artifacts.

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
  Texture,
  TorusGeometry,
  Vector3
} from "three";
import { applyBuildingEnvMap } from "./client-map-3d-building-envmap/client-map-3d-building-envmap.js";

// Uniform 33% scale-up applied to every module-local position and instance
// scale about the dock origin, matching the other AFC module families.
export const RESONANCE_GRID_SCALE = 1.33;
// Footprint radius of the dockable seat — below the AFC bay inner radius
// (0.14) so the module slots into the socket ring with clearance.
export const RESONANCE_GRID_BASE_RADIUS = 0.105 * RESONANCE_GRID_SCALE;
// Total height above the pad top (top of the leaning node rims), 0.243 × 1.33.
export const RESONANCE_GRID_MODULE_HEIGHT = 0.243 * RESONANCE_GRID_SCALE;

export type ResonanceGridModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createResonanceGridModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): ResonanceGridModuleOverlay => {
  const C = maxInstances;
  const PI_2 = Math.PI / 2;
  // Node_Triad: three equal nodes on an equilateral triangle in the XZ plane,
  // one forward (+X) and two aft, each ring leaning 30° outward. The lean is
  // what makes the rings read as rings from a shallow strategy camera instead
  // of collapsing into flat discs, and it keeps each ring's vertical extent to
  // R·cos(30°) + tube so three of them still clear the height cap.
  const TRIAD = {
    radius: 0.058, // circumradius: node centres on this circle
    y: 0.216, // the node plane
    lean: Math.PI / 6, // radians the ring planes tip away from horizontal
    ringRadius: 0.034,
    ringTube: 0.01,
    midRadius: 0.0205,
    midTube: 0.004,
    coreRadius: 0.0115,
    coreTube: 0.005,
    armRadius: 0.007
  };
  // The arms and the support column meet the nodes at `nodeAnchor`: the point
  // on each ring's rim that lies in the ring's own plane, one step along the
  // in-plane axis that tips with the lean. Anchoring anywhere else is the
  // trap in this design: a ring leaning 30° has its plane tilted 30° off
  // horizontal, so a horizontal run toward a neighbour leaves that plane at
  // 0.43 per unit of travel and would sail straight past the rim instead of
  // seating into it. `nodeAnchor` is in-plane by construction, so an arm's
  // buried end really is inside the brass it claims to bolt into.
  const nodeAnchorRadius = TRIAD.radius - TRIAD.ringRadius * Math.cos(TRIAD.lean);
  const nodeAnchorY = TRIAD.y + TRIAD.ringRadius * Math.sin(TRIAD.lean);
  // Conductor arms span the anchor triangle edge to edge — short stubs that
  // just bridge one node's rim to the next.
  const ARM_LENGTH = nodeAnchorRadius * Math.sqrt(3);
  // Central_Synchronizer: seated on the pod crown under the arm truss, with a
  // stout column carrying the truss on its capital.
  const SYNC = { y: 0.185, height: 0.032, topY: 0.201, rimRadius: 0.02, columnRadius: 0.008, capitalRadius: 0.012 };

  // ─── Materials (shared by piece type) ───────────────────────────────
  const ironMaterial = new MeshStandardMaterial({ color: "#22242a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const steelMaterial = new MeshStandardMaterial({ color: "#17181d", roughness: 0.62, metalness: 0.5, flatShading: true });
  const brassMaterial = new MeshStandardMaterial({ color: "#8b6c3d", roughness: 0.42, metalness: 0.85, flatShading: true });
  const pipeMaterial = new MeshStandardMaterial({ color: "#2c2f36", roughness: 0.55, metalness: 0.6, flatShading: true });
  // Cyan aether light lives in the three node cores; the arm phase beads, the
  // synchronizer's phase lens and the rear contact tip reuse the same two
  // intensities so the nodes stay the brightest thing in the silhouette.
  const cyanMaterial = new MeshStandardMaterial({
    color: "#05222a",
    roughness: 0.3,
    metalness: 0.1,
    flatShading: true,
    emissive: "#41f6ff",
    emissiveIntensity: 2.0
  });
  const cyanBrightMaterial = new MeshStandardMaterial({
    color: "#06303a",
    roughness: 0.25,
    metalness: 0.05,
    flatShading: true,
    emissive: "#9ff6ff",
    emissiveIntensity: 3.0
  });

  // ─── Geometries (shared) ────────────────────────────────────────────
  // Small curved parts use high segment counts so flat-shaded facets never
  // read as black crease lines (see the Siege Lens Foundry module notes).
  const baseGeo = new CylinderGeometry(0.1, 0.105, 0.032, 16);
  const baseRingGeo = new TorusGeometry(0.12, 0.012, 12, 28);
  // A squashed capsule: same 0.075 radius as every other family's pod, but
  // short and wide so the node triad can sit above it inside the height cap.
  const podGeo = new CapsuleGeometry(0.075, 0.02, 6, 16);
  const bandGeo = new TorusGeometry(0.079, 0.011, 10, 26);
  // Node_Triad: each node is three concentric tori sharing one lean axis —
  // brass rim, steel band, glowing cyan core.
  const nodeRimGeo = new TorusGeometry(TRIAD.ringRadius, TRIAD.ringTube, 10, 24);
  const nodeMidGeo = new TorusGeometry(TRIAD.midRadius, TRIAD.midTube, 8, 20);
  const nodeCoreGeo = new TorusGeometry(TRIAD.coreRadius, TRIAD.coreTube, 8, 18);
  // Conductor_Arms: short brass runs between node rims, each with a cyan phase
  // bead seated around it out on the arm's outer half.
  const armGeo = new CylinderGeometry(TRIAD.armRadius, TRIAD.armRadius, 1, 8);
  const armBeadGeo = new TorusGeometry(0.007, 0.003, 6, 14);
  // Central_Synchronizer: drum, brass collar, sunken phase lens, and the
  // column + capital that carry the arm truss.
  const syncDrumGeo = new CylinderGeometry(0.021, 0.024, SYNC.height, 12);
  const syncCollarGeo = new TorusGeometry(0.025, 0.006, 8, 18);
  const syncLensGeo = new CylinderGeometry(0.012, 0.012, 0.005, 12);
  const columnGeo = new CylinderGeometry(SYNC.columnRadius, SYNC.columnRadius, 1, 10);
  const capitalGeo = new CylinderGeometry(SYNC.capitalRadius, SYNC.capitalRadius, 0.006, 12);
  // Power_Conduits: three thick feeds with brass glands where they exit.
  const conduitGeo = new CylinderGeometry(0.0085, 0.0085, 1, 10);
  const conduitGlandGeo = new TorusGeometry(0.011, 0.004, 8, 16);
  const couplingGeo = new CylinderGeometry(0.024, 0.026, 1, 12);
  const couplingRingGeo = new TorusGeometry(0.03, 0.011, 10, 20);
  const couplingTipGeo = new CylinderGeometry(0.014, 0.014, 0.016, 14);

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
  make("nodeRim", nodeRimGeo, brassMaterial, 3);
  make("nodeMid", nodeMidGeo, steelMaterial, 3);
  make("nodeCore", nodeCoreGeo, cyanBrightMaterial, 3);
  make("arm", armGeo, brassMaterial, 3);
  make("armBead", armBeadGeo, cyanMaterial, 3);
  make("column", columnGeo, steelMaterial, 1);
  make("capital", capitalGeo, brassMaterial, 1);
  make("syncDrum", syncDrumGeo, steelMaterial, 1);
  make("syncCollar", syncCollarGeo, brassMaterial, 1);
  make("syncLens", syncLensGeo, cyanMaterial, 1);
  make("conduit", conduitGeo, pipeMaterial, 3);
  make("conduitGland", conduitGlandGeo, brassMaterial, 3);
  make("coupling", couplingGeo, steelMaterial, 1);
  make("couplingRing", couplingRingGeo, brassMaterial, 1);
  make("couplingTip", couplingTipGeo, cyanMaterial, 1);

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
    // Piece offsets and instance scale grow with RESONANCE_GRID_SCALE about the
    // dock origin, so world offsets are left unscaled by design.
    position.set(ox * RESONANCE_GRID_SCALE, oy * RESONANCE_GRID_SCALE, oz * RESONANCE_GRID_SCALE);
    scale.set(sx * RESONANCE_GRID_SCALE, sy2 * RESONANCE_GRID_SCALE, sz * RESONANCE_GRID_SCALE);
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
    // The pod is squashed on Y only, so it keeps the shared 0.075 radius
    // footprint and the same circular dock interface as every other family.
    addPiece("pod", wx, sy, wz, 0, 0.1, 0, 1, 1, 0.85);
    addPiece("band", wx, sy, wz, 0, 0.075, 0, 1, 1, 1, 0, PI_2, 0);
    addPiece("band", wx, sy, wz, 0, 0.135, 0, 1, 1, 1, 0, PI_2, 0);
  };

  // The i-th node of the triad, on an equilateral triangle in the XZ plane.
  // `nx/nz` is the horizontal part of the unit normal of the ring plane, tipped
  // `lean` radians off horizontal so each ring faces up and outward;
  // `anchorX/anchorZ` is the in-plane rim point the arms and column bolt into.
  const nodeCentre = (i: number): { x: number; z: number; nx: number; nz: number; anchorX: number; anchorZ: number } => {
    const angle = (i * Math.PI * 2) / 3;
    const rx = Math.cos(angle);
    const rz = Math.sin(angle);
    const nx = rx * Math.sin(TRIAD.lean);
    const nz = rz * Math.sin(TRIAD.lean);
    return {
      x: TRIAD.radius * rx,
      z: TRIAD.radius * rz,
      nx,
      nz,
      anchorX: nodeAnchorRadius * rx,
      anchorZ: nodeAnchorRadius * rz
    };
  };

  // Node_Triad: three large resonance nodes, each a thick brass rim, a dark
  // steel band and a glowing cyan core on one shared lean axis.
  const addNodeTriad = (wx: number, sy: number, wz: number): void => {
    for (let i = 0; i < 3; i += 1) {
      const node = nodeCentre(i);
      const ny = Math.cos(TRIAD.lean);
      addRingAlong("nodeRim", wx, sy, wz, node.x, TRIAD.y, node.z, node.nx, ny, node.nz);
      addRingAlong("nodeMid", wx, sy, wz, node.x, TRIAD.y, node.z, node.nx, ny, node.nz);
      addRingAlong("nodeCore", wx, sy, wz, node.x, TRIAD.y, node.z, node.nx, ny, node.nz);
    }
  };

  // Conductor_Arms: one short rigid arm per triangle edge, bridging the two
  // nodes' steel mid bands, with a small cyan phase bead at its centre. The
  // closed triangle is what makes the three nodes read as one locked network
  // instead of three independent emitters.
  const addConductorArms = (wx: number, sy: number, wz: number): void => {
    for (let i = 0; i < 3; i += 1) {
      const a = nodeCentre(i);
      const b = nodeCentre((i + 1) % 3);
      const dx = b.anchorX - a.anchorX;
      const dz = b.anchorZ - a.anchorZ;
      const span = Math.hypot(dx, dz);
      const dirX = dx / span;
      const dirZ = dz / span;
      const midX = (a.anchorX + b.anchorX) / 2;
      const midZ = (a.anchorZ + b.anchorZ) / 2;
      addPieceAlong("arm", wx, sy, wz, midX, nodeAnchorY, midZ, dirX, 0, dirZ, ARM_LENGTH);
      // The bead rides out on the arm's outer half so the capital below it
      // never swallows the glow.
      addRingAlong("armBead", wx, sy, wz, a.anchorX + dirX * ARM_LENGTH * 0.2, nodeAnchorY, a.anchorZ + dirZ * ARM_LENGTH * 0.2, dirX, 0, dirZ);
    }
  };

  // Support_Column: one stout steel column from the synchronizer's cap up to a
  // brass capital, carrying the whole arm truss — and through it all three
  // nodes — on the single shared phase source at the triangle's centre.
  const addSupportColumn = (wx: number, sy: number, wz: number): void => {
    const length = nodeAnchorY - SYNC.topY;
    addPieceAlong("column", wx, sy, wz, 0, (SYNC.topY + nodeAnchorY) / 2, 0, 0, 1, 0, length);
    addPiece("capital", wx, sy, wz, 0, nodeAnchorY, 0);
  };

  // Central_Synchronizer: a compact steel drum on the pod crown at the centre
  // of the triangle, brass collar, and one small phase lens sunk into its cap.
  const addSynchronizer = (wx: number, sy: number, wz: number): void => {
    addPiece("syncDrum", wx, sy, wz, 0, SYNC.y, 0);
    addPiece("syncCollar", wx, sy, wz, 0, SYNC.y, 0, 1, 1, 1, 0, PI_2, 0);
    addPiece("syncLens", wx, sy, wz, 0, SYNC.topY + 0.0015, 0);
  };

  // Power_Conduits: three thick feeds leaving the synchronizer's lower rim and
  // running back into the pod's rear shoulder, each with a brass gland where it
  // breaks the drum's surface.
  const addPowerConduits = (wx: number, sy: number, wz: number): void => {
    const startY = SYNC.y - SYNC.height / 2 + 0.004;
    for (const deg of [150, 180, 210]) {
      const angle = (deg * Math.PI) / 180;
      const radialX = Math.cos(angle);
      const radialZ = Math.sin(angle);
      const startX = SYNC.rimRadius * radialX;
      const startZ = SYNC.rimRadius * radialZ;
      const endX = 0.056 * radialX;
      const endZ = 0.056 * radialZ;
      const endY = 0.126;
      const dx = endX - startX;
      const dy = endY - startY;
      const dz = endZ - startZ;
      const len = Math.hypot(dx, dy, dz);
      addPieceAlong("conduit", wx, sy, wz, (startX + endX) / 2, (startY + endY) / 2, (startZ + endZ) / 2, dx, dy, dz, len);
      // The gland rides just outside the drum so it stays visible.
      addRingAlong("conduitGland", wx, sy, wz, startX + (dx / len) * 0.008, startY + (dy / len) * 0.008, startZ + (dz / len) * 0.008, dx, dy, dz);
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
    addSynchronizer(wx, sy, wz);
    addNodeTriad(wx, sy, wz);
    addConductorArms(wx, sy, wz);
    addSupportColumn(wx, sy, wz);
    addPowerConduits(wx, sy, wz);
    addRearCoupling(wx, sy, wz);
  };

  // ─── Static asset ───────────────────────────────────────────────────
  // This module carries no idle animation (the nodes hold phase and the
  // conduits do not pulse): it renders once and `update` is a no-op that keeps
  // the interactive harness uniform across module families.
  type RsgRecord = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
  };
  const records: RsgRecord[] = [];

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

  // No idle animation on this instrument: the triad holds phase with `update`
  // kept on the overlay contract so the interactive harness (per-module and AFC
  // update loops) stays uniform across all module families.
  const update = (_nowMs: number): void => {};

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMaterials) m.dispose();
  };

  return { clear, addInstance, commit, update, dispose };
};
