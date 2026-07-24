import type { TileKey } from "@border-empires/shared";
import { WATCHTOWER_TARGET_COEFFICIENT, WATCHTOWER_TARGET_MIN_COUNT } from "@border-empires/shared";

import type { ServerWorldgenWatchtowersDeps, ServerWorldgenWatchtowersRuntime } from "./server-world-runtime-types.js";

/**
 * World-generated watchtower sites: dormant scouting structures spread
 * evenly across the map, roughly half as dense as towns. Placement uses the
 * same rejection-sampling approach as `generateTowns` (see
 * server-worldgen-towns.ts): seeded random candidates, rejected if not LAND,
 * already occupied by another site/structure, or too close to an existing
 * watchtower. A watchtower does nothing until a player expands their
 * territory onto its tile (see runtime-watchtower-activation.ts in
 * apps/simulation), at which point it activates exactly once.
 */
export const createServerWorldgenWatchtowers = (deps: ServerWorldgenWatchtowersDeps): ServerWorldgenWatchtowersRuntime => {
  const { seeded01, watchtowersByTile, WORLD_WIDTH, WORLD_HEIGHT, terrainAt, key, docksByTile, clusterByTile, townsByTile } = deps;

  const canPlaceWatchtowerAt = (x: number, y: number): boolean => {
    const tileKey = key(x, y);
    return (
      terrainAt(x, y) === "LAND" &&
      !docksByTile.has(tileKey) &&
      !clusterByTile.has(tileKey) &&
      !townsByTile.has(tileKey) &&
      !watchtowersByTile.has(tileKey)
    );
  };

  const generateWatchtowers = (seed: number): void => {
    watchtowersByTile.clear();
    const worldScale = (WORLD_WIDTH * WORLD_HEIGHT) / 1_000_000;
    const target = Math.max(WATCHTOWER_TARGET_MIN_COUNT, Math.floor(WATCHTOWER_TARGET_COEFFICIENT * worldScale));
    const minSpacing = Math.max(5, Math.floor(Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.018));
    const placed: Array<{ x: number; y: number }> = [];
    for (let index = 0; index < 120_000 && placed.length < target; index += 1) {
      const x = Math.floor(seeded01(index * 29, index * 31, seed + 22_301) * WORLD_WIDTH);
      const y = Math.floor(seeded01(index * 37, index * 41, seed + 22_311) * WORLD_HEIGHT);
      if (!canPlaceWatchtowerAt(x, y)) continue;
      const tooClose = placed.some((entry) => {
        const dx = Math.min(Math.abs(entry.x - x), WORLD_WIDTH - Math.abs(entry.x - x));
        const dy = Math.min(Math.abs(entry.y - y), WORLD_HEIGHT - Math.abs(entry.y - y));
        return dx + dy < minSpacing;
      });
      if (tooClose) continue;
      placed.push({ x, y });
      const tileKey = key(x, y);
      watchtowersByTile.set(tileKey, { tileKey, activated: false });
    }
  };

  return { generateWatchtowers, canPlaceWatchtowerAt };
};
