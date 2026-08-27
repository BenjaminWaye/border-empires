// Dedicated placement pass for mountain ring interiors (see
// packages/shared/src/worldgen/worldgen-mountain-rings.ts). isMountainCluster
// carves ring-shaped mountain annuli with a seeded gap so the interior is
// always reachable, but nothing about the interior itself was ever a
// placement target: the town coverage sweeps (ensureBaselineEconomyCoverage /
// ensureInterestCoverage in server-worldgen-towns.ts) run over fixed
// 30x30/15x15 grid blocks aligned to (0,0), not to ring centers, so a block
// can be marked "covered" by a town or dock elsewhere in the block while the
// ring interior sitting in the same block stays empty. The BASTION_FRAME /
// CARTOGRAPHERS_LENS natural wonder predicates only check "within manhattan
// distance 2-3 of ANY mountain tile" against a handful of random map-wide
// samples — nothing ties a specific ring to a specific wonder either. This
// pass instead visits every ring directly and guarantees its interior gets a
// town if it's land-accessible and still empty after every earlier pass.
import type { TileKey, WorldStyle } from "@border-empires/shared";
import { enumerateMountainRings, type MountainRingParams } from "@border-empires/shared";
import type { TownDefinition } from "@border-empires/game-domain";

export type RingInteriorTownsRuntime = {
  canPlaceTownAt: (x: number, y: number) => boolean;
  initialTownPopulationAt: (x: number, y: number, seed: number) => number;
  townTypeAt: (x: number, y: number) => "MARKET" | "FARMING";
};

export type RingInteriorFillDeps = {
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  terrainAt: (x: number, y: number) => string;
  key: (x: number, y: number) => TileKey;
  townsByTile: Map<TileKey, TownDefinition>;
  clusterByTile: Map<TileKey, string>;
  docksByTile: Map<TileKey, unknown>;
  townsRuntime: RingInteriorTownsRuntime;
  POPULATION_MAX: number;
};

/** Land tiles inside a ring's interior circle (d < innerRadius), nearest-first. */
const interiorLandTilesByDistance = (
  ring: MountainRingParams,
  deps: Pick<RingInteriorFillDeps, "WORLD_WIDTH" | "WORLD_HEIGHT" | "terrainAt">
): Array<{ x: number; y: number; d2: number }> => {
  const { WORLD_WIDTH, WORLD_HEIGHT, terrainAt } = deps;
  const radius = Math.max(0, ring.innerRadius - 1);
  const tiles: Array<{ x: number; y: number; d2: number }> = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const d2 = dx * dx + dy * dy;
      if (d2 > radius * radius) continue;
      const x = ((ring.cx + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
      const y = ((ring.cy + dy) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
      if (terrainAt(x, y) !== "LAND") continue;
      tiles.push({ x, y, d2 });
    }
  }
  tiles.sort((a, b) => a.d2 - b.d2);
  return tiles;
};

/**
 * Ensures every land-accessible mountain ring interior on the map holds a
 * settlement town, skipping rings that are entirely sea/lake (nothing to
 * place on) or that already have something placed by an earlier pass
 * (a town, a resource cluster, or a dock already inside the interior).
 */
export const fillMountainRingInteriors = (worldSeed: number, style: WorldStyle, deps: RingInteriorFillDeps): void => {
  const { WORLD_WIDTH, WORLD_HEIGHT, terrainAt, key, townsByTile, clusterByTile, docksByTile, townsRuntime, POPULATION_MAX } = deps;
  const { canPlaceTownAt, initialTownPopulationAt, townTypeAt } = townsRuntime;
  const rings = enumerateMountainRings(WORLD_WIDTH, WORLD_HEIGHT);
  for (const ring of rings) {
    const interiorTiles = interiorLandTilesByDistance(ring, { WORLD_WIDTH, WORLD_HEIGHT, terrainAt });
    if (interiorTiles.length === 0) continue; // entirely sea/lake — nothing to place on

    const alreadyOccupied = interiorTiles.some(({ x, y }) => {
      const tileKey = key(x, y);
      return townsByTile.has(tileKey) || clusterByTile.has(tileKey) || docksByTile.has(tileKey);
    });
    if (alreadyOccupied) continue;

    // Prefer a tile that respects the normal minimum town spacing; if every
    // interior tile is too close to an existing town (spacing is checked
    // against the whole map, not just this ring), fall back to placing at
    // the tile nearest the ring's center anyway. The interior is a small,
    // mountain-walled pocket that would otherwise stay permanently empty —
    // guaranteeing it gets *something* takes priority over spacing here.
    const placement = interiorTiles.find(({ x, y }) => canPlaceTownAt(x, y)) ?? interiorTiles[0];
    if (!placement) continue;
    const { x, y } = placement;
    const tileKey = key(x, y);
    townsByTile.set(tileKey, {
      townId: `town-ring-${ring.gx}-${ring.gy}-${tileKey}`,
      tileKey,
      type: townTypeAt(x, y),
      population: initialTownPopulationAt(x, y, worldSeed),
      maxPopulation: POPULATION_MAX,
      connectedTownCount: 0,
      connectedTownBonus: 0,
      lastGrowthTickAt: 0
    } as TownDefinition);
  }
  // style is currently unused by the placement logic itself (rings are
  // seeded the same way regardless of style) but kept in the signature so
  // callers don't need a separate no-op branch if style-specific behavior
  // (e.g. skipping on "islands" ring density) is added later.
  void style;
};
