import { wrapX, wrapY } from "./math.js";

export type EnclosureTileFacts = {
  terrain?: string | undefined;
  ownerId?: string | undefined;
};

export type EnclosureLookup = (x: number, y: number) => EnclosureTileFacts | undefined;

const NEIGHBORS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
] as const;

const isBarrierTerrain = (terrain: string | undefined): boolean =>
  terrain === "SEA" || terrain === "COASTAL_SEA" || terrain === "MOUNTAIN";

/**
 * Returns true if starting from (sx, sy), a BFS flood-fill cannot escape to
 * tile owned by a different player. The BFS floods outward through non-wall
 * tiles (wall = owned by enclosingPlayerId OR barrier terrain). If the flood
 * ever reaches a tile owned by someone other than enclosingPlayerId, the
 * pocket is NOT enclosed.
 *
 * Unowned non-barrier tiles are part of the pocket (they are flooded through),
 * not escapes. Only enemy-owned tiles are escapes.
 *
 * Cap: if the flood visits more than maxTiles tiles, returns false (pocket is
 * too large to auto-fill on a single mutation).
 *
 * Uses 4-cardinal BFS with map-wrapping.
 */
export const isEnclosedBy = (
  sx: number,
  sy: number,
  enclosingPlayerId: string,
  getTile: EnclosureLookup,
  width: number,
  height: number,
  maxTiles = 500
): boolean => {
  const startTile = getTile(sx, sy);
  if (!startTile) return false;

  // Barriers are trivially walls (enclosed by nature)
  if (isBarrierTerrain(startTile.terrain)) return true;
  // Tiles already owned by the enclosing player are trivially enclosed
  if (startTile.ownerId === enclosingPlayerId) return true;
  // Tiles owned by an enemy cannot be enclosed by enclosingPlayerId
  if (startTile.ownerId !== undefined && startTile.ownerId !== "") return false;

  // BFS: flood through unowned non-barrier tiles.
  // Wall stops: owned by enclosingPlayerId (good wall) OR barrier (natural wall).
  // Failure: encounter tile owned by a different player.
  const visited = new Set<string>();
  const queue: Array<[number, number]> = [];

  const keyFor = (x: number, y: number): string => `${x},${y}`;

  visited.add(keyFor(sx, sy));
  queue.push([sx, sy]);

  let head = 0;
  while (head < queue.length) {
    const entry = queue[head++];
    if (!entry) continue;
    const [cx, cy] = entry;

    for (const [dx, dy] of NEIGHBORS) {
      const nx = wrapX(cx + dx, width);
      const ny = wrapY(cy + dy, height);
      const nk = keyFor(nx, ny);
      if (visited.has(nk)) continue;

      const ntile = getTile(nx, ny);
      if (!ntile) {
        // Unknown tile — treat as escape (open world edge)
        return false;
      }

      // Natural wall (barrier terrain) — stop flood, don't enqueue
      if (isBarrierTerrain(ntile.terrain)) continue;
      // Player wall (enclosing player's tile) — stop flood, don't enqueue
      if (ntile.ownerId === enclosingPlayerId) continue;

      // Enemy tile — this is an escape, pocket is not enclosed
      if (ntile.ownerId !== undefined && ntile.ownerId !== "") return false;

      // Unowned non-barrier: part of the pocket — continue flooding
      visited.add(nk);
      queue.push([nx, ny]);

      // Cap check: pocket is too large
      if (visited.size > maxTiles) return false;
    }
  }

  // BFS exhausted without escaping — fully enclosed
  return true;
};
