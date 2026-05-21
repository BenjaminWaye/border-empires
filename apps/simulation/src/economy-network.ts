import { DOCK_INCOME_PER_MIN, type DomainPlayer, type DomainTileState } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";

import { additiveEffectForPlayer, multiplicativeEffectForPlayer } from "./tech-domain-bridge.js";

export type EconomyPlayer = Pick<DomainPlayer, "id" | "techIds" | "domainIds" | "mods">;

export type ConnectedTownNetworkEntry = {
  connectedTownCount: number;
  connectedTownBonus: number;
  connectedTownNames?: string[];
};

export type DockEconomyContext = {
  tiles: ReadonlyMap<string, DomainTileState>;
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
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

const settledLandKeysForPlayer = (
  playerId: string,
  tiles: Iterable<DomainTileState>
): Set<string> => {
  const out = new Set<string>();
  for (const tile of tiles) {
    if (tile.ownerId === playerId && tile.ownershipState === "SETTLED" && tile.terrain === "LAND") {
      out.add(keyFor(tile.x, tile.y));
    }
  }
  return out;
};

const directlyConnectedTownKeysForTown = (
  playerId: string,
  originTownKey: string,
  settledLand: ReadonlySet<string>,
  ownedTownKeys: ReadonlySet<string>
): string[] => {
  if (!settledLand.has(originTownKey)) return [];
  const queue = [originTownKey];
  const visited = new Set<string>([originTownKey]);
  const connectedTowns = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    const [rawX, rawY] = current.split(",");
    const cx = Number(rawX);
    const cy = Number(rawY);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nextKey = keyFor(cx + dx, cy + dy);
        if (!settledLand.has(nextKey) || visited.has(nextKey)) continue;
        if (ownedTownKeys.has(nextKey) && nextKey !== originTownKey) {
          connectedTowns.add(nextKey);
          visited.add(nextKey);
          continue;
        }
        visited.add(nextKey);
        queue.push(nextKey);
      }
    }
  }
  return [...connectedTowns].sort((left, right) => left.localeCompare(right));
};

export const buildConnectedTownNetworkForPlayer = (
  player: EconomyPlayer,
  tiles: ReadonlyMap<string, DomainTileState>,
  playerSettledTiles: Iterable<DomainTileState> = tiles.values()
): Map<string, ConnectedTownNetworkEntry> => {
  const settledTiles = [...playerSettledTiles];
  const settledLand = settledLandKeysForPlayer(player.id, settledTiles);
  const ownedTownKeys = new Set<string>();
  for (const tile of settledTiles) {
    if (tile.ownerId === player.id && tile.ownershipState === "SETTLED" && tile.town) {
      ownedTownKeys.add(keyFor(tile.x, tile.y));
    }
  }
  const out = new Map<string, ConnectedTownNetworkEntry>();
  for (const townKey of ownedTownKeys) {
    const connectedTownKeys = directlyConnectedTownKeysForTown(player.id, townKey, settledLand, ownedTownKeys);
    const connectedTownNames = connectedTownKeys
      .map((tileKey) => tiles.get(tileKey)?.town?.name)
      .filter((name): name is string => typeof name === "string" && name.length > 0)
      .sort((left, right) => left.localeCompare(right));
    out.set(townKey, {
      connectedTownCount: connectedTownKeys.length,
      connectedTownBonus: connectedTownBonusForPlayer(connectedTownKeys.length, player),
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

export const firstThreeTownKeysForPlayer = (
  playerId: string,
  tiles: Iterable<Pick<DomainTileState, "x" | "y" | "ownerId" | "ownershipState" | "town">>
): Set<string> =>
  new Set(
    [...tiles]
      .filter((tile) => tile.ownerId === playerId && tile.ownershipState === "SETTLED" && tile.town)
      .slice(0, 3)
      .map((tile) => keyFor(tile.x, tile.y))
  );

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
