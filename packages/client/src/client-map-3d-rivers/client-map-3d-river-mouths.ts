// Calm sea around v9 river mouths. The ocean surface bobs every tile corner
// up and down by up to ~0.22 (client-map-3d-water-surface.ts waveY); next to
// a river mouth that lifted the sea's square tile edges above and below the
// flat river plume, so the sea-tile edges showed right where the river
// enters. Around each mouth the waves die down to flat, so the river meets
// still water at the same level.
import { riversForCurrentSeed, WORLD_HEIGHT, WORLD_WIDTH, type RiverPath } from "@border-empires/shared";
import { wrap } from "../client-map-3d-heightfield-terrain.js";
import { seaDirectionAtCorner } from "./client-map-3d-river-edge-water.js";

// Waves are fully back this far (tiles) from a mouth.
const CALM_RADIUS = 2.5;

type CalmCache = {
  readonly rivers: readonly RiverPath[];
  readonly calmByCorner: ReadonlyMap<number, number>;
  readonly mouthCorners: ReadonlySet<number>;
};
// One seed at a time (rivers are per seed): bounded by mouths x ~25 corners.
let cache: CalmCache | null = null;

const cornerKey = (x: number, z: number): number => wrap(z, WORLD_HEIGHT) * WORLD_WIDTH + wrap(x, WORLD_WIDTH);

/** Calm (0 = full waves, 1 = flat) at each world corner near a river mouth, for `rivers`. */
export const buildRiverMouthCalm = (
  rivers: readonly RiverPath[],
  isMouthCorner: (cornerX: number, cornerZ: number) => boolean = (x, z) => seaDirectionAtCorner(x, z) !== null
): Map<number, number> => {
  const calm = new Map<number, number>();
  const reach = Math.ceil(CALM_RADIUS);
  for (const path of rivers) {
    const end = path[path.length - 1];
    if (!end) continue;
    const mx = Math.round(end.wx);
    const mz = Math.round(end.wy);
    if (!isMouthCorner(mx, mz)) continue;
    for (let dz = -reach; dz <= reach; dz += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        const t = 1 - Math.hypot(dx, dz) / CALM_RADIUS;
        if (t <= 0) continue;
        const value = t * t * (3 - 2 * t);
        const key = cornerKey(mx + dx, mz + dz);
        if (value > (calm.get(key) ?? 0)) calm.set(key, value);
      }
    }
  }
  return calm;
};

const NO_CALM: ReadonlyMap<number, number> = new Map();

/**
 * Wave calm for the current seed's rivers, keyed by world corner
 * (z * WORLD_WIDTH + x): 1 at a river mouth, fading to 0 at CALM_RADIUS.
 * Only corners near a mouth are present (a few hundred), so the water
 * surface walks this map instead of querying every sea vertex -- a
 * per-vertex lookup cost 10-15 ms per rebuild at full zoom-out.
 */
const currentCache = (): CalmCache => {
  const rivers = riversForCurrentSeed();
  if (cache?.rivers !== rivers) {
    const calmByCorner = buildRiverMouthCalm(rivers);
    // Full calm (1) only ever sits exactly on a mouth corner.
    const mouthCorners = new Set([...calmByCorner].filter(([, calm]) => calm >= 1).map(([key]) => key));
    cache = { rivers, calmByCorner, mouthCorners };
  }
  return cache;
};

export const riverMouthCalmCorners = (): ReadonlyMap<number, number> => {
  const { calmByCorner } = currentCache();
  return calmByCorner.size === 0 ? NO_CALM : calmByCorner;
};

/** World corners (z * WORLD_WIDTH + x) where a river meets the sea, for the current seed. */
export const riverMouthCorners = (): ReadonlySet<number> => currentCache().mouthCorners;

