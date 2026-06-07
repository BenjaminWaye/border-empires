import { Group, Mesh, MeshBasicMaterial, RingGeometry, Scene } from "three";
import type { CrystalAbilityInfoKey } from "./client-crystal-ability-info.js";

type Entry = { mesh: Mesh; startMs: number; durationMs: number; x: number; z: number; y: number };

export type CrystalCastFxLayer = {
  readonly group: Group;
  readonly spawn: (worldX: number, worldZ: number, surfaceY: number, _key: CrystalAbilityInfoKey) => void;
  readonly update: (nowMs: number) => void;
  readonly clear: () => void;
  readonly dispose: () => void;
};

export const createCrystalCastFxLayer = (scene: Scene): CrystalCastFxLayer => {
  const group = new Group();
  group.name = "crystal-cast-fx";
  scene.add(group);
  const entries: Entry[] = [];

  const spawn = (worldX: number, worldZ: number, surfaceY: number): void => {
    const geometry = new RingGeometry(0.24, 0.31, 18);
    const material = new MeshBasicMaterial({ color: "#50d2e9", transparent: true, opacity: 0.9, depthWrite: false });
    const mesh = new Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(worldX, surfaceY + 0.08, worldZ);
    group.add(mesh);
    entries.push({ mesh, startMs: performance.now(), durationMs: 2400, x: worldX, z: worldZ, y: surfaceY + 0.08 });
  };

  const update = (nowMs: number): void => {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i]!;
      const t = (nowMs - entry.startMs) / entry.durationMs;
      if (t >= 1) {
        group.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        (entry.mesh.material as MeshBasicMaterial).dispose();
        entries.splice(i, 1);
        continue;
      }
      const s = 1 + t * 3.4;
      entry.mesh.scale.set(s, s, 1);
      entry.mesh.position.y = entry.y + t * 0.5;
      (entry.mesh.material as MeshBasicMaterial).opacity = 0.92 * (1 - t);
    }
  };

  const clear = (): void => {
    while (entries.length) {
      const entry = entries.pop()!;
      group.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      (entry.mesh.material as MeshBasicMaterial).dispose();
    }
  };

  const dispose = (): void => {
    clear();
    scene.remove(group);
  };

  return { group, spawn, update, clear, dispose };
};
