import { DEVELOPMENT_PROCESS_LIMIT, MANPOWER_BASE_CAP, VISION_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";

import type { SimulationRuntime } from "./runtime.js";
import { estimateIncomePerMinuteFromTiles, estimateStrategicProductionPerMinuteFromTiles } from "./player-runtime-summary.js";
import { buildLivePlayerEconomySnapshot, enrichSnapshotTilesForPlayer } from "./live-snapshot-view.js";
import { buildWorldStatusSnapshot } from "./world-status-snapshot.js";

export const buildPlayerSubscriptionSnapshot = (
  playerId: string,
  runtimeState: ReturnType<SimulationRuntime["exportState"]>,
  fallbackTiles?: Iterable<DomainTileState>,
  options?: { includeWorldStatus?: boolean }
): PlayerSubscriptionSnapshot => {
  const sourceTiles =
    runtimeState.tiles.length > 0
      ? [...runtimeState.tiles]
      : fallbackTiles
        ? [...fallbackTiles].map((tile) => ({
            x: tile.x,
            y: tile.y,
            terrain: tile.terrain,
            ...(tile.resource ? { resource: tile.resource } : {}),
            ...(tile.dockId ? { dockId: tile.dockId } : {}),
            ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
            ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
            ...(tile.town ? { townJson: JSON.stringify(tile.town) } : {}),
            ...(tile.town?.type ? { townType: tile.town.type } : {}),
            ...(tile.town?.name ? { townName: tile.town.name } : {}),
            ...(tile.town?.populationTier ? { townPopulationTier: tile.town.populationTier } : {}),
            ...(tile.fort ? { fortJson: JSON.stringify(tile.fort) } : {}),
            ...(tile.observatory ? { observatoryJson: JSON.stringify(tile.observatory) } : {}),
            ...(tile.siegeOutpost ? { siegeOutpostJson: JSON.stringify(tile.siegeOutpost) } : {}),
            ...(tile.economicStructure ? { economicStructureJson: JSON.stringify(tile.economicStructure) } : {}),
            ...(tile.sabotage ? { sabotageJson: JSON.stringify(tile.sabotage) } : {}),
            ...(tile.shardSite ? { shardSiteJson: JSON.stringify(tile.shardSite) } : {})
          }))
        : [];

  const keyFor = (x: number, y: number): string => `${x},${y}`;
  const wrapX = (x: number): number => ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
  const wrapY = (y: number): number => ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
  const parseKey = (tileKey: string): { x: number; y: number } | undefined => {
    const [rawX, rawY] = tileKey.split(",");
    const x = Number(rawX);
    const y = Number(rawY);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
    return { x, y };
  };

  const playersById = new Map(runtimeState.players.map((player) => [player.id, player] as const));
  const addVision = (
    territoryTileKeys: Iterable<string>,
    vision: number,
    visionRadiusBonus: number
  ): void => {
    const radius = Math.max(1, Math.floor(VISION_RADIUS * vision) + visionRadiusBonus);
    for (const tileKey of territoryTileKeys) {
      const coords = parseKey(tileKey);
      if (!coords) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          visibleKeys.add(keyFor(wrapX(coords.x + dx), wrapY(coords.y + dy)));
        }
      }
    }
  };
  const addVisionForPlayer = (nextPlayerId: string): void => {
    const nextPlayer = playersById.get(nextPlayerId);
    if (!nextPlayer) return;
    addVision(nextPlayer.territoryTileKeys, nextPlayer.vision, nextPlayer.visionRadiusBonus);
  };

  const visibleKeys = new Set<string>();
  const primaryPlayer = playersById.get(playerId);
  if (primaryPlayer) {
    addVision(primaryPlayer.territoryTileKeys, primaryPlayer.vision, primaryPlayer.visionRadiusBonus);
    for (const allyId of primaryPlayer.allies) addVisionForPlayer(allyId);
  } else {
    addVision(
      sourceTiles
        .filter((tile) => tile.ownerId === playerId)
        .map((tile) => keyFor(tile.x, tile.y)),
      1,
      0
    );
  }
  for (const lock of runtimeState.activeLocks) {
    if (lock.playerId !== playerId) continue;
    const origin = parseKey(lock.originKey);
    const target = parseKey(lock.targetKey);
    if (origin) visibleKeys.add(keyFor(origin.x, origin.y));
    if (target) visibleKeys.add(keyFor(target.x, target.y));
  }

  const tiles = sourceTiles
    .filter((tile) => visibleKeys.has(keyFor(tile.x, tile.y)))
    .sort((left, right) => (left.x - right.x) || (left.y - right.y));
  const pendingSettlements = runtimeState.pendingSettlements
    .filter((settlement) => settlement.ownerId === playerId)
    .map((settlement) => {
      const coords = parseKey(settlement.tileKey);
      return coords ? { x: coords.x, y: coords.y, startedAt: settlement.startedAt, resolvesAt: settlement.resolvesAt } : undefined;
    })
      .filter((settlement): settlement is NonNullable<typeof settlement> => Boolean(settlement))
      .sort((left, right) => (left.resolvesAt - right.resolvesAt) || (left.x - right.x) || (left.y - right.y));
  const livePlayer = playersById.get(playerId);
  const hasLivePlayerState = livePlayer && typeof livePlayer.points === "number" && typeof livePlayer.manpower === "number";
  const liveEconomy = buildLivePlayerEconomySnapshot(playerId, runtimeState);
  const settledTileCount =
    typeof livePlayer?.settledTileCount === "number"
      ? livePlayer.settledTileCount
      : runtimeState.tiles.filter((tile) => tile.ownerId === playerId && tile.ownershipState === "SETTLED").length;
  const strategicProductionPerMinute =
    livePlayer?.strategicProductionPerMinute ??
    liveEconomy.strategicProductionPerMinute ??
    estimateStrategicProductionPerMinuteFromTiles(playerId, runtimeState.tiles);
  const activeDevelopmentProcessCount =
    typeof livePlayer?.activeDevelopmentProcessCount === "number"
      ? livePlayer.activeDevelopmentProcessCount
      : pendingSettlements.length +
        runtimeState.tiles.filter((tile) => {
          if (tile.ownerId !== playerId) return false;
          return (
            tile.fortJson?.includes("\"under_construction\"") ||
            tile.fortJson?.includes("\"removing\"") ||
            tile.observatoryJson?.includes("\"under_construction\"") ||
            tile.observatoryJson?.includes("\"removing\"") ||
            tile.siegeOutpostJson?.includes("\"under_construction\"") ||
            tile.siegeOutpostJson?.includes("\"removing\"") ||
            tile.economicStructureJson?.includes("\"under_construction\"") ||
            tile.economicStructureJson?.includes("\"removing\"")
          );
        }).length;
  const incomePerMinute =
    typeof livePlayer?.incomePerMinute === "number"
      ? livePlayer.incomePerMinute
      : liveEconomy.incomePerMinute ?? estimateIncomePerMinuteFromTiles(playerId, runtimeState.tiles);
  const enrichedTiles = enrichSnapshotTilesForPlayer(playerId, runtimeState, tiles, liveEconomy);

  return {
    playerId,
    ...(hasLivePlayerState
      ? {
          player: {
            id: livePlayer.id,
            ...(livePlayer.name ? { name: livePlayer.name } : {}),
            gold: livePlayer.points,
            manpower: livePlayer.manpower,
            manpowerCap: Math.max(livePlayer.manpowerCapSnapshot ?? 0, MANPOWER_BASE_CAP),
            incomePerMinute,
            strategicResources: {
              FOOD: livePlayer.strategicResources.FOOD ?? 0,
              IRON: livePlayer.strategicResources.IRON ?? 0,
              CRYSTAL: livePlayer.strategicResources.CRYSTAL ?? 0,
              SUPPLY: livePlayer.strategicResources.SUPPLY ?? 0,
              SHARD: livePlayer.strategicResources.SHARD ?? 0,
              OIL: livePlayer.strategicResources.OIL ?? 0
            },
            strategicProductionPerMinute,
            economyBreakdown: liveEconomy.economyBreakdown,
            upkeepPerMinute: liveEconomy.upkeepPerMinute,
            upkeepLastTick: liveEconomy.upkeepLastTick,
            developmentProcessLimit: DEVELOPMENT_PROCESS_LIMIT,
            activeDevelopmentProcessCount,
            pendingSettlements,
            techIds: [...livePlayer.techIds],
            domainIds: [...livePlayer.domainIds]
          }
        }
      : {}),
    ...(options?.includeWorldStatus === false ? {} : { worldStatus: buildWorldStatusSnapshot(playerId, runtimeState, fallbackTiles) }),
    tiles: enrichedTiles
  };
};
