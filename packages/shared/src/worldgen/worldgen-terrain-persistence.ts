// Optional device-side persistence for the whole-world raw terrain pass.
//
// The coastal cleanup masks (worldgen.ts coastalCleanupMasksFor) need the raw
// terrain code of every tile, and computing that is the single most expensive
// thing a client does at login (~2s on a fast desktop, ~9s on a phone-class
// CPU). The result only depends on (seed, style, worldgen version, world size)
// and the worldgen code itself, so a client can keep it between sessions.
//
// The server never installs a store, so it always computes terrain itself.
// A store must key entries by the code build as well (see the client's
// client-world-terrain-store.ts), because a worldgen code change that keeps
// the same version number would otherwise restore stale terrain.

// A layer is one independently saved per-world array: "terrain" (raw codes +
// coastal masks, saved after the mask pass) and "hills" (1 bit per tile, saved
// once every tile has been computed, which the river network build does).
export type WorldTerrainLayer = "terrain" | "hills";
export type WorldTerrainStore = {
  load: (layer: WorldTerrainLayer, key: string) => Uint8Array | undefined;
  save: (layer: WorldTerrainLayer, key: string, packed: Uint8Array) => void;
};

export type RestoredWorldTerrain = {
  rawTerrain: Uint8Array;
  tinyIslandMask: Uint8Array;
  coastalInfillMask: Uint8Array;
};

let installedStore: WorldTerrainStore | undefined;

export const setWorldTerrainStore = (store: WorldTerrainStore | undefined): void => {
  installedStore = store;
};

export const worldTerrainStore = (): WorldTerrainStore | undefined => installedStore;

export const worldTerrainCacheKey = (seed: number, style: string, version: number, width: number, height: number): string =>
  `${width}x${height}:${style}:${version}:${seed}`;

// 4 bits per tile, two tiles per byte: bits 0-1 raw terrain code (0..3),
// bit 2 tiny-island mask, bit 3 coastal-infill mask.
export const packWorldTerrain = (terrain: RestoredWorldTerrain): Uint8Array => {
  const count = terrain.rawTerrain.length;
  const packed = new Uint8Array(Math.ceil(count / 2));
  for (let i = 0; i < count; i += 1) {
    const nibble = (terrain.rawTerrain[i]! & 3) | ((terrain.tinyIslandMask[i]! & 1) << 2) | ((terrain.coastalInfillMask[i]! & 1) << 3);
    packed[i >> 1]! |= (i & 1) === 0 ? nibble : nibble << 4;
  }
  return packed;
};

export const unpackWorldTerrain = (packed: Uint8Array, count: number): RestoredWorldTerrain | undefined => {
  if (packed.length !== Math.ceil(count / 2)) return undefined;
  const rawTerrain = new Uint8Array(count);
  const tinyIslandMask = new Uint8Array(count);
  const coastalInfillMask = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    const byte = packed[i >> 1]!;
    const nibble = (i & 1) === 0 ? byte & 15 : byte >> 4;
    rawTerrain[i] = nibble & 3;
    tinyIslandMask[i] = (nibble >> 2) & 1;
    coastalInfillMask[i] = (nibble >> 3) & 1;
  }
  return { rawTerrain, tinyIslandMask, coastalInfillMask };
};

export const loadWorldTerrain = (key: string, count: number): RestoredWorldTerrain | undefined => {
  if (!installedStore) return undefined;
  try {
    const packed = installedStore.load("terrain", key);
    return packed ? unpackWorldTerrain(packed, count) : undefined;
  } catch {
    return undefined;
  }
};

export const saveWorldTerrain = (key: string, terrain: RestoredWorldTerrain): void => {
  if (!installedStore) return;
  try {
    installedStore.save("terrain", key, packWorldTerrain(terrain));
  } catch {
    // Persistence is a cache: a full or blocked store just means recomputing next login.
  }
};

export const packWorldBits = (bits: Uint8Array): Uint8Array => {
  const packed = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i += 1) if (bits[i]) packed[i >> 3]! |= 1 << (i & 7);
  return packed;
};

export const unpackWorldBits = (packed: Uint8Array, count: number): Uint8Array | undefined => {
  if (packed.length !== Math.ceil(count / 8)) return undefined;
  const bits = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) bits[i] = (packed[i >> 3]! >> (i & 7)) & 1;
  return bits;
};

export const loadWorldBits = (layer: WorldTerrainLayer, key: string, count: number): Uint8Array | undefined => {
  if (!installedStore) return undefined;
  try {
    const packed = installedStore.load(layer, key);
    return packed ? unpackWorldBits(packed, count) : undefined;
  } catch {
    return undefined;
  }
};

export const saveWorldBits = (layer: WorldTerrainLayer, key: string, bits: Uint8Array): void => {
  if (!installedStore) return;
  try {
    installedStore.save(layer, key, packWorldBits(bits));
  } catch {
    // Persistence is a cache: a full or blocked store just means recomputing next login.
  }
};
