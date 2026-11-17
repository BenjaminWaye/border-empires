import { describe, expect, it } from "vitest";

import { base64ToBytes, bytesToBase64, createLocalStorageWorldTerrainStore, worldTerrainStorageKey } from "./client-world-terrain-store.js";

const memoryStorage = (quotaChars = Number.POSITIVE_INFINITY): Storage => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      if (value.length > quotaChars) throw new DOMException("quota", "QuotaExceededError");
      map.set(key, value);
    }
  };
};

const sample = (): Uint8Array => {
  const bytes = new Uint8Array(102_400);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 37) & 255;
  return bytes;
};

describe("client world terrain store", () => {
  it("base64 round-trips a world-sized payload", () => {
    const bytes = sample();
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("returns the saved world for the same build and key", () => {
    const store = createLocalStorageWorldTerrainStore(memoryStorage(), "build-a");
    store.save("terrain", "640x320:continents:12:7", sample());
    expect(store.load("terrain", "640x320:continents:12:7")).toEqual(sample());
  });

  it("ignores a world saved by a different client build or for a different world", () => {
    const storage = memoryStorage();
    createLocalStorageWorldTerrainStore(storage, "build-a").save("terrain", "640x320:continents:12:7", sample());
    expect(createLocalStorageWorldTerrainStore(storage, "build-b").load("terrain", "640x320:continents:12:7")).toBeUndefined();
    expect(createLocalStorageWorldTerrainStore(storage, "build-a").load("terrain", "640x320:continents:12:8")).toBeUndefined();
  });

  it("keeps each layer separately", () => {
    const storage = memoryStorage();
    const store = createLocalStorageWorldTerrainStore(storage, "build-a");
    store.save("terrain", "640x320:continents:12:7", sample());
    store.save("hills", "640x320:continents:12:7", Uint8Array.from([1, 2, 3]));
    expect(store.load("terrain", "640x320:continents:12:7")).toEqual(sample());
    expect(store.load("hills", "640x320:continents:12:7")).toEqual(Uint8Array.from([1, 2, 3]));
  });

  it("keeps a single entry per layer, so a new season replaces the old world", () => {
    const storage = memoryStorage();
    const store = createLocalStorageWorldTerrainStore(storage, "build-a");
    store.save("terrain", "640x320:continents:12:7", sample());
    store.save("terrain", "640x320:continents:12:8", sample());
    expect(storage.length).toBe(1);
    expect(store.load("terrain", "640x320:continents:12:7")).toBeUndefined();
  });

  it("drops the old entry instead of throwing when storage is full", () => {
    const storage = memoryStorage(1_000);
    storage.setItem(worldTerrainStorageKey("terrain"), "old");
    const store = createLocalStorageWorldTerrainStore(storage, "build-a");
    expect(() => store.save("terrain", "640x320:continents:12:7", sample())).not.toThrow();
    expect(storage.getItem(worldTerrainStorageKey("terrain"))).toBeNull();
  });

  it("treats a corrupt entry as missing", () => {
    const storage = memoryStorage();
    storage.setItem(worldTerrainStorageKey("terrain"), "build-a|640x320:continents:12:7|***not base64***");
    expect(createLocalStorageWorldTerrainStore(storage, "build-a").load("terrain", "640x320:continents:12:7")).toBeUndefined();
  });

  it("reports each load and save outcome so a cache that never hits is visible", () => {
    const outcomes: string[] = [];
    const storage = memoryStorage();
    const store = createLocalStorageWorldTerrainStore(storage, "build-a", (layer, outcome) => outcomes.push(`${layer}:${outcome}`));
    store.load("terrain", "640x320:continents:12:7");
    store.save("terrain", "640x320:continents:12:7", sample());
    store.load("terrain", "640x320:continents:12:7");
    store.load("terrain", "640x320:continents:12:8");
    storage.setItem(worldTerrainStorageKey("hills"), "build-a|640x320:continents:12:7|***");
    store.load("hills", "640x320:continents:12:7");
    expect(outcomes).toEqual(["terrain:miss", "terrain:saved", "terrain:hit", "terrain:stale", "hills:corrupt"]);
  });
});
