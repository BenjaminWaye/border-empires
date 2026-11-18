import { afterEach, describe, expect, test } from "vitest";

import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { isHillsRegionAt } from "./worldgen-hills.js";
import { riversForCurrentSeed } from "./worldgen-rivers.js";
import { setWorldSeed, terrainCodeAt, WORLD_TILE_COUNT } from "./worldgen.js";
import {
  packWorldBits,
  packWorldTerrain,
  unpackWorldBits,
  setWorldTerrainStore,
  unpackWorldTerrain,
  worldTerrainCacheKey,
  type WorldTerrainLayer,
  type WorldTerrainStore
} from "./worldgen-terrain-persistence.js";

const SEED = 377720878; // production season-14 world
const VERSION = 12;

const wholeMapTerrain = (): Uint8Array => {
  const out = new Uint8Array(WORLD_TILE_COUNT);
  for (let y = 0; y < WORLD_HEIGHT; y += 1) for (let x = 0; x < WORLD_WIDTH; x += 1) out[y * WORLD_WIDTH + x] = terrainCodeAt(x, y);
  return out;
};

// Records terrain-layer entries in `entries` (by world key) and hills entries in `hills`.
const memoryStore = (): WorldTerrainStore & { entries: Map<string, Uint8Array>; hills: Map<string, Uint8Array>; saves: number } => {
  const store = {
    entries: new Map<string, Uint8Array>(),
    hills: new Map<string, Uint8Array>(),
    saves: 0,
    load: (layer: WorldTerrainLayer, key: string) => (layer === "terrain" ? store.entries : store.hills).get(key),
    save: (layer: WorldTerrainLayer, key: string, packed: Uint8Array) => {
      if (layer === "terrain") store.saves += 1;
      (layer === "terrain" ? store.entries : store.hills).set(key, packed.slice());
    }
  };
  return store;
};

afterEach(() => setWorldTerrainStore(undefined));

describe("world terrain packing", () => {
  test("round-trips raw codes and both masks, including an odd tile count", () => {
    const count = 7;
    const terrain = {
      rawTerrain: Uint8Array.from([0, 1, 2, 3, 3, 2, 1]),
      tinyIslandMask: Uint8Array.from([0, 1, 0, 1, 0, 0, 1]),
      coastalInfillMask: Uint8Array.from([1, 0, 0, 0, 1, 1, 0])
    };
    const packed = packWorldTerrain(terrain);
    expect(packed.length).toBe(4);
    expect(unpackWorldTerrain(packed, count)).toEqual(terrain);
  });

  test("round-trips a bit layer", () => {
    const bits = Uint8Array.from([1, 0, 0, 1, 1, 1, 0, 1, 0, 1, 1]);
    const packed = packWorldBits(bits);
    expect(packed.length).toBe(2);
    expect(unpackWorldBits(packed, bits.length)).toEqual(bits);
    expect(unpackWorldBits(packed, 17)).toBeUndefined();
  });

  test("rejects a payload of the wrong size", () => {
    expect(unpackWorldTerrain(new Uint8Array(3), 7)).toBeUndefined();
  });
});

// The in-memory mask cache survives setWorldSeed for the same seed, so each
// "next login" first loads another world to force a real reload.
const OTHER_SEED = SEED + 1;
const MID_X = 320;
const MID_Y = 160;
const loadOtherWorld = (): void => {
  setWorldSeed(OTHER_SEED, "continents", VERSION);
  terrainCodeAt(MID_X, MID_Y);
};
const keyFor = (seed: number): string => worldTerrainCacheKey(seed, "continents", VERSION, WORLD_WIDTH, WORLD_HEIGHT);

describe("world terrain store", () => {
  test("a restored world matches the world that was saved and is not saved again", () => {
    const store = memoryStore();
    setWorldTerrainStore(store);
    setWorldSeed(SEED, "continents", VERSION);
    const computed = wholeMapTerrain();
    expect(store.entries.get(keyFor(SEED))?.length).toBe(WORLD_TILE_COUNT / 2);

    loadOtherWorld();
    const savesBefore = store.saves;
    setWorldSeed(SEED, "continents", VERSION);
    expect(wholeMapTerrain()).toEqual(computed);
    expect(store.saves).toBe(savesBefore);
  }, 60_000);

  test("terrain comes from the stored data when an entry exists", () => {
    const store = memoryStore();
    setWorldTerrainStore(store);
    loadOtherWorld();
    setWorldSeed(SEED, "continents", VERSION);
    const before = terrainCodeAt(MID_X, MID_Y);
    const restored = unpackWorldTerrain(store.entries.get(keyFor(SEED))!, WORLD_TILE_COUNT)!;

    // Flip a 9x9 mid-map block between sea and land in the stored data (one
    // lone tile would be smoothed back by terrainAt's own cleanup); the next
    // load must reflect it, proving nothing recomputed those tiles.
    const flipTo = before === 1 || before === 2 ? 0 : 1;
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const idx = (MID_Y + dy) * WORLD_WIDTH + MID_X + dx;
        restored.rawTerrain[idx] = flipTo;
        restored.tinyIslandMask[idx] = 0;
        restored.coastalInfillMask[idx] = 0;
      }
    }
    store.entries.set(keyFor(SEED), packWorldTerrain(restored));

    loadOtherWorld();
    setWorldSeed(SEED, "continents", VERSION);
    expect(terrainCodeAt(MID_X, MID_Y)).not.toBe(before);
  }, 60_000);

  test("each world is stored under its own key", () => {
    const store = memoryStore();
    setWorldTerrainStore(store);
    loadOtherWorld();
    setWorldSeed(SEED, "continents", VERSION);
    terrainCodeAt(MID_X, MID_Y);
    expect([...store.entries.keys()].sort()).toEqual([keyFor(SEED), keyFor(OTHER_SEED)].sort());
  }, 60_000);

  test("hills are saved once the whole map is computed, and a restored layer is used as-is", () => {
    const wholeMapHills = (): Uint8Array => {
      const out = new Uint8Array(WORLD_TILE_COUNT);
      for (let y = 0; y < WORLD_HEIGHT; y += 1) for (let x = 0; x < WORLD_WIDTH; x += 1) out[y * WORLD_WIDTH + x] = isHillsRegionAt(x, y) ? 1 : 0;
      return out;
    };
    const store = memoryStore();
    setWorldTerrainStore(store);
    loadOtherWorld();
    setWorldSeed(SEED, "continents", VERSION);
    expect(store.hills.has(keyFor(SEED))).toBe(false);
    const computed = wholeMapHills();
    expect(unpackWorldBits(store.hills.get(keyFor(SEED))!, WORLD_TILE_COUNT)).toEqual(computed);

    loadOtherWorld();
    isHillsRegionAt(MID_X, MID_Y);
    setWorldSeed(SEED, "continents", VERSION);
    expect(wholeMapHills()).toEqual(computed);

    const tampered = computed.slice();
    tampered[MID_Y * WORLD_WIDTH + MID_X] = tampered[MID_Y * WORLD_WIDTH + MID_X] ? 0 : 1;
    store.hills.set(keyFor(SEED), packWorldBits(tampered));
    loadOtherWorld();
    isHillsRegionAt(MID_X, MID_Y);
    setWorldSeed(SEED, "continents", VERSION);
    expect(isHillsRegionAt(MID_X, MID_Y)).toBe(tampered[MID_Y * WORLD_WIDTH + MID_X] === 1);
  }, 120_000);

  test("building the river network saves the hills layer for the next login", () => {
    const store = memoryStore();
    setWorldTerrainStore(store);
    loadOtherWorld();
    riversForCurrentSeed(); // the river cache is keyed by seed: move it off SEED so it rebuilds below
    setWorldSeed(SEED, "continents", VERSION);
    riversForCurrentSeed();
    const saved = unpackWorldBits(store.hills.get(keyFor(SEED))!, WORLD_TILE_COUNT)!;
    let mismatches = 0;
    for (let y = 0; y < WORLD_HEIGHT; y += 1) for (let x = 0; x < WORLD_WIDTH; x += 1) if ((saved[y * WORLD_WIDTH + x] === 1) !== isHillsRegionAt(x, y)) mismatches += 1;
    expect(mismatches).toBe(0);
  }, 120_000);
});
