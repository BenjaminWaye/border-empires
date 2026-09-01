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
  TorusGeometry,
  Vector3
} from "three";

export type StructurePieceGeometry =
  | BoxGeometry
  | ConeGeometry
  | CylinderGeometry
  | IcosahedronGeometry
  | OctahedronGeometry
  | SphereGeometry
  | TorusGeometry;

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
  ) => number;
  // Animation hooks: overwrite one instance's matrix after it was placed, and
  // flag just that slot's used prefix for a partial GPU re-upload. Families
  // that animate per-frame call these from their own `update(nowMs)`.
  readonly setMatrixAt: (key: string, index: number, matrix: Matrix4) => void;
  readonly uploadSlot: (key: string) => void;
  // Resolves a slot's InstancedMesh once so per-frame animation code can call
  // mesh.setMatrixAt/instanceMatrix directly instead of paying a Map lookup
  // (via setMatrixAt/uploadSlot) on every animated piece, every frame.
  readonly getMesh: (key: string) => InstancedMesh | undefined;
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
  // material reused by TITANIUM_WORKS + FOUNDRY + ADVANCED_TITANIUM_WORKS, or the
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
    // Every economic/late-game/civic/infrastructure/industrial/manpower/
    // worldbreaker/imperial-exchange/astral-dock/population-bureau structure
    // piece funnels through this one factory, so casting/receiving real
    // shadows here covers all of them at once instead of touching each
    // per-family file. Town buildings, forts, watchtowers, mountains, and
    // docks build their InstancedMeshes directly rather than through this
    // shared builder, so they're each wired up separately at their own
    // construction sites. Still not covered: resource deposits (farm/fish/
    // fur/iron/gems, titanium, umbrite), Relay Beacon, Shard, Trade Nexus,
    // and the Aether Tower -- those still only get the flat contact-shadow
    // decal.
    mesh.castShadow = true;
    mesh.receiveShadow = true;
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
  ): number => {
    const slot = slots.get(key);
    if (!slot || slot.count >= slot.cap) return -1;
    position.set(sceneX + ox, surfaceY + oy, sceneZ + oz);
    scale.set(sx, sy, sz);
    if (rotX === 0 && rotY === 0 && rotZ === 0) {
      matrix.compose(position, identityQuat, scale);
    } else {
      tmpEuler.set(rotX, rotY, rotZ, "XYZ");
      tmpQuat.setFromEuler(tmpEuler);
      matrix.compose(position, tmpQuat, scale);
    }
    const index = slot.count;
    slot.mesh.setMatrixAt(index, matrix);
    slot.count += 1;
    return index;
  };

  const setMatrixAt = (key: string, index: number, target: Matrix4): void => {
    const slot = slots.get(key);
    if (!slot || index < 0 || index >= slot.count) return;
    slot.mesh.setMatrixAt(index, target);
  };

  const uploadSlot = (key: string): void => {
    const slot = slots.get(key);
    if (!slot || slot.count === 0) return;
    slot.mesh.instanceMatrix.clearUpdateRanges();
    slot.mesh.instanceMatrix.addUpdateRange(0, slot.count * 16);
    slot.mesh.instanceMatrix.needsUpdate = true;
  };

  const getMesh = (key: string): InstancedMesh | undefined => slots.get(key)?.mesh;

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
    builder: { maxTiles, makeSlot, addPiece, setMatrixAt, uploadSlot, getMesh },
    clear,
    commit,
    dispose
  };
};
