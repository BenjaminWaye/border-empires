// True-3D mountains, placed the way tile games do it: one low-poly rock
// cluster (client-map-3d-mountain-models.ts) per mountain tile,
// turned, scaled and tinted per tile from the shared variation
// (client-map-mountain-variation.ts), overlapping its neighbours a little so
// touching tiles read as a range of distinct peaks. A tile that stands
// higher than its mountain neighbours (by hash) gets a big summit cluster;
// the rest of a range gets smaller ones. Cold-country mountains use the
// alpine (paler, snowy) version of each model; most summit peaks elsewhere
// are snow-tipped too.
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
  isSummitTile,
  mountainHash01,
  mountainNeighbourhoodAt,
  mountainSnowAt,
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
import { markUnexploredStormClip } from "./client-map-3d-unexplored-storm/client-map-3d-unexplored-storm-clip.js";

// Per-instance rock colour shift (multiplies the vertex colours).
const TINT_LIGHTNESS = 0.06;
const TINT_WARMTH = 0.02;
// Footprint scale: broad (well over 1), so mountains read wide rather than tall
// from the high game camera and neighbouring models overlap at their feet.
const SUMMIT_FOOTPRINT = 1.35;
const FILLER_FOOTPRINT = 1.25;
// How much the per-tile footprint variation (0.9..1.1) widens or narrows a model.
const FOOTPRINT_SPREAD = 0.6;

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
  /**
   * (x, z) scene position of the tile centre, (wx, wy) its world tile -- the look is keyed on the latter.
   * `tint`: optional colour multiply on top of the per-tile shade (remembered tiles print as a faded survey map).
   */
  readonly addInstance: (x: number, z: number, surfaceY: number, wx: number, wy: number, tint?: Color) => void;
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

export { isSummitTile } from "./client-map-mountain-variation/client-map-mountain-variation.js";

/** Which model a mountain tile shows (index into MOUNTAIN_MODELS). */
export const mountainModelIndexAt = (wx: number, wy: number, lookup: MountainNeighbourhoodLookup): number => {
  const pool = isSummitTile(wx, wy, lookup) ? SUMMIT_MODELS : FILLER_MODELS;
  return pool[Math.floor(mountainHash01(wx, wy, 33) * pool.length)]!;
};

/** How a mountain tile's model is placed: which model, turned and scaled how (the river cascade lies on it). */
export type MountainPlacement = {
  readonly modelIndex: number;
  readonly yaw: number;
  readonly footprint: number;
  readonly heightScale: number;
};

export const mountainPlacementAt = (wx: number, wy: number, lookup: MountainNeighbourhoodLookup): MountainPlacement => {
  const variation = mountainVariationAt(wx, wy, mountainNeighbourhoodAt(wx, wy, lookup));
  const modelIndex = mountainModelIndexAt(wx, wy, lookup);
  const summit = MOUNTAIN_MODELS[modelIndex]!.role === "summit";
  return {
    modelIndex,
    yaw: variation.yaw * 4,
    footprint: (summit ? SUMMIT_FOOTPRINT : FILLER_FOOTPRINT) + (variation.footprintScale - 1) * FOOTPRINT_SPREAD,
    heightScale: variation.heightScale
  };
};

export const createMountainMassifs = (scene: Scene, maxInstances: number, deps: MountainMassifDeps): MountainMassif => {
  // Hidden whole under the unexplored storm (client-map-3d-unexplored-storm-clip.ts).
  const material = markUnexploredStormClip(createMountainModelMaterial());
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

  const addInstance = (x: number, z: number, surfaceY: number, wx: number, wy: number, tint?: Color): void => {
    const neighbourhood = mountainNeighbourhoodAt(wx, wy, deps);
    const variation = mountainVariationAt(wx, wy, neighbourhood);
    const placement = mountainPlacementAt(wx, wy, deps);
    const layer = (neighbourhood.cold ? alpine : temperate)[placement.modelIndex]!;
    if (layer.count >= layer.mesh.instanceMatrix.count) return;
    tempQuaternion.setFromAxisAngle(yAxis, placement.yaw);
    tempScale.set(placement.footprint, placement.heightScale, placement.footprint);
    tempPosition.set(x, surfaceY, z);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    layer.mesh.setMatrixAt(layer.count, tempMatrix);
    const light = 1 + TINT_LIGHTNESS * variation.tint;
    const warm = TINT_WARMTH * variation.warmth;
    tempColor.setRGB(light + warm, light, light - warm);
    if (tint) tempColor.multiply(tint);
    layer.mesh.setColorAt(layer.count, tempColor);
    // Shared with the 2D peaks: cold country, and most summits elsewhere.
    const snow = mountainSnowAt(wx, wy, deps, neighbourhood.cold) ? 1 : 0;
    layer.snowLines.setX(layer.count, snow);
    snowy += snow;
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
