import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, OctahedronGeometry, Scene, TorusGeometry } from "three";
import type { CrystalAbilityInfoKey } from "./client-crystal-ability-info.js";
import { registerDefensiveAbilities } from "./client-map-3d-crystal-ability-defensive.js";
import { registerOffensiveAbilities } from "./client-map-3d-crystal-ability-offensive.js";
import { registerUtilityAbilities } from "./client-map-3d-crystal-ability-utility.js";

export type CrystalPartDef = {
  readonly shape: "ring" | "pillar" | "spike" | "crystal";
  readonly color: string;
  readonly y: number;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
};

export type CrystalFamilyRegister = (key: CrystalAbilityInfoKey, parts: ReadonlyArray<CrystalPartDef>) => void;

type CrystalPartInstance = CrystalPartDef & { readonly key: CrystalAbilityInfoKey };

const ALL_KEYS: readonly CrystalAbilityInfoKey[] = [
  "reveal_empire", "reveal_empire_stats", "aether_wall", "survey_sweep", "aether_lance", "retort_recasting", "aether_bridge",
  "siphon", "aether_emp", "city_overclock", "stormfront", "aegis_lock", "astral_dock_launch", "create_mountain", "remove_mountain"
];

export type CrystalAbilityOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (key: CrystalAbilityInfoKey, centerX: number, centerZ: number, surfaceY: number, worldX: number, worldZ: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createCrystalAbilityOverlay = (scene: Scene, maxTiles: number): CrystalAbilityOverlay => {
  const group = new Group();
  group.name = "crystal-ability-overlay";
  scene.add(group);

  const ringGeometry = new TorusGeometry(0.45, 0.09, 8, 18);
  const pillarGeometry = new BoxGeometry(1, 1, 1);
  const spikeGeometry = new BoxGeometry(1, 1, 1);
  const crystalGeometry = new OctahedronGeometry(1, 0);

  const defs = new Map<CrystalAbilityInfoKey, ReadonlyArray<CrystalPartDef>>();
  const register: CrystalFamilyRegister = (key, parts) => defs.set(key, parts);
  registerOffensiveAbilities(register);
  registerDefensiveAbilities(register);
  registerUtilityAbilities(register);

  const materials = new Map<string, MeshStandardMaterial>();
  const byShape = {
    ring: [] as CrystalPartInstance[],
    pillar: [] as CrystalPartInstance[],
    spike: [] as CrystalPartInstance[],
    crystal: [] as CrystalPartInstance[]
  };

  for (const key of ALL_KEYS) {
    for (const part of defs.get(key) ?? []) byShape[part.shape].push({ ...part, key });
  }

  const makeMesh = (shape: keyof typeof byShape, geometry: BoxGeometry | TorusGeometry | OctahedronGeometry): InstancedMesh => {
    const material = new MeshStandardMaterial({ color: "#50d2e9", emissive: "#50d2e9", emissiveIntensity: 0.45, roughness: 0.45, metalness: 0.12, flatShading: true });
    const mesh = new InstancedMesh(geometry, material, Math.max(1, maxTiles * 6));
    mesh.count = 0;
    mesh.frustumCulled = false;
    group.add(mesh);
    materials.set(shape, material);
    return mesh;
  };

  const ringMesh = makeMesh("ring", ringGeometry);
  const pillarMesh = makeMesh("pillar", pillarGeometry);
  const spikeMesh = makeMesh("spike", spikeGeometry);
  const crystalMesh = makeMesh("crystal", crystalGeometry);

  const lookup = new Map<CrystalAbilityInfoKey, ReadonlyArray<CrystalPartDef>>(defs);
  const matrix = new Matrix4();
  const scale = new Matrix4();
  const colorSet = { ring: 0, pillar: 0, spike: 0, crystal: 0 };

  const clear = (): void => {
    colorSet.ring = 0;
    colorSet.pillar = 0;
    colorSet.spike = 0;
    colorSet.crystal = 0;
  };

  const addPart = (mesh: InstancedMesh, idx: number, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number): void => {
    matrix.makeTranslation(x, y, z);
    scale.makeScale(sx, sy, sz);
    matrix.multiply(scale);
    mesh.setMatrixAt(idx, matrix);
    mesh.setColorAt(idx, { set: (value: string) => value } as never);
    const m = mesh.material as MeshStandardMaterial;
    m.color.set(color);
    m.emissive.set(color);
  };

  const addInstance = (key: CrystalAbilityInfoKey, centerX: number, centerZ: number, surfaceY: number): void => {
    for (const part of lookup.get(key) ?? []) {
      const y = surfaceY + part.y;
      if (part.shape === "ring") {
        addPart(ringMesh, colorSet.ring, part.color, centerX, y, centerZ, part.sx, part.sy, part.sz);
        colorSet.ring += 1;
      } else if (part.shape === "pillar") {
        addPart(pillarMesh, colorSet.pillar, part.color, centerX, y, centerZ, part.sx, part.sy, part.sz);
        colorSet.pillar += 1;
      } else if (part.shape === "spike") {
        addPart(spikeMesh, colorSet.spike, part.color, centerX, y, centerZ, part.sx, part.sy, part.sz);
        colorSet.spike += 1;
      } else {
        addPart(crystalMesh, colorSet.crystal, part.color, centerX, y, centerZ, part.sx, part.sy, part.sz);
        colorSet.crystal += 1;
      }
    }
  };

  const commit = (): void => {
    ringMesh.count = colorSet.ring;
    pillarMesh.count = colorSet.pillar;
    spikeMesh.count = colorSet.spike;
    crystalMesh.count = colorSet.crystal;
    ringMesh.instanceMatrix.needsUpdate = true;
    pillarMesh.instanceMatrix.needsUpdate = true;
    spikeMesh.instanceMatrix.needsUpdate = true;
    crystalMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(group);
    ringGeometry.dispose();
    pillarGeometry.dispose();
    spikeGeometry.dispose();
    crystalGeometry.dispose();
    for (const material of materials.values()) material.dispose();
  };

  return { group, clear, addInstance, commit, dispose };
};

export { ALL_KEYS as CRYSTAL_ABILITY_KEYS };
