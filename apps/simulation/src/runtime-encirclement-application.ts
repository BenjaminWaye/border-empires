import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import { computeEncirclementDeltas } from "./encirclement/encirclement.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { ActiveAetherBridgeView, SimulationTileWireDelta } from "./runtime-types.js";

const EXPAND_NEIGHBOR_OFFSETS = [
  [-1, -1], [0, -1], [1, -1],
  [-1,  0],          [1,  0],
  [-1,  1], [0,  1], [1,  1],
] as const;

export type RuntimeEncirclementApplicationContext = {
  tiles: Map<string, DomainTileState>;
  now: () => number;
  activeAetherBridgesForPlayer: (playerId: string) => ActiveAetherBridgeView[];
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitEvent: (event: SimulationEvent) => void;
  runtimeLogInfo: (payload: Record<string, unknown>, message: string) => void;
};

export function activeAetherBridgeNeighborKeysForPlayer(
  context: Pick<RuntimeEncirclementApplicationContext, "activeAetherBridgesForPlayer">,
  playerId: string
): Map<string, string[]> {
  const neighborKeys = new Map<string, string[]>();
  for (const bridge of context.activeAetherBridgesForPlayer(playerId)) {
    const fromKey = simulationTileKey(bridge.from.x, bridge.from.y);
    const toKey = simulationTileKey(bridge.to.x, bridge.to.y);
    const fromNeighbors = neighborKeys.get(fromKey);
    if (fromNeighbors) fromNeighbors.push(toKey);
    else neighborKeys.set(fromKey, [toKey]);
    const toNeighbors = neighborKeys.get(toKey);
    if (toNeighbors) toNeighbors.push(fromKey);
    else neighborKeys.set(toKey, [fromKey]);
  }
  return neighborKeys;
}

export function applyEncirclementForExpand(
  context: RuntimeEncirclementApplicationContext,
  targetKey: string,
  playerId: string,
  commandId: string,
  options?: { bfsCap?: number }
): void {
  const [xStr, yStr] = targetKey.split(",");
  const bx = Number(xStr);
  const by = Number(yStr);
  const bfsCap = options?.bfsCap ?? 2000;
  const aetherBridgeNeighborKeys = activeAetherBridgeNeighborKeysForPlayer(context, playerId);

  const seeds: string[] = [];
  for (const [dx, dy] of EXPAND_NEIGHBOR_OFFSETS) {
    const nk = `${wrapX(bx + dx, WORLD_WIDTH)},${wrapY(by + dy, WORLD_HEIGHT)}`;
    const tile = context.tiles.get(nk);
    if (tile?.ownerId === playerId && tile.ownershipState === "FRONTIER" && tile.frontierDecayKind === "ENCIRCLEMENT") {
      seeds.push(nk);
    }
  }
  for (const nk of aetherBridgeNeighborKeys.get(targetKey) ?? []) {
    const tile = context.tiles.get(nk);
    if (tile?.ownerId === playerId && tile.ownershipState === "FRONTIER" && tile.frontierDecayKind === "ENCIRCLEMENT") {
      seeds.push(nk);
    }
  }
  if (seeds.length === 0) return;

  const visited = new Set<string>(seeds);
  const queue = [...seeds];
  const reconnected = new Set<string>(seeds);

  while (queue.length > 0) {
    if (bfsCap > 0 && visited.size > bfsCap) {
      context.runtimeLogInfo(
        { playerId, bfsVisited: visited.size, bfsCap, seedCount: seeds.length, commandId },
        "[applyEncirclementForExpand] BFS cap exceeded — skipping reconnection this tick"
      );
      return;
    }
    const current = queue.shift()!;
    const [cxStr, cyStr] = current.split(",") as [string, string];
    const cx = Number(cxStr);
    const cy = Number(cyStr);
    for (const [dx, dy] of EXPAND_NEIGHBOR_OFFSETS) {
      const nk = `${wrapX(cx + dx, WORLD_WIDTH)},${wrapY(cy + dy, WORLD_HEIGHT)}`;
      if (visited.has(nk)) continue;
      visited.add(nk);
      const tile = context.tiles.get(nk);
      if (tile?.ownerId === playerId && tile.ownershipState === "FRONTIER" && tile.frontierDecayKind === "ENCIRCLEMENT") {
        reconnected.add(nk);
        queue.push(nk);
      }
    }
    for (const nk of aetherBridgeNeighborKeys.get(current) ?? []) {
      if (visited.has(nk)) continue;
      visited.add(nk);
      const tile = context.tiles.get(nk);
      if (tile?.ownerId === playerId && tile.ownershipState === "FRONTIER" && tile.frontierDecayKind === "ENCIRCLEMENT") {
        reconnected.add(nk);
        queue.push(nk);
      }
    }
  }

  const tileDeltas: SimulationTileWireDelta[] = [];
  for (const key of reconnected) {
    const tile = context.tiles.get(key);
    if (!tile || tile.frontierDecayKind !== "ENCIRCLEMENT") continue;
    const updated: DomainTileState = { ...tile, frontierDecayAt: undefined, frontierDecayKind: undefined };
    context.replaceTileState(key, updated, commandId);
    tileDeltas.push(context.tileDeltaFromState(updated));
  }
  if (tileDeltas.length > 0) {
    context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId, tileDeltas });
  }
}

export function applyEncirclement(
  context: RuntimeEncirclementApplicationContext,
  changedKeys: string[],
  playerId: string,
  commandId: string,
  options?: { bfsCap?: number; skipCutOff?: boolean }
): void {
  const getTile = (key: string) => context.tiles.get(key);
  const nowMs = context.now();
  const aetherBridgeNeighborKeys = activeAetherBridgeNeighborKeysForPlayer(context, playerId);
  const { cutOff, reconnected } = computeEncirclementDeltas(changedKeys, playerId, getTile, nowMs, {
    extraNeighborKeys: (tileKey) => aetherBridgeNeighborKeys.get(tileKey) ?? [],
    ...(options?.bfsCap !== undefined ? { bfsCap: options.bfsCap } : {}),
    ...(options?.skipCutOff ? { skipCutOff: true } : {}),
    onCapExceeded: (pid, visited, cap) => {
      context.runtimeLogInfo(
        { playerId: pid, bfsVisited: visited, bfsCap: cap, changedKeysCount: changedKeys.length, commandId },
        "[applyEncirclement] BFS cap exceeded — skipping detection this tick"
      );
    }
  });

  const tileDeltas: SimulationTileWireDelta[] = [];
  for (const key of cutOff) {
    const tile = context.tiles.get(key);
    if (!tile || tile.ownershipState !== "FRONTIER") continue;
    const cleared: DomainTileState = {
      ...tile,
      ownerId: undefined,
      ownershipState: undefined,
      frontierDecayAt: undefined,
      frontierDecayKind: undefined,
      fort: undefined,
      observatory: undefined,
      siegeOutpost: undefined,
      economicStructure: undefined,
      muster: undefined,
      sabotage: undefined
    };
    context.replaceTileState(key, cleared, commandId);
    tileDeltas.push(context.tileDeltaFromState(cleared));
  }

  for (const key of reconnected) {
    const tile = context.tiles.get(key);
    if (!tile) continue;
    if (typeof tile.frontierDecayAt !== "number" || tile.frontierDecayKind !== "ENCIRCLEMENT") continue;
    const updated: DomainTileState = { ...tile, frontierDecayAt: undefined, frontierDecayKind: undefined };
    context.replaceTileState(key, updated, commandId);
    tileDeltas.push(context.tileDeltaFromState(updated));
  }

  if (tileDeltas.length > 0) {
    context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId, tileDeltas });
  }
}
