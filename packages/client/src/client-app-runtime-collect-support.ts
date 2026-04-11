import {
  applyOptimisticTileCollect as applyOptimisticTileCollectFromModule,
  applyOptimisticVisibleCollect as applyOptimisticVisibleCollectFromModule,
  clearPendingCollectTileDelta as clearPendingCollectTileDeltaFromModule,
  clearPendingCollectVisibleDelta as clearPendingCollectVisibleDeltaFromModule,
  hasCollectableYield as hasCollectableYieldFromModule,
  revertOptimisticTileCollectDelta as revertOptimisticTileCollectDeltaFromModule,
  revertOptimisticVisibleCollectDelta as revertOptimisticVisibleCollectDeltaFromModule,
  visibleCollectSummary as visibleCollectSummaryFromModule
} from "./client-collect-optimism.js";
import type { ClientState } from "./client-state.js";
import type { Tile, TileVisibilityState } from "./client-types.js";

export const createClientCollectSupport = (deps: {
  state: ClientState;
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
  keyFor: (x: number, y: number) => string;
}) => {
  const { state, tileVisibilityStateAt, keyFor } = deps;

  const hasCollectableYield = (tile: Tile | undefined): boolean => hasCollectableYieldFromModule(tile);
  const visibleCollectSummary = (): { tileCount: number; gold: number; resourceKinds: number } =>
    visibleCollectSummaryFromModule({ tiles: state.tiles.values(), me: state.me, tileVisibilityStateAt });
  const clearPendingCollectVisibleDelta = (): void => clearPendingCollectVisibleDeltaFromModule(state);
  const clearPendingCollectTileDelta = (tileKey?: string): void => clearPendingCollectTileDeltaFromModule(state, tileKey);
  const revertOptimisticVisibleCollectDelta = (): void => revertOptimisticVisibleCollectDeltaFromModule(state);
  const revertOptimisticTileCollectDelta = (tileKey: string): void => revertOptimisticTileCollectDeltaFromModule(state, tileKey);
  const applyOptimisticVisibleCollect = (): number =>
    applyOptimisticVisibleCollectFromModule({
      state,
      tilesIterable: state.tiles.values(),
      tileVisibilityStateAt,
      keyFor
    });
  const applyOptimisticTileCollect = (tile: Tile): boolean => applyOptimisticTileCollectFromModule({ state, keyFor }, tile);

  return {
    hasCollectableYield,
    visibleCollectSummary,
    clearPendingCollectVisibleDelta,
    clearPendingCollectTileDelta,
    revertOptimisticVisibleCollectDelta,
    revertOptimisticTileCollectDelta,
    applyOptimisticVisibleCollect,
    applyOptimisticTileCollect
  };
};
