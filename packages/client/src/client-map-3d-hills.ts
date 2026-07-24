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
//
// Kept deliberately flat and sparse: a single tall dome per tile reads as a
// boulder, not a hill, and packing tiles wall-to-wall with mounds reads as a
// pebble carpet. A gentle, grass-toned swell with visible ground gaps
// between tiles reads as rolling terrain instead.
const MOUND_SIDES = 12;
const MOUND_HEIGHT_SEGMENTS = 6;

type MoundPos = {
  readonly ox: number;
  readonly oz: number;
  readonly radius: number;
  readonly height: number;
  readonly variant: 0 | 1;
};

// Two layouts so adjacent hills tiles don't look identical. A single broad,
// flat swell per tile (height well under radius) rather than several small
// tall domes — that's what reads as "hill" instead of "boulder pile".
const LAYOUT_CENTER: ReadonlyArray<MoundPos> = [
  { ox: 0.02, oz: -0.04, radius: 0.44, height: 0.16, variant: 0 }
];
const LAYOUT_OFFSET: ReadonlyArray<MoundPos> = [
  { ox: -0.08, oz: 0.06, radius: 0.4, height: 0.14, variant: 1 }
];

const LAYOUTS: ReadonlyArray<ReadonlyArray<MoundPos>> = [LAYOUT_CENTER, LAYOUT_OFFSET];

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
  // sits directly on surfaceY once scaled. Smooth (non-flat) shading and a
  // higher segment count than the mountain massif keep this reading as a
  // soft grassy swell rather than a faceted rock.
  const moundGeometry = new SphereGeometry(1, MOUND_SIDES, MOUND_HEIGHT_SEGMENTS, 0, Math.PI * 2, 0, Math.PI / 2);
  // Two grass-toned variants (a touch lighter/darker) so adjacent tiles'
  // mounds don't visually fuse into one shape.
  const moundMaterials: readonly [MeshStandardMaterial, MeshStandardMaterial] = [
    new MeshStandardMaterial({ color: "#7e9457", roughness: 0.88, metalness: 0, flatShading: false }),
    new MeshStandardMaterial({ color: "#6f8a4d", roughness: 0.88, metalness: 0, flatShading: false })
  ];

  const maxInstances = maxTiles;
  const moundMeshes: readonly [InstancedMesh, InstancedMesh] = [
    new InstancedMesh(moundGeometry, moundMaterials[0], maxInstances),
    new InstancedMesh(moundGeometry, moundMaterials[1], maxInstances)
  ];
  for (const mesh of moundMeshes) {
    mesh.frustumCulled = false;
    mesh.count = 0;
  }
  scene.add(moundMeshes[0], moundMeshes[1]);

  const tempMatrix = new Matrix4();
  const scaleMatrix = new Matrix4();
  const counts: [number, number] = [0, 0];

  const clear = (): void => {
    counts[0] = 0;
    counts[1] = 0;
  };

  const addInstance = (worldX: number, worldZ: number, surfaceY: number): void => {
    const layoutIdx = tileHash(worldX, worldZ, 13, LAYOUTS.length);
    const layout = LAYOUTS[layoutIdx]!;
    for (const mound of layout) {
      const mesh = moundMeshes[mound.variant];
      const count = counts[mound.variant];
      if (count >= maxInstances) continue;
      scaleMatrix.makeScale(mound.radius, mound.height, mound.radius);
      tempMatrix.copy(scaleMatrix);
      tempMatrix.setPosition(worldX + mound.ox, surfaceY, worldZ + mound.oz);
      mesh.setMatrixAt(count, tempMatrix);
      counts[mound.variant] += 1;
    }
  };

  const commit = (): void => {
    for (let i = 0; i < moundMeshes.length; i += 1) {
      moundMeshes[i]!.count = counts[i]!;
      moundMeshes[i]!.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    scene.remove(moundMeshes[0], moundMeshes[1]);
    moundGeometry.dispose();
    moundMaterials[0].dispose();
    moundMaterials[1].dispose();
  };

  return { clear, addInstance, commit, dispose };
};
