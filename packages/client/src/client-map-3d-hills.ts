import {
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Scene,
  SphereGeometry
} from "three";

// Hills are not a Terrain code (see hills-terrain.ts) — the heightfield keeps
// its normal grass elevation under a hills tile. These low, rounded mound
// props are the only 3D geometry that makes a hills tile visually distinct,
// mirroring how forest trees decorate a grass tile without raising it.
const MOUNDS_PER_TILE = 2;
const MOUND_SIDES = 8;

type MoundPos = {
  readonly ox: number;
  readonly oz: number;
  readonly radius: number;
  readonly height: number;
};

// Two layouts so adjacent hills tiles don't look identical.
const LAYOUT_PAIR: ReadonlyArray<MoundPos> = [
  { ox: -0.18, oz: 0.08, radius: 0.34, height: 0.42 },
  { ox: 0.2, oz: -0.14, radius: 0.28, height: 0.34 }
];
const LAYOUT_OFFSET: ReadonlyArray<MoundPos> = [
  { ox: -0.22, oz: -0.18, radius: 0.3, height: 0.36 },
  { ox: 0.16, oz: 0.2, radius: 0.32, height: 0.4 }
];

const LAYOUTS: ReadonlyArray<ReadonlyArray<MoundPos>> = [LAYOUT_PAIR, LAYOUT_OFFSET];

// Deterministic 0..N-1 from a (worldX, worldZ, salt) tuple, so the same
// hills tile always paints the same arrangement.
const tileHash = (worldX: number, worldZ: number, salt: number, mod: number): number => {
  const h = ((worldX * 73856093) ^ (worldZ * 19349663) ^ (salt * 83492791)) >>> 0;
  return h % mod;
};

export type HillMounds = {
  readonly clear: () => void;
  readonly addInstance: (worldX: number, worldZ: number, surfaceY: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createHillMounds = (scene: Scene, maxTiles: number): HillMounds => {
  // Upper hemisphere only (theta 0..PI/2): a dome with a flat circular base
  // at local y=0, so instances need no vertical centering offset — the base
  // sits directly on surfaceY once scaled.
  const moundGeometry = new SphereGeometry(1, MOUND_SIDES, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const moundMaterial = new MeshStandardMaterial({
    color: "#9c8f56",
    roughness: 0.92,
    metalness: 0,
    flatShading: true
  });

  const maxInstances = maxTiles * MOUNDS_PER_TILE;
  const moundMesh = new InstancedMesh(moundGeometry, moundMaterial, maxInstances);
  moundMesh.frustumCulled = false;
  moundMesh.count = 0;
  scene.add(moundMesh);

  const tempMatrix = new Matrix4();
  const scaleMatrix = new Matrix4();
  let count = 0;

  const clear = (): void => {
    count = 0;
  };

  const addInstance = (worldX: number, worldZ: number, surfaceY: number): void => {
    const layoutIdx = tileHash(worldX, worldZ, 13, LAYOUTS.length);
    const layout = LAYOUTS[layoutIdx]!;
    for (const mound of layout) {
      if (count >= maxInstances) return;
      scaleMatrix.makeScale(mound.radius, mound.height, mound.radius);
      tempMatrix.copy(scaleMatrix);
      tempMatrix.setPosition(worldX + mound.ox, surfaceY, worldZ + mound.oz);
      moundMesh.setMatrixAt(count, tempMatrix);
      count += 1;
    }
  };

  const commit = (): void => {
    moundMesh.count = count;
    moundMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(moundMesh);
    moundGeometry.dispose();
    moundMaterial.dispose();
  };

  return { clear, addInstance, commit, dispose };
};
