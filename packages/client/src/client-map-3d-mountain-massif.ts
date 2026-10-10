import {
  BoxGeometry,
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
import { riverMountainFaceAt } from "./client-map-river-mountains/client-map-river-mountains.js";

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

export type MountainMassifDeps = MountainNeighbourhoodLookup & {
  /**
   * Unit direction (world x/y) a river mountain's face turns toward -- where
   * its cascade leaves it (client-map-river-mountains.ts); null for ordinary
   * mountains. Defaults to the current seed's river heads
   * (riverMountainFaceAt) against `isMountainAt`.
   */
  readonly riverFaceAt?: (wx: number, wy: number) => { readonly dirX: number; readonly dirY: number } | null;
};

// River mountain cleft: a dark slot set into the face above the cascade.
const CLEFT_WIDTH = 0.12;
const CLEFT_DEPTH = 0.02;
// Fractions of the peak face's height (from its base) the cleft spans: the
// cascade (client-map-3d-river-cascade.ts) leaves from its lower end.
export const CLEFT_FROM = 0.38;
const CLEFT_TO = 0.6;

/**
 * Height above the massif's ground (its surfaceY) of the rock straight out
 * from the centre along a face the river mountain turned toward the river
 * (peak face and rock base face, both met flat-on), at horizontal distance
 * `rho`; -Infinity past the rock base. The cascade lies on this profile.
 */
export const riverFaceProfileY = (rho: number, heightScale: number, footprint: number): number => {
  const faceInset = Math.cos(Math.PI / PEAK_SIDES); // flat face vs corner radius
  const peakReach = PEAK_RADIUS * footprint * faceInset;
  const peakHeight = PEAK_HEIGHT * heightScale;
  const peakY = rho <= peakReach ? PEAK_BASE_Y + peakHeight * (1 - rho / peakReach) : -Infinity;
  const rockInset = Math.cos(Math.PI / ROCK_BASE_SIDES);
  const rockTop = ROCK_BASE_RADIUS_TOP * footprint * rockInset;
  const rockBottom = ROCK_BASE_RADIUS_BOTTOM * footprint * rockInset;
  const rockTopY = ROCK_BASE_RISE + ROCK_BASE_HEIGHT / 2;
  const rockY = rho <= rockTop ? rockTopY : rho <= rockBottom ? rockTopY - ROCK_BASE_HEIGHT * ((rho - rockTop) / (rockBottom - rockTop)) : -Infinity;
  return Math.max(peakY, rockY);
};

/** Horizontal distance from the centre where the peak face is `fraction` of the way up its height. */
export const riverFacePeakRho = (fraction: number, footprint: number): number =>
  PEAK_RADIUS * footprint * Math.cos(Math.PI / PEAK_SIDES) * (1 - fraction);

/** Height above ground of the peak face `fraction` of the way up. */
export const riverFacePeakY = (fraction: number, heightScale: number): number => PEAK_BASE_Y + PEAK_HEIGHT * heightScale * fraction;

export type MountainMassif = {
  readonly rockBaseMesh: InstancedMesh;
  readonly peakMesh: InstancedMesh;
  readonly snowCapMesh: InstancedMesh;
  readonly cleftMesh: InstancedMesh;
  /** The neighbourhood lookup this massif was built with (the river cascade shapes itself to the same peaks). */
  readonly lookup: MountainMassifDeps;
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

  const riverFaceAt = deps.riverFaceAt ?? ((wx: number, wy: number) => riverMountainFaceAt(wx, wy, deps.isMountainAt));
  const cleftGeometry = new BoxGeometry(1, 1, 1);
  const cleftMaterial = new MeshStandardMaterial({ color: "#3a3a41", roughness: 1, metalness: 0, flatShading: true });
  const cleftMesh = new InstancedMesh(cleftGeometry, cleftMaterial, maxInstances);
  cleftMesh.frustumCulled = false;
  cleftMesh.count = 0;
  scene.add(cleftMesh);

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
  let cleftCount = 0;
  const tiltQuaternion = new Quaternion();
  const xAxis = new Vector3(1, 0, 0);

  const clear = (): void => {
    rockCount = 0;
    peakCount = 0;
    snowCount = 0;
    cleftCount = 0;
  };

  // A dark slot down the middle of the face pointing along `faceAngle`
  // (radians, x = sin, z = cos), lying on the face's slope.
  const addCleft = (x: number, z: number, surfaceY: number, faceAngle: number, heightScale: number, footprint: number): void => {
    if (cleftCount >= maxInstances) return;
    const reach = riverFacePeakRho(0, footprint);
    const height = PEAK_HEIGHT * heightScale;
    const mid = (CLEFT_FROM + CLEFT_TO) / 2;
    const rho = riverFacePeakRho(mid, footprint);
    // Box Y runs up the face: tilt it back toward the axis, then turn to the face.
    tiltQuaternion.setFromAxisAngle(xAxis, -Math.atan2(reach, height));
    tempQuaternion.setFromAxisAngle(yAxis, faceAngle).multiply(tiltQuaternion);
    tempScale.set(CLEFT_WIDTH * footprint, Math.hypot(reach, height) * (CLEFT_TO - CLEFT_FROM), CLEFT_DEPTH);
    tempPosition.set(x + Math.sin(faceAngle) * rho, surfaceY + riverFacePeakY(mid, heightScale), z + Math.cos(faceAngle) * rho);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    cleftMesh.setMatrixAt(cleftCount, tempMatrix);
    cleftCount += 1;
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
    // A river mountain turns a flat face (rock base and peak) toward its
    // river and carries a cleft there; no second peak to hide the cascade.
    const riverFace = riverFaceAt(wx, wy);
    const faceAngle = riverFace ? Math.atan2(riverFace.dirX, riverFace.dirY) : 0;

    tempQuaternion.setFromAxisAngle(yAxis, riverFace ? faceAngle - Math.PI / ROCK_BASE_SIDES : variation.yaw);
    tempScale.set(footprint, 1, footprint);
    tempPosition.set(x, surfaceY + ROCK_BASE_RISE, z);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    rockBaseMesh.setMatrixAt(rockCount, tempMatrix);
    rockBaseMesh.setColorAt(rockCount, color);
    rockCount += 1;

    const yaw = riverFace ? faceAngle - Math.PI / PEAK_SIDES : PEAK_ROTATION_RADIANS + variation.yaw;
    addPeak(x, z, surfaceY, yaw, footprint, variation.heightScale, footprint, color, variation.snow);
    if (riverFace) addCleft(x, z, surfaceY, faceAngle, variation.heightScale, footprint);
    const second = riverFace ? null : variation.secondary;
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
    commitInstances(cleftMesh, cleftCount);
  };

  const dispose = (): void => {
    scene.remove(rockBaseMesh, peakMesh, snowCapMesh, cleftMesh);
    cleftGeometry.dispose();
    cleftMaterial.dispose();
    rockBaseGeometry.dispose();
    peakGeometry.dispose();
    snowCapGeometry.dispose();
    rockBaseMaterial.dispose();
    peakMaterial.dispose();
    snowCapMaterial.dispose();
  };

  return { rockBaseMesh, peakMesh, snowCapMesh, cleftMesh, lookup: deps, clear, addInstance, commit, dispose };
};
