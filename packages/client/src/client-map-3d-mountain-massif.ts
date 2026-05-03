import {
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Scene
} from "three";

const ROCK_BASE_HEIGHT = 0.62;
const ROCK_BASE_RADIUS_TOP = 0.42;
const ROCK_BASE_RADIUS_BOTTOM = 0.78;
const ROCK_BASE_SIDES = 6;
const PEAK_HEIGHT = 1.24;
const PEAK_RADIUS = 0.715;
const PEAK_SIDES = 4;
const SNOW_CAP_HEIGHT = 0.34;
const SNOW_CAP_RADIUS = 0.19;

const PEAK_ROTATION_RADIANS = Math.PI / 4;

const ROCK_BASE_RISE = 0.05;
const PEAK_RISE = 0.55;
const SNOW_CAP_RISE = 1.05;

export type MountainMassif = {
  readonly rockBaseMesh: InstancedMesh;
  readonly peakMesh: InstancedMesh;
  readonly snowCapMesh: InstancedMesh;
  readonly clear: () => void;
  readonly addInstance: (worldX: number, worldZ: number, surfaceY: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createMountainMassifs = (scene: Scene, maxInstances: number): MountainMassif => {
  const rockBaseGeometry = new CylinderGeometry(
    ROCK_BASE_RADIUS_TOP,
    ROCK_BASE_RADIUS_BOTTOM,
    ROCK_BASE_HEIGHT,
    ROCK_BASE_SIDES,
    1,
    false
  );
  const peakGeometry = new ConeGeometry(PEAK_RADIUS, PEAK_HEIGHT, PEAK_SIDES, 1, false);
  const snowCapGeometry = new ConeGeometry(SNOW_CAP_RADIUS, SNOW_CAP_HEIGHT, PEAK_SIDES, 1, false);

  const rockBaseMaterial = new MeshStandardMaterial({
    color: "#7b7479",
    roughness: 0.94,
    metalness: 0,
    flatShading: true
  });
  const peakMaterial = new MeshStandardMaterial({
    color: "#535760",
    roughness: 0.9,
    metalness: 0,
    flatShading: true
  });
  const snowCapMaterial = new MeshStandardMaterial({
    color: "#f3f7ff",
    roughness: 0.62,
    metalness: 0,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });

  const rockBaseMesh = new InstancedMesh(rockBaseGeometry, rockBaseMaterial, maxInstances);
  const peakMesh = new InstancedMesh(peakGeometry, peakMaterial, maxInstances);
  const snowCapMesh = new InstancedMesh(snowCapGeometry, snowCapMaterial, maxInstances);
  rockBaseMesh.frustumCulled = false;
  peakMesh.frustumCulled = false;
  snowCapMesh.frustumCulled = false;
  rockBaseMesh.count = 0;
  peakMesh.count = 0;
  snowCapMesh.count = 0;
  scene.add(rockBaseMesh, peakMesh, snowCapMesh);

  const tempMatrix = new Matrix4();
  const peakRotation = new Matrix4().makeRotationY(PEAK_ROTATION_RADIANS);
  let count = 0;

  const clear = (): void => {
    count = 0;
  };

  const addInstance = (worldX: number, worldZ: number, surfaceY: number): void => {
    if (count >= maxInstances) return;
    tempMatrix.makeTranslation(worldX, surfaceY + ROCK_BASE_RISE, worldZ);
    rockBaseMesh.setMatrixAt(count, tempMatrix);
    tempMatrix.copy(peakRotation);
    tempMatrix.setPosition(worldX, surfaceY + PEAK_RISE, worldZ);
    peakMesh.setMatrixAt(count, tempMatrix);
    tempMatrix.copy(peakRotation);
    tempMatrix.setPosition(worldX, surfaceY + SNOW_CAP_RISE, worldZ);
    snowCapMesh.setMatrixAt(count, tempMatrix);
    count += 1;
  };

  const commit = (): void => {
    rockBaseMesh.count = count;
    peakMesh.count = count;
    snowCapMesh.count = count;
    rockBaseMesh.instanceMatrix.needsUpdate = true;
    peakMesh.instanceMatrix.needsUpdate = true;
    snowCapMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(rockBaseMesh, peakMesh, snowCapMesh);
    rockBaseGeometry.dispose();
    peakGeometry.dispose();
    snowCapGeometry.dispose();
    rockBaseMaterial.dispose();
    peakMaterial.dispose();
    snowCapMaterial.dispose();
  };

  return { rockBaseMesh, peakMesh, snowCapMesh, clear, addInstance, commit, dispose };
};
