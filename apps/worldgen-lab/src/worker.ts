/// <reference lib="webworker" />
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  setWorldSeed,
  terrainAt,
  landBiomeAt,
  regionTypeAt,
  grassShadeAt,
  isHillsTileAt,
  seeded01,
  wrapX,
  wrapY,
  generateRiverPaths,
  type WorldStyle,
  type NaturalWonderType,
  type Dock,
  type RiverPath,
  type TileKey
} from "@border-empires/shared";
import {
  createServerWorldgenClusters,
  createServerWorldgenNaturalWonders,
  createServerWorldgenTerrain,
  key as tileKeyOf,
  parseKey,
  type ClusterDefinition,
  type NaturalWonderSiteState,
  type TownDefinition
} from "@border-empires/game-domain";
import { computeSpawnSiteIndices, FAIR_SPAWN_SITE_TARGET } from "./worker-spawn-sites.js";

export type MapStyle = "continents" | "islands";

export type WorkerRequest = {
  seed: number;
  mapStyle: MapStyle;
};

export type WorkerResponse = {
  requestedSeed: number;
  actualSeed: number;       // may differ from requested when islands mode refines
  attempts: number;         // seed refinement attempts (1 = no refinement needed)
  mapStyle: MapStyle;
  terrain: Uint8Array;      // 0=SEA 1=LAND 2=MOUNTAIN 3=COASTAL_SEA
  biome: Uint8Array;        // 0=GRASS 1=SAND 2=COASTAL_SAND 255=N/A
  region: Uint8Array;       // 0=FERTILE_PLAINS 1=DEEP_FOREST 2=BROKEN_HIGHLANDS 3=ANCIENT_HEARTLAND 4=CRYSTAL_WASTES 255=N/A
  shade: Uint8Array;        // 0=DARK 1=LIGHT 255=N/A
  hills: Uint8Array;        // 0=no 1=yes — real isHillsTileAt() (mutually exclusive with forest)
  resourceLayer: Uint8Array;// 0=none 1=UMBRITE 2=FARM 3=GEMS 4=TITANIUM 5=FISH — actual placed cluster tiles (real generateClusters output, not a biome-eligibility heatmap)
  townIndices: Uint32Array; // flat tile indices of estimated town positions
  dockSiteIndices: Uint32Array; // one flat index per significant island (for dock markers)
  spawnSiteIndices: Uint32Array; // flat tile indices of the real production fair-spawn-site roster (see FAIR_SPAWN_SITE_WORLDGEN_MINIMUM)
  spawnSiteTarget: number; // roster target size (currently 50), for the "N / target" stat
  wonders: Array<{ index: number; type: NaturalWonderType }>; // up to 9, one per type — real server placement logic
  rivers: RiverPath[]; // real client-map-3d-rivers.ts path-generation output (packages/shared/src/worldgen/worldgen-rivers.ts), same algorithm the 3D client renders
  landCount: number;
  seaCount: number;
  mountainCount: number;
  islandCount: number;      // significant islands (≥20 tiles)
  largestIslandPct: number; // largest island as % of all land (0–100)
  minLandY: number;         // topmost row containing any LAND tile
  maxLandY: number;         // bottommost row containing any LAND tile
  townCount: number;        // estimated town placements
  dockCount: number;        // 1 per significant island + 1 extra per island ≥250 tiles
  hillsCount: number;       // land tiles flagged as hills
  farmSites: number;        // placed FARM resource tiles
  fishSites: number;        // placed FISH resource tiles
  gemsSites: number;        // placed GEMS resource tiles
  titaniumSites: number;    // placed TITANIUM resource tiles
  umbriteSites: number;     // placed UMBRITE resource tiles
  durationMs: number;
};

// Replicates the seed refinement formula from apps/simulation/src/season-seed-world.ts
const deriveNextSeed = (i: number, baseSeed: number): number =>
  Math.floor(seeded01(i * 101, i * 137, baseSeed + 9001) * 1e9);

const SIGNIFICANT_ISLAND_TILES = 20;
const LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD = 250;
const ISLANDS_MIN = 20;
const ISLANDS_MAX = 30;
const ISLANDS_MAX_LARGEST_SHARE = 0.22;
const MAX_REFINE_ATTEMPTS = 16;

// 8-directional BFS flood-fill on LAND tiles, toroidal wrap
const countIslands = (terrain: Uint8Array): {
  significant: number; largestShare: number; dockCount: number; dockSiteIndices: Uint32Array
} => {
  const visited = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  const islands: Array<{ size: number; start: number }> = [];
  let landTotal = 0;

  for (let sy = 0; sy < WORLD_HEIGHT; sy++) {
    for (let sx = 0; sx < WORLD_WIDTH; sx++) {
      const si = sy * WORLD_WIDTH + sx;
      if (terrain[si] !== 1 || visited[si]) continue;

      let size = 0;
      const queue: number[] = [si];
      visited[si] = 1;
      let head = 0;

      while (head < queue.length) {
        const curr = queue[head++]!;
        size++;
        const cx = curr % WORLD_WIDTH;
        const cy = Math.floor(curr / WORLD_WIDTH);

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = (cx + dx + WORLD_WIDTH) % WORLD_WIDTH;
            const ny = (cy + dy + WORLD_HEIGHT) % WORLD_HEIGHT;
            const ni = ny * WORLD_WIDTH + nx;
            if (terrain[ni] === 1 && !visited[ni]) {
              visited[ni] = 1;
              queue.push(ni);
            }
          }
        }
      }

      islands.push({ size, start: si });
      landTotal += size;
    }
  }

  islands.sort((a, b) => b.size - a.size);
  const sigIslands = islands.filter(i => i.size >= SIGNIFICANT_ISLAND_TILES);
  const dockCount = sigIslands.reduce((sum, i) => sum + 1 + (i.size >= LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD ? 1 : 0), 0);
  return {
    significant: sigIslands.length,
    largestShare: landTotal > 0 ? (islands[0]?.size ?? 0) / landTotal : 0,
    dockCount,
    dockSiteIndices: new Uint32Array(sigIslands.map(i => i.start))
  };
};

const isIslandsWorldValid = (significant: number, largestShare: number): boolean =>
  significant >= ISLANDS_MIN &&
  significant <= ISLANDS_MAX &&
  largestShare <= ISLANDS_MAX_LARGEST_SHARE;

type ResourceCounts = { fish: number; titanium: number; gems: number; farm: number; umbrite: number; layer: Uint8Array };

// Runs the real production cluster placement (server-worldgen-clusters.ts /
// server-worldgen-terrain.ts) against the world state setWorldSeed() just
// established, rather than re-deriving a biome-eligibility heatmap here —
// so cluster sizes, counts, and the hills-sparse UMBRITE/GEMS pass all show up
// exactly as they would in a real game. Most of ServerWorldgenTerrainDeps
// is unrelated to cluster placement (frontier claims, dock/fort/observatory
// economy) and is stubbed out the same way apps/simulation's
// season-seed-world.ts stubs it for its own test/lab worlds.
const placeResourceClusters = (seed: number): ResourceCounts => {
  const clusterByTile = new Map<TileKey, string>();
  const clustersById = new Map<string, ClusterDefinition>();
  const terrainRuntime = createServerWorldgenTerrain({
    wrapX,
    wrapY,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    terrainShapesByTile: new Map(),
    key: tileKeyOf,
    terrainAt,
    PLAYER_MOUNTAIN_DENSITY_RADIUS: 1,
    PLAYER_MOUNTAIN_DENSITY_LIMIT: 1,
    players: new Map(),
    parseKey,
    chebyshevDistance: () => 0,
    regionTypeAt,
    clusterByTile,
    landBiomeAt,
    grassShadeAt,
    FRONTIER_CLAIM_MS: 0,
    // Unused by cluster placement — stubbed only to satisfy the shared deps type.
    townsByTile: new Map(),
    docksByTile: new Map(),
    fortsByTile: new Map(),
    siegeOutpostsByTile: new Map(),
    observatoriesByTile: new Map(),
    economicStructuresByTile: new Map(),
    playerTile: () => ({ x: 0, y: 0, terrain: "SEA", lastChangedAt: 0 }),
    AIRPORT_BOMBARD_MIN_FIELD_TILES: 2,
    AIRPORT_BOMBARD_MAX_FIELD_TILES: 4,
    activeSeason: { worldSeed: seed },
    clustersById,
    ownership: new Map(),
    getOrInitResourceCounts: () => ({} as never),
    rebuildEconomyIndexForPlayer: () => {},
    sendPlayerUpdate: () => {},
    sendVisibleTileDeltaAt: () => {}
  });

  const clustersRuntime = createServerWorldgenClusters({
    clusterByTile,
    clustersById,
    clusterTypeDefs: terrainRuntime.clusterTypeDefs,
    seeded01: terrainRuntime.seeded01,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    clusterRuleMatch: (x, y, resource) => terrainRuntime.resourcePlacementAllowed(x, y, resource, false),
    clusterRuleMatchRelaxed: (x, y, resource) => terrainRuntime.resourcePlacementAllowed(x, y, resource, true),
    clusterTileCountForResource: terrainRuntime.clusterTileCountForResource,
    collectClusterTiles: terrainRuntime.collectClusterTiles,
    collectClusterTilesRelaxed: terrainRuntime.collectClusterTilesRelaxed,
    clusterRadiusForResource: terrainRuntime.clusterRadiusForResource,
    key: tileKeyOf,
    clusterResourceType: terrainRuntime.clusterResourceType
  });
  clustersRuntime.generateClusters(seed);

  let fish = 0, titanium = 0, gems = 0, farm = 0, umbrite = 0;
  const layer = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  for (const [tileKey, clusterId] of clusterByTile) {
    const resourceType = clustersById.get(clusterId)?.resourceType;
    if (!resourceType) continue;
    const [x, y] = parseKey(tileKey);
    // Display priority: FISH > TITANIUM > GEMS > FARM > UMBRITE
    const code = resourceType === "FISH" ? 5 : resourceType === "TITANIUM" ? 4 : resourceType === "GEMS" ? 3 : resourceType === "FARM" ? 2 : resourceType === "UMBRITE" ? 1 : 0;
    layer[y * WORLD_WIDTH + x] = code;
    if (resourceType === "FISH") fish++;
    else if (resourceType === "TITANIUM") titanium++;
    else if (resourceType === "GEMS") gems++;
    else if (resourceType === "FARM") farm++;
    else if (resourceType === "UMBRITE") umbrite++;
  }
  return { fish, titanium, gems, farm, umbrite, layer };
};

// Replicates all three town-placement passes from game-domain.
// Dock/cluster tiles are not tracked here (lab approximation), so count may be slightly high.
const estimateTownCount = (terrain: Uint8Array, seed: number): { count: number; indices: Uint32Array } => {
  const worldScale = (WORLD_WIDTH * WORLD_HEIGHT) / 1_000_000;
  const target = Math.max(70, Math.floor(180 * worldScale));
  const minSpacing = Math.max(5, Math.floor(Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.018));

  // Set of flat indices that have a town
  const townSet = new Set<number>();

  // Pass 1: generateTowns — seeded random placement up to target
  const placed: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < 120_000 && placed.length < target; index++) {
    const x = Math.floor(seeded01(index * 13, index * 17, seed + 9301) * WORLD_WIDTH);
    const y = Math.floor(seeded01(index * 19, index * 23, seed + 9311) * WORLD_HEIGHT);
    if (terrain[y * WORLD_WIDTH + x] !== 1) continue;
    let tooClose = false;
    for (const e of placed) {
      const dx = Math.min(Math.abs(e.x - x), WORLD_WIDTH - Math.abs(e.x - x));
      const dy = Math.min(Math.abs(e.y - y), WORLD_HEIGHT - Math.abs(e.y - y));
      if (dx + dy < minSpacing) { tooClose = true; break; }
    }
    if (!tooClose) { placed.push({ x, y }); townSet.add(y * WORLD_WIDTH + x); }
  }

  // Pass 2: ensureBaselineEconomyCoverage — one town per 30×30 cell that has land but no town
  for (let by = 0; by < WORLD_HEIGHT; by += 30) {
    for (let bx = 0; bx < WORLD_WIDTH; bx += 30) {
      let hasTown = false;
      let pick = -1;
      for (let dy = 0; dy < 30 && !hasTown; dy++) {
        for (let dx = 0; dx < 30 && !hasTown; dx++) {
          const idx = (by + dy) * WORLD_WIDTH + (bx + dx);
          if (terrain[idx] !== 1) continue;
          if (pick === -1 && !townSet.has(idx)) pick = idx;
          if (townSet.has(idx)) hasTown = true;
        }
      }
      if (!hasTown && pick !== -1) townSet.add(pick);
    }
  }

  // Pass 3 (ensureInterestCoverage) is omitted: in production, food clusters placed during
  // pass 2 make nearly every 15×15 sub-cell "interesting", so pass 3 adds very few towns.
  // Without cluster data in the worker we cannot replicate it without wild overcounting.

  return { count: townSet.size, indices: Uint32Array.from(townSet) };
};

// Reuses the real production placement logic (server-worldgen-natural-wonders.ts)
// rather than re-implementing the 9 spawn predicates here, so the lab stays
// accurate as those predicates evolve. Cluster centers aren't tracked in the
// lab (no resource-cluster model), so the §3.2 "≥12 from cluster center"
// exclusion is skipped — a lab approximation, same as estimateTownCount's.
const placeNaturalWonders = (
  terrain: Uint8Array,
  townIndices: Uint32Array,
  dockSiteIndices: Uint32Array,
  seed: number
): Array<{ index: number; type: NaturalWonderType }> => {
  const localTerrainAt = (x: number, y: number): ReturnType<typeof terrainAt> => {
    const code = terrain[y * WORLD_WIDTH + x];
    return code === 1 ? "LAND" : code === 2 ? "MOUNTAIN" : code === 3 ? "COASTAL_SEA" : "SEA";
  };
  const regionTypeAtLocal = (x: number, y: number) => (localTerrainAt(x, y) === "LAND" ? regionTypeAt(x, y) : undefined);

  // Only tile membership matters to the placement predicates (isVacantLandTile
  // just calls .has()), so these are approximated as presence-only maps and
  // cast to their real value types at the call site below — same narrowing
  // idiom production uses in season-seed-natural-wonders.ts.
  const townsByTile = new Map<TileKey, boolean>();
  for (const flatIdx of townIndices) {
    townsByTile.set(tileKeyOf(flatIdx % WORLD_WIDTH, Math.floor(flatIdx / WORLD_WIDTH)), true);
  }
  const docksByTile = new Map<TileKey, boolean>();
  for (const flatIdx of dockSiteIndices) {
    docksByTile.set(tileKeyOf(flatIdx % WORLD_WIDTH, Math.floor(flatIdx / WORLD_WIDTH)), true);
  }

  const naturalWondersByTile = new Map<TileKey, NaturalWonderSiteState>();
  const wondersRuntime = createServerWorldgenNaturalWonders({
    seeded01,
    naturalWondersByTile,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    terrainAt: localTerrainAt,
    regionTypeAtLocal,
    landBiomeAt,
    grassShadeAt,
    key: tileKeyOf,
    docksByTile: docksByTile as unknown as Map<TileKey, Dock>,
    clusterByTile: new Map<TileKey, string>(),
    clustersById: new Map<string, ClusterDefinition>(),
    townsByTile: townsByTile as unknown as Map<TileKey, TownDefinition>
  });
  wondersRuntime.generateNaturalWonders(seed);

  return [...naturalWondersByTile.values()].map((site) => {
    const [xStr, yStr] = site.tileKey.split(",");
    return { index: Number(yStr) * WORLD_WIDTH + Number(xStr), type: site.type };
  });
};

const generateTerrain = (seed: number, style: WorldStyle, terrain: Uint8Array, biome: Uint8Array, region: Uint8Array, shade: Uint8Array, hills: Uint8Array): { land: number; sea: number; mountain: number; hillsCount: number } => {
  setWorldSeed(seed, style);
  let land = 0, sea = 0, mountain = 0, hillsCount = 0;

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const idx = y * WORLD_WIDTH + x;
      const t = terrainAt(x, y);

      if (t === "LAND") {
        terrain[idx] = 1;
        land++;

        const b = landBiomeAt(x, y);
        if (b === "SAND") biome[idx] = 1;
        else if (b === "COASTAL_SAND") biome[idx] = 2;
        else biome[idx] = 0;

        const r = regionTypeAt(x, y);
        if (r === "DEEP_FOREST") region[idx] = 1;
        else if (r === "BROKEN_HIGHLANDS") region[idx] = 2;
        else if (r === "ANCIENT_HEARTLAND") region[idx] = 3;
        else if (r === "CRYSTAL_WASTES") region[idx] = 4;
        else region[idx] = 0;

        shade[idx] = grassShadeAt(x, y) === "LIGHT" ? 1 : 0;

        if (isHillsTileAt(x, y)) {
          hills[idx] = 1;
          hillsCount++;
        }
      } else if (t === "MOUNTAIN") {
        terrain[idx] = 2;
        mountain++;
      } else if (t === "COASTAL_SEA") {
        terrain[idx] = 3;
        sea++;
      } else {
        terrain[idx] = 0;
        sea++;
      }
    }
  }

  return { land, sea, mountain, hillsCount };
};

self.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  const { seed, mapStyle } = event.data;
  const t0 = performance.now();

  const size = WORLD_WIDTH * WORLD_HEIGHT;
  const terrain = new Uint8Array(size);
  const biome = new Uint8Array(size).fill(255);
  const region = new Uint8Array(size).fill(255);
  const shade = new Uint8Array(size).fill(255);
  const hills = new Uint8Array(size);

  let currentSeed = seed;
  let attempts = 1;
  // Islands mode uses its own generation function (many small blobs) — no seed refinement needed.
  // Continents mode refines the seed until island-count criteria are met (legacy behaviour kept).
  let counts = generateTerrain(currentSeed, mapStyle, terrain, biome, region, shade, hills);

  if (mapStyle === "continents") {
    const { significant, largestShare } = countIslands(terrain);
    if (!isIslandsWorldValid(significant, largestShare)) {
      for (let i = 1; i <= MAX_REFINE_ATTEMPTS; i++) {
        const nextSeed = deriveNextSeed(i, seed);
        terrain.fill(0);
        biome.fill(255);
        region.fill(255);
        shade.fill(255);
        hills.fill(0);
        counts = generateTerrain(nextSeed, mapStyle, terrain, biome, region, shade, hills);
        const next = countIslands(terrain);
        attempts++;
        if (isIslandsWorldValid(next.significant, next.largestShare)) {
          currentSeed = nextSeed;
          break;
        }
        if (i === MAX_REFINE_ATTEMPTS) {
          currentSeed = nextSeed;
        }
      }
    }
  }

  const { significant: islandCount, largestShare, dockCount, dockSiteIndices } = countIslands(terrain);
  // setWorldSeed(currentSeed, ...) is still in effect from the terrain generation
  // above (generateTerrain's last call used currentSeed), so real cluster
  // placement below reads the same world the rendered terrain/biome grids came from.
  const resources = placeResourceClusters(currentSeed);
  const { count: townCount, indices: townIndices } = estimateTownCount(terrain, currentSeed);
  const wonders = placeNaturalWonders(terrain, townIndices, dockSiteIndices, currentSeed);
  const spawnSiteIndices = computeSpawnSiteIndices(terrain, resources.layer, townIndices);
  // setWorldSeed(currentSeed, ...) is still in effect (see the comment above
  // placeResourceClusters), so this reads terrainAt/landBiomeAt for the same
  // world the rendered grids came from — the same worldgen state
  // client-map-3d-rivers.ts reads in the real 3D client.
  const rivers = [...generateRiverPaths(currentSeed)];

  // Find tightest Y extent of land tiles
  let minLandY = WORLD_HEIGHT;
  for (let y = 0; y < WORLD_HEIGHT && minLandY === WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      if (terrain[y * WORLD_WIDTH + x] === 1) { minLandY = y; break; }
    }
  }
  let maxLandY = -1;
  for (let y = WORLD_HEIGHT - 1; y >= 0 && maxLandY === -1; y--) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      if (terrain[y * WORLD_WIDTH + x] === 1) { maxLandY = y; break; }
    }
  }

  const response: WorkerResponse = {
    requestedSeed: seed,
    actualSeed: currentSeed,
    attempts,
    mapStyle,
    terrain,
    biome,
    region,
    shade,
    hills,
    resourceLayer: resources.layer,
    townIndices,
    dockSiteIndices,
    spawnSiteIndices,
    spawnSiteTarget: FAIR_SPAWN_SITE_TARGET,
    wonders,
    rivers,
    landCount: counts.land,
    seaCount: counts.sea,
    mountainCount: counts.mountain,
    islandCount,
    largestIslandPct: Math.round(largestShare * 100),
    minLandY,
    maxLandY,
    townCount,
    dockCount,
    hillsCount: counts.hillsCount,
    farmSites: resources.farm,
    fishSites: resources.fish,
    gemsSites: resources.gems,
    titaniumSites: resources.titanium,
    umbriteSites: resources.umbrite,
    durationMs: performance.now() - t0
  };

  self.postMessage(response, [
    terrain.buffer, biome.buffer, region.buffer, shade.buffer, hills.buffer,
    resources.layer.buffer, townIndices.buffer, dockSiteIndices.buffer, spawnSiteIndices.buffer
  ]);
};
