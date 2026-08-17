import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { DISCOVERED_TILES_STORAGE_KEY } from "../client-constants.js";
import { keyForTile, parseTileKey } from "../client-app-runtime-utils.js";
import { storageGet, storageRemove, storageSet } from "./client-state.js";

// Persists explored-tile ("fog of war") state across a hard page refresh.
// state.discoveredTiles/discoveredDockTiles are otherwise purely in-memory
// (see createInitialState() in client-state.ts) and reset to empty on every
// fresh load, so without this a refresh makes every previously-explored tile
// outside the current view radius look "unexplored" again until re-visited.
//
// Encoded as a bitset (1 bit/tile, indexed y * WORLD_WIDTH + x) rather than a
// JSON array of "x,y" keys -- the world is WORLD_WIDTH x WORLD_HEIGHT tiles,
// so a fully-explored map as a bitset is ~25KB vs well over 1MB as JSON keys,
// comfortably inside typical localStorage quotas.

const STORAGE_VERSION = 1;
const BITSET_BYTE_LENGTH = Math.ceil((WORLD_WIDTH * WORLD_HEIGHT) / 8);

type StoredDiscoveredTilesPayload = {
  v: number;
  seasonId: string;
  playerId: string;
  tiles: string; // base64-encoded bitset
  docks: string[];
};

const bitIndexFor = (x: number, y: number): number => y * WORLD_WIDTH + x;

const encodeDiscoveredTilesBitset = (discoveredTiles: Set<string>): string => {
  const bytes = new Uint8Array(BITSET_BYTE_LENGTH);
  for (const key of discoveredTiles) {
    const { x, y } = parseTileKey(key);
    if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) continue;
    const bitIndex = bitIndexFor(x, y);
    const byteIndex = bitIndex >> 3;
    bytes[byteIndex] = (bytes[byteIndex] ?? 0) | (1 << (bitIndex & 7));
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const decodeDiscoveredTilesBitset = (base64: string): Set<string> | null => {
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    return null;
  }
  if (binary.length !== BITSET_BYTE_LENGTH) return null;
  const discoveredTiles = new Set<string>();
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      const bitIndex = bitIndexFor(x, y);
      const byte = binary.charCodeAt(bitIndex >> 3);
      if ((byte >> (bitIndex & 7)) & 1) discoveredTiles.add(keyForTile(x, y));
    }
  }
  return discoveredTiles;
};

export const saveDiscoveredTiles = (params: {
  seasonId: string;
  playerId: string;
  discoveredTiles: Set<string>;
  discoveredDockTiles: Set<string>;
}): void => {
  if (!params.seasonId || !params.playerId) return;
  const payload: StoredDiscoveredTilesPayload = {
    v: STORAGE_VERSION,
    seasonId: params.seasonId,
    playerId: params.playerId,
    tiles: encodeDiscoveredTilesBitset(params.discoveredTiles),
    docks: Array.from(params.discoveredDockTiles)
  };
  storageSet(DISCOVERED_TILES_STORAGE_KEY, JSON.stringify(payload));
};

export const clearStoredDiscoveredTiles = (): void => storageRemove(DISCOVERED_TILES_STORAGE_KEY);

// Returns null (and leaves discoveredTiles/discoveredDockTiles untouched by
// the caller) if nothing is stored, the payload is malformed, or it belongs
// to a different season/player -- callers should fall back to the normal
// clear-on-INIT behavior in that case.
export const readStoredDiscoveredTiles = (
  seasonId: string | undefined,
  playerId: string
): { discoveredTiles: Set<string>; discoveredDockTiles: Set<string> } | null => {
  if (!seasonId || !playerId) return null;
  const raw = storageGet(DISCOVERED_TILES_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredDiscoveredTilesPayload>;
    if (parsed.v !== STORAGE_VERSION) return null;
    if (parsed.seasonId !== seasonId || parsed.playerId !== playerId) return null;
    if (typeof parsed.tiles !== "string" || !Array.isArray(parsed.docks)) return null;
    const discoveredTiles = decodeDiscoveredTilesBitset(parsed.tiles);
    if (!discoveredTiles) return null;
    const discoveredDockTiles = new Set(parsed.docks.filter((entry): entry is string => typeof entry === "string"));
    return { discoveredTiles, discoveredDockTiles };
  } catch {
    return null;
  }
};

const DISCOVERED_TILES_SAVE_THROTTLE_MS = 5_000;
// Module-local throttle state, mirroring maybeSaveCameraLocation() in
// client-view-refresh.ts -- a pure implementation detail of the debounce,
// not meaningful application state.
let lastDiscoveredTilesSaveAt = 0;

// Bypasses the throttle -- used on page hide/unload where there won't be a
// later frame to catch a throttled-out save.
export const flushDiscoveredTiles = (state: {
  discoveredTiles: Set<string>;
  discoveredDockTiles: Set<string>;
  me: string;
  bridgeDebugSeasonId?: string | undefined;
}): void => {
  if (!state.bridgeDebugSeasonId || !state.me) return;
  saveDiscoveredTiles({
    seasonId: state.bridgeDebugSeasonId,
    playerId: state.me,
    discoveredTiles: state.discoveredTiles,
    discoveredDockTiles: state.discoveredDockTiles
  });
};

// Called every render frame alongside maybeSaveCameraLocation() (see
// maybeRefreshForCamera() in client-view-refresh.ts). Re-encodes the whole
// bitset on each throttled save rather than tracking incremental diffs --
// discoveredTiles/discoveredDockTiles are mutated from several call sites
// (client-gateway-sync.ts, client-network.ts, client-optimistic-state.ts) and
// a full re-encode of the ~25KB bitset is cheap enough that hooking every
// mutation site individually isn't worth the risk of missing one.
export const maybeSaveDiscoveredTiles = (state: {
  discoveredTiles: Set<string>;
  discoveredDockTiles: Set<string>;
  me: string;
  bridgeDebugSeasonId?: string | undefined;
}): void => {
  const now = Date.now();
  if (now - lastDiscoveredTilesSaveAt < DISCOVERED_TILES_SAVE_THROTTLE_MS) return;
  lastDiscoveredTilesSaveAt = now;
  flushDiscoveredTiles(state);
};

export const resetDiscoveredTilesSaveThrottleForTests = (): void => {
  lastDiscoveredTilesSaveAt = 0;
};
