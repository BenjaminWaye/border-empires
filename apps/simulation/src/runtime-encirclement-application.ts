import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { FRONTIER_AUTO_HEAL_MS, WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import { abandonedStructureFields } from "./capture-structures/capture-structures.js";
import { computeEncirclementDeltas } from "./encirclement/encirclement.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { findStrandedFrontier } from "./stranded-frontier/stranded-frontier-finder.js";
import { incrementStrandedFrontierCounter } from "./stranded-frontier/stranded-frontier-metrics.js";
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
  /** Static dock sea-lane supply edges (home dock <-> beach-landing ground); see packages/shared dock-landing. */
  seaLaneNeighborKeysByTileKey: ReadonlyMap<string, readonly string[]>;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitEvent: (event: SimulationEvent) => void;
  runtimeLogInfo: (payload: Record<string, unknown>, message: string) => void;
  /** Registers the auto-heal deadline for a tile just cut off to neutral -- see runtime-frontier-auto-heal.ts. */
  registerFrontierAutoHeal: (tileKey: string, deadlineAt: number) => void;
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

/**
 * Supply links beyond the 8-neighbour ring: the player's active Aether bridges
 * plus the dock sea lanes, which tie a beach landing to the dock(s) it was
 * launched from. Sea lanes are static and listed for every owner; the
 * connectivity walks only ever step onto the player's own tiles.
 */
export function supplyLinkNeighborKeysForPlayer(
  context: Pick<RuntimeEncirclementApplicationContext, "activeAetherBridgesForPlayer" | "seaLaneNeighborKeysByTileKey">,
  playerId: string
): (tileKey: string) => readonly string[] {
  const bridgeNeighborKeys = activeAetherBridgeNeighborKeysForPlayer(context, playerId);
  return (tileKey) => {
    const bridgeKeys = bridgeNeighborKeys.get(tileKey);
    const seaLaneKeys = context.seaLaneNeighborKeysByTileKey.get(tileKey);
    if (!bridgeKeys) return seaLaneKeys ?? [];
    return seaLaneKeys ? [...bridgeKeys, ...seaLaneKeys] : bridgeKeys;
  };
}

// Visit cap for the sea-lane landing check below. Each walk starts on the
// landing side and stops at the first supply tile, so a held landing costs a
// handful of lookups; the cap only bounds a large stranded beachhead.
const SEA_LANE_STRAND_MAX_VISITED = 2_000;

/**
 * A dock that just left `playerId`'s hands may have been the home dock of
 * their beach landings across the sea, which hang on it through the sea lane
 * alone. The region BFS in computeEncirclementDeltas walks the whole owned
 * component behind the changed tile and bails at its cap, which a home dock
 * deep in a mid-sized empire always hits -- so check the landings directly,
 * from their own side. Returns the deltas of the tiles released.
 */
function releaseStrandedSeaLaneLandings(
  context: RuntimeEncirclementApplicationContext,
  changedKeys: readonly string[],
  playerId: string,
  supplyNeighbors: (tileKey: string) => readonly string[],
  commandId: string,
  nowMs: number
): SimulationTileWireDelta[] {
  const seeds: string[] = [];
  for (const changedKey of changedKeys) {
    if (context.tiles.get(changedKey)?.ownerId === playerId) continue;
    for (const landingKey of context.seaLaneNeighborKeysByTileKey.get(changedKey) ?? []) {
      const landing = context.tiles.get(landingKey);
      if (landing?.ownerId === playerId && landing.ownershipState === "FRONTIER" && !landing.dockId) seeds.push(landingKey);
    }
  }
  if (seeds.length === 0) return [];
  incrementStrandedFrontierCounter("seaLaneChecks");
  const result = findStrandedFrontier({
    seedKeys: seeds,
    ownerId: playerId,
    getTile: (key) => context.tiles.get(key),
    extraNeighborKeys: supplyNeighbors,
    maxVisited: SEA_LANE_STRAND_MAX_VISITED
  });
  if (result.capped) incrementStrandedFrontierCounter("capHits");
  const tileDeltas = clearCutOffFrontierTiles(context, result.stranded, commandId, nowMs);
  if (tileDeltas.length > 0) incrementStrandedFrontierCounter("seaLaneReleased", tileDeltas.length);
  return tileDeltas;
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
  const supplyNeighbors = supplyLinkNeighborKeysForPlayer(context, playerId);

  const seeds: string[] = [];
  for (const [dx, dy] of EXPAND_NEIGHBOR_OFFSETS) {
    const nk = `${wrapX(bx + dx, WORLD_WIDTH)},${wrapY(by + dy, WORLD_HEIGHT)}`;
    const tile = context.tiles.get(nk);
    if (tile?.ownerId === playerId && tile.ownershipState === "FRONTIER" && tile.frontierDecayKind === "ENCIRCLEMENT") {
      seeds.push(nk);
    }
  }
  for (const nk of supplyNeighbors(targetKey)) {
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
    for (const nk of supplyNeighbors(current)) {
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
  const supplyNeighbors = supplyLinkNeighborKeysForPlayer(context, playerId);
  const { cutOff, reconnected } = computeEncirclementDeltas(changedKeys, playerId, getTile, nowMs, {
    extraNeighborKeys: supplyNeighbors,
    ...(options?.bfsCap !== undefined ? { bfsCap: options.bfsCap } : {}),
    ...(options?.skipCutOff ? { skipCutOff: true } : {}),
    onCapExceeded: (pid, visited, cap) => {
      context.runtimeLogInfo(
        { playerId: pid, bfsVisited: visited, bfsCap: cap, changedKeysCount: changedKeys.length, commandId },
        "[applyEncirclement] BFS cap exceeded — skipping detection this tick"
      );
    }
  });

  const tileDeltas = clearCutOffFrontierTiles(context, cutOff, commandId, nowMs);
  if (!options?.skipCutOff) {
    tileDeltas.push(...releaseStrandedSeaLaneLandings(context, changedKeys, playerId, supplyNeighbors, commandId, nowMs));
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

/**
 * Releases cut-off FRONTIER tiles to neutral and registers their auto-heal.
 * Shared by encirclement and the stranded-frontier cleanup so every
 * connectivity-loss path leaves a tile in the same neutral state. Returns the
 * deltas; the caller emits them.
 */
export function clearCutOffFrontierTiles(
  context: Pick<RuntimeEncirclementApplicationContext, "tiles" | "replaceTileState" | "registerFrontierAutoHeal" | "tileDeltaFromState">,
  keys: Iterable<string>,
  commandId: string,
  nowMs: number
): SimulationTileWireDelta[] {
  const tileDeltas: SimulationTileWireDelta[] = [];
  for (const key of keys) {
    const tile = context.tiles.get(key);
    if (!tile || tile.ownershipState !== "FRONTIER") continue;
    // naturalWonder is deliberately NOT cleared: it's a fixed world-gen
    // feature, not a player-built structure, and survives losing an owner
    // just like it survives never having one -- clearing it here permanently
    // erased wonders that were claimed but then cut off by encirclement
    // before being settled.
    //
    // Buildings follow the same survival rules as abandoning the tile
    // (abandonedStructureFields): a finished fort, observatory or economic
    // structure stays standing, inert, for whoever claims the tile next. A
    // freshly captured building sits on FRONTIER while its auto-settle runs,
    // so wiping structures here erased it whenever the capture was cut off
    // and reach then healed the tile back for the settle to finish on.
    const healAt = nowMs + FRONTIER_AUTO_HEAL_MS;
    const cleared: DomainTileState = {
      ...tile,
      ownerId: undefined,
      ownershipState: undefined,
      frontierDecayAt: undefined,
      frontierDecayKind: undefined,
      ...abandonedStructureFields(tile),
      muster: undefined,
      sabotage: undefined,
      healAt
    };
    context.replaceTileState(key, cleared, commandId);
    context.registerFrontierAutoHeal(key, healAt);
    tileDeltas.push(context.tileDeltaFromState(cleared));
  }
  return tileDeltas;
}
