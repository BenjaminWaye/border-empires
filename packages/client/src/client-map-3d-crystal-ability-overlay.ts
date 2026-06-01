import { BoxGeometry, ConeGeometry, Group, Mesh, MeshStandardMaterial, OctahedronGeometry, Scene, TorusGeometry } from "three";
import type { CrystalAbilityInfoKey } from "./client-crystal-ability-info.js";
import { DEFENSIVE_PARTS } from "./client-map-3d-crystal-ability-defensive.js";
import { OFFENSIVE_PARTS, type AbilityPart } from "./client-map-3d-crystal-ability-offensive.js";
import { UTILITY_PARTS } from "./client-map-3d-crystal-ability-utility.js";
const ABILITY_PARTS: Record<CrystalAbilityInfoKey, ReadonlyArray<AbilityPart>> = {
  ...UTILITY_PARTS,
  ...OFFENSIVE_PARTS,
  ...DEFENSIVE_PARTS
} as Record<CrystalAbilityInfoKey, ReadonlyArray<AbilityPart>>;

const ABILITY_COLORS: Record<CrystalAbilityInfoKey, string> = {
  reveal_empire: "#50d2e9",
  reveal_empire_stats: "#57d6eb",
  aether_wall: "#5fdaee",
  survey_sweep: "#67ddf0",
  aether_lance: "#6fe1f3",
  retort_recasting: "#77e4f5",
  aether_bridge: "#80e8f7",
  siphon: "#59d5ea",
  aether_emp: "#61d8ec",
  city_overclock: "#69dcef",
  stormfront: "#71dff1",
  aegis_lock: "#79e3f4",
  astral_dock_launch: "#81e7f6",
  create_mountain: "#8aeaf8",
  remove_mountain: "#92eefb"
};

export type CrystalAbilityOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (key: CrystalAbilityInfoKey, centerX: number, centerZ: number, surfaceY: number, worldX: number, worldZ: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createCrystalAbilityOverlay = (scene: Scene): CrystalAbilityOverlay => {
  const group = new Group();
  group.name = "crystal-ability-overlay";
  scene.add(group);

  const ringGeometry = new TorusGeometry(1, 0.2, 8, 16);
  const pillarGeometry = new BoxGeometry(1, 1, 1);
  const spikeGeometry = new ConeGeometry(1, 1, 6);
  const crystalGeometry = new OctahedronGeometry(1, 0);
  const spawned: Mesh[] = [];

  const clear = (): void => {
    while (spawned.length > 0) {
      const mesh = spawned.pop()!;
      group.remove(mesh);
      (mesh.material as MeshStandardMaterial).dispose();
    }
  };

  const addInstance = (key: CrystalAbilityInfoKey, centerX: number, centerZ: number, surfaceY: number): void => {
    const parts = ABILITY_PARTS[key];
    const color = ABILITY_COLORS[key];
    for (const part of parts) {
      const geometry = part.kind === "ring" ? ringGeometry : part.kind === "pillar" ? pillarGeometry : part.kind === "spike" ? spikeGeometry : crystalGeometry;
      const material = new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.35,
        roughness: 0.45,
        metalness: 0.1,
        flatShading: true
      });
      const mesh = new Mesh(geometry, material);
      mesh.position.set(centerX + part.ox, surfaceY + part.oy, centerZ + part.oz);
      mesh.rotation.y = part.ry ?? 0;
      mesh.scale.set(part.sx, part.sy, part.sz);
      group.add(mesh);
      spawned.push(mesh);
    }
  };

  const commit = (): void => {
    // No-op: this overlay currently uses direct meshes.
  };

  const dispose = (): void => {
    clear();
    scene.remove(group);
    ringGeometry.dispose();
    pillarGeometry.dispose();
    spikeGeometry.dispose();
    crystalGeometry.dispose();
  };

  return { group, clear, addInstance, commit, dispose };
};
