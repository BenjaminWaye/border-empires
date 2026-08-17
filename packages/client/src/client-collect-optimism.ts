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

export const applyOptimisticTileCollect = (deps: {
  state: {
    gold: number;
    goldAnimUntil: number;
    goldAnimDir: number;
    strategicResources: Record<StrategicResourceKey, number>;
    strategicAnim: Record<StrategicResourceKey, { until: number; dir: number }>;
    pendingCollectTileDelta: Map<
      string,
      {
        gold: number;
        strategic: Record<StrategicResourceKey, number>;
        previousYield?: { gold?: number; strategic?: Record<string, number> };
      }
    >;
  };
  keyFor: (x: number, y: number) => string;
}, tile: Tile): boolean => {
  const state = deps.state;
  const tileKey = deps.keyFor(tile.x, tile.y);
  const gold = tile.yield?.gold ?? 0;
  const strategic = {
    FOOD: Number(tile.yield?.strategic?.FOOD ?? 0),
    TITANIUM: Number(tile.yield?.strategic?.TITANIUM ?? 0),
    CRYSTAL: Number(tile.yield?.strategic?.CRYSTAL ?? 0),
    UMBRITE: Number(tile.yield?.strategic?.UMBRITE ?? 0),
    SHARD: Number(tile.yield?.strategic?.SHARD ?? 0)
  } satisfies Record<StrategicResourceKey, number>;
  const touched = gold > 0 || Object.values(strategic).some((amount) => amount > 0);
  if (!touched) return false;
  state.pendingCollectTileDelta.set(tileKey, {
    gold,
    strategic,
    ...(tile.yield ? { previousYield: { gold: tile.yield.gold ?? 0, strategic: { ...(tile.yield.strategic ?? {}) } } } : {})
  });
  if (gold > 0) {
    state.gold += gold;
    state.goldAnimUntil = Date.now() + 350;
    state.goldAnimDir = 1;
  }
  for (const resource of strategicKeys) {
    const amount = strategic[resource] ?? 0;
    if (amount <= 0) continue;
    state.strategicResources[resource] += amount;
    state.strategicAnim[resource] = { until: Date.now() + 350, dir: 1 };
  }
  tile.yield = { gold: 0, strategic: {} };
  return true;
};
