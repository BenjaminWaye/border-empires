import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3
} from "three";

export type StructurePieceGeometry =
  | BoxGeometry
  | ConeGeometry
  | CylinderGeometry
  | IcosahedronGeometry
  | OctahedronGeometry
  | SphereGeometry;

type Slot = { mesh: InstancedMesh; count: number; cap: number };

// Builder API used by per-family files to register their meshes and
// place instances. Families never touch the underlying slots/scene
// directly — they go through makeSlot + addPiece so the orchestrator
// owns lifecycle (commit, clear, dispose).
export type StructurePieceBuilder = {
  readonly maxTiles: number;
  readonly makeSlot: (
    key: string,
    geo: StructurePieceGeometry,
    mat: MeshStandardMaterial,
    capacity: number
  ) => void;
  readonly addPiece: (
    key: string,
    sceneX: number,
    surfaceY: number,
    sceneZ: number,
    ox: number,
    oy: number,
    oz: number,
    sx?: number,
    sy?: number,
    sz?: number,
    rotY?: number,
    rotX?: number,
    rotZ?: number
  ) => void;
};

export type StructurePieceBuilderInternals = {
  readonly builder: StructurePieceBuilder;
  readonly clear: () => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createStructurePieceBuilder = (
  scene: Scene,
  maxTiles: number
): StructurePieceBuilderInternals => {
  const slots = new Map<string, Slot>();
  // Sets so a geo/material shared across multiple slots (e.g. a forge
  // material reused by IRONWORKS + FOUNDRY + ADVANCED_IRONWORKS, or the
  // blue crystal shared between OBSERVATORY + MINE + CRYSTAL_SYNTHESIZER)
  // is only disposed once.
  const ownedGeos = new Set<BufferGeometry>();
  const ownedMaterials = new Set<MeshStandardMaterial>();

  const makeSlot = (
    key: string,
    geo: StructurePieceGeometry,
    mat: MeshStandardMaterial,
    cap: number
  ): void => {
    const mesh = new InstancedMesh(geo, mat, cap);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    slots.set(key, { mesh, count: 0, cap });
    ownedGeos.add(geo);
    ownedMaterials.add(mat);
  };

  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const identityQuat = new Quaternion();
  const tmpEuler = new Euler();
  const tmpQuat = new Quaternion();

  const addPiece = (
    key: string,
    sceneX: number,
    surfaceY: number,
    sceneZ: number,
    ox: number,
    oy: number,
    oz: number,
    sx = 1,
    sy = 1,
    sz = 1,
    rotY = 0,
    rotX = 0,
    rotZ = 0
  ): void => {
    const slot = slots.get(key);
    if (!slot || slot.count >= slot.cap) return;
    position.set(sceneX + ox, surfaceY + oy, sceneZ + oz);
    scale.set(sx, sy, sz);
    if (rotX === 0 && rotY === 0 && rotZ === 0) {
      matrix.compose(position, identityQuat, scale);
    } else {
      tmpEuler.set(rotX, rotY, rotZ, "XYZ");
      tmpQuat.setFromEuler(tmpEuler);
      matrix.compose(position, tmpQuat, scale);
    }
    slot.mesh.setMatrixAt(slot.count, matrix);
    slot.count += 1;
  };

  const clear = (): void => {
    for (const slot of slots.values()) slot.count = 0;
  };

  const commit = (): void => {
    for (const slot of slots.values()) {
      slot.mesh.count = slot.count;
      slot.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMaterials) m.dispose();
  };

  return {
    builder: { maxTiles, makeSlot, addPiece },
    clear,
    commit,
    dispose
  };
};
