import type { Tile } from "./client-types.js";

type StrategicResourceKey = "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD";

export const hasCollectableYield = (tile: Tile | undefined): boolean => {
  if (!tile?.yield) return false;
  if ((tile.yield.gold ?? 0) > 0.01) return true;
  return Object.values(tile.yield.strategic ?? {}).some((value) => Number(value) > 0.01);
};

const strategicKeys: StrategicResourceKey[] = ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE", "SHARD"];

export const clearPendingCollectTileDelta = (
  state: { pendingCollectTileDelta: Map<string, unknown> },
  tileKey?: string
): void => {
  if (tileKey) {
    state.pendingCollectTileDelta.delete(tileKey);
    return;
  }
  state.pendingCollectTileDelta.clear();
};

export const revertOptimisticTileCollectDelta = (
  state: {
    gold: number;
    strategicResources: Record<StrategicResourceKey, number>;
    pendingCollectTileDelta: Map<
      string,
      {
        gold: number;
        strategic: Record<StrategicResourceKey, number>;
        previousYield?: { gold?: number; strategic?: Record<string, number> };
      }
    >;
    tiles: Map<string, Tile>;
  },
  tileKey: string
): void => {
  const delta = state.pendingCollectTileDelta.get(tileKey);
  if (!delta) return;
  if (delta.gold > 0) state.gold = Math.max(0, state.gold - delta.gold);
  for (const resource of strategicKeys) {
    const amount = delta.strategic[resource] ?? 0;
    if (amount > 0) state.strategicResources[resource] = Math.max(0, state.strategicResources[resource] - amount);
  }
  const tile = state.tiles.get(tileKey);
  if (tile && delta.previousYield) tile.yield = delta.previousYield;
  else if (tile) delete tile.yield;
  state.pendingCollectTileDelta.delete(tileKey);
};
