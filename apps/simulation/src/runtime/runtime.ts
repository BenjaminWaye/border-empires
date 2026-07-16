import { EventEmitter } from "node:events";
import type { CommandEnvelope, ManpowerBreakdown, SimulationEvent } from "@border-empires/sim-protocol";
import type { PlayerRespawnNotice, PlayerRespawnReasonCode } from "@border-empires/shared";
import {
  type PendingRespawnNoticeContext
} from "../player-respawn-notice.js";
import { CommandDeltaBuffer } from "../runtime-delta-buffer.js";
import {
  type DomainPlayer,
  type DomainTileState,
  type FrontierCommandType
} from "@border-empires/game-domain";
import {
  ATTACK_MANPOWER_MIN,
  BARBARIAN_RAID_COST,
  BREAKTHROUGH_ENABLED,
  EMPIRE_INTEGRITY_ENABLED,
  empireIntegrity,
  integrityEconomyMult,
  integrityGrowthMult,
  MUSTER_ATTACK_COST,
  FORT_GARRISON_ATTRITION_MIN,
  FORT_GARRISON_ATTRITION_MAX,
  DEVELOPMENT_PROCESS_LIMIT,
  FRONTIER_ATTACK_MUSTER_COST, FRONTIER_CLAIM_COST,
  SETTLE_COST,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type Terrain,
  type BuildableStructureType,
  type EconomicStructureType
} from "@border-empires/shared";
import {
  ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS,
  CRYSTAL_SYNTHESIZER_OVERLOAD_CRYSTAL,
  FUR_SYNTHESIZER_OVERLOAD_SUPPLY,
  IRONWORKS_OVERLOAD_IRON,
  SYNTH_OVERLOAD_DISABLE_MS,
  SYNTH_OVERLOAD_GOLD_COST
} from "@border-empires/game-domain";
import {
  DEFAULT_MAX_PLAYER_SEQ_REPLAY_ENTRIES,
  DEFAULT_MAX_TERMINAL_COMMAND_REPLAY_HISTORY
} from "../command-event-lifecycle.js";
import { laneForCommand, type QueueLane } from "../command-lane/command-lane.js";
import {
  commandScheduling,
  dispatchRuntimeCommand,
  type RuntimeCommandDispatchHandlers
} from "../runtime-command-dispatch.js";

import {
  buildDockLinksByDockTileKey,
  computeLinkedDockRevealTileKeys,
  isValidDockCrossingTarget,
  type DockRouteDefinition
} from "../dock-network/dock-network.js";
import { chooseNextOwnedFrontierCommandFromLookup } from "../ai/frontier-command-planner.js";
import { forEachFrontierNeighbor } from "../frontier-topology.js";
import {
  isSettledTownAnchor,
  orderedAutoSettlementTileKeys,
  TOWN_AUTO_FRONTIER_RADIUS
} from "../territory-automation/territory-automation.js";
import { buildPlayerDefensibilityMetrics } from "../player-defensibility-metrics.js";
import {
  addPendingSettlementToSummary,
  applyTileToPlayerSummary,
  createEmptyPlayerRuntimeSummary,
  removePendingSettlementFromSummary,
  removeTileFromPlayerSummary,
  type PendingSettlementRecord,
  type PlayerRuntimeSummary
} from "../player-runtime-summary.js";
import {
  buildFedTownKeys,
  buildPlayerUpdateEconomySnapshot,
  buildStrategicProductionForSettledTiles,
  refreshTownEconomyFields,
  type PlayerUpdateEconomySnapshot
} from "../player-update-economy/player-update-economy.js";
import {
  buildUpkeepAccrualSnapshot,
  type UpkeepAccrualSnapshot
} from "../player-upkeep-incremental/player-upkeep-incremental.js";
import { buildConnectedTownNetworkForPlayer, enrichTownWithConnectedNetwork, firstThreeTownKeysForPlayer, firstThreeTownsGoldOutputMultiplierForPlayer, type ConnectedTownNetworkEntry } from "../economy-network/economy-network.js";
import { createSeedWorld, simulationTileKey } from "../seed-state/seed-state.js";
import type { SimulationSnapshotSections } from "../snapshot-store/snapshot-store.js";
import {
  additiveEffectForPlayer, buildModBreakdownForPlayer,
  effectiveVisionRadiusForPlayer,
  recomputeMods
} from "../tech-domain-bridge/tech-domain-bridge.js";
import {
  filterTileDeltasForPlayer as filterTileDeltasForPlayerImpl,
  type TileDeltaVisibilityFilterOptions, type VisibilityAuditSample
} from "../tile-delta-visibility-filter.js";
import { buildTileYieldView, radiusStructureKeysForSettledTiles, tileYieldNeedsServerAuthority } from "../tile-yield-view/tile-yield-view.js";
import { flushRadiusYieldRefresh } from "../radius-yield-refresh/radius-yield-refresh.js";
import { VisionExpansionCache } from "../vision-expansion-cache.js";
import { VisibilityCoverageTracker } from "../visibility-coverage-cache.js";
import { VisionTransitionAccumulator } from "../runtime-vision-transition.js";
import type { PlannerPlayerView, PlannerTileView, PlannerWorldView } from "../ai/planner-world-view.js";
import type { ExpansionObjective } from "../ai/ai-expansion-objective.js";
import {
  incrementalAdd,
  incrementalRemove,
  plannerPlayerTileKeys as plannerPlayerTileKeysImpl,
  resetFromIterable,
  type PlannerPlayerTileKeysContext,
  type PlannerPlayerTileKeysResult,
  type PlannerTileKeysCacheEntry
} from "../planner-tile-keys-cache.js";
import {
  createAutomationNoopDiagnostic,
  planAutomationCommand,
  type AutomationPlannerDiagnostic
} from "../ai/automation-command-planner.js";
import { chooseAutomationPreplanCommand } from "../ai/ai-preplan-command.js";
import { mergePreplanDiagnostic } from "./merge-preplan-diagnostic.js";
import type { DecisionCooldownMap } from "../ai/ai-rejection-cooldown.js";
import type { AutomationVictoryPath } from "../ai/automation-strategic-snapshot.js";
import {
  AI_SPATIAL_FOCUS_EXPIRY_JITTER_MS,
  selectSpatialFocus,
  type AiSpatialFocus
} from "../ai/ai-spatial-focus.js";
import {
  InMemorySimulationPersistence,
  TERRITORY_AUTO_COMMAND_PREFIX,
  type ActiveAetherBridgeView,
  type ActiveAetherWallView,
  type AetherWallDirection,
  type LockRecord,
  type LockedCombatResolution,
  type RuntimePlayer,
  type RuntimeTileYieldEconomyContext,
  type SimulationJob,
  type SimulationPersistence,
  type SimulationRuntimeOptions,
  type SimulationTileWireDelta,
  type StrategicResourceKey
} from "../runtime-types.js";
import {
  applyEconomyAccrual as applyEconomyAccrualImpl,
  type RuntimeUpkeepAccrualContext
} from "../runtime-upkeep-accrual.js";
import {
  drainQueues as drainQueuesImpl,
  enqueueJob as enqueueJobImpl,
  scheduleDrain as scheduleDrainImpl,
  type RuntimeJobQueueContext,
  type RuntimeJobQueueMutableState
} from "../runtime-job-queue.js";
import { computeQueueBacklogMs, computeQueueDepths } from "../runtime-queue-metrics.js";
import { tileDeltaRevealOnly as tileDeltaRevealOnlyImpl } from "../tile-delta-reveal-only.js";
import {
  parseAllianceSyncPayload,
  parseConverterTogglePayload,
  parseSettlePayload,
  parseStructureTilePayload,
  parseTilePayload
} from "../runtime-command-parsers.js";
import {
  createDocksFromInitialState,
  createLocksFromInitialState,
  createPlayersFromRecoveredState,
  createTilesFromInitialState,
  hydrateCommandHistory,
  requeueRecoveredCommands,
  uniqueLocksByCommandId
} from "../runtime-hydration.js";
import { TileDeltaStringifyCache } from "../tile-delta-stringify-cache/tile-delta-stringify-cache.js";
import { PlayerCandidateIndex } from "../player-candidate-index/player-candidate-index.js";
import {
  settlementBaseDurationMsForTile,
  settlementDurationMsForPlayer
} from "../runtime-settlement-rules.js";
import {
  economicStructureGoldUpkeepPerInterval,
  isConverterStructureType
} from "../runtime-structure-rules/runtime-structure-rules.js";
import {
  applyBarbarianWalkOrMultiply as applyBarbarianWalkOrMultiplyImpl,
  applyBreachToNeighbors as applyBreachToNeighborsImpl,
  applyLockedManpowerDelta as applyLockedManpowerDeltaImpl,
  applySettledCapturePlunder as applySettledCapturePlunderImpl,
  attackManpowerLoss as attackManpowerLossImpl,
  buildCaptureRevealTileDeltas as buildCaptureRevealTileDeltasImpl, buildAutoFillRevealTileDeltas as buildAutoFillRevealTileDeltasImpl,
  buildLockedCombatResolution as buildLockedCombatResolutionImpl,
  handleCancelCaptureCommand as handleCancelCaptureCommandImpl,
  plannerGatingLockPlayerIds as plannerGatingLockPlayerIdsImpl,
  settleAttackManpower as settleAttackManpowerImpl,
  type LockedCombatInput,
  type RuntimeCombatSupportContext
} from "../runtime-combat-support.js";
import { applyAutoFill as applyAutoFillImpl } from "../runtime-auto-fill.js";
import {
  effectiveManpowerAt,
  playerManpowerBreakdownFromSummary,
  playerManpowerCapFromSummary,
  playerManpowerRegenPerMinuteFromSummary
} from "../runtime-manpower.js";
import {
  resolveMusterSource as resolveMusterSourceImpl,
  type RuntimeMusterSourceContext
} from "../runtime-muster-source.js";
import {
  buildRuntimeExportPlayers,
  buildRuntimeExportState,
  buildRuntimeExportStateAsync,
  buildRuntimePlannerPlayerViews,
  buildRuntimePlannerWorldView,
  buildRuntimePlayerDebugSnapshot,
  exportPlannerTilesForKeys,
  plannerPlayerScopeKeyCount,
  type RuntimeExportState,
  type RuntimePlayerDebugSnapshot
} from "../runtime-state-export.js";
import {
  buildRuntimeSnapshotSections,
  buildRuntimeSnapshotSectionsAsync,
  mapTile,
  type SnapshotTile
} from "../runtime-snapshot-sections.js";
import {
  emitVisibilityAudit as emitVisibilityAuditImpl,
  exportBarbActivationVisibleUnion as exportBarbActivationVisibleUnionImpl,
  exportTilesInAreaForPlayer as exportTilesInAreaForPlayerImpl,
  exportVisibleStateForPlayer as exportVisibleStateForPlayerImpl,
  exportVisibleStateForPlayerAsync as exportVisibleStateForPlayerAsyncImpl,
  getBarbActivationVisionSignature as getBarbActivationVisionSignatureImpl,
  type BarbActivationVisibilityCache
} from "../runtime-visible-state.js";
import { RuntimeReplayCache } from "../runtime-replay-cache.js";
import {
  classifyVisibilityForPlayer as classifyVisibilityForPlayerImpl,
  type RuntimeVisibilityClassification
} from "../runtime-visibility-classifier.js";
import {
  repairZeroGrossIncomeSettlements as repairZeroGrossIncomeSettlementsImpl,
  type GrossIncomeRepairResult
} from "../runtime-gross-income-repair.js";
import {
  activeAetherBridgesForPlayer as activeAetherBridgesForPlayerImpl,
  activeAetherWallsForPlayer as activeAetherWallsForPlayerImpl,
  buildRevealEmpireStatsFromSummary,
  closestAetherBridgeOrigin as closestAetherBridgeOriginImpl,
  crossingBlockedByAetherWall as crossingBlockedByAetherWallImpl,
  getAbilityCooldownUntil as getAbilityCooldownUntilImpl,
  isCoastalLand as isCoastalLandImpl,
  isStructurePowered as isStructurePoweredImpl,
  ASTRAL_DOCK_LAUNCH_ACTIVE_UNTIL_KEY,
  isTileBombardBlockedByRadar as isTileBombardBlockedByRadarImpl,
  isTileShieldedByAegisLock as isTileShieldedByAegisLockImpl,
  isTileShieldedByEnemyAegisDome as isTileShieldedByEnemyAegisDomeImpl,
  isTileWardedByImperialWard as isTileWardedByImperialWardImpl,
  observatoryCastRadiusFor as observatoryCastRadiusForImpl,
  ownedLandWithinRange as ownedLandWithinRangeImpl,
  pickReadyOwnedObservatoryAny as pickReadyOwnedObservatoryAnyImpl,
  pickReadyOwnedObservatoryForTarget as pickReadyOwnedObservatoryForTargetImpl,
  revealCapacityForPlayer as revealCapacityForPlayerImpl,
  setAbilityCooldownUntil as setAbilityCooldownUntilImpl,
  wallSegments as wallSegmentsImpl,
  type AetherWallSegment
} from "../runtime-ability-helpers.js";
import {
  handleAetherLanceCommand as handleAetherLanceCommandImpl,
  handleCastAetherBridgeCommand as handleCastAetherBridgeCommandImpl,
  handleCastAetherWallCommand as handleCastAetherWallCommandImpl,
  handlePurgeSiphonCommand as handlePurgeSiphonCommandImpl,
  handleRevealEmpireCommand as handleRevealEmpireCommandImpl,
  handleRevealEmpireStatsCommand as handleRevealEmpireStatsCommandImpl,
  handleSurveySweepCommand as handleSurveySweepCommandImpl,
  type RuntimeAbilityCommandContext
} from "../runtime-ability-command-handlers.js";
import { handleSiphonTileCommand as handleSiphonTileCommandImpl } from "../runtime-siphon-command-handlers.js"; import { handleSyncTruceCommand as handleSyncTruceCommandImpl } from "../runtime-truce-sync-command.js";
import {
  handleAegisLockCommand as handleAegisLockCommandImpl,
  handleAirportBombardCommand as handleAirportBombardCommandImpl,
  handleAstralDockLaunchCommand as handleAstralDockLaunchCommandImpl,
  handleCreateMountainCommand as handleCreateMountainCommandImpl,
  handleImperialExchangeLevyCommand as handleImperialExchangeLevyCommandImpl,
  handleRemoveMountainCommand as handleRemoveMountainCommandImpl,
  handleWorldEngineStrikeCommand as handleWorldEngineStrikeCommandImpl,
  type RuntimeMapCommandContext
} from "../runtime-map-command-handlers.js";
import { handleActivateImperialWardCommand as handleActivateImperialWardCommandImpl } from "../runtime-imperial-ward-command-handler.js";
import {
  handleChooseDomainCommand as handleChooseDomainCommandImpl,
  handleChooseTechCommand as handleChooseTechCommandImpl,
  handleCollectShardCommand as handleCollectShardCommandImpl,
  handleUpgradeTownTierCommand as handleUpgradeTownTierCommandImpl,
  type RuntimeProgressionCommandContext
} from "../runtime-progression-command-handlers.js";
import {
  adjustOwnedStructureCount as adjustOwnedStructureCountImpl,
  ownedStructureCountForPlayer as ownedStructureCountForPlayerImpl,
  ownedStructureCountsForPlayer as ownedStructureCountsForPlayerImpl,
  refreshOwnedStructureCountIndexForTile as refreshOwnedStructureCountIndexForTileImpl
} from "../runtime-owned-structure-index.js";
import {
  assignedTownKeyForSupportTile as assignedTownKeyForSupportTileImpl,
  economicStructureForSupportedTown as economicStructureForSupportedTownImpl,
  firstAvailableTownSupportTile as firstAvailableTownSupportTileImpl,
  supportedDockKeysForTile as supportedDockKeysForTileImpl,
  supportedTownKeysForTile as supportedTownKeysForTileImpl
} from "../runtime-structure-support/runtime-structure-support.js";
import { tickPopulationGrowth as tickPopulationGrowthImpl } from "../runtime-population-growth.js";
import {
  tickOrphanedLockSweep as tickOrphanedLockSweepImpl,
  tickTileShedding as tickTileSheddingImpl
} from "../runtime-maintenance-ticks.js";
import {
  assertYieldIndexCorrect as assertYieldIndexCorrectImpl,
  isNeutralBeaconTile as isNeutralBeaconTileImpl,
  isYieldBearingTile as isYieldBearingTileImpl,
  rebuildPlannerCandidateIndexesForPlayer as rebuildPlannerCandidateIndexesForPlayerImpl,
  refreshEconomyCachesForTileChange,
  refreshFortAnchorIndexForTile as refreshFortAnchorIndexForTileImpl,
  refreshNeutralBeaconIndexForTile as refreshNeutralBeaconIndexForTileImpl,
  refreshPlannerCandidateIndexesAroundTileChange as refreshPlannerCandidateIndexesAroundTileChangeImpl,
  refreshPlayerCandidateIndexAnchorForTile as refreshPlayerCandidateIndexAnchorForTileImpl,
  refreshRuntimeTileIndexesForChange,
  registerFortSupportAnchor as registerFortSupportAnchorImpl,
  removeFrontierTileFromOwnerIndex as removeFrontierTileFromOwnerIndexImpl
} from "../runtime-tile-index-maintenance.js";
import { tickShardRain as tickShardRainImpl, emitShardRainHelloFor as emitShardRainHelloForImpl } from "../runtime-shard-rain-tick.js";
import { computeEmpireStorageCap, type EmpireStorageCap } from "../runtime-empire-storage.js";
import {
  applyPassiveIncome as applyPassiveIncomeImpl,
  applyPassiveIncomeAsync as applyPassiveIncomeAsyncImpl,
  applyPassiveIncomeForPlayer as applyPassiveIncomeForPlayerImpl,
  type RuntimePassiveIncomeContext
} from "../runtime-passive-income.js";
import { tickTerritoryAutomation as tickTerritoryAutomationImpl } from "../runtime-territory-automation-tick/runtime-territory-automation-tick.js";
import { tickMuster as tickMusterImpl } from "../runtime-muster-tick/runtime-muster-tick.js";
import type { MusterAdvanceCooldowns } from "../runtime-muster-tick/runtime-muster-tick.js";
import { tickFortGarrison as tickFortGarrisonImpl } from "../runtime-fort-garrison-tick.js";
import {
  completeStructureBuild as completeStructureBuildImpl,
  handleBuildStructureCommand as handleBuildStructureCommandImpl,
  type RuntimeStructureCommandContext
} from "../runtime-structure-command-handlers.js";
import {
  cancelActiveOutpostAttackLocks as cancelActiveOutpostAttackLocksImpl,
  completeStructureRemoval as completeStructureRemovalImpl,
  handleCancelFortBuildCommand as handleCancelFortBuildCommandImpl,
  handleCancelSiegeOutpostBuildCommand as handleCancelSiegeOutpostBuildCommandImpl,
  handleCancelStructureBuildCommand as handleCancelStructureBuildCommandImpl,
  handleClearMusterCommand as handleClearMusterCommandImpl,
  handleRemoveStructureCommand as handleRemoveStructureCommandImpl,
  handleSetMusterCommand as handleSetMusterCommandImpl
} from "../runtime-structure-lifecycle-command-handlers.js";
import {
  activeAetherBridgeNeighborKeysForPlayer as activeAetherBridgeNeighborKeysForPlayerImpl,
  applyEncirclement as applyEncirclementImpl,
  applyEncirclementForExpand as applyEncirclementForExpandImpl,
  type RuntimeEncirclementApplicationContext
} from "../runtime-encirclement-application.js";
import {
  releaseMusterReservation as releaseMusterReservationImpl,
  resolveLock as resolveLockImpl,
  type RuntimeLockResolutionContext
} from "../runtime-lock-resolution.js";
import { applyResourceTileSteal as applyResourceTileStealImpl, type RuntimeResourceStealContext } from "../runtime-resource-steal.js";
import {
  handleFrontierCommandImpl,
  type RuntimeFrontierCommandContext
} from "../runtime-frontier-command.js";
import {
  seedLiveBarbarians as seedLiveBarbariansImpl,
  type SeedLiveBarbariansResult
} from "../runtime-live-barbarians.js";
import {
  ensurePlayerHasSpawnTerritory as ensurePlayerHasSpawnTerritoryImpl,
  finalizeRespawnNotice as finalizeRespawnNoticeImpl,
  preparePlayerRespawnNotice as preparePlayerRespawnNoticeImpl,
  respawnIfEliminated as respawnIfEliminatedImpl,
  respawnPlayerOnUnownedLand as respawnPlayerOnUnownedLandImpl,
  type RuntimeRespawnContext
} from "../runtime-respawn-helpers.js";

export type { VisibilityAuditSample };
const priorityOrder: QueueLane[] = ["human_interactive", "human_noninteractive", "system", "ai"];
// Force a full upkeep-cache rebuild every N reads to bound floating-point drift
// from the incremental add/subtract sum over a long-lived season.
const UPKEEP_ACCRUAL_REBUILD_INTERVAL = 256;
const RESPAWN_MINIMUM_GOLD = 100;
// Grace beyond resolvesAt before the sweep drops a lock (60s).
// Normal locks resolve inside their setTimeout window; anything still present
// is a leak from a code path that bypassed validation.
const ORPHAN_LOCK_GRACE_MS = 60_000;

// Process-global monotonically increasing counter for unique runtime epochs and
// fresh terrain mutation numbers. Consumers cache derived terrain structures by
// epoch; cache misses are O(world tiles) but happen only when terrain changes.
let nextTerrainEpoch = 1;

/** Convert a rail depot key index to position arrays for the muster tick. */
const railDepotPositionsFromKeys = (
  index: ReadonlyMap<string, Set<string>>,
  tiles: ReadonlyMap<string, DomainTileState>
): Map<string, Array<{ x: number; y: number }>> => {
  const result = new Map<string, Array<{ x: number; y: number }>>();
  for (const [ownerId, keys] of index) {
    const positions: Array<{ x: number; y: number }> = [];
    for (const key of keys) {
      const tile = tiles.get(key);
      if (tile) positions.push({ x: tile.x, y: tile.y });
    }
    if (positions.length > 0) result.set(ownerId, positions);
  }
  return result;
};

export class SimulationRuntime {
  private readonly events = new EventEmitter();
  private terrainEpoch = nextTerrainEpoch++;
  private readonly persistence: SimulationPersistence;
  private readonly now: () => number;
  private readonly players: Map<string, RuntimePlayer>;
  private readonly tiles: Map<string, DomainTileState>;
  private readonly docks: DockRouteDefinition[];
  private readonly dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  private readonly playerSummaries = new Map<string, PlayerRuntimeSummary>();
  private readonly plannerPlayerTileCollectionVersionByPlayer = new Map<string, number>();
  // Increments ONLY on tile ownership change (not muster/population/income
  // ticks) — VisionExpansionCache's key, so unrelated per-tick mutations
  // don't bust the O(territory×r²) expansion.
  private readonly territoryVersionByPlayer = new Map<string, number>();
  // O(radius²)-per-change coverage for the TILE_DELTA_BATCH hot path (see visibility-coverage-cache.ts).
  private readonly visibilityCoverage = new VisibilityCoverageTracker(WORLD_WIDTH, WORLD_HEIGHT, {
    visionRadiusForPlayer: (id) => { const p = this.players.get(id); return p ? effectiveVisionRadiusForPlayer(p) : 1; },
    getPlayer: (id) => this.players.get(id),
    territoryTileKeysForPlayer: (id) => this.summaryForPlayer(id).territoryTileKeys
  });
  private readonly visionTransitions = new VisionTransitionAccumulator(); // fog-of-war vision edges; see runtime-vision-transition.ts
  private readonly plannerPlayerTopologyVersionByPlayer = new Map<string, number>();
  private readonly plannerPlayerTopologyDirtyTilesByPlayer = new Map<string, Set<string>>();
  private readonly rememberedAutomationVictoryPathByPlayer = new Map<string, AutomationVictoryPath>();
  // Bounded per-AI focus front (BFS of owned tiles around a persistent
  // hot-frontier origin) used to cap planner CPU. Refreshed each tick from
  // refreshSpatialFocusForPlayer; cleared automatically when the player owns
  // no territory.
  private readonly aiSpatialFocusByPlayer = new Map<string, AiSpatialFocus>();
  // Cached from the previous tick's planAutomationCommand diagnostic; feeds
  // selectSpatialFocus's unproductive-streak rotation. A missing entry means
  // "no signal yet", which selectSpatialFocus treats as productive. Kept in
  // sync with aiSpatialFocusByPlayer (see refreshSpatialFocusForPlayer and
  // explainNextAutomationCommand's zero-territory branch).
  private readonly aiSpatialFocusProductiveByPlayer = new Map<string, boolean>();
  // Incrementally-maintained tile key cache for the planner player-view export.
  // Each entry holds six TileKeyArrayEntry objects, updated O(1) per tile
  // mutation (swap-with-last-then-pop) instead of rebuilt O(territory) per
  // miss. Populated lazily via plannerPlayerTileKeys, kept live via mutation hooks.
  private readonly plannerPlayerTileKeyCacheByPlayer = new Map<string, PlannerTileKeysCacheEntry>();
  // Bundles the four maps above by reference for plannerPlayerTileKeys; built
  // once since the Maps themselves are never reassigned, only mutated.
  private readonly plannerPlayerTileKeysContext: PlannerPlayerTileKeysContext = {
    tileKeyCacheByPlayer: this.plannerPlayerTileKeyCacheByPlayer,
    tileCollectionVersionByPlayer: this.plannerPlayerTileCollectionVersionByPlayer,
    topologyVersionByPlayer: this.plannerPlayerTopologyVersionByPlayer,
    topologyDirtyTilesByPlayer: this.plannerPlayerTopologyDirtyTilesByPlayer
  };
  private readonly locksByTile: Map<string, LockRecord>;
  // Deduplicated view of locksByTile keyed by commandId.  A single lock is
  // stored under TWO tile keys (originKey + targetKey); this index gives O(1)
  // unique-lock iteration for exportState's activeLocks projection, replacing
  // the per-call `new Map([...locksByTile.entries()].map(...))` dedup.
  private readonly locksByCommandId = new Map<string, LockRecord>();
  private readonly frontierTilesByOwner = new Map<string, Set<string>>();
  private readonly deltaBuffer = new CommandDeltaBuffer();
  // Part 2: index of fort/town anchors that grant frontier support per owner.
  private readonly activeFortAnchorsByOwner = new Map<string, Map<string, number>>();
  // Index of active siege outpost tiles per owner (SIEGE_OUTPOST / SIEGE_TOWER / DREAD_TOWER).
  // Key: ownerId, Value: Set of tileKeys with an active siegeOutpost owned by that player.
  // Maintained in replaceTileState via refreshSiegeOutpostIndexForTile.
  // Replaces the O(territory) sweep in tickTerritoryAutomation.
  private readonly activeSiegeOutpostsByOwner = new Map<string, Set<string>>();
  // Index of active LIGHT_OUTPOST economic structure tiles per owner.
  // Key: ownerId, Value: Set of tileKeys with an active LIGHT_OUTPOST owned by that player.
  // Maintained in replaceTileState via refreshLightOutpostIndexForTile.
  // Replaces the O(territory) sweep in tickTerritoryAutomation.
  private readonly activeLightOutpostsByOwner = new Map<string, Set<string>>();
  // Index of tiles carrying a muster flag per owner (mustering system).
  // Key: ownerId, Value: Set of tileKeys whose `muster.ownerId` is that player.
  // Maintained in replaceTileState via refreshMusterIndexForTile. Lets the
  // muster accumulation tick enumerate active musters without scanning the map.
  private readonly musterTilesByOwner = new Map<string, Set<string>>();
  // Index of active Rail Depot tiles per owner (mustering logistics hub).
  private readonly railDepotTilesByOwner = new Map<string, Set<string>>();
  // Tracks muster manpower reserved by in-flight attacks (remote muster).
  // Key: muster tileKey, Value: total reserved amount. Prevents two concurrent
  // attacks from double-spending the same staged muster.
  private readonly musterReservedByKey = new Map<string, number>();
  private readonly musterAdvanceCooldowns = new Map<string, number>();
  // Tracks which muster tile each connected player is viewing (playerId → tileKey).
  // Used to drive a 1-second targeted tick so the tile panel updates in real time.
  private readonly watchedMusterTileByPlayer = new Map<string, string>();
  private readonly onMusterRemoteAttack: (() => void) | undefined;
  private readonly onMusterRemoteBlocked: (() => void) | undefined;
  private readonly onMusterRemoteBlockedBarbarian: (() => void) | undefined;
  private readonly onAutoFillTiles: ((count: number) => void) | undefined;
  private readonly onPlayerStateUpdateSkippedAi: ((playerId: string) => void) | undefined;
  // Index of tiles with an active fort per owner (garrison system).
  // Key: ownerId, Value: Set of tileKeys where fort.status === "active" and fort.ownerId matches.
  // Maintained in replaceTileState via refreshFortGarrisonIndexForTile.
  private readonly fortTilesByOwner = new Map<string, Set<string>>();
  // Index of unowned LAND tiles with a town, dock, or resource — navigation
  // beacons for AI directional expansion. Maintained in replaceTileState via
  // refreshNeutralBeaconIndexForTileImpl; rebuilt from this.tiles in the
  // constructor.  Changes increment beaconGeneration so export caches can
  // detect staleness without re-scanning the set.
  private readonly neutralBeaconTileKeys = new Set<string>();
  private beaconGeneration = 0;
  // Per-player cache for the expansion objective selected from beacon indexes.
  // Keyed by topologyVersion + beaconGeneration so recomputation only triggers
  // on actual territory or beacon changes.
  private readonly expansionObjectiveCacheByPlayer = new Map<string, {
    topologyVersion: number;
    beaconGeneration: number;
    objective: ExpansionObjective | undefined;
  }>();
  // Index of yield-bearing SETTLED LAND tiles per owner. A tile is yield-bearing
  // iff it has town, dockId, a strategic resource, or an active converter
  // economicStructure. Maintained in replaceTileState; rebuilt from this.tiles
  // in the constructor. Used by consumeUpkeepFromTileYield to skip the 99% of
  // settled tiles that produce zero yield (plain land).
  private readonly yieldBearingTilesByOwner = new Map<string, Set<string>>();
  // Sorted (deterministic drain order) snapshot of yieldBearingTilesByOwner.
  // Lazily populated; invalidated (deleted) whenever the underlying Set
  // changes via addYieldBearingTileToOwnerIndex or removeYieldBearingTileFromOwnerIndex.
  // Avoids O(n log n) spread+sort in consumeUpkeepFromTileYield on every tick
  // for players whose yield-bearing set is stable.
  private readonly sortedYieldBearingKeysByOwner = new Map<string, string[]>();
  private readonly ownedStructureCountByPlayerByType = new Map<string, Map<BuildableStructureType, number>>();
  private readonly barbarianTileProgress = new Map<string, number>();
  private readonly abilityCooldowns = new Map<string, Map<string, number>>();
  private pendingImperialWard: { playerId: string; charges: number } | undefined;
  private readonly tileYieldCollectedAtByTile = new Map<string, number>();
  private readonly lastIncomeTickAtMsByPlayer = new Map<string, number>();
  private readonly lastActiveAtMsByPlayer = new Map<string, number>();
  private readonly fortPatrolGraceUntilByTile = new Map<string, number>();
  // Epoch ms when each tile last transitioned into SETTLED ownership. Stamped
  // in replaceTileState; consumed by tickTileShedding to shed newest-first when
  // broke. Not persisted — tiles recovered from the event log tie at -Infinity
  // so they shed last (a restarted empire's core tiles outlast its expansions).
  private readonly tileSettledAtByKey = new Map<string, number>();
  private readonly collectVisibleCooldownByPlayer = new Map<string, number>();
  // Throttle per-tick respawn attempts for eliminated AI players. Spawn
  // placement is an O(n-tile) scan; 30 s cooldown keeps it from running
  // every 200 ms when the map is too full to place.
  private readonly lastAiRespawnAttemptMsByPlayer = new Map<string, number>();
  private static readonly AI_RESPAWN_RETRY_INTERVAL_MS = 30_000;
  private readonly lastEmittedStorageCapByPlayer = new Map<string, EmpireStorageCap>();
  // Phase 3c: pre-serialized snapshot form of every tile, kept in sync with
  // this.tiles via replaceTileState and the two direct tiles.set paths.
  // Eliminates the O(202k-tile) yield loop from buildRuntimeSnapshotSectionsAsync;
  // checkpoint cost drops from 43-93 s (101 setImmediate waits) to ~50 ms (sort).
  private readonly snapshotTileCache = new Map<string, SnapshotTile>();
  // Epoch ms of the last population growth tick for each settled town tile key.
  // Used by tickPopulationGrowth to compute elapsed minutes since the last update.
  private readonly townLastGrowthTickAtByKey = new Map<string, number>();
  // Running counter of growth ticks skipped due to insufficient food.
  // Exposed for diagnostics / metrics.
  growthStalledNoFoodCounter = 0;
  // Per-player vision expansion cache; miss cost is O(territory×r²) and is
  // wrapped in trackSyncMainThreadTask by classifyVisibilityForPlayer below.
  private readonly visionExpansionCache = new VisionExpansionCache(WORLD_WIDTH, WORLD_HEIGHT);
  private readonly lastEconomyAccrualAtByPlayer = new Map<string, number>();
  // Cached economy snapshot per player. Invalidated in replaceTileState on any
  // income/upkeep-relevant tile mutation; keyed by player ID, missing = dirty.
  private readonly economySnapshotCacheByPlayer = new Map<string, PlayerUpdateEconomySnapshot>();
  // Incremental upkeep cache: unlike economySnapshotCacheByPlayer (invalidate +
  // O(tiles) rebuild), kept warm via O(1) add/subtract in replaceTileState.
  // Lazily populated on first read; invalidated when tech/domain mults change.
  private readonly upkeepAccrualCacheByPlayer = new Map<string, UpkeepAccrualSnapshot>();
  // Per-player read counter for the upkeep cache. Drives the periodic full
  // rebuild that bounds floating-point drift (see cachedUpkeepAccrual).
  private readonly upkeepAccrualReadCountByPlayer = new Map<string, number>();
  // Cached tile-yield economy context per player. Includes town network, fed-town
  // keys, and first-three-town keys. Invalidated alongside economySnapshotCacheByPlayer
  // (same replaceTileState triggers). Used by consumeUpkeepFromTileYield and
  // applyPassiveIncome to avoid rebuilding the town network from all settled tiles.
  private readonly tileYieldContextCacheByPlayer = new Map<string, RuntimeTileYieldEconomyContext>();
  // Shared town-network cache: buildConnectedTownNetworkForPlayer is O(settled
  // tiles + towns^2) and was being built TWICE per cache-miss cycle (once here,
  // once inside buildPlayerUpdateEconomySnapshot). Sharing cuts that in half.
  private readonly townNetworkCacheByPlayer = new Map<string, Map<string, ConnectedTownNetworkEntry>>();
  // Defensibility metrics cache; invalidated alongside economy snapshot (same
  // tile mutations change income and border exposure T/E/Ts/Es).
  private readonly defensibilityMetricsCacheByPlayer = new Map<string, { T: number; E: number; Ts: number; Es: number }>();
  private readonly pendingRespawnNoticeByPlayerId = new Map<string, PendingRespawnNoticeContext>();
  private readonly lastRespawnNoticeByPlayerId = new Map<string, PlayerRespawnNotice>();
  private readonly revealTargetsByPlayer = new Map<string, Set<string>>();
  private readonly activeAetherBridgesByPlayer = new Map<string, ActiveAetherBridgeView[]>();
  private readonly activeAetherWallsByPlayer = new Map<string, ActiveAetherWallView[]>();
  private readonly pendingSettlementsByTile = new Map<string, PendingSettlementRecord>();
  private readonly jobsByLane: Record<QueueLane, SimulationJob[]> = {
    human_interactive: [],
    human_noninteractive: [],
    system: [],
    ai: []
  };
  private readonly replayCache: RuntimeReplayCache;
  private lastShardRainSpawnSlotKey: string | undefined;
  private lastShardRainWarningSlotKey: string | undefined;
  private shardRainTickCounter = 0;
  private currentShardRainExpiresAt: number | undefined;
  private currentShardRainSiteCount = 0;
  private readonly lastShardRainHelloByPlayer = new Map<string, number>();
  private readonly recentShardRainTileKeys = new Set<string>();
  private readonly activeShardFallSiteKeys = new Set<string>();
  private territoryAutomationCounter = 0;
  private readonly backgroundBatchSize: number;
  private readonly scheduleSoon: (task: () => void) => void;
  private readonly scheduleAfter: (delayMs: number, task: () => void) => void;
  private readonly shouldPauseBackground: (() => boolean) | undefined;
  private readonly commandTrace: ((sample: Record<string, unknown>) => void) | undefined;
  private readonly onOwnershipChange: SimulationRuntimeOptions["onOwnershipChange"];
  private readonly onVisibilityAudit: ((sample: VisibilityAuditSample) => void) | undefined;
  private readonly trackSyncMainThreadTask: SimulationRuntimeOptions["trackSyncMainThreadTask"];
  private readonly onCaptureRevealBuilt:
    | ((sample: { commandId: string; playerId: string; tileCount: number; durationMs: number }) => void)
    | undefined;
  private readonly onShardCollected: (() => void) | undefined;
  private readonly onQueueDrain:
    | ((sample: {
        durationMs: number;
        processedJobs: number;
        backgroundJobsProcessed: number;
        yieldedForBackground: boolean;
        processedByLane: Record<QueueLane, number>;
        queueDepthsBefore: Record<QueueLane, number>;
        queueDepthsAfter: Record<QueueLane, number>;
      }) => void)
    | undefined;
  private readonly onJobApplied:
    | ((sample: { lane: QueueLane; durationMs: number; commandType?: CommandEnvelope["type"]; commandId?: string }) => void)
    | undefined;
  private readonly wrapJobRun: ((run: () => void, meta: { lane: QueueLane; commandType?: CommandEnvelope["type"]; commandId?: string }) => () => void) | undefined;
  private drainScheduled = false;
  private immediateDrainScheduled = false;
  private draining = false;
  private readonly tileDeltaStringifyCache = new TileDeltaStringifyCache();
  private readonly playerCandidateIndex = new PlayerCandidateIndex();
  private readonly barbActivationVisibilityCache: BarbActivationVisibilityCache = { union: null, signature: "" };

  private refreshSpatialFocusForPlayer(playerId: string, now: number): AiSpatialFocus | undefined {
    const summary = this.summaryForPlayer(playerId);
    if (summary.territoryTileKeys.size <= 0) {
      this.aiSpatialFocusByPlayer.delete(playerId);
      this.aiSpatialFocusProductiveByPlayer.delete(playerId);
      return undefined;
    }
    const prior = this.aiSpatialFocusByPlayer.get(playerId);
    // Random jitter spreads meta-replans across AIs so they do not co-fire on
    // the same tick. AI_SPATIAL_FOCUS_EXPIRY_JITTER_MS is fixed; the actual
    // jitter per refresh is uniform in [0, jitter).
    const jitterMs = Math.floor(Math.random() * AI_SPATIAL_FOCUS_EXPIRY_JITTER_MS);
    const focus = selectSpatialFocus({
      prior,
      hotFrontierTileKeys: summary.hotFrontierTileKeys,
      buildCandidateTileKeys: summary.buildCandidateTileKeys,
      settlePendingTileKeys: summary.frontierTileKeys,
      ownedTileKeys: summary.territoryTileKeys,
      now,
      jitterMs,
      lastScanWasProductive: this.aiSpatialFocusProductiveByPlayer.get(playerId)
    });
    if (focus) {
      this.aiSpatialFocusByPlayer.set(playerId, focus);
    } else {
      this.aiSpatialFocusByPlayer.delete(playerId);
      this.aiSpatialFocusProductiveByPlayer.delete(playerId);
    }
    return focus;
  }

  private rememberedAutomationVictoryPathCounts(): Partial<Record<AutomationVictoryPath, number>> {
    const counts: Partial<Record<AutomationVictoryPath, number>> = {
      TOWN_CONTROL: 0,
      ECONOMIC_HEGEMONY: 0,
      RESOURCE_MONOPOLY: 0,
      MARITIME_SUPREMACY: 0,
      DIPLOMATIC_DOMINANCE: 0
    };
    for (const [playerId, victoryPath] of this.rememberedAutomationVictoryPathByPlayer.entries()) {
      if ((this.summaryForPlayer(playerId).territoryTileKeys.size ?? 0) <= 0) continue;
      counts[victoryPath] = (counts[victoryPath] ?? 0) + 1;
    }
    return counts;
  }

  constructor(options: SimulationRuntimeOptions = {}) {
    const seedWorld = options.initialPlayers && options.seedTiles ? undefined : createSeedWorld(options.seedProfile);
    this.now = options.now ?? (() => Date.now());
    this.persistence = options.persistence ?? new InMemorySimulationPersistence();
    this.backgroundBatchSize = Math.max(1, options.backgroundBatchSize ?? 1);
    this.replayCache = new RuntimeReplayCache(
      Math.max(0, options.maxTerminalCommandReplayHistory ?? DEFAULT_MAX_TERMINAL_COMMAND_REPLAY_HISTORY),
      Math.max(0, options.maxPlayerSeqReplayEntries ?? DEFAULT_MAX_PLAYER_SEQ_REPLAY_ENTRIES)
    );
    this.scheduleSoon = options.scheduleSoon ?? ((task) => queueMicrotask(task));
    // scheduleAfter(0, ...) previously used setTimeout(0) (Timers phase, before
    // Check-phase setImmediate snapshot-build yields), so every yield ate a
    // ~200ms AI drain callback first — 22+s login stalls. Fix: setImmediate for
    // delay=0 lands drains in the same Check phase, but registered AFTER
    // snapshot yields re-arm theirs, so yields always run ahead of drains next
    // iteration (~22s → ~500ms). Real-delay timers still use setTimeout.
    this.scheduleAfter = options.scheduleAfter ?? ((delayMs, task) =>
      delayMs === 0 ? void setImmediate(task) : void setTimeout(task, delayMs)
    );
    this.shouldPauseBackground = options.shouldPauseBackground;
    this.onMusterRemoteAttack = options.onMusterRemoteAttack;
    this.onMusterRemoteBlocked = options.onMusterRemoteBlocked;
    this.onMusterRemoteBlockedBarbarian = options.onMusterRemoteBlockedBarbarian;
    this.onAutoFillTiles = options.onAutoFillTiles;
    this.onPlayerStateUpdateSkippedAi = options.onPlayerStateUpdateSkippedAi;
    this.commandTrace = options.commandTrace;
    this.onOwnershipChange = options.onOwnershipChange;
    this.onQueueDrain = options.onQueueDrain;
    this.onJobApplied = options.onJobApplied;
    this.wrapJobRun = options.wrapJobRun;
    this.onVisibilityAudit = options.onVisibilityAudit;
    this.trackSyncMainThreadTask = options.trackSyncMainThreadTask;
    this.onCaptureRevealBuilt = options.onCaptureRevealBuilt;
    this.onShardCollected = options.onShardCollected;
    this.pendingImperialWard = options.pendingImperialWard;
    this.players =
      createPlayersFromRecoveredState(options.initialState, options.initialPlayers) ??
      (options.initialPlayers ? new Map(options.initialPlayers) : seedWorld!.players);
    for (const player of this.players.values()) this.applyManpowerRegen(player);
    this.tiles = createTilesFromInitialState(
      options.initialState,
      options.seedTiles ?? seedWorld!.tiles,
      options.mergeSeedTilesWithInitialState ?? true
    );
    for (const [key, tile] of this.tiles) this.snapshotTileCache.set(key, mapTile(tile));
    this.docks = createDocksFromInitialState(options.initialState, options.seedDocks ?? seedWorld?.docks ?? []);
    this.dockLinksByDockTileKey = buildDockLinksByDockTileKey(this.docks);
    this.locksByTile = createLocksFromInitialState(options.initialState);
    // Populate the commandId index from the just-created locksByTile map.
    for (const lock of this.locksByTile.values()) this.locksByCommandId.set(lock.commandId, lock);
    for (const yieldEntry of options.initialState?.tileYieldCollectedAtByTile ?? []) {
      this.tileYieldCollectedAtByTile.set(yieldEntry.tileKey, yieldEntry.collectedAt);
    }
    for (const yieldEntry of options.initialState?.playerYieldCollectionEpochByPlayer ?? []) {
      this.lastIncomeTickAtMsByPlayer.set(yieldEntry.playerId, yieldEntry.collectedAt);
    }
    for (const playerId of this.players.keys()) {
      this.playerSummaries.set(playerId, createEmptyPlayerRuntimeSummary());
      this.plannerPlayerTileCollectionVersionByPlayer.set(playerId, 0);
      this.territoryVersionByPlayer.set(playerId, 0);
    }
    // First pass: apply tile summaries and shard-site tracking.
    // All tiles are already in this.tiles (createTilesFromInitialState produced a
    // complete Map), so anchor registration in the second pass below will find every
    // neighbour regardless of iteration order.
    for (const [tileKey, tile] of this.tiles.entries()) {
      this.applyTileToPlayerSummaries(tileKey, tile);
      this.visibilityCoverage.tileOwnershipChanged(undefined, tile.ownerId, tile.x, tile.y);
      const site = tile.shardSite;
      if (site && site.kind === "FALL" && typeof site.expiresAt === "number" && site.expiresAt > this.now()) {
        this.currentShardRainSiteCount += 1;
        this.currentShardRainExpiresAt =
          typeof this.currentShardRainExpiresAt === "number"
            ? Math.max(this.currentShardRainExpiresAt, site.expiresAt)
            : site.expiresAt;
        this.activeShardFallSiteKeys.add(tileKey);
      }
      // Part 1: populate frontierTilesByOwner index.
      if (tile.ownershipState === "FRONTIER" && tile.ownerId && !tile.ownerId.startsWith("barbarian-")) {
        let set = this.frontierTilesByOwner.get(tile.ownerId);
        if (!set) { set = new Set<string>(); this.frontierTilesByOwner.set(tile.ownerId, set); }
        set.add(tileKey);
      }
      // Populate yieldBearingTilesByOwner index.
      if (isYieldBearingTileImpl(tile) && tile.ownerId) {
        let set = this.yieldBearingTilesByOwner.get(tile.ownerId);
        if (!set) { set = new Set<string>(); this.yieldBearingTilesByOwner.set(tile.ownerId, set); }
        set.add(tileKey);
      }
      // Populate neutralBeaconTileKeys index (unowned towns/docks/resources).
      if (isNeutralBeaconTileImpl(tile)) this.neutralBeaconTileKeys.add(tileKey);
      // Populate ownedStructureCountByPlayerByType. Each structure slot has its
      // own ownerId — count by structure ownership, not by tile ownership,
      // to mirror the original ownedStructureCountForPlayer semantics.
      if (tile.fort?.ownerId) this.adjustOwnedStructureCount(tile.fort.ownerId, "FORT", 1);
      if (tile.observatory?.ownerId) this.adjustOwnedStructureCount(tile.observatory.ownerId, "OBSERVATORY", 1);
      if (tile.siegeOutpost?.ownerId) this.adjustOwnedStructureCount(tile.siegeOutpost.ownerId, "SIEGE_OUTPOST", 1);
      if (tile.economicStructure?.ownerId) {
        this.adjustOwnedStructureCount(
          tile.economicStructure.ownerId,
          tile.economicStructure.type as BuildableStructureType,
          1
        );
      }
    }
    // Second pass: register PlayerCandidateIndex anchors now that this.tiles is
    // fully traversed.  Each anchor is stored at the MAX possible radius for its
    // kind — time-dependent radius (e.g. FORT_PATROL_GRACE_MS) is applied at the
    // call site, not stored here, to prevent stale maxRadius bugs.
    for (const [tileKey, tile] of this.tiles.entries()) {
      if (!tile.ownerId) continue;
      const ownerId = tile.ownerId;
      if (isSettledTownAnchor(tile, ownerId)) {
        this.playerCandidateIndex.registerAnchor(tileKey, ownerId, TOWN_AUTO_FRONTIER_RADIUS, (k) => this.tiles.get(k));
        // Part 2: register in activeFortAnchorsByOwner
        registerFortSupportAnchorImpl(this.activeFortAnchorsByOwner, tileKey, ownerId, TOWN_AUTO_FRONTIER_RADIUS);
      }
      // Populate activeSiegeOutpostsByOwner index
      if (tile.siegeOutpost?.ownerId === ownerId && tile.siegeOutpost.status === "active") {
        let set = this.activeSiegeOutpostsByOwner.get(ownerId);
        if (!set) { set = new Set<string>(); this.activeSiegeOutpostsByOwner.set(ownerId, set); }
        set.add(tileKey);
      }
      // Populate activeLightOutpostsByOwner index
      if (
        tile.economicStructure?.ownerId === ownerId &&
        tile.economicStructure.type === "LIGHT_OUTPOST" &&
        tile.economicStructure.status === "active"
      ) {
        let set = this.activeLightOutpostsByOwner.get(ownerId);
        if (!set) { set = new Set<string>(); this.activeLightOutpostsByOwner.set(ownerId, set); }
        set.add(tileKey);
      }
      // Populate musterTilesByOwner index (mustering system).
      if (tile.muster?.ownerId) {
        let set = this.musterTilesByOwner.get(tile.muster.ownerId);
        if (!set) { set = new Set<string>(); this.musterTilesByOwner.set(tile.muster.ownerId, set); }
        set.add(tileKey);
      }
      // Populate fortTilesByOwner index (garrison system).
      if (tile.fort?.ownerId && tile.fort.status === "active") {
        let set = this.fortTilesByOwner.get(tile.fort.ownerId);
        if (!set) { set = new Set<string>(); this.fortTilesByOwner.set(tile.fort.ownerId, set); }
        set.add(tileKey);
      }
      // Populate railDepotTilesByOwner index (mustering logistics hub).
      if (tile.economicStructure?.type === "RAIL_DEPOT" && tile.economicStructure.ownerId && tile.economicStructure.status === "active") {
        let set = this.railDepotTilesByOwner.get(tile.economicStructure.ownerId);
        if (!set) { set = new Set<string>(); this.railDepotTilesByOwner.set(tile.economicStructure.ownerId, set); }
        set.add(tileKey);
      }
    }
    for (const player of options.initialState?.players ?? []) {
      if (!player.ownedTownTileKeys?.length) continue;
      const summary = this.summaryForPlayer(player.id);
      const currentTowns = new Map(summary.ownedTownTierByTile);
      summary.ownedTownTierByTile.clear();
      for (const tileKey of player.ownedTownTileKeys) {
        const tier = currentTowns.get(tileKey);
        if (tier) {
          summary.ownedTownTierByTile.set(tileKey, tier);
          currentTowns.delete(tileKey);
        }
      }
      for (const [tileKey, tier] of currentTowns) summary.ownedTownTierByTile.set(tileKey, tier);
    }
    for (const playerId of this.players.keys()) {
      this.rebuildPlannerCandidateIndexesForPlayer(playerId);
    }
    for (const pendingSettlement of options.initialState?.pendingSettlements ?? []) {
      const pendingTile = this.tiles.get(pendingSettlement.tileKey);
      if (!pendingTile || pendingTile.ownerId !== pendingSettlement.ownerId || pendingTile.ownershipState !== "FRONTIER") continue;
      this.addPendingSettlement({ ...pendingSettlement });
      const delayMs = Math.max(0, pendingSettlement.resolvesAt - this.now());
      this.scheduleAfter(delayMs, () => {
        const currentSettlement = this.pendingSettlementsByTile.get(pendingSettlement.tileKey);
        if (!this.pendingSettlementMatches(currentSettlement, pendingSettlement)) return;
        this.removePendingSettlement(pendingSettlement.tileKey);
        const latest = this.tiles.get(pendingSettlement.tileKey);
        if (!latest || latest.ownerId !== pendingSettlement.ownerId) {
          this.emitPlayerStateUpdate({ commandId: `recovered-settle:${pendingSettlement.tileKey}`, playerId: pendingSettlement.ownerId });
          return;
        }
        const settledTile: DomainTileState = {
          ...latest,
          ownerId: pendingSettlement.ownerId,
          ownershipState: "SETTLED",
          ...(latest.town ? { town: latest.town } : {})
        };
        const recoveredSettleCommandId = `recovered-settle:${pendingSettlement.tileKey}`;
        this.setTileYieldCollectedAt(recoveredSettleCommandId, pendingSettlement.ownerId, pendingSettlement.tileKey, this.now());
        this.replaceTileState(pendingSettlement.tileKey, settledTile);
        this.emitEvent({
          eventType: "TILE_DELTA_BATCH",
          commandId: recoveredSettleCommandId,
          playerId: pendingSettlement.ownerId,
          // ownerId/ownershipState forced regardless of the sparse-diff cache:
          // a FRONTIER->SETTLED transition must never omit identity fields,
          // since any subscriber whose local copy doesn't already have them
          // (e.g. after a stale bootstrap resync) would never learn this
          // tile is owned — sparse-diffing assumes "unchanged" is safe to
          // drop, which isn't true across a full client resync.
          tileDeltas: [{ ...this.tileDeltaFromState(settledTile), ownerId: settledTile.ownerId ?? undefined, ownershipState: settledTile.ownershipState ?? undefined }]
        });
        this.emitAutoFillForSettlement(settledTile, pendingSettlement.ownerId, pendingSettlement.tileKey);
        this.emitPlayerStateUpdate({ commandId: recoveredSettleCommandId, playerId: pendingSettlement.ownerId });
        this.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: recoveredSettleCommandId, playerId: pendingSettlement.ownerId });
      });
    }
    // In-flight structure work (under_construction / removing) survives in tile
    // state across restarts, but the setTimeout closure that completes it dies
    // with the previous process. Without this, restarted structures stay stuck
    // at 0:00 forever and permanently occupy development slots.
    for (const [tileKey, tile] of this.tiles) {
      const ownerId = tile.ownerId;
      if (!ownerId) continue;
      const recoveredCommandId = `recovered-build:${tileKey}`;
      const scheduleStructureFinish = (completesAt: number | undefined, finish: () => void): void => {
        if (completesAt == null) return;
        this.scheduleAfter(Math.max(0, completesAt - this.now()), finish);
      };
      if (tile.fort?.ownerId === ownerId) {
        if (tile.fort.status === "under_construction") {
          scheduleStructureFinish(tile.fort.completesAt, () => this.completeStructureBuild(tileKey, ownerId, "FORT", recoveredCommandId));
        } else if (tile.fort.status === "removing") {
          scheduleStructureFinish(tile.fort.completesAt, () => this.completeStructureRemoval(tileKey, ownerId, recoveredCommandId));
        }
      }
      if (tile.observatory?.ownerId === ownerId) {
        if (tile.observatory.status === "under_construction") {
          scheduleStructureFinish(tile.observatory.completesAt, () => this.completeStructureBuild(tileKey, ownerId, "OBSERVATORY", recoveredCommandId));
        } else if (tile.observatory.status === "removing") {
          scheduleStructureFinish(tile.observatory.completesAt, () => this.completeStructureRemoval(tileKey, ownerId, recoveredCommandId));
        }
      }
      if (tile.siegeOutpost?.ownerId === ownerId) {
        if (tile.siegeOutpost.status === "under_construction") {
          scheduleStructureFinish(tile.siegeOutpost.completesAt, () => this.completeStructureBuild(tileKey, ownerId, "SIEGE_OUTPOST", recoveredCommandId));
        } else if (tile.siegeOutpost.status === "removing") {
          scheduleStructureFinish(tile.siegeOutpost.completesAt, () => this.completeStructureRemoval(tileKey, ownerId, recoveredCommandId));
        }
      }
      if (tile.economicStructure?.ownerId === ownerId) {
        if (tile.economicStructure.status === "under_construction") {
          const structureType = tile.economicStructure.type;
          scheduleStructureFinish(tile.economicStructure.completesAt, () => this.completeStructureBuild(tileKey, ownerId, structureType, recoveredCommandId));
        } else if (tile.economicStructure.status === "removing") {
          scheduleStructureFinish(tile.economicStructure.completesAt, () => this.completeStructureRemoval(tileKey, ownerId, recoveredCommandId));
        }
      }
    }
    const recoveredCommandHistory = options.initialCommandHistory;
    hydrateCommandHistory({
      commandIdsByPlayerSeq: this.replayCache.commandIdsByPlayerSeq,
      recordedEventsByCommandId: this.replayCache.recordedEventsByCommandId,
      ...(recoveredCommandHistory ? { recoveredCommandHistory } : {})
    });
    this.replayCache.rebuildTerminalReplayIndex();
    this.replayCache.pruneReplayCaches();
    for (const lock of uniqueLocksByCommandId(this.locksByTile.values())) {
      this.scheduleLockResolution(lock);
    }
    requeueRecoveredCommands({
      ...(recoveredCommandHistory ? { recoveredCommandHistory } : {}),
      queueCommandForProcessing: (command) => this.queueCommandForProcessing(command)
    });
  }

  onEvent(listener: (event: SimulationEvent) => void): () => void {
    this.events.on("event", listener);
    return () => this.events.off("event", listener);
  }

  takeVisionTransitions(): { entered: ReadonlyMap<string, ReadonlySet<string>>; left: ReadonlyMap<string, ReadonlySet<string>> } {
    return this.visionTransitions.take();
  }

  wireDeltaForTileKey(tileKey: string): SimulationTileWireDelta | undefined {
    const tile = this.tiles.get(tileKey);
    return tile ? this.tileDeltaRevealOnly(tile) : undefined;
  }

  async tickTileShedding(nowMs: number = this.now(), yieldToEventLoop?: () => Promise<void>): Promise<void> {
    await tickTileSheddingImpl({
      nowMs,
      players: this.players,
      tiles: this.tiles,
      locksByTile: this.locksByTile,
      tileSettledAtByKey: this.tileSettledAtByKey,
      applyEconomyAccrual: (player, at) => this.applyEconomyAccrual(player, at),
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      emitEvent: (event) => this.emitEvent(event),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      emitPlayerStateUpdate: (command) => this.emitPlayerStateUpdate(command),
      onPlayerStateUpdateSkippedAi: (playerId) => this.onPlayerStateUpdateSkippedAi?.(playerId),
      ...(yieldToEventLoop !== undefined ? { yieldToEventLoop } : {}),
      ...(this.trackSyncMainThreadTask !== undefined ? { trackSync: this.trackSyncMainThreadTask } : {})
    });
  }

  tickOrphanedLockSweep(nowMs: number = this.now()): number {
    return tickOrphanedLockSweepImpl({
      nowMs,
      orphanLockGraceMs: ORPHAN_LOCK_GRACE_MS,
      locksByTile: this.locksByTile,
      locksByCommandId: this.locksByCommandId
    });
  }

  updatePlayerLastActive(playerId: string, nowMs: number): void {
    this.lastActiveAtMsByPlayer.set(playerId, nowMs);
  }

  private passiveIncomeContext(): RuntimePassiveIncomeContext {
    return {
      players: this.players,
      lastActiveAtMsByPlayer: this.lastActiveAtMsByPlayer,
      lastIncomeTickAtMsByPlayer: this.lastIncomeTickAtMsByPlayer,
      cachedEconomySnapshot: (player) => this.cachedEconomySnapshot(player),
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      addStrategicResource: (player, resource, amount) => this.addStrategicResource(player, resource, amount),
      emitPlayerStateUpdate: (input) => this.emitPlayerStateUpdate(input),
      ...(this.trackSyncMainThreadTask !== undefined ? { trackSyncMainThreadTask: this.trackSyncMainThreadTask } : {})
    };
  }

  applyPassiveIncome(nowMs: number, inactivityCapMs: number): void {
    applyPassiveIncomeImpl(this.passiveIncomeContext(), nowMs, inactivityCapMs);
  }

  async applyPassiveIncomeAsync(
    nowMs: number,
    inactivityCapMs: number,
    yieldToEventLoop: () => Promise<void>
  ): Promise<void> {
    await applyPassiveIncomeAsyncImpl(this.passiveIncomeContext(), nowMs, inactivityCapMs, yieldToEventLoop);
  }

  private applyPassiveIncomeForPlayer(player: RuntimePlayer, nowMs: number, inactivityCapMs: number): void {
    applyPassiveIncomeForPlayerImpl(this.passiveIncomeContext(), player, nowMs, inactivityCapMs);
  }

  welcomeBackSummary(
    playerId: string,
    nowMs: number
  ): { goldEarned: number; elapsedMs: number } {
    const lastTickAt = this.lastIncomeTickAtMsByPlayer.get(playerId);
    if (lastTickAt === undefined) {
      return { goldEarned: 0, elapsedMs: 0 };
    }
    const elapsedMs = Math.max(0, nowMs - lastTickAt);
    const player = this.players.get(playerId);
    if (!player) return { goldEarned: 0, elapsedMs };
    const economy = this.cachedEconomySnapshot(player);
    const goldPerMinute = economy.incomePerMinute;
    const goldEarned = goldPerMinute * (elapsedMs / 60_000);
    return { goldEarned: Math.floor(goldEarned), elapsedMs };
  }

  tickPopulationGrowth(nowMs: number = this.now()): ReturnType<typeof tickPopulationGrowthImpl> {
    const result = tickPopulationGrowthImpl({
      nowMs,
      players: this.players,
      tiles: this.tiles,
      locksByTile: this.locksByTile,
      townLastGrowthTickAtByKey: this.townLastGrowthTickAtByKey,
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      invalidateTileStringifyCache: (tileKey) => this.tileDeltaStringifyCache.invalidate(tileKey),
      emitEvent: (event) => this.emitEvent(event),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      invalidateEconomyCachesForPlayer: (playerId) => {
        this.economySnapshotCacheByPlayer.delete(playerId);
        this.tileYieldContextCacheByPlayer.delete(playerId);
      },
      integrityGrowthMultForPlayer: EMPIRE_INTEGRITY_ENABLED
        ? (playerId) => {
            const summary = this.summaryForPlayer(playerId);
            const metrics = this.cachedDefensibilityMetrics(playerId, summary);
            return integrityGrowthMult(empireIntegrity(metrics.Ts, metrics.Es));
          }
        : undefined
    });
    if (result.growthStalledNoFood > 0) {
      this.growthStalledNoFoodCounter += result.growthStalledNoFood;
    }
    return result;
  }

  private shardRainContext() {
    return {
      now: this.now,
      players: this.players,
      tiles: this.tiles,
      recentShardRainTileKeys: this.recentShardRainTileKeys,
      activeShardFallSiteKeys: this.activeShardFallSiteKeys,
      lastShardRainHelloByPlayer: this.lastShardRainHelloByPlayer,
      getCurrentShardRainExpiresAt: () => this.currentShardRainExpiresAt,
      setCurrentShardRainExpiresAt: (expiresAt: number | undefined) => { this.currentShardRainExpiresAt = expiresAt; },
      getCurrentShardRainSiteCount: () => this.currentShardRainSiteCount,
      setCurrentShardRainSiteCount: (siteCount: number) => { this.currentShardRainSiteCount = siteCount; },
      getLastShardRainSpawnSlotKey: () => this.lastShardRainSpawnSlotKey,
      setLastShardRainSpawnSlotKey: (slotKey: string | undefined) => { this.lastShardRainSpawnSlotKey = slotKey; },
      getLastShardRainWarningSlotKey: () => this.lastShardRainWarningSlotKey,
      setLastShardRainWarningSlotKey: (slotKey: string | undefined) => { this.lastShardRainWarningSlotKey = slotKey; },
      incrementShardRainTickCounter: () => {
        this.shardRainTickCounter += 1;
        return this.shardRainTickCounter;
      },
      replaceTileState: (tileKey: string, tile: DomainTileState) => this.replaceTileState(tileKey, tile),
      emitEvent: (event: SimulationEvent) => this.emitEvent(event),
      tileDeltaFromState: (tile: DomainTileState) => this.tileDeltaFromState(tile)
    };
  }

  tickShardRain(nowMs: number = this.now()): void {
    tickShardRainImpl(this.shardRainContext(), nowMs);
  }

  async tickTerritoryAutomation(
    nowMs: number = this.now(),
    yieldToEventLoop?: () => Promise<void>
  ): Promise<void> {
    await tickTerritoryAutomationImpl({
      nowMs,
      players: this.players,
      tiles: this.tiles,
      locksByTile: this.locksByTile,
      activeFortAnchorsByOwner: this.activeFortAnchorsByOwner,
      playerCandidateIndex: this.playerCandidateIndex,
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      applyEconomyAccrual: (player, at) => this.applyEconomyAccrual(player, at),
      autoSettlementQueueLengthForPlayer: (playerId) => this.autoSettlementQueueForPlayer(playerId).length,
      emitPlayerStateUpdate: (input) => this.emitPlayerStateUpdate(input),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      nextTerritoryAutomationCommandId: (label, playerId, tileKey, at) =>
        this.nextTerritoryAutomationCommandId(label, playerId, tileKey, at),
      emitEvent: (event) => this.emitEvent(event),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      runtimeLogInfo: (payload, message) => this.runtimeLogInfo(payload, message),
      ...(this.trackSyncMainThreadTask !== undefined ? { trackSync: this.trackSyncMainThreadTask } : {}),
      ...(yieldToEventLoop !== undefined ? { yieldToEventLoop } : {})
    });
    // AI has no client, so it gets no equivalent of the human client-side
    // auto-settle dispatcher — settle it here unconditionally instead.
    // See runAiAutoSettleForPlayer for why this replaced the AI utility
    // policy's SETTLE decision class.
    for (const [playerId, player] of this.players) {
      if (!player.isAi) continue;
      this.runAiAutoSettleForPlayer(playerId, nowMs);
      if (yieldToEventLoop) await yieldToEventLoop();
    }
    this.tickMuster(nowMs);
    this.tickFortGarrison(nowMs);
  }

  tickFortGarrison(nowMs: number = this.now()): void {
    tickFortGarrisonImpl({
      nowMs,
      players: this.players,
      fortTilesByOwner: this.fortTilesByOwner,
      tiles: this.tiles,
      playerManpowerCap: (player) => this.playerManpowerCap(player),
      playerManpowerRegenPerMinute: (player) => this.playerManpowerRegenPerMinute(player),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      emitEvent: (event) => this.emitEvent(event),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile)
    });
  }

  private musterTickContext(musterTilesByOwner = this.musterTilesByOwner) {
    return {
      players: this.players,
      tiles: this.tiles,
      musterTilesByOwner,
      activeSiegeOutpostsByOwner: this.activeSiegeOutpostsByOwner,
      activeLightOutpostsByOwner: this.activeLightOutpostsByOwner,
      railDepotPositionsByOwner: railDepotPositionsFromKeys(this.railDepotTilesByOwner, this.tiles),
      applyManpowerRegen: (player: RuntimePlayer, at?: number) => this.applyManpowerRegen(player, at),
      playerManpowerCap: (player: RuntimePlayer) => this.playerManpowerCap(player),
      replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => this.replaceTileState(tileKey, tile, commandId),
      emitEvent: (event: SimulationEvent) => this.emitEvent(event),
      tileDeltaFromState: (tile: DomainTileState) => this.tileDeltaFromState(tile),
      requiredMusterForTarget: (target: DomainTileState) => this.requiredMusterForTarget(target),
      nextTerritoryAutomationCommandId: (label: string, playerId: string, tileKey: string, at: number) =>
        this.nextTerritoryAutomationCommandId(label, playerId, tileKey, at),
      handleFrontierCommand: (command: CommandEnvelope, actionType: FrontierCommandType) => this.handleFrontierCommand(command, actionType),
      locksByTile: this.locksByTile,
      advanceCooldowns: this.musterAdvanceCooldowns as MusterAdvanceCooldowns
    };
  }

  tickMuster(nowMs: number = this.now()): void {
    tickMusterImpl({ nowMs, ...this.musterTickContext() });
  }

  tickWatchedMusterTiles(nowMs: number = this.now()): void {
    if (this.watchedMusterTileByPlayer.size === 0) return;
    // Build a filtered view of musterTilesByOwner containing only watched players.
    // Passing all of each player's muster tiles preserves the throughput-split
    // calculation (activeMusterCount) across their flags.
    const filteredMusterTiles = new Map<string, Set<string>>();
    for (const [playerId, tileKey] of this.watchedMusterTileByPlayer) {
      const playerTiles = this.musterTilesByOwner.get(playerId);
      if (!playerTiles?.has(tileKey)) continue;
      filteredMusterTiles.set(playerId, playerTiles);
    }
    if (filteredMusterTiles.size === 0) return;
    tickMusterImpl({ nowMs, ...this.musterTickContext(filteredMusterTiles) });
  }

  emitShardRainHelloFor(playerId: string, nowMs: number = this.now()): void {
    emitShardRainHelloForImpl(this.shardRainContext(), playerId, nowMs);
  }

  private respawnContext(): RuntimeRespawnContext {
    return {
      now: this.now,
      players: this.players,
      tiles: this.tiles,
      playerSummaries: this.playerSummaries,
      plannerPlayerTileCollectionVersionByPlayer: this.plannerPlayerTileCollectionVersionByPlayer,
      pendingRespawnNoticeByPlayerId: this.pendingRespawnNoticeByPlayerId,
      lastRespawnNoticeByPlayerId: this.lastRespawnNoticeByPlayerId,
      pendingSettlementsByTile: this.pendingSettlementsByTile,
      locksByTile: this.locksByTile,
      rememberedAutomationVictoryPathByPlayer: this.rememberedAutomationVictoryPathByPlayer,
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      setTileYieldCollectedAt: (commandId, playerId, tileKey, collectedAt) => this.setTileYieldCollectedAt(commandId, playerId, tileKey, collectedAt),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      emitEvent: (event) => this.emitEvent(event),
      emitPlayerStateUpdate: (command) => this.emitPlayerStateUpdate(command),
      runtimeLogInfo: (payload, message) => this.runtimeLogInfo(payload, message),
      incomePerMinuteForPlayer: (playerId) => this.incomePerMinuteForPlayer(playerId),
      respawnMinimumGold: RESPAWN_MINIMUM_GOLD
    };
  }

  private combatSupportContext(): RuntimeCombatSupportContext {
    return {
      now: this.now,
      players: this.players,
      tiles: this.tiles,
      locksByTile: this.locksByTile,
      locksByCommandId: this.locksByCommandId,
      barbarianTileProgress: this.barbarianTileProgress,
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      tileDeltaRevealOnly: (tile) => this.tileDeltaRevealOnly(tile),
      emitEvent: (event) => this.emitEvent(event),
      emitPlayerStateUpdate: (command) => this.emitPlayerStateUpdate(command)
    };
  }

  private frontierCommandContext(): RuntimeFrontierCommandContext {
    return {
      now: this.now,
      players: this.players,
      tiles: this.tiles,
      locksByTile: this.locksByTile,
      locksByCommandId: this.locksByCommandId,
      musterReservedByKey: this.musterReservedByKey,
      dockLinksByDockTileKey: this.dockLinksByDockTileKey,
      rejectCommand: (command, code, message) => this.rejectCommand(command, code, message),
      applyManpowerRegen: (player) => this.applyManpowerRegen(player),
      emitEvent: (event) => this.emitEvent(event),
      commandTrace: this.commandTrace,
      onMusterRemoteBlocked: this.onMusterRemoteBlocked,
      onMusterRemoteAttack: this.onMusterRemoteAttack,
      onMusterRemoteBlockedBarbarian: this.onMusterRemoteBlockedBarbarian,
      scheduleLockResolution: (lock) => this.scheduleLockResolution(lock),
      adjacentTileStates: (x, y) => this.adjacentTileStates(x, y),
      findOwnedDockOriginForCrossing: (playerId, x, y) => this.findOwnedDockOriginForCrossing(playerId, x, y),
      findOwnedAetherBridgeOriginForCrossing: (playerId, x, y) => this.findOwnedAetherBridgeOriginForCrossing(playerId, x, y),
      isDockCrossingTarget: (from, x, y) => this.isDockCrossingTarget(from, x, y),
      isAetherBridgeCrossingTarget: (playerId, x1, y1, x2, y2) => this.isAetherBridgeCrossingTarget(playerId, x1, y1, x2, y2),
      crossingBlockedByAetherWall: (x1, y1, x2, y2) => this.crossingBlockedByAetherWall(x1, y1, x2, y2),
      isTileWardedByImperialWard: (targetOwnerId) => isTileWardedByImperialWardImpl(this.abilityCooldowns, this.now(), targetOwnerId),
      resolveMusterSource: (playerId, originKey, required, preferred) => this.resolveMusterSource(playerId, originKey, required, preferred),
      requiredMusterForTarget: (target) => this.requiredMusterForTarget(target),
      buildLockedCombatResolution: (lock) => this.buildLockedCombatResolution(lock)
    };
  }

  private encirclementApplicationContext(): RuntimeEncirclementApplicationContext {
    return {
      tiles: this.tiles,
      now: this.now,
      activeAetherBridgesForPlayer: (playerId) => this.activeAetherBridgesForPlayer(playerId),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      emitEvent: (event) => this.emitEvent(event),
      runtimeLogInfo: (payload, message) => this.runtimeLogInfo(payload, message)
    };
  }

  private resourceStealContext(): RuntimeResourceStealContext {
    return {
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId)
    };
  }

  private lockResolutionContext(): RuntimeLockResolutionContext {
    return {
      players: this.players,
      tiles: this.tiles,
      locksByTile: this.locksByTile,
      locksByCommandId: this.locksByCommandId,
      musterReservedByKey: this.musterReservedByKey,
      barbarianTileProgress: this.barbarianTileProgress,
      now: this.now,
      emitEvent: (event) => this.emitEvent(event),
      emitPlayerStateUpdate: (command) => this.emitPlayerStateUpdate(command),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      buildCaptureRevealTileDeltas: (playerId, centerX, centerY) => this.buildCaptureRevealTileDeltas(playerId, centerX, centerY),
      buildLockedCombatResolution: (lock) => this.buildLockedCombatResolution(lock),
      isTileShieldedByAegisLock: (actorId, targetX, targetY) =>
        this.isTileShieldedByAegisLock(actorId, targetX, targetY),
      consumeOriginMuster: (originKey, playerId, amount) => this.consumeOriginMuster(originKey, playerId, amount),
      applyFortGarrisonAttrition: (targetKey, attackingForce) => this.applyFortGarrisonAttrition(targetKey, attackingForce),
      applyLockedManpowerDelta: (player, manpowerDelta) => this.applyLockedManpowerDelta(player, manpowerDelta),
      applySettledCapturePlunder: (input) => this.applySettledCapturePlunder(input),
      playerManpowerCap: (player) => this.playerManpowerCap(player),
      extendFortPatrolGrace: (tileKey, graceUntil) => this.extendFortPatrolGrace(tileKey, graceUntil),
      clearFortPatrolGrace: (tileKey) => this.fortPatrolGraceUntilByTile.delete(tileKey),
      onCaptureRevealBuilt: this.onCaptureRevealBuilt,
      applyBarbarianWalkOrMultiply: (lock, previousTarget) => this.applyBarbarianWalkOrMultiply(lock, previousTarget),
      applyEncirclement: (changedKeys, playerId, commandId, options) => this.applyEncirclement(changedKeys, playerId, commandId, options),
      applyEncirclementForExpand: (targetKey, playerId, commandId, options) => this.applyEncirclementForExpand(targetKey, playerId, commandId, options),
      relocateSettlementForPlayer: (playerId, commandId, population) => this.relocateSettlementForPlayer(playerId, commandId, population),
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      respawnPlayerOnUnownedLand: (playerId, commandId) => this.respawnPlayerOnUnownedLand(playerId, commandId),
      respawnIfEliminated: (playerId, commandId) => this.respawnIfEliminated(playerId, commandId),
      ensureGrossIncomeSettlementForPlayer: (playerId, commandId) => this.ensureGrossIncomeSettlementForPlayer(playerId, commandId),
      applyBreachToNeighbors: BREAKTHROUGH_ENABLED
        ? (capturedTile, attackerId) => applyBreachToNeighborsImpl({
            capturedTile,
            attackerId,
            nowMs: this.now(),
            tiles: this.tiles,
            invalidateTileStringifyCache: (key) => this.tileDeltaStringifyCache.invalidate(key)
          })
        : undefined,
    };
  }

  private emitAutoFillForSettlement(settledTile: DomainTileState, ownerId: string, tileKey: string): void {
    const filled = applyAutoFillImpl({
      capturedTile: settledTile,
      ownerId,
      tiles: this.tiles,
      replaceTileState: (k, t) => this.replaceTileState(k, t),
      onAutoFillTiles: this.onAutoFillTiles,
      recordYieldAnchors: (keys) => {
        const t = this.now();
        for (const k of keys) this.tileYieldCollectedAtByTile.set(k, t);
        this.emitEvent({
          eventType: "TILE_YIELD_ANCHOR_BATCH",
          commandId: `auto-fill:${ownerId}:${t}`,
          playerId: ownerId,
          anchors: keys.map((k) => ({ tileKey: k, collectedAt: t }))
        });
      }
    });
    if (filled.length === 0) return;
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: `auto-fill:${tileKey}:${this.now()}`,
      playerId: "__broadcast__",
      tileDeltas: filled.map((t) => ({ ...this.tileDeltaFromState(t), ownerId: t.ownerId ?? undefined, ownershipState: t.ownershipState ?? undefined }))
    });
    const revealDeltas = buildAutoFillRevealTileDeltasImpl(this.combatSupportContext(), ownerId, filled, this.players.get(ownerId)?.isAi);
    if (revealDeltas.length > 0) {
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: `auto-fill-reveal:${tileKey}:${this.now()}`,
        playerId: ownerId,
        tileDeltas: revealDeltas
      });
    }
  }
  preparePlayerRespawnNotice(
    playerId: string,
    reasonCode: PlayerRespawnReasonCode,
    triggerEvent: string,
    options?: { wasOnline?: boolean }
  ): void {
    preparePlayerRespawnNoticeImpl(this.respawnContext(), playerId, reasonCode, triggerEvent, options);
  }

  peekRespawnNoticeForPlayer(playerId: string): PlayerRespawnNotice | undefined {
    return this.lastRespawnNoticeByPlayerId.get(playerId);
  }

  consumeRespawnNoticeForPlayer(playerId: string): PlayerRespawnNotice | undefined {
    const notice = this.lastRespawnNoticeByPlayerId.get(playerId);
    this.lastRespawnNoticeByPlayerId.delete(playerId);
    return notice;
  }

  private finalizeRespawnNotice(playerId: string, spawnTileKey: string): void {
    finalizeRespawnNoticeImpl(this.respawnContext(), playerId, spawnTileKey);
  }

  private runtimeLogInfo(payload: Record<string, unknown>, message: string): void {
    try {
      // eslint-disable-next-line no-console
      console.info(message, payload);
    } catch {
      // best-effort log; never throw from the diagnostic path
    }
  }

  ensurePlayerHasSpawnTerritory(playerId: string, rallyAnchor?: { x: number; y: number }): boolean {
    const spawned = ensurePlayerHasSpawnTerritoryImpl(this.respawnContext(), playerId, rallyAnchor);
    if (spawned && this.pendingImperialWard?.playerId === playerId) {
      const player = this.players.get(playerId);
      if (player) player.imperialWardCharges = this.pendingImperialWard.charges;
      this.pendingImperialWard = undefined;
    }
    return spawned;
  }

  enqueueBackgroundJob(job: () => void): void {
    this.enqueueJob("ai", job, undefined, "background");
  }

  repairZeroGrossIncomeSettlements(playerIds: Iterable<string>): GrossIncomeRepairResult {
    return repairZeroGrossIncomeSettlementsImpl(
      {
        players: this.players,
        hasTerritory: (playerId) => (this.playerSummaries.get(playerId)?.territoryTileKeys.size ?? 0) > 0,
        ensureGrossIncomeSettlementForPlayer: (playerId, commandId) =>
          this.ensureGrossIncomeSettlementForPlayer(playerId, commandId)
      },
      playerIds
    );
  }

  queueDepths(): Record<QueueLane, number> {
    return computeQueueDepths(this.jobsByLane);
  }

  queueBacklogMs(nowMs = this.now()): Record<QueueLane, number> {
    return computeQueueBacklogMs(this.jobsByLane, nowMs);
  }

  private summaryForPlayer(playerId: string): PlayerRuntimeSummary {
    const existing = this.playerSummaries.get(playerId);
    if (existing) return existing;
    const summary = createEmptyPlayerRuntimeSummary();
    this.playerSummaries.set(playerId, summary);
    this.plannerPlayerTileCollectionVersionByPlayer.set(playerId, 0);
    this.territoryVersionByPlayer.set(playerId, 0);
    return summary;
  }

  private markPlannerPlayerTopologyTileChanged(playerId: string, tileKey: string): void {
    const nextVersion = (this.plannerPlayerTopologyVersionByPlayer.get(playerId) ?? 0) + 1;
    this.plannerPlayerTopologyVersionByPlayer.set(playerId, nextVersion);
    let dirty = this.plannerPlayerTopologyDirtyTilesByPlayer.get(playerId);
    if (!dirty) {
      dirty = new Set();
      this.plannerPlayerTopologyDirtyTilesByPlayer.set(playerId, dirty);
    }
    dirty.add(tileKey);
  }

  private markPlannerPlayerTileCollectionDirty(playerId: string): void {
    const nextVersion = (this.plannerPlayerTileCollectionVersionByPlayer.get(playerId) ?? 0) + 1;
    this.plannerPlayerTileCollectionVersionByPlayer.set(playerId, nextVersion);
    // plannerPlayerTileKeyCacheByPlayer stays live via targeted mutation hooks
    // (applyTileToPlayerSummaries etc.); plannerPlayerTileKeys() re-inits from
    // summary only if no entry exists.
  }

  private plannerPlayerTileKeys(playerId: string, summary: PlayerRuntimeSummary): PlannerPlayerTileKeysResult {
    return plannerPlayerTileKeysImpl(playerId, summary, this.plannerPlayerTileKeysContext);
  }

  private playerManpowerCap(player: RuntimePlayer): number {
    if (player.id === "barbarian-1") return Number.MAX_SAFE_INTEGER;
    return playerManpowerCapFromSummary(this.summaryForPlayer(player.id));
  }

  private playerManpowerRegenPerMinute(player: RuntimePlayer): number {
    const depotCount = this.railDepotTilesByOwner.get(player.id)?.size ?? 0;
    return playerManpowerRegenPerMinuteFromSummary(this.summaryForPlayer(player.id), depotCount);
  }

  playerLogisticsThroughputPerMinute(player: RuntimePlayer): number {
    // Logistics throughput = same as manpower regen for now; tune later.
    return this.playerManpowerRegenPerMinute(player);
  }

  private playerManpowerBreakdown(player: RuntimePlayer): ManpowerBreakdown {
    const depotCount = this.railDepotTilesByOwner.get(player.id)?.size ?? 0;
    return playerManpowerBreakdownFromSummary(this.summaryForPlayer(player.id), depotCount);
  }

  private effectiveManpowerAt(player: RuntimePlayer, nowMs = this.now()): number {
    const cap = this.playerManpowerCap(player);
    return effectiveManpowerAt(player, cap, this.playerManpowerRegenPerMinute(player), nowMs);
  }

  private applyManpowerRegen(player: RuntimePlayer, nowMs = this.now()): void {
    this.applyEconomyAccrual(player, nowMs);
    this.refreshManpowerOnly(player, nowMs);
  }

  /**
   * Manpower-only variant of {@link applyManpowerRegen} that skips the
   * economy-accrual side effect. The accrual is O(territory tiles) per call
   * (it sorts the player's territory tile keys for upkeep collection); doing
   * it per player on every planner-state export was the dominant source of
   * the recurring 1.4-2.0 s `sync_players_export` block on staging. Skipping
   * here is safe because the accrual still runs on every real command path
   * and on the periodic tick, so player gold/resources catch up within a
   * single planner cycle.
   */
  private refreshManpowerOnly(player: RuntimePlayer, nowMs = this.now()): void {
    const cap = this.playerManpowerCap(player);
    if (!Number.isFinite(player.manpower)) {
      player.manpower = cap;
      player.manpowerUpdatedAt = nowMs;
      player.manpowerCapSnapshot = cap;
      return;
    }
    const previousCap = Number.isFinite(player.manpowerCapSnapshot) ? player.manpowerCapSnapshot! : cap;
    if (cap > previousCap) {
      player.manpower = Math.min(cap, Math.max(0, player.manpower) + (cap - previousCap));
    }
    if (!Number.isFinite(player.manpowerUpdatedAt)) {
      player.manpower = Math.max(0, Math.min(cap, player.manpower));
      player.manpowerUpdatedAt = nowMs;
      player.manpowerCapSnapshot = cap;
      return;
    }
    player.manpower = this.effectiveManpowerAt(player, nowMs);
    player.manpowerUpdatedAt = nowMs;
    player.manpowerCapSnapshot = cap;
  }

  /**
   * Returns a cached PlayerUpdateEconomySnapshot for the player, rebuilding it
   * only when the cache has been invalidated (i.e., a tile affecting this
   * player's income changed via replaceTileState).
   *
   * The snapshot is built with full dock context so both the accrual path and
   * the emit path share a single entry.  The dock context affects only
   * `incomePerMinute` (display), not the upkeep rates consumed by accrual math,
   * so this is safe for all callers.
   *
   * Cache miss cost: O(settled tiles).  Cache hit cost: O(1).
   * Invalidated on every replaceTileState — O(1) per mutation.
   */
  private cachedEconomySnapshot(player: RuntimePlayer): PlayerUpdateEconomySnapshot {
    const cached = this.economySnapshotCacheByPlayer.get(player.id);
    if (cached) return cached;
    const rebuild = (): PlayerUpdateEconomySnapshot => {
      const summary = this.summaryForPlayer(player.id);
      let econMult = 1;
      if (EMPIRE_INTEGRITY_ENABLED) {
        // Read from the defensibility cache without triggering a rebuild here —
        // emitPlayerStateUpdate always calls cachedDefensibilityMetrics() before
        // cachedEconomySnapshot(), so the cache is warm on the normal command path.
        // Callers outside emitPlayerStateUpdate (login snapshot, passive income)
        // get econMult=1 when the cache is cold, which is acceptable because
        // emitPlayerStateUpdate will emit the corrected value in the same tick.
        const metrics = this.defensibilityMetricsCacheByPlayer.get(player.id);
        if (metrics) {
          econMult = integrityEconomyMult(empireIntegrity(metrics.Ts, metrics.Es));
        }
      }
      const settledTiles = this.settledTilesForPlayer(player.id);
      const townNetwork = this.cachedTownNetworkForPlayer(player, settledTiles, 0);
      const snapshot = buildPlayerUpdateEconomySnapshot(player, summary, this.tiles, {
        dockLinksByDockTileKey: this.dockLinksByDockTileKey
      }, econMult, townNetwork);
      this.economySnapshotCacheByPlayer.set(player.id, snapshot);
      return snapshot;
    };
    // Attribution for event_loop_blocked (was empty mainThreadTasks): scales
    // with settled/owned tile count; hit from passive income + command handlers.
    return this.trackSyncMainThreadTask
      ? this.trackSyncMainThreadTask("cached_economy_snapshot_rebuild", { playerId: player.id }, rebuild)
      : rebuild();
  }

  /**
   * Returns the incremental upkeep accrual snapshot for `player`.
   * Cache hit: O(1).  Cache miss (first access or after tech/domain change): O(settled tiles).
   * Kept warm by replaceTileState O(1) add/subtract on every tile mutation.
   *
   * Every UPKEEP_ACCRUAL_REBUILD_INTERVAL reads we force a full rebuild to bound
   * floating-point drift from the running add/subtract sum over a long-lived
   * season. Drift per op is ~1e-16 relative, so this is defense-in-depth; the
   * interval keeps the periodic O(settled-tiles) rebuild rare.
   */
  private cachedUpkeepAccrual(player: RuntimePlayer): UpkeepAccrualSnapshot {
    const reads = (this.upkeepAccrualReadCountByPlayer.get(player.id) ?? 0) + 1;
    this.upkeepAccrualReadCountByPlayer.set(player.id, reads);
    if (reads % UPKEEP_ACCRUAL_REBUILD_INTERVAL === 0) {
      this.upkeepAccrualCacheByPlayer.delete(player.id);
    }
    const cached = this.upkeepAccrualCacheByPlayer.get(player.id);
    if (cached) return cached;
    const snapshot = buildUpkeepAccrualSnapshot(player.id, player, this.tiles);
    this.upkeepAccrualCacheByPlayer.set(player.id, snapshot);
    return snapshot;
  }

  private cachedDefensibilityMetrics(
    playerId: string,
    summary: PlayerRuntimeSummary
  ): { T: number; E: number; Ts: number; Es: number } {
    const cached = this.defensibilityMetricsCacheByPlayer.get(playerId);
    if (cached) return cached;
    const metrics = buildPlayerDefensibilityMetrics(playerId, this.tiles, summary.territoryTileKeys);
    this.defensibilityMetricsCacheByPlayer.set(playerId, metrics);
    return metrics;
  }

  private upkeepAccrualContext(): RuntimeUpkeepAccrualContext {
    return {
      tiles: this.tiles,
      dockLinksByDockTileKey: this.dockLinksByDockTileKey,
      lastEconomyAccrualAtByPlayer: this.lastEconomyAccrualAtByPlayer,
      playerSummaries: this.playerSummaries,
      yieldBearingTilesByOwner: this.yieldBearingTilesByOwner,
      sortedYieldBearingKeysByOwner: this.sortedYieldBearingKeysByOwner,
      tileYieldCollectedAtByTile: this.tileYieldCollectedAtByTile,
      cachedUpkeepAccrual: (player) => this.cachedUpkeepAccrual(player),
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      tileYieldEconomyContextForPlayer: (player) => this.tileYieldEconomyContextForPlayer(player),
      enrichTileWithTownContext: (tile, player, context) => this.enrichTileWithTownContext(tile, player, context),
      tileYieldCollectedAt: (tileKey, ownerId) => this.tileYieldCollectedAt(tileKey, ownerId),
      emitEvent: (event) => this.emitEvent(event),
      forgetReplayedCommand: (commandId) => this.replayCache.recordedEventsByCommandId.delete(commandId),
      trackSyncMainThreadTask: this.trackSyncMainThreadTask
    };
  }

  private applyEconomyAccrual(player: RuntimePlayer, nowMs = this.now()): void {
    applyEconomyAccrualImpl(this.upkeepAccrualContext(), player, nowMs);
  }

  private applyTileToPlayerSummaries(tileKey: string, tile: DomainTileState): void {
    if (!tile.ownerId) return;
    applyTileToPlayerSummary(this.summaryForPlayer(tile.ownerId), tileKey, tile);
    // Mirror the summary mutation into the incremental cache (O(1)).
    const cacheEntry = this.plannerPlayerTileKeyCacheByPlayer.get(tile.ownerId);
    if (cacheEntry) {
      incrementalAdd(cacheEntry.territory, tileKey);
      if (tile.ownershipState === "FRONTIER") incrementalAdd(cacheEntry.frontier, tileKey);
    }
    this.markPlannerPlayerTileCollectionDirty(tile.ownerId);
  }

  private removeTileFromPlayerSummaries(tileKey: string, tile: DomainTileState): void {
    if (!tile.ownerId) return;
    removeTileFromPlayerSummary(this.summaryForPlayer(tile.ownerId), tileKey, tile);
    // Mirror the summary mutation into the incremental cache (O(1)).
    const cacheEntry = this.plannerPlayerTileKeyCacheByPlayer.get(tile.ownerId);
    if (cacheEntry) {
      incrementalRemove(cacheEntry.territory, tileKey);
      incrementalRemove(cacheEntry.frontier, tileKey);
    }
    this.markPlannerPlayerTileCollectionDirty(tile.ownerId);
  }

  private replaceTileState(tileKey: string, tile: DomainTileState, commandId = `tile-owner-change:${tileKey}`): void {
    this.tileDeltaStringifyCache.invalidate(tileKey);
    const previous = this.tiles.get(tileKey);
    const sameOwner = Boolean(previous?.ownerId && previous.ownerId === tile.ownerId);
    // See refreshEconomyCachesForTileChange for why this is gated on SETTLED
    // ownership instead of invalidating unconditionally on every mutation.
    refreshEconomyCachesForTileChange({
      previous,
      next: tile,
      players: this.players,
      economySnapshotCacheByPlayer: this.economySnapshotCacheByPlayer,
      tileYieldContextCacheByPlayer: this.tileYieldContextCacheByPlayer,
      townNetworkCacheByPlayer: this.townNetworkCacheByPlayer,
      defensibilityMetricsCacheByPlayer: this.defensibilityMetricsCacheByPlayer,
      upkeepAccrualCacheByPlayer: this.upkeepAccrualCacheByPlayer
    });
    // Maintain settledAt timestamp for the tile-shedding ticker:
    //   - newly SETTLED (previously not, or new owner) → stamp `now`
    //   - leaves SETTLED → clear
    //   - stays SETTLED for the same owner → preserve existing stamp
    const wasSettledForSameOwner =
      sameOwner && previous?.ownershipState === "SETTLED" && tile.ownershipState === "SETTLED";
    if (tile.ownershipState === "SETTLED" && tile.ownerId) {
      if (!wasSettledForSameOwner) {
        this.tileSettledAtByKey.set(tileKey, this.now());
      }
    } else {
      this.tileSettledAtByKey.delete(tileKey);
    }
    const previousOwnerTileOrder =
      previous?.ownerId && sameOwner
        ? [...this.summaryForPlayer(previous.ownerId).territoryTileKeys]
        : undefined;
    const previousOwnerTownOrder =
      previous?.ownerId && sameOwner
        ? [...this.summaryForPlayer(previous.ownerId).ownedTownTierByTile.keys()]
        : undefined;
    // A town of any tier existed and is now gone (e.g. razed on capture) —
    // distinct from ownerId changing, since a captured town often survives.
    const townLost = Boolean(previous?.town) && !tile.town;
    if (previous && (previous.ownerId !== tile.ownerId || townLost)) {
      this.onOwnershipChange?.({
        tileKey,
        x: tile.x,
        y: tile.y,
        previousOwnerId: previous.ownerId,
        nextOwnerId: tile.ownerId,
        commandId,
        hadTown: Boolean(previous.town),
        townLost,
        hadOwnershipState: previous.ownershipState
      });
    }
    if (previous) this.removeTileFromPlayerSummaries(tileKey, previous);
    this.tiles.set(tileKey, tile);
    this.snapshotTileCache.set(tileKey, mapTile(tile));
    this.applyTileToPlayerSummaries(tileKey, tile);
    if (!sameOwner) {
      if (previous?.ownerId) this.markPlannerPlayerTopologyTileChanged(previous.ownerId, tileKey);
      if (tile.ownerId) this.markPlannerPlayerTopologyTileChanged(tile.ownerId, tileKey);
      // Ownership changed → bump the territory version so VisionExpansionCache
      // knows to recompute. Same-owner mutations (muster, pop growth, income)
      // leave this counter unchanged so the O(territory×r²) expansion stays warm.
      if (previous?.ownerId) this.territoryVersionByPlayer.set(previous.ownerId, (this.territoryVersionByPlayer.get(previous.ownerId) ?? 0) + 1);
      if (tile.ownerId) this.territoryVersionByPlayer.set(tile.ownerId, (this.territoryVersionByPlayer.get(tile.ownerId) ?? 0) + 1);
      this.visibilityCoverage.tileOwnershipChanged(previous?.ownerId, tile.ownerId, tile.x, tile.y, this.visionTransitions.callbacks);
    }
    if (previousOwnerTileOrder && tile.ownerId) {
      const summary = this.summaryForPlayer(tile.ownerId);
      const currentKeys = new Set(summary.territoryTileKeys);
      summary.territoryTileKeys.clear();
      for (const key of previousOwnerTileOrder) {
        if (currentKeys.delete(key)) summary.territoryTileKeys.add(key);
      }
      for (const key of currentKeys) summary.territoryTileKeys.add(key);
    }
    if (previousOwnerTownOrder && tile.ownerId) {
      const summary = this.summaryForPlayer(tile.ownerId);
      const currentTowns = new Map(summary.ownedTownTierByTile);
      summary.ownedTownTierByTile.clear();
      for (const key of previousOwnerTownOrder) {
        const tier = currentTowns.get(key);
        if (tier) {
          summary.ownedTownTierByTile.set(key, tier);
          currentTowns.delete(key);
        }
      }
      for (const [key, tier] of currentTowns) summary.ownedTownTierByTile.set(key, tier);
    }
    this.refreshPlannerCandidateIndexesAroundTileChange(tileKey, previous, tile);
    this.refreshPlayerCandidateIndexAnchorForTile(tileKey, previous, tile);
    refreshRuntimeTileIndexesForChange({
      tileKey,
      previous,
      next: tile,
      frontierTilesByOwner: this.frontierTilesByOwner,
      activeFortAnchorsByOwner: this.activeFortAnchorsByOwner,
      yieldBearingTilesByOwner: this.yieldBearingTilesByOwner,
      sortedYieldBearingKeysByOwner: this.sortedYieldBearingKeysByOwner,
      activeSiegeOutpostsByOwner: this.activeSiegeOutpostsByOwner,
      activeLightOutpostsByOwner: this.activeLightOutpostsByOwner,
      musterTilesByOwner: this.musterTilesByOwner,
      fortTilesByOwner: this.fortTilesByOwner,
      railDepotTilesByOwner: this.railDepotTilesByOwner
    });
    if (refreshNeutralBeaconIndexForTileImpl({ tileKey, previous, next: tile, neutralBeaconTileKeys: this.neutralBeaconTileKeys })) {
      this.beaconGeneration += 1;
    }
    // Structure count index: keep ownedStructureCountByPlayerByType consistent
    // across capture / build / cancel / removal transitions. Each slot is
    // tracked by the STRUCTURE's ownerId (not the tile's), to match the
    // ownedStructureCountForPlayer contract used by structureBuildGoldCost.
    this.refreshOwnedStructureCountIndexForTile(previous, tile);
    if (previous?.ownerId !== tile.ownerId) this.cancelPendingSettlementIfOwnerChanged(tileKey, tile.ownerId, commandId);
    flushRadiusYieldRefresh({ tileKey, previous, next: tile, tiles: this.tiles, dockLinksByDockTileKey: this.dockLinksByDockTileKey, settledTilesForPlayer: (p) => this.settledTilesForPlayer(p), tileDeltaFromState: (t) => this.tileDeltaFromState(t), emitEvent: (e) => this.emitEvent(e), now: () => this.now() });
  }

  // Update the per-tile collect anchor and emit the matching event so replay can
  // reconstruct it. Every site that mutates tileYieldCollectedAtByTile during
  // gameplay (settle, respawn, collect) must go through this helper — otherwise
  // a sim restart between snapshots will not see the change.
  private setTileYieldCollectedAt(commandId: string, playerId: string, tileKey: string, collectedAt: number): void {
    this.tileYieldCollectedAtByTile.set(tileKey, collectedAt);
    this.emitEvent({
      eventType: "TILE_YIELD_ANCHOR_UPDATED",
      commandId,
      playerId,
      tileKey,
      collectedAt
    });
  }

  private setPlayerYieldCollectionEpoch(commandId: string, playerId: string, collectedAt: number): void {
    this.lastIncomeTickAtMsByPlayer.set(playerId, collectedAt);
    this.emitEvent({
      eventType: "PLAYER_YIELD_COLLECTION_EPOCH_UPDATED",
      commandId,
      playerId,
      collectedAt
    });
  }

  private tileYieldCollectedAt(tileKey: string, ownerId?: string): number | undefined {
    const tileAnchor = this.tileYieldCollectedAtByTile.get(tileKey);
    const playerAnchor = ownerId ? this.lastIncomeTickAtMsByPlayer.get(ownerId) : undefined;
    if (typeof tileAnchor === "number" && typeof playerAnchor === "number") return Math.max(tileAnchor, playerAnchor);
    return tileAnchor ?? playerAnchor;
  }

  private rebuildPlannerCandidateIndexesForPlayer(playerId: string): void {
    rebuildPlannerCandidateIndexesForPlayerImpl({
      playerId,
      tiles: this.tiles,
      summary: this.summaryForPlayer(playerId),
      markPlannerPlayerTileCollectionDirty: (id) => this.markPlannerPlayerTileCollectionDirty(id),
      onCandidateRebuildComplete: (id, summary) => {
        // After a full rebuild of hot/strategic/buildCandidate, reset the
        // incremental cache entry for those three sub-fields from the now-correct
        // summary Sets.  territory, frontier, and pendingSettlement are not
        // touched by rebuildPlannerCandidateIndexes so they stay valid.
        const entry = this.plannerPlayerTileKeyCacheByPlayer.get(id);
        if (entry) {
          resetFromIterable(entry.hotFrontier, summary.hotFrontierTileKeys);
          resetFromIterable(entry.strategicFrontier, summary.strategicFrontierTileKeys);
          resetFromIterable(entry.buildCandidate, summary.buildCandidateTileKeys);
        }
      }
    });
  }

  private refreshPlannerCandidateIndexesAroundTileChange(
    tileKey: string,
    previous?: DomainTileState,
    next?: DomainTileState
  ): void {
    refreshPlannerCandidateIndexesAroundTileChangeImpl({
      tileKey,
      previous,
      next,
      tiles: this.tiles,
      playerCandidateIndex: this.playerCandidateIndex,
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      markPlannerPlayerTileCollectionDirty: (playerId) => this.markPlannerPlayerTileCollectionDirty(playerId),
      onCandidateKeysUpdated: (playerId, affectedKeys, summary) => {
        // Mirror the hot/strategic/build candidate updates into the incremental
        // cache.  affectedKeys is a bounded neighborhood (≤25 tiles at r=2),
        // so this is O(1) in practice regardless of empire size.
        const entry = this.plannerPlayerTileKeyCacheByPlayer.get(playerId);
        if (!entry) return;
        for (const candidateKey of affectedKeys) {
          // Re-check the summary Sets (which are already updated at this point)
          // to determine whether each affected key should be in the cached arrays.
          if (summary.hotFrontierTileKeys.has(candidateKey)) {
            incrementalAdd(entry.hotFrontier, candidateKey);
          } else {
            incrementalRemove(entry.hotFrontier, candidateKey);
          }
          if (summary.strategicFrontierTileKeys.has(candidateKey)) {
            incrementalAdd(entry.strategicFrontier, candidateKey);
          } else {
            incrementalRemove(entry.strategicFrontier, candidateKey);
          }
          if (summary.buildCandidateTileKeys.has(candidateKey)) {
            incrementalAdd(entry.buildCandidate, candidateKey);
          } else {
            incrementalRemove(entry.buildCandidate, candidateKey);
          }
        }
      }
    });
  }

  private refreshPlayerCandidateIndexAnchorForTile(
    tileKey: string,
    previous: DomainTileState | undefined,
    next: DomainTileState
  ): void {
    refreshPlayerCandidateIndexAnchorForTileImpl({
      playerCandidateIndex: this.playerCandidateIndex,
      tiles: this.tiles,
      tileKey,
      previous,
      next
    });
  }

  private removeFrontierTileFromOwnerIndex(tileKey: string, ownerId: string): void {
    removeFrontierTileFromOwnerIndexImpl(this.frontierTilesByOwner, tileKey, ownerId);
  }

  private refreshFortAnchorIndexForTile(
    tileKey: string,
    previous: DomainTileState | undefined,
    next: DomainTileState
  ): void {
    refreshFortAnchorIndexForTileImpl({
      activeFortAnchorsByOwner: this.activeFortAnchorsByOwner,
      tileKey,
      previous,
      next
    });
  }


  private addPendingSettlement(record: PendingSettlementRecord): void {
    this.pendingSettlementsByTile.set(record.tileKey, record);
    addPendingSettlementToSummary(this.summaryForPlayer(record.ownerId), record);
    // Mirror into the incremental cache (O(1)).
    const cacheEntry = this.plannerPlayerTileKeyCacheByPlayer.get(record.ownerId);
    if (cacheEntry) incrementalAdd(cacheEntry.pendingSettlement, record.tileKey);
    this.markPlannerPlayerTileCollectionDirty(record.ownerId);
  }

  private removePendingSettlement(tileKey: string): PendingSettlementRecord | undefined {
    const record = this.pendingSettlementsByTile.get(tileKey);
    if (!record) return undefined;
    this.pendingSettlementsByTile.delete(tileKey);
    removePendingSettlementFromSummary(this.summaryForPlayer(record.ownerId), tileKey);
    // Mirror into the incremental cache (O(1)).
    const cacheEntry = this.plannerPlayerTileKeyCacheByPlayer.get(record.ownerId);
    if (cacheEntry) incrementalRemove(cacheEntry.pendingSettlement, tileKey);
    this.markPlannerPlayerTileCollectionDirty(record.ownerId);
    return record;
  }

  private pendingSettlementMatches(record: PendingSettlementRecord | undefined, expected: PendingSettlementRecord): boolean {
    return Boolean(
      record &&
        record.ownerId === expected.ownerId &&
        record.tileKey === expected.tileKey &&
        record.startedAt === expected.startedAt &&
        record.resolvesAt === expected.resolvesAt &&
        record.goldCost === expected.goldCost
    );
  }

  private cancelPendingSettlementIfOwnerChanged(
    tileKey: string,
    nextOwnerId: string | undefined,
    commandId: string
  ): PendingSettlementRecord | undefined {
    const pendingSettlement = this.pendingSettlementsByTile.get(tileKey);
    if (!pendingSettlement || pendingSettlement.ownerId === nextOwnerId) return undefined;
    this.removePendingSettlement(tileKey);
    this.emitPlayerStateUpdate({ commandId, playerId: pendingSettlement.ownerId });
    return pendingSettlement;
  }

  private tileKeySetToTiles(keys: Iterable<string>): DomainTileState[] {
    const result: DomainTileState[] = [];
    for (const key of keys) {
      const tile = this.tiles.get(key);
      if (tile) result.push(tile);
    }
    return result;
  }

  private pendingSettlementsSnapshotForPlayer(playerId: string): Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> {
    return [...this.summaryForPlayer(playerId).pendingSettlementsByTile.values()]
      .map((settlement) => {
        const [rawX, rawY] = settlement.tileKey.split(",");
        const x = Number(rawX);
        const y = Number(rawY);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y, startedAt: settlement.startedAt, resolvesAt: settlement.resolvesAt } : undefined;
      })
      .filter((settlement): settlement is NonNullable<typeof settlement> => Boolean(settlement))
      .sort((left, right) => (left.resolvesAt - right.resolvesAt) || (left.x - right.x) || (left.y - right.y));
  }

  chooseNextOwnedFrontierCommand(
    playerId: string,
    clientSeq: number,
    issuedAt: number,
    sessionPrefix: "ai-runtime" | "system-runtime"
  ): CommandEnvelope | undefined {
    for (const lock of this.locksByTile.values()) {
      if (lock.playerId === playerId) return undefined;
    }
    const ownedTiles = this.tileKeySetToTiles(this.summaryForPlayer(playerId).territoryTileKeys);
    const player = this.players.get(playerId);
    return chooseNextOwnedFrontierCommandFromLookup(this.tiles, ownedTiles, playerId, clientSeq, issuedAt, sessionPrefix, {
      canAttack: (player?.points ?? 0) >= FRONTIER_CLAIM_COST && (player?.manpower ?? 0) >= ATTACK_MANPOWER_MIN,
      canExpand: (player?.points ?? 0) >= FRONTIER_CLAIM_COST,
      dockLinksByDockTileKey: this.dockLinksByDockTileKey
    });
  }

  explainNextAutomationCommand(
    playerId: string,
    clientSeq: number,
    issuedAt: number,
    sessionPrefix: "ai-runtime" | "system-runtime",
    options?: { skipPreplan?: boolean; reservedDevelopmentSlots?: number; decisionCooldowns?: DecisionCooldownMap }
  ): { command?: CommandEnvelope; diagnostic: AutomationPlannerDiagnostic } {
    const player = this.players.get(playerId);
    if (!player) {
      return {
        diagnostic: createAutomationNoopDiagnostic(playerId, sessionPrefix, "player_missing")
      };
    }
    const summary = this.summaryForPlayer(playerId);
    if (summary.territoryTileKeys.size <= 0) {
      this.rememberedAutomationVictoryPathByPlayer.delete(playerId);
      this.aiSpatialFocusByPlayer.delete(playerId);
      this.aiSpatialFocusProductiveByPlayer.delete(playerId);
      this.visionExpansionCache.invalidate(playerId);
      if (player.isAi) {
        const nowMs = this.now();
        const lastAttempt = this.lastAiRespawnAttemptMsByPlayer.get(playerId) ?? 0;
        if (nowMs - lastAttempt >= SimulationRuntime.AI_RESPAWN_RETRY_INTERVAL_MS) {
          this.lastAiRespawnAttemptMsByPlayer.set(playerId, nowMs);
          this.respawnIfEliminated(playerId, `ai-zero-tile-check:${playerId}:${nowMs}`);
        }
      }
    }
    const ownedTiles = this.tileKeySetToTiles(summary.territoryTileKeys);
    const spatialFocus = this.refreshSpatialFocusForPlayer(playerId, this.now());
    // No-alloc per-tick check: short-circuit on first player-issued lock.
    // Allocating a Set for one .has() lookup would be wasteful in the AI
    // planner hot path (per AI per planner tick).
    let hasActiveLock = false;
    for (const lock of this.locksByTile.values()) {
      if (lock.playerId !== playerId) continue;
      if (lock.source === "automation") continue;
      hasActiveLock = true;
      break;
    }
    let preplanDiagnostic: AutomationPlannerDiagnostic | undefined;
    if (!options?.skipPreplan) {
      const preplan = chooseAutomationPreplanCommand({
        playerId,
        points: player.points,
        techIds: [...player.techIds],
        domainIds: player.domainIds ? [...player.domainIds] : [],
        strategicResources: { ...(player.strategicResources ?? {}) },
        settledTileCount: summary.settledTileCount,
        townCount: summary.townCount,
        incomePerMinute: this.estimatedIncomePerMinuteForPlayer(playerId),
        hasActiveLock,
        ownedTiles,
        clientSeq,
        issuedAt,
        sessionPrefix
      });
      preplanDiagnostic = preplan.diagnostic;
      if (preplan.command) return preplan;
    }
    const plan = planAutomationCommand({
      playerId,
      points: player.points,
      manpower: player.manpower,
      ...([...player.techIds].length ? { techIds: [...player.techIds] } : {}),
      ...((player.domainIds ? [...player.domainIds] : []).length ? { domainIds: [...(player.domainIds ?? [])] } : {}),
      ...(Object.keys(player.strategicResources ?? {}).length ? { strategicResources: { ...(player.strategicResources ?? {}) } } : {}),
      settledTileCount: summary.settledTileCount,
      townCount: summary.townCount,
      incomePerMinute: this.estimatedIncomePerMinuteForPlayer(playerId),
      hasActiveLock,
      activeDevelopmentProcessCount: summary.activeDevelopmentProcessCount,
      ...(options?.reservedDevelopmentSlots ? { reservedDevelopmentSlots: options.reservedDevelopmentSlots } : {}),
      ownedStructureCounts: this.ownedStructureCountsForPlayer(playerId),
      frontierTiles: this.tileKeySetToTiles(summary.frontierTileKeys),
      hotFrontierTiles: this.tileKeySetToTiles(summary.hotFrontierTileKeys),
      strategicFrontierTiles: this.tileKeySetToTiles(summary.strategicFrontierTileKeys),
      buildCandidateTiles: this.tileKeySetToTiles(summary.buildCandidateTileKeys),
      ownedTiles,
      tilesByKey: this.tiles,
      dockLinksByDockTileKey: this.dockLinksByDockTileKey,
      playerScopeKeyCount: plannerPlayerScopeKeyCount(summary),
      playerScopeTileCount: plannerPlayerScopeKeyCount(summary),
      previousVictoryPath: this.rememberedAutomationVictoryPathByPlayer.get(playerId),
      pathPopulationCounts: this.rememberedAutomationVictoryPathCounts(),
      onStrategicSnapshot: (snapshot) => {
        if (summary.territoryTileKeys.size <= 0) return;
        this.rememberedAutomationVictoryPathByPlayer.set(playerId, snapshot.primaryVictoryPath);
      },
      ...(preplanDiagnostic?.preplanProgressState ? { preplanProgressState: preplanDiagnostic.preplanProgressState } : {}),
      ...(spatialFocus ? { spatialFocusFront: spatialFocus.primaryFront } : {}),
      ...(options?.decisionCooldowns ? { decisionCooldowns: options.decisionCooldowns } : {}),
      clientSeq,
      issuedAt,
      sessionPrefix
    });
    if (preplanDiagnostic?.preplanReason) {
      plan.diagnostic = mergePreplanDiagnostic(plan.diagnostic, preplanDiagnostic);
    }
    if (typeof plan.diagnostic.scanFoundActionableCandidate === "boolean") {
      this.aiSpatialFocusProductiveByPlayer.set(playerId, plan.diagnostic.scanFoundActionableCandidate);
    } else {
      // No scan ran this tick (e.g. active_lock noop) - clear any cached
      // value instead of leaving a stale one, so the next refresh sees "no
      // signal" (treated as productive) rather than a lock-outlasting false.
      this.aiSpatialFocusProductiveByPlayer.delete(playerId);
    }
    return plan;
  }

  chooseNextAutomationCommand(
    playerId: string,
    clientSeq: number,
    issuedAt: number,
    sessionPrefix: "ai-runtime" | "system-runtime"
  ): CommandEnvelope | undefined {
    return this.explainNextAutomationCommand(playerId, clientSeq, issuedAt, sessionPrefix).command;
  }

  submitCommand(command: CommandEnvelope): void {
    this.replayCache.pruneReplayCaches();
    if (this.replayCache.isTerminalOnlyReplayCommand(command.commandId)) return;
    const existingEvents = this.replayCache.recordedEventsByCommandId.get(command.commandId);
    if (existingEvents) {
      for (const event of existingEvents) this.events.emit("event", event);
      return;
    }

    if (command.type !== "SYNC_ALLIANCE" && command.type !== "SYNC_TRUCE") {
      const playerSeqKey = `${command.playerId}:${command.clientSeq}`;
      const existingCommandId = this.replayCache.commandIdsByPlayerSeq.get(playerSeqKey);
      if (existingCommandId) {
        if (this.replayCache.isTerminalOnlyReplayCommand(existingCommandId)) return;
        const replayEvents = this.replayCache.recordedEventsByCommandId.get(existingCommandId);
        if (replayEvents) {
          for (const event of replayEvents) this.events.emit("event", event);
          return;
        }
        this.replayCache.commandIdsByPlayerSeq.delete(playerSeqKey);
      }

      this.replayCache.commandIdsByPlayerSeq.set(playerSeqKey, command.commandId);
    }
    this.persistence.recordCommand(command);
    this.queueCommandForProcessing(command);
  }

  snapshot(): { commands: CommandEnvelope[]; events: SimulationEvent[] } {
    return this.persistence.snapshot();
  }

  /**
   * Replay-cache observability (counter-on-skip rule). `recordedCommandHistorySize`
   * is the number of commands whose events are embedded in each snapshot — the
   * value that previously leaked to 122k/37MB. `serverEventsSkipped` counts events
   * excluded as server-generated; `recordedHistoryEvicted` counts hard-cap
   * evictions (non-zero means an unforeseen server prefix is leaking).
   */
  replayCacheStats(): { recordedCommandHistorySize: number; serverEventsSkipped: number; recordedHistoryEvicted: number } {
    return {
      recordedCommandHistorySize: this.replayCache.recordedEventsByCommandId.size,
      serverEventsSkipped: this.replayCache.serverEventsSkipped,
      recordedHistoryEvicted: this.replayCache.recordedHistoryEvicted
    };
  }

  exportSnapshotSections(): SimulationSnapshotSections {
    return buildRuntimeSnapshotSections({
      tiles: this.tiles,
      locksByCommandId: this.locksByCommandId,
      players: this.players,
      pendingSettlementsByTile: this.pendingSettlementsByTile,
      tileYieldCollectedAtByTile: this.tileYieldCollectedAtByTile,
      playerYieldCollectionEpochByPlayer: this.lastIncomeTickAtMsByPlayer,
      docks: this.docks,
      recordedEventsByCommandId: this.replayCache.recordedEventsByCommandId,
      incomePerMinuteForPlayer: (playerId) => this.incomePerMinuteForPlayer(playerId),
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId)
    });
  }

  async exportSnapshotSectionsAsync(yieldToEventLoop: () => Promise<void>): Promise<SimulationSnapshotSections> {
    return buildRuntimeSnapshotSectionsAsync({
      tiles: this.tiles,
      locksByCommandId: this.locksByCommandId,
      players: this.players,
      pendingSettlementsByTile: this.pendingSettlementsByTile,
      tileYieldCollectedAtByTile: this.tileYieldCollectedAtByTile,
      playerYieldCollectionEpochByPlayer: this.lastIncomeTickAtMsByPlayer,
      docks: this.docks,
      recordedEventsByCommandId: this.replayCache.recordedEventsByCommandId,
      incomePerMinuteForPlayer: (playerId) => this.incomePerMinuteForPlayer(playerId),
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      prebuiltTiles: this.snapshotTileCache
    }, yieldToEventLoop);
  }

  exportPlannerWorldView(playerIds: string[]): PlannerWorldView {
    return buildRuntimePlannerWorldView({
      playerIds,
      tiles: this.tiles,
      docks: this.docks,
      players: this.players,
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      plannerGatingLockPlayerIds: () => this.plannerGatingLockPlayerIds(),
      refreshManpowerOnly: (player) => this.refreshManpowerOnly(player),
      plannerPlayerTileKeys: (playerId, summary) => this.plannerPlayerTileKeys(playerId, summary),
      ownedStructureCountsForPlayer: (playerId) => this.ownedStructureCountsForPlayer(playerId),
      estimatedIncomePerMinuteForPlayer: (playerId) => this.estimatedIncomePerMinuteForPlayer(playerId),
      neutralBeaconTileKeys: this.neutralBeaconTileKeys,
      beaconGeneration: this.beaconGeneration,
      yieldBearingTilesByOwner: this.yieldBearingTilesByOwner,
      expansionObjectiveCacheByPlayer: this.expansionObjectiveCacheByPlayer,
      musterTilesByOwner: this.musterTilesByOwner
    });
  }

  // Cheap O(players) aggregate of empire sizes for the scale metric. Uses the
  // incrementally-maintained per-player territory Sets (Set.size is O(1)); does
  // NOT iterate the 202,500-tile world. Excludes barbarians (not real empires).
  empireTileCounts(): { totalOwnedTiles: number; maxEmpireTiles: number } {
    let totalOwnedTiles = 0;
    let maxEmpireTiles = 0;
    for (const [playerId, summary] of this.playerSummaries) {
      if (playerId.startsWith("barbarian")) continue;
      const size = summary.territoryTileKeys.size;
      totalOwnedTiles += size;
      if (size > maxEmpireTiles) maxEmpireTiles = size;
    }
    return { totalOwnedTiles, maxEmpireTiles };
  }

  exportPlannerPlayerViews(playerIds: string[]): PlannerPlayerView[] {
    return buildRuntimePlannerPlayerViews({
      playerIds,
      tiles: this.tiles,
      docks: this.docks,
      players: this.players,
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      plannerGatingLockPlayerIds: () => this.plannerGatingLockPlayerIds(),
      refreshManpowerOnly: (player) => this.refreshManpowerOnly(player),
      plannerPlayerTileKeys: (playerId, summary) => this.plannerPlayerTileKeys(playerId, summary),
      ownedStructureCountsForPlayer: (playerId) => this.ownedStructureCountsForPlayer(playerId),
      estimatedIncomePerMinuteForPlayer: (playerId) => this.estimatedIncomePerMinuteForPlayer(playerId),
      neutralBeaconTileKeys: this.neutralBeaconTileKeys,
      beaconGeneration: this.beaconGeneration,
      yieldBearingTilesByOwner: this.yieldBearingTilesByOwner,
      expansionObjectiveCacheByPlayer: this.expansionObjectiveCacheByPlayer,
      musterTilesByOwner: this.musterTilesByOwner
    });
  }

  exportPlayerDebugSnapshot(): RuntimePlayerDebugSnapshot {
    return buildRuntimePlayerDebugSnapshot({
      locksByTile: this.locksByTile,
      players: this.players,
      refreshManpowerOnly: (player) => this.refreshManpowerOnly(player),
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      playerManpowerCap: (player) => this.playerManpowerCap(player),
      playerManpowerRegenPerMinute: (player) => this.playerManpowerRegenPerMinute(player),
      estimatedIncomePerMinuteForPlayer: (playerId) => this.estimatedIncomePerMinuteForPlayer(playerId)
    });
  }

  exportTilesForKeys(tileKeys: Iterable<string>): PlannerTileView[] {
    return exportPlannerTilesForKeys(this.tiles, tileKeys);
  }

  private buildExportInput() {
    return {
      tiles: this.tiles,
      locksByCommandId: this.locksByCommandId,
      players: this.players,
      pendingSettlementsByTile: this.pendingSettlementsByTile,
      tileYieldCollectedAtByTile: this.tileYieldCollectedAtByTile,
      playerYieldCollectionEpochByPlayer: this.lastIncomeTickAtMsByPlayer,
      docks: this.docks,
      terrainEpoch: this.terrainEpoch,
      tileDeltaStringifyCache: this.tileDeltaStringifyCache,
      applyManpowerRegen: this.applyManpowerRegen.bind(this),
      playerManpowerCap: this.playerManpowerCap.bind(this),
      playerManpowerRegenPerMinute: this.playerManpowerRegenPerMinute.bind(this),
      playerLogisticsThroughputPerMinute: this.playerLogisticsThroughputPerMinute.bind(this),
      playerManpowerBreakdown: this.playerManpowerBreakdown.bind(this),
      incomePerMinuteForPlayer: this.incomePerMinuteForPlayer.bind(this),
      summaryForPlayer: this.summaryForPlayer.bind(this),
      growthStalledNoFoodCounter: this.growthStalledNoFoodCounter
    };
  }

  exportState(): RuntimeExportState {
    return buildRuntimeExportState(this.buildExportInput());
  }

  async exportStateAsync(yieldToEventLoop: () => Promise<void>): Promise<RuntimeExportState> {
    return buildRuntimeExportStateAsync(this.buildExportInput(), yieldToEventLoop);
  }

  getPlayersForLeaderboard(): RuntimeExportState["players"] {
    return buildRuntimeExportPlayers(this.buildExportInput());
  }

  private classifyVisibilityForPlayer(playerId: string): RuntimeVisibilityClassification {
    const run = (): RuntimeVisibilityClassification => classifyVisibilityForPlayerImpl({
      playerId,
      players: this.players,
      tiles: this.tiles,
      locksByTile: this.locksByTile,
      docks: this.docks,
      dockLinksByDockTileKey: this.dockLinksByDockTileKey,
      summaryForPlayer: (visiblePlayerId) => this.summaryForPlayer(visiblePlayerId),
      applyManpowerRegen: (player) => this.applyManpowerRegen(player),
      visionExpansionCache: this.visionExpansionCache,
      tileCollectionVersionForPlayer: (visiblePlayerId) =>
        this.territoryVersionByPlayer.get(visiblePlayerId) ?? 0
    });
    // Named so an event_loop_blocked incident can see this instead of an
    // empty mainThreadTasks — this is the O(territory×r²) vision-expansion
    // cache-miss cost documented on VisionExpansionCache.
    return this.trackSyncMainThreadTask
      ? this.trackSyncMainThreadTask("classify_visibility_for_player", { playerId }, run)
      : run();
  }

  getBarbActivationVisionSignature(): string {
    return getBarbActivationVisionSignatureImpl({
      players: this.players,
      tileCollectionVersionForPlayer: (playerId) =>
        this.territoryVersionByPlayer.get(playerId) ?? 0
    });
  }

  exportBarbActivationVisibleUnion(): { keys: string[]; signature: string } {
    return exportBarbActivationVisibleUnionImpl({
      players: this.players,
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      tileCollectionVersionForPlayer: (playerId) =>
        this.territoryVersionByPlayer.get(playerId) ?? 0,
      cache: this.barbActivationVisibilityCache
    });
  }

  private emitVisibilityAudit(
    playerId: string,
    tile: { x: number; y: number; ownerId?: string | undefined },
    tileKey: string,
    redacted: boolean,
    classification: ReturnType<SimulationRuntime["classifyVisibilityForPlayer"]>
  ): void {
    emitVisibilityAuditImpl({
      onVisibilityAudit: this.onVisibilityAudit,
      playerId,
      tile,
      tileKey,
      redacted,
      classification
    });
  }

  exportVisibleStateForPlayer(playerId: string): ReturnType<SimulationRuntime["exportState"]> {
    return exportVisibleStateForPlayerImpl(this.visibleStateDeps(playerId));
  }

  private visibleStateDeps(playerId: string) {
    return {
      playerId,
      tiles: this.tiles,
      locksByCommandId: this.locksByCommandId,
      players: this.players,
      pendingSettlementsByTile: this.pendingSettlementsByTile,
      docks: this.docks,
      tileYieldCollectedAtByTile: this.tileYieldCollectedAtByTile,
      playerYieldCollectionEpochByPlayer: this.lastIncomeTickAtMsByPlayer,
      terrainEpoch: this.terrainEpoch,
      classifyVisibilityForPlayer: (visiblePlayerId: string) => this.classifyVisibilityForPlayer(visiblePlayerId),
      emitVisibilityAudit: (
        visiblePlayerId: string,
        tile: { x: number; y: number; ownerId?: string | undefined },
        tileKey: string,
        redacted: boolean,
        classification: RuntimeVisibilityClassification
      ) => this.emitVisibilityAudit(visiblePlayerId, tile, tileKey, redacted, classification),
      summaryForPlayer: (summaryPlayerId: string) => this.summaryForPlayer(summaryPlayerId),
      applyManpowerRegen: (player: RuntimePlayer) => this.applyManpowerRegen(player),
      incomePerMinuteForPlayer: (incomePlayerId: string) => this.incomePerMinuteForPlayer(incomePlayerId),
      cachedEconomySnapshot: (player: RuntimePlayer) => this.cachedEconomySnapshot(player),
      // Seeds the sparse-delta cache's baseline for every tile a player sees
      // at connect time, so their subsequent command/tick deltas for
      // already-visible tiles can be genuinely sparse. This is a perf/
      // payload-size improvement layered on top of (not a substitute for)
      // buildSparseDelta always including ownerId/ownershipState/dockId --
      // see the comment there for why this alone isn't sufficient.
      seedLastEmitted: (tileKey: string, tile: DomainTileState) => this.tileDeltaStringifyCache.setLastEmitted(tileKey, tile)
    };
  }

  // Async variant that yields between heavy sections so a big-territory
  // bootstrap build doesn't block the main thread contiguously — see
  // classifyVisibilityForPlayer (O(territory×radius²), trackSync-wrapped
  // above) and its ~13k-tile/1.5M-iteration watchdog-grazing note. Output
  // parity with sync covered by runtime.export-visible-async.test.ts.
  async exportVisibleStateForPlayerAsync(
    playerId: string,
    yieldToEventLoop: () => Promise<void>
  ): Promise<ReturnType<SimulationRuntime["exportState"]>> {
    return exportVisibleStateForPlayerAsyncImpl({
      ...this.visibleStateDeps(playerId),
      yieldToEventLoop
    });
  }

  exportTilesInAreaForPlayer(
    playerId: string,
    centerX: number,
    centerY: number,
    radius: number,
    options?: { fullVisibility?: boolean }
  ): SimulationTileWireDelta[] {
    return exportTilesInAreaForPlayerImpl({
      playerId,
      centerX,
      centerY,
      radius,
      fullVisibility: options?.fullVisibility,
      tiles: this.tiles,
      players: this.players,
      tileDeltaFromState: (tile, context) => this.tileDeltaFromState(tile, context),
      tileYieldEconomyContextForPlayer: (player) => this.tileYieldEconomyContextForPlayer(player),
      filterTileDeltasForPlayer: (tileDeltas, visiblePlayerId) => this.filterTileDeltasForPlayer(tileDeltas, visiblePlayerId)
    });
  }

  filterTileDeltasForPlayer<TDelta extends { x: number; y: number; terrain?: Terrain | undefined; ownerId?: string | undefined }>(
    tileDeltas: readonly TDelta[], playerId: string, options?: TileDeltaVisibilityFilterOptions
  ): TDelta[] {
    return filterTileDeltasForPlayerImpl(
      {
        players: this.players,
        tiles: this.tiles,
        locksByTile: this.locksByTile,
        docks: this.docks,
        dockLinksByDockTileKey: this.dockLinksByDockTileKey,
        summaryForPlayer: (id) => this.summaryForPlayer(id),
        visibilityCoverage: this.visibilityCoverage,
        hasFullVision: (pid) => this.getAbilityCooldownUntil(pid, ASTRAL_DOCK_LAUNCH_ACTIVE_UNTIL_KEY) > this.now(),
        ...(this.onVisibilityAudit ? { onVisibilityAudit: this.onVisibilityAudit } : {})
      },
      tileDeltas,
      playerId,
      options
    );
  }

  private settledTilesForPlayer(playerId: string): DomainTileState[] {
    return [...this.summaryForPlayer(playerId).territoryTileKeys]
      .map((tileKey) => this.tiles.get(tileKey))
      .filter((tile): tile is DomainTileState => Boolean(tile && tile.ownerId === playerId && tile.ownershipState === "SETTLED"));
  }

  private orderedTownTilesForPlayer(playerId: string): DomainTileState[] {
    return [...this.summaryForPlayer(playerId).ownedTownTierByTile.keys()]
      .map((tileKey) => this.tiles.get(tileKey))
      .filter((tile): tile is DomainTileState => Boolean(tile?.town && tile.ownerId === playerId && tile.ownershipState === "SETTLED"));
  }

  private fedTownKeysForPlayer(player: DomainPlayer, settledTiles = this.settledTilesForPlayer(player.id)): Set<string> {
    const summary = this.summaryForPlayer(player.id);
    return buildFedTownKeys(
      player,
      summary,
      this.tiles,
      buildStrategicProductionForSettledTiles(summary, settledTiles)
    );
  }

  // Shared with cachedEconomySnapshot so buildConnectedTownNetworkForPlayer
  // (O(settled_tiles + towns^2)) fires once per cache-miss cycle, not twice.
  private cachedTownNetworkForPlayer(
    player: DomainPlayer,
    settledTiles: readonly DomainTileState[],
    maxConnectedTownNames: number
  ): Map<string, ConnectedTownNetworkEntry> {
    const cached = this.townNetworkCacheByPlayer.get(player.id);
    if (cached) return cached;
    const rebuild = (): Map<string, ConnectedTownNetworkEntry> => {
      const network = buildConnectedTownNetworkForPlayer(player, this.tiles, settledTiles, { maxConnectedTownNames });
      this.townNetworkCacheByPlayer.set(player.id, network);
      return network;
    };
    return this.trackSyncMainThreadTask
      ? this.trackSyncMainThreadTask("town_network_rebuild", { playerId: player.id }, rebuild)
      : rebuild();
  }

  private tileYieldEconomyContextForPlayer(player: DomainPlayer): RuntimeTileYieldEconomyContext {
    const cached = this.tileYieldContextCacheByPlayer.get(player.id);
    if (cached) return cached;
    const rebuild = (): RuntimeTileYieldEconomyContext => {
      const settledTiles = this.settledTilesForPlayer(player.id);
      const { waterworksKeys, foundryKeys } = radiusStructureKeysForSettledTiles(settledTiles);
      const context: RuntimeTileYieldEconomyContext = {
        player,
        townNetwork: this.cachedTownNetworkForPlayer(player, settledTiles, 16),
        fedTownKeys: this.fedTownKeysForPlayer(player, settledTiles),
        // Skip expensive first-three-town key computation if the player has no
        // domain granting firstThreeTownsGoldOutputMult — multiplier is 1.0 so
        // the key set has no effect. Skips O(towns) sort for most players.
        firstThreeTownKeys: firstThreeTownsGoldOutputMultiplierForPlayer(player) !== 1
          ? firstThreeTownKeysForPlayer(player.id, this.orderedTownTilesForPlayer(player.id).map(t => `${t.x},${t.y}`))
          : new Set<string>(),
        waterworksKeys,
        foundryKeys
      };
      this.tileYieldContextCacheByPlayer.set(player.id, context);
      return context;
    };
    // Attribution for event_loop_blocked (was empty mainThreadTasks): rebuild
    // is buildConnectedTownNetworkForPlayer's O(settled_tiles + towns²) BFS.
    return this.trackSyncMainThreadTask
      ? this.trackSyncMainThreadTask("tile_yield_economy_context_rebuild", { playerId: player.id }, rebuild)
      : rebuild();
  }

  private enrichTileWithTownContext(tile: DomainTileState, player: RuntimePlayer | undefined, context: RuntimeTileYieldEconomyContext): DomainTileState {
    if (!tile.town) return tile;
    const networkTown = enrichTownWithConnectedNetwork(tile, context.townNetwork);
    const tileKey = `${tile.x},${tile.y}`;
    const refreshedTown = networkTown && player
      ? refreshTownEconomyFields(networkTown, tile, player, this.tiles, context.fedTownKeys, context.firstThreeTownKeys, context.townNetwork?.get(tileKey)?.connectedClearingHouseKeys)
      : networkTown;
    return { ...tile, town: refreshedTown };
  }

  private incomePerMinuteForPlayer(playerId: string): number {
    const player = this.players.get(playerId);
    if (!player) return 0;
    // Route through cachedEconomySnapshot — the cache is maintained
    // incrementally by replaceTileState (O(1) per tile mutation) so this
    // returns a stale-free result without rebuilding the full O(settled-tiles)
    // snapshot on every call. The full rebuild only fires on cache miss.
    return this.cachedEconomySnapshot(player).incomePerMinute;
  }

  private hasActiveSettlementTownForPlayer(playerId: string): boolean {
    for (const tileKey of this.summaryForPlayer(playerId).ownedTownTierByTile.keys()) {
      const tile = this.tiles.get(tileKey);
      if (
        tile?.ownerId === playerId &&
        tile.ownershipState === "SETTLED" &&
        tile.town?.populationTier === "SETTLEMENT"
      ) {
        return true;
      }
    }
    return false;
  }

  private ensureGrossIncomeSettlementForPlayer(playerId: string, commandId: string): boolean {
    const player = this.players.get(playerId);
    if (!player || player.id.startsWith("barbarian-")) return false;
    const summary = this.summaryForPlayer(playerId);
    if (summary.territoryTileKeys.size === 0) return false;
    if (this.hasActiveSettlementTownForPlayer(playerId)) return false;
    if (this.incomePerMinuteForPlayer(playerId) > 0) return false;
    return this.respawnPlayerOnUnownedLand(playerId, commandId);
  }

  private estimatedIncomePerMinuteForPlayer(playerId: string): number {
    const player = this.players.get(playerId);
    const incomeMult = player?.mods?.income ?? 1;
    return Math.round(this.summaryForPlayer(playerId).goldIncomePerMinute * incomeMult * 100) / 100;
  }

  private activeDevelopmentProcessCountForPlayer(playerId: string): number {
    return this.summaryForPlayer(playerId).activeDevelopmentProcessCount;
  }

  private autoSettlementQueueForPlayer(playerId: string): Array<{ x: number; y: number }> {
    // Use frontierTilesByOwner to avoid iterating all territory tiles (O(settled) → O(frontier))
    // orderedAutoSettlementTileKeys filters to FRONTIER tiles anyway, so passing only
    // frontier keys is semantically equivalent but O(frontier) instead of O(territory).
    const frontierKeys = this.frontierTilesByOwner.get(playerId) ?? new Set<string>();
    return orderedAutoSettlementTileKeys(playerId, frontierKeys, {
      getTile: (tileKey) => this.tiles.get(tileKey),
      isBlocked: (tileKey) => this.locksByTile.has(tileKey) || this.pendingSettlementsByTile.has(tileKey),
      hasTownSupport: (tile) =>
        this.supportedTownKeysForTile(playerId, tile.x, tile.y).some((townKey) => {
          const town = this.tiles.get(townKey)?.town;
          return Boolean(town && town.populationTier !== "SETTLEMENT");
        })
    })
      .map((tileKey) => {
        const [rawX, rawY] = tileKey.split(",");
        const x = Number(rawX);
        const y = Number(rawY);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
      })
      .filter((tile): tile is { x: number; y: number } => Boolean(tile));
  }

  storageCapForPlayer(playerId: string): EmpireStorageCap | undefined {
    const player = this.players.get(playerId);
    if (!player) return undefined;
    const summary = this.summaryForPlayer(playerId);
    const economy = this.cachedEconomySnapshot(player);
    return computeEmpireStorageCap(summary, economy.goldCapIncomePerMinute, economy.strategicProductionPerMinute);
  }

  private emitPlayerStateUpdate(command: Pick<CommandEnvelope, "commandId" | "playerId">, playerId = command.playerId): void {
    const player = this.players.get(playerId);
    if (!player) return;
    this.applyManpowerRegen(player);
    const summary = this.summaryForPlayer(playerId);
    // Use cached snapshots — O(1) on cache hit (rebuilt at most once per tile
    // mutation via replaceTileState invalidation).
    // Defensibility must be computed before the economy snapshot so that
    // cachedEconomySnapshot can read the warm defensibility cache and apply
    // the correct integrity economy multiplier without triggering its own rebuild.
    const metrics = this.cachedDefensibilityMetrics(playerId, summary);
    const economy = this.cachedEconomySnapshot(player);
    player.strategicProductionPerMinute = economy.strategicProductionPerMinute;
    const storageCap = computeEmpireStorageCap(summary, economy.goldCapIncomePerMinute, economy.strategicProductionPerMinute);
    const lastCap = this.lastEmittedStorageCapByPlayer.get(playerId);
    const capChanged =
      !lastCap ||
      lastCap.GOLD !== storageCap.GOLD ||
      lastCap.FOOD !== storageCap.FOOD ||
      lastCap.IRON !== storageCap.IRON ||
      lastCap.CRYSTAL !== storageCap.CRYSTAL ||
      lastCap.SUPPLY !== storageCap.SUPPLY ||
      lastCap.SHARD !== storageCap.SHARD;
    if (capChanged) this.lastEmittedStorageCapByPlayer.set(playerId, storageCap);
    this.emitPlayerMessage(
      { commandId: command.commandId, playerId },
      {
        type: "PLAYER_UPDATE",
        gold: player.points,
        mods: player.mods ?? recomputeMods(player),
        modBreakdown: buildModBreakdownForPlayer(player),
        manpower: player.manpower,
        manpowerCap: this.playerManpowerCap(player),
        manpowerRegenPerMinute: this.playerManpowerRegenPerMinute(player),
        logisticsThroughputPerMinute: this.playerLogisticsThroughputPerMinute(player),
        manpowerBreakdown: this.playerManpowerBreakdown(player),
        incomePerMinute: economy.incomePerMinute,
        strategicResources: {
          FOOD: player.strategicResources?.FOOD ?? 0,
          IRON: player.strategicResources?.IRON ?? 0,
          CRYSTAL: player.strategicResources?.CRYSTAL ?? 0,
          SUPPLY: player.strategicResources?.SUPPLY ?? 0,
          SHARD: player.strategicResources?.SHARD ?? 0
        },
        strategicProductionPerMinute: economy.strategicProductionPerMinute,
        economyBreakdown: economy.economyBreakdown,
        upkeepPerMinute: economy.upkeepPerMinute,
        upkeepLastTick: economy.upkeepLastTick,
        T: metrics.T,
        E: metrics.E,
        Ts: metrics.Ts,
        Es: metrics.Es,
        pendingSettlements: this.pendingSettlementsSnapshotForPlayer(playerId),
        autoSettlementQueue: this.autoSettlementQueueForPlayer(playerId),
        developmentProcessLimit: DEVELOPMENT_PROCESS_LIMIT + additiveEffectForPlayer(player, "developmentProcessCapacityAdd"),
        activeDevelopmentProcessCount: this.activeDevelopmentProcessCountForPlayer(playerId),
        ...(capChanged ? { storageCap } : {})
      }
    );
  }

  private handleSyncAllianceCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseAllianceSyncPayload(command.payloadJson);
    const target = payload ? this.players.get(payload.targetPlayerId) : undefined;
    if (!actor || !payload || !target || target.id === actor.id) {
      this.rejectCommand(command, "BAD_COMMAND", "invalid alliance sync payload"); return;
    }

    const wasAllied = actor.allies.has(target.id); // SYNC_ALLIANCE skips clientSeq dedup; syncAllianceChange isn't idempotent like allies.add/delete.
    if (payload.allied) {
      actor.allies.add(target.id);
      target.allies.add(actor.id);
    } else {
      actor.allies.delete(target.id);
      target.allies.delete(actor.id);
    }
    if (wasAllied !== payload.allied) this.visibilityCoverage.syncAllianceChange(actor.id, target.id, payload.allied, this.visionTransitions.callbacks);

    this.emitPlayerMessage(
      { commandId: command.commandId, playerId: actor.id },
      {
        type: "SOCIAL_STATE_SYNCED",
        playerId: actor.id,
        targetPlayerId: target.id,
        allied: payload.allied
      }
    );
    this.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
  }

  private rejectCommand(command: Pick<CommandEnvelope, "commandId" | "playerId">, code: string, message: string): void {
    this.emitEvent({ eventType: "COMMAND_REJECTED", commandId: command.commandId, playerId: command.playerId, code, message });
  }

  private hasAvailableDevelopmentSlot(playerId: string): boolean {
    return (
      this.activeDevelopmentProcessCountForPlayer(playerId) <
      DEVELOPMENT_PROCESS_LIMIT +
        additiveEffectForPlayer(
          this.players.get(playerId) ?? { techIds: new Set<string>(), domainIds: new Set<string>() },
          "developmentProcessCapacityAdd"
        )
    );
  }

  private rejectIfNoDevelopmentSlot(command: CommandEnvelope, code: string, message: string): boolean {
    if (this.hasAvailableDevelopmentSlot(command.playerId)) return false;
    this.rejectCommand(command, code, message);
    return true;
  }

  private jobQueueContext(): RuntimeJobQueueContext {
    return {
      jobsByLane: this.jobsByLane,
      priorityOrder,
      backgroundBatchSize: this.backgroundBatchSize,
      now: () => this.now(),
      scheduleSoon: this.scheduleSoon,
      scheduleAfter: this.scheduleAfter,
      queueDepths: () => this.queueDepths(),
      shouldPauseBackground: this.shouldPauseBackground,
      wrapJobRun: this.wrapJobRun,
      onQueueDrain: this.onQueueDrain,
      onJobApplied: this.onJobApplied
    };
  }

  private jobQueueMutableState(): RuntimeJobQueueMutableState {
    return {
      getDraining: () => this.draining,
      setDraining: (value) => {
        this.draining = value;
      },
      getDrainScheduled: () => this.drainScheduled,
      setDrainScheduled: (value) => {
        this.drainScheduled = value;
      },
      getImmediateDrainScheduled: () => this.immediateDrainScheduled,
      setImmediateDrainScheduled: (value) => {
        this.immediateDrainScheduled = value;
      }
    };
  }

  private enqueueJob(
    lane: QueueLane,
    run: () => void,
    commandType?: CommandEnvelope["type"],
    scheduling: "immediate" | "background" = "immediate",
    commandId?: string
  ): void {
    enqueueJobImpl(this.jobQueueContext(), this.jobQueueMutableState(), lane, run, commandType, scheduling, commandId);
  }

  private scheduleDrain(scheduling: "immediate" | "background" = "immediate"): void {
    scheduleDrainImpl(this.jobQueueContext(), this.jobQueueMutableState(), scheduling);
  }

  private drainQueues(): void {
    drainQueuesImpl(this.jobQueueContext(), this.jobQueueMutableState());
  }

  private handleFrontierCommand(command: CommandEnvelope, actionType: FrontierCommandType): boolean {
    return handleFrontierCommandImpl(this.frontierCommandContext(), command, actionType);
  }

  private nextTerritoryAutomationCommandId(label: string, playerId: string, tileKey: string, nowMs: number): string {
    this.territoryAutomationCounter += 1;
    return `${TERRITORY_AUTO_COMMAND_PREFIX}${label}:${playerId}:${tileKey}:${nowMs}:${this.territoryAutomationCounter}`;
  }

  private startSettlementProcess(input: {
    commandId: string;
    playerId: string;
    targetKey: string;
    target: DomainTileState;
    startedAt: number;
    emitStartedUpdate?: boolean;
  }): void {
    const actor = this.players.get(input.playerId);
    if (!actor) return;
    actor.points -= SETTLE_COST;
    const settleDurationMs = settlementDurationMsForPlayer(actor, settlementBaseDurationMsForTile(input.target));
    const resolvesAt = input.startedAt + settleDurationMs;
    this.addPendingSettlement({
      ownerId: input.playerId,
      tileKey: input.targetKey,
      startedAt: input.startedAt,
      resolvesAt,
      goldCost: SETTLE_COST,
      commandId: input.commandId
    });
    this.emitEvent({
      eventType: "SETTLEMENT_STARTED",
      commandId: input.commandId,
      playerId: input.playerId,
      tileKey: input.targetKey,
      startedAt: input.startedAt,
      resolvesAt,
      goldCost: SETTLE_COST
    });
    if (input.emitStartedUpdate !== false) {
      this.emitPlayerStateUpdate({ commandId: input.commandId, playerId: input.playerId });
    }

    this.scheduleAfter(settleDurationMs, () => {
      const expectedSettlement = {
        ownerId: input.playerId,
        tileKey: input.targetKey,
        startedAt: input.startedAt,
        resolvesAt,
        goldCost: SETTLE_COST, commandId: input.commandId
      };
      const currentSettlement = this.pendingSettlementsByTile.get(input.targetKey);
      if (!this.pendingSettlementMatches(currentSettlement, expectedSettlement)) return;
      this.removePendingSettlement(input.targetKey);
      const latest = this.tiles.get(input.targetKey);
      if (
        !latest ||
        latest.ownerId !== input.playerId ||
        latest.ownershipState !== "FRONTIER"
      ) {
        this.emitPlayerStateUpdate({ commandId: input.commandId, playerId: input.playerId });
        return;
      }
      const settledTile: DomainTileState = {
        ...latest,
        ownerId: input.playerId,
        ownershipState: "SETTLED",
        ...(latest.town ? { town: latest.town } : {})
      };
      this.setTileYieldCollectedAt(input.commandId, input.playerId, input.targetKey, this.now());
      this.replaceTileState(input.targetKey, settledTile);
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: input.commandId,
        playerId: input.playerId,
        // ownerId/ownershipState forced regardless of the sparse-diff cache; see
        // the recovered-settle path above for why "unchanged" isn't safe to drop here.
        tileDeltas: [{ ...this.tileDeltaFromState(settledTile), ownerId: settledTile.ownerId ?? undefined, ownershipState: settledTile.ownershipState ?? undefined }]
      });
      this.emitAutoFillForSettlement(settledTile, input.playerId, input.targetKey);
      this.emitPlayerStateUpdate({ commandId: input.commandId, playerId: input.playerId });
      this.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: input.commandId, playerId: input.playerId });
    });
  }

  private handleSettleCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseSettlePayload(command.payloadJson);
    if (!actor || !payload) { this.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target) { this.rejectCommand(command, "UNKNOWN_TILE", "tile not found"); return; }
    if (target.ownerId !== command.playerId || target.ownershipState !== "FRONTIER") {
      this.rejectCommand(command, "SETTLE_INVALID", "tile is not one of your frontier tiles"); return;
    }
    // Encirclement guard: a cut-off tile cannot be settled. Settling a
    // disconnected tile would let a player convert an encircled pocket into
    // permanent territory, defeating the encirclement mechanic. Natural
    // frontier expiry also uses `frontierDecayAt`, so use the explicit owner.
    if (target.frontierDecayKind === "ENCIRCLEMENT") { this.rejectCommand(command, "ORIGIN_CUT_OFF", "tile is cut off from supply and cannot be settled"); return; }
    if (target.terrain !== "LAND") { this.rejectCommand(command, "SETTLE_INVALID", "tile is not valid land"); return; }
    if (this.pendingSettlementsByTile.has(targetKey)) { this.rejectCommand(command, "SETTLE_INVALID", "tile is already settling"); return; }
    if (this.rejectIfNoDevelopmentSlot(command, "SETTLE_INVALID", "development slots are busy")) return;
    if (actor.points < SETTLE_COST) { this.rejectCommand(command, "INSUFFICIENT_GOLD", "insufficient gold to settle"); return; }

    this.startSettlementProcess({
      commandId: command.commandId,
      playerId: command.playerId,
      targetKey,
      target,
      startedAt: this.now()
    });
  }

  /**
   * Server-side auto-settle for AI players. AI has no client, so unlike
   * humans (who get automatic SETTLE dispatch from the client-side
   * autoSettlementQueue consumer — see client-development-queue.ts) it has
   * no unconditional path to converting a claimed FRONTIER tile into a town.
   * SETTLE was previously a scored decision in the AI utility policy, but
   * that made settlement contend with (and lose to) ATTACK/EXPAND/WAIT —
   * this mirrors the client's unconditional behavior instead: any due
   * FRONTIER tile gets settled, gold/dev-slot permitting, independent of
   * utility scoring. Called once per territory-automation tick.
   */
  private runAiAutoSettleForPlayer(playerId: string, nowMs: number): number {
    const actor = this.players.get(playerId);
    if (!actor?.isAi) return 0;
    let settledCount = 0;
    for (const { x, y } of this.autoSettlementQueueForPlayer(playerId)) {
      if (actor.points < SETTLE_COST) break;
      if (!this.hasAvailableDevelopmentSlot(playerId)) break;
      const targetKey = simulationTileKey(x, y);
      const target = this.tiles.get(targetKey);
      if (!target || target.ownerId !== playerId || target.ownershipState !== "FRONTIER") continue;
      if (target.frontierDecayKind === "ENCIRCLEMENT") continue;
      if (target.terrain !== "LAND") continue;
      if (this.pendingSettlementsByTile.has(targetKey)) continue;
      const commandId = this.nextTerritoryAutomationCommandId("auto-settle", playerId, targetKey, nowMs);
      this.startSettlementProcess({
        commandId,
        playerId,
        targetKey,
        target,
        startedAt: nowMs
      });
      settledCount++;
    }
    return settledCount;
  }

  private handleCollectTileCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseTilePayload(command.payloadJson);
    if (!actor || !payload) { this.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
    this.applyManpowerRegen(actor);
    const target = this.tiles.get(simulationTileKey(payload.x, payload.y));
    if (!target || target.ownerId !== command.playerId || target.ownershipState !== "SETTLED") {
      this.rejectCommand(command, "COLLECT_EMPTY", "tile is not a settled owned tile"); return;
    }

    const collected = this.collectTileYield(target, this.now(), command);
    const gold = collected.gold;
    const strategic = collected.strategic;
    const touched = gold > 0 || Object.values(strategic).some((value) => Number(value) > 0);
    if (!touched) { this.rejectCommand(command, "COLLECT_EMPTY", "yield is empty"); return; }
    actor.points += gold;
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(target)]
    });
    this.emitEvent({
      eventType: "COLLECT_RESULT",
      commandId: command.commandId,
      playerId: command.playerId,
      mode: "tile",
      x: payload.x,
      y: payload.y,
      tiles: 1,
      gold,
      strategic
    });
    this.emitPlayerStateUpdate(command);
    this.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
  }

  private handleCollectVisibleCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    if (!actor) { this.rejectCommand(command, "BAD_COMMAND", "unknown player"); return; }
    const now = this.now();
    const COLLECT_VISIBLE_COOLDOWN_MS = 20_000;
    const cooldownUntil = this.collectVisibleCooldownByPlayer.get(command.playerId) ?? 0;
    if (cooldownUntil > now) { this.rejectCommand(command, "COLLECT_COOLDOWN", "collect is on cooldown"); return; }
    // Mark player active so passive income tick doesn't skip them on next fire
    this.updatePlayerLastActive(command.playerId, now);
    // Seed the income anchor if this is before the first passive tick has fired,
    // otherwise applyPassiveIncomeForPlayer returns nothing and the button silently
    // credits zero.
    if (!this.lastIncomeTickAtMsByPlayer.has(actor.id)) {
      this.lastIncomeTickAtMsByPlayer.set(actor.id, now - COLLECT_VISIBLE_COOLDOWN_MS);
    }
    const goldBefore = actor.points;
    const strategicBefore = { ...(actor.strategicResources ?? {}) };
    // Reuse the same O(1) passive income calculation — no tile scan needed
    this.applyPassiveIncomeForPlayer(actor, now, 12 * 60 * 60 * 1000);
    const goldCredited = Math.max(0, actor.points - goldBefore);
    const strategic: Partial<Record<string, number>> = {};
    for (const key of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD"] as const) {
      const diff = ((actor.strategicResources ?? {})[key] ?? 0) - (strategicBefore[key] ?? 0);
      if (diff > 0) strategic[key] = diff;
    }
    this.collectVisibleCooldownByPlayer.set(command.playerId, now + COLLECT_VISIBLE_COOLDOWN_MS);
    this.emitEvent({
      eventType: "COLLECT_RESULT",
      commandId: command.commandId,
      playerId: command.playerId,
      mode: "visible",
      tiles: this.yieldBearingTilesByOwner.get(command.playerId)?.size ?? 0,
      gold: goldCredited,
      strategic
    });
    this.emitPlayerStateUpdate(command);
    this.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
  }

  private handleUncaptureTileCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseStructureTilePayload(command.payloadJson);
    if (!actor || !payload) { this.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target) { this.rejectCommand(command, "UNKNOWN_TILE", "tile not found"); return; }
    if (target.ownerId !== command.playerId) { this.rejectCommand(command, "UNCAPTURE_NOT_OWNER", "tile is not owned by you"); return; }
    if (this.ownedTileCountForPlayer(command.playerId) <= 1) { this.rejectCommand(command, "UNCAPTURE_LAST_TILE", "cannot uncapture your last tile"); return; }
    if (target.town?.populationTier === "SETTLEMENT") { this.rejectCommand(command, "UNCAPTURE_SETTLEMENT", "cannot abandon your settlement"); return; }
    const summary = this.summaryForPlayer(command.playerId);
    if (summary.ownedTownTierByTile.size <= 1 && summary.ownedTownTierByTile.has(targetKey)) {
      this.rejectCommand(command, "UNCAPTURE_LAST_TOWN", "cannot abandon your last town"); return;
    }
    if (this.locksByTile.has(targetKey)) { this.rejectCommand(command, "LOCKED", "tile locked in combat"); return; }

    // Refund any banked muster manpower before releasing the tile.
    if (target.muster?.ownerId && target.muster.amount > 0) {
      const musterOwner = this.players.get(target.muster.ownerId);
      if (musterOwner) {
        musterOwner.manpower = Math.min(
          this.playerManpowerCap(musterOwner),
          musterOwner.manpower + target.muster.amount
        );
      }
    }
    const updatedTile: DomainTileState = {
      ...target,
      ownerId: undefined,
      ownershipState: undefined,
      fort: undefined,
      observatory: undefined,
      siegeOutpost: undefined,
      economicStructure: undefined,
      muster: undefined
    };
    this.replaceTileState(targetKey, updatedTile, command.commandId);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
    if (target.muster) {
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: `${command.commandId}:bc`,
        playerId: "__broadcast__",
        tileDeltas: [{ x: updatedTile.x, y: updatedTile.y, musterJson: "" }]
      });
    }
    // Removing an owned tile can sever the supply path to downstream frontier
    // tiles — re-check encirclement connectivity from the now-vacant key.
    this.applyEncirclement([targetKey], command.playerId, command.commandId, { bfsCap: 2000 });
    this.emitPlayerStateUpdate(command);
    this.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
  }

  private handleOverloadSynthesizerCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseStructureTilePayload(command.payloadJson);
    if (!actor || !payload) { this.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    const structure = target?.economicStructure;
    if (!target || !structure || structure.ownerId !== command.playerId) {
      this.rejectCommand(command, "SYNTH_OVERLOAD_INVALID", "no owned synthesizer on tile"); return;
    }
    if (!actor.techIds.has("overload-protocols")) {
      this.rejectCommand(command, "SYNTH_OVERLOAD_INVALID", "unlock synthesizer overload via Overload Protocols first"); return;
    }
    if (
      structure.type !== "FUR_SYNTHESIZER" &&
      structure.type !== "ADVANCED_FUR_SYNTHESIZER" &&
      structure.type !== "IRONWORKS" &&
      structure.type !== "ADVANCED_IRONWORKS" &&
      structure.type !== "CRYSTAL_SYNTHESIZER" &&
      structure.type !== "ADVANCED_CRYSTAL_SYNTHESIZER"
    ) {
      this.rejectCommand(command, "SYNTH_OVERLOAD_INVALID", "only synthesizer structures can overload"); return;
    }
    if (structure.status === "under_construction" || structure.status === "removing") {
      this.rejectCommand(command, "SYNTH_OVERLOAD_INVALID", "synthesizer is not ready"); return;
    }
    if (structure.disabledUntil && structure.disabledUntil > this.now()) {
      this.rejectCommand(command, "SYNTH_OVERLOAD_INVALID", "synthesizer is recovering from overload"); return;
    }
    if (actor.points < SYNTH_OVERLOAD_GOLD_COST) {
      this.rejectCommand(command, "SYNTH_OVERLOAD_INVALID", "insufficient gold for synthesizer overload"); return;
    }

    actor.points -= SYNTH_OVERLOAD_GOLD_COST;
    if (structure.type === "FUR_SYNTHESIZER" || structure.type === "ADVANCED_FUR_SYNTHESIZER") {
      this.addStrategicResource(actor, "SUPPLY", FUR_SYNTHESIZER_OVERLOAD_SUPPLY);
    } else if (structure.type === "IRONWORKS" || structure.type === "ADVANCED_IRONWORKS") {
      this.addStrategicResource(actor, "IRON", IRONWORKS_OVERLOAD_IRON);
    } else {
      this.addStrategicResource(actor, "CRYSTAL", CRYSTAL_SYNTHESIZER_OVERLOAD_CRYSTAL);
    }

    const reenabledAt = this.now() + SYNTH_OVERLOAD_DISABLE_MS;
    const updatedTile: DomainTileState = {
      ...target,
      economicStructure: {
        ...structure,
        status: "inactive",
        disabledUntil: reenabledAt,
        nextUpkeepAt: reenabledAt,
        inactiveReason: undefined
      }
    };
    this.replaceTileState(targetKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
    this.emitPlayerStateUpdate(command);
    this.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
  }

  private handleSetConverterStructureEnabledCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseConverterTogglePayload(command.payloadJson);
    if (!actor || !payload) { this.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    const structure = target?.economicStructure;
    if (!target || !structure || structure.ownerId !== command.playerId) {
      this.rejectCommand(command, "CONVERTER_TOGGLE_INVALID", "no owned converter on tile"); return;
    }
    if (!isConverterStructureType(structure.type)) {
      this.rejectCommand(command, "CONVERTER_TOGGLE_INVALID", "only converter structures can be toggled"); return;
    }
    if (structure.status === "under_construction" || structure.status === "removing") {
      this.rejectCommand(command, "CONVERTER_TOGGLE_INVALID", "converter is not ready"); return;
    }
    if (structure.disabledUntil && structure.disabledUntil > this.now()) {
      this.rejectCommand(command, "CONVERTER_TOGGLE_INVALID", "converter is recovering from overload"); return;
    }

    if (payload.enabled) {
      if (target.ownerId !== command.playerId || target.ownershipState !== "SETTLED") {
        this.rejectCommand(command, "CONVERTER_TOGGLE_INVALID", "converter requires settled owned tile"); return;
      }
      const upkeep = economicStructureGoldUpkeepPerInterval(structure.type);
      if (actor.points < upkeep) {
        this.rejectCommand(command, "CONVERTER_TOGGLE_INVALID", "insufficient gold for converter upkeep"); return;
      }
      actor.points -= upkeep;
    }

    const updatedTile: DomainTileState = {
      ...target,
      economicStructure: {
        ...structure,
        status: payload.enabled ? "active" : "inactive",
        inactiveReason: payload.enabled ? undefined : "manual",
        nextUpkeepAt: this.now() + ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS
      }
    };
    this.replaceTileState(targetKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
    this.emitPlayerStateUpdate(command);
    this.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
  }

  private abilityCommandContext(): RuntimeAbilityCommandContext {
    return {
      players: this.players,
      tiles: this.tiles,
      activeAetherBridgesByPlayer: this.activeAetherBridgesByPlayer,
      activeAetherWallsByPlayer: this.activeAetherWallsByPlayer,
      now: this.now,
      emitEvent: (event) => this.emitEvent(event),
      emitPlayerMessage: (command, payload) => this.emitPlayerMessage(command, payload),
      revealTargetsForPlayer: (playerId) => this.revealTargetsForPlayer(playerId),
      revealCapacityForPlayer: (player) => this.revealCapacityForPlayer(player),
      spendStrategicResource: (player, resource, amount) => this.spendStrategicResource(player, resource, amount),
      pickReadyOwnedObservatoryAny: (playerId, now) => this.pickReadyOwnedObservatoryAny(playerId, now),
      pickReadyOwnedObservatoryForTarget: (playerId, targetX, targetY, now) =>
        this.pickReadyOwnedObservatoryForTarget(playerId, targetX, targetY, now),
      stampObservatoryCooldown: (tileKey, durationMs, now, commandId, playerId) =>
        this.stampObservatoryCooldown(tileKey, durationMs, now, commandId, playerId),
      buildRevealEmpireStats: (target) => this.buildRevealEmpireStats(target),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      filterTileDeltasForPlayer: (tileDeltas, playerId) => this.filterTileDeltasForPlayer(tileDeltas, playerId),
      isTileShieldedByEnemyAegisDome: (actorId, targetX, targetY) =>
        this.isTileShieldedByEnemyAegisDome(actorId, targetX, targetY),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      isCoastalLand: (x, y) => this.isCoastalLand(x, y),
      closestAetherBridgeOrigin: (playerId, targetX, targetY) =>
        this.closestAetherBridgeOrigin(playerId, targetX, targetY),
      wallSegments: (originX, originY, direction, length) => this.wallSegments(originX, originY, direction, length),
      activeAetherBridgesForPlayer: (playerId) => this.activeAetherBridgesForPlayer(playerId),
      activeAetherWallsForPlayer: (playerId) => this.activeAetherWallsForPlayer(playerId),
      crossingBlockedByAetherWall: (fromX, fromY, toX, toY) =>
        this.crossingBlockedByAetherWall(fromX, fromY, toX, toY)
    };
  }

  private handleRevealEmpireCommand(command: CommandEnvelope): void {
    handleRevealEmpireCommandImpl(this.abilityCommandContext(), command);
  }

  private handleRevealEmpireStatsCommand(command: CommandEnvelope): void {
    handleRevealEmpireStatsCommandImpl(this.abilityCommandContext(), command);
  }

  private handleSurveySweepCommand(command: CommandEnvelope): void {
    handleSurveySweepCommandImpl(this.abilityCommandContext(), command);
  }

  private handleAetherLanceCommand(command: CommandEnvelope): void {
    handleAetherLanceCommandImpl(this.abilityCommandContext(), command);
  }

  private handleCastAetherBridgeCommand(command: CommandEnvelope): void {
    handleCastAetherBridgeCommandImpl(this.abilityCommandContext(), command);
  }

  private handleCastAetherWallCommand(command: CommandEnvelope): void {
    handleCastAetherWallCommandImpl(this.abilityCommandContext(), command);
  }

  private handleSiphonTileCommand(command: CommandEnvelope): void {
    handleSiphonTileCommandImpl(this.abilityCommandContext(), command);
  }

  private handlePurgeSiphonCommand(command: CommandEnvelope): void {
    handlePurgeSiphonCommandImpl(this.abilityCommandContext(), command);
  }

  private mapCommandContext(): RuntimeMapCommandContext {
    return {
      players: this.players,
      tiles: this.tiles,
      now: this.now,
      emitEvent: (event) => this.emitEvent(event),
      ownedLandWithinRange: (playerId, x, y, range) => this.ownedLandWithinRange(playerId, x, y, range),
      pickReadyOwnedObservatoryForTarget: (playerId, targetX, targetY, now) =>
        this.pickReadyOwnedObservatoryForTarget(playerId, targetX, targetY, now),
      stampObservatoryCooldown: (tileKey, durationMs, now, commandId, playerId) =>
        this.stampObservatoryCooldown(tileKey, durationMs, now, commandId, playerId),
      spendStrategicResource: (player, resource, amount) => this.spendStrategicResource(player, resource, amount),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      bumpTerrainEpoch: () => { this.terrainEpoch = nextTerrainEpoch++; },
      isStructurePowered: (ownerId, tileKey, structureType) => this.isStructurePowered(ownerId, tileKey, structureType),
      isTileShieldedByEnemyAegisDome: (actorId, targetX, targetY) =>
        this.isTileShieldedByEnemyAegisDome(actorId, targetX, targetY),
      isTileShieldedByAegisLock: (actorId, targetX, targetY) =>
        this.isTileShieldedByAegisLock(actorId, targetX, targetY),
      isTileBombardBlockedByRadar: (actorId, targetX, targetY) =>
        isTileBombardBlockedByRadarImpl(this.tiles, actorId, targetX, targetY),
      emitPlayerMessage: (command, payload) => this.emitPlayerMessage(command, payload),
      getAbilityCooldownUntil: (playerId, abilityKey) => this.getAbilityCooldownUntil(playerId, abilityKey),
      setAbilityCooldownUntil: (playerId, abilityKey, untilMs) => this.setAbilityCooldownUntil(playerId, abilityKey, untilMs),
      strategicResourceAmount: (player, resource) => this.strategicResourceAmount(player, resource),
      addStrategicResource: (player, resource, amount) => this.addStrategicResource(player, resource, amount)
    };
  }

  private getAbilityCooldownUntil(playerId: string, abilityKey: string): number {
    return getAbilityCooldownUntilImpl(this.abilityCooldowns, playerId, abilityKey);
  }

  private setAbilityCooldownUntil(playerId: string, abilityKey: string, untilMs: number): void {
    setAbilityCooldownUntilImpl(this.abilityCooldowns, playerId, abilityKey, untilMs);
  }

  private isTileShieldedByAegisLock(actorId: string, targetX: number, targetY: number): boolean {
    return isTileShieldedByAegisLockImpl(this.tiles, this.abilityCooldowns, this.now(), actorId, targetX, targetY);
  }

  private progressionCommandContext(): RuntimeProgressionCommandContext {
    return {
      players: this.players,
      tiles: this.tiles,
      emitEvent: (event) => this.emitEvent(event),
      emitPlayerStateUpdate: (command, playerId) => this.emitPlayerStateUpdate(command, playerId),
      spendStrategicResource: (player, resource, amount) => this.spendStrategicResource(player, resource, amount),
      addStrategicResource: (player, resource, amount) => this.addStrategicResource(player, resource, amount),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      setTileState: (tileKey, tile) => {
        const previous = this.tiles.get(tileKey);
        this.tiles.set(tileKey, tile); this.snapshotTileCache.set(tileKey, mapTile(tile));
        flushRadiusYieldRefresh({ tileKey, previous, next: tile, tiles: this.tiles, dockLinksByDockTileKey: this.dockLinksByDockTileKey, settledTilesForPlayer: (p) => this.settledTilesForPlayer(p), tileDeltaFromState: (t) => this.tileDeltaFromState(t), emitEvent: (e) => this.emitEvent(e), now: () => this.now() });
      },
      invalidateTileStringifyCache: (tileKey) => this.tileDeltaStringifyCache.invalidate(tileKey),
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      invalidateEconomySnapshot: (playerId) => this.economySnapshotCacheByPlayer.delete(playerId),
      invalidateTileYieldContext: (playerId) => this.tileYieldContextCacheByPlayer.delete(playerId),
      invalidateUpkeepAccrual: (playerId) => this.upkeepAccrualCacheByPlayer.delete(playerId),
      resyncVisionRadius: (playerId) => this.visibilityCoverage.resyncVisionRadius(playerId, this.visionTransitions.callbacks),
      incomePerMinuteForPlayer: (playerId) => this.incomePerMinuteForPlayer(playerId),
      decrementShardRainSiteCount: () => {
        this.currentShardRainSiteCount = Math.max(0, this.currentShardRainSiteCount - 1);
        return this.currentShardRainSiteCount;
      },
      clearShardRainExpiry: () => { this.currentShardRainExpiresAt = undefined; },
      clearLastShardRainHello: () => this.lastShardRainHelloByPlayer.clear(),
      onShardCollected: this.onShardCollected
    };
  }

  private handleUpgradeTownTierCommand(command: CommandEnvelope): void {
    handleUpgradeTownTierCommandImpl(this.progressionCommandContext(), command);
  }

  private handleCollectShardCommand(command: CommandEnvelope): void {
    handleCollectShardCommandImpl(this.progressionCommandContext(), command);
  }

  private handleChooseTechCommand(command: CommandEnvelope): void {
    handleChooseTechCommandImpl(this.progressionCommandContext(), command);
  }

  private handleChooseDomainCommand(command: CommandEnvelope): void {
    handleChooseDomainCommandImpl(this.progressionCommandContext(), command);
  }

  private emitPlayerMessage(command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: Record<string, unknown>): void {
    const messageType = typeof payload.type === "string" ? payload.type : "UNKNOWN";
    this.emitEvent({
      eventType: "PLAYER_MESSAGE",
      commandId: command.commandId,
      playerId: command.playerId,
      messageType,
      payloadJson: JSON.stringify(payload)
    });
  }

  private revealTargetsForPlayer(playerId: string): Set<string> {
    let targets = this.revealTargetsByPlayer.get(playerId);
    if (!targets) {
      targets = new Set<string>();
      this.revealTargetsByPlayer.set(playerId, targets);
    }
    return targets;
  }

  private revealCapacityForPlayer(player: DomainPlayer): number {
    return revealCapacityForPlayerImpl(player, this.revealTargetsForPlayer(player.id).size);
  }

  private ownedLandWithinRange(playerId: string, x: number, y: number, range: number): boolean {
    return ownedLandWithinRangeImpl(this.tiles, playerId, x, y, range);
  }

  isStructurePowered(ownerId: string, tileKey: string, structureType: EconomicStructureType): boolean {
    return isStructurePoweredImpl(this.tiles, ownerId, tileKey, structureType);
  }

  // Aegis Dome shields tiles within AEGIS_DOME_PROTECTION_RADIUS for its
  // owner. Worldbreaker Shot is the first ability that respects this — if an
  // enemy player has an active, powered Aegis Dome within range of the target
  // tile, the strike is blocked.
  isTileShieldedByEnemyAegisDome(actorId: string, targetX: number, targetY: number): boolean {
    return isTileShieldedByEnemyAegisDomeImpl(this.tiles, actorId, targetX, targetY);
  }

  /**
   * Effective observatory cast radius for a player: BASE constant plus
   * observatoryRangeBonus + observatoryCastRadiusBonus from techs/domains. Mirrors
   * the client's `ownObservatoryCastRadius` so menu enablement and sim authority
   * agree on which observatories can reach a target.
   */
  private observatoryCastRadiusFor(playerId: string): number {
    return observatoryCastRadiusForImpl(this.players.get(playerId));
  }

  /**
   * Crystal-ability cooldowns are stored per-observatory. To cast, the player must
   * own an active observatory within the player's effective cast radius of the
   * target tile whose cooldownUntil has elapsed. The chosen observatory's tile key
   * is returned so the caller can stamp the cooldown on it; overlapping observatories
   * therefore let the player chain casts.
   *
   * Tie-break: among off-cooldown candidates, prefer the closest observatory to the
   * target (wrapped Chebyshev). This avoids burning a long-range observatory's slot
   * when a nearer one is available, and yields stable UX (same target picks the same
   * observatory). Ties on distance fall back to Map iteration order (deterministic).
   */
  private pickReadyOwnedObservatoryForTarget(
    playerId: string, targetX: number, targetY: number, now: number, range = this.observatoryCastRadiusFor(playerId)
  ): string | undefined {
    const territoryTileKeys = this.summaryForPlayer(playerId).territoryTileKeys;
    return pickReadyOwnedObservatoryForTargetImpl({ tiles: this.tiles, territoryTileKeys, playerId, targetX, targetY, now, range });
  }

  /**
   * Variant for abilities with no spatial target (e.g. reveal_empire_stats targets a
   * player). Returns any owned, active, off-cooldown observatory, soonest-ready first.
   */
  private pickReadyOwnedObservatoryAny(playerId: string, now: number): string | undefined {
    return pickReadyOwnedObservatoryAnyImpl(this.tiles, this.summaryForPlayer(playerId).territoryTileKeys, playerId, now);
  }

  /**
   * Stamp cooldownUntil = now + durationMs onto the observatory at `tileKey`.
   * Updates the canonical tile state and emits a tile delta so clients see the new
   * cooldown via `tile.observatory.cooldownUntil`.
   */
  private stampObservatoryCooldown(
    tileKey: string,
    durationMs: number,
    now: number,
    commandId: string,
    playerId: string
  ): void {
    const tile = this.tiles.get(tileKey);
    if (!tile?.observatory) return;
    const updatedTile: DomainTileState = {
      ...tile,
      observatory: { ...tile.observatory, cooldownUntil: now + durationMs }
    };
    this.replaceTileState(tileKey, updatedTile, commandId);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId,
      playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
  }

  private isCoastalLand(x: number, y: number): boolean {
    return isCoastalLandImpl(this.tiles, x, y);
  }

  private closestAetherBridgeOrigin(playerId: string, targetX: number, targetY: number): { x: number; y: number } | undefined {
    return closestAetherBridgeOriginImpl(this.tiles, playerId, targetX, targetY);
  }

  private wallSegments(originX: number, originY: number, direction: AetherWallDirection, length: 1 | 2 | 3): AetherWallSegment[] {
    return wallSegmentsImpl(originX, originY, direction, length);
  }

  private activeAetherBridgesForPlayer(playerId: string): ActiveAetherBridgeView[] {
    return activeAetherBridgesForPlayerImpl(this.activeAetherBridgesByPlayer, playerId, this.now());
  }

  private activeAetherWallsForPlayer(playerId: string): ActiveAetherWallView[] {
    return activeAetherWallsForPlayerImpl(this.activeAetherWallsByPlayer, playerId, this.now());
  }

  private crossingBlockedByAetherWall(fromX: number, fromY: number, toX: number, toY: number): boolean {
    return crossingBlockedByAetherWallImpl(this.activeAetherWallsByPlayer, this.now(), fromX, fromY, toX, toY);
  }

  private buildRevealEmpireStats(target: DomainPlayer): Record<string, unknown> {
    const summary = this.summaryForPlayer(target.id);
    return buildRevealEmpireStatsFromSummary(target, summary.territoryTileKeys.size, summary.settledTileCount, summary.townCount, this.now());
  }

  private emitEvent(event: SimulationEvent): void {
    if (this.deltaBuffer.absorb(event)) return;
    if (event.eventType === "TILE_DELTA_BATCH") {
      const expanded = this.expandTileDeltasWithLinkedDocks(event.tileDeltas);
      if (expanded !== event.tileDeltas) event = { ...event, tileDeltas: expanded };
    }
    this.persistence.recordEvent(event);
    this.replayCache.recordEvent(event);
    this.events.emit("event", event);
  }

  private expandTileDeltasWithLinkedDocks(
    deltas: Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"]
  ): Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"] {
    const dockTileKeysInBatch: string[] = [];
    for (const delta of deltas) {
      if (!delta.dockId) continue;
      const tile = this.tiles.get(simulationTileKey(delta.x, delta.y));
      if (tile?.ownershipState !== "SETTLED") continue;
      dockTileKeysInBatch.push(simulationTileKey(delta.x, delta.y));
    }
    if (dockTileKeysInBatch.length === 0) return deltas;
    const revealKeys = computeLinkedDockRevealTileKeys(
      dockTileKeysInBatch,
      this.dockLinksByDockTileKey,
      WORLD_WIDTH,
      WORLD_HEIGHT
    );
    if (revealKeys.size === 0) return deltas;
    const seen = new Set<string>(deltas.map((delta) => simulationTileKey(delta.x, delta.y)));
    const additional: typeof deltas = [];
    for (const tileKey of revealKeys) {
      if (seen.has(tileKey)) continue;
      const tile = this.tiles.get(tileKey);
      if (!tile) continue;
      additional.push(this.tileDeltaFromState(tile));
    }
    if (additional.length === 0) return deltas;
    return [...deltas, ...additional];
  }

  private scheduleLockResolution(lock: LockRecord): void {
    this.scheduleAfter(Math.max(1, lock.resolvesAt - this.now()), () => {
      this.resolveLock(lock);
    });
  }

  // Shared arg-builder for buildTileYieldView's economyContext param.
  private yieldViewEconomyContext(player: RuntimePlayer | undefined, ctx: RuntimeTileYieldEconomyContext | undefined) {
    return { ...(player ? { player } : {}), ...(ctx ? { fedTownKeys: ctx.fedTownKeys, firstThreeTownKeys: ctx.firstThreeTownKeys, waterworksKeys: ctx.waterworksKeys, foundryKeys: ctx.foundryKeys } : {}), tiles: this.tiles, dockLinksByDockTileKey: this.dockLinksByDockTileKey };
  }

  private tileDeltaFromState(tile: DomainTileState, context?: RuntimeTileYieldEconomyContext): SimulationTileWireDelta {
    const player = tile.ownerId ? this.players.get(tile.ownerId) : undefined;
    const resolvedContext = player && context?.player.id === player.id ? context : player ? this.tileYieldEconomyContextForPlayer(player) : undefined;
    const enrichedTile = tile.town && resolvedContext ? this.enrichTileWithTownContext(tile, player, resolvedContext) : tile;
    const yieldView = buildTileYieldView(enrichedTile, this.tileYieldCollectedAt(simulationTileKey(tile.x, tile.y), tile.ownerId), this.now(), this.yieldViewEconomyContext(player, resolvedContext));
    const tileKey = simulationTileKey(tile.x, tile.y);
    const cached = this.tileDeltaStringifyCache.getOrComputeAll(tileKey, tile);
    const fullDelta: SimulationTileWireDelta = {
      x: tile.x,
      y: tile.y,
      ...(tile.terrain ? { terrain: tile.terrain } : {}),
      ...(tile.resource ? { resource: tile.resource } : {}),
      ...(tile.dockId ? { dockId: tile.dockId } : {}),
      ...(cached.shardSiteJson ? { shardSiteJson: cached.shardSiteJson } : {}),
      // Conditional spread: prevents false clears on first delta; SparseEmit detects changes.
      ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
      ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
      ...(typeof tile.frontierDecayAt === "number" ? { frontierDecayAt: tile.frontierDecayAt } : {}),
      ...(tile.frontierDecayKind ? { frontierDecayKind: tile.frontierDecayKind } : {}),
      ...(typeof tile.breachShockUntil === "number" ? { breachShockUntil: tile.breachShockUntil } : {}),
      ...(enrichedTile.town ? { townJson: JSON.stringify(enrichedTile.town) } : {}),
      ...(enrichedTile.town?.type ? { townType: enrichedTile.town.type } : {}),
      ...(enrichedTile.town?.name ? { townName: enrichedTile.town.name } : {}),
      ...(enrichedTile.town?.populationTier ? { townPopulationTier: enrichedTile.town.populationTier } : {}),
      fortJson: cached.fortJson,
      observatoryJson: cached.observatoryJson,
      siegeOutpostJson: cached.siegeOutpostJson,
      economicStructureJson: cached.economicStructureJson,
      sabotageJson: cached.sabotageJson,
      musterJson: cached.musterJson,
      ...(yieldView?.yield ? { yield: yieldView.yield } : {}),
      // yieldRate/yieldCap scoped emission: see tileYieldNeedsServerAuthority.
      ...(yieldView && tileYieldNeedsServerAuthority(tile) ? { yieldRate: yieldView.yieldRate, yieldCap: yieldView.yieldCap } : {})
    };
    return this.tileDeltaStringifyCache.sparseEmit(tileKey, tile, cached, fullDelta);
  }

  private tileDeltaRevealOnly(tile: DomainTileState): SimulationTileWireDelta {
    return tileDeltaRevealOnlyImpl(tile, this.tileDeltaStringifyCache);
  }

  private collectTileYield(
    tile: DomainTileState,
    now: number,
    command: Pick<CommandEnvelope, "commandId" | "playerId">,
    context?: RuntimeTileYieldEconomyContext,
    options: { creditStrategic?: boolean; persistAnchor?: boolean } = {}
  ): {
    gold: number;
    strategic: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>>;
  } {
    const creditStrategic = options.creditStrategic ?? true;
    const persistAnchor = options.persistAnchor ?? true;
    const tileKey = simulationTileKey(tile.x, tile.y);
    const player = tile.ownerId ? this.players.get(tile.ownerId) : undefined;
    const resolvedContext = player && context?.player.id === player.id ? context : player ? this.tileYieldEconomyContextForPlayer(player) : undefined;
    const enrichedTile = tile.town && resolvedContext ? this.enrichTileWithTownContext(tile, player, resolvedContext) : tile;
    const yieldView = buildTileYieldView(enrichedTile, this.tileYieldCollectedAt(tileKey, tile.ownerId), now, this.yieldViewEconomyContext(player, resolvedContext));
    const gold = Math.floor((yieldView?.yield?.gold ?? 0) * 100) / 100;
    const strategic: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>> = {};
    for (const [resource, amount] of Object.entries(yieldView?.yield?.strategic ?? {}) as Array<
      ["FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number]
    >) {
      if (amount > 0) {
        strategic[resource] = amount;
        if (creditStrategic && player) this.addStrategicResource(player, resource, amount);
      }
    }
    if (persistAnchor && (gold > 0 || Object.keys(strategic).length > 0)) {
      this.setTileYieldCollectedAt(command.commandId, command.playerId, tileKey, now);
    }
    return { gold, strategic };
  }

  private strategicResourceAmount(player: DomainPlayer, resource: StrategicResourceKey): number {
    return player.strategicResources?.[resource] ?? 0;
  }

  private spendStrategicResource(player: DomainPlayer, resource: StrategicResourceKey, amount: number): boolean {
    const current = this.strategicResourceAmount(player, resource);
    if (current + 1e-6 < amount) return false;
    player.strategicResources = {
      ...(player.strategicResources ?? {}),
      [resource]: Math.max(0, current - amount)
    };
    return true;
  }

  private addStrategicResource(player: DomainPlayer, resource: StrategicResourceKey, amount: number): void {
    const current = this.strategicResourceAmount(player, resource);
    player.strategicResources = {
      ...(player.strategicResources ?? {}),
      [resource]: current + amount
    };
  }

  private ownedTileCountForPlayer(playerId: string): number {
    return this.summaryForPlayer(playerId).territoryTileKeys.size;
  }

  private adjacentTileStates(x: number, y: number): DomainTileState[] {
    const result: DomainTileState[] = [];
    forEachFrontierNeighbor(x, y, (nx, ny) => {
      const tile = this.tiles.get(simulationTileKey(nx, ny));
      if (tile) result.push(tile);
    });
    return result;
  }

  private extendFortPatrolGrace(tileKey: string, graceUntil: number): void {
    this.fortPatrolGraceUntilByTile.set(tileKey, Math.max(this.fortPatrolGraceUntilByTile.get(tileKey) ?? 0, graceUntil));
  }

  private isDockCrossingTarget(from: DomainTileState, toX: number, toY: number): boolean {
    return isValidDockCrossingTarget(simulationTileKey(from.x, from.y), toX, toY, this.dockLinksByDockTileKey);
  }

  private isAetherBridgeCrossingTarget(
    playerId: string,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
  ): boolean {
    for (const bridge of this.activeAetherBridgesForPlayer(playerId)) {
      if (
        bridge.from.x === fromX &&
        bridge.from.y === fromY &&
        bridge.to.x === toX &&
        bridge.to.y === toY
      ) {
        return true;
      }
    }
    return false;
  }

  private findOwnedDockOriginForCrossing(playerId: string, toX: number, toY: number): DomainTileState | undefined {
    for (const tileKey of this.summaryForPlayer(playerId).territoryTileKeys) {
      const tile = this.tiles.get(tileKey);
      if (!tile || tile.ownerId !== playerId || tile.terrain !== "LAND") continue;
      if (this.isDockCrossingTarget(tile, toX, toY)) return tile;
    }
    return undefined;
  }

  private findOwnedAetherBridgeOriginForCrossing(playerId: string, toX: number, toY: number): DomainTileState | undefined {
    for (const bridge of this.activeAetherBridgesForPlayer(playerId)) {
      if (bridge.to.x !== toX || bridge.to.y !== toY) continue;
      const origin = this.tiles.get(simulationTileKey(bridge.from.x, bridge.from.y));
      if (origin?.ownerId === playerId) return origin;
    }
    return undefined;
  }

  private supportedTownKeysForTile(playerId: string, x: number, y: number): string[] {
    return supportedTownKeysForTileImpl(this.tiles, playerId, x, y);
  }

  private assignedTownKeyForSupportTile(playerId: string, x: number, y: number): string | undefined {
    return assignedTownKeyForSupportTileImpl(this.tiles, playerId, x, y);
  }

  private supportedDockKeysForTile(playerId: string, x: number, y: number): string[] {
    return supportedDockKeysForTileImpl(this.tiles, playerId, x, y);
  }

  private economicStructureForSupportedTown(playerId: string, townKey: string, structureType: EconomicStructureType): DomainTileState | undefined {
    return economicStructureForSupportedTownImpl(this.tiles, playerId, townKey, structureType);
  }

  private firstAvailableTownSupportTile(playerId: string, townKey: string, structureType: EconomicStructureType): DomainTileState | undefined {
    return firstAvailableTownSupportTileImpl(this.tiles, playerId, townKey, structureType);
  }

  private ownedStructureCountForPlayer(playerId: string, structureType: BuildableStructureType): number {
    return ownedStructureCountForPlayerImpl(this.ownedStructureCountByPlayerByType, playerId, structureType);
  }
  private ownedStructureCountsForPlayer(playerId: string) { return ownedStructureCountsForPlayerImpl(this.ownedStructureCountByPlayerByType, playerId); }

  private adjustOwnedStructureCount(ownerId: string, structureType: BuildableStructureType, delta: number): void {
    adjustOwnedStructureCountImpl(this.ownedStructureCountByPlayerByType, ownerId, structureType, delta);
  }

  private refreshOwnedStructureCountIndexForTile(
    previous: DomainTileState | undefined,
    next: DomainTileState
  ): void {
    refreshOwnedStructureCountIndexForTileImpl({
      previous,
      next,
      adjustOwnedStructureCount: (ownerId, structureType, delta) => this.adjustOwnedStructureCount(ownerId, structureType, delta)
    });
  }

  // ── Unified build handler (Phase 2) ──────────────────────────────

  private normalizeLegacyBuildCommand(command: CommandEnvelope): CommandEnvelope {
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(command.payloadJson) as Record<string, unknown>; }
    catch { /* TODO: emit counter command_legacy_normalize_parse_error{type} */ return command; }
    let structureType: string;
    if (command.type === "BUILD_FORT") structureType = "FORT";
    else if (command.type === "BUILD_OBSERVATORY") structureType = "OBSERVATORY";
    else if (command.type === "BUILD_SIEGE_OUTPOST") structureType = "SIEGE_OUTPOST";
    else if (command.type === "BUILD_ECONOMIC_STRUCTURE") structureType = payload.structureType as string;
    else structureType = command.type;
    return {
      ...command,
      type: "BUILD_STRUCTURE",
      payloadJson: JSON.stringify({ x: payload.x, y: payload.y, structureType })
    } as unknown as CommandEnvelope;
  }

  private structureCommandContext(): RuntimeStructureCommandContext {
    return {
      players: this.players,
      tiles: this.tiles,
      musterTilesByOwner: this.musterTilesByOwner,
      locksByTile: this.locksByTile,
      locksByCommandId: this.locksByCommandId,
      now: this.now,
      emitEvent: (event) => this.emitEvent(event),
      emitPlayerStateUpdate: (command, playerId) => this.emitPlayerStateUpdate(command, playerId),
      scheduleAfter: (delayMs, callback) => this.scheduleAfter(delayMs, callback),
      applyManpowerRegen: (player) => this.applyManpowerRegen(player),
      playerManpowerCap: (player) => this.playerManpowerCap(player),
      rejectIfNoDevelopmentSlot: (command, code, message) => this.rejectIfNoDevelopmentSlot(command, code, message),
      strategicResourceAmount: (player, resource) => this.strategicResourceAmount(player, resource),
      spendStrategicResource: (player, resource, amount) => this.spendStrategicResource(player, resource, amount),
      ownedStructureCountForPlayer: (playerId, structureType) => this.ownedStructureCountForPlayer(playerId, structureType),
      supportedTownKeysForTile: (playerId, x, y) => this.supportedTownKeysForTile(playerId, x, y),
      supportedDockKeysForTile: (playerId, x, y) => this.supportedDockKeysForTile(playerId, x, y),
      economicStructureForSupportedTown: (playerId, townKey, structureType) => this.economicStructureForSupportedTown(playerId, townKey, structureType),
      firstAvailableTownSupportTile: (playerId, townKey, structureType) => this.firstAvailableTownSupportTile(playerId, townKey, structureType),
      assignedTownKeyForSupportTile: (playerId, x, y) => this.assignedTownKeyForSupportTile(playerId, x, y),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      completeStructureBuild: (targetKey, ownerId, structureType, commandId) => this.completeStructureBuild(targetKey, ownerId, structureType, commandId),
      completeStructureRemoval: (targetKey, ownerId, commandId) => this.completeStructureRemoval(targetKey, ownerId, commandId)
    };
  }

  private handleBuildStructureCommand(command: CommandEnvelope): void {
    handleBuildStructureCommandImpl(this.structureCommandContext(), command);
  }

  private completeStructureBuild(targetKey: string, ownerId: string, structureType: string, commandId: string): void {
    completeStructureBuildImpl(this.structureCommandContext(), targetKey, ownerId, structureType, commandId);
  }

  private cancelActiveOutpostAttackLocks(playerId: string, originKey: string): string[] {
    return cancelActiveOutpostAttackLocksImpl(this.structureCommandContext(), playerId, originKey);
  }

  private handleSetMusterCommand(command: CommandEnvelope): void {
    handleSetMusterCommandImpl(this.structureCommandContext(), command);
  }

  private handleClearMusterCommand(command: CommandEnvelope): void {
    handleClearMusterCommandImpl(this.structureCommandContext(), command);
  }

  private handleWatchMusterCommand(command: CommandEnvelope): void {
    const payload = JSON.parse(command.payloadJson) as { x: number; y: number };
    this.watchedMusterTileByPlayer.set(command.playerId, simulationTileKey(payload.x, payload.y));
    this.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
  }

  private handleUnwatchMusterCommand(command: CommandEnvelope): void {
    this.watchedMusterTileByPlayer.delete(command.playerId);
    this.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
  }

  private handleCancelFortBuildCommand(command: CommandEnvelope): void {
    handleCancelFortBuildCommandImpl(this.structureCommandContext(), command);
  }

  private handleCancelStructureBuildCommand(command: CommandEnvelope): void {
    handleCancelStructureBuildCommandImpl(this.structureCommandContext(), command);
  }

  private handleRemoveStructureCommand(command: CommandEnvelope): void {
    handleRemoveStructureCommandImpl(this.structureCommandContext(), command);
  }

  private completeStructureRemoval(targetKey: string, ownerId: string, commandId: string): void {
    completeStructureRemovalImpl(this.structureCommandContext(), targetKey, ownerId, commandId);
  }

  private handleCancelSiegeOutpostBuildCommand(command: CommandEnvelope): void {
    handleCancelSiegeOutpostBuildCommandImpl(this.structureCommandContext(), command);
  }

  // Player-ids with at least one *player-issued* frontier lock - i.e. locks
  // that should gate the AI strategic planner. Automation combat locks are
  // filtered so defensive sweeps do not starve the planner.
  private plannerGatingLockPlayerIds(): Set<string> {
    return plannerGatingLockPlayerIdsImpl(this.locksByTile);
  }

  private handleCancelCaptureCommand(command: CommandEnvelope): void {
    handleCancelCaptureCommandImpl(this.combatSupportContext(), command);
  }

  private buildCaptureRevealTileDeltas(
    playerId: string,
    centerX: number,
    centerY: number
  ): ReturnType<SimulationRuntime["tileDeltaFromState"]>[] {
    return buildCaptureRevealTileDeltasImpl(this.combatSupportContext(), playerId, centerX, centerY);
  }

  private buildLockedCombatResolution(lock: LockedCombatInput): LockedCombatResolution | undefined {
    return buildLockedCombatResolutionImpl(this.combatSupportContext(), lock);
  }

  private releaseMusterReservation(lock: LockRecord): void {
    releaseMusterReservationImpl(this.lockResolutionContext(), lock);
  }

  private resolveLock(lock: LockRecord): void {
    this.deltaBuffer.begin();
    try { resolveLockImpl(this.lockResolutionContext(), lock); }
    finally { this.deltaBuffer.flush(lock.commandId, lock.playerId, (e: SimulationEvent) => this.emitEvent(e)); }
  }

  private applyEncirclementForExpand(targetKey: string, playerId: string, commandId: string, options?: { bfsCap?: number }): void {
    applyEncirclementForExpandImpl(this.encirclementApplicationContext(), targetKey, playerId, commandId, options);
  }

  private applyEncirclement(
    changedKeys: string[],
    playerId: string,
    commandId: string,
    options?: { bfsCap?: number; skipCutOff?: boolean }
  ): void {
    applyEncirclementImpl(this.encirclementApplicationContext(), changedKeys, playerId, commandId, options);
  }

  private activeAetherBridgeNeighborKeysForPlayer(playerId: string): Map<string, string[]> {
    return activeAetherBridgeNeighborKeysForPlayerImpl(this.encirclementApplicationContext(), playerId);
  }

  private relocateSettlementForPlayer(
    playerId: string,
    commandId: string,
    population: number
  ): boolean {
    const summary = this.summaryForPlayer(playerId);
    if (summary.territoryTileKeys.size === 0) return false; // respawnIfEliminated handles full eliminations.
    return this.placeSettlementOnOwnedLandForPlayer(playerId, commandId, population, {
      namePrefix: "Refuge"
    });
  }

  private placeSettlementOnOwnedLandForPlayer(
    playerId: string,
    commandId: string,
    population: number,
    options: { namePrefix: string }
  ): boolean {
    const summary = this.summaryForPlayer(playerId);
    // Use the oldest remaining owned land tile that does not already have a town.
    let targetKey: string | undefined;
    for (const tileKey of summary.territoryTileKeys) {
      const tile = this.tiles.get(tileKey);
      if (!tile || tile.terrain !== "LAND" || tile.ownerId !== playerId) continue;
      if (tile.town) continue;
      targetKey = tileKey;
      break;
    }
    if (!targetKey) return false;
    const target = this.tiles.get(targetKey);
    if (!target) return false;
    const relocated: DomainTileState = {
      ...target,
      ownershipState: "SETTLED",
      town: {
        name: `${options.namePrefix} ${target.x},${target.y}`,
        type: "FARMING",
        populationTier: "SETTLEMENT",
        population
      }
    };
    this.replaceTileState(targetKey, relocated, commandId);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId,
      playerId,
      tileDeltas: [this.tileDeltaFromState(relocated)]
    });
    return true;
  }

  private respawnPlayerOnUnownedLand(playerId: string, commandId: string): boolean {
    return respawnPlayerOnUnownedLandImpl(this.respawnContext(), playerId, commandId);
  }

  private applyBarbarianWalkOrMultiply(lock: LockRecord, previousTarget: DomainTileState | undefined): void {
    applyBarbarianWalkOrMultiplyImpl(this.combatSupportContext(), lock, previousTarget);
  }

  private applyResourceTileSteal(
    attacker: DomainPlayer,
    defender: DomainPlayer,
    tileResource: string | undefined,
    structureType?: string
  ): void {
    applyResourceTileStealImpl(this.resourceStealContext(), attacker, defender, tileResource, structureType);
  }

  private applySettledCapturePlunder(input: {
    attacker: DomainPlayer;
    defender: DomainPlayer;
    gold: number;
    defenderGoldLoss: number;
  }): void {
    applySettledCapturePlunderImpl(input);
  }

  private attackManpowerLoss(committedManpower: number, attackerWon: boolean, atkEff: number, defEff: number): number {
    return attackManpowerLossImpl(committedManpower, attackerWon, atkEff, defEff);
  }

  private applyLockedManpowerDelta(player: DomainPlayer, manpowerDelta: number): number {
    return applyLockedManpowerDeltaImpl(player, manpowerDelta);
  }

  private settleAttackManpower(
    player: DomainPlayer,
    committedManpower: number,
    attackerWon: boolean,
    atkEff: number,
    defEff: number
  ): number {
    return settleAttackManpowerImpl(player, committedManpower, attackerWon, atkEff, defEff);
  }

  /**
   * Find the best muster source for an attack launched from originKey.
   *
   * Fast path: if the origin tile itself has enough muster, return it immediately
   * (zero overhead vs. the old single-tile check).
   *
   * Slow path: iterate the player's muster index (realistically 1-5 entries) and
   * pick the nearest tile with available muster (staged minus any in-flight
   * reservation) within Chebyshev distance 4, matching VISION_RADIUS so the
   * staging tile is always within the player's own sight.
   *
   * Returns { sourceKey, available } or undefined if nothing is reachable.
   */
  private resolveMusterSource(
    actorId: string,
    originKey: string,
    requiredMuster: number,
    preferredKey?: string
  ): { sourceKey: string; available: number } | undefined {
    return resolveMusterSourceImpl(actorId, originKey, requiredMuster, preferredKey, {
      tiles: this.tiles,
      musterTilesByOwner: this.musterTilesByOwner,
      musterReservedByKey: this.musterReservedByKey
    });
  }

  /**
   * Manpower an attacker must have mustered to strike this target. Phase 5
   * baseline: flat attack cost, raised to fort garrison (Phase 7), lowered
   * for barbarian raids (Phase 8) and FRONTIER targets (forts only defend once SETTLED).
   */
  private requiredMusterForTarget(target: DomainTileState): number {
    // Barbarian tiles are raided cheaply from the pool (handled in validateFrontierCommand).
    if (target.ownerId === "barbarian-1") return BARBARIAN_RAID_COST;
    if (target.ownershipState === "FRONTIER") return FRONTIER_ATTACK_MUSTER_COST;
    const fortGarrison = (target.fort?.status === "active" && target.fort.garrison != null) ? target.fort.garrison : 0;
    return Math.max(MUSTER_ATTACK_COST, Math.ceil(fortGarrison));
  }

  /**
   * Spend mustered manpower from the origin tile after a resolved attack under
   * the muster system. The pool is untouched (it was already drained into the
   * muster during accumulation).
   */
  private consumeOriginMuster(originKey: string, playerId: string, amount: number): void {
    const tile = this.tiles.get(originKey);
    if (!tile?.muster || tile.muster.ownerId !== playerId) return;
    const nextAmount = Math.max(0, tile.muster.amount - amount);
    const updatedTile: DomainTileState = {
      ...tile,
      muster: { ...tile.muster, amount: nextAmount, updatedAt: this.now() }
    };
    this.replaceTileState(originKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: `muster-spend:${originKey}:${this.now()}`,
      playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
  }

  /**
   * Reduce a defending fort's garrison after a repulsed assault.
   * The attrittion fraction is a random draw in [MIN, MAX] applied to the attacking force.
   */
  private applyFortGarrisonAttrition(targetKey: string, attackingForce: number): void {
    const tile = this.tiles.get(targetKey);
    if (!tile?.fort || tile.fort.status !== "active" || tile.fort.garrison == null) return;
    const fraction = FORT_GARRISON_ATTRITION_MIN +
      Math.random() * (FORT_GARRISON_ATTRITION_MAX - FORT_GARRISON_ATTRITION_MIN);
    const loss = fraction * attackingForce;
    const updatedTile: DomainTileState = {
      ...tile,
      fort: { ...tile.fort, garrison: Math.max(0, tile.fort.garrison - loss), garrisonUpdatedAt: this.now() }
    };
    this.replaceTileState(targetKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: `fort-attrition:${targetKey}:${this.now()}`,
      playerId: tile.fort.ownerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
  }

  private respawnIfEliminated(playerId: string, commandId: string): void {
    respawnIfEliminatedImpl(this.respawnContext(), playerId, commandId);
  }

  private commandDispatchHandlers(): RuntimeCommandDispatchHandlers {
    return {
      emitUnsupported: (command) => {
        this.rejectCommand(command, "UNSUPPORTED", `${command.type} not yet migrated to the new simulation service`);
      },
      handleSettleCommand: (command) => this.handleSettleCommand(command),
      handleBuildStructureCommand: (command) => this.handleBuildStructureCommand(command),
      normalizeLegacyBuildCommand: (command) => this.normalizeLegacyBuildCommand(command),
      handleSetMusterCommand: (command) => this.handleSetMusterCommand(command),
      handleClearMusterCommand: (command) => this.handleClearMusterCommand(command),
      handleWatchMusterCommand: (command) => this.handleWatchMusterCommand(command),
      handleUnwatchMusterCommand: (command) => this.handleUnwatchMusterCommand(command),
      handleCancelCaptureCommand: (command) => this.handleCancelCaptureCommand(command),
      handleCancelFortBuildCommand: (command) => this.handleCancelFortBuildCommand(command),
      handleCancelStructureBuildCommand: (command) => this.handleCancelStructureBuildCommand(command),
      handleRemoveStructureCommand: (command) => this.handleRemoveStructureCommand(command),
      handleCancelSiegeOutpostBuildCommand: (command) => this.handleCancelSiegeOutpostBuildCommand(command),
      handleCollectTileCommand: (command) => this.handleCollectTileCommand(command),
      handleCollectVisibleCommand: (command) => this.handleCollectVisibleCommand(command),
      handleUncaptureTileCommand: (command) => this.handleUncaptureTileCommand(command),
      handleChooseTechCommand: (command) => this.handleChooseTechCommand(command),
      handleChooseDomainCommand: (command) => this.handleChooseDomainCommand(command),
      handleOverloadSynthesizerCommand: (command) => this.handleOverloadSynthesizerCommand(command),
      handleSetConverterStructureEnabledCommand: (command) => this.handleSetConverterStructureEnabledCommand(command),
      handleRevealEmpireCommand: (command) => this.handleRevealEmpireCommand(command),
      handleRevealEmpireStatsCommand: (command) => this.handleRevealEmpireStatsCommand(command),
      handleSurveySweepCommand: (command) => this.handleSurveySweepCommand(command),
      handleAetherLanceCommand: (command) => this.handleAetherLanceCommand(command),
      handleCastAetherBridgeCommand: (command) => this.handleCastAetherBridgeCommand(command),
      handleCastAetherWallCommand: (command) => this.handleCastAetherWallCommand(command),
      handleSiphonTileCommand: (command) => this.handleSiphonTileCommand(command),
      handlePurgeSiphonCommand: (command) => this.handlePurgeSiphonCommand(command),
      handleCreateMountainCommand: (command) => handleCreateMountainCommandImpl(this.mapCommandContext(), command),
      handleRemoveMountainCommand: (command) => handleRemoveMountainCommandImpl(this.mapCommandContext(), command),
      handleAirportBombardCommand: (command) => handleAirportBombardCommandImpl(this.mapCommandContext(), command),
      handleImperialExchangeLevyCommand: (command) => handleImperialExchangeLevyCommandImpl(this.mapCommandContext(), command),
      handleWorldEngineStrikeCommand: (command) => handleWorldEngineStrikeCommandImpl(this.mapCommandContext(), command),
      handleAegisLockCommand: (command) => handleAegisLockCommandImpl(this.mapCommandContext(), command),
      handleAstralDockLaunchCommand: (command) => handleAstralDockLaunchCommandImpl(this.mapCommandContext(), command),
      handleActivateImperialWardCommand: (command) => handleActivateImperialWardCommandImpl(this.mapCommandContext(), command),
      handleUpgradeTownTierCommand: (command) => this.handleUpgradeTownTierCommand(command),
      handleCollectShardCommand: (command) => this.handleCollectShardCommand(command),
      handleSyncAllianceCommand: (command) => this.handleSyncAllianceCommand(command), handleSyncTruceCommand: (command) => handleSyncTruceCommandImpl(this.mapCommandContext(), command),
      handleFrontierCommand: (command, actionType) => this.handleFrontierCommand(command, actionType)
    };
  }

  private queueCommandForProcessing(command: CommandEnvelope): void {
    this.updatePlayerLastActive(command.playerId, this.now());
    const lane = laneForCommand(command);
    this.enqueueJob(
      lane,
      () => dispatchRuntimeCommand(command, this.commandDispatchHandlers()),
      command.type,
      commandScheduling(command),
      command.commandId
    );
  }

  seedLiveBarbarians(targetCount: number, commandId?: string): SeedLiveBarbariansResult {
    return seedLiveBarbariansImpl({
      targetCount,
      commandId: commandId ?? `ops-seed-barbs:${this.now()}`,
      players: this.players,
      tiles: this.tiles,
      pendingSettlementsByTile: this.pendingSettlementsByTile,
      locksByTile: this.locksByTile,
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      replaceTileState: (tileKey, tile, cid) => this.replaceTileState(tileKey, tile, cid),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      emitTileDeltaBatch: ({ commandId: cid, playerId, tileDeltas }) => {
        this.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: cid, playerId, tileDeltas });
      },
      runtimeLogInfo: (payload, message) => this.runtimeLogInfo(payload, message)
    });
  }
}
