// A dockable precision mill: twin-column gantry, spindle, clamped workpiece,
// tool magazine and drive wheel. Local +X points out of the AFC socket.
import {
  BoxGeometry, CylinderGeometry, Euler, InstancedMesh, Matrix4,
  MeshStandardMaterial, Quaternion, Scene, TorusGeometry, Vector3, type Texture
} from "three";
import { applyBuildingEnvMap } from "../client-map-3d-building-envmap/client-map-3d-building-envmap.js";

export const INDUSTRIAL_TOOLING_BASE_RADIUS = 0.138;
type Overlay = {
  clear(): void;
  addInstance(x: number, z: number, y: number, yaw: number, worldX: number, worldY: number): number;
  commit(): void;
  update(nowMs: number): void;
  dispose(): void;
};
type Dock = { x: number; y: number; z: number; yaw: number; phase: number };
type Piece = { key: string; x: number; y: number; z: number; sx?: number; sy?: number; sz?: number; rx?: number; rz?: number };

export const createIndustrialToolingModuleOverlay = (
  scene: Scene, maxInstances: number, buildingEnvironmentTexture?: Texture
): Overlay => {
  const material = (color: string, metalness: number): MeshStandardMaterial =>
    new MeshStandardMaterial({ color, metalness, roughness: 0.46, flatShading: true });
  const iron = material("#292d32", 0.6);
  const brass = material("#b08a45", 0.8);
  const steel = material("#9aaeb2", 0.7);
  const dark = material("#151c20", 0.4);
  const cyan = new MeshStandardMaterial({
    color: "#12353b", emissive: "#41dbe7", emissiveIntensity: 0.8,
    roughness: 0.35, metalness: 0.2
  });
  const box = new BoxGeometry(1, 1, 1);
  const rod = new CylinderGeometry(1, 1, 1, 12);
  const seat = new CylinderGeometry(0.132, INDUSTRIAL_TOOLING_BASE_RADIUS, 0.035, 20);
  const lip = new TorusGeometry(0.13, 0.008, 6, 24);
  const wheel = new TorusGeometry(0.047, 0.008, 6, 18);
  const definitions = {
    seat: { geometry: seat, material: iron, copies: 1 },
    lip: { geometry: lip, material: brass, copies: 1 },
    iron: { geometry: box, material: iron, copies: 7 },
    brass: { geometry: box, material: brass, copies: 5 },
    steel: { geometry: box, material: steel, copies: 6 },
    dark: { geometry: box, material: dark, copies: 2 },
    rod: { geometry: rod, material: steel, copies: 5 },
    spindle: { geometry: rod, material: brass, copies: 1 },
    cutter: { geometry: rod, material: steel, copies: 1 },
    cyan: { geometry: box, material: cyan, copies: 2 },
    wheel: { geometry: wheel, material: brass, copies: 1 },
    spoke: { geometry: box, material: brass, copies: 3 }
  };
  const slots = new Map<string, { mesh: InstancedMesh; count: number }>();
  for (const [key, def] of Object.entries(definitions)) {
    applyBuildingEnvMap(def.material, buildingEnvironmentTexture);
    const mesh = new InstancedMesh(def.geometry, def.material, maxInstances * def.copies);
    mesh.name = `industrial-tooling-${key}`;
    mesh.frustumCulled = false;
    mesh.count = 0;
    slots.set(key, { mesh, count: 0 });
    scene.add(mesh);
  }
  // Capacity matches the visible overlay capacity; clear releases every dock.
  const docks: Dock[] = [];
  const matrix = new Matrix4();
  const local = new Matrix4();
  const root = new Matrix4();
  const rotation = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3();
  const euler = new Euler();
  const axis = new Vector3(0, 1, 0);
  const write = (dock: Dock, piece: Piece, index: number): void => {
    const slot = slots.get(piece.key);
    if (!slot) return;
    rotation.setFromAxisAngle(axis, -dock.yaw);
    root.compose(position.set(dock.x, dock.y, dock.z), rotation, scale.set(1, 1, 1));
    rotation.setFromEuler(euler.set(piece.rx ?? 0, 0, piece.rz ?? 0));
    local.compose(position.set(piece.x, piece.y, piece.z), rotation, scale.set(piece.sx ?? 1, piece.sy ?? 1, piece.sz ?? 1));
    matrix.multiplyMatrices(root, local);
    slot.mesh.setMatrixAt(index, matrix);
  };
  const add = (dock: Dock, piece: Piece): void => {
    const slot = slots.get(piece.key);
    if (!slot || slot.count >= slot.mesh.instanceMatrix.count) return;
    write(dock, piece, slot.count++);
  };
  const movingParts = (dock: Dock, index: number, nowMs: number): void => {
    const travel = Math.sin(nowMs * 0.0012 + dock.phase) * 0.012;
    write(dock, { key: "spindle", x: 0.035, y: 0.26 + travel, z: 0, sx: 0.025, sy: 0.065, sz: 0.025 }, index);
    write(dock, { key: "cutter", x: 0.035, y: 0.215 + travel, z: 0, sx: 0.009, sy: 0.025, sz: 0.009 }, index);
    for (let i = 0; i < 3; i++) {
      write(dock, { key: "spoke", x: -0.045, y: 0.21, z: 0.11, sx: 0.085, sy: 0.008, sz: 0.008, rz: nowMs * 0.0008 + dock.phase + i * Math.PI / 3 }, index * 3 + i);
    }
  };
  const addInstance: Overlay["addInstance"] = (x, z, y, yaw, worldX, worldY) => {
    if (docks.length >= maxInstances) return -1;
    const dock: Dock = { x, y, z, yaw, phase: (worldX * 13 + worldY * 7) % 11 };
    const index = docks.length;
    docks.push(dock);
    add(dock, { key: "seat", x: 0, y: 0.0175, z: 0 });
    add(dock, { key: "lip", x: 0, y: 0.034, z: 0, rx: Math.PI / 2 });
    add(dock, { key: "iron", x: 0, y: 0.063, z: 0, sx: 0.21, sy: 0.055, sz: 0.18 });
    add(dock, { key: "dark", x: 0.025, y: 0.099, z: 0, sx: 0.16, sy: 0.018, sz: 0.145 });
    for (const side of [-1, 1]) {
      add(dock, { key: "iron", x: -0.05, y: 0.205, z: side * 0.085, sx: 0.05, sy: 0.235, sz: 0.038 });
      add(dock, { key: "brass", x: -0.02, y: 0.205, z: side * 0.085, sx: 0.012, sy: 0.19, sz: 0.042 });
      add(dock, { key: "steel", x: 0.035, y: 0.128, z: side * 0.065, sx: 0.15, sy: 0.014, sz: 0.014 });
      add(dock, { key: "steel", x: 0.035, y: 0.153, z: side * 0.03, sx: 0.075, sy: 0.028, sz: 0.018 });
    }
    add(dock, { key: "iron", x: -0.015, y: 0.32, z: 0, sx: 0.13, sy: 0.055, sz: 0.22 });
    add(dock, { key: "brass", x: 0.055, y: 0.32, z: 0, sx: 0.015, sy: 0.035, sz: 0.20 });
    add(dock, { key: "iron", x: 0.035, y: 0.29, z: 0, sx: 0.07, sy: 0.055, sz: 0.07 });
    add(dock, { key: "steel", x: 0.035, y: 0.16, z: 0, sx: 0.055, sy: 0.04, sz: 0.042 });
    add(dock, { key: "cyan", x: 0.071, y: 0.29, z: 0, sx: 0.004, sy: 0.012, sz: 0.04 });
    // A stepped magazine of spare cutting tools, beside the work bed.
    add(dock, { key: "brass", x: 0.085, y: 0.105, z: -0.10, sx: 0.10, sy: 0.025, sz: 0.045 });
    for (let i = 0; i < 4; i++) {
      add(dock, { key: "rod", x: 0.052 + i * 0.022, y: 0.132 + i * 0.004, z: -0.10, sx: 0.006, sy: 0.04 + i * 0.008, sz: 0.006 });
    }
    add(dock, { key: "wheel", x: -0.045, y: 0.21, z: 0.11 });
    add(dock, { key: "rod", x: -0.045, y: 0.21, z: 0.11, sx: 0.015, sy: 0.04, sz: 0.015, rx: Math.PI / 2 });
    add(dock, { key: "dark", x: -0.105, y: 0.09, z: 0, sx: 0.035, sy: 0.055, sz: 0.065 });
    add(dock, { key: "cyan", x: -0.124, y: 0.09, z: 0, sx: 0.006, sy: 0.025, sz: 0.04 });
    movingParts(dock, index, 0);
    slots.get("spindle")!.count++;
    slots.get("cutter")!.count++;
    slots.get("spoke")!.count += 3;
    return index;
  };
  const upload = (keys: Iterable<string>): void => {
    for (const key of keys) {
      const slot = slots.get(key)!;
      slot.mesh.count = slot.count;
      if (!slot.count) continue;
      slot.mesh.instanceMatrix.clearUpdateRanges();
      slot.mesh.instanceMatrix.addUpdateRange(0, slot.count * 16);
      slot.mesh.instanceMatrix.needsUpdate = true;
    }
  };
  return {
    addInstance,
    clear: () => { docks.length = 0; for (const slot of slots.values()) slot.count = 0; },
    commit: () => upload(slots.keys()),
    update: (nowMs) => {
      if (!docks.length) return;
      docks.forEach((dock, index) => movingParts(dock, index, nowMs));
      upload(["spindle", "cutter", "spoke"]);
    },
    dispose: () => {
      docks.length = 0;
      for (const { mesh } of slots.values()) { scene.remove(mesh); mesh.dispose(); }
      for (const geo of [box, rod, seat, lip, wheel]) geo.dispose();
      for (const mat of [iron, brass, steel, dark, cyan]) mat.dispose();
    }
  };
};
