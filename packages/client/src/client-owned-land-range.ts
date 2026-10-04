import type { ClientState } from "./client-state/client-state.js";

export const hasOwnedLandWithinClientRange = (
  state: ClientState,
  x: number,
  y: number,
  range: number,
  deps: { chebyshevDistanceClient: (ax: number, ay: number, bx: number, by: number) => number }
): boolean => {
  for (const tile of state.tiles.values()) {
    if (tile.fogged || tile.ownerId !== state.me || tile.terrain !== "LAND") continue;
    if (deps.chebyshevDistanceClient(tile.x, tile.y, x, y) <= range) return true;
  }
  return false;
};
