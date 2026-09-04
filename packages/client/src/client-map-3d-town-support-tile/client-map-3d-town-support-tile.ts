// 3D Town Support Tile overlay — the eight prepared plots that surround
// each town, ready to receive a future economic building.
//
// Each tile is minimal: a single recessed hatch sunk into the ground, like an
// illuminated service well in a garage floor. A hollow dark shaft drops below
// the surface with a glowing base, and seated flat inside it is a single
// glowing ionic battery cell — a soft luminous disc flush with the floor —
// waiting to attach to the building that will be placed on top. The battery's
// glow and the glowing hatch rim are the only elements that read from a
// distance, keeping the prepared plots unobtrusive until a building lands on
// them.
//
// Built in the same self-contained style as the Relay Beacon overlay: a local
// InstancedMesh registry with dedicated materials (including a soft emissive
// glow for the battery core and the hatch rim), plus addPiece() helpers with
// Euler orientation. There is no animation today, so no update() step is
// needed — commit() flashes the final matrices.
//
// The battery core and hatch rim glow only once the plot has been settled —
// addInstance() takes an `active` flag that routes the glowing pieces to a
// dark, unlit material set (unclaimed plot, waiting) or the emissive lit set
// (settled, contributing to the town). The frame/walls stay the same steel
// and brass regardless of state.

import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  Vector3
} from "three";

export type TownSupportTileOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (
    centerX: number,
    centerZ: number,
    surfaceY: number,
    dx: number,
    dz: number,
    active: boolean
  ) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

// Heading for each tile's placement, following the town overlay's
// ry = atan2(-dz, dx) convention for a neighbour at (dx, dz). The hatch is
// rotationally symmetric about its centre, so this value is carried only for
// consistency with the surrounding overlays and the public addInstance API.
const TOWN_FACING = (dx: number, dz: number): number => Math.atan2(-dz, dx);

// ─── Geometry helpers ───────────────────────────────────────────────────
const geo = <T extends BufferGeometry>(g: T): T => g;

// Hatch vault — a square pit recessed into the ground. A hollow shaft of
// dark wall panels drops below the surface, its opening flush with the
// ground, with a glowing base and the ionic battery inside glowing upward.
const hatchFrameGeo = geo(new BoxGeometry(0.36, 0.022, 0.36)); // flush floor frame
const hatchWallGeo = geo(new BoxGeometry(0.06, 0.5, 0.28)); // shaft wall (long Z)
const hatchWallXGeo = geo(new BoxGeometry(0.28, 0.5, 0.06)); // shaft wall (long X)
const hatchFloorGeo = geo(new BoxGeometry(0.2, 0.02, 0.2)); // glowing well base
const hatchGlowGeo = geo(new BoxGeometry(0.022, 0.02, 0.32)); // edge glow (long Z)
const hatchGlowXGeo = geo(new BoxGeometry(0.32, 0.02, 0.022)); // edge glow (long X)

// Ionic battery — a flat glowing cell seated flush in the hatch floor, so it
// reads as a soft luminous surface waiting for a building rather than a
// cylinder poking up out of the ground.
const batteryGlowGeo = geo(new CylinderGeometry(0.09, 0.1, 0.02, 16));

const WELL_HALF = 0.13;

export const createTownSupportTileOverlay = (scene: Scene, maxTiles: number): TownSupportTileOverlay => {
  const C = maxTiles;
  const group = new Group();
  group.name = "town-support-tile-overlay";
  scene.add(group);

  // ─── Materials ───────────────────────────────────────────────────────
  const steelMaterial = new MeshStandardMaterial({
    color: "#4b4f58",
    roughness: 0.25,
    metalness: 0.75,
    flatShading: true
  });
  const brassMaterial = new MeshStandardMaterial({
    color: "#b08d55",
    roughness: 0.18,
    metalness: 0.8,
    flatShading: true
  });
  // Soft luminous core of the battery, glowing like a charged cell — only
  // once the plot has been settled.
  const batteryGlowMaterial = new MeshStandardMaterial({
    color: "#1a3542",
    roughness: 0.4,
    metalness: 0.1,
    flatShading: true,
    emissive: "#8fe6ff",
    emissiveIntensity: 2.6
  });
  // Faint floor-illumination that spills from the open hatch vault — the soft
  // pool of light you see in a lit service well set into a garage floor.
  const hatchGlowMaterial = new MeshStandardMaterial({
    color: "#123a4a",
    roughness: 0.3,
    metalness: 0.2,
    flatShading: true,
    emissive: "#7fd8f5",
    emissiveIntensity: 2.3
  });
  // Dark, unlit counterparts used before the plot is settled — the hatch
  // reads as an empty, powered-down well rather than a hazard to hide.
  const batteryDarkMaterial = new MeshStandardMaterial({
    color: "#20242b",
    roughness: 0.6,
    metalness: 0.2,
    flatShading: true
  });
  const hatchDarkMaterial = new MeshStandardMaterial({
    color: "#181a1f",
    roughness: 0.55,
    metalness: 0.25,
    flatShading: true
  });

  // ─── InstancedMesh registry ──────────────────────────────────────────
  type Slot = { mesh: InstancedMesh; count: number; cap: number };
  const slots = new Map<string, Slot>();

  const make = (key: string, g: BufferGeometry, mat: MeshStandardMaterial, cap: number): Slot => {
    const mesh = new InstancedMesh(g, mat, cap);
    mesh.frustumCulled = false;
    mesh.count = 0;
    group.add(mesh);
    const slot: Slot = { mesh, count: 0, cap };
    slots.set(key, slot);
    return slot;
  };

  make("hatchWall", hatchWallGeo, steelMaterial, C * 2);
  make("hatchWallX", hatchWallXGeo, steelMaterial, C * 2);
  make("hatchFrame", hatchFrameGeo, brassMaterial, C);
  // Lit (settled) and dark (unsettled) variants of every glowing piece.
  make("hatchFloorLit", hatchFloorGeo, hatchGlowMaterial, C);
  make("hatchGlowLit", hatchGlowGeo, hatchGlowMaterial, C * 2);
  make("hatchGlowXLit", hatchGlowXGeo, hatchGlowMaterial, C * 2);
  make("batteryGlowLit", batteryGlowGeo, batteryGlowMaterial, C);
  make("hatchFloorDark", hatchFloorGeo, hatchDarkMaterial, C);
  make("hatchGlowDark", hatchGlowGeo, hatchDarkMaterial, C * 2);
  make("hatchGlowXDark", hatchGlowXGeo, hatchDarkMaterial, C * 2);
  make("batteryGlowDark", batteryGlowGeo, batteryDarkMaterial, C);

  // ─── Helpers ─────────────────────────────────────────────────────────
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const tmpQuat = new Quaternion();
  const tmpEuler = new Euler();

  const addPiece = (
    key: string,
    tileX: number,
    tileZ: number,
    sy: number,
    ox: number,
    oy: number,
    oz: number,
    theta: number,
    sx = 1,
    sz = 1,
    sy2 = 1,
    rotX = 0,
    rotZ = 0
  ): void => {
    const slot = slots.get(key);
    if (!slot || slot.count >= slot.cap) return;
    // Rotate the tile-local offset (ox, oz) by the tile's town-facing angle.
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const wx = tileX + ox * cosT + oz * sinT;
    const wz = tileZ - ox * sinT + oz * cosT;
    position.set(wx, sy + oy, wz);
    scale.set(sx, sy2, sz);
    tmpEuler.set(rotX, theta, rotZ, "XYZ");
    tmpQuat.setFromEuler(tmpEuler);
    matrix.compose(position, tmpQuat, scale);
    slot.mesh.setMatrixAt(slot.count, matrix);
    slot.count += 1;
  };

  const addTile = (wx: number, sy: number, wz: number, theta: number, active: boolean): void => {
    // Recessed hatch sunk into the ground, like an illuminated service well in
    // a garage floor. A hollow shaft of dark walls drops below the surface,
    // its opening flush with the ground; a glowing base below, and the ionic
    // battery sitting inside the pit with its glow spilling up through the
    // hatch mouth — dark and powered-down until the plot is settled.
    const floorKey = active ? "hatchFloorLit" : "hatchFloorDark";
    const glowKey = active ? "hatchGlowLit" : "hatchGlowDark";
    const glowXKey = active ? "hatchGlowXLit" : "hatchGlowXDark";
    const batteryKey = active ? "batteryGlowLit" : "batteryGlowDark";
    addPiece("hatchWall", wx, wz, sy, 0, -0.2, -WELL_HALF, theta);
    addPiece("hatchWall", wx, wz, sy, 0, -0.2, WELL_HALF, theta);
    addPiece("hatchWallX", wx, wz, sy, -WELL_HALF, -0.2, 0, theta);
    addPiece("hatchWallX", wx, wz, sy, WELL_HALF, -0.2, 0, theta);
    addPiece(floorKey, wx, wz, sy, 0, -0.43, 0, theta);
    // Metallic frame around the hatch mouth, level with the ground.
    addPiece("hatchFrame", wx, wz, sy, 0, 0.04, 0, theta);
    // Flat battery cell seated flush inside the pit, glowing up through the
    // hatch opening once settled.
    addPiece(batteryKey, wx, wz, sy, 0, -0.06, 0, theta);
    // Faint glow strips running around the hatch rim edge at floor level.
    addPiece(glowKey, wx, wz, sy, 0, 0.045, -WELL_HALF, theta);
    addPiece(glowKey, wx, wz, sy, 0, 0.045, WELL_HALF, theta);
    addPiece(glowXKey, wx, wz, sy, -WELL_HALF, 0.045, 0, theta);
    addPiece(glowXKey, wx, wz, sy, WELL_HALF, 0.045, 0, theta);
  };

  // ─── Public API ─────────────────────────────────────────────────────
  const clear = (): void => {
    for (const slot of slots.values()) slot.count = 0;
  };

  const addInstance = (
    centerX: number,
    centerZ: number,
    surfaceY: number,
    dx: number,
    dz: number,
    active: boolean
  ): void => {
    addTile(centerX, surfaceY, centerZ, TOWN_FACING(dx, dz), active);
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

  const dispose = (): void => {
    scene.remove(group);
    for (const slot of slots.values()) slot.mesh.dispose();
    [
      hatchFrameGeo, hatchWallGeo, hatchWallXGeo, hatchFloorGeo,
      hatchGlowGeo, hatchGlowXGeo, batteryGlowGeo
    ].forEach((g) => g.dispose());
    [
      steelMaterial, brassMaterial, batteryGlowMaterial, hatchGlowMaterial,
      batteryDarkMaterial, hatchDarkMaterial
    ].forEach((m) => m.dispose());
  };

  return { group, clear, addInstance, commit, dispose };
};
