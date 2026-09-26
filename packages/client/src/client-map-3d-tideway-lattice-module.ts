// Tideway Lattice (TDL) module — a compact attachable AFC module that
// fabricates and calibrates machinery for creating stable aether pathways
// across gaps: bridge-heads, causeways and fortified transit lines.
//
// Local space: +X is FORWARD — the outward radial direction of the socket (its
// `yaw`). The root sits at the socket attachment point (the pad-top center, `y`
// returned by moduleSocketAttachments). Dock it with
// addInstance(att.x, att.z, att.y, att.yaw, ...) so the gateway faces away
// from the AFC core.
//
// Procedural hierarchy (every child is logically parented to TDL_Root at the
// bay center, yaw-aligned to face outward):
//   TDL_Root
//   ├── Seat                  — dockable circular base + brass locking lip
//   ├── Pod                   — rounded blackened pod with two brass bands
//   ├── Gateway_Arches        — the defining feature: TWO large parallel
//   │     arch-shaped emitters rising off the pod, like the two halves of a
//   │     bridge gateway, with brass collar brackets at their feet
//   ├── Lattice_Span          — a bright cyan energy lattice crossing between
//   │     the arch crests: two bridge-deck rails plus a cross tie
//   ├── Feed_Conduits         — two thick conduits running from the pod body
//   │     up into each arch foot
//   └── Rear_Coupling         — one heavy rear AFC coupling: thick steel stub,
//   │     brass collar ring and a bright cyan contact tip
//
// Construction is compact and quiet: rounded pod, two parallel arch rails and
// a glowing cyan span between them — a pathway cartridge, not a shield
// generator, portal, weapon or power plant. The docked footprint
// (TIDEWAY_LATTICE_BASE_RADIUS) fits inside AFC_BAY_INNER_RADIUS. Cyan stays
// on the span lattice and the rear contact tip; there is deliberately no
// orange forge glow.
//
// Every arch is a half-torus (π arc) standing in the pod's X–Y plane, so from
// the strategy camera its crest rises cleanly off the pod shoulder, both
// parallels receding across the dock — the "two halves of a bridge gateway",
// with the glowing lattice as the deck between them.
//
// No two pieces share a coplanar surface: the arches step off the pod wall,
// the collar brackets ring the arch legs, and the lattice rods float above the
// pod crown — otherwise the seams Z-fight into black line artifacts.

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
export const TIDEWAY_LATTICE_SCALE = 1.33;
// Footprint radius of the dockable seat — below the AFC bay inner radius
// (0.14) so the module slots into the socket ring with clearance.
export const TIDEWAY_LATTICE_BASE_RADIUS = 0.105 * TIDEWAY_LATTICE_SCALE;
// Total height above the pad top (arch crests), 0.243 × 1.33.
export const TIDEWAY_LATTICE_MODULE_HEIGHT = 0.243 * TIDEWAY_LATTICE_SCALE;

export type TidewayLatticeModuleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, yaw: number, worldTileX: number, worldTileY: number) => number;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createTidewayLatticeModuleOverlay = (scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture): TidewayLatticeModuleOverlay => {
  const C = maxInstances;
  const PI_2 = Math.PI / 2;
  // The twin gateway arches rise off the pod at ±0.075 (its flanks), one hoop
  // on each side, cresting at 0.243 — the tallest feature in the module. The
  // separation makes the two parallels read as separate gateway halves with
  // the lattice deck between them instead of one merged dome.
  const ARCH_Z = 0.075;
  const ARCH_Y = 0.145;
  const ARCH_R = 0.098;
  // The cyan lattice deck floats above the pod crown (0.215) so its rods never
  // carve through the dome, spanning between the two arch planes.
  const LATTICE_Y = 0.22;

  // ─── Materials (shared by piece type) ───────────────────────────────
  const ironMaterial = new MeshStandardMaterial({ color: "#22242a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const steelMaterial = new MeshStandardMaterial({ color: "#17181d", roughness: 0.62, metalness: 0.5, flatShading: true });
  const brassMaterial = new MeshStandardMaterial({ color: "#8b6c3d", roughness: 0.42, metalness: 0.85, flatShading: true });
  const brassDarkMaterial = new MeshStandardMaterial({ color: "#6f5733", roughness: 0.5, metalness: 0.8, flatShading: true });
  const pipeMaterial = new MeshStandardMaterial({ color: "#1d1f25", roughness: 0.68, metalness: 0.35, flatShading: true });
  // Strong cyan aether energy on the lattice span (emissive; no orange — this
  // is a transit-pathway calibrator, not an engine bay).
  const cyanMaterial = new MeshStandardMaterial({
    color: "#05222a",
    roughness: 0.3,
    metalness: 0.1,
    flatShading: true,
    emissive: "#41f6ff",
    emissiveIntensity: 2.5
  });
  const cyanBrightMaterial = new MeshStandardMaterial({
    color: "#06303a",
    roughness: 0.25,
    metalness: 0.05,
    flatShading: true,
    emissive: "#9ff6ff",
    emissiveIntensity: 4.0
  });

  // ─── Geometries (shared) ────────────────────────────────────────────
  // Small curved parts use high segment counts so flat-shaded facets never
  // read as black crease lines (see the Siege Lens Foundry module notes).
  const baseGeo = new CylinderGeometry(0.1, 0.105, 0.032, 16);
  const baseRingGeo = new TorusGeometry(0.12, 0.012, 12, 28);
  const podGeo = new CapsuleGeometry(0.075, 0.05, 6, 16);
  const bandGeo = new TorusGeometry(0.079, 0.011, 10, 26);
  // The defining gateways: two half-torus arches standing in the pod's X–Y
  // plane (default torus orientation, hole along Z), swept the upper
  // semicircle so each reads as an arch rising off its two feet.
  const archGeo = new TorusGeometry(ARCH_R, 0.016, 10, 28, Math.PI);
  const mountGeo = new TorusGeometry(0.02, 0.012, 8, 16);
  const deckBarGeo = new CylinderGeometry(0.012, 0.012, 1, 6);
  const deckRailGeo = new CylinderGeometry(0.011, 0.011, 1, 6);
  const conduitGeo = new CylinderGeometry(0.019, 0.017, 1, 10);
  const conduitRingGeo = new TorusGeometry(0.022, 0.007, 8, 16);
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
  make("arch", archGeo, brassMaterial, 2);
  make("mount", mountGeo, brassDarkMaterial, 2);
  make("deckBar", deckBarGeo, cyanBrightMaterial, 3);
  make("deckRail", deckRailGeo, cyanMaterial, 1);
  make("conduit", conduitGeo, pipeMaterial, 2);
  make("conduitRing", conduitRingGeo, brassDarkMaterial, 2);
  make("coupling", couplingGeo, steelMaterial, 1);
  make("couplingRing", couplingRingGeo, brassMaterial, 1);
  make("couplingTip", couplingTipGeo, cyanMaterial, 1);

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
    // Piece offsets and instance scale grow with TIDEWAY_LATTICE_SCALE about
    // the dock origin; the scene-anchor position (wx, sy, wz) never scales so
    // docked instances stay on their socket.
    position.set(wx + ox * TIDEWAY_LATTICE_SCALE, sy + oy * TIDEWAY_LATTICE_SCALE, wz + oz * TIDEWAY_LATTICE_SCALE);
    scale.set(sx * TIDEWAY_LATTICE_SCALE, sy2 * TIDEWAY_LATTICE_SCALE, sz * TIDEWAY_LATTICE_SCALE);
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

  // Gateway_Arches: the two parallel half-torus emitters rising off the pod,
  // one at each flank, with brass collar brackets collar-ringing their feet
  // (the compact stabilizer at the arches' base).
  const addGatewayArches = (wx: number, sy: number, wz: number): void => {
    addPiece("arch", wx, sy, wz, 0, ARCH_Y, ARCH_Z);
    addPiece("arch", wx, sy, wz, 0, ARCH_Y, -ARCH_Z);
    addRingAlong("mount", wx, sy, wz, ARCH_R, 0.136, ARCH_Z, 1, 0, 0);
    addRingAlong("mount", wx, sy, wz, ARCH_R, 0.136, -ARCH_Z, 1, 0, 0);
  };

  // Lattice_Span: the bright cyan energy lattice crossing between the arch
  // crests, floating above the pod crown — three bridge-deck rails spanning
  // the full gateway width (module Z) plus a cross tie, like a stable
  // traversable path taking shape.
  const addLatticeSpan = (wx: number, sy: number, wz: number): void => {
    addPieceAlong("deckBar", wx, sy, wz, -0.05, LATTICE_Y, 0, 0, 0, 1, 0.15);
    addPieceAlong("deckBar", wx, sy, wz, 0, LATTICE_Y, 0, 0, 0, 1, 0.15);
    addPieceAlong("deckBar", wx, sy, wz, 0.05, LATTICE_Y, 0, 0, 0, 1, 0.15);
    addPieceAlong("deckRail", wx, sy, wz, 0, LATTICE_Y, 0, 1, 0, 0, 0.104);
  };

  // Feed_Conduits: two thick insulated conduits running from the pod's flank
  // (on the surface, radial to the tower) up into each arch foot, each with a
  // brass collar ring.
  const addFeedConduits = (wx: number, sy: number, wz: number): void => {
    const radial = Math.hypot(0.098, ARCH_Z);
    const ux = 0.098 / radial;
    const uz = ARCH_Z / radial;
    for (const flank of [-1, 1]) {
      const startX = 0.075 * ux;
      const startY = 0.115;
      const startZ = 0.075 * uz * flank;
      const endX = 0.096;
      const endY = 0.138;
      const endZ = 0.07 * flank;
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
    addGatewayArches(wx, sy, wz);
    addLatticeSpan(wx, sy, wz);
    addFeedConduits(wx, sy, wz);
    addRearCoupling(wx, sy, wz);
  };

  // ─── Static asset ───────────────────────────────────────────────────
  // This module carries no idle animation (no lattice pulse, no arch sway):
  // it renders once and `update` is a no-op that keeps the interactive
  // harness uniform across module families.
  type TdlRecord = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
  };
  const records: TdlRecord[] = [];

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

  // No idle animation on this cartridge: the gateway arches sit static.
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