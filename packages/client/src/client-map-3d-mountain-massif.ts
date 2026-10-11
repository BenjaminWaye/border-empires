// True-3D mountains, placed the way tile games do it: one hand-designed
// low-poly model (client-map-3d-mountain-models.ts) per mountain tile,
// turned, scaled and tinted per tile from the shared variation
// (client-map-mountain-variation.ts), overlapping its neighbours a little so
// touching tiles read as a range of distinct peaks. A tile that stands
// higher than its mountain neighbours (by hash) gets a big summit model; the
// rest of a range gets lower filler models (knolls, foothills, the odd mesa).
// Cold-country mountains use the alpine (grey, snowy) version of each model.
import {
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Scene,
  Vector3,
  type BufferGeometry,
  type MeshLambertMaterial
} from "three";
import {
  mountainHash01,
  mountainNeighbourhoodAt,
  mountainVariationAt,
  type MountainNeighbourhoodLookup
} from "./client-map-mountain-variation/client-map-mountain-variation.js";
import {
  createMountainModelGeometry,
  createMountainModelMaterial,
  FILLER_MODELS,
  MOUNTAIN_MODELS,
  SUMMIT_MODELS
} from "./client-map-3d-mountain-models.js";

// Per-instance rock colour shift (multiplies the vertex colours).
const TINT_LIGHTNESS = 0.06;
const TINT_WARMTH = 0.02;
// Footprint scale: a little over 1 so neighbouring models overlap at their feet.
const SUMMIT_FOOTPRINT = 1.1;
const FILLER_FOOTPRINT = 1.05;
// How much the per-tile footprint variation (0.9..1.1) widens or narrows a model.
const FOOTPRINT_SPREAD = 0.6;
const SUMMIT_SALT = 21;

export type MountainMassifDeps = MountainNeighbourhoodLookup;

export type MountainMassif = {
  /** One InstancedMesh per model and climate. */
  readonly meshes: readonly InstancedMesh[];
  /** The neighbourhood lookup this massif was built with. */
  readonly lookup: MountainMassifDeps;
  /** Mountain instances drawn after the last commit. */
  readonly instanceCount: () => number;
  /** Instances added since the last clear that carry snow. */
  readonly snowyInstanceCount: () => number;
  readonly clear: () => void;
  /** (x, z) scene position of the tile centre, (wx, wy) its world tile -- the look is keyed on the latter. */
  readonly addInstance: (x: number, z: number, surfaceY: number, wx: number, wy: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

type ModelLayer = {
  readonly mesh: InstancedMesh;
  readonly snowLines: InstancedBufferAttribute;
  count: number;
};

const createModelLayer = (geometry: BufferGeometry, material: MeshLambertMaterial, capacity: number): ModelLayer => {
  const snowLines = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  geometry.setAttribute("aSnowLine", snowLines);
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.frustumCulled = false;
  mesh.count = 0;
  // Mountains cast onto the ground but don't self-shadow (it speckled the facets).
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  return { mesh, snowLines, count: 0 };
};

/** A tile that stands higher than all its orthogonal mountain neighbours (by hash): it gets a summit model. */
export const isSummitTile = (wx: number, wy: number, lookup: MountainNeighbourhoodLookup): boolean => {
  const own = mountainHash01(wx, wy, SUMMIT_SALT);
  return [[0, -1], [1, 0], [0, 1], [-1, 0]].every(([dx, dy]) => {
    const nx = lookup.wrapX(wx + dx!);
    const ny = lookup.wrapY(wy + dy!);
    return !lookup.isMountainAt(nx, ny) || mountainHash01(nx, ny, SUMMIT_SALT) < own;
  });
};

// Flat-topped mesas are a temperate shape; in cold country they read as grey cakes.
const ALPINE_FILLER_MODELS = FILLER_MODELS.filter((i) => MOUNTAIN_MODELS[i]!.name !== "mesa");

/** Which model a mountain tile shows (index into MOUNTAIN_MODELS). */
export const mountainModelIndexAt = (wx: number, wy: number, lookup: MountainNeighbourhoodLookup, cold = false): number => {
  const pool = isSummitTile(wx, wy, lookup) ? SUMMIT_MODELS : cold ? ALPINE_FILLER_MODELS : FILLER_MODELS;
  return pool[Math.floor(mountainHash01(wx, wy, 33) * pool.length)]!;
};

export const createMountainMassifs = (scene: Scene, maxInstances: number, deps: MountainMassifDeps): MountainMassif => {
  const material = createMountainModelMaterial();
  // Each layer can hold half the visible tiles; anything past capacity is dropped.
  const capacity = Math.max(1, Math.ceil(maxInstances / 2));
  const layersFor = (climate: "temperate" | "alpine"): ModelLayer[] =>
    MOUNTAIN_MODELS.map((model) => createModelLayer(createMountainModelGeometry(model, climate), material, capacity));
  const temperate = layersFor("temperate");
  const alpine = layersFor("alpine");
  const layers = [...temperate, ...alpine];
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

  const addInstance = (x: number, z: number, surfaceY: number, wx: number, wy: number): void => {
    const neighbourhood = mountainNeighbourhoodAt(wx, wy, deps);
    const variation = mountainVariationAt(wx, wy, neighbourhood);
    const modelIndex = mountainModelIndexAt(wx, wy, deps, neighbourhood.cold);
    const layer = (neighbourhood.cold ? alpine : temperate)[modelIndex]!;
    if (layer.count >= layer.mesh.instanceMatrix.count) return;
    const summit = MOUNTAIN_MODELS[modelIndex]!.role === "summit";
    const footprint = (summit ? SUMMIT_FOOTPRINT : FILLER_FOOTPRINT) + (variation.footprintScale - 1) * FOOTPRINT_SPREAD;
    tempQuaternion.setFromAxisAngle(yAxis, variation.yaw * 4);
    tempScale.set(footprint, variation.heightScale, footprint);
    tempPosition.set(x, surfaceY, z);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    layer.mesh.setMatrixAt(layer.count, tempMatrix);
    const light = 1 + TINT_LIGHTNESS * variation.tint;
    const warm = TINT_WARMTH * variation.warmth;
    layer.mesh.setColorAt(layer.count, tempColor.setRGB(light + warm, light, light - warm));
    layer.snowLines.setX(layer.count, variation.snowLine);
    if (variation.snowLine > 0) snowy += 1;
    layer.count += 1;
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
