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

// A single entry (the open profile), keyed by tiles revision plus both sizes:
// chunk loads write tiles without bumping tilesRevision but do grow the maps.
let seenCache: { ownerId: string; revision: number; tileCount: number; discoveredCount: number; seen: boolean } | undefined;

/** Whether any tile of `ownerId` was ever seen; cached since the profile re-renders on the HUD timer. */
export const hasSeenEmpireTile = (input: Omit<EmpireMapFocusInput, "from" | "worldWidth" | "worldHeight" | "discoveredTiles"> & { discoveredTiles: DiscoveredSet; revision: number }): boolean => {
  const tileCount = input.tiles.size;
  const discoveredCount = input.discoveredTiles.size;
  if (
    seenCache &&
    seenCache.ownerId === input.ownerId &&
    seenCache.revision === input.revision &&
    seenCache.tileCount === tileCount &&
    seenCache.discoveredCount === discoveredCount
  ) return seenCache.seen;
  let seen = false;
  for (const [key, tile] of input.tiles) {
    if (tile.ownerId === input.ownerId && input.discoveredTiles.has(key)) {
      seen = true;
      break;
    }
  }
  seenCache = { ownerId: input.ownerId, revision: input.revision, tileCount, discoveredCount, seen };
  return seen;
};
