import type {
  EconomicStructure,
  EconomicStructureType,
  OwnershipState,
  Player,
  StrategicReplayEvent,
  Tile,
  TileKey
} from "@border-empires/shared";
import type { RuntimeTileCore, TownDefinition } from "./server-shared-types.js";

type OwnedTileMap = Map<string, Set<TileKey>>;

interface PendingSettlement {
  tileKey: TileKey;
  ownerId: string;
  startedAt: number;
  resolvesAt: number;
  goldCost: number;
  cancelled: boolean;
  timeout?: NodeJS.Timeout;
}

export interface CreateServerOwnershipRuntimeDeps {
  ownership: Map<TileKey, string>;
  ownershipStateByTile: Map<TileKey, OwnershipState>;
  settledSinceByTile: Map<TileKey, number>;
  townsByTile: Map<TileKey, TownDefinition>;
  pendingSettlementsByTile: Map<TileKey, PendingSettlement>;
  fortsByTile: Map<TileKey, { ownerId: string; status: string; completesAt?: number; disabledUntil?: number; previousStatus?: string }>;
  observatoriesByTile: Map<TileKey, { ownerId: string; status: string }>;
  siegeOutpostsByTile: Map<TileKey, { ownerId: string; status: string }>;
  economicStructuresByTile: Map<TileKey, EconomicStructure>;
  siphonByTile: Map<TileKey, unknown>;
  breachShockByTile: Map<TileKey, unknown>;
  settlementDefenseByTile: Map<TileKey, unknown>;
  tileYieldByTile: Map<TileKey, unknown>;
  revealWatchersByTarget: Map<string, Set<string>>;
  observatoryTileKeysByPlayer: OwnedTileMap;
  economicStructureTileKeysByPlayer: OwnedTileMap;
  players: Map<string, Player>;
  BARBARIAN_OWNER_ID: string;
  TOWN_CAPTURE_SHOCK_MS: number;
  playerTile: (x: number, y: number) => Tile;
  runtimeTileCore: (x: number, y: number) => RuntimeTileCore;
  key: (x: number, y: number) => TileKey;
  parseKey: (tileKey: TileKey) => [number, number];
  now: () => number;
  cardinalNeighborCores: (x: number, y: number) => RuntimeTileCore[];
  adjacentNeighborCores: (x: number, y: number) => RuntimeTileCore[];
  removeBarbarianAtTile: (tileKey: TileKey) => void;
  clearPendingSettlement: (settlement: PendingSettlement) => void;
  refundPendingSettlement: (settlement: PendingSettlement) => void;
  sendToPlayer: (playerId: string, payload: unknown) => void;
  sendPlayerUpdate: (player: Player, options: number) => void;
  cancelFortBuild: (tileKey: TileKey) => void;
  cancelObservatoryBuild: (tileKey: TileKey) => void;
  cancelSiegeOutpostBuild: (tileKey: TileKey) => void;
  economicStructureBuildTimers: Map<TileKey, NodeJS.Timeout>;
  untrackOwnedTileKey: (map: OwnedTileMap, ownerId: string, tileKey: TileKey) => void;
  trackOwnedTileKey: (map: OwnedTileMap, ownerId: string, tileKey: TileKey) => void;
  markSummaryChunkDirtyAtTile: (x: number, y: number) => void;
  recordTileCaptureHistory: (tileKey: TileKey, oldOwner: string, newOwner: string) => void;
  applyTownCapturePopulationLoss: (town: TownDefinition) => void;
  applyTownCaptureShock: (tileKey: TileKey) => void;
  getOrInitResourceCounts: (playerId: string) => Record<string, number>;
  setClusterControlDelta: (playerId: string, clusterId: string, delta: number) => void;
  recomputeExposure: (player: Player) => void;
  recomputeTownNetworkForPlayer: (playerId: string) => void;
  reconcileCapitalForPlayer: (player: Player) => void;
  ensureFallbackSettlementForPlayer: (playerId: string) => void;
  rebuildEconomyIndexForPlayer: (playerId: string) => void;
  relocateCapturedSettlementForPlayer: (
    playerId: string,
    town: Pick<TownDefinition, "townId" | "type"> & { name?: string }
  ) => void;
  refreshVisibleOwnedTownsForPlayer: (playerId: string) => void;
  markAiTerritoryDirtyForPlayers: (playerIds: Set<string>) => void;
  refreshVisibleNearbyTownDeltas: (x: number, y: number) => void;
  markVisibilityDirtyForPlayers: (playerIds: Set<string>) => void;
  pushStrategicReplayEvent: (event: Omit<StrategicReplayEvent, "id">) => void;
  sendVisibleTileDeltaSquare: (x: number, y: number, radius: number) => void;
  recordHotPathTimingEvent: (name: string, payload: Record<string, unknown>, elapsedMs: number, thresholdMs: number) => void;
  recordServerDebugEvent: (level: "warn" | "info", name: string, payload: Record<string, unknown>) => void;
  runtimeWarn: (payload: Record<string, unknown>, message: string) => void;
  isRelocatableSettlementTown: (town: TownDefinition) => boolean;
  queueOfflineTownCaptureActivity: (oldOwnerId: string | undefined, newOwnerId: string | undefined, town: TownDefinition) => void;
  wakeOfflineEconomyForPlayer: (playerId: string | undefined) => void;
}

export interface ServerOwnershipRuntime {
  updateOwnership: (x: number, y: number, newOwner: string | undefined, newState?: OwnershipState) => void;
}

export const createServerOwnershipRuntime = (
  deps: CreateServerOwnershipRuntimeDeps
): ServerOwnershipRuntime => {
  const updateOwnership = (x: number, y: number, newOwner: string | undefined, newState?: OwnershipState): void => {
    const startedAt = deps.now();
    const tile = deps.playerTile(x, y);
    const oldOwner = tile.ownerId;
    const oldOwnershipState = tile.ownershipState;
    const tileKey = deps.key(tile.x, tile.y);
    const clusterId = tile.clusterId;
    let displacedSettlement: { ownerId: string; town: Pick<TownDefinition, "townId" | "type"> & { name?: string } } | undefined;
    const affectedPlayers = new Set<string>();
    if (oldOwner) affectedPlayers.add(oldOwner);
    if (newOwner) affectedPlayers.add(newOwner);
    for (const neighbor of deps.cardinalNeighborCores(tile.x, tile.y)) {
      if (neighbor.ownerId) affectedPlayers.add(neighbor.ownerId);
    }

    if (oldOwner && newOwner !== oldOwner) {
      deps.wakeOfflineEconomyForPlayer(oldOwner);
      const capturedTown = deps.townsByTile.get(tileKey);
      if (capturedTown) deps.queueOfflineTownCaptureActivity(oldOwner, newOwner, capturedTown);
      if (oldOwner !== deps.BARBARIAN_OWNER_ID && capturedTown && deps.isRelocatableSettlementTown(capturedTown)) {
        displacedSettlement = {
          ownerId: oldOwner,
          town: {
            townId: capturedTown.townId,
            type: capturedTown.type,
            ...(capturedTown.name !== undefined ? { name: capturedTown.name } : {})
          }
        };
        deps.townsByTile.delete(tileKey);
        deps.markSummaryChunkDirtyAtTile(tile.x, tile.y);
      }
      if (oldOwner === deps.BARBARIAN_OWNER_ID) deps.removeBarbarianAtTile(tileKey);
      const settlement = deps.pendingSettlementsByTile.get(tileKey);
      if (settlement) {
        deps.clearPendingSettlement(settlement);
        const player = deps.players.get(settlement.ownerId);
        if (!newOwner || newOwner === settlement.ownerId) {
          deps.refundPendingSettlement(settlement);
          if (player) {
            deps.sendToPlayer(player.id, { type: "ERROR", code: "SETTLE_INVALID", message: "settlement cancelled and gold returned", x: tile.x, y: tile.y });
            deps.sendPlayerUpdate(player, 0);
          }
        } else if (player) {
          deps.sendToPlayer(player.id, { type: "ERROR", code: "SETTLE_INVALID", message: "tile captured during settlement; gold forfeited", x: tile.x, y: tile.y });
          deps.sendPlayerUpdate(player, 0);
        }
      }
      const fort = deps.fortsByTile.get(tileKey);
      if (fort) {
        if (fort.status === "under_construction" || fort.status === "removing") {
          deps.cancelFortBuild(tileKey);
          deps.fortsByTile.delete(tileKey);
        } else if (newOwner) {
          fort.ownerId = newOwner;
          fort.disabledUntil = deps.now() + deps.TOWN_CAPTURE_SHOCK_MS;
          delete fort.completesAt;
          delete fort.previousStatus;
        } else {
          deps.fortsByTile.delete(tileKey);
        }
      }
      const observatory = deps.observatoriesByTile.get(tileKey);
      if (observatory) {
        if (observatory.status === "under_construction") deps.cancelObservatoryBuild(tileKey);
        else {
          deps.untrackOwnedTileKey(deps.observatoryTileKeysByPlayer, observatory.ownerId, tileKey);
          deps.observatoriesByTile.delete(tileKey);
        }
      }
      const economic = deps.economicStructuresByTile.get(tileKey);
      const siege = deps.siegeOutpostsByTile.get(tileKey);
      if (siege) {
        deps.cancelSiegeOutpostBuild(tileKey);
        deps.siegeOutpostsByTile.delete(tileKey);
      }
      deps.siphonByTile.delete(tileKey);
      deps.breachShockByTile.delete(tileKey);
      deps.settlementDefenseByTile.delete(tileKey);
      if (economic) {
        if (economic.status === "under_construction" || economic.status === "removing") {
          const timer = deps.economicStructureBuildTimers.get(tileKey);
          if (timer) clearTimeout(timer);
          deps.economicStructureBuildTimers.delete(tileKey);
          deps.untrackOwnedTileKey(deps.economicStructureTileKeysByPlayer, economic.ownerId, tileKey);
          deps.economicStructuresByTile.delete(tileKey);
          deps.markSummaryChunkDirtyAtTile(tile.x, tile.y);
        } else if (newOwner) {
          deps.untrackOwnedTileKey(deps.economicStructureTileKeysByPlayer, economic.ownerId, tileKey);
          economic.ownerId = newOwner;
          economic.status = "inactive";
          delete economic.completesAt;
          economic.disabledUntil = deps.now() + deps.TOWN_CAPTURE_SHOCK_MS;
          delete economic.inactiveReason;
          economic.nextUpkeepAt = economic.disabledUntil;
          deps.trackOwnedTileKey(deps.economicStructureTileKeysByPlayer, newOwner, tileKey);
        } else {
          deps.untrackOwnedTileKey(deps.economicStructureTileKeysByPlayer, economic.ownerId, tileKey);
          deps.economicStructuresByTile.delete(tileKey);
        }
      }
    }

    if (newOwner) {
      deps.ownership.set(tileKey, newOwner);
      const stateToSet =
        newState ??
        (newOwner === deps.BARBARIAN_OWNER_ID ? "BARBARIAN" : oldOwner === newOwner ? deps.ownershipStateByTile.get(tileKey) : "FRONTIER");
      deps.ownershipStateByTile.set(tileKey, stateToSet ?? (newOwner === deps.BARBARIAN_OWNER_ID ? "BARBARIAN" : "FRONTIER"));
    } else {
      deps.ownership.delete(tileKey);
      deps.ownershipStateByTile.delete(tileKey);
      const observatory = deps.observatoriesByTile.get(tileKey);
      if (observatory) {
        if (observatory.status === "under_construction") deps.cancelObservatoryBuild(tileKey);
        else {
          deps.untrackOwnedTileKey(deps.observatoryTileKeysByPlayer, observatory.ownerId, tileKey);
          deps.observatoriesByTile.delete(tileKey);
        }
      }
      const economic = deps.economicStructuresByTile.get(tileKey);
      if (economic) {
        if (economic.status === "under_construction" || economic.status === "removing") {
          const timer = deps.economicStructureBuildTimers.get(tileKey);
          if (timer) clearTimeout(timer);
          deps.economicStructureBuildTimers.delete(tileKey);
          deps.untrackOwnedTileKey(deps.economicStructureTileKeysByPlayer, economic.ownerId, tileKey);
          deps.economicStructuresByTile.delete(tileKey);
          deps.markSummaryChunkDirtyAtTile(tile.x, tile.y);
        } else {
          deps.untrackOwnedTileKey(deps.economicStructureTileKeysByPlayer, economic.ownerId, tileKey);
          deps.economicStructuresByTile.delete(tileKey);
        }
      }
      deps.siphonByTile.delete(tileKey);
      deps.breachShockByTile.delete(tileKey);
      deps.settlementDefenseByTile.delete(tileKey);
    }

    const finalState = deps.ownershipStateByTile.get(tileKey);
    if (newOwner && newOwner !== deps.BARBARIAN_OWNER_ID && finalState === "SETTLED") {
      if (!(oldOwner === newOwner && oldOwnershipState === "SETTLED")) deps.settledSinceByTile.set(tileKey, deps.now());
    } else {
      deps.settledSinceByTile.delete(tileKey);
    }
    if (oldOwner !== newOwner) {
      if (!newOwner) deps.tileYieldByTile.delete(tileKey);
      if (oldOwner && newOwner) deps.recordTileCaptureHistory(tileKey, oldOwner, newOwner);
      if (oldOwner && newOwner) {
        const capturedTown = deps.townsByTile.get(tileKey);
        if (capturedTown) {
          deps.applyTownCapturePopulationLoss(capturedTown);
          deps.applyTownCaptureShock(tileKey);
        }
      }
    }

    if (oldOwner) {
      const player = deps.players.get(oldOwner);
      if (player) {
        player.territoryTiles.delete(tileKey);
        if (tile.resource) deps.getOrInitResourceCounts(oldOwner)[tile.resource] = (deps.getOrInitResourceCounts(oldOwner)[tile.resource] ?? 0) - 1;
        if (clusterId) deps.setClusterControlDelta(oldOwner, clusterId, -1);
      }
    }
    if (newOwner) {
      const player = deps.players.get(newOwner);
      if (player) {
        player.territoryTiles.add(tileKey);
        if (tile.resource) deps.getOrInitResourceCounts(newOwner)[tile.resource] = (deps.getOrInitResourceCounts(newOwner)[tile.resource] ?? 0) + 1;
        if (clusterId) deps.setClusterControlDelta(newOwner, clusterId, 1);
      }
    }

    const affectedPlayerRefreshStartedAt = deps.now();
    for (const playerId of affectedPlayers) {
      const player = deps.players.get(playerId);
      if (!player) continue;
      deps.recomputeExposure(player);
      deps.recomputeTownNetworkForPlayer(playerId);
      deps.reconcileCapitalForPlayer(player);
      if (!displacedSettlement || displacedSettlement.ownerId !== playerId) deps.ensureFallbackSettlementForPlayer(playerId);
      deps.rebuildEconomyIndexForPlayer(playerId);
    }
    if (displacedSettlement) {
      deps.relocateCapturedSettlementForPlayer(displacedSettlement.ownerId, displacedSettlement.town);
      const displacedPlayer = deps.players.get(displacedSettlement.ownerId);
      if (displacedPlayer) {
        deps.ensureFallbackSettlementForPlayer(displacedPlayer.id);
        deps.rebuildEconomyIndexForPlayer(displacedPlayer.id);
      }
    }
    const affectedPlayerRefreshMs = deps.now() - affectedPlayerRefreshStartedAt;

    const visibilityRefreshStartedAt = deps.now();
    for (const playerId of affectedPlayers) deps.refreshVisibleOwnedTownsForPlayer(playerId);
    if (displacedSettlement) deps.refreshVisibleOwnedTownsForPlayer(displacedSettlement.ownerId);
    deps.markAiTerritoryDirtyForPlayers(affectedPlayers);
    const changedFoodTile = tile.resource === "FARM" || tile.resource === "FISH";
    const changedTownTile = deps.townsByTile.has(tileKey);
    const changedSupportAdjacency = deps.adjacentNeighborCores(tile.x, tile.y).some((neighbor) => deps.townsByTile.has(deps.key(neighbor.x, neighbor.y)));
    if (changedFoodTile || changedTownTile || changedSupportAdjacency) deps.refreshVisibleNearbyTownDeltas(tile.x, tile.y);
    const visibilityAffectedPlayers = new Set<string>();
    if (oldOwner) {
      visibilityAffectedPlayers.add(oldOwner);
      for (const allyId of deps.players.get(oldOwner)?.allies ?? []) visibilityAffectedPlayers.add(allyId);
      for (const watcherPlayerId of deps.revealWatchersByTarget.get(oldOwner) ?? []) visibilityAffectedPlayers.add(watcherPlayerId);
    }
    if (newOwner) {
      visibilityAffectedPlayers.add(newOwner);
      for (const allyId of deps.players.get(newOwner)?.allies ?? []) visibilityAffectedPlayers.add(allyId);
      for (const watcherPlayerId of deps.revealWatchersByTarget.get(newOwner) ?? []) visibilityAffectedPlayers.add(watcherPlayerId);
    }
    const visibilityRefreshMs = deps.now() - visibilityRefreshStartedAt;

    const snapshotInvalidationStartedAt = deps.now();
    deps.markVisibilityDirtyForPlayers(visibilityAffectedPlayers);
    deps.markSummaryChunkDirtyAtTile(tile.x, tile.y);
    const snapshotInvalidationMs = deps.now() - snapshotInvalidationStartedAt;

    if (oldOwner !== newOwner || oldOwnershipState !== tile.ownershipState) {
      const ownerName = tile.ownerId ? deps.players.get(tile.ownerId)?.name : undefined;
      const replayEvent: Omit<StrategicReplayEvent, "id"> = {
        at: deps.now(),
        type: "OWNERSHIP",
        label: tile.ownerId ? `${ownerName ?? tile.ownerId.slice(0, 8)} ${tile.ownershipState === "SETTLED" ? "settled" : "claimed"} (${tile.x}, ${tile.y})` : `Tile lost at (${tile.x}, ${tile.y})`,
        ownerId: tile.ownerId ?? null,
        ownershipState: tile.ownershipState ?? null,
        x: tile.x,
        y: tile.y,
        isBookmark: deps.townsByTile.has(tileKey) && oldOwner !== newOwner
      };
      if (tile.ownerId) replayEvent.playerId = tile.ownerId;
      if (ownerName) replayEvent.playerName = ownerName;
      deps.pushStrategicReplayEvent(replayEvent);
    }

    const tileDeltaFanoutStartedAt = deps.now();
    deps.sendVisibleTileDeltaSquare(tile.x, tile.y, 1);
    const tileDeltaFanoutMs = deps.now() - tileDeltaFanoutStartedAt;
    const elapsedMs = deps.now() - startedAt;
    const timingPayload = {
      tileKey,
      x: tile.x,
      y: tile.y,
      oldOwner,
      newOwner,
      oldOwnershipState,
      newOwnershipState: tile.ownershipState,
      affectedPlayers: [...affectedPlayers],
      affectedPlayerRefreshMs,
      visibilityRefreshMs,
      snapshotInvalidationMs,
      tileDeltaFanoutMs
    };
    deps.recordHotPathTimingEvent("update_ownership_timing", timingPayload, elapsedMs, 40);
    if (elapsedMs >= 40) {
      deps.recordServerDebugEvent("warn", "slow_update_ownership", { ...timingPayload, elapsedMs });
      deps.runtimeWarn({ ...timingPayload, elapsedMs }, "slow update ownership");
    }
  };

  return { updateOwnership };
};
