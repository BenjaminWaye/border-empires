import {
  applyOptimisticTileCollect as applyOptimisticTileCollectFromModule,
  clearPendingCollectTileDelta as clearPendingCollectTileDeltaFromModule,
  hasCollectableYield as hasCollectableYieldFromModule,
  revertOptimisticTileCollectDelta as revertOptimisticTileCollectDeltaFromModule
} from "./client-collect-optimism.js";
import type { ClientState } from "./client-state/client-state.js";
import type { Tile, TileVisibilityState } from "./client-types.js";

export const createClientCollectSupport = (deps: {
  state: ClientState;
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
  keyFor: (x: number, y: number) => string;
}) => {
  const { state, keyFor } = deps;

  const hasCollectableYield = (tile: Tile | undefined): boolean => hasCollectableYieldFromModule(tile);
  const clearPendingCollectTileDelta = (tileKey?: string): void => clearPendingCollectTileDeltaFromModule(state, tileKey);
  const revertOptimisticTileCollectDelta = (tileKey: string): void => revertOptimisticTileCollectDeltaFromModule(state, tileKey);
  const applyOptimisticTileCollect = (tile: Tile): boolean => applyOptimisticTileCollectFromModule({ state, keyFor }, tile);

  return {
    hasCollectableYield,
    clearPendingCollectTileDelta,
    revertOptimisticTileCollectDelta,
    applyOptimisticTileCollect
  };
};
