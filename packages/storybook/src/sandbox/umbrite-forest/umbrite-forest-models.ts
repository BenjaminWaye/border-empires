import {
  CircleGeometry, CylinderGeometry, DoubleSide, FrontSide, Group, Mesh, MeshStandardMaterial, PointLight, type BufferGeometry
} from "three";
import {
  createLeafGeometry, createPalmGeometry, createPineGeometry, createSpruceGeometry
} from "@client/client-map-3d-trees/client-map-3d-tree-models.js";
import {
  UMBRITE_GROVE_CONCEPTS, UMBRITE_GROVE_CONCEPT_NAMES, UMBRITE_GROVE_GLOWS, UMBRITE_GROVE_TREES, buildUmbriteGroveParts,
  type UmbriteGroveConcept, type UmbriteGroveMaterial, type UmbriteGroveSpecies
} from "@client/client-map-3d-umbrite-grove/umbrite-grove-parts.js";

import { createForestSurfaces } from "./umbrite-forest-surfaces.js";

// Close-up study of the live map's three Umbrite deposit variants
// (client-map-3d-umbrite-deposit.ts). The mineralized wood is the shared
// model; this scene adds a textured tile, local violet lights and the
// unrevealed forest for comparison.
// createForest selects ONE species per tile; tropical forest uses only palms.
export type ForestSpecies = UmbriteGroveSpecies;
export const FOREST_SPECIES: readonly ForestSpecies[] = ["pine", "spruce", "broadleaf", "palm"];
export const SPECIES_NAMES: Readonly<Record<ForestSpecies, string>> = {
  pine: "Pine forest", spruce: "Spruce forest", broadleaf: "Broadleaf forest", palm: "Tropical palm forest"
};
export type ForestConcept = UmbriteGroveConcept;
export const FOREST_CONCEPTS: readonly ForestConcept[] = UMBRITE_GROVE_CONCEPTS;
export const CONCEPT_NAMES: Readonly<Record<ForestConcept, string>> = UMBRITE_GROVE_CONCEPT_NAMES;

type Point = readonly [number, number, number];
export type ForestConceptModel = { readonly group: Group; readonly dispose: () => void };

export const createForestConcept = (
  concept: ForestConcept, revealed: boolean, species: ForestSpecies = "pine"
): ForestConceptModel => {
  const group = new Group();
  const geometries: BufferGeometry[] = [];
  const material = (color: string, roughness = 0.9, metalness = 0): MeshStandardMaterial =>
    new MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
  const surfaces = createForestSurfaces();
  const bark = material("#a17c59");
  const darkBark = material("#70523d");
  const wood = material("#927051");
  wood.side = DoubleSide;
  const purple = material("#a365c7", 0.58, 0.06);
  purple.emissive.set("#b45aff");
  purple.emissiveIntensity = 2.5;
  const purpleLight = material("#d3ade9", 0.55, 0.04);
  purpleLight.emissive.set("#c785ff");
  purpleLight.emissiveIntensity = 2;
  for (const barkMaterial of [bark, darkBark]) {
    barkMaterial.flatShading = false;
    barkMaterial.map = surfaces.bark;
    barkMaterial.bumpMap = surfaces.bark;
    barkMaterial.bumpScale = 0.002;
  }
  const ground = material("#c5c8a0");
  ground.map = surfaces.ground;
  const leaves = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: species === "palm" ? DoubleSide : FrontSide });
  const shadow = new MeshStandardMaterial({ color: "#273125", transparent: true, opacity: 0.22, depthWrite: false });
  const groveMaterials: Readonly<Record<UmbriteGroveMaterial, MeshStandardMaterial>> = { bark, darkBark, wood, purple, purpleLight };
  const materials = [bark, darkBark, wood, purple, purpleLight, ground, leaves, shadow];
  const mesh = (geo: BufferGeometry, mat: MeshStandardMaterial): Mesh => {
    geometries.push(geo);
    const result = new Mesh(geo, mat);
    result.castShadow = true;
    result.receiveShadow = true;
    group.add(result);
    return result;
  };
  const tile = mesh(new CylinderGeometry(0.69, 0.69, 0.035, 4), ground);
  tile.castShadow = false;
  tile.rotation.y = Math.PI / 4;
  tile.position.y = -0.026;

  const factories = {
    pine: createPineGeometry, spruce: createSpruceGeometry,
    broadleaf: createLeafGeometry, palm: createPalmGeometry
  };
  const tree = (x: number, z: number, scale: number): void => {
    const result = mesh(factories[species](), leaves);
    result.position.set(x, 0, z);
    result.rotation.y = (x + z) * 4;
    result.scale.setScalar(scale);
    const contact = mesh(new CircleGeometry(0.13 * scale, 12), shadow);
    contact.castShadow = false;
    contact.rotation.x = -Math.PI / 2;
    contact.position.set(x, -0.003, z);
  };

  if (!revealed) {
    const positions: readonly Point[] = [
      [-0.3, 0, -0.28], [0, 0, -0.31], [0.3, 0, -0.25],
      [-0.28, 0, 0.02], [0.03, 0, 0.02], [0.3, 0, 0.05],
      [-0.3, 0, 0.29], [0.05, 0, 0.31]
    ];
    positions.forEach(([x, , z], i) => tree(x, z, 0.8 + (i % 3) * 0.07));
  } else {
    UMBRITE_GROVE_TREES[concept].forEach(([x, z, scale]) => tree(x, z, scale));
    // Only exposed mineral emits. These small local lights add reflected
    // violet to nearby bark/soil; HDR bloom supplies the soft visible halo.
    UMBRITE_GROVE_GLOWS[concept].forEach((position) => {
      const light = new PointLight("#b869ff", 0.004, 0.25, 2);
      light.position.set(...position);
      group.add(light);
    });
    buildUmbriteGroveParts(concept, species).forEach((part) => {
      mesh(part.geometry, groveMaterials[part.material]).applyMatrix4(part.matrix);
    });
  }
  return {
    group,
    dispose: () => {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((mat) => mat.dispose());
      surfaces.dispose();
    }
  };
};
