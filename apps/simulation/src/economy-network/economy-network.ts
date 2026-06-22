import { DOCK_INCOME_PER_MIN, type DomainPlayer, type DomainTileState } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";

import { additiveEffectForPlayer, multiplicativeEffectForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";

export type EconomyPlayer = Pick<DomainPlayer, "id" | "techIds" | "domainIds" | "mods">;

export type ConnectedTownNetworkEntry = {
  connectedTownCount: number;
  connectedTownBonus: number;
  connectedTownKeys?: string[];
  connectedTownNames?: string[];
};

export type DockEconomyContext = {
  tiles: ReadonlyMap<string, DomainTileState>;
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
};

export type ConnectedTownNetworkOptions = {
  maxConnectedTownNames?: number;
};

const keyFor = (x: number, y: number): string => `${wrapX(x, WORLD_WIDTH)},${wrapY(y, WORLD_HEIGHT)}`;

const connectedTownStepCount = (connectedTownCount: number): number => Math.max(0, Math.min(3, connectedTownCount));

export const connectedTownBonusForPlayer = (
  connectedTownCount: number,
  player: Pick<DomainPlayer, "techIds" | "domainIds">
): number => {
  const stepCount = connectedTownStepCount(connectedTownCount);
  if (stepCount <= 0) return 0;
  const stepBonusAdd = additiveEffectForPlayer(player, "connectedTownStepBonusAdd");
  return [0.5, 0.4, 0.3]
    .slice(0, stepCount)
    .reduce((total, baseStep) => total + baseStep + stepBonusAdd, 0);
};

export const buildConnectedTownNetworkForPlayer = (
  player: EconomyPlayer,
  tiles: ReadonlyMap<string, DomainTileState>,
  playerSettledTiles: Iterable<DomainTileState> = tiles.values(),
  options: ConnectedTownNetworkOptions = {}
): Map<string, ConnectedTownNetworkEntry> => {
  const maxConnectedTownNames = Math.max(0, options.maxConnectedTownNames ?? Number.POSITIVE_INFINITY);

  // Partition settled land into town tiles and non-town tiles (corridor tiles).
  // Town tiles act as both barriers and connection endpoints; non-town tiles
  // form the land corridors connecting towns.
  const ownedTownKeys = new Set<string>();
  const nonTownSettledKeys = new Set<string>();
  for (const tile of playerSettledTiles) {
    if (tile.ownerId !== player.id || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") continue;
    const k = keyFor(tile.x, tile.y);
    if (tile.town) {
      ownedTownKeys.add(k);
    } else {
      nonTownSettledKeys.add(k);
    }
  }

  // directConnectionsByTown[A] = Set of towns B such that A and B are directly
  // connected (reachable from each other without passing through another town).
  const directConnectionsByTown = new Map<string, Set<string>>();
  for (const townKey of ownedTownKeys) {
    directConnectionsByTown.set(townKey, new Set());
  }

  // Step 1: direct town-to-town adjacency (8-neighbors that are both towns).
  // These are connected regardless of the corridor graph.
  for (const townKey of ownedTownKeys) {
    const [rawX, rawY] = townKey.split(",");
    const cx = Number(rawX), cy = Number(rawY);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nextKey = keyFor(cx + dx, cy + dy);
        if (ownedTownKeys.has(nextKey)) {
          directConnectionsByTown.get(townKey)?.add(nextKey);
        }
      }
    }
  }

  // Step 2: single BFS pass over connected components of non-town settled tiles.
  // Replaces K separate per-town BFS runs (O(K×N)) with O(N + K²) total work.
  // For each component, every town 8-adjacent to any tile in that component can
  // reach every other such town through the corridor — they are all directly
  // connected to each other.
  const visited = new Set<string>();
  const queue: string[] = [];

  for (const startKey of nonTownSettledKeys) {
    if (visited.has(startKey)) continue;

    visited.add(startKey);
    queue.length = 0;
    queue.push(startKey);
    let readIndex = 0;
    const adjacentTownKeys = new Set<string>();

    while (readIndex < queue.length) {
      const current = queue[readIndex++]!;
      const [rawX, rawY] = current.split(",");
      const cx = Number(rawX), cy = Number(rawY);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nextKey = keyFor(cx + dx, cy + dy);
          if (ownedTownKeys.has(nextKey)) {
            adjacentTownKeys.add(nextKey);
            continue;
          }
          if (!nonTownSettledKeys.has(nextKey) || visited.has(nextKey)) continue;
          visited.add(nextKey);
          queue.push(nextKey);
        }
      }
    }

    // All towns adjacent to this component are directly connected to each other.
    const adjacentTownList = [...adjacentTownKeys];
    for (let i = 0; i < adjacentTownList.length; i++) {
      for (let j = i + 1; j < adjacentTownList.length; j++) {
        const a = adjacentTownList[i]!;
        const b = adjacentTownList[j]!;
        directConnectionsByTown.get(a)?.add(b);
        directConnectionsByTown.get(b)?.add(a);
      }
    }
  }

  // Build output entries.
  const out = new Map<string, ConnectedTownNetworkEntry>();
  for (const [startTownKey, directTownKeySet] of directConnectionsByTown) {
    const directTownKeys = [...directTownKeySet].sort((l, r) => l.localeCompare(r));
    const townNameByKey = new Map<string, string>();
    for (const townKey of directTownKeys) {
      const name = tiles.get(townKey)?.town?.name;
      if (typeof name === "string" && name.length > 0) townNameByKey.set(townKey, name);
    }
    const connectedTownCount = directTownKeys.length;
    const connectedTownNames =
      maxConnectedTownNames > 0 && connectedTownCount <= maxConnectedTownNames
        ? directTownKeys
            .map((k) => townNameByKey.get(k))
            .filter((n): n is string => typeof n === "string" && n.length > 0)
            .sort((l, r) => l.localeCompare(r))
        : [];
    out.set(startTownKey, {
      connectedTownCount,
      connectedTownBonus: connectedTownBonusForPlayer(connectedTownCount, player),
      ...(directTownKeys.length ? { connectedTownKeys: directTownKeys } : {}),
      ...(connectedTownNames.length ? { connectedTownNames } : {})
    });
  }
  return out;
};

export const enrichTownWithConnectedNetwork = (
  tile: DomainTileState,
  townNetwork: ReadonlyMap<string, ConnectedTownNetworkEntry> | undefined
): DomainTileState["town"] | undefined => {
  if (!tile.town) return undefined;
  const entry = townNetwork?.get(keyFor(tile.x, tile.y));
  if (!entry) return tile.town;
  return {
    ...tile.town,
    connectedTownCount: entry.connectedTownCount,
    connectedTownBonus: entry.connectedTownBonus,
    ...(entry.connectedTownNames ? { connectedTownNames: entry.connectedTownNames } : {})
  };
};

export const dockGoldOutputMultiplierForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">
): number => multiplicativeEffectForPlayer(player, "dockGoldOutputMult");

/**
 * Returns the keys of the player's first three settled town tiles in the
 * iteration order of the supplied iterable — the same semantics as the old
 * implementation that scanned all tiles, but O(3) instead of O(all_map_tiles).
 *
 * Callers should pass `summary.ownedTownTierByTile.keys()` (or equivalent)
 * rather than `tiles.values()`, avoiding the full tile-map scan.
 */
export const firstThreeTownKeysForPlayer = (
  _playerId: string,
  ownedSettledTownTileKeys: Iterable<string>
): Set<string> => {
  const result = new Set<string>();
  for (const key of ownedSettledTownTileKeys) {
    result.add(key);
    if (result.size >= 3) break;
  }
  return result;
};

export const firstThreeTownsGoldOutputMultiplierForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">
): number => multiplicativeEffectForPlayer(player, "firstThreeTownsGoldOutputMult");

export const firstThreeTownsPopulationGrowthMultiplierForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">
): number => multiplicativeEffectForPlayer(player, "firstThreeTownsPopulationGrowthMult");

export const dockConnectionBonusPerLinkForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">
): number => {
  const configured = additiveEffectForPlayer(player, "dockConnectionBonusPerLink");
  return configured > 0 ? configured : 0.5;
};

export const dockConnectedOwnedSettledCount = (
  dockTileKey: string,
  playerId: string,
  context: DockEconomyContext
): number => {
  let connectedCount = 0;
  for (const linkedDockTileKey of context.dockLinksByDockTileKey.get(dockTileKey) ?? []) {
    const linked = context.tiles.get(linkedDockTileKey);
    if (linked?.ownerId === playerId && linked.ownershipState === "SETTLED") connectedCount += 1;
  }
  return connectedCount;
};

export const dockBaseGoldPerMinuteForPlayer = (
  tile: DomainTileState,
  player: EconomyPlayer,
  context: DockEconomyContext | undefined
): number => {
  if (!tile.dockId || tile.ownerId !== player.id || tile.ownershipState !== "SETTLED") return 0;
  const connectedDockCount = context ? dockConnectedOwnedSettledCount(keyFor(tile.x, tile.y), player.id, context) : 0;
  return (
    DOCK_INCOME_PER_MIN *
    dockGoldOutputMultiplierForPlayer(player) *
    (1 + dockConnectionBonusPerLinkForPlayer(player) * connectedDockCount)
  );
};
