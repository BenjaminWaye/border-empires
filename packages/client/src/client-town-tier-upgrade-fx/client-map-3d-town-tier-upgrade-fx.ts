import { DoubleSide, Group, IcosahedronGeometry, Mesh, MeshStandardMaterial, type Object3D } from "three";
import { townGrowthDustPuffAt, townGrowthDustPuffs, TOWN_GROWTH_DUST_MS, type TownPopulationTier } from "./client-town-tier-upgrade-fx.js";

// True-3D dust kicked up round a town while its new tier grows out of the
// ground (the growth itself is in the town shaders, town-growth-shader.ts).
// Puffs rise near each ring of buildings as it comes up, billow outward and
// fade. 2D counterpart: client-map-2d-town-tier-upgrade.ts.

type Entry = {
  readonly group: Group;
  readonly seed: number;
  readonly puffs: Mesh[];
  readonly materials: MeshStandardMaterial[];
  readonly startedAt: number;
};

export type TownTierUpgradeFxLayer = {
  readonly group: Group;
  /** startedAt is performance.now() ms of when the transition began (may be in the past); seed from townGrowthDustSeed, so 2D and 3D lay the dust out alike. */
  readonly spawn: (sceneX: number, sceneZ: number, surfaceY: number, tier: TownPopulationTier, startedAt: number, seed: number) => void;
  readonly update: (nowMs: number) => void;
  readonly clear: () => void;
  readonly dispose: () => void;
};

const MAX_ACTIVE = 8;
const DUST_COLORS = ["#c9b28f", "#b39c7a", "#d8c7a8"];

export const createTownTierUpgradeFxLayer = (scene: Object3D): TownTierUpgradeFxLayer => {
  const group = new Group();
  group.name = "town-tier-upgrade-dust";
  scene.add(group);
  const puffGeometry = new IcosahedronGeometry(1, 1);
  const entries: Entry[] = [];

  const disposeEntry = (entry: Entry): void => {
    group.remove(entry.group);
    for (const material of entry.materials) material.dispose();
  };

  const spawn = (sceneX: number, sceneZ: number, surfaceY: number, tier: TownPopulationTier, startedAt: number, seed: number): void => {
    const entryGroup = new Group();
    entryGroup.position.set(sceneX, surfaceY + 0.02, sceneZ);
    const materials: MeshStandardMaterial[] = [];
    const puffs: Mesh[] = [];
    for (let i = 0; i < townGrowthDustPuffs(tier); i += 1) {
      // One material per puff: each fades on its own curve.
      const material = new MeshStandardMaterial({ color: DUST_COLORS[i % DUST_COLORS.length]!, roughness: 1, metalness: 0, flatShading: true, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide });
      materials.push(material);
      const puff = new Mesh(puffGeometry, material);
      puff.visible = false;
      entryGroup.add(puff);
      puffs.push(puff);
    }
    group.add(entryGroup);
    entries.push({ group: entryGroup, seed, puffs, materials, startedAt });
    while (entries.length > MAX_ACTIVE) disposeEntry(entries.shift()!);
  };

  const update = (nowMs: number): void => {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i]!;
      const age = nowMs - entry.startedAt;
      if (age >= TOWN_GROWTH_DUST_MS) {
        disposeEntry(entry);
        entries.splice(i, 1);
        continue;
      }
      entry.puffs.forEach((puff, index) => {
        const dust = townGrowthDustPuffAt(entry.seed, index, age);
        puff.visible = dust.radius > 0;
        if (!puff.visible) return;
        puff.position.set(Math.cos(dust.angle) * dust.distance, 0.03 + dust.rise, Math.sin(dust.angle) * dust.distance);
        puff.scale.set(dust.radius, dust.radius * 0.8, dust.radius);
        entry.materials[index]!.opacity = dust.alpha;
      });
    }
  };

  const clear = (): void => {
    for (const entry of entries) disposeEntry(entry);
    entries.length = 0;
  };

  const dispose = (): void => {
    clear();
    puffGeometry.dispose();
    scene.remove(group);
  };

  return { group, spawn, update, clear, dispose };
};
