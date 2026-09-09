import {
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Scene
} from "three";

const TREES_PER_TILE = 5;
const TRUNK_Z_BIAS = 0.04;

type TreePos = {
  readonly ox: number;
  readonly oz: number;
  readonly canopyScale: number;
  readonly trunkScale: number;
  readonly trunkY: number;
  readonly canopyY: number;
};

// Three spacing layouts so adjacent forest tiles read differently.
// Each layout has 5 trees so the per-tile budget stays constant.
const LAYOUT_SCATTERED: ReadonlyArray<TreePos> = [
  { ox: -0.26, oz: -0.24, canopyScale: 0.84, trunkScale: 0.9, trunkY: 0.56, canopyY: 1.1 },
  { ox: 0.24, oz: -0.23, canopyScale: 0.82, trunkScale: 0.88, trunkY: 0.56, canopyY: 1.08 },
  { ox: 0.02, oz: 0.0, canopyScale: 1, trunkScale: 1, trunkY: 0.6, canopyY: 1.16 },
  { ox: -0.24, oz: 0.25, canopyScale: 0.8, trunkScale: 0.86, trunkY: 0.55, canopyY: 1.07 },
  { ox: 0.25, oz: 0.24, canopyScale: 0.81, trunkScale: 0.87, trunkY: 0.55, canopyY: 1.08 }
];

const LAYOUT_CLUSTER: ReadonlyArray<TreePos> = [
  { ox: -0.05, oz: -0.07, canopyScale: 1.05, trunkScale: 1.05, trunkY: 0.62, canopyY: 1.20 },
  { ox: -0.18, oz: 0.05, canopyScale: 0.92, trunkScale: 0.95, trunkY: 0.58, canopyY: 1.13 },
  { ox: 0.10, oz: -0.18, canopyScale: 0.90, trunkScale: 0.93, trunkY: 0.58, canopyY: 1.12 },
  { ox: 0.16, oz: 0.10, canopyScale: 0.88, trunkScale: 0.92, trunkY: 0.57, canopyY: 1.10 },
  { ox: -0.02, oz: 0.20, canopyScale: 0.86, trunkScale: 0.91, trunkY: 0.56, canopyY: 1.09 }
];

const LAYOUT_LINE: ReadonlyArray<TreePos> = [
  { ox: -0.32, oz: -0.08, canopyScale: 0.78, trunkScale: 0.84, trunkY: 0.54, canopyY: 1.05 },
  { ox: -0.14, oz: 0.05, canopyScale: 0.92, trunkScale: 0.95, trunkY: 0.58, canopyY: 1.13 },
  { ox: 0.04, oz: -0.04, canopyScale: 1.02, trunkScale: 1.02, trunkY: 0.61, canopyY: 1.18 },
  { ox: 0.20, oz: 0.08, canopyScale: 0.90, trunkScale: 0.93, trunkY: 0.58, canopyY: 1.12 },
  { ox: 0.34, oz: -0.06, canopyScale: 0.78, trunkScale: 0.84, trunkY: 0.54, canopyY: 1.05 }
];

const LAYOUTS: ReadonlyArray<ReadonlyArray<TreePos>> = [
  LAYOUT_SCATTERED,
  LAYOUT_CLUSTER,
  LAYOUT_LINE
];

// Deterministic 0..N-1 from a (worldX, worldZ, salt) tuple, so the same
// forest tile always paints the same arrangement.
const tileHash = (worldX: number, worldZ: number, salt: number, mod: number): number => {
  const h = ((worldX * 73856093) ^ (worldZ * 19349663) ^ (salt * 83492791)) >>> 0;
  return h % mod;
};

export type Forest = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldX: number, worldZ: number) => void;
  // Decorative-only single sapling (leaf species, smaller scale) for light-
  // grass "scatter" tiles -- see isLightGrassScatterTile in
  // client-constants.ts. Shares the same leaf canopy/trunk instance pools as
  // addInstance; a tile is only ever real forest or scatter, never both, so
  // this never grows the meshes' total instance budget beyond maxTiles.
  readonly addSparseLeafInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldX: number, worldZ: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createForest = (scene: Scene, maxTiles: number): Forest => {
  // Pine: 5-sided cone, lighter teal-green.
  const pineCanopyGeometry = new ConeGeometry(0.22, 0.92, 5, 1, false);
  const pineCanopyMaterial = new MeshStandardMaterial({ color: "#6a8574", roughness: 0.88, metalness: 0, flatShading: true });

  // Spruce: taller, narrower, deeper green.
  const spruceCanopyGeometry = new ConeGeometry(0.18, 1.18, 5, 1, false);
  const spruceCanopyMaterial = new MeshStandardMaterial({ color: "#52735c", roughness: 0.9, metalness: 0, flatShading: true });

  // Leaf/deciduous: a broad, rounded canopy (low-poly icosahedron, matching
  // the rest of the forest's flat-shaded look) in a warmer, lighter green --
  // the first non-conifer species, so forest tiles read as mixed woodland
  // instead of uniform pine/spruce.
  const leafCanopyGeometry = new IcosahedronGeometry(0.34, 1);
  const leafCanopyMaterial = new MeshStandardMaterial({ color: "#7a9c4e", roughness: 0.86, metalness: 0, flatShading: true });

  const trunkGeometry = new CylinderGeometry(0.075, 0.085, 0.7, 6);
  const trunkMaterial = new MeshStandardMaterial({ color: "#a56b58", roughness: 0.8, metalness: 0, flatShading: true });

  const maxInstances = maxTiles * TREES_PER_TILE;
  const pineCanopyMesh = new InstancedMesh(pineCanopyGeometry, pineCanopyMaterial, maxInstances);
  const spruceCanopyMesh = new InstancedMesh(spruceCanopyGeometry, spruceCanopyMaterial, maxInstances);
  const leafCanopyMesh = new InstancedMesh(leafCanopyGeometry, leafCanopyMaterial, maxInstances);
  const trunkMesh = new InstancedMesh(trunkGeometry, trunkMaterial, maxInstances * 2);

  for (const mesh of [pineCanopyMesh, spruceCanopyMesh, leafCanopyMesh, trunkMesh]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    // Trees cast onto the ground and onto each other/nearby structures --
    // without this they read as flatly lit and "pasted on" instead of
    // grounded, especially under client-map-3d-atmosphere.ts's raking sun.
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  scene.add(pineCanopyMesh, spruceCanopyMesh, leafCanopyMesh, trunkMesh);

  const tempMatrix = new Matrix4();
  const scaleMatrix = new Matrix4();
  let pineCount = 0;
  let spruceCount = 0;
  let leafCount = 0;
  let trunkCount = 0;

  const clear = (): void => {
    pineCount = 0;
    spruceCount = 0;
    leafCount = 0;
    trunkCount = 0;
  };

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, worldX: number, worldZ: number): void => {
    // Hash on the tile's absolute WORLD position, not its scene-relative
    // placement (sceneX/sceneZ) -- the scene anchor (sceneOrigin in
    // client-map-3d.ts) only updates when a terrain rebuild commits, so the
    // same world tile's sceneX/sceneZ drifts between rebuilds as the camera
    // pans. Hashing on that drifting value reshuffled which tree
    // variant/layout every visible tile got each time a rebuild fired --
    // trees visibly flipping into a different arrangement mid-pan.
    const species = tileHash(worldX, worldZ, 11, 3); // 0 = pine, 1 = spruce, 2 = leaf
    const layoutIdx = tileHash(worldX, worldZ, 7, LAYOUTS.length);
    const layout = LAYOUTS[layoutIdx]!;
    const canopyMesh = species === 1 ? spruceCanopyMesh : species === 2 ? leafCanopyMesh : pineCanopyMesh;
    // Spruce's apex is taller than the trunk expects, so lift its canopy a
    // touch to keep the trunk hidden inside it. Leaf canopies are already
    // centered wide enough that they don't need the same adjustment.
    const canopyYAdjust = species === 1 ? 0.08 : 0;

    for (const tree of layout) {
      if (trunkCount >= trunkMesh.count + maxInstances * 2) continue;
      scaleMatrix.makeScale(tree.trunkScale, tree.trunkScale, tree.trunkScale);
      tempMatrix.copy(scaleMatrix);
      tempMatrix.setPosition(sceneX + tree.ox, surfaceY + tree.trunkY, sceneZ + tree.oz + TRUNK_Z_BIAS);
      trunkMesh.setMatrixAt(trunkCount, tempMatrix);
      trunkCount += 1;

      const canopyIdx = species === 1 ? spruceCount : species === 2 ? leafCount : pineCount;
      if (canopyIdx >= maxInstances) continue;
      scaleMatrix.makeScale(tree.canopyScale, tree.canopyScale, tree.canopyScale);
      tempMatrix.copy(scaleMatrix);
      tempMatrix.setPosition(sceneX + tree.ox, surfaceY + tree.canopyY + canopyYAdjust, sceneZ + tree.oz);
      canopyMesh.setMatrixAt(canopyIdx, tempMatrix);
      if (species === 1) spruceCount += 1;
      else if (species === 2) leafCount += 1;
      else pineCount += 1;
    }
  };

  const addSparseLeafInstance = (sceneX: number, sceneZ: number, surfaceY: number, worldX: number, worldZ: number): void => {
    // A single, smaller leaf sapling -- deliberately not a full layout entry
    // (those are sized/spaced for a dense forest tile) -- with a bit of
    // jitter so a run of scatter tiles doesn't look like a stamped grid.
    const jitterX = (tileHash(worldX, worldZ, 31, 100) / 100 - 0.5) * 0.4;
    const jitterZ = (tileHash(worldX, worldZ, 37, 100) / 100 - 0.5) * 0.4;
    const scale = 0.55 + tileHash(worldX, worldZ, 41, 100) / 100 * 0.15;
    // Single combined guard (unlike addInstance's per-mesh checks above,
    // which can legitimately leave an orphan trunk if only the canopy pool
    // is full mid-layout): a scatter tile only ever adds one trunk + one
    // canopy together, so gate both on whichever pool has less room left,
    // rather than risk a canopy-less trunk (or vice versa) near the budget.
    if (trunkCount < trunkMesh.count + maxInstances * 2 && leafCount < maxInstances) {
      scaleMatrix.makeScale(scale, scale, scale);
      tempMatrix.copy(scaleMatrix);
      tempMatrix.setPosition(sceneX + jitterX, surfaceY + 0.6 * scale, sceneZ + jitterZ + TRUNK_Z_BIAS);
      trunkMesh.setMatrixAt(trunkCount, tempMatrix);
      trunkCount += 1;
      scaleMatrix.makeScale(scale, scale, scale);
      tempMatrix.copy(scaleMatrix);
      tempMatrix.setPosition(sceneX + jitterX, surfaceY + 1.16 * scale, sceneZ + jitterZ);
      leafCanopyMesh.setMatrixAt(leafCount, tempMatrix);
      leafCount += 1;
    }
  };

  const commit = (): void => {
    pineCanopyMesh.count = pineCount;
    spruceCanopyMesh.count = spruceCount;
    leafCanopyMesh.count = leafCount;
    trunkMesh.count = trunkCount;
    pineCanopyMesh.instanceMatrix.clearUpdateRanges();
    pineCanopyMesh.instanceMatrix.addUpdateRange(0, pineCanopyMesh.count * 16);
    pineCanopyMesh.instanceMatrix.needsUpdate = true;
    spruceCanopyMesh.instanceMatrix.clearUpdateRanges();
    spruceCanopyMesh.instanceMatrix.addUpdateRange(0, spruceCanopyMesh.count * 16);
    spruceCanopyMesh.instanceMatrix.needsUpdate = true;
    leafCanopyMesh.instanceMatrix.clearUpdateRanges();
    leafCanopyMesh.instanceMatrix.addUpdateRange(0, leafCanopyMesh.count * 16);
    leafCanopyMesh.instanceMatrix.needsUpdate = true;
    trunkMesh.instanceMatrix.clearUpdateRanges();
    trunkMesh.instanceMatrix.addUpdateRange(0, trunkMesh.count * 16);
    trunkMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(pineCanopyMesh, spruceCanopyMesh, leafCanopyMesh, trunkMesh);
    pineCanopyGeometry.dispose();
    spruceCanopyGeometry.dispose();
    leafCanopyGeometry.dispose();
    trunkGeometry.dispose();
    pineCanopyMaterial.dispose();
    spruceCanopyMaterial.dispose();
    leafCanopyMaterial.dispose();
    trunkMaterial.dispose();
  };

  return { clear, addInstance, addSparseLeafInstance, commit, dispose };
};
