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

type CalmCache = { readonly rivers: readonly RiverPath[]; readonly calmByCorner: ReadonlyMap<number, number> };
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

/** Wave calm at world corner (x, z) for the current seed's rivers: 1 at a river mouth, 0 from CALM_RADIUS out. */
export const riverMouthCalmAt = (x: number, z: number): number => {
  const rivers = riversForCurrentSeed();
  if (cache?.rivers !== rivers) cache = { rivers, calmByCorner: buildRiverMouthCalm(rivers) };
  return cache.calmByCorner.get(cornerKey(x, z)) ?? 0;
};
