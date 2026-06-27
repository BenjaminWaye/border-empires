/// <reference lib="webworker" />
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  setWorldSeed,
  terrainAt,
  landBiomeAt,
  regionTypeAt,
  grassShadeAt
} from "@border-empires/shared";

export type WorkerRequest = {
  seed: number;
};

export type WorkerResponse = {
  seed: number;
  terrain: Uint8Array;  // 0=SEA 1=LAND 2=MOUNTAIN 3=COASTAL_SEA
  biome: Uint8Array;    // 0=GRASS 1=SAND 2=COASTAL_SAND 255=N/A
  region: Uint8Array;   // 0=FERTILE_PLAINS 1=DEEP_FOREST 2=BROKEN_HIGHLANDS 3=ANCIENT_HEARTLAND 4=CRYSTAL_WASTES 255=N/A
  shade: Uint8Array;    // 0=DARK 1=LIGHT 255=N/A
  landCount: number;
  seaCount: number;
  mountainCount: number;
  durationMs: number;
};

self.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  const { seed } = event.data;
  const t0 = performance.now();

  setWorldSeed(seed);

  const size = WORLD_WIDTH * WORLD_HEIGHT;
  const terrain = new Uint8Array(size);
  const biome = new Uint8Array(size).fill(255);
  const region = new Uint8Array(size).fill(255);
  const shade = new Uint8Array(size).fill(255);

  let landCount = 0;
  let seaCount = 0;
  let mountainCount = 0;

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const idx = y * WORLD_WIDTH + x;
      const t = terrainAt(x, y);

      if (t === "LAND") {
        terrain[idx] = 1;
        landCount++;

        const b = landBiomeAt(x, y);
        if (b === "SAND") biome[idx] = 1;
        else if (b === "COASTAL_SAND") biome[idx] = 2;
        else biome[idx] = 0; // GRASS

        const r = regionTypeAt(x, y);
        if (r === "DEEP_FOREST") region[idx] = 1;
        else if (r === "BROKEN_HIGHLANDS") region[idx] = 2;
        else if (r === "ANCIENT_HEARTLAND") region[idx] = 3;
        else if (r === "CRYSTAL_WASTES") region[idx] = 4;
        else region[idx] = 0; // FERTILE_PLAINS

        const g = grassShadeAt(x, y);
        shade[idx] = g === "LIGHT" ? 1 : 0;
      } else if (t === "MOUNTAIN") {
        terrain[idx] = 2;
        mountainCount++;
      } else if (t === "COASTAL_SEA") {
        terrain[idx] = 3;
        seaCount++;
      } else {
        terrain[idx] = 0;
        seaCount++;
      }
    }
  }

  const durationMs = performance.now() - t0;

  const response: WorkerResponse = {
    seed,
    terrain,
    biome,
    region,
    shade,
    landCount,
    seaCount,
    mountainCount,
    durationMs
  };

  self.postMessage(response, [terrain.buffer, biome.buffer, region.buffer, shade.buffer]);
};
