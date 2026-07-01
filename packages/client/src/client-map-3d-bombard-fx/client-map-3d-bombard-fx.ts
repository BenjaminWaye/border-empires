import { AdditiveBlending, CylinderGeometry, Group, Mesh, MeshBasicMaterial, NormalBlending, RingGeometry, Scene, SphereGeometry } from "three";

const DURATION_MS = 1500;
const IMPACT_END_MS = 200;
const RING_EXPAND_MS = 1000;

const SMOKE_DURATION_MS = 1100;
const SMOKE_DRIFT_HEIGHT = 0.55;
const SMOKE_PUFF_COUNT = 3;

export type BombardTileOutcome = { dx: number; dy: number; outcome: "hit" | "miss" };

type HitEffect = {
  readonly kind: "hit";
  readonly ring: Mesh;
  readonly flash: Mesh;
};

type SmokePuff = {
  readonly mesh: Mesh;
  readonly delayMs: number;
  readonly riseHeight: number;
  readonly driftX: number;
  readonly driftZ: number;
};

type MissEffect = {
  readonly kind: "miss";
  readonly puffs: SmokePuff[];
};

type TileEffect = HitEffect | MissEffect;

type BombardEntry = {
  readonly group: Group;
  readonly tiles: TileEffect[];
  readonly startedAt: number;
};

export type BombardFxLayer = {
  readonly group: Group;
  readonly spawn: (sceneX: number, sceneZ: number, surfaceY: number, tiles: BombardTileOutcome[]) => void;
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
  const smokeGeometry = new SphereGeometry(0.16, 8, 6);

  const entries: BombardEntry[] = [];

  const makeImpactMaterial = (color: string, opacity: number): MeshBasicMaterial =>
    new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });

  const makeSmokeMaterial = (): MeshBasicMaterial =>
    new MeshBasicMaterial({ color: "#9a9a92", transparent: true, opacity: 0, blending: NormalBlending, depthWrite: false });

  const spawn = (sceneX: number, sceneZ: number, surfaceY: number, tiles: BombardTileOutcome[]): void => {
    const entryGroup = new Group();
    entryGroup.position.set(sceneX, surfaceY + 0.02, sceneZ);

    const tileEffects: TileEffect[] = [];

    for (const target of tiles) {
      const tileGroup = new Group();
      tileGroup.position.set(target.dx, 0, target.dy);
      entryGroup.add(tileGroup);

      if (target.outcome === "hit") {
        const ring = new Mesh(ringGeometry, makeImpactMaterial("#ff6622", 0.9));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.005;
        tileGroup.add(ring);

        const flash = new Mesh(flashGeometry, makeImpactMaterial("#ffaa44", 0));
        flash.position.y = 0.02;
        tileGroup.add(flash);

        tileEffects.push({ kind: "hit", ring, flash });
      } else {
        const puffs: SmokePuff[] = [];
        for (let i = 0; i < SMOKE_PUFF_COUNT; i += 1) {
          const mesh = new Mesh(smokeGeometry, makeSmokeMaterial());
          mesh.position.y = 0.04;
          tileGroup.add(mesh);
          puffs.push({
            mesh,
            delayMs: i * 90,
            riseHeight: SMOKE_DRIFT_HEIGHT * (0.7 + i * 0.18),
            driftX: (i - (SMOKE_PUFF_COUNT - 1) / 2) * 0.12,
            driftZ: (Math.random() - 0.5) * 0.1
          });
        }
        tileEffects.push({ kind: "miss", puffs });
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
        if (tile.kind === "hit") {
          const ringScale = 1 + ringT * 1.8;
          tile.ring.scale.set(ringScale, ringScale, ringScale);

          const ringOpacity = age < IMPACT_END_MS ? 0.9 * impactT : 0.9 * (1 - easeOut(ringT)) * (1 - fadeT);
          setOpacity(tile.ring.material, ringOpacity);

          const flashOpacity = age < IMPACT_END_MS ? 0.7 * impactT : 0.7 * (1 - impactT);
          setOpacity(tile.flash.material, flashOpacity);
          continue;
        }

        for (const puff of tile.puffs) {
          const puffAge = age - puff.delayMs;
          if (puffAge <= 0) {
            setOpacity(puff.mesh.material, 0);
            continue;
          }
          const puffT = clamp01(puffAge / SMOKE_DURATION_MS);
          const easedT = easeOut(puffT);
          puff.mesh.position.y = 0.04 + easedT * puff.riseHeight;
          puff.mesh.position.x = easedT * puff.driftX;
          puff.mesh.position.z = easedT * puff.driftZ;
          const scale = 0.5 + easedT * 0.9;
          puff.mesh.scale.set(scale, scale, scale);
          const fizzleIn = clamp01(puffAge / 150);
          const opacity = 0.45 * fizzleIn * (1 - puffT);
          setOpacity(puff.mesh.material, opacity);
        }
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
    smokeGeometry.dispose();
  };

  return { group, spawn, update, clear, dispose };
};
