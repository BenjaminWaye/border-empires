import {
  BoxGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  Vector3
} from "three";

// "Skull on a spike" figure for barbarian-controlled tiles. The cranium
// is a flatter ovoid (anisotropic-scaled icosahedron) above a small jaw
// block with a row of teeth across the front, mounted on a dark wooden
// pole with a horizontal crossbone bar.
const POLE_HEIGHT = 0.7;
const POLE_RADIUS = 0.05;
const POLE_Y = POLE_HEIGHT * 0.5;

const CRANIUM_RADIUS = 0.16;
const CRANIUM_SCALE_Y = 0.78;
const CRANIUM_Y = POLE_HEIGHT + CRANIUM_RADIUS * CRANIUM_SCALE_Y * 0.95;

const JAW_W = 0.16;
const JAW_H = 0.07;
const JAW_D = 0.13;
const JAW_Y = CRANIUM_Y - CRANIUM_RADIUS * CRANIUM_SCALE_Y * 0.62 - JAW_H * 0.42;

const TOOTH_W = 0.022;
const TOOTH_H = 0.032;
const TOOTH_D = 0.018;
const TOOTH_Y = JAW_Y + JAW_H * 0.1;
const TOOTH_Z = JAW_D * 0.42;
const TOOTH_OFFSETS_X: ReadonlyArray<number> = [-0.04, -0.012, 0.012, 0.04];

const CROSSBONE_LENGTH = 0.34;
const CROSSBONE_THICKNESS = 0.05;
const CROSSBONE_Y = POLE_HEIGHT * 0.62;

export type BarbarianOverlay = {
  readonly clear: () => void;
  readonly addInstance: (worldX: number, worldZ: number, surfaceY: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createBarbarianOverlay = (scene: Scene, maxTiles: number): BarbarianOverlay => {
  const poleGeometry = new CylinderGeometry(POLE_RADIUS, POLE_RADIUS * 1.2, POLE_HEIGHT, 6);
  const poleMaterial = new MeshStandardMaterial({ color: "#3a2a20", roughness: 0.9, metalness: 0, flatShading: true });

  const craniumGeometry = new IcosahedronGeometry(CRANIUM_RADIUS, 0);
  const craniumMaterial = new MeshStandardMaterial({ color: "#ece5cf", roughness: 0.62, metalness: 0, flatShading: true });

  const jawGeometry = new BoxGeometry(JAW_W, JAW_H, JAW_D);
  const jawMaterial = new MeshStandardMaterial({ color: "#d8d0b6", roughness: 0.7, metalness: 0, flatShading: true });

  const toothGeometry = new BoxGeometry(TOOTH_W, TOOTH_H, TOOTH_D);
  const toothMaterial = new MeshStandardMaterial({ color: "#f6f0db", roughness: 0.6, metalness: 0, flatShading: true });

  const crossboneGeometry = new BoxGeometry(CROSSBONE_LENGTH, CROSSBONE_THICKNESS, CROSSBONE_THICKNESS);
  const crossboneMaterial = new MeshStandardMaterial({ color: "#d6cdb3", roughness: 0.7, metalness: 0, flatShading: true });

  const poleMesh = new InstancedMesh(poleGeometry, poleMaterial, maxTiles);
  const craniumMesh = new InstancedMesh(craniumGeometry, craniumMaterial, maxTiles);
  const jawMesh = new InstancedMesh(jawGeometry, jawMaterial, maxTiles);
  const toothMesh = new InstancedMesh(toothGeometry, toothMaterial, maxTiles * TOOTH_OFFSETS_X.length);
  const crossboneMesh = new InstancedMesh(crossboneGeometry, crossboneMaterial, maxTiles);

  const allMeshes = [poleMesh, craniumMesh, jawMesh, toothMesh, crossboneMesh];
  for (const m of allMeshes) {
    m.frustumCulled = false;
    m.count = 0;
  }
  scene.add(...allMeshes);

  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const identityQuaternion = new Quaternion();
  let count = 0;
  let toothCount = 0;

  const clear = (): void => {
    count = 0;
    toothCount = 0;
  };

  const addInstance = (worldX: number, worldZ: number, surfaceY: number): void => {
    if (count >= maxTiles) return;

    matrix.makeTranslation(worldX, surfaceY + POLE_Y, worldZ);
    poleMesh.setMatrixAt(count, matrix);

    // Anisotropic-scaled cranium: flatter Y for a skull-like silhouette.
    position.set(worldX, surfaceY + CRANIUM_Y, worldZ);
    scale.set(1, CRANIUM_SCALE_Y, 1);
    matrix.compose(position, identityQuaternion, scale);
    craniumMesh.setMatrixAt(count, matrix);

    matrix.makeTranslation(worldX, surfaceY + JAW_Y, worldZ);
    jawMesh.setMatrixAt(count, matrix);

    matrix.makeTranslation(worldX, surfaceY + CROSSBONE_Y, worldZ);
    crossboneMesh.setMatrixAt(count, matrix);

    for (const ox of TOOTH_OFFSETS_X) {
      if (toothCount >= toothMesh.count + TOOTH_OFFSETS_X.length * maxTiles) break;
      matrix.makeTranslation(worldX + ox, surfaceY + TOOTH_Y, worldZ + TOOTH_Z);
      toothMesh.setMatrixAt(toothCount, matrix);
      toothCount += 1;
    }

    count += 1;
  };

  const commit = (): void => {
    poleMesh.count = count;
    craniumMesh.count = count;
    jawMesh.count = count;
    crossboneMesh.count = count;
    toothMesh.count = toothCount;
    poleMesh.instanceMatrix.needsUpdate = true;
    craniumMesh.instanceMatrix.needsUpdate = true;
    jawMesh.instanceMatrix.needsUpdate = true;
    crossboneMesh.instanceMatrix.needsUpdate = true;
    toothMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(...allMeshes);
    poleGeometry.dispose();
    craniumGeometry.dispose();
    jawGeometry.dispose();
    toothGeometry.dispose();
    crossboneGeometry.dispose();
    poleMaterial.dispose();
    craniumMaterial.dispose();
    jawMaterial.dispose();
    toothMaterial.dispose();
    crossboneMaterial.dispose();
  };

  return { clear, addInstance, commit, dispose };
};
