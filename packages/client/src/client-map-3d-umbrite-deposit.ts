// 3D Umbrite deposit overlay -- Umbrite found in a forest's wood. Three
// variants, picked deterministically per tile:
//   0 · A Root-Bearing Elder: a whole tree mineralized, bare violet crown.
//   1 · B Umbrite Rootbed: a network of split roots with violet heartwood.
//   2 · C Fallen Umberwood: a split stump and its fallen, mineralized log.
// The models are shared with the Storybook study (Sandbox / Umbrite Forest)
// via client-map-3d-umbrite-grove/umbrite-grove-parts.ts. On a forest tile
// the deposit also stands its own clearing of living trees (in the tile's
// usual species), and the renderer skips that tile's ordinary forest
// (umbriteDepositDrawnOnTile) so trees never grow through the discovery.
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Color, DoubleSide, InstancedMesh, Matrix4, MeshStandardMaterial, Scene, type BufferGeometry, type Texture } from "three";
import { isForestTileAt, isTropicalForestTileAt } from "@border-empires/shared";
import { applyBuildingEnvMap } from "./client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { tileHash } from "./client-map-3d-forest.js";
import { commitInstanceTint } from "./client-map-3d-instance-tint.js";
import { createTreeMaterial, driveTreeWind } from "./client-map-3d-trees/client-map-3d-tree-material.js";
import { createLeafGeometry, createPalmGeometry, createPineGeometry, createSpruceGeometry } from "./client-map-3d-trees/client-map-3d-tree-models.js";
import { composeTreeInstance, createTreePlacement } from "./client-map-3d-trees/client-map-3d-tree-variation.js";
import {
  UMBRITE_GROVE_CONCEPTS, UMBRITE_GROVE_MATERIALS, UMBRITE_GROVE_TREES, buildUmbriteGroveParts,
  type UmbriteGroveConcept, type UmbriteGroveMaterial
} from "./client-map-3d-umbrite-grove/umbrite-grove-parts.js";

export type UmbriteDepositVariant = 0 | 1 | 2;

export const umbriteDepositVariantAt = (worldX: number, worldZ: number): UmbriteDepositVariant => {
  const h = ((worldX * 374761393) ^ (worldZ * 668265263) ^ (402653189 * 1442695041)) >>> 0;
  return (h % 3) as UmbriteDepositVariant;
};

export const umbriteDepositConceptOf = (variant: UmbriteDepositVariant): UmbriteGroveConcept => UMBRITE_GROVE_CONCEPTS[variant]!;

export type UmbriteDepositOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

// Flat colours standing in for the study's bark texture (its pale grain
// multiplied into these), so the live bark reads the same shade.
const createGroveMaterials = (): Record<UmbriteGroveMaterial, MeshStandardMaterial> => {
  const material = (color: string, roughness: number, metalness: number, flatShading: boolean): MeshStandardMaterial =>
    new MeshStandardMaterial({ color, roughness, metalness, flatShading });
  const purple = material("#a365c7", 0.58, 0.06, true);
  purple.emissive.set("#b45aff");
  purple.emissiveIntensity = 2.5;
  const purpleLight = material("#d3ade9", 0.55, 0.04, true);
  purpleLight.emissive.set("#c785ff");
  purpleLight.emissiveIntensity = 2;
  const wood = material("#927051", 0.9, 0, true);
  wood.side = DoubleSide;
  return { bark: material("#795130", 0.9, 0, false), darkBark: material("#543521", 0.9, 0, false), wood, purple, purpleLight };
};

// One geometry per variant, with a draw group per material, so a deposit
// costs a single instance (and a single draw call per material) per tile.
const bakeGroveGeometry = (concept: UmbriteGroveConcept): { geometry: BufferGeometry; materials: UmbriteGroveMaterial[] } => {
  const parts = buildUmbriteGroveParts(concept);
  const byMaterial: BufferGeometry[] = [];
  const materials: UmbriteGroveMaterial[] = [];
  for (const key of UMBRITE_GROVE_MATERIALS) {
    const placed = parts.filter((part) => part.material === key).map((part) => {
      const flat = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
      return flat.applyMatrix4(part.matrix);
    });
    if (placed.length === 0) continue;
    const merged = mergeGeometries(placed, false);
    placed.forEach((geometry) => geometry.dispose());
    if (!merged) throw new Error(`umbrite deposit: cannot merge ${concept} ${key}`);
    byMaterial.push(merged);
    materials.push(key);
  }
  parts.forEach((part) => part.geometry.dispose());
  const geometry = mergeGeometries(byMaterial, true);
  byMaterial.forEach((part) => part.dispose());
  if (!geometry) throw new Error(`umbrite deposit: cannot merge ${concept}`);
  return { geometry, materials };
};

type Pool = { readonly mesh: InstancedMesh; readonly cap: number; count: number };
const TREES_PER_GROVE = Math.max(...UMBRITE_GROVE_CONCEPTS.map((concept) => UMBRITE_GROVE_TREES[concept].length));

export const createUmbriteDepositOverlay = (scene: Scene, maxTiles: number, buildingEnvironmentTexture?: Texture): UmbriteDepositOverlay => {
  const groveMaterials = createGroveMaterials();
  Object.values(groveMaterials).forEach((material) => applyBuildingEnvMap(material, buildingEnvironmentTexture));
  const pools: Pool[] = [];
  const pool = (geometry: BufferGeometry, material: MeshStandardMaterial | MeshStandardMaterial[], cap: number): Pool => {
    const mesh = new InstancedMesh(geometry, material, cap);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const result: Pool = { mesh, cap, count: 0 };
    pools.push(result);
    return result;
  };
  const groves = UMBRITE_GROVE_CONCEPTS.map((concept) => {
    const baked = bakeGroveGeometry(concept);
    return pool(baked.geometry, baked.materials.map((key) => groveMaterials[key]), maxTiles);
  });
  // The forest's own species pick (client-map-3d-forest.ts): pine, spruce,
  // leaf -- and palms in the tropical belt.
  const treeMaterial = createTreeMaterial();
  const palmMaterial = createTreeMaterial({ doubleSided: true });
  const treeCap = maxTiles * TREES_PER_GROVE;
  const trees = [createPineGeometry(), createSpruceGeometry(), createLeafGeometry()].map((geometry) => pool(geometry, treeMaterial, treeCap));
  const palms = pool(createPalmGeometry(), palmMaterial, treeCap);
  [...trees, palms].forEach((treePool) => driveTreeWind(treePool.mesh));

  const matrix = new Matrix4();
  const color = new Color();
  const placement = createTreePlacement();

  const clear = (): void => {
    for (const entry of pools) entry.count = 0;
  };

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number): void => {
    const variant = umbriteDepositVariantAt(worldTileX, worldTileY);
    const grove = groves[variant]!;
    if (grove.count >= grove.cap) return;
    grove.mesh.setMatrixAt(grove.count, matrix.makeTranslation(sceneX, surfaceY, sceneZ));
    grove.count += 1;
    if (!isForestTileAt(worldTileX, worldTileY)) return;
    const treePool = isTropicalForestTileAt(worldTileX, worldTileY) ? palms : trees[tileHash(worldTileX, worldTileY, 11, 3)]!;
    UMBRITE_GROVE_TREES[umbriteDepositConceptOf(variant)].forEach(([ox, oz, scale], slot) => {
      if (treePool.count >= treePool.cap) return;
      placement.x = sceneX + ox;
      placement.y = surfaceY;
      placement.z = sceneZ + oz;
      placement.scale = scale;
      placement.worldX = worldTileX;
      placement.worldZ = worldTileY;
      placement.slot = slot;
      placement.tint = undefined;
      composeTreeInstance(placement, matrix, color);
      treePool.mesh.setMatrixAt(treePool.count, matrix);
      treePool.mesh.setColorAt(treePool.count, color);
      treePool.count += 1;
    });
  };

  const commit = (): void => {
    for (const { mesh, count } of pools) {
      mesh.count = count;
      if (count === 0) continue;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
      commitInstanceTint(mesh);
    }
  };

  const dispose = (): void => {
    for (const { mesh } of pools) {
      scene.remove(mesh);
      mesh.geometry.dispose();
    }
    [...Object.values(groveMaterials), treeMaterial, palmMaterial].forEach((material) => material.dispose());
  };

  return { clear, addInstance, commit, dispose };
};
