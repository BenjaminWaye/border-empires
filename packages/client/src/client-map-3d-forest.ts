import { Color, InstancedMesh, Matrix4, Scene, type BufferGeometry } from "three";
import { riverBankTreeFilter } from "./client-map-3d-rivers/client-map-3d-river-bank-trees.js";
import { commitInstanceTint } from "./client-map-3d-instance-tint.js";
import { createTreeMaterial, driveTreeWind } from "./client-map-3d-tree-material.js";
import { createLeafGeometry, createPineGeometry, createSpruceGeometry } from "./client-map-3d-tree-models.js";
import { composeTreeInstance } from "./client-map-3d-tree-variation.js";

// Upper bound on trees per forest tile (the per-tile instance budget). The
// layouts below hold 7-9 trees each so adjacent tiles vary in density too.
export const TREES_PER_TILE = 9;

// Trees are sized to roughly half a mountain massif's height (peak ~1.2,
// client-map-3d-mountain-massif.ts) -- they used to stand ~1.6-1.8 tall,
// taller than the mountains. Smaller trees need more of them per tile to
// still read as a forest, hence the 7-9 tree layouts. The models themselves
// (trunk + canopy merged, one instance per tree) live in
// client-map-3d-tree-models.ts.

type TreePos = {
  readonly ox: number;
  readonly oz: number;
  readonly scale: number;
};

// Three spacing layouts so adjacent forest tiles read differently.
const LAYOUT_SCATTERED: ReadonlyArray<TreePos> = [
  { ox: -0.3, oz: -0.28, scale: 0.9 },
  { ox: 0.02, oz: -0.31, scale: 0.85 },
  { ox: 0.31, oz: -0.25, scale: 0.92 },
  { ox: -0.27, oz: 0.01, scale: 0.95 },
  { ox: 0.03, oz: 0.02, scale: 1.08 },
  { ox: 0.3, oz: 0.05, scale: 0.9 },
  { ox: -0.31, oz: 0.29, scale: 0.88 },
  { ox: 0.0, oz: 0.31, scale: 0.94 },
  { ox: 0.28, oz: 0.3, scale: 0.86 }
];

const LAYOUT_CLUSTER: ReadonlyArray<TreePos> = [
  { ox: -0.06, oz: -0.08, scale: 1.1 },
  { ox: 0.19, oz: -0.12, scale: 0.98 },
  { ox: -0.27, oz: -0.2, scale: 0.9 },
  { ox: 0.1, oz: 0.16, scale: 1.0 },
  { ox: -0.2, oz: 0.13, scale: 0.95 },
  { ox: 0.34, oz: 0.14, scale: 0.84 },
  { ox: -0.04, oz: 0.36, scale: 0.86 },
  { ox: 0.16, oz: -0.36, scale: 0.82 }
];

const LAYOUT_LINE: ReadonlyArray<TreePos> = [
  { ox: -0.36, oz: -0.16, scale: 0.84 },
  { ox: -0.19, oz: 0.04, scale: 0.95 },
  { ox: -0.02, oz: -0.14, scale: 1.02 },
  { ox: 0.12, oz: 0.1, scale: 1.08 },
  { ox: 0.28, oz: -0.08, scale: 0.95 },
  { ox: 0.36, oz: 0.2, scale: 0.84 },
  { ox: -0.3, oz: 0.3, scale: 0.8 }
];

// Exported so client-map-3d-tropical-forest.ts can reuse the same
// per-tile spacing/hash scheme instead of duplicating it.
export const LAYOUTS: ReadonlyArray<ReadonlyArray<TreePos>> = [
  LAYOUT_SCATTERED,
  LAYOUT_CLUSTER,
  LAYOUT_LINE
];

// Deterministic 0..N-1 from a (worldX, worldZ, salt) tuple, so the same
// forest tile always paints the same arrangement.
export const tileHash = (worldX: number, worldZ: number, salt: number, mod: number): number => {
  const h = ((worldX * 73856093) ^ (worldZ * 19349663) ^ (salt * 83492791)) >>> 0;
  return h % mod;
};

export type Forest = {
  readonly clear: () => void;
  /** `tint`: optional per-instance colour multiply (remembered tiles), see client-map-3d-instance-tint.ts. */
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldX: number, worldZ: number, tint?: Color) => void;
  // Decorative-only single sapling (leaf species, smaller scale) for light-
  // grass "scatter" tiles -- see isLightGrassScatterTile in
  // client-constants.ts. Shares the leaf instance pool with addInstance; a
  // tile is only ever real forest or scatter, never both, so this never grows
  // the mesh's total instance budget beyond maxTiles.
  readonly addSparseLeafInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldX: number, worldZ: number, tint?: Color) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

type SpeciesPool = {
  readonly mesh: InstancedMesh;
  readonly geometry: BufferGeometry;
  count: number;
};

export const createForest = (scene: Scene, maxTiles: number): Forest => {
  const maxInstances = maxTiles * TREES_PER_TILE;
  const material = createTreeMaterial();
  const createPool = (geometry: BufferGeometry): SpeciesPool => {
    const mesh = new InstancedMesh(geometry, material, maxInstances);
    mesh.frustumCulled = false;
    mesh.count = 0;
    // Trees cast onto the ground and onto each other/nearby structures --
    // without this they read as flatly lit and "pasted on" instead of
    // grounded, especially under client-map-3d-atmosphere.ts's raking sun.
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    driveTreeWind(mesh);
    return { mesh, geometry, count: 0 };
  };
  // Pine (lighter teal-green tiers), spruce (taller, narrower, deeper green)
  // and leaf/deciduous (a broad rounded crown, so forest tiles read as mixed
  // woodland instead of uniform conifers). Scene order is pine, spruce, leaf.
  const pine = createPool(createPineGeometry());
  const spruce = createPool(createSpruceGeometry());
  const leaf = createPool(createLeafGeometry());
  const pools = [pine, spruce, leaf];
  scene.add(...pools.map((pool) => pool.mesh));

  const tempMatrix = new Matrix4();
  const tempColor = new Color();

  const place = (pool: SpeciesPool, x: number, y: number, z: number, scale: number, worldX: number, worldZ: number, slot: number, tint?: Color): void => {
    if (pool.count >= maxInstances) return;
    composeTreeInstance({ x, y, z, scale, worldX, worldZ, slot, tint }, tempMatrix, tempColor);
    pool.mesh.setMatrixAt(pool.count, tempMatrix);
    pool.mesh.setColorAt(pool.count, tempColor);
    pool.count += 1;
  };

  const clear = (): void => {
    for (const pool of pools) pool.count = 0;
  };

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, worldX: number, worldZ: number, tint?: Color): void => {
    // Hash on the tile's absolute WORLD position, not its scene-relative
    // placement (sceneX/sceneZ) -- the scene anchor (sceneOrigin in
    // client-map-3d.ts) only updates when a terrain rebuild commits, so the
    // same world tile's sceneX/sceneZ drifts between rebuilds as the camera
    // pans. Hashing on that drifting value reshuffled which tree
    // variant/layout every visible tile got each time a rebuild fired --
    // trees visibly flipping into a different arrangement mid-pan.
    const species = tileHash(worldX, worldZ, 11, 3); // 0 = pine, 1 = spruce, 2 = leaf
    const layout = LAYOUTS[tileHash(worldX, worldZ, 7, LAYOUTS.length)]!;
    const inRiverBank = riverBankTreeFilter(worldX, worldZ);
    const pool = pools[species]!;
    layout.forEach((tree, slot) => {
      if (inRiverBank?.(tree.ox, tree.oz)) return;
      place(pool, sceneX + tree.ox, surfaceY, sceneZ + tree.oz, tree.scale, worldX, worldZ, slot, tint);
    });
  };

  const addSparseLeafInstance = (sceneX: number, sceneZ: number, surfaceY: number, worldX: number, worldZ: number, tint?: Color): void => {
    // A single, smaller leaf sapling -- deliberately not a full layout entry
    // (those are sized/spaced for a dense forest tile) -- with a bit of
    // jitter so a run of scatter tiles doesn't look like a stamped grid.
    const jitterX = (tileHash(worldX, worldZ, 31, 100) / 100 - 0.5) * 0.4;
    const jitterZ = (tileHash(worldX, worldZ, 37, 100) / 100 - 0.5) * 0.4;
    const scale = 0.65 + tileHash(worldX, worldZ, 41, 100) / 100 * 0.15;
    place(leaf, sceneX + jitterX, surfaceY, sceneZ + jitterZ, scale, worldX, worldZ, 0, tint);
  };

  const commit = (): void => {
    for (const pool of pools) {
      pool.mesh.count = pool.count;
      pool.mesh.instanceMatrix.clearUpdateRanges();
      pool.mesh.instanceMatrix.addUpdateRange(0, pool.count * 16);
      pool.mesh.instanceMatrix.needsUpdate = true;
      commitInstanceTint(pool.mesh);
    }
  };

  const dispose = (): void => {
    for (const pool of pools) {
      scene.remove(pool.mesh);
      pool.geometry.dispose();
    }
    material.dispose();
  };

  return { clear, addInstance, addSparseLeafInstance, commit, dispose };
};
