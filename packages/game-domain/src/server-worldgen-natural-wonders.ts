import type { NaturalWonderType } from "@border-empires/shared";
import { createRelicState, RELIC_RULES, isSeaTerrain } from "@border-empires/shared";

import type { ServerWorldgenNaturalWondersDeps, ServerWorldgenNaturalWondersRuntime } from "./server-world-runtime-types.js";

/** Seven seed-selected installations on normal worlds. Biomes are preferences,
 * not prerequisites: a buried factory survives changes to its surface climate.
 * Small worlds reduce the site count and spacing; occupied tiles stay excluded. */
const MIN_DIST_FROM_CLUSTER = 12;
const MIN_DIST_FROM_WONDER = 8;
const MAX_ATTEMPTS_PER_WONDER = 5_000;

const manhattanWrap = (ax: number, ay: number, bx: number, by: number, width: number, height: number): number => {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.min(dx, width - dx) + Math.min(dy, height - dy);
};

export const createServerWorldgenNaturalWonders = (deps: ServerWorldgenNaturalWondersDeps): ServerWorldgenNaturalWondersRuntime => {
  const { seeded01, naturalWondersByTile, WORLD_WIDTH, WORLD_HEIGHT, terrainAt, regionTypeAtLocal, landBiomeAt, grassShadeAt, key, docksByTile, clusterByTile, clustersById, townsByTile } = deps;

  const isVacantLandTile = (x: number, y: number): boolean => {
    if (terrainAt(x, y) !== "LAND") return false;
    const tileKey = key(x, y);
    return !docksByTile.has(tileKey) && !clusterByTile.has(tileKey) && !townsByTile.has(tileKey) && !naturalWondersByTile.has(tileKey);
  };

  const withinManhattanOfTerrain = (x: number, y: number, radius: number, predicate: (terrain: ReturnType<typeof terrainAt>) => boolean): boolean => {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        const nx = ((x + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
        const ny = ((y + dy) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
        if (predicate(terrainAt(nx, ny))) return true;
      }
    }
    return false;
  };

  // Spawn predicates in placement order — tightest/rarest first (design §3.2:
  // "Rarest wonders placed first").
  const WONDER_SPAWN_ORDER: ReadonlyArray<{ type: NaturalWonderType; predicate: (x: number, y: number) => boolean }> = [
    { type: "FOUNDRY_HEART", predicate: (x, y) => regionTypeAtLocal(x, y) === "CRYSTAL_WASTES" },
    { type: "CONSCRIPTION_ENGINE", predicate: (x, y) => regionTypeAtLocal(x, y) === "BROKEN_HIGHLANDS" },
    { type: "WATCHTOWER_ENGINE", predicate: (x, y) => regionTypeAtLocal(x, y) === "DEEP_FOREST" },
    { type: "BASTION_FRAME", predicate: (x, y) => withinManhattanOfTerrain(x, y, 3, (t) => t === "MOUNTAIN") },
    { type: "CARTOGRAPHERS_LENS", predicate: (x, y) => withinManhattanOfTerrain(x, y, 2, (t) => t === "MOUNTAIN") },
    { type: "DEEPWATER_ENGINE", predicate: (x, y) => landBiomeAt(x, y) === "COASTAL_SAND" && withinManhattanOfTerrain(x, y, 2, isSeaTerrain) },
    { type: "WARPRESS", predicate: (x, y) => regionTypeAtLocal(x, y) === "FERTILE_PLAINS" },
    { type: "QUICKFORGE", predicate: (x, y) => regionTypeAtLocal(x, y) === "FERTILE_PLAINS" || regionTypeAtLocal(x, y) === "ANCIENT_HEARTLAND" },
    { type: "CALCULATING_ENGINE", predicate: (x, y) => landBiomeAt(x, y) === "GRASS" && grassShadeAt(x, y) === "LIGHT" }
  ];

  const generateNaturalWonders = (seed: number): void => {
    naturalWondersByTile.clear();
    const clusterCenters = [...clustersById.values()].map((cluster) => ({ x: cluster.centerX, y: cluster.centerY }));
    const placed: Array<{ x: number; y: number }> = [];
    const count = Math.min(RELIC_RULES.normalPlanetCount, Math.max(1, Math.floor(WORLD_WIDTH * WORLD_HEIGHT / 200)));
    const selection = new Set([...WONDER_SPAWN_ORDER].sort((a, b) =>
      seeded01(WONDER_SPAWN_ORDER.indexOf(a), 701, seed) - seeded01(WONDER_SPAWN_ORDER.indexOf(b), 701, seed)
    ).slice(0, count).map(entry => entry.type));
    const spacing = Math.min(MIN_DIST_FROM_WONDER, Math.max(2, Math.floor(Math.min(WORLD_WIDTH, WORLD_HEIGHT) / 4)));
    const clusterSpacing = Math.min(MIN_DIST_FROM_CLUSTER, Math.max(2, Math.floor(Math.min(WORLD_WIDTH, WORLD_HEIGHT) / 3)));
    let wonderIndex = 0;
    for (const { type, predicate } of WONDER_SPAWN_ORDER) {
      if (!selection.has(type)) continue;
      wonderIndex += 1;
      for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_WONDER; attempt += 1) {
        const x = Math.floor(seeded01(attempt * 53 + wonderIndex * 7, attempt * 61 + wonderIndex * 11, seed + 31_000 + wonderIndex * 97) * WORLD_WIDTH);
        const y = Math.floor(seeded01(attempt * 67 + wonderIndex * 13, attempt * 71 + wonderIndex * 17, seed + 31_500 + wonderIndex * 101) * WORLD_HEIGHT);
        if (!isVacantLandTile(x, y)) continue;
        if (attempt < MAX_ATTEMPTS_PER_WONDER / 2 && !predicate(x, y)) continue;
        const tooCloseToCluster = clusterCenters.some((c) => manhattanWrap(x, y, c.x, c.y, WORLD_WIDTH, WORLD_HEIGHT) < clusterSpacing);
        if (tooCloseToCluster) continue;
        const tooCloseToWonder = placed.some((p) => manhattanWrap(x, y, p.x, p.y, WORLD_WIDTH, WORLD_HEIGHT) < spacing);
        if (tooCloseToWonder) continue;
        placed.push({ x, y });
        naturalWondersByTile.set(key(x, y), { tileKey: key(x, y), ...createRelicState(type) });
        break;
      }
    }
  };

  return { generateNaturalWonders };
};
