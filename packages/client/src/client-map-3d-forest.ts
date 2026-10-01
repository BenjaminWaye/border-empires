import {
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Scene
} from "three";

// Upper bound on trees per forest tile (the per-tile instance budget). The
// layouts below hold 7-9 trees each so adjacent tiles vary in density too.
export const TREES_PER_TILE = 9;
const TRUNK_Z_BIAS = 0.02;

// Trees are sized to roughly half a mountain massif's height (peak ~1.2,
// client-map-3d-mountain-massif.ts) -- they used to stand ~1.6-1.8 tall,
// taller than the mountains. Smaller trees need more of them per tile to
// still read as a forest, hence the 7-9 tree layouts.
// Trunk base sits a touch below the surface so it never floats on slopes.
export const TRUNK_HEIGHT = 0.26;
const TRUNK_CENTER_Y = TRUNK_HEIGHT / 2 - 0.03;
// Canopy center heights (at tree scale 1), measured from the tile surface.
const PINE_CANOPY_HEIGHT = 0.42;
const PINE_CANOPY_Y = 0.17 + PINE_CANOPY_HEIGHT / 2;
const SPRUCE_CANOPY_HEIGHT = 0.46;
const SPRUCE_CANOPY_Y = 0.15 + SPRUCE_CANOPY_HEIGHT / 2;
const LEAF_CANOPY_RADIUS = 0.17;
const LEAF_CANOPY_Y = 0.19 + LEAF_CANOPY_RADIUS;

export type TreePos = {
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
  const pineCanopyGeometry = new ConeGeometry(0.15, PINE_CANOPY_HEIGHT, 5, 1, false);
  const pineCanopyMaterial = new MeshStandardMaterial({ color: "#6a8574", roughness: 0.88, metalness: 0, flatShading: true });

  // Spruce: taller, narrower, deeper green.
  const spruceCanopyGeometry = new ConeGeometry(0.12, SPRUCE_CANOPY_HEIGHT, 5, 1, false);
  const spruceCanopyMaterial = new MeshStandardMaterial({ color: "#52735c", roughness: 0.9, metalness: 0, flatShading: true });

  // Leaf/deciduous: a broad, rounded canopy (low-poly icosahedron, matching
  // the rest of the forest's flat-shaded look) in a warmer, lighter green --
  // the first non-conifer species, so forest tiles read as mixed woodland
  // instead of uniform pine/spruce. Detail 0 (20 triangles, not 80): at this
  // size the extra subdivision is invisible, and with 7-9 trees per tile the
  // canopy triangle count (drawn twice -- color + shadow pass) adds up.
  const leafCanopyGeometry = new IcosahedronGeometry(LEAF_CANOPY_RADIUS, 0);
  const leafCanopyMaterial = new MeshStandardMaterial({ color: "#7a9c4e", roughness: 0.86, metalness: 0, flatShading: true });

  const trunkGeometry = new CylinderGeometry(0.03, 0.04, TRUNK_HEIGHT, 5);
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
    const canopyY = species === 1 ? SPRUCE_CANOPY_Y : species === 2 ? LEAF_CANOPY_Y : PINE_CANOPY_Y;

    for (const tree of layout) {
      if (trunkCount >= maxInstances * 2) continue;
      scaleMatrix.makeScale(tree.scale, tree.scale, tree.scale);
      tempMatrix.copy(scaleMatrix);
      tempMatrix.setPosition(sceneX + tree.ox, surfaceY + TRUNK_CENTER_Y * tree.scale, sceneZ + tree.oz + TRUNK_Z_BIAS);
      trunkMesh.setMatrixAt(trunkCount, tempMatrix);
      trunkCount += 1;

      const canopyIdx = species === 1 ? spruceCount : species === 2 ? leafCount : pineCount;
      if (canopyIdx >= maxInstances) continue;
      tempMatrix.copy(scaleMatrix);
      tempMatrix.setPosition(sceneX + tree.ox, surfaceY + canopyY * tree.scale, sceneZ + tree.oz);
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
    const scale = 0.65 + tileHash(worldX, worldZ, 41, 100) / 100 * 0.15;
    // Single combined guard (unlike addInstance's per-mesh checks above,
    // which can legitimately leave an orphan trunk if only the canopy pool
    // is full mid-layout): a scatter tile only ever adds one trunk + one
    // canopy together, so gate both on whichever pool has less room left,
    // rather than risk a canopy-less trunk (or vice versa) near the budget.
    if (trunkCount < maxInstances * 2 && leafCount < maxInstances) {
      scaleMatrix.makeScale(scale, scale, scale);
      tempMatrix.copy(scaleMatrix);
      tempMatrix.setPosition(sceneX + jitterX, surfaceY + TRUNK_CENTER_Y * scale, sceneZ + jitterZ + TRUNK_Z_BIAS);
      trunkMesh.setMatrixAt(trunkCount, tempMatrix);
      trunkCount += 1;
      scaleMatrix.makeScale(scale, scale, scale);
      tempMatrix.copy(scaleMatrix);
      tempMatrix.setPosition(sceneX + jitterX, surfaceY + LEAF_CANOPY_Y * scale, sceneZ + jitterZ);
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
