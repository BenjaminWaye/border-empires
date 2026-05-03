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

const TREE_LAYOUT = [
  { ox: -0.26, oz: -0.24, canopyScale: 0.84, trunkScale: 0.9, trunkY: 0.56, canopyY: 1.1 },
  { ox: 0.24, oz: -0.23, canopyScale: 0.82, trunkScale: 0.88, trunkY: 0.56, canopyY: 1.08 },
  { ox: 0.02, oz: 0.0, canopyScale: 1, trunkScale: 1, trunkY: 0.6, canopyY: 1.16 },
  { ox: -0.24, oz: 0.25, canopyScale: 0.8, trunkScale: 0.86, trunkY: 0.55, canopyY: 1.07 },
  { ox: 0.25, oz: 0.24, canopyScale: 0.81, trunkScale: 0.87, trunkY: 0.55, canopyY: 1.08 }
] as const;

export type Forest = {
  readonly canopyMesh: InstancedMesh;
  readonly trunkMesh: InstancedMesh;
  readonly clear: () => void;
  readonly addInstance: (worldX: number, worldZ: number, surfaceY: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createForest = (scene: Scene, maxTiles: number): Forest => {
  const canopyGeometry = new ConeGeometry(0.22, 0.92, 5, 1, false);
  const trunkGeometry = new CylinderGeometry(0.075, 0.085, 0.7, 6);
  const canopyMaterial = new MeshStandardMaterial({ color: "#6a8574", roughness: 0.88, metalness: 0, flatShading: true });
  const trunkMaterial = new MeshStandardMaterial({ color: "#a56b58", roughness: 0.8, metalness: 0, flatShading: true });

  const maxInstances = maxTiles * TREES_PER_TILE;
  const canopyMesh = new InstancedMesh(canopyGeometry, canopyMaterial, maxInstances);
  const trunkMesh = new InstancedMesh(trunkGeometry, trunkMaterial, maxInstances);
  canopyMesh.frustumCulled = false;
  trunkMesh.frustumCulled = false;
  canopyMesh.count = 0;
  trunkMesh.count = 0;
  scene.add(canopyMesh, trunkMesh);

  const tempMatrix = new Matrix4();
  const scaleMatrix = new Matrix4();
  let count = 0;

  const clear = (): void => {
    count = 0;
  };

  const addInstance = (worldX: number, worldZ: number, surfaceY: number): void => {
    if (count + TREES_PER_TILE > maxInstances) return;
    for (const tree of TREE_LAYOUT) {
      scaleMatrix.makeScale(tree.trunkScale, tree.trunkScale, tree.trunkScale);
      tempMatrix.copy(scaleMatrix);
      tempMatrix.setPosition(worldX + tree.ox, surfaceY + tree.trunkY, worldZ + tree.oz + TRUNK_Z_BIAS);
      trunkMesh.setMatrixAt(count, tempMatrix);

      scaleMatrix.makeScale(tree.canopyScale, tree.canopyScale, tree.canopyScale);
      tempMatrix.copy(scaleMatrix);
      tempMatrix.setPosition(worldX + tree.ox, surfaceY + tree.canopyY, worldZ + tree.oz);
      canopyMesh.setMatrixAt(count, tempMatrix);
      count += 1;
    }
  };

  const commit = (): void => {
    canopyMesh.count = count;
    trunkMesh.count = count;
    canopyMesh.instanceMatrix.needsUpdate = true;
    trunkMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(canopyMesh, trunkMesh);
    canopyGeometry.dispose();
    trunkGeometry.dispose();
    canopyMaterial.dispose();
    trunkMaterial.dispose();
  };

  return { canopyMesh, trunkMesh, clear, addInstance, commit, dispose };
};
