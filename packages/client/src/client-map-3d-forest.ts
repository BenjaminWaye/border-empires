import {
  ConeGeometry,
  CylinderGeometry,
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
  readonly addInstance: (worldX: number, worldZ: number, surfaceY: number) => void;
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

  const trunkGeometry = new CylinderGeometry(0.075, 0.085, 0.7, 6);
  const trunkMaterial = new MeshStandardMaterial({ color: "#a56b58", roughness: 0.8, metalness: 0, flatShading: true });

  const maxInstances = maxTiles * TREES_PER_TILE;
  const pineCanopyMesh = new InstancedMesh(pineCanopyGeometry, pineCanopyMaterial, maxInstances);
  const spruceCanopyMesh = new InstancedMesh(spruceCanopyGeometry, spruceCanopyMaterial, maxInstances);
  const trunkMesh = new InstancedMesh(trunkGeometry, trunkMaterial, maxInstances * 2);

  for (const mesh of [pineCanopyMesh, spruceCanopyMesh, trunkMesh]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
  }
  scene.add(pineCanopyMesh, spruceCanopyMesh, trunkMesh);

  const tempMatrix = new Matrix4();
  const scaleMatrix = new Matrix4();
  let pineCount = 0;
  let spruceCount = 0;
  let trunkCount = 0;

  const clear = (): void => {
    pineCount = 0;
    spruceCount = 0;
    trunkCount = 0;
  };

  const addInstance = (worldX: number, worldZ: number, surfaceY: number): void => {
    const isSpruce = tileHash(worldX, worldZ, 11, 2) === 0;
    const layoutIdx = tileHash(worldX, worldZ, 7, LAYOUTS.length);
    const layout = LAYOUTS[layoutIdx]!;
    const canopyMesh = isSpruce ? spruceCanopyMesh : pineCanopyMesh;
    // Spruce apex is taller, so lift the canopy a touch so the trunk
    // stays hidden inside it.
    const canopyYAdjust = isSpruce ? 0.08 : 0;

    for (const tree of layout) {
      if (trunkCount >= trunkMesh.count + maxInstances * 2) continue;
      scaleMatrix.makeScale(tree.trunkScale, tree.trunkScale, tree.trunkScale);
      tempMatrix.copy(scaleMatrix);
      tempMatrix.setPosition(worldX + tree.ox, surfaceY + tree.trunkY, worldZ + tree.oz + TRUNK_Z_BIAS);
      trunkMesh.setMatrixAt(trunkCount, tempMatrix);
      trunkCount += 1;

      const canopyIdx = isSpruce ? spruceCount : pineCount;
      if (canopyIdx >= maxInstances) continue;
      scaleMatrix.makeScale(tree.canopyScale, tree.canopyScale, tree.canopyScale);
      tempMatrix.copy(scaleMatrix);
      tempMatrix.setPosition(worldX + tree.ox, surfaceY + tree.canopyY + canopyYAdjust, worldZ + tree.oz);
      canopyMesh.setMatrixAt(canopyIdx, tempMatrix);
      if (isSpruce) spruceCount += 1;
      else pineCount += 1;
    }
  };

  const commit = (): void => {
    pineCanopyMesh.count = pineCount;
    spruceCanopyMesh.count = spruceCount;
    trunkMesh.count = trunkCount;
    pineCanopyMesh.instanceMatrix.needsUpdate = true;
    spruceCanopyMesh.instanceMatrix.needsUpdate = true;
    trunkMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(pineCanopyMesh, spruceCanopyMesh, trunkMesh);
    pineCanopyGeometry.dispose();
    spruceCanopyGeometry.dispose();
    trunkGeometry.dispose();
    pineCanopyMaterial.dispose();
    spruceCanopyMaterial.dispose();
    trunkMaterial.dispose();
  };

  return { clear, addInstance, commit, dispose };
};
