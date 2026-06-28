import { AdditiveBlending, CylinderGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry, Scene } from "three";

const DURATION_MS = 1500;
const IMPACT_END_MS = 200;
const RING_EXPAND_MS = 1000;
const GRID_RADIUS = 1;

type TileEffect = {
  readonly ring: Mesh;
  readonly flash: Mesh;
  readonly startedAt: number;
};

type BombardEntry = {
  readonly group: Group;
  readonly tiles: TileEffect[];
  readonly startedAt: number;
};

export type BombardFxLayer = {
  readonly group: Group;
  readonly spawn: (sceneX: number, sceneZ: number, surfaceY: number) => void;
  readonly update: (nowMs: number) => void;
  readonly clear: () => void;
  readonly dispose: () => void;
};

const setOpacity = (material: Mesh["material"], opacity: number): void => {
  if (Array.isArray(material)) return;
  (material as MeshBasicMaterial).opacity = Math.max(0, Math.min(1, opacity));
};

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

export const createBombardFxLayer = (scene: Scene): BombardFxLayer => {
  const group = new Group();
  group.name = "bombard-fx";
  scene.add(group);

  const ringGeometry = new RingGeometry(0.08, 0.35, 24);
  const flashGeometry = new CylinderGeometry(0.42, 0.42, 0.04, 12);

  const entries: BombardEntry[] = [];

  const makeMaterial = (color: string, opacity: number): MeshBasicMaterial =>
    new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });

  const spawn = (sceneX: number, sceneZ: number, surfaceY: number): void => {
    const entryGroup = new Group();
    entryGroup.position.set(sceneX, surfaceY + 0.02, sceneZ);

    const tileEffects: TileEffect[] = [];

    for (let dy = -GRID_RADIUS; dy <= GRID_RADIUS; dy += 1) {
      for (let dx = -GRID_RADIUS; dx <= GRID_RADIUS; dx += 1) {
        const tileGroup = new Group();
        tileGroup.position.set(dx, 0, dy);

        const ring = new Mesh(ringGeometry, makeMaterial("#ff6622", 0.9));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.005;
        tileGroup.add(ring);

        const flash = new Mesh(flashGeometry, makeMaterial("#ffaa44", 0));
        flash.position.y = 0.02;
        tileGroup.add(flash);

        entryGroup.add(tileGroup);
        tileEffects.push({ ring, flash, startedAt: performance.now() });
      }
    }

    group.add(entryGroup);
    entries.push({ group: entryGroup, tiles: tileEffects, startedAt: performance.now() });
  };

  const disposeEntry = (entry: BombardEntry): void => {
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

      const impactT = clamp01(age / IMPACT_END_MS);
      const ringT = clamp01(Math.max(0, age - IMPACT_END_MS) / (RING_EXPAND_MS - IMPACT_END_MS));
      const fadeT = clamp01(Math.max(0, age - RING_EXPAND_MS) / (DURATION_MS - RING_EXPAND_MS));

      for (const tile of entry.tiles) {
        const ringScale = 1 + ringT * 1.8;
        tile.ring.scale.set(ringScale, ringScale, ringScale);

        const ringOpacity = age < IMPACT_END_MS ? 0.9 * impactT : 0.9 * (1 - easeOut(ringT)) * (1 - fadeT);
        setOpacity(tile.ring.material, ringOpacity);

        const flashOpacity = age < IMPACT_END_MS ? 0.7 * impactT : 0.7 * (1 - impactT);
        setOpacity(tile.flash.material, flashOpacity);
      }
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
