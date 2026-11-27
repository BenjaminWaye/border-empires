// 3D Umbrite deposit overlay -- Umbrite found in a forest's wood. Three
// variants, picked deterministically per tile:
//   0 · A Root-Bearing Elder: a whole tree mineralized, bare violet crown.
//   1 · B Umbrite Rootbed: a network of split roots with violet heartwood.
//   2 · C Fallen Umberwood: a split stump and its fallen, mineralized log.
// The models are shared with the Storybook study (Sandbox / Umbrite Forest)
// via client-map-3d-umbrite-grove/umbrite-grove-parts.ts. The deposit draws
// only the mineralized wood: on a forest tile the ordinary forest still
// stands (with its river-bank, war and AFC-hold rules), minus the trees in
// the find's clearing -- see umbriteDepositForestKeepSlot.
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DoubleSide, InstancedMesh, Matrix4, MeshStandardMaterial, Scene, type BufferGeometry, type Texture } from "three";
import { applyBuildingEnvMap } from "./client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { LAYOUTS, tileHash } from "./client-map-3d-forest.js";
import {
  UMBRITE_GROVE_CONCEPTS, UMBRITE_GROVE_MATERIALS, buildUmbriteGroveParts, umbriteGroveClearsTreeAt,
  type UmbriteGroveConcept, type UmbriteGroveMaterial
} from "./client-map-3d-umbrite-grove/umbrite-grove-parts.js";

export type UmbriteDepositVariant = 0 | 1 | 2;

export const umbriteDepositVariantAt = (worldX: number, worldZ: number): UmbriteDepositVariant => {
  const h = ((worldX * 374761393) ^ (worldZ * 668265263) ^ (402653189 * 1442695041)) >>> 0;
  return (h % 3) as UmbriteDepositVariant;
};

export const umbriteDepositConceptOf = (variant: UmbriteDepositVariant): UmbriteGroveConcept => UMBRITE_GROVE_CONCEPTS[variant]!;

/**
 * The forest's keep-slot filter for a tile the deposit is drawn on: drops
 * the trees in the find's clearing, and otherwise defers to `keep` (war
 * thinning). Uses the same per-tile layout pick as createForest and
 * createTropicalForest, so slot N here is the same tree they place.
 */
export const umbriteDepositForestKeepSlot = (
  worldX: number, worldZ: number, keep: ((slot: number) => boolean) | undefined
): ((slot: number) => boolean) => {
  const layout = LAYOUTS[tileHash(worldX, worldZ, 7, LAYOUTS.length)]!;
  const concept = umbriteDepositConceptOf(umbriteDepositVariantAt(worldX, worldZ));
  return (slot) => {
    const tree = layout[slot];
    if (tree && umbriteGroveClearsTreeAt(concept, tree.ox, tree.oz)) return false;
    return keep ? keep(slot) : true;
  };
};

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
  const parts = buildUmbriteGroveParts(concept, "pine", "map");
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

type Pool = { readonly mesh: InstancedMesh; count: number };

export const createUmbriteDepositOverlay = (scene: Scene, maxTiles: number, buildingEnvironmentTexture?: Texture): UmbriteDepositOverlay => {
  const groveMaterials = createGroveMaterials();
  Object.values(groveMaterials).forEach((material) => applyBuildingEnvMap(material, buildingEnvironmentTexture));
  const groves: Pool[] = UMBRITE_GROVE_CONCEPTS.map((concept) => {
    const baked = bakeGroveGeometry(concept);
    const mesh = new InstancedMesh(baked.geometry, baked.materials.map((key) => groveMaterials[key]), maxTiles);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return { mesh, count: 0 };
  });
  const matrix = new Matrix4();

  const clear = (): void => {
    for (const grove of groves) grove.count = 0;
  };

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number): void => {
    const grove = groves[umbriteDepositVariantAt(worldTileX, worldTileY)]!;
    if (grove.count >= maxTiles) return;
    grove.mesh.setMatrixAt(grove.count, matrix.makeTranslation(sceneX, surfaceY, sceneZ));
    grove.count += 1;
  };

  const commit = (): void => {
    for (const { mesh, count } of groves) {
      mesh.count = count;
      if (count === 0) continue;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    for (const { mesh } of groves) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.dispose();
    }
    Object.values(groveMaterials).forEach((material) => material.dispose());
  };

  return { clear, addInstance, commit, dispose };
};
