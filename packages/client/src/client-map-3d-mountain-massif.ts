import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  Vector3
} from "three";
import {
  mountainNeighbourhoodAt,
  mountainVariationAt,
  type MountainNeighbourhoodLookup,
  type MountainVariation
} from "./client-map-mountain-variation/client-map-mountain-variation.js";

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
// Centre heights of the unscaled peak and snow cap above the surface. The
// peak's base sits at PEAK_RISE - PEAK_HEIGHT / 2; a height-scaled peak keeps
// that base and grows upward, and its snow cap scales with it so the cap
// still sits on the tip.
const PEAK_RISE = 0.55;
const SNOW_CAP_RISE = 1.05;
const PEAK_BASE_Y = PEAK_RISE - PEAK_HEIGHT / 2;

// Secondary peaks only get snow when they are not too small to carry it.
const SECONDARY_SNOW_MIN_SCALE = 0.6;
// Ridge saddle between two adjacent mountain tiles: a low, stretched peak at
// the shared edge, on top of the ridge the heightfield already raises there.
const SADDLE_LENGTH_SCALE = 1.0;
const SADDLE_WIDTH_SCALE = 0.55;
const SADDLE_HEIGHT_SCALE = 0.42;
// Per-instance rock colour shift (multiplies the material colour).
const TINT_LIGHTNESS = 0.07;
const TINT_WARMTH = 0.025;

// Per mountain tile: main peak + secondary peak + east and south saddles.
const PEAKS_PER_TILE = 4;
// Main snow cap + secondary snow cap.
const SNOW_CAPS_PER_TILE = 2;

export type MountainMassifDeps = MountainNeighbourhoodLookup;

export type MountainMassif = {
  readonly rockBaseMesh: InstancedMesh;
  readonly peakMesh: InstancedMesh;
  readonly snowCapMesh: InstancedMesh;
  readonly clear: () => void;
  /** (x, z) scene position of the tile centre, (wx, wy) its world tile -- the look is keyed on the latter. */
  readonly addInstance: (x: number, z: number, surfaceY: number, wx: number, wy: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

const commitInstances = (mesh: InstancedMesh, count: number): void => {
  mesh.count = count;
  mesh.instanceMatrix.clearUpdateRanges();
  mesh.instanceMatrix.addUpdateRange(0, count * 16);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.clearUpdateRanges();
    mesh.instanceColor.addUpdateRange(0, count * 3);
    mesh.instanceColor.needsUpdate = true;
  }
};

export const createMountainMassifs = (scene: Scene, maxInstances: number, deps: MountainMassifDeps): MountainMassif => {
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

  const peakCapacity = maxInstances * PEAKS_PER_TILE;
  const snowCapacity = maxInstances * SNOW_CAPS_PER_TILE;
  const rockBaseMesh = new InstancedMesh(rockBaseGeometry, rockBaseMaterial, maxInstances);
  const peakMesh = new InstancedMesh(peakGeometry, peakMaterial, peakCapacity);
  const snowCapMesh = new InstancedMesh(snowCapGeometry, snowCapMaterial, snowCapacity);
  for (const mesh of [rockBaseMesh, peakMesh, snowCapMesh]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    // Mountains are the tallest terrain feature on the map -- without a real
    // cast shadow they float free of the raking sun's lighting model the
    // same way trees used to (client-map-3d-forest.ts).
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  scene.add(rockBaseMesh, peakMesh, snowCapMesh);

  const tempMatrix = new Matrix4();
  const tempPosition = new Vector3();
  const tempScale = new Vector3();
  const tempQuaternion = new Quaternion();
  const yAxis = new Vector3(0, 1, 0);
  const tempColor = new Color();
  let rockCount = 0;
  let peakCount = 0;
  let snowCount = 0;

  const clear = (): void => {
    rockCount = 0;
    peakCount = 0;
    snowCount = 0;
  };

  const rockColor = (variation: MountainVariation): Color => {
    const light = 1 + TINT_LIGHTNESS * variation.tint;
    const warm = TINT_WARMTH * variation.warmth;
    return tempColor.setRGB(light + warm, light, light - warm);
  };

  // A peak (and optionally its snow cap) with its base on the ground at
  // (x, surfaceY, z): scaled (width, height, depth) and turned by yaw.
  const addPeak = (x: number, z: number, surfaceY: number, yaw: number, sx: number, sy: number, sz: number, color: Color, snow: boolean): void => {
    if (peakCount >= peakCapacity) return;
    tempQuaternion.setFromAxisAngle(yAxis, yaw);
    tempScale.set(sx, sy, sz);
    tempPosition.set(x, surfaceY + PEAK_BASE_Y + (PEAK_HEIGHT / 2) * sy, z);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    peakMesh.setMatrixAt(peakCount, tempMatrix);
    peakMesh.setColorAt(peakCount, color);
    peakCount += 1;
    if (!snow || snowCount >= snowCapacity) return;
    tempPosition.set(x, surfaceY + PEAK_BASE_Y + (SNOW_CAP_RISE - PEAK_BASE_Y) * sy, z);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    snowCapMesh.setMatrixAt(snowCount, tempMatrix);
    snowCount += 1;
  };

  const addInstance = (x: number, z: number, surfaceY: number, wx: number, wy: number): void => {
    if (rockCount >= maxInstances) return;
    const variation = mountainVariationAt(wx, wy, mountainNeighbourhoodAt(wx, wy, deps));
    const color = rockColor(variation);
    const footprint = variation.footprintScale;

    tempQuaternion.setFromAxisAngle(yAxis, variation.yaw);
    tempScale.set(footprint, 1, footprint);
    tempPosition.set(x, surfaceY + ROCK_BASE_RISE, z);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    rockBaseMesh.setMatrixAt(rockCount, tempMatrix);
    rockBaseMesh.setColorAt(rockCount, color);
    rockCount += 1;

    const yaw = PEAK_ROTATION_RADIANS + variation.yaw;
    addPeak(x, z, surfaceY, yaw, footprint, variation.heightScale, footprint, color, variation.snow);
    const second = variation.secondary;
    if (second) {
      const s = second.scale;
      addPeak(
        x + second.dx,
        z + second.dz,
        surfaceY,
        yaw + Math.PI / 8,
        footprint * s,
        variation.heightScale * s,
        footprint * s,
        color,
        variation.snow && s >= SECONDARY_SNOW_MIN_SCALE
      );
    }
    // The unrotated 4-sided cone is a diamond with its corners on the x/z
    // axes, so stretching it along the axis toward the neighbour gives a
    // ridge-shaped saddle.
    if (variation.saddleEast) {
      addPeak(x + 0.5, z, surfaceY, 0, SADDLE_LENGTH_SCALE, SADDLE_HEIGHT_SCALE, SADDLE_WIDTH_SCALE, color, false);
    }
    if (variation.saddleSouth) {
      addPeak(x, z + 0.5, surfaceY, 0, SADDLE_WIDTH_SCALE, SADDLE_HEIGHT_SCALE, SADDLE_LENGTH_SCALE, color, false);
    }
  };

  const commit = (): void => {
    commitInstances(rockBaseMesh, rockCount);
    commitInstances(peakMesh, peakCount);
    commitInstances(snowCapMesh, snowCount);
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
