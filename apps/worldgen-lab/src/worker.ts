/// <reference lib="webworker" />
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  setWorldSeed,
  terrainAt,
  landBiomeAt,
  regionTypeAt,
  grassShadeAt,
  type WorldStyle
} from "@border-empires/shared";

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
  resourceLayer: Uint8Array;// 0=none 1=FUR 2=FARM 3=GEMS 4=IRON 5=FISH (highest-priority resource per tile)
  townIndices: Uint32Array; // flat tile indices of estimated town positions
  dockSiteIndices: Uint32Array; // one flat index per significant island (for dock markers)
  landCount: number;
  seaCount: number;
  mountainCount: number;
  islandCount: number;      // significant islands (≥20 tiles)
  largestIslandPct: number; // largest island as % of all land (0–100)
  minLandY: number;         // topmost row containing any LAND tile
  maxLandY: number;         // bottommost row containing any LAND tile
  townCount: number;        // estimated town placements
  dockCount: number;        // 1 per significant island + 1 extra per island ≥250 tiles
  farmSites: number;        // eligible FARM resource tiles
  fishSites: number;        // eligible FISH resource tiles
  gemsSites: number;        // eligible GEMS resource tiles
  ironSites: number;        // eligible IRON resource tiles
  furSites: number;         // eligible FUR resource tiles
  durationMs: number;
};

// Replicates the private seeded01 from shared/worldgen.ts for seed derivation
const seeded01 = (x: number, y: number, seed: number): number => {
  const n = Math.sin((x * 12.9898 + y * 78.233 + seed * 43758.5453) % 100000) * 43758.5453123;
  return n - Math.floor(n);
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

// Manhattan-distance mountain scan matching game-domain isNearMountain
const isNearMountainLocal = (x: number, y: number, r: number, terrain: Uint8Array): boolean => {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > r) continue;
      const nx = (x + dx + WORLD_WIDTH) % WORLD_WIDTH;
      const ny = (y + dy + WORLD_HEIGHT) % WORLD_HEIGHT;
      if (terrain[ny * WORLD_WIDTH + nx] === 2) return true;
    }
  }
  return false;
};

// 4-directional coastal check (SEA=0 or COASTAL_SEA=3)
const isCoastalLandLocal = (x: number, y: number, terrain: Uint8Array): boolean => {
  const u = terrain[((y - 1 + WORLD_HEIGHT) % WORLD_HEIGHT) * WORLD_WIDTH + x]!;
  const r = terrain[y * WORLD_WIDTH + ((x + 1) % WORLD_WIDTH)]!;
  const d = terrain[((y + 1) % WORLD_HEIGHT) * WORLD_WIDTH + x]!;
  const l = terrain[y * WORLD_WIDTH + ((x - 1 + WORLD_WIDTH) % WORLD_WIDTH)]!;
  return u === 0 || u === 3 || r === 0 || r === 3 || d === 0 || d === 3 || l === 0 || l === 3;
};

type ResourceCounts = { fish: number; iron: number; gems: number; farm: number; fur: number; layer: Uint8Array };

const countResourceSites = (terrain: Uint8Array, biome: Uint8Array, shade: Uint8Array, region: Uint8Array): ResourceCounts => {
  let fish = 0, iron = 0, gems = 0, farm = 0, fur = 0;
  const layer = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const idx = y * WORLD_WIDTH + x;
      if (terrain[idx] !== 1) continue;
      const b = biome[idx]!;
      const s = shade[idx]!;
      const r = region[idx]!;
      const isFish = b === 2;
      const isIron = (b === 1 && isNearMountainLocal(x, y, 4, terrain)) || (b === 0 && isNearMountainLocal(x, y, 1, terrain));
      const isGems = b === 1;
      const isFarm = b === 0 && s === 1;
      const isFur = !isCoastalLandLocal(x, y, terrain) && ((b === 0 && s === 0 && r === 1) || b === 1);
      if (isFish) fish++;
      if (isIron) iron++;
      if (isGems) gems++;
      if (isFarm) farm++;
      if (isFur) fur++;
      // Display priority: FISH > IRON > GEMS > FARM > FUR
      layer[idx] = isFish ? 5 : isIron ? 4 : isGems ? 3 : isFarm ? 2 : isFur ? 1 : 0;
    }
  }
  return { fish, iron, gems, farm, fur, layer };
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

const generateTerrain = (seed: number, style: WorldStyle, terrain: Uint8Array, biome: Uint8Array, region: Uint8Array, shade: Uint8Array): { land: number; sea: number; mountain: number } => {
  setWorldSeed(seed, style);
  let land = 0, sea = 0, mountain = 0;

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

  return { land, sea, mountain };
};

self.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  const { seed, mapStyle } = event.data;
  const t0 = performance.now();

  const size = WORLD_WIDTH * WORLD_HEIGHT;
  const terrain = new Uint8Array(size);
  const biome = new Uint8Array(size).fill(255);
  const region = new Uint8Array(size).fill(255);
  const shade = new Uint8Array(size).fill(255);

  let currentSeed = seed;
  let attempts = 1;
  // Islands mode uses its own generation function (many small blobs) — no seed refinement needed.
  // Continents mode refines the seed until island-count criteria are met (legacy behaviour kept).
  let counts = generateTerrain(currentSeed, mapStyle, terrain, biome, region, shade);

  if (mapStyle === "continents") {
    const { significant, largestShare } = countIslands(terrain);
    if (!isIslandsWorldValid(significant, largestShare)) {
      for (let i = 1; i <= MAX_REFINE_ATTEMPTS; i++) {
        const nextSeed = deriveNextSeed(i, seed);
        terrain.fill(0);
        biome.fill(255);
        region.fill(255);
        shade.fill(255);
        counts = generateTerrain(nextSeed, mapStyle, terrain, biome, region, shade);
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
  const resources = countResourceSites(terrain, biome, shade, region);
  const { count: townCount, indices: townIndices } = estimateTownCount(terrain, currentSeed);

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
    resourceLayer: resources.layer,
    townIndices,
    dockSiteIndices,
    landCount: counts.land,
    seaCount: counts.sea,
    mountainCount: counts.mountain,
    islandCount,
    largestIslandPct: Math.round(largestShare * 100),
    minLandY,
    maxLandY,
    townCount,
    dockCount,
    farmSites: resources.farm,
    fishSites: resources.fish,
    gemsSites: resources.gems,
    ironSites: resources.iron,
    furSites: resources.fur,
    durationMs: performance.now() - t0
  };

  self.postMessage(response, [
    terrain.buffer, biome.buffer, region.buffer, shade.buffer,
    resources.layer.buffer, townIndices.buffer, dockSiteIndices.buffer
  ]);
};
