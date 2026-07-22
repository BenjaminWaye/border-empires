import type { ManpowerBreakdown, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainPlayer, DomainTileState, FrontierCommandType } from "@border-empires/game-domain";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { DockRouteDefinition } from "./dock-network/dock-network.js";
import type { SimulationSnapshotSections } from "./snapshot-store/snapshot-store.js";
import { TileDeltaStringifyCache } from "./tile-delta-stringify-cache/tile-delta-stringify-cache.js";
import type { LockRecord, StrategicResourceKey } from "./runtime-types.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import { cloneStrategicProduction, type PendingSettlementRecord } from "./player-runtime-summary.js";
import { visionRadiusBonusForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";
import type { Terrain } from "@border-empires/shared";
import type { PlannerPlayerView, PlannerTileView, PlannerWorldView } from "./ai/planner-world-view.js";
import type { PlannerOwnedStructureCounts } from "./ai/planner-owned-structure-counts.js";
import { buildPlannerTileSlice, toPlannerTileView } from "./ai/planner-world-view-slice.js";
import { selectExpansionObjective, type ExpansionObjective } from "./ai/ai-expansion-objective.js";
import { shouldYieldAt } from "./event-loop-yield.js";
import type { SnapshotExportInput } from "./runtime-snapshot-sections.js";

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
    musterJson?: string;
  }>;
  players: Array<{
    id: string;
    name?: string;
    points: number;
    manpower: number;
    manpowerCap?: number;
    manpowerRegenPerMinute?: number;
    logisticsThroughputPerMinute?: number;
    manpowerBreakdown?: ManpowerBreakdown;
    manpowerCapSnapshot?: number;
    techIds: string[];
    domainIds: string[];
    strategicResources: Partial<Record<StrategicResourceKey, number>>;
    allies: string[];
    truces: string[];
    vision: number;
    visionRadiusBonus: number;
    incomeMultiplier?: number;
    ownedTownTileKeys: string[];
    settledTileCount?: number;
    townCount?: number;
    incomePerMinute?: number;
    strategicProductionPerMinute?: Record<StrategicResourceKey, number>;
    activeDevelopmentProcessCount?: number;
    imperialWardCharges?: number;
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

// Lean row shape for the per-second metrics ticker (metrics-ai-player-state.ts).
// Deliberately not RuntimePlayerDebugSnapshot: that type's builder sorts
// techIds/domainIds/allies, clones strategicResources, and walks locksByTile
// for every player on every call — wasted work when only 4 numeric fields
// for AI players are needed once per second.
export type RuntimeAiPlayerMetricsRow = { id: string; isAi: boolean; points: number; incomePerMinute: number; settledTileCount: number; ownedTileCount: number };

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
  ownedTileCount: number;
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

type RuntimeExportInput = Omit<SnapshotExportInput, "recordedEventsByCommandId"> & {
  terrainEpoch: number;
  tileDeltaStringifyCache: TileDeltaStringifyCache;
  applyManpowerRegen: (player: DomainPlayer) => void;
  playerManpowerCap: (player: DomainPlayer) => number;
  playerManpowerRegenPerMinute: (player: DomainPlayer) => number;
  playerLogisticsThroughputPerMinute: (player: DomainPlayer) => number;
  playerManpowerBreakdown: (player: DomainPlayer) => ManpowerBreakdown;
  growthStalledNoFoodCounter: number;
};

const toRuntimeExportTile = (
  tile: DomainTileState,
  tileDeltaStringifyCache: TileDeltaStringifyCache
): RuntimeExportState["tiles"][number] => {
  const tileKey = simulationTileKey(tile.x, tile.y);
  const cached = tileDeltaStringifyCache.getOrComputeAll(tileKey, tile);
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
  if (cached.musterJson) entry.musterJson = cached.musterJson;
  return entry;
};

export const buildRuntimeExportPlayers = (input: RuntimeExportInput): RuntimeExportState["players"] =>
  [...input.players.values()]
    .map((player) => {
      // NOT swapped to refreshManpowerOnly, unlike the sibling planner-view
      // exports: verified (the hard way, via 3 failing tests) that this
      // function's full applyManpowerRegen call is relied on as one of the
      // "real" accrual catch-up paths — e.g. chosenTrickleResource /
      // gold-upkeep tests advance fake timers with NO other tick or command
      // in between and then call exportState() (which routes through this
      // function) expecting deferred accrual to have landed. Skipping accrual
      // here would silently break that guarantee for every caller, not just
      // tests. See visiblePlayersProjection in runtime-visible-state.ts for
      // where the equivalent skip *was* safe to apply (self keeps full
      // accrual there; only OTHER viewed players — who have their own command/
      // tick path — get the cheaper refresh).
      input.applyManpowerRegen(player);
      const summary = input.summaryForPlayer(player.id);
      return {
        id: player.id,
        ...(player.name ? { name: player.name } : {}),
        points: player.points,
        manpower: player.manpower,
        manpowerCap: input.playerManpowerCap(player),
        manpowerRegenPerMinute: input.playerManpowerRegenPerMinute(player),
        logisticsThroughputPerMinute: input.playerLogisticsThroughputPerMinute(player),
        manpowerBreakdown: input.playerManpowerBreakdown(player),
        ...(typeof player.manpowerCapSnapshot === "number" ? { manpowerCapSnapshot: player.manpowerCapSnapshot } : {}),
        techIds: [...player.techIds].sort(),
        domainIds: [...(player.domainIds ?? [])].sort(),
        strategicResources: { ...(player.strategicResources ?? {}) },
        allies: [...player.allies].sort(),
        truces: [...(player.truces ?? [])].sort(),
        vision: player.mods?.vision ?? 1,
        visionRadiusBonus: visionRadiusBonusForPlayer(player),
        incomeMultiplier: player.mods?.income ?? 1,
        ownedTownTileKeys: [...summary.ownedTownTierByTile.keys()],
        settledTileCount: summary.settledTileCount,
        townCount: summary.townCount,
        incomePerMinute: input.incomePerMinuteForPlayer(player.id),
        strategicProductionPerMinute: cloneStrategicProduction(summary.strategicProductionPerMinute),
        activeDevelopmentProcessCount: summary.activeDevelopmentProcessCount,
        ...(typeof player.imperialWardCharges === "number" ? { imperialWardCharges: player.imperialWardCharges } : {})
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

export function buildRuntimeExportState(input: RuntimeExportInput): RuntimeExportState {
  return {
    tiles: (() => {
      const result = new Array(input.tiles.size) as RuntimeExportState["tiles"];
      let i = 0;
      for (const tile of input.tiles.values()) {
        result[i] = toRuntimeExportTile(tile, input.tileDeltaStringifyCache);
        i += 1;
      }
      result.sort((left, right) => left.x - right.x || left.y - right.y);
      return result;
    })(),
    players: buildRuntimeExportPlayers(input),
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

export async function buildRuntimeExportStateAsync(
  input: RuntimeExportInput,
  yieldToEventLoop: () => Promise<void>
): Promise<RuntimeExportState> {
  const tiles = new Array(input.tiles.size) as RuntimeExportState["tiles"];
  let i = 0;
  for (const tile of input.tiles.values()) {
    if (shouldYieldAt(i, 2_000)) await yieldToEventLoop();
    tiles[i] = toRuntimeExportTile(tile, input.tileDeltaStringifyCache);
    i += 1;
  }
  await yieldToEventLoop();
  tiles.sort((left, right) => left.x - right.x || left.y - right.y);
  return {
    tiles,
    players: buildRuntimeExportPlayers(input),
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
        ownedTileCount: summary.territoryTileKeys.size,
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
  topologyVersion: number;
  topologyDirtyTileKeys: string[];
  territoryTileKeys: string[];
  frontierTileKeys: string[];
  hotFrontierTileKeys: string[];
  strategicFrontierTileKeys: string[];
  buildCandidateTileKeys: string[];
  pendingSettlementTileKeys: string[];
};

type ExpansionObjectiveCache = Map<string, { topologyVersion: number; beaconGeneration: number; objective: ExpansionObjective | undefined }>;

type PlannerExportInput = {
  playerIds: string[];
  tiles: ReadonlyMap<string, DomainTileState>;
  docks: readonly DockRouteDefinition[];
  players: ReadonlyMap<string, DomainPlayer>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  plannerGatingLockPlayerIds: () => Set<string>;
  refreshManpowerOnly: (player: DomainPlayer) => void;
  plannerPlayerTileKeys: (playerId: string, summary: PlayerRuntimeSummary) => PlannerTileKeys;
  ownedStructureCountsForPlayer: (playerId: string) => PlannerOwnedStructureCounts;
  estimatedIncomePerMinuteForPlayer: (playerId: string) => number;
  neutralBeaconTileKeys: ReadonlySet<string>;
  beaconGeneration: number;
  yieldBearingTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  expansionObjectiveCacheByPlayer: ExpansionObjectiveCache;
  musterTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
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
  const diagTotalStart = Date.now();
  // Per-player breakdown collected for slow-export diagnostic (threshold 200ms).
  const diagBreakdowns: string[] = [];
  for (const playerId of input.playerIds) {
    const player = input.players.get(playerId);
    if (!player) continue;
    const dt0 = Date.now();
    input.refreshManpowerOnly(player);
    const dt1 = Date.now();
    const summary = input.summaryForPlayer(playerId);
    const dt2 = Date.now();
    const tileKeys = input.plannerPlayerTileKeys(playerId, summary);
    const dt3 = Date.now();

    // Cache expansion objective keyed by (topologyVersion, beaconGeneration).
    // At steady state this is a pure integer compare — 0 work.
    const cached = input.expansionObjectiveCacheByPlayer.get(playerId);
    let expansionObjective: ExpansionObjective | undefined;
    let objectiveCacheHit = false;
    if (
      cached &&
      cached.topologyVersion === tileKeys.topologyVersion &&
      cached.beaconGeneration === input.beaconGeneration
    ) {
      expansionObjective = cached.objective;
      objectiveCacheHit = true;
    } else {
      expansionObjective = selectExpansionObjective({
        territoryTileKeys: summary.territoryTileKeys,
        neutralBeaconTileKeys: input.neutralBeaconTileKeys,
        enemyYieldKeysByPlayerId: input.yieldBearingTilesByOwner,
        playerId
      });
      input.expansionObjectiveCacheByPlayer.set(playerId, {
        topologyVersion: tileKeys.topologyVersion,
        beaconGeneration: input.beaconGeneration,
        objective: expansionObjective
      });
    }
    const dt4 = Date.now();
    diagBreakdowns.push(
      `${playerId}:refresh=${dt1 - dt0},summary=${dt2 - dt1},tileKeys=${dt3 - dt2},obj=${dt4 - dt3}(${objectiveCacheHit ? "hit" : "miss"}),tot=${dt4 - dt0}`
    );

    const ownedTileCount = tileKeys.territoryTileKeys.length;
    const frontierTileCount = tileKeys.frontierTileKeys.length;

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
      topologyVersion: tileKeys.topologyVersion,
      topologyDirtyTileKeys: tileKeys.topologyDirtyTileKeys,
      hasActiveLock: lockPlayerIds.has(player.id),
      territoryTileKeys: tileKeys.territoryTileKeys,
      frontierTileKeys: tileKeys.frontierTileKeys,
      hotFrontierTileKeys: tileKeys.hotFrontierTileKeys,
      strategicFrontierTileKeys: tileKeys.strategicFrontierTileKeys,
      buildCandidateTileKeys: tileKeys.buildCandidateTileKeys,
      pendingSettlementTileKeys: tileKeys.pendingSettlementTileKeys,
      // Small (tens of tiles), safe to spread fresh every sync unlike the
      // territory-sized key sets above, which is why this bypasses the
      // incremental planner-tile-keys-cache machinery entirely.
      townTileKeys: [...summary.ownedTownTierByTile.keys()],
      activeDevelopmentProcessCount: summary.activeDevelopmentProcessCount,
      ownedStructureCounts: input.ownedStructureCountsForPlayer(playerId),
      ...(expansionObjective ? { expansionObjective } : {}),
      activeMusterCount: input.musterTilesByOwner.get(playerId)?.size ?? 0,
      musterTileKeys: [...(input.musterTilesByOwner.get(playerId) ?? [])],
      ownedTileCount,
      frontierTileCount
    });
  }
  const diagTotalMs = Date.now() - diagTotalStart;
  if (diagTotalMs >= 200) {
    console.info(
      `[diag:sync_players_export] totalMs=${diagTotalMs} players=[ ${diagBreakdowns.join(" | ")} ]`
    );
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
