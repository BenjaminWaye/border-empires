import type { ManpowerBreakdown, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainPlayer, DomainTileState, FrontierCommandType } from "@border-empires/game-domain";
import { simulationTileKey } from "./seed-state.js";
import type { DockRouteDefinition } from "./dock-network.js";
import { buildSimulationSnapshotCommandEvents, type SimulationSnapshotSections } from "./snapshot-store.js";
import { TileDeltaStringifyCache } from "./tile-delta-stringify-cache.js";
import type { LockRecord, StrategicResourceKey } from "./runtime-types.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import { cloneStrategicProduction, type PendingSettlementRecord } from "./player-runtime-summary.js";
import { visionRadiusBonusForPlayer } from "./tech-domain-bridge.js";
import type { Terrain } from "@border-empires/shared";
import type { PlannerPlayerView, PlannerTileView, PlannerWorldView } from "./planner-world-view.js";
import { buildPlannerTileSlice, toPlannerTileView } from "./planner-world-view-slice.js";

export const plannerPlayerScopeKeyCount = (summary: PlayerRuntimeSummary): number => {
  const scopedKeys = new Set<string>();
  for (const key of summary.territoryTileKeys) scopedKeys.add(key);
  for (const key of summary.frontierTileKeys) scopedKeys.add(key);
  for (const key of summary.hotFrontierTileKeys) scopedKeys.add(key);
  for (const key of summary.strategicFrontierTileKeys) scopedKeys.add(key);
  for (const key of summary.buildCandidateTileKeys) scopedKeys.add(key);
  for (const key of summary.pendingSettlementsByTile.keys()) scopedKeys.add(key);
  return scopedKeys.size;
};

export type RuntimeExportState = {
  tiles: Array<{
    x: number;
    y: number;
    terrain: Terrain;
    resource?: string;
    dockId?: string;
    shardSiteJson?: string;
    ownerId?: string;
    ownershipState?: string;
    frontierDecayAt?: number;
    frontierDecayKind?: "NATURAL" | "ENCIRCLEMENT";
    townJson?: string;
    townType?: "MARKET" | "FARMING";
    townName?: string;
    townPopulationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
    fortJson?: string;
    observatoryJson?: string;
    siegeOutpostJson?: string;
    economicStructureJson?: string;
    sabotageJson?: string;
  }>;
  players: Array<{
    id: string;
    name?: string;
    points: number;
    manpower: number;
    manpowerCap?: number;
    manpowerRegenPerMinute?: number;
    manpowerBreakdown?: ManpowerBreakdown;
    manpowerCapSnapshot?: number;
    techIds: string[];
    domainIds: string[];
    strategicResources: Partial<Record<StrategicResourceKey, number>>;
    allies: string[];
    vision: number;
    visionRadiusBonus: number;
    incomeMultiplier?: number;
    ownedTownTileKeys: string[];
    settledTileCount?: number;
    townCount?: number;
    incomePerMinute?: number;
    strategicProductionPerMinute?: Record<StrategicResourceKey, number>;
    activeDevelopmentProcessCount?: number;
  }>;
  pendingSettlements: Array<PendingSettlementRecord>;
  activeLocks: Array<{
    commandId: string;
    playerId: string;
    actionType: FrontierCommandType;
    originKey: string;
    targetKey: string;
    resolvesAt: number;
    combatResolutionJson?: string;
  }>;
  docks: Array<{
    dockId: string;
    tileKey: string;
    pairedDockId: string;
    connectedDockIds?: readonly string[];
  }>;
  tileYieldCollectedAtByTile: Array<{ tileKey: string; collectedAt: number }>;
  playerYieldCollectionEpochByPlayer: Array<{ playerId: string; collectedAt: number }>;
  terrainEpoch: number;
  /** Cumulative count of town growth ticks skipped due to insufficient food. */
  growthStalledNoFoodCounter?: number;
};

export type RuntimePlayerDebugSnapshot = Array<{
  id: string;
  name?: string;
  isAi: boolean;
  points: number;
  manpower: number;
  manpowerCap: number;
  manpowerRegenPerMinute: number;
  techIds: string[];
  domainIds: string[];
  strategicResources: Partial<Record<StrategicResourceKey, number>>;
  settledTileCount: number;
  townCount: number;
  incomePerMinute: number;
  strategicProductionPerMinute: Record<StrategicResourceKey, number>;
  activeDevelopmentProcessCount: number;
  /** True iff a *player-issued* frontier lock would block the AI planner. */
  plannerBlocked: boolean;
  /** True iff any lock exists for this player (player-issued OR territory-automation). */
  hasAnyLock: boolean;
  allies: string[];
}>;

type SnapshotExportInput = {
  tiles: ReadonlyMap<string, DomainTileState>;
  locksByCommandId: ReadonlyMap<string, LockRecord>;
  players: ReadonlyMap<string, DomainPlayer>;
  pendingSettlementsByTile: ReadonlyMap<string, PendingSettlementRecord>;
  tileYieldCollectedAtByTile: ReadonlyMap<string, number>;
  playerYieldCollectionEpochByPlayer: ReadonlyMap<string, number>;
  collectVisibleCooldownByPlayer: ReadonlyMap<string, number>;
  docks: readonly DockRouteDefinition[];
  recordedEventsByCommandId: ReadonlyMap<string, SimulationEvent[]>;
  incomePerMinuteForPlayer: (playerId: string) => number;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
};

export function buildRuntimeSnapshotSections(input: SnapshotExportInput): SimulationSnapshotSections {
  return {
    initialState: {
      tiles: [...input.tiles.values()]
        .map((tile) => ({
          x: tile.x,
          y: tile.y,
          terrain: tile.terrain,
          ...(tile.resource ? { resource: tile.resource } : {}),
          ...(tile.dockId ? { dockId: tile.dockId } : {}),
          ...(tile.shardSite ? { shardSite: tile.shardSite } : {}),
          ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
          ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
          ...(typeof tile.frontierDecayAt === "number" ? { frontierDecayAt: tile.frontierDecayAt } : {}),
          ...(tile.frontierDecayKind ? { frontierDecayKind: tile.frontierDecayKind } : {}),
          ...(tile.town ? { town: tile.town } : {}),
          ...(tile.fort ? { fort: tile.fort } : {}),
          ...(tile.observatory ? { observatory: tile.observatory } : {}),
          ...(tile.siegeOutpost ? { siegeOutpost: tile.siegeOutpost } : {}),
          ...(tile.economicStructure ? { economicStructure: tile.economicStructure } : {}),
          ...(tile.sabotage ? { sabotage: tile.sabotage } : {})
        }))
        .sort((left, right) => left.x - right.x || left.y - right.y),
      activeLocks: [...input.locksByCommandId.values()]
        .map((lock) => ({
          commandId: lock.commandId,
          playerId: lock.playerId,
          actionType: lock.actionType,
          originX: lock.originX,
          originY: lock.originY,
          targetX: lock.targetX,
          targetY: lock.targetY,
          originKey: lock.originKey,
          targetKey: lock.targetKey,
          resolvesAt: lock.resolvesAt,
          ...(lock.combatResolution ? { combatResolutionJson: JSON.stringify(lock.combatResolution) } : {})
        }))
        .sort((left, right) => left.commandId.localeCompare(right.commandId)),
      players: [...input.players.values()]
        .map((player) => ({
          id: player.id,
          ...(player.name ? { name: player.name } : {}),
          isAi: player.isAi,
          points: player.points,
          manpower: player.manpower,
          ...(typeof player.manpowerUpdatedAt === "number" ? { manpowerUpdatedAt: player.manpowerUpdatedAt } : {}),
          ...(typeof player.manpowerCapSnapshot === "number" ? { manpowerCapSnapshot: player.manpowerCapSnapshot } : {}),
          techIds: [...player.techIds].sort(),
          domainIds: [...(player.domainIds ?? [])].sort(),
          ...(player.chosenTrickleResource ? { chosenTrickleResource: player.chosenTrickleResource } : {}),
          strategicResources: { ...(player.strategicResources ?? {}) },
          allies: [...player.allies].sort(),
          vision: player.mods?.vision ?? 1,
          visionRadiusBonus: visionRadiusBonusForPlayer(player),
          incomeMultiplier: player.mods?.income ?? 1,
          incomePerMinute: input.incomePerMinuteForPlayer(player.id),
          ownedTownTileKeys: [...input.summaryForPlayer(player.id).ownedTownTierByTile.keys()]
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      pendingSettlements: sortedPendingSettlements(input.pendingSettlementsByTile),
      tileYieldCollectedAtByTile: sortedCollectionEpochs(input.tileYieldCollectedAtByTile, "tileKey"),
      playerYieldCollectionEpochByPlayer: sortedCollectionEpochs(input.playerYieldCollectionEpochByPlayer, "playerId"),
      collectVisibleCooldownByPlayer: [...input.collectVisibleCooldownByPlayer.entries()]
        .map(([playerId, cooldownUntil]) => ({ playerId, cooldownUntil }))
        .sort((left, right) => left.playerId.localeCompare(right.playerId)),
      ...(input.docks.length
        ? {
            docks: input.docks.map((dock) => ({
              dockId: dock.dockId,
              tileKey: dock.tileKey,
              pairedDockId: dock.pairedDockId,
              ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {})
            }))
          }
        : {})
    },
    commandEvents: buildSimulationSnapshotCommandEvents(input.recordedEventsByCommandId)
  };
}

type RuntimeExportInput = Omit<SnapshotExportInput, "collectVisibleCooldownByPlayer" | "recordedEventsByCommandId"> & {
  terrainEpoch: number;
  tileDeltaStringifyCache: TileDeltaStringifyCache;
  applyManpowerRegen: (player: DomainPlayer) => void;
  playerManpowerCap: (player: DomainPlayer) => number;
  playerManpowerRegenPerMinute: (player: DomainPlayer) => number;
  playerManpowerBreakdown: (player: DomainPlayer) => ManpowerBreakdown;
  growthStalledNoFoodCounter: number;
};

export function buildRuntimeExportState(input: RuntimeExportInput): RuntimeExportState {
  return {
    tiles: (() => {
      const result = new Array(input.tiles.size) as RuntimeExportState["tiles"];
      let i = 0;
      for (const tile of input.tiles.values()) {
        const tileKey = simulationTileKey(tile.x, tile.y);
        const cached = input.tileDeltaStringifyCache.getOrComputeAll(tileKey, tile);
        const entry: RuntimeExportState["tiles"][number] = {
          x: tile.x,
          y: tile.y,
          terrain: tile.terrain
        };
        if (tile.resource) entry.resource = tile.resource;
        if (tile.dockId) entry.dockId = tile.dockId;
        if (cached.shardSiteJson) entry.shardSiteJson = cached.shardSiteJson;
        if (tile.ownerId) entry.ownerId = tile.ownerId;
        if (tile.ownershipState) entry.ownershipState = tile.ownershipState;
        if (typeof tile.frontierDecayAt === "number") entry.frontierDecayAt = tile.frontierDecayAt;
        if (tile.frontierDecayKind) entry.frontierDecayKind = tile.frontierDecayKind;
        if (cached.townJson) entry.townJson = cached.townJson;
        if (tile.town?.type) entry.townType = tile.town.type;
        if (tile.town?.name) entry.townName = tile.town.name;
        if (tile.town?.populationTier) entry.townPopulationTier = tile.town.populationTier;
        if (cached.fortJson) entry.fortJson = cached.fortJson;
        if (cached.observatoryJson) entry.observatoryJson = cached.observatoryJson;
        if (cached.siegeOutpostJson) entry.siegeOutpostJson = cached.siegeOutpostJson;
        if (cached.economicStructureJson) entry.economicStructureJson = cached.economicStructureJson;
        if (cached.sabotageJson) entry.sabotageJson = cached.sabotageJson;
        result[i] = entry;
        i += 1;
      }
      result.sort((left, right) => left.x - right.x || left.y - right.y);
      return result;
    })(),
    players: [...input.players.values()]
      .map((player) => {
        input.applyManpowerRegen(player);
        const summary = input.summaryForPlayer(player.id);
        return {
          id: player.id,
          ...(player.name ? { name: player.name } : {}),
          points: player.points,
          manpower: player.manpower,
          manpowerCap: input.playerManpowerCap(player),
          manpowerRegenPerMinute: input.playerManpowerRegenPerMinute(player),
          manpowerBreakdown: input.playerManpowerBreakdown(player),
          ...(typeof player.manpowerCapSnapshot === "number" ? { manpowerCapSnapshot: player.manpowerCapSnapshot } : {}),
          techIds: [...player.techIds].sort(),
          domainIds: [...(player.domainIds ?? [])].sort(),
          strategicResources: { ...(player.strategicResources ?? {}) },
          allies: [...player.allies].sort(),
          vision: player.mods?.vision ?? 1,
          visionRadiusBonus: visionRadiusBonusForPlayer(player),
          incomeMultiplier: player.mods?.income ?? 1,
          ownedTownTileKeys: [...summary.ownedTownTierByTile.keys()],
          settledTileCount: summary.settledTileCount,
          townCount: summary.townCount,
          incomePerMinute: input.incomePerMinuteForPlayer(player.id),
          strategicProductionPerMinute: cloneStrategicProduction(summary.strategicProductionPerMinute),
          activeDevelopmentProcessCount: summary.activeDevelopmentProcessCount
        };
      })
      .sort((left, right) => left.id.localeCompare(right.id)),
    pendingSettlements: sortedPendingSettlements(input.pendingSettlementsByTile),
    activeLocks: [...input.locksByCommandId.values()]
      .map((lock) => ({
        commandId: lock.commandId,
        playerId: lock.playerId,
        actionType: lock.actionType,
        originKey: lock.originKey,
        targetKey: lock.targetKey,
        resolvesAt: lock.resolvesAt,
        ...(lock.combatResolution ? { combatResolutionJson: JSON.stringify(lock.combatResolution) } : {})
      }))
      .sort((left, right) => left.commandId.localeCompare(right.commandId)),
    docks: input.docks.map((dock) => ({ ...dock, ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {}) })),
    tileYieldCollectedAtByTile: sortedCollectionEpochs(input.tileYieldCollectedAtByTile, "tileKey"),
    playerYieldCollectionEpochByPlayer: sortedCollectionEpochs(input.playerYieldCollectionEpochByPlayer, "playerId"),
    terrainEpoch: input.terrainEpoch,
    growthStalledNoFoodCounter: input.growthStalledNoFoodCounter
  };
}

type PlayerDebugInput = {
  locksByTile: ReadonlyMap<string, LockRecord>;
  players: ReadonlyMap<string, DomainPlayer>;
  refreshManpowerOnly: (player: DomainPlayer) => void;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  playerManpowerCap: (player: DomainPlayer) => number;
  playerManpowerRegenPerMinute: (player: DomainPlayer) => number;
  estimatedIncomePerMinuteForPlayer: (playerId: string) => number;
};

export function buildRuntimePlayerDebugSnapshot(input: PlayerDebugInput): RuntimePlayerDebugSnapshot {
  const plannerBlockedIds = new Set<string>();
  const anyLockIds = new Set<string>();
  for (const lock of input.locksByTile.values()) {
    anyLockIds.add(lock.playerId);
    if (lock.source !== "automation") plannerBlockedIds.add(lock.playerId);
  }
  return [...input.players.values()]
    .map((player) => {
      input.refreshManpowerOnly(player);
      const summary = input.summaryForPlayer(player.id);
      return {
        id: player.id,
        ...(player.name ? { name: player.name } : {}),
        isAi: player.isAi === true,
        points: player.points,
        manpower: player.manpower,
        manpowerCap: input.playerManpowerCap(player),
        manpowerRegenPerMinute: input.playerManpowerRegenPerMinute(player),
        techIds: [...player.techIds].sort(),
        domainIds: [...(player.domainIds ?? [])].sort(),
        strategicResources: { ...(player.strategicResources ?? {}) },
        settledTileCount: summary.settledTileCount,
        townCount: summary.townCount,
        incomePerMinute: input.estimatedIncomePerMinuteForPlayer(player.id),
        strategicProductionPerMinute: cloneStrategicProduction(summary.strategicProductionPerMinute),
        activeDevelopmentProcessCount: summary.activeDevelopmentProcessCount,
        plannerBlocked: plannerBlockedIds.has(player.id),
        hasAnyLock: anyLockIds.has(player.id),
        allies: [...player.allies].sort()
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

type PlannerTileKeys = {
  tileCollectionVersion: number;
  territoryTileKeys: string[];
  frontierTileKeys: string[];
  hotFrontierTileKeys: string[];
  strategicFrontierTileKeys: string[];
  buildCandidateTileKeys: string[];
  pendingSettlementTileKeys: string[];
};

type PlannerExportInput = {
  playerIds: string[];
  tiles: ReadonlyMap<string, DomainTileState>;
  docks: readonly DockRouteDefinition[];
  players: ReadonlyMap<string, DomainPlayer>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  plannerGatingLockPlayerIds: () => Set<string>;
  refreshManpowerOnly: (player: DomainPlayer) => void;
  plannerPlayerTileKeys: (playerId: string, summary: PlayerRuntimeSummary) => PlannerTileKeys;
  estimatedIncomePerMinuteForPlayer: (playerId: string) => number;
};

export function buildRuntimePlannerWorldView(input: PlannerExportInput): PlannerWorldView {
  return {
    tiles: buildPlannerTileSlice({
      playerIds: input.playerIds,
      tiles: input.tiles,
      docks: input.docks,
      summaryForPlayer: input.summaryForPlayer
    }),
    players: buildRuntimePlannerPlayerViews(input),
    docks: input.docks.map((dock) => ({ ...dock, ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {}) }))
  };
}

export function buildRuntimePlannerPlayerViews(input: PlannerExportInput): PlannerPlayerView[] {
  const lockPlayerIds = input.plannerGatingLockPlayerIds();
  const players: PlannerPlayerView[] = [];
  for (const playerId of input.playerIds) {
    const player = input.players.get(playerId);
    if (!player) continue;
    input.refreshManpowerOnly(player);
    const summary = input.summaryForPlayer(playerId);
    const tileKeys = input.plannerPlayerTileKeys(playerId, summary);
    players.push({
      id: player.id,
      points: player.points,
      manpower: player.manpower,
      techIds: [...player.techIds].sort(),
      domainIds: [...(player.domainIds ?? [])].sort(),
      strategicResources: { ...(player.strategicResources ?? {}) },
      settledTileCount: summary.settledTileCount,
      townCount: summary.townCount,
      incomePerMinute: input.estimatedIncomePerMinuteForPlayer(playerId),
      tileCollectionVersion: tileKeys.tileCollectionVersion,
      hasActiveLock: lockPlayerIds.has(player.id),
      territoryTileKeys: tileKeys.territoryTileKeys,
      frontierTileKeys: tileKeys.frontierTileKeys,
      hotFrontierTileKeys: tileKeys.hotFrontierTileKeys,
      strategicFrontierTileKeys: tileKeys.strategicFrontierTileKeys,
      buildCandidateTileKeys: tileKeys.buildCandidateTileKeys,
      pendingSettlementTileKeys: tileKeys.pendingSettlementTileKeys,
      activeDevelopmentProcessCount: summary.activeDevelopmentProcessCount
    });
  }
  return players;
}

export function exportPlannerTilesForKeys(tiles: ReadonlyMap<string, DomainTileState>, tileKeys: Iterable<string>): PlannerTileView[] {
  const result: PlannerTileView[] = [];
  for (const tileKey of tileKeys) {
    const tile = tiles.get(tileKey);
    if (tile) result.push(toPlannerTileView(tile));
  }
  return result;
}

function sortedPendingSettlements(pendingSettlementsByTile: ReadonlyMap<string, PendingSettlementRecord>): PendingSettlementRecord[] {
  return [...pendingSettlementsByTile.values()]
    .map((settlement) => ({ ...settlement }))
    .sort((left, right) => left.tileKey.localeCompare(right.tileKey));
}

function sortedCollectionEpochs<Key extends "tileKey" | "playerId">(
  collection: ReadonlyMap<string, number>,
  key: Key
): Array<Record<Key, string> & { collectedAt: number }> {
  return [...collection.entries()]
    .map(([id, collectedAt]) => ({ [key]: id, collectedAt }) as Record<Key, string> & { collectedAt: number })
    .sort((left, right) => left[key].localeCompare(right[key]));
}
