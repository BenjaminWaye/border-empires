import { AdditiveBlending, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, Scene, TorusGeometry } from "three";

const FADE_IN_MS = 400;
const FADE_OUT_MS = 800;
const TILE_WORLD_SIZE = 1;

type StasisFieldEntry = {
  readonly group: Group;
  readonly boundaryRing: Mesh;
  readonly shimmer: Mesh;
  readonly startedAt: number;
  durationMs: number;
  activeUntil: number;
};

export type AegisLockFxLayer = {
  readonly group: Group;
  /** radiusInTiles is the ability's coverage radius (AEGIS_DOME_PROTECTION_RADIUS). */
  readonly spawn: (sceneX: number, sceneZ: number, surfaceY: number, radiusInTiles: number, durationMs: number) => void;
  readonly update: (nowMs: number) => void;
  readonly clear: () => void;
  readonly dispose: () => void;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const setOpacity = (material: Mesh["material"], opacity: number): void => {
  if (Array.isArray(material)) return;
  (material as MeshBasicMaterial).opacity = clamp01(opacity);
};

/**
 * Aegis Lock's "stasis field": deliberately NOT a solid dome. A 25-30 tile
 * radius at full opacity would occlude far too much of the map, so this is a
 * thin glowing boundary ring plus a faint rotating shimmer torus just inside
 * it — legible from a distance without blocking the view of tiles underneath.
 */
export const createAegisLockFxLayer = (scene: Scene): AegisLockFxLayer => {
  const group = new Group();
  group.name = "aegis-lock-fx";
  scene.add(group);

  const entries: StasisFieldEntry[] = [];

  const spawn = (sceneX: number, sceneZ: number, surfaceY: number, radiusInTiles: number, durationMs: number): void => {
    const radius = radiusInTiles * TILE_WORLD_SIZE;
    const entryGroup = new Group();
    entryGroup.position.set(sceneX, surfaceY + 0.03, sceneZ);

    const boundaryGeometry = new RingGeometry(radius - 0.18, radius, 96);
    const boundaryMaterial = new MeshBasicMaterial({
      color: "#7fe6ff",
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide
    });
    const boundaryRing = new Mesh(boundaryGeometry, boundaryMaterial);
    boundaryRing.rotation.x = -Math.PI / 2;
    entryGroup.add(boundaryRing);

    const shimmerGeometry = new TorusGeometry(radius * 0.94, 0.04, 6, 96);
    const shimmerMaterial = new MeshBasicMaterial({
      color: "#bff6ff",
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false
    });
    const shimmer = new Mesh(shimmerGeometry, shimmerMaterial);
    shimmer.rotation.x = -Math.PI / 2;
    entryGroup.add(shimmer);

    group.add(entryGroup);
    const startedAt = performance.now();
    entries.push({ group: entryGroup, boundaryRing, shimmer, startedAt, durationMs, activeUntil: startedAt + durationMs });
  };

  const disposeEntry = (entry: StasisFieldEntry): void => {
    group.remove(entry.group);
    entry.group.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      if (Array.isArray(child.material)) {
        for (const material of child.material) material.dispose();
      } else {
        child.material.dispose();
      }
      child.geometry.dispose();
    });
  };

  const update = (nowMs: number): void => {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i]!;
      const age = nowMs - entry.startedAt;
      const remaining = entry.durationMs - age;
      if (remaining <= 0) {
        disposeEntry(entry);
        entries.splice(i, 1);
        continue;
      }

      const fadeInT = clamp01(age / FADE_IN_MS);
      const fadeOutT = clamp01(1 - remaining / FADE_OUT_MS);
      const envelope = Math.min(fadeInT, 1 - fadeOutT);

      setOpacity(entry.boundaryRing.material, 0.55 * envelope);
      entry.boundaryRing.rotation.z = nowMs / 6000;

      const shimmerPulse = 0.22 + Math.sin(nowMs / 900) * 0.08;
      setOpacity(entry.shimmer.material, shimmerPulse * envelope);
      entry.shimmer.rotation.z = -nowMs / 4200;
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
  };

  return { group, spawn, update, clear, dispose };
};
