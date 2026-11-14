// "Show on map" for an empire's profile: the nearest tile of that empire the
// viewer has actually seen. Reads only what this client already holds -- a tile
// counts only when it is in discoveredTiles (seen at some point, visible now or
// remembered under fog) and its last known owner is the empire. Never asks the
// server for anything, so it can't reveal land the viewer hasn't seen.

type SeenTile = { x: number; y: number; ownerId?: string | undefined };

export type EmpireMapFocusInput = {
  tiles: ReadonlyMap<string, SeenTile>;
  discoveredTiles: { has: (key: string) => boolean };
  ownerId: string;
  from: { x: number; y: number };
  worldWidth: number;
  worldHeight: number;
};

const wrappedGap = (a: number, b: number, size: number): number => {
  const d = Math.abs(a - b) % size;
  return Math.min(d, size - d);
};

/** Nearest seen tile of `ownerId` from `from` (the world wraps), or undefined when none was ever seen. */
export const nearestSeenEmpireTile = (input: EmpireMapFocusInput): { x: number; y: number } | undefined => {
  let best: { x: number; y: number } | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [key, tile] of input.tiles) {
    if (tile.ownerId !== input.ownerId || !input.discoveredTiles.has(key)) continue;
    const dx = wrappedGap(tile.x, input.from.x, input.worldWidth);
    const dy = wrappedGap(tile.y, input.from.y, input.worldHeight);
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { x: tile.x, y: tile.y };
    }
  }
  return best;
};

type DiscoveredSet = EmpireMapFocusInput["discoveredTiles"] & { size: number };

// A single entry (the open profile). A "seen" answer keeps the key of the tile
// that proved it and is re-checked against that tile on every call, so losing
// it (capture, or a chunk overwriting it in place) rescans. An "unseen" answer
// is reused only while nothing could have added a tile: same tiles revision,
// same map sizes and same chunk count -- chunk loads write tiles (including in
// place over an existing key) without bumping tilesRevision.
let seenCache:
  | { ownerId: string; proofKey: string | undefined; revision: number; tileCount: number; discoveredCount: number; chunkCount: number }
  | undefined;

/** Drops the cached answer, e.g. when "Show on map" found nowhere to go. */
export const forgetSeenEmpireTile = (): void => {
  seenCache = undefined;
};

/** Whether any tile of `ownerId` was ever seen; cached since the profile re-renders on the HUD timer. */
export const hasSeenEmpireTile = (
  input: Omit<EmpireMapFocusInput, "from" | "worldWidth" | "worldHeight" | "discoveredTiles"> & {
    discoveredTiles: DiscoveredSet;
    revision: number;
    chunkCount: number;
  }
): boolean => {
  const tileCount = input.tiles.size;
  const discoveredCount = input.discoveredTiles.size;
  if (seenCache && seenCache.ownerId === input.ownerId) {
    const proofKey = seenCache.proofKey;
    if (proofKey !== undefined) {
      if (input.tiles.get(proofKey)?.ownerId === input.ownerId && input.discoveredTiles.has(proofKey)) return true;
    } else if (
      seenCache.revision === input.revision &&
      seenCache.tileCount === tileCount &&
      seenCache.discoveredCount === discoveredCount &&
      seenCache.chunkCount === input.chunkCount
    ) return false;
  }
  let proofKey: string | undefined;
  for (const [key, tile] of input.tiles) {
    if (tile.ownerId === input.ownerId && input.discoveredTiles.has(key)) {
      proofKey = key;
      break;
    }
  }
  seenCache = { ownerId: input.ownerId, proofKey, revision: input.revision, tileCount, discoveredCount, chunkCount: input.chunkCount };
  return proofKey !== undefined;
};
