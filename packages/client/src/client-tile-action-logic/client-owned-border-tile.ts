// Whether an owned tile sits on the empire's edge: any orthogonal neighbour
// unknown or not ours. Extracted from client-tile-action-logic.ts (over the
// 500-line limit), which re-exports it.
import type { ClientState } from "../client-state/client-state.js";

type BorderDeps = {
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
};

export const isOwnedBorderTile = (state: ClientState, x: number, y: number, deps: BorderDeps): boolean => {
  const neighbors = [
    state.tiles.get(deps.keyFor(deps.wrapX(x), deps.wrapY(y - 1))),
    state.tiles.get(deps.keyFor(deps.wrapX(x + 1), deps.wrapY(y))),
    state.tiles.get(deps.keyFor(deps.wrapX(x), deps.wrapY(y + 1))),
    state.tiles.get(deps.keyFor(deps.wrapX(x - 1), deps.wrapY(y)))
  ];
  return neighbors.some((tile) => !tile || tile.ownerId !== state.me);
};
