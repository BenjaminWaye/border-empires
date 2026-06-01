import { Group, Mesh, MeshBasicMaterial, RingGeometry, Scene } from "three";
import type { CrystalAbilityInfoKey } from "./client-crystal-ability-info.js";

type Entry = {
  mesh: Mesh;
  startedAt: number;
  durationMs: number;
  baseY: number;
};

export type CrystalCastFxLayer = {
  readonly group: Group;
  readonly spawn: (worldX: number, worldZ: number, surfaceY: number, key: CrystalAbilityInfoKey) => void;
  readonly update: (nowMs: number) => void;
  readonly clear: () => void;
  readonly dispose: () => void;
};

export const createCrystalCastFxLayer = (scene: Scene): CrystalCastFxLayer => {
  const group = new Group();
  group.name = "crystal-cast-fx";
  scene.add(group);
  const active: Entry[] = [];

  const spawn = (worldX: number, worldZ: number, surfaceY: number): void => {
    const geometry = new RingGeometry(0.24, 0.31, 18);
    const material = new MeshBasicMaterial({ color: "#50d2e9", transparent: true, opacity: 0.95, depthWrite: false });
    const mesh = new Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(worldX, surfaceY + 0.08, worldZ);
    group.add(mesh);
    active.push({ mesh, startedAt: performance.now(), durationMs: 2600, baseY: surfaceY + 0.08 });
  };

  const update = (nowMs: number): void => {
    for (let i = active.length - 1; i >= 0; i -= 1) {
      const item = active[i]!;
      const t = (nowMs - item.startedAt) / item.durationMs;
      if (t >= 1) {
        group.remove(item.mesh);
        item.mesh.geometry.dispose();
        (item.mesh.material as MeshBasicMaterial).dispose();
        active.splice(i, 1);
        continue;
      }
      const scale = 1 + t * 3.2;
      item.mesh.scale.set(scale, scale, 1);
      item.mesh.position.y = item.baseY + t * 0.45;
      (item.mesh.material as MeshBasicMaterial).opacity = 0.95 * (1 - t);
    }
  };

  const clear = (): void => {
    while (active.length > 0) {
      const item = active.pop()!;
      group.remove(item.mesh);
      item.mesh.geometry.dispose();
      (item.mesh.material as MeshBasicMaterial).dispose();
    }
  };

  const dispose = (): void => {
    clear();
    scene.remove(group);
  };

  return { group, spawn, update, clear, dispose };
};
