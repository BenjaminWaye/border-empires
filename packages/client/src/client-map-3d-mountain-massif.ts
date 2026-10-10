// True-3D mountains: each mountain tile gets one of a few sculpted mountain
// shapes (client-map-3d-mountain-shape.ts), turned, scaled and tinted per
// tile from the shared variation (client-map-mountain-variation.ts, which
// the 2D renderer uses too), plus an optional smaller second peak and low
// ridge saddles toward adjacent mountains. One InstancedMesh per shape.
import {
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  type MeshStandardMaterial,
  Quaternion,
  Scene,
  Vector3,
  type BufferGeometry
} from "three";
import {
  MOUNTAIN_SHAPE_COUNT,
  mountainNeighbourhoodAt,
  mountainVariationAt,
  type MountainNeighbourhoodLookup,
  type MountainVariation
} from "./client-map-mountain-variation/client-map-mountain-variation.js";
import { createMountainMaterial, createMountainShapeGeometry } from "./client-map-3d-mountain-shape.js";

// Secondary peaks only get snow when they are not too small to carry it.
const SECONDARY_SNOW_MIN_SCALE = 0.6;
// Ridge saddle between two adjacent mountain tiles: a low mountain stretched
// along the shared edge, on top of the ridge the heightfield raises there.
const SADDLE_LENGTH_SCALE = 1.0;
const SADDLE_WIDTH_SCALE = 0.55;
const SADDLE_HEIGHT_SCALE = 0.38;
// Per-instance rock colour shift (multiplies the vertex colours).
const TINT_LIGHTNESS = 0.07;
const TINT_WARMTH = 0.025;

export type MountainMassifDeps = MountainNeighbourhoodLookup;

export type MountainMassif = {
  /** One InstancedMesh per mountain shape. */
  readonly meshes: readonly InstancedMesh[];
  /** The neighbourhood lookup this massif was built with. */
  readonly lookup: MountainMassifDeps;
  /** Instances drawn after the last commit (all shapes, peaks + saddles). */
  readonly instanceCount: () => number;
  /** Instances added since the last clear that carry snow. */
  readonly snowyInstanceCount: () => number;
  readonly clear: () => void;
  /** (x, z) scene position of the tile centre, (wx, wy) its world tile -- the look is keyed on the latter. */
  readonly addInstance: (x: number, z: number, surfaceY: number, wx: number, wy: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

type ShapeLayer = {
  readonly mesh: InstancedMesh;
  readonly snowLines: InstancedBufferAttribute;
  count: number;
};

const createShapeLayer = (geometry: BufferGeometry, material: MeshStandardMaterial, capacity: number): ShapeLayer => {
  const snowLines = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  geometry.setAttribute("aSnowLine", snowLines);
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.frustumCulled = false;
  mesh.count = 0;
  // Mountains are the tallest terrain feature on the map -- without a real
  // cast shadow they float free of the raking sun's lighting model the
  // same way trees used to (client-map-3d-forest.ts).
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, snowLines, count: 0 };
};

export const createMountainMassifs = (scene: Scene, maxInstances: number, deps: MountainMassifDeps): MountainMassif => {
  const material = createMountainMaterial();
  // Each shape can hold every visible tile's main peak; second peaks and
  // saddles spread across the shapes, and anything past capacity is dropped.
  const layers = Array.from({ length: MOUNTAIN_SHAPE_COUNT }, (_, i) =>
    createShapeLayer(createMountainShapeGeometry({ seed: i + 1 }), material, Math.max(1, maxInstances))
  );
  for (const layer of layers) scene.add(layer.mesh);

  const tempMatrix = new Matrix4();
  const tempPosition = new Vector3();
  const tempScale = new Vector3();
  const tempQuaternion = new Quaternion();
  const yAxis = new Vector3(0, 1, 0);
  const tempColor = new Color();
  let snowy = 0;

  const clear = (): void => {
    for (const layer of layers) layer.count = 0;
    snowy = 0;
  };

  const rockColor = (variation: MountainVariation): Color => {
    const light = 1 + TINT_LIGHTNESS * variation.tint;
    const warm = TINT_WARMTH * variation.warmth;
    return tempColor.setRGB(light + warm, light, light - warm);
  };

  const addShape = (
    layer: ShapeLayer,
    x: number,
    z: number,
    groundY: number,
    yaw: number,
    sx: number,
    sy: number,
    sz: number,
    color: Color,
    snowLine: number
  ): void => {
    if (layer.count >= layer.mesh.instanceMatrix.count) return;
    tempQuaternion.setFromAxisAngle(yAxis, yaw);
    tempScale.set(sx, sy, sz);
    tempPosition.set(x, groundY, z);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    layer.mesh.setMatrixAt(layer.count, tempMatrix);
    layer.mesh.setColorAt(layer.count, color);
    layer.snowLines.setX(layer.count, snowLine);
    if (snowLine > 0) snowy += 1;
    layer.count += 1;
  };

  const addInstance = (x: number, z: number, surfaceY: number, wx: number, wy: number): void => {
    const variation = mountainVariationAt(wx, wy, mountainNeighbourhoodAt(wx, wy, deps));
    const color = rockColor(variation);
    const footprint = variation.footprintScale;
    const yaw = variation.yaw * 4; // shapes aren't 4-fold symmetric: use the full turn
    const main = layers[variation.shape]!;
    addShape(main, x, z, surfaceY, yaw, footprint, variation.heightScale, footprint, color, variation.snowLine);
    const second = variation.secondary;
    if (second) {
      const s = second.scale;
      const layer = layers[(variation.shape + 1) % layers.length]!;
      addShape(
        layer,
        x + second.dx,
        z + second.dz,
        surfaceY,
        yaw + 2.1,
        footprint * s,
        variation.heightScale * s,
        footprint * s,
        color,
        s >= SECONDARY_SNOW_MIN_SCALE ? variation.snowLine : 0
      );
    }
    const saddleLayer = layers[(variation.shape + 2) % layers.length]!;
    if (variation.saddleEast) {
      addShape(saddleLayer, x + 0.5, z, surfaceY, 0, SADDLE_LENGTH_SCALE, SADDLE_HEIGHT_SCALE, SADDLE_WIDTH_SCALE, color, 0);
    }
    if (variation.saddleSouth) {
      addShape(saddleLayer, x, z + 0.5, surfaceY, 0, SADDLE_WIDTH_SCALE, SADDLE_HEIGHT_SCALE, SADDLE_LENGTH_SCALE, color, 0);
    }
  };

  const commit = (): void => {
    for (const layer of layers) {
      const { mesh, count } = layer;
      mesh.count = count;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.clearUpdateRanges();
        mesh.instanceColor.addUpdateRange(0, count * 3);
        mesh.instanceColor.needsUpdate = true;
      }
      layer.snowLines.clearUpdateRanges();
      layer.snowLines.addUpdateRange(0, count);
      layer.snowLines.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    for (const layer of layers) {
      scene.remove(layer.mesh);
      layer.mesh.geometry.dispose();
      layer.mesh.dispose();
    }
    material.dispose();
  };

  return {
    meshes: layers.map((l) => l.mesh),
    lookup: deps,
    instanceCount: () => layers.reduce((n, l) => n + l.mesh.count, 0),
    snowyInstanceCount: () => snowy,
    clear,
    addInstance,
    commit,
    dispose
  };
};
