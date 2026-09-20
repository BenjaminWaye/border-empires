// Split out of worldgen.ts (already near the repo's 500-line file cap) so
// this didn't push that file over the limit -- same pattern as
// worldgen-lakes.ts / worldgen-oasis.ts. Pure connected-components algorithm,
// no dependency on world state: worldgen.ts supplies the land/mountain
// predicate and gets back a same-size mask of which tiles belong to a
// too-small landmass and should be forced back to SEA.
//
// The tectonic-plate/noise scoring in worldgen-continent-score.ts can flip a
// single isolated tile (or a tiny 2-3 tile cluster) above the land threshold
// purely from local noise variance, with no surrounding land at all -- reads
// as a stray speck of land floating alone in open ocean, not an island.
// This runs a flood fill over the whole map once per seed/style and prunes
// any land-like component under MIN_ISLAND_TILES back to sea.
const MIN_ISLAND_TILES = 6;

// MIN_ISLAND_TILES alone isn't enough: a real (if small) island still clears
// it -- e.g. a solid 3x3 block is 9 tiles -- but if that same 9-tile island
// sits 15-20 tiles from any other land with nothing else nearby, it still
// reads as a stray "lonely tile" floating in open ocean once rendered at map
// scale, not a deliberate island or part of an archipelago. Real small
// islands are essentially never truly solitary at random -- they cluster
// near a coast or near each other (an archipelago chain, an island near its
// mainland). So any component smaller than STANDALONE_ISLAND_TILES is only
// kept if it has *some* other land within ISOLATION_RADIUS tiles; anything
// past that size is assumed big enough to plausibly stand alone (a real
// Iceland/Hawaii-style remote island) and skips the isolation check entirely.
const STANDALONE_ISLAND_TILES = 40;
const ISOLATION_RADIUS = 16;

// Cellular-automata smoothing: the standard tile-grid coastline technique
// (classic Civ-style 4X map generators) that a continuous noise field alone
// can't give a *tile* map -- organically eroded edges with no single-tile
// specks, no perfectly straight runs, and no thin threads, purely from
// neighbor counts. Run this ahead of the flood-fill prune below so fewer,
// more meaningful islands survive to be size-checked.
const CA_SMOOTHING_PASSES = 2;
const CA_DEATH_NEIGHBOR_THRESHOLD = 4; // land tile with < 4 of 8 neighbors land -> becomes sea
const CA_BIRTH_NEIGHBOR_THRESHOLD = 5; // sea tile with >= 5 of 8 neighbors land -> becomes land

const NEIGHBOR_OFFSETS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
] as const;

// Runs in-place over a Uint8Array land/sea grid (1 = land-like, 0 = sea),
// toroidal in x, not in y (matches findTinyIslandMask's wrap convention).
export const smoothLandMaskWithCellularAutomata = (width: number, height: number, landMask: Uint8Array): void => {
  const idx = (x: number, y: number): number => y * width + x;
  let current: Uint8Array = landMask;
  let scratch: Uint8Array = new Uint8Array(width * height);
  for (let pass = 0; pass < CA_SMOOTHING_PASSES; pass += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let landNeighbors = 0;
        for (const [dx, dy] of NEIGHBOR_OFFSETS) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          const nx = (x + dx + width) % width;
          if (current[idx(nx, ny)]) landNeighbors += 1;
        }
        const wasLand = current[idx(x, y)] === 1;
        scratch[idx(x, y)] = wasLand
          ? (landNeighbors >= CA_DEATH_NEIGHBOR_THRESHOLD ? 1 : 0)
          : (landNeighbors >= CA_BIRTH_NEIGHBOR_THRESHOLD ? 1 : 0);
      }
    }
    const swap = current;
    current = scratch;
    scratch = swap;
  }
  if (current !== landMask) landMask.set(current);
};

export type CoastalCleanupMasks = {
  // Land-like tiles that should be forced back to sea -- covers BOTH a raw
  // land tile the CA smoothing pass killed outright (too few land-like
  // neighbors to survive even one pass, so it's never land-like in
  // smoothedLandMask at all) AND a tile that stayed land-like through
  // smoothing but as part of a too-small/too-isolated component. An earlier
  // version only covered the second case (derived straight from the
  // find-tiny-islands flood fill, which only ever visits tiles that are
  // still land-like in the smoothed mask) -- so a raw land tile CA had
  // already killed had no matching "please force this to sea" entry at all,
  // and baseTerrainCodeAt let its raw LAND/MOUNTAIN code through unchanged.
  // That was the actual mechanism behind literal single-tile land specks
  // surviving in open water: not a failure of the size/isolation checks
  // themselves, but a gap in how their result was communicated back.
  tinyIslandMask: Uint8Array;
  // Sea tiles the CA smoothing pass decided should become land (e.g. a small
  // bay/inlet the smoothing rounds off) -- kept separate from tinyIslandMask
  // (which only ever forces land -> sea) so the caller can apply both
  // directions of the smoothing, not just the pruning half.
  coastalInfillMask: Uint8Array;
};

// Combines the CA smoothing pass and the tiny-island flood-fill prune into
// the one full-map pass worldgen.ts needs: smooth first (so fewer, more
// meaningful islands survive to be size-checked and the land-side rounding
// actually reaches the rendered terrain), then flood fill the smoothed
// result to find any land-like component still under MIN_ISLAND_TILES or
// too isolated (see findTinyIslandMask). The two output masks are both
// derived from one single "what does the map actually look like after
// smoothing and pruning" source of truth (finalLandMask) rather than being
// computed as two separate deltas, specifically to avoid the gap described
// above CoastalCleanupMasks.tinyIslandMask.
export const computeCoastalCleanupMasks = (
  width: number,
  height: number,
  isLandLike: (x: number, y: number) => boolean
): CoastalCleanupMasks => {
  const rawLandMask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isLandLike(x, y)) rawLandMask[y * width + x] = 1;
    }
  }
  const smoothedLandMask = rawLandMask.slice();
  smoothLandMaskWithCellularAutomata(width, height, smoothedLandMask);
  const prunedFromSmoothed = findTinyIslandMask(width, height, (x, y) => smoothedLandMask[y * width + x] === 1);
  const tinyIslandMask = new Uint8Array(width * height);
  const coastalInfillMask = new Uint8Array(width * height);
  for (let i = 0; i < rawLandMask.length; i += 1) {
    const finalIsLand = smoothedLandMask[i] === 1 && prunedFromSmoothed[i] === 0;
    if (rawLandMask[i] === 1 && !finalIsLand) tinyIslandMask[i] = 1;
    else if (rawLandMask[i] === 0 && finalIsLand) coastalInfillMask[i] = 1;
  }
  return { tinyIslandMask, coastalInfillMask };
};

type Component = { tiles: number[]; minX: number; maxX: number; minY: number; maxY: number };

// 4-directional flood fill, toroidal in x (the world wraps horizontally --
// see wrapX in worldgen.ts) but not in y (the poles are real edges). Also
// stamps each tile's component id (for the isolation check below) instead of
// just visited/unvisited, and tracks each component's bounding box so the
// isolation check only has to scan a small local box, not the whole map.
const floodFillComponents = (
  width: number,
  height: number,
  isLandLike: (x: number, y: number) => boolean
): { components: Component[]; componentId: Int32Array } => {
  const size = width * height;
  const idx = (x: number, y: number): number => y * width + x;
  const componentId = new Int32Array(size).fill(-1);
  const stackX = new Int32Array(size);
  const stackY = new Int32Array(size);
  const components: Component[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIdx = idx(x, y);
      if (componentId[startIdx] !== -1 || !isLandLike(x, y)) continue;
      const thisId = components.length;
      let stackLen = 0;
      stackX[stackLen] = x;
      stackY[stackLen] = y;
      stackLen += 1;
      componentId[startIdx] = thisId;
      const tiles: number[] = [startIdx];
      let minX = x, maxX = x, minY = y, maxY = y;

      while (stackLen > 0) {
        stackLen -= 1;
        const cx = stackX[stackLen]!;
        const cy = stackY[stackLen]!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = (cx + dx + width) % width;
          const ny = cy + dy;
          if (ny < 0 || ny >= height) continue;
          const ni = idx(nx, ny);
          if (componentId[ni] !== -1 || !isLandLike(nx, ny)) continue;
          componentId[ni] = thisId;
          tiles.push(ni);
          if (nx < minX) minX = nx;
          if (nx > maxX) maxX = nx;
          if (ny < minY) minY = ny;
          if (ny > maxY) maxY = ny;
          stackX[stackLen] = nx;
          stackY[stackLen] = ny;
          stackLen += 1;
        }
      }
      components.push({ tiles, minX, maxX, minY, maxY });
    }
  }
  return { components, componentId };
};

// A small (but not tiny) component survives only if some other land tile
// sits within ISOLATION_RADIUS of its bounding box -- scans a local box
// around the component instead of the whole map, and short-circuits as soon
// as any qualifying neighbor is found.
const hasNearbyLand = (
  component: Component,
  width: number,
  height: number,
  isLandLike: (x: number, y: number) => boolean,
  componentId: Int32Array,
  ownId: number
): boolean => {
  const idx = (x: number, y: number): number => y * width + x;
  const loY = Math.max(0, component.minY - ISOLATION_RADIUS);
  const hiY = Math.min(height - 1, component.maxY + ISOLATION_RADIUS);
  for (let y = loY; y <= hiY; y += 1) {
    for (let dx = component.minX - ISOLATION_RADIUS; dx <= component.maxX + ISOLATION_RADIUS; dx += 1) {
      const x = ((dx % width) + width) % width;
      if (!isLandLike(x, y)) continue;
      if (componentId[idx(x, y)] !== ownId) return true;
    }
  }
  return false;
};

// 4-directional flood fill (see floodFillComponents) that prunes both
// too-small components (under MIN_ISLAND_TILES) and small-but-truly-isolated
// ones (under STANDALONE_ISLAND_TILES with no other land within
// ISOLATION_RADIUS) back to sea -- see the comments above MIN_ISLAND_TILES /
// STANDALONE_ISLAND_TILES for why both checks are needed.
export const findTinyIslandMask = (
  width: number,
  height: number,
  isLandLike: (x: number, y: number) => boolean
): Uint8Array => {
  const { components, componentId } = floodFillComponents(width, height, isLandLike);
  const pruned = new Uint8Array(width * height);
  components.forEach((component, id) => {
    const tooSmall = component.tiles.length < MIN_ISLAND_TILES;
    const isolated =
      !tooSmall &&
      component.tiles.length < STANDALONE_ISLAND_TILES &&
      !hasNearbyLand(component, width, height, isLandLike, componentId, id);
    if (tooSmall || isolated) {
      for (const tileIdx of component.tiles) pruned[tileIdx] = 1;
    }
  });
  return pruned;
};
