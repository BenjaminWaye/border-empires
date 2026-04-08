import type { ClientState } from "./client-state.js";
import type { Tile } from "./client-types.js";

type ConnectedRegionDeps = {
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
};

const cardinalNeighbors = (
  tile: Tile,
  deps: ConnectedRegionDeps
): string[] => [
  deps.keyFor(deps.wrapX(tile.x), deps.wrapY(tile.y - 1)),
  deps.keyFor(deps.wrapX(tile.x + 1), deps.wrapY(tile.y)),
  deps.keyFor(deps.wrapX(tile.x), deps.wrapY(tile.y + 1)),
  deps.keyFor(deps.wrapX(tile.x - 1), deps.wrapY(tile.y))
];

export const connectedEnemyRegionKeys = (
  state: Pick<ClientState, "me" | "tiles">,
  root: Tile | undefined,
  deps: ConnectedRegionDeps
): string[] => {
  if (!root || root.terrain !== "LAND" || root.fogged || !root.ownerId || root.ownerId === state.me) return [];
  const ownerId = root.ownerId;
  const rootKey = deps.keyFor(root.x, root.y);
  const visited = new Set<string>([rootKey]);
  const queue = [root];
  const regionKeys: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (current.terrain !== "LAND" || current.fogged || current.ownerId !== ownerId) continue;
    regionKeys.push(deps.keyFor(current.x, current.y));
    for (const neighborKey of cardinalNeighbors(current, deps)) {
      if (visited.has(neighborKey)) continue;
      visited.add(neighborKey);
      const neighbor = state.tiles.get(neighborKey);
      if (!neighbor || neighbor.terrain !== "LAND" || neighbor.fogged || neighbor.ownerId !== ownerId) continue;
      queue.push(neighbor);
    }
  }

  regionKeys.sort();
  return regionKeys;
};
