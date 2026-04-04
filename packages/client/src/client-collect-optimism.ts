import type { Tile } from "./client-types.js";

type StrategicResourceKey = "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL";

export const hasCollectableYield = (tile: Tile | undefined): boolean => {
  if (!tile?.yield) return false;
  if ((tile.yield.gold ?? 0) > 0.01) return true;
  return Object.values(tile.yield.strategic ?? {}).some((value) => Number(value) > 0.01);
};

export const visibleCollectSummary = (deps: {
  tiles: Iterable<Tile>;
  me: string;
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => "visible" | "fogged" | "unexplored";
}): { tileCount: number; gold: number; resourceKinds: number } => {
  let tileCount = 0;
  let gold = 0;
  const activeResources = new Set<string>();
  for (const tile of deps.tiles) {
    if (tile.ownerId !== deps.me || tile.ownershipState !== "SETTLED") continue;
    if (deps.tileVisibilityStateAt(tile.x, tile.y, tile) !== "visible") continue;
    if (!hasCollectableYield(tile)) continue;
    tileCount += 1;
    gold += tile.yield?.gold ?? 0;
    for (const [resource, amount] of Object.entries(tile.yield?.strategic ?? {})) {
      if (Number(amount) > 0.01) activeResources.add(resource);
    }
  }
  return { tileCount, gold, resourceKinds: activeResources.size };
};

const strategicKeys: StrategicResourceKey[] = ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD", "OIL"];

export const clearPendingCollectVisibleDelta = (state: {
  pendingCollectVisibleDelta: { gold: number; strategic: Record<StrategicResourceKey, number> };
}): void => {
  state.pendingCollectVisibleDelta.gold = 0;
  for (const resource of strategicKeys) state.pendingCollectVisibleDelta.strategic[resource] = 0;
};

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

export const revertOptimisticVisibleCollectDelta = (state: {
  gold: number;
  strategicResources: Record<StrategicResourceKey, number>;
  pendingCollectVisibleDelta: { gold: number; strategic: Record<StrategicResourceKey, number> };
}): void => {
  const delta = state.pendingCollectVisibleDelta;
  if (delta.gold > 0) state.gold = Math.max(0, state.gold - delta.gold);
  for (const resource of strategicKeys) {
    const amount = delta.strategic[resource] ?? 0;
    if (amount > 0) state.strategicResources[resource] = Math.max(0, state.strategicResources[resource] - amount);
  }
  clearPendingCollectVisibleDelta(state);
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

export const applyOptimisticVisibleCollect = (deps: {
  state: {
    me: string;
    gold: number;
    goldAnimUntil: number;
    goldAnimDir: number;
    strategicResources: Record<StrategicResourceKey, number>;
    strategicAnim: Record<StrategicResourceKey, { until: number; dir: number }>;
    pendingCollectVisibleKeys: Set<string>;
    pendingCollectVisibleDelta: { gold: number; strategic: Record<StrategicResourceKey, number> };
  };
  tilesIterable: Iterable<Tile>;
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => "visible" | "fogged" | "unexplored";
  keyFor: (x: number, y: number) => string;
}): number => {
  const state = deps.state;
  state.pendingCollectVisibleKeys.clear();
  clearPendingCollectVisibleDelta(state);
  let touched = 0;
  for (const tile of deps.tilesIterable) {
    if (tile.ownerId !== state.me || tile.ownershipState !== "SETTLED") continue;
    if (deps.tileVisibilityStateAt(tile.x, tile.y, tile) !== "visible") continue;
    if (!hasCollectableYield(tile)) continue;
    state.pendingCollectVisibleKeys.add(deps.keyFor(tile.x, tile.y));
    const gold = tile.yield?.gold ?? 0;
    if (gold > 0) {
      state.gold += gold;
      state.pendingCollectVisibleDelta.gold += gold;
      state.goldAnimUntil = Date.now() + 350;
      state.goldAnimDir = 1;
    }
    for (const resource of strategicKeys) {
      const amount = Number(tile.yield?.strategic?.[resource] ?? 0);
      if (amount <= 0) continue;
      state.strategicResources[resource] += amount;
      state.pendingCollectVisibleDelta.strategic[resource] += amount;
      state.strategicAnim[resource] = { until: Date.now() + 350, dir: 1 };
    }
    tile.yield = { gold: 0, strategic: {} };
    touched += 1;
  }
  return touched;
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
    IRON: Number(tile.yield?.strategic?.IRON ?? 0),
    CRYSTAL: Number(tile.yield?.strategic?.CRYSTAL ?? 0),
    SUPPLY: Number(tile.yield?.strategic?.SUPPLY ?? 0),
    SHARD: Number(tile.yield?.strategic?.SHARD ?? 0),
    OIL: Number(tile.yield?.strategic?.OIL ?? 0)
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
