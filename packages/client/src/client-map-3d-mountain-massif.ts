// True-3D mountains. Touching mountain tiles are drawn as one continuous
// range surface (client-map-3d-mountain-range.ts). A lone mountain (no
// orthogonal mountain neighbour) gets one of a few low-poly peak shapes
// (client-map-3d-mountain-shape.ts), turned, scaled and tinted per tile from
// the shared variation (client-map-mountain-variation.ts, which the 2D
// renderer uses too), plus an optional smaller second peak. One
// InstancedMesh per shape.
//
// River mountains (client-map-river-mountains.ts) get a gully cut toward the
// river: inside a range by the range surface, alone by their own gully shape
// turned toward the river. The river cascade (client-map-3d-river-cascade.ts)
// runs down that gully.
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
import { createMountainMaterial, createMountainShapeGeometry, type MountainShapeSpec } from "./client-map-3d-mountain-shape.js";
import { riverMountainFaceAt } from "./client-map-river-mountains/client-map-river-mountains.js";

/** A lone river mountain's shape: a gully down its +z side. */
export const RIVER_MOUNTAIN_SHAPE: MountainShapeSpec = { seed: 1, gully: true };
import { createMountainRange, isRangeTile, type MountainRange } from "./client-map-3d-mountain-range.js";

// Secondary peaks only get snow when they are not too small to carry it.
const SECONDARY_SNOW_MIN_SCALE = 0.6;
// Per-instance rock colour shift (multiplies the vertex colours).
const TINT_LIGHTNESS = 0.07;
const TINT_WARMTH = 0.025;

export type MountainMassifDeps = MountainNeighbourhoodLookup & {
  /** Rendered terrain height at a world corner (heightfield.cornerYAt): ranges rise from it. Defaults to 0. */
  readonly cornerYAt?: (cornerX: number, cornerZ: number) => number;
  /**
   * Unit direction (world x/y) a river mountain's gully turns toward -- where
   * its cascade leaves it; null for ordinary mountains. Defaults to the
   * current seed's river heads (riverMountainFaceAt) against `isMountainAt`.
   */
  readonly riverFaceAt?: (wx: number, wy: number) => { readonly dirX: number; readonly dirY: number } | null;
};

export type MountainMassif = {
  /** One InstancedMesh per mountain shape (lone mountains). */
  readonly meshes: readonly InstancedMesh[];
  /** The continuous surface drawn for touching mountain tiles. */
  readonly range: MountainRange;
  /** The neighbourhood lookup this massif was built with. */
  readonly lookup: MountainMassifDeps;
  /** Lone-mountain instances drawn after the last commit (all shapes, main + second peaks). */
  readonly instanceCount: () => number;
  /** Lone river mountains (gully shape) drawn after the last commit. */
  readonly riverMountainCount: () => number;
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
  // second peaks spread across the shapes; anything past capacity is dropped.
  const layers = Array.from({ length: MOUNTAIN_SHAPE_COUNT }, (_, i) =>
    createShapeLayer(createMountainShapeGeometry({ seed: i + 1 }), material, Math.max(1, maxInstances))
  );
  // Lone river mountains are few: a small layer of their own.
  const riverLayer = createShapeLayer(createMountainShapeGeometry(RIVER_MOUNTAIN_SHAPE), material, Math.max(1, Math.ceil(maxInstances / 16)));
  const allLayers = [...layers, riverLayer];
  for (const layer of allLayers) scene.add(layer.mesh);
  const riverFaceAt = deps.riverFaceAt ?? ((wx: number, wy: number) => riverMountainFaceAt(wx, wy, deps.isMountainAt));
  const range = createMountainRange(scene, { ...deps, riverFaceAt });

  const tempMatrix = new Matrix4();
  const tempPosition = new Vector3();
  const tempScale = new Vector3();
  const tempQuaternion = new Quaternion();
  const yAxis = new Vector3(0, 1, 0);
  const tempColor = new Color();
  let snowy = 0;

  const clear = (): void => {
    for (const layer of allLayers) layer.count = 0;
    snowy = 0;
    range.clear();
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
    if (isRangeTile(wx, wy, deps)) {
      range.addTile(x, z, wx, wy);
      return;
    }
    const riverFace = riverFaceAt(wx, wy);
    const variation = mountainVariationAt(wx, wy, mountainNeighbourhoodAt(wx, wy, deps));
    const color = rockColor(variation);
    const footprint = variation.footprintScale;
    const yaw = variation.yaw * 4; // shapes aren't 4-fold symmetric: use the full turn
    if (riverFace) {
      // The gully (+z) turned toward the river; no second peak over the cascade.
      addShape(riverLayer, x, z, surfaceY, Math.atan2(riverFace.dirX, riverFace.dirY), footprint, variation.heightScale, footprint, color, variation.snowLine);
      return;
    }
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
  };

  const commit = (): void => {
    range.commit();
    for (const layer of allLayers) {
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
    for (const layer of allLayers) {
      scene.remove(layer.mesh);
      layer.mesh.geometry.dispose();
      layer.mesh.dispose();
    }
    material.dispose();
    range.dispose();
  };

  return {
    meshes: allLayers.map((l) => l.mesh),
    range,
    lookup: deps,
    instanceCount: () => allLayers.reduce((n, l) => n + l.mesh.count, 0),
    riverMountainCount: () => riverLayer.mesh.count,
    snowyInstanceCount: () => snowy,
    clear,
    addInstance,
    commit,
    dispose
  };
};
