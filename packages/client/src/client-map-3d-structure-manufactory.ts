// Civilian manufacturing: a sawtooth-roof workshop, belt-driven machinery,
// twin exhaust stacks and a loading yard of components and shipping crates.
// Coin represents credit backed by its output; this building produces goods.
import {
  BoxGeometry, CylinderGeometry, Euler, InstancedMesh, Matrix4,
  MeshStandardMaterial, Quaternion, TorusGeometry, Vector3
} from "three";
import type { StructurePieceBuilder } from "./client-map-3d-structure-builder.js";
import type { EconomicStructureLayout } from "./client-map-3d-structure-economic.js";

export type ManufactoryHandle = {
  readonly layout: EconomicStructureLayout;
  readonly clear: () => void;
  readonly update: (nowMs: number) => void;
};

type MovingPiece = {
  mesh: InstancedMesh;
  index: number;
  ox: number;
  oy: number;
  oz: number;
  rotY: number;
  phase: number;
};
type FactoryDrive = { x: number; y: number; z: number; phase: number; pieces: MovingPiece[] };

export const registerManufactoryStructures = (builder: StructurePieceBuilder): ManufactoryHandle => {
  const capacity = builder.maxTiles;
  const scale = 0.8;
  const halfPi = Math.PI / 2;
  const material = (color: string, metalness = 0.15): MeshStandardMaterial =>
    new MeshStandardMaterial({ color, metalness, roughness: 0.72, flatShading: true });
  const iron = material("#302f2d", 0.6);
  const brick = material("#76513e");
  const stone = material("#8b8170");
  const roof = material("#475353", 0.5);
  const brass = material("#b08a45", 0.75);
  const steel = material("#98aaa6", 0.65);
  const wood = material("#98764b");
  const dark = material("#242a27");
  const glass = material("#bad4cd", 0.3);
  const amber = new MeshStandardMaterial({
    color: "#f5bb68", emissive: "#d28335", emissiveIntensity: 0.35,
    roughness: 0.6, metalness: 0.1, flatShading: true
  });
  const box = (key: string, x: number, y: number, z: number, mat: MeshStandardMaterial, copies = 1): void =>
    builder.makeSlot(key, new BoxGeometry(x, y, z), mat, capacity * copies);
  box("mfBase", 0.78, 0.045, 0.70, stone);
  box("mfFloor", 0.52, 0.025, 0.48, dark);
  box("mfBack", 0.52, 0.25, 0.035, brick);
  box("mfSide", 0.035, 0.25, 0.45, brick, 2);
  box("mfFrontPier", 0.045, 0.25, 0.035, brick, 3);
  box("mfLintel", 0.52, 0.045, 0.04, stone);
  box("mfRoofSlope", 0.56, 0.025, 0.17, roof, 3);
  box("mfRoofLight", 0.49, 0.065, 0.012, glass, 3);
  box("mfRoofFrame", 0.54, 0.012, 0.02, iron, 6);
  box("mfWindow", 0.012, 0.085, 0.09, glass, 4);
  box("mfWindowBar", 0.018, 0.09, 0.009, iron, 4);
  box("mfStackBase", 0.09, 0.10, 0.09, brick, 2);
  builder.makeSlot("mfStack", new CylinderGeometry(0.029, 0.035, 0.30, 8), iron, capacity * 2);
  builder.makeSlot("mfStackRim", new TorusGeometry(0.032, 0.008, 5, 10), brass, capacity * 4);
  box("mfBoiler", 0.14, 0.17, 0.19, iron);
  box("mfFurnace", 0.075, 0.055, 0.012, amber);
  builder.makeSlot("mfPipe", new CylinderGeometry(0.012, 0.012, 0.22, 6), brass, capacity * 2);
  box("mfMachineBed", 0.22, 0.045, 0.13, iron);
  box("mfMachinePost", 0.025, 0.16, 0.035, steel, 2);
  box("mfMachineHead", 0.20, 0.04, 0.045, brass);
  box("mfPart", 0.065, 0.035, 0.09, steel, 6);
  box("mfConveyor", 0.10, 0.035, 0.24, iron);
  builder.makeSlot("mfRoller", new CylinderGeometry(0.012, 0.012, 0.11, 6), steel, capacity * 5);
  box("mfPallet", 0.19, 0.022, 0.14, wood, 2);
  box("mfCrate", 0.115, 0.10, 0.105, wood, 3);
  box("mfCrateBand", 0.012, 0.105, 0.11, iron, 6);
  box("mfDock", 0.27, 0.055, 0.15, stone);
  box("mfDriveSupport", 0.045, 0.18, 0.055, iron, 2);
  builder.makeSlot("mfFlywheel", new CylinderGeometry(0.18, 0.18, 0.05, 16), dark, capacity);
  builder.makeSlot("mfRim", new TorusGeometry(0.18, 0.018, 6, 20), brass, capacity);
  box("mfSpoke", 0.30, 0.018, 0.018, brass, 3);
  builder.makeSlot("mfHub", new CylinderGeometry(0.035, 0.035, 0.075, 10), steel, capacity);
  box("mfBelt", 0.025, 0.035, 0.30, dark, 2);

  // One drive per visible factory, bounded by the builder's tile capacity.
  const drives: FactoryDrive[] = [];
  const layout: EconomicStructureLayout = (x, y, z) => {
    const add = (
      key: string, ox: number, oy: number, oz: number,
      sx = 1, sy = 1, sz = 1, rotY = 0, rotX = 0, rotZ = 0
    ): number => builder.addPiece(
      key, x, y, z, ox * scale, oy * scale, oz * scale,
      sx * scale, sy * scale, sz * scale, rotY, rotX, rotZ
    );
    add("mfBase", 0, 0.025, 0);
    add("mfFloor", -0.04, 0.06, -0.06);
    add("mfBack", -0.04, 0.19, -0.28);
    for (const side of [-1, 1]) {
      add("mfSide", -0.04 + side * 0.25, 0.19, -0.065);
      for (const depth of [-0.17, -0.035]) {
        add("mfWindow", -0.04 + side * 0.27, 0.225, depth);
        add("mfWindowBar", -0.04 + side * 0.277, 0.225, depth);
      }
    }
    // Three repeated northlight bays give the factory its sawtooth silhouette.
    for (const depth of [-0.20, -0.05, 0.10]) {
      add("mfRoofSlope", -0.04, 0.345, depth, 1, 1, 1, 0, 0.4);
      add("mfRoofLight", -0.04, 0.345, depth - 0.075);
      add("mfRoofFrame", -0.04, 0.381, depth - 0.075);
      add("mfRoofFrame", -0.04, 0.313, depth - 0.075);
    }
    for (const ox of [-0.29, -0.04, 0.21]) add("mfFrontPier", ox, 0.19, 0.16);
    add("mfLintel", -0.04, 0.30, 0.16);
    for (const [ox, height] of [[-0.20, 1.15], [0.09, 0.9]] as const) {
      add("mfStackBase", ox, 0.35, -0.22);
      add("mfStack", ox, 0.39 + 0.15 * height, -0.22, 1, height);
      add("mfStackRim", ox, 0.39 + 0.30 * height, -0.22, 1, 1, 1, 0, halfPi);
      add("mfStackRim", ox, 0.40, -0.22, 1, 1, 1, 0, halfPi);
    }
    add("mfBoiler", -0.18, 0.15, -0.12);
    add("mfFurnace", -0.18, 0.14, -0.018);
    add("mfPipe", -0.25, 0.29, -0.12);
    add("mfPipe", -0.14, 0.39, -0.12, 1, 1, 1, 0, 0, halfPi);
    // A visible machine shop assembles rectangular components, not coins.
    add("mfMachineBed", -0.14, 0.10, 0.13);
    for (const ox of [-0.23, -0.05]) add("mfMachinePost", ox, 0.185, 0.10);
    add("mfMachineHead", -0.14, 0.255, 0.10);
    add("mfPart", -0.14, 0.145, 0.15);
    add("mfConveyor", -0.12, 0.09, 0.25);
    for (let i = 0; i < 5; i += 1) {
      add("mfRoller", -0.12, 0.115, 0.16 + i * 0.038, 1, 1, 1, 0, 0, halfPi);
    }
    add("mfPart", -0.12, 0.145, 0.24);
    add("mfDock", 0.17, 0.075, 0.25);
    add("mfPallet", 0.17, 0.115, 0.25);
    add("mfPallet", -0.28, 0.075, 0.27);
    for (const [ox, oy, oz] of [[0.10, 0.175, 0.26], [0.23, 0.175, 0.26], [0.17, 0.28, 0.26]] as const) {
      add("mfCrate", ox, oy, oz);
      for (const offset of [-0.035, 0.035]) add("mfCrateBand", ox + offset, oy, oz);
    }
    for (let i = 0; i < 3; i += 1) add("mfPart", -0.28, 0.11 + i * 0.035, 0.27);
    for (const depth of [-0.12, 0.06]) add("mfDriveSupport", 0.30, 0.15, depth);
    for (const height of [0.12, 0.30]) add("mfBelt", 0.30, height, -0.08);

    const pieces: MovingPiece[] = [];
    const moving = (key: string, rotY = 0, phase = 0, ox = 0.30): void => {
      const index = add(key, ox, 0.23, -0.02, 1, 1, 1, rotY, phase, halfPi);
      const mesh = builder.getMesh(key);
      if (index >= 0 && mesh && !builder.isConstructionGated()) {
        pieces.push({ mesh, index, ox: ox * scale, oy: 0.23 * scale, oz: -0.02 * scale, rotY, phase });
      }
    };
    moving("mfFlywheel");
    moving("mfRim", halfPi);
    for (let i = 0; i < 3; i += 1) moving("mfSpoke", 0, i * Math.PI / 3, 0.333);
    moving("mfHub", 0, 0, 0.34);
    if (pieces.length && drives.length < capacity) {
      drives.push({ x, y, z, phase: (x * 1.7 + z * 2.3) % (2 * Math.PI), pieces });
    }
  };

  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const euler = new Euler();
  const pieceScale = new Vector3(scale, scale, scale);
  const animatedMeshes = ["mfFlywheel", "mfRim", "mfSpoke", "mfHub"]
    .map((key) => builder.getMesh(key))
    .filter((mesh): mesh is InstancedMesh => mesh !== undefined);
  const update = (nowMs: number): void => {
    if (!drives.length) return;
    for (const drive of drives) {
      for (const piece of drive.pieces) {
        euler.set(nowMs * 0.001 + drive.phase + piece.phase, piece.rotY, halfPi, "XYZ");
        rotation.setFromEuler(euler);
        position.set(drive.x + piece.ox, drive.y + piece.oy, drive.z + piece.oz);
        matrix.compose(position, rotation, pieceScale);
        piece.mesh.setMatrixAt(piece.index, matrix);
      }
    }
    for (const mesh of animatedMeshes) {
      if (!mesh.count) continue;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  return { layout, clear: () => { drives.length = 0; }, update };
};
