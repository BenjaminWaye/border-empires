import { hasCollectableYield as hasCollectableYieldFromModule } from "./client-collect-optimism.js";
import type { ClientState } from "./client-state/client-state.js";
import type { Tile, TileVisibilityState } from "./client-types.js";

export const createClientCollectSupport = (deps: {
  state: ClientState;
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
  keyFor: (x: number, y: number) => string;
}) => {
  const hasCollectableYield = (tile: Tile | undefined): boolean => hasCollectableYieldFromModule(tile);

  return {
    hasCollectableYield
  };
};
