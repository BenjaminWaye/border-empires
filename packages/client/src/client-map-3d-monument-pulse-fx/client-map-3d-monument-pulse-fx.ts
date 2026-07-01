import { AdditiveBlending, CylinderGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry, Scene } from "three";

const DURATION_MS = 1400;
const FLASH_END_MS = 220;

type PulseEntry = {
  readonly group: Group;
  readonly ring: Mesh;
  readonly flash: Mesh;
  readonly startedAt: number;
};

export type MonumentPulseFxLayer = {
  readonly group: Group;
  readonly spawn: (sceneX: number, sceneZ: number, surfaceY: number) => void;
  readonly update: (nowMs: number) => void;
  readonly clear: () => void;
  readonly dispose: () => void;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeOut = (value: number): number => 1 - (1 - value) * (1 - value);

const setOpacity = (material: Mesh["material"], opacity: number): void => {
  if (Array.isArray(material)) return;
  (material as MeshBasicMaterial).opacity = clamp01(opacity);
};

/**
 * Single-point activation pulse shared by monument abilities that fire from
 * a fixed structure tile (World Engine Strike, Imperial Exchange Levy).
 * `color` distinguishes abilities visually without needing a bespoke effect each.
 */
export const createMonumentPulseFxLayer = (scene: Scene, color: string, name: string): MonumentPulseFxLayer => {
  const group = new Group();
  group.name = name;
  scene.add(group);

  const ringGeometry = new RingGeometry(0.1, 0.4, 32);
  const flashGeometry = new CylinderGeometry(0.5, 0.5, 0.04, 16);

  const entries: PulseEntry[] = [];

  const makeMaterial = (opacity: number): MeshBasicMaterial =>
    new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });

  const spawn = (sceneX: number, sceneZ: number, surfaceY: number): void => {
    const entryGroup = new Group();
    entryGroup.position.set(sceneX, surfaceY + 0.02, sceneZ);

    const ring = new Mesh(ringGeometry, makeMaterial(0));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    entryGroup.add(ring);

    const flash = new Mesh(flashGeometry, makeMaterial(0));
    flash.position.y = 0.02;
    entryGroup.add(flash);

    group.add(entryGroup);
    entries.push({ group: entryGroup, ring, flash, startedAt: performance.now() });
  };

  const disposeEntry = (entry: PulseEntry): void => {
    group.remove(entry.group);
    entry.group.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      if (Array.isArray(child.material)) {
        for (const material of child.material) material.dispose();
      } else {
        child.material.dispose();
      }
    });
  };

  const update = (nowMs: number): void => {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i]!;
      const age = nowMs - entry.startedAt;
      if (age >= DURATION_MS) {
        disposeEntry(entry);
        entries.splice(i, 1);
        continue;
      }

      const flashT = clamp01(age / FLASH_END_MS);
      const expandT = clamp01((age - FLASH_END_MS) / (DURATION_MS - FLASH_END_MS));

      const ringScale = 1 + easeOut(expandT) * 2.4;
      entry.ring.scale.set(ringScale, ringScale, ringScale);
      const ringOpacity = age < FLASH_END_MS ? 0.9 * flashT : 0.9 * (1 - expandT);
      setOpacity(entry.ring.material, ringOpacity);

      const flashOpacity = age < FLASH_END_MS ? 0.75 * flashT : 0.75 * (1 - flashT);
      setOpacity(entry.flash.material, flashOpacity);
    }
  };

  const clear = (): void => {
    while (entries.length > 0) {
      disposeEntry(entries.pop()!);
    }
  };

  const dispose = (): void => {
    clear();
    scene.remove(group);
    ringGeometry.dispose();
    flashGeometry.dispose();
  };

  return { group, spawn, update, clear, dispose };
};
