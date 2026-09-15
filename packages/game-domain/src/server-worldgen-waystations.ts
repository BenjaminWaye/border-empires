import type { TileKey } from "@border-empires/shared";
import { WAYSTATION_TARGET_SPACING_TILES, WAYSTATION_TARGET_TILES_PER_SITE } from "@border-empires/shared";

import type { ServerWorldgenWaystationsDeps, ServerWorldgenWaystationsRuntime } from "./server-world-runtime-types.js";

/**
 * World-generated waystation sites: dormant frontier outposts spread evenly
 * across the map, roughly ~1 per 400 tiles (denser than watchtowers) with a
 * fixed WAYSTATION_TARGET_SPACING_TILES minimum distance between centers.
 * Placement mirrors generateWatchtowers/generateTowns (see
 * server-worldgen-watchtowers.ts): seeded random candidates, rejected if not
 * LAND, already occupied by another site/structure, or too close to an
 * existing watchtower or waystation. A waystation does nothing until a
 * player expands their territory onto its tile (see
 * runtime-waystation-activation.ts in apps/simulation), at which point it
 * activates exactly once, granting four permanent effects in one shot.
 */
export const createServerWorldgenWaystations = (deps: ServerWorldgenWaystationsDeps): ServerWorldgenWaystationsRuntime => {
  const { seeded01, waystationsByTile, WORLD_WIDTH, WORLD_HEIGHT, terrainAt, key, docksByTile, clusterByTile, townsByTile, watchtowersByTile } = deps;

  const canPlaceWaystationAt = (x: number, y: number): boolean => {
    const tileKey = key(x, y);
    return (
      terrainAt(x, y) === "LAND" &&
      !docksByTile.has(tileKey) &&
      !clusterByTile.has(tileKey) &&
      !townsByTile.has(tileKey) &&
      !watchtowersByTile.has(tileKey) &&
      !waystationsByTile.has(tileKey)
    );
  };

  const generateWaystations = (seed: number): void => {
    waystationsByTile.clear();
    const worldTileCount = WORLD_WIDTH * WORLD_HEIGHT;
    const target = Math.max(1, Math.floor(worldTileCount / WAYSTATION_TARGET_TILES_PER_SITE));
    const minSpacing = WAYSTATION_TARGET_SPACING_TILES;
    const placed: Array<{ x: number; y: number }> = [];
    for (let index = 0; index < 200_000 && placed.length < target; index += 1) {
      const x = Math.floor(seeded01(index * 43, index * 47, seed + 33_401) * WORLD_WIDTH);
      const y = Math.floor(seeded01(index * 53, index * 59, seed + 33_411) * WORLD_HEIGHT);
      if (!canPlaceWaystationAt(x, y)) continue;
      const tooClose = placed.some((entry) => {
        const dx = Math.min(Math.abs(entry.x - x), WORLD_WIDTH - Math.abs(entry.x - x));
        const dy = Math.min(Math.abs(entry.y - y), WORLD_HEIGHT - Math.abs(entry.y - y));
        return dx + dy < minSpacing;
      });
      if (tooClose) continue;
      placed.push({ x, y });
      const tileKey = key(x, y);
      waystationsByTile.set(tileKey, { tileKey, activated: false });
    }
  };

  return { generateWaystations, canPlaceWaystationAt };
};
