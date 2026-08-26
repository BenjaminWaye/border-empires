import { EventEmitter } from "node:events";
import type { CommandEnvelope, ManpowerBreakdown, SimulationEvent } from "@border-empires/sim-protocol";
import type { PlayerRespawnNotice, PlayerRespawnReasonCode } from "@border-empires/shared";
import {
  type PendingRespawnNoticeContext
} from "../player-respawn-notice.js";
import { CommandDeltaBuffer } from "../runtime-delta-buffer.js";
import { RuntimeState } from "./runtime-state.js";
import { aetherBridgeReachAnchor, reachBorderOwnerAt as reachBorderOwnerAtImpl } from "../runtime-aether-bridge-reach.js";
import { createReachUpdateState, flushReachUpdates, markReachForResend, takeReachChangedTileKeys as takeReachChangedTileKeysImpl, type ReachUpdateState } from "../runtime-reach-update/runtime-reach-update.js";
import type { RivalReachPushRuntimeDeps } from "../rival-reach-push/rival-reach-push.js";
import { railDepotPositionsFromKeys } from "./runtime-rail-depot-positions.js";
import { applyReachAnchorActivationToBorder, applyReachAnchorDeactivationToBorder, applyUnsettleDowngrade, createReachBorderApplyContext, type ReachBorderApplyContext } from "../runtime-reach-update/runtime-reach-border-apply.js";
import { cancelOutOfReachDecayInAnchorDisk, outOfReachDecayDeadline as outOfReachDecayDeadlineImpl } from "../runtime-reach-update/runtime-reach-out-of-reach.js"; import { createOutOfReachDecayQueue, enqueueOutOfReachDecay, rebuildOutOfReachDecayQueue, tickOutOfReachDecay as tickOutOfReachDecayImpl, type OutOfReachDecayQueue } from "../runtime-out-of-reach-decay/runtime-out-of-reach-decay.js"; import { autoSettleCapturedAnchor as autoSettleCapturedAnchorImpl, canAutoSettleCapturedAnchor as canAutoSettleCapturedAnchorImpl, type AutoSettleCapturedAnchorDeps } from "../runtime-out-of-reach-decay/runtime-out-of-reach-auto-settle.js";
import {
  gatherReachAnchors as gatherReachAnchorsImpl,
  newlyActivatedReachAnchors as newlyActivatedReachAnchorsImpl,
  newlyDeactivatedReachAnchors as newlyDeactivatedReachAnchorsImpl,
  isPlayerTileInReach as isPlayerTileInReachImpl,
  reachTileCountForPlayer as reachTileCountForPlayerImpl,
  reachTileKeysForPlayer as reachTileKeysForPlayerImpl,
  reachTileKeysGroupedByOwner as reachTileKeysGroupedByOwnerImpl
} from "./runtime-reach-anchors.js";
import {
  appendPlayerEventLogEntry,
  CENSUS_HALL_POPULATION_BONUS_PER_CONNECTED_GRANARY,
  type DomainPlayer,
  type DomainTileState,
  type FrontierCommandType
} from "@border-empires/game-domain";
import {
  ATTACK_MANPOWER_MIN,
  BREAKTHROUGH_ENABLED,
  EMPIRE_INTEGRITY_ENABLED,
  empireIntegrity,
  integrityGrowthMult,
  DEVELOPMENT_PROCESS_LIMIT,
  FRONTIER_CLAIM_COST, EXPAND_MANPOWER_COST, GALACTIC_WONDER_MANPOWER_REGEN_BONUS_PER_MINUTE, GALACTIC_WONDER_VISION_RADIUS_BONUS,
  SETTLE_COST,
  structureSlotRequirements,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  grantAnchorToBorder,
  reassessBorderOnAnchorDeactivation,
  liveReachForOwner,
  type Terrain,
  type BuildableStructureType,
  type EconomicStructureType,
  type MonumentalStructureType,
  type SlotStructureType,
  type ReachAnchor
} from "@border-empires/shared";
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
  buildDockNetworkComponentByTileKey,
  computeLinkedDockRevealTileKeys,
  type DockRouteDefinition
} from "../dock-network/dock-network.js";
import {
  isDockCrossingTarget as isDockCrossingTargetImpl,
  isAetherBridgeCrossingTarget as isAetherBridgeCrossingTargetImpl,
  resolveOwnedDockOriginForCrossing as resolveOwnedDockOriginForCrossingImpl,
  findOwnedAetherBridgeOriginForCrossing as findOwnedAetherBridgeOriginForCrossingImpl,
  type DockCrossingOrigin
} from "./runtime-crossing.js";
import { chooseNextOwnedFrontierCommandFromLookup } from "../ai/frontier-command-planner.js";
import { forEachFrontierNeighbor } from "../frontier-topology.js";
import {
  isSettledTownAnchor,
  orderedAutoSettlementTileKeys,
  TOWN_AUTO_FRONTIER_RADIUS, isAutoSettlementResourceTechRevealed
} from "../territory-automation/territory-automation.js";
import type { PlayerDefensibilityMetrics } from "../player-defensibility-metrics.js";
import {
  addPendingSettlementToSummary,
  applyTileToPlayerSummary,
  createEmptyPlayerRuntimeSummary,
  createPlayerRuntimeSummaryFromRecovered,
  removePendingSettlementFromSummary,
  removeTileFromPlayerSummary,
  type PendingSettlementRecord,
  type PlayerRuntimeSummary
} from "../player-runtime-summary.js";
import {
  type PlayerUpdateEconomySnapshot
} from "../player-update-economy/player-update-economy.js";
import {
  type UpkeepAccrualSnapshot
} from "../player-upkeep-incremental/player-upkeep-incremental.js";
import { railDepotNetworkLogisticsGuildCountForPlayer, assemblyWorksNetworkGarrisonHallCountForPlayer, type ConnectedTownNetworkEntry } from "../economy-network/economy-network.js";
import { activeMonumentOnTile, refreshMonumentOwnerIndexForTile } from "../monument-uniqueness.js";
import {
  cachedManpowerStructureBonusForPlayer as cachedManpowerStructureBonusForPlayerImpl,
  type ManpowerStructureBonus
} from "../runtime-manpower-structure-bonus.js";
import { maintainTownConnectivityForTileChange, type TownConnectivityState } from "../economy-network/town-connectivity-incremental.js";
import { createSeedWorld, simulationTileKey } from "../seed-state/seed-state.js";
import type { SimulationSnapshotSections } from "../snapshot-store/snapshot-store.js";
import {
  additiveEffectForPlayer,
  effectiveVisionRadiusForPlayer,
  domainGrantedResourceSlots
} from "../tech-domain-bridge/tech-domain-bridge.js";
import { slotWaiversForPlayer } from "../tech-domain-bridge/slot-waivers.js"; import { techGrantedFishFoodSlotBonus } from "../tech-domain-bridge/fish-food-slot-bonus.js";
import { weaponsFactoryCountsForPlayer } from "../tech-domain-bridge/weapons-factory-mod-breakdown.js";
import {
  filterTileDeltasForPlayer as filterTileDeltasForPlayerImpl,
  type TileDeltaVisibilityFilterOptions, type VisibilityAuditSample
} from "../tile-delta-visibility-filter.js";
import { buildTileYieldView, radiusStructureKeysForSettledTiles, tileYieldNeedsServerAuthority } from "../tile-yield-view/tile-yield-view.js";
import {
  dormantStructureDetailsFromDormancy as dormantStructureDetailsFromDormancyImpl,
  resourceSlotDemandForPlayer as resourceSlotDemandForPlayerImpl,
  resourceSlotDormantContributorsForPlayer as resourceSlotDormantContributorsForPlayerImpl,
  resourceSlotSupplyForPlayer as resourceSlotSupplyForPlayerImpl,
  type DormantStructureDetail,
  type ResourceSlotDormancy,
  type ResourceSlotTotals
} from "../resource-slot-view/resource-slot-view.js";
import { flushRadiusYieldRefresh } from "../radius-yield-refresh/radius-yield-refresh.js";
import { VisibilityCoverageTracker } from "../visibility-coverage-cache.js";
import { createVisionFootprintTableForRuntime } from "../vision-footprint-table.js";
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
import { recordHotFrontierStreak, shouldForceBroadFrontierScan } from "../ai/ai-hot-frontier-streak.js";
import { chooseAutomationPreplanCommand } from "../ai/ai-preplan-command.js";
import { mergePreplanDiagnostic } from "./merge-preplan-diagnostic.js";
import type { DecisionCooldownMap } from "../ai/ai-rejection-cooldown.js";
import type { AutomationVictoryPath } from "../ai/automation-strategic-snapshot.js";
import { refreshSpatialFocus, type AiSpatialFocus } from "../ai/ai-spatial-focus.js";
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
  parseSettlePayload,
  parseTilePayload
} from "../runtime-command-parsers.js";
import {
  handleDevQueueCancelCommand as handleDevQueueCancelCommandImpl,
  handleDevQueueEnqueueCommand as handleDevQueueEnqueueCommandImpl,
  handleDevQueueMoveToFrontCommand as handleDevQueueMoveToFrontCommandImpl,
  tryDrainDevQueue as tryDrainDevQueueImpl,
  type RuntimeDevQueueCommandContext
} from "../runtime-dev-queue-command-handlers.js"; import { devQueueBuildReservationContext } from "../runtime-dev-queue-build-reservation.js";
import {
  handleWaypointCancelAllCommand as handleWaypointCancelAllCommandImpl,
  handleWaypointCancelCommand as handleWaypointCancelCommandImpl,
  handleWaypointEnqueueCommand as handleWaypointEnqueueCommandImpl,
  type RuntimeWaypointQueueCommandContext
} from "../runtime-waypoint-queue-command-handlers.js";
import { handleClaimContinuationSetCommand as handleClaimContinuationSetCommandImpl, tryDrainClaimContinuation as tryDrainClaimContinuationImpl, tryDrainClaimContinuationBuildTail as tryDrainClaimContinuationBuildTailImpl, claimContinuationContextFromDevQueueContext } from "../runtime-claim-continuation-command-handlers.js";
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
import { tileDeltaFromState as tileDeltaFromStateImpl } from "../runtime-tile-delta-from-state.js";
import { PlayerCandidateIndex } from "../player-candidate-index/player-candidate-index.js";
import { applySettleCost, refundSettleCost, settleRejectionForActor, settlementBaseDurationMsForTile, settlementDurationMsForPlayer } from "../runtime-settlement-rules.js";
import {
  applyBarbarianWalkOrMultiply as applyBarbarianWalkOrMultiplyImpl,
  applyBreachToNeighbors as applyBreachToNeighborsImpl,
  applyLockedManpowerDelta as applyLockedManpowerDeltaImpl,
  applySettledCapturePlunder as applySettledCapturePlunderImpl,
  attackManpowerLoss as attackManpowerLossImpl,
  buildCaptureRevealTileDeltas as buildCaptureRevealTileDeltasImpl,
  buildLockedCombatResolution as buildLockedCombatResolutionImpl,
  handleCancelCaptureCommand as handleCancelCaptureCommandImpl,
  plannerGatingLockPlayerIds as plannerGatingLockPlayerIdsImpl,
  settleAttackManpower as settleAttackManpowerImpl,
  type LockedCombatInput,
  type RuntimeCombatSupportContext
} from "../runtime-combat-support.js";
import { emitAutoFillForSettlement as emitAutoFillForSettlementImpl } from "../runtime-auto-fill.js";
import {
  AI_DERIVED_CACHE_COALESCE_MS, applyManpowerRegenForPlayer as applyManpowerRegenForPlayerImpl,
  cachedDefensibilityMetrics as cachedDefensibilityMetricsImpl,
  cachedEconomySnapshot as cachedEconomySnapshotImpl,
  cachedUpkeepAccrual as cachedUpkeepAccrualImpl,
  effectiveManpowerAtForPlayer as effectiveManpowerAtForPlayerImpl,
  ensureGrossIncomeSettlementForPlayer as ensureGrossIncomeSettlementForPlayerImpl,
  estimatedIncomePerMinuteForPlayer as estimatedIncomePerMinuteForPlayerImpl,
  hasActiveSettlementTownForPlayer as hasActiveSettlementTownForPlayerImpl,
  incomePerMinuteForPlayer as incomePerMinuteForPlayerImpl,
  playerLogisticsThroughputPerMinute as playerLogisticsThroughputPerMinuteImpl,
  playerManpowerBreakdown as playerManpowerBreakdownImpl,
  playerManpowerCap as playerManpowerCapImpl,
  playerManpowerRegenPerMinute as playerManpowerRegenPerMinuteImpl,
  refreshManpowerOnlyForPlayer as refreshManpowerOnlyForPlayerImpl,
  storageCapForPlayer as storageCapForPlayerImpl,
  type RuntimeEconomyCacheContext,
  type RuntimeIncomeStorageContext,
  type RuntimeManpowerEconomyContext
} from "./runtime-economy.js";
import {
  orderedTownTilesForPlayer as orderedTownTilesForPlayerImpl,
  fedTownKeysForPlayer as fedTownKeysForPlayerImpl,
  cachedTownNetworkForPlayer as cachedTownNetworkForPlayerImpl,
  rebuildTownNetworkUninstrumented as rebuildTownNetworkUninstrumentedImpl,
  railDepotAlreadyInNetworkForPlayer as railDepotAlreadyInNetworkForPlayerImpl,
  assemblyWorksAlreadyInNetworkForPlayer as assemblyWorksAlreadyInNetworkForPlayerImpl,
  hasNearbyQuartermastersOfficeForPlayer as hasNearbyQuartermastersOfficeForPlayerImpl,
  censusHallConnectedGranaryBonusCountForPlayer as censusHallConnectedGranaryBonusCountForPlayerImpl,
  tileYieldEconomyContextForPlayer as tileYieldEconomyContextForPlayerImpl,
  enrichTileWithTownContext as enrichTileWithTownContextImpl,
  type RuntimeTownNetworkContext
} from "./runtime-town-network.js";
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
  type RuntimeAiPlayerMetricsRow,
  type RuntimeExportState,
  type RuntimePlayerDebugSnapshot
} from "../runtime-state-export.js";
import * as wonderEffects from "../runtime-natural-wonders.js"; import {
  buildRuntimeSnapshotSections,
  buildRuntimeSnapshotSectionsAsync,
  mapTile,
  type SnapshotTile
} from "../runtime-snapshot-sections.js";
import {
  type BarbActivationVisibilityCache
} from "../runtime-visible-state.js";
import { RuntimeReplayCache } from "../runtime-replay-cache.js";
import {
  type RuntimeVisibilityClassification
} from "../runtime-visibility-classifier.js";
import {
  aiPlayerMetricsSnapshotForRuntime,
  empireTileCountsForRuntime,
  exportStateAsyncForRuntime,
  exportStateForRuntime,
  leaderboardPlayersForRuntime,
  playerDebugSnapshotForRuntime,
  plannerPlayerViewsForRuntime,
  plannerWorldViewForRuntime,
  snapshotSectionsAsyncForRuntime,
  snapshotSectionsForRuntime,
  tilesForKeysForRuntime,
  type RuntimeExportContext
} from "./runtime-export.js";
import {
  classifyVisibilityForPlayerForRuntime,
  emitVisibilityAuditForRuntime,
  exportBarbActivationVisibleUnionForRuntime,
  exportTilesInAreaForPlayerForRuntime,
  exportVisibleStateForPlayerAsyncForRuntime,
  exportVisibleStateForPlayerForRuntime,
  getBarbActivationVisionSignatureForRuntime,
  settledTilesForPlayerForRuntime,
  type RuntimeClassifyVisibilityContext,
  type RuntimeVisibleStateContext
} from "./runtime-visibility.js";
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
import { buildAbilityCommandContext } from "./runtime-ability-command-context.js";
import { handleSiphonTileCommand as handleSiphonTileCommandImpl } from "../runtime-siphon-command-handlers.js"; import { handleSyncTruceCommand as handleSyncTruceCommandImpl } from "../runtime-truce-sync-command.js";
import {
  handleAegisLockCommand as handleAegisLockCommandImpl,
  handleAirportBombardCommand as handleAirportBombardCommandImpl,
  handleAstralDockLaunchCommand as handleAstralDockLaunchCommandImpl,
  handleCreateMountainCommand as handleCreateMountainCommandImpl,
  handleRemoveMountainCommand as handleRemoveMountainCommandImpl,
  handleWorldEngineStrikeCommand as handleWorldEngineStrikeCommandImpl,
  type RuntimeMapCommandContext
} from "../runtime-map-command-handlers.js";
import { buildMapCommandContext } from "./runtime-map-command-context.js";
import { handleImperialExchangeLevyCommand as handleImperialExchangeLevyCommandImpl } from "../runtime-imperial-exchange-levy-command.js";
import { handleTitaniumLevyMusterCommand as handleTitaniumLevyMusterCommandImpl, TITANIUM_LEVY_REGEN_FREEZE_KEY } from "../runtime-titanium-levy-command.js";
import { handleActivateImperialWardCommand as handleActivateImperialWardCommandImpl } from "../runtime-imperial-ward-command-handler.js";
import {
  handleChooseDomainCommand as handleChooseDomainCommandImpl,
  handleChooseTechCommand as handleChooseTechCommandImpl,
  handleCollectShardCommand as handleCollectShardCommandImpl,
  handleUpgradeTownTierCommand as handleUpgradeTownTierCommandImpl,
  type RuntimeProgressionCommandContext
} from "../runtime-progression-command-handlers.js";
import { buildProgressionCommandContext } from "./runtime-progression-command-context.js";
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
import {
  activateWatchtowerAt as activateWatchtowerAtImpl,
  tickWatchtowerReveals as tickWatchtowerRevealsImpl,
  type PendingWatchtowerReveal,
  type WatchtowerRevealRuntimeInput
} from "../runtime-watchtower-reveal-tick.js";
import { computeShardRainWelcomeNotice } from "../runtime-shard-rain-rules.js";
import type { EmpireStorageCap } from "../runtime-empire-storage.js";
import {
  emitPlayerStateUpdate as emitPlayerStateUpdateImpl,
  type RuntimePlayerStateUpdateContext
} from "../runtime-player-state-update.js";
import {
  applyPassiveIncome as applyPassiveIncomeImpl,
  applyPassiveIncomeAsync as applyPassiveIncomeAsyncImpl,
  applyPassiveIncomeForPlayer as applyPassiveIncomeForPlayerImpl,
  type RuntimePassiveIncomeContext
} from "../runtime-passive-income.js";
import { tickTerritoryAutomation as tickTerritoryAutomationImpl } from "../runtime-territory-automation-tick/runtime-territory-automation-tick.js";
import { createMusterTickRunner } from "../runtime-muster-tick/runtime-muster-tick.js";
import type { MusterAdvanceCooldowns } from "../runtime-muster-tick/runtime-muster-tick.js";
import { tickFortGarrison as tickFortGarrisonImpl } from "../runtime-fort-garrison-tick.js";
import { reconcileTownVisionBonus, resyncPlayerTownVisionBonuses, seedTownVisionBonus } from "../runtime-town-vision.js";
import { reconcileOutpostVisionBonus, resyncPlayerOutpostVisionBonuses, seedOutpostVisionBonus, type OutpostVisionCoverageDeps } from "../runtime-outpost-vision.js";
import {
  completeStructureBuild as completeStructureBuildImpl,
  handleBuildStructureCommand as handleBuildStructureCommandImpl,
  type RuntimeStructureCommandContext
} from "../runtime-structure-command-handlers.js";
import { buildStructureCommandContext } from "./runtime-structure-command-context.js";
import {
  handleSetConverterStructureEnabledCommand as handleSetConverterStructureEnabledCommandImpl,
  handleSetConverterStructureModeCommand as handleSetConverterStructureModeCommandImpl,
  handleUncaptureTileCommand as handleUncaptureTileCommandImpl,
  type RuntimeEconomicStructureCommandContext
} from "../runtime-economic-structure-command-handlers.js";
import { buildEconomicStructureCommandContext } from "./runtime-economic-structure-command-context.js";
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
  applyFortGarrisonAttrition as applyFortGarrisonAttritionImpl,
  consumeOriginMuster as consumeOriginMusterImpl,
  requiredMusterForTarget as requiredMusterForTargetImpl,
  type RuntimeCombatResolutionContext
} from "../runtime-combat-resolution.js";
import {
  handleFrontierCommandImpl,
  type RuntimeFrontierCommandContext
} from "../runtime-frontier-command.js";
import {
  handleRushBuyCommandImpl,
  type RuntimeRushBuyCommandContext
} from "../runtime-rush-buy-command.js";
import { buildRushBuyCommandContext } from "./runtime-rush-buy-command-context.js";
import {
  seedLiveBarbarians as seedLiveBarbariansImpl,
  type SeedLiveBarbariansResult
} from "../runtime-live-barbarians.js"; import { humanPlayerCountOf } from "../runtime-player-factory.js";
import {
  ensurePlayerHasSpawnTerritory as ensurePlayerHasSpawnTerritoryImpl,
  finalizeRespawnNotice as finalizeRespawnNoticeImpl,
  preparePlayerRespawnNotice as preparePlayerRespawnNoticeImpl,
  respawnIfEliminated as respawnIfEliminatedImpl,
  respawnPlayerOnUnownedLand as respawnPlayerOnUnownedLandImpl,
  type RuntimeRespawnContext
} from "../runtime-respawn-helpers.js";
import { SpawnPlacementIndex } from "../spawn-placement/spawn-placement-index.js";
import { appendTownLostEventLogIfApplicable, buildOwnershipChangeSample } from "./runtime-ownership-change-sample.js";

export type { VisibilityAuditSample };
const priorityOrder: QueueLane[] = ["human_interactive", "human_noninteractive", "system", "ai"];
// §24.2: revised down from 100 to 10 (one tier-1 tech's worth, §13) — in
// line with how far everything else in the new economy scale shrank.
const RESPAWN_MINIMUM_GOLD = 10;
// Grace beyond resolvesAt before the sweep drops a lock (60s).
// Normal locks resolve inside their setTimeout window; anything still present
// is a leak from a code path that bypassed validation.
const ORPHAN_LOCK_GRACE_MS = 60_000;
// How long an AI player's economy/defensibility/auto-settlement caches may
// stay dirty-but-served before the next read pays a real rebuild (2026-07-29
// login-stall investigation). Well under both consumers' own tick cadence —
// passive income (15s) and population growth (60s) — so this never produces
// gameplay-visible staleness; it just stops a continuously-settling AI from
// paying a fresh O(settled-tiles) rebuild on nearly every command. Defined in
// runtime-economy.ts (imported above) so both files share one value.
// TTL for the per-tile auto-settlement eligibility cache (AI only, see
// autoSettlementQueueForPlayer). Longer than AI_DERIVED_CACHE_COALESCE_MS
// deliberately: that cache only avoids re-running the WHOLE rebuild within a
// 5s window, but every rebuild after that window still re-checked every
// frontier tile's (usually unchanged) eligibility from scratch, including
// the O(8-neighbor-scan) hasTownSupport lookup for tiles already known to be
// ineligible. 60s matches population growth's own tolerance for stale
// derived data elsewhere in this file, so it's never gameplay-visible.
const AUTO_SETTLEMENT_ELIGIBILITY_TTL_MS = 60_000;

// Process-global monotonically increasing counter for unique runtime epochs and
// fresh terrain mutation numbers. Consumers cache derived terrain structures by
// epoch; cache misses are O(world tiles) but happen only when terrain changes.
let nextTerrainEpoch = 1;

export class SimulationRuntime {
  private readonly events = new EventEmitter();
  private terrainEpoch = nextTerrainEpoch++;
  private readonly persistence: SimulationPersistence;
  private readonly now: () => number;
  private readonly state: RuntimeState;
  private readonly playerSummaries = new Map<string, PlayerRuntimeSummary>();
  private readonly plannerPlayerTileCollectionVersionByPlayer = new Map<string, number>();
  // Increments ONLY on tile ownership change (not muster/population/income ticks) — the
  // signature key for getBarbActivationVisionSignature/exportBarbActivationVisibleUnion's
  // own territory-dilation cache, so unrelated per-tick mutations don't bust it.
  private readonly territoryVersionByPlayer = new Map<string, number>();
  private readonly visionFootprintTable = createVisionFootprintTableForRuntime(WORLD_WIDTH, WORLD_HEIGHT, () => this.state.tiles, () => this.terrainEpoch); // see vision-footprint-table.ts
  private readonly visionTransitions = new VisionTransitionAccumulator(); // fog-of-war vision edges; see runtime-vision-transition.ts
  // Watchtower "flicker" reveals in flight — see runtime-watchtower-reveal-tick.ts. Self-draining, bounded, never persisted.
  private readonly pendingWatchtowerReveals: PendingWatchtowerReveal[] = [];
  private readonly plannerPlayerTopologyVersionByPlayer = new Map<string, number>();
  private readonly plannerPlayerTopologyDirtyTilesByPlayer = new Map<string, Set<string>>();
  private readonly rememberedAutomationVictoryPathByPlayer = new Map<string, AutomationVictoryPath>();
  // Bounded per-AI focus front (BFS around a persistent hot-frontier origin) capping planner CPU; refreshed via refreshSpatialFocusForPlayer, cleared once the player owns no territory.
  private readonly aiSpatialFocusByPlayer = new Map<string, AiSpatialFocus>();
  // Cached from the previous tick's planAutomationCommand diagnostic, feeding selectSpatialFocus's unproductive-streak rotation; a missing entry means "no signal yet" (treated as productive).
  private readonly aiSpatialFocusProductiveByPlayer = new Map<string, boolean>();
  // Backs forceBroadFrontierScan — see ai-hot-frontier-streak.ts.
  private readonly aiHotFrontierStreakByPlayer = new Map<string, number>();
  // Incrementally-maintained planner player-view tile key cache: six TileKeyArrayEntry objects per entry, updated O(1) per tile mutation instead of rebuilt O(territory) per miss.
  private readonly plannerPlayerTileKeyCacheByPlayer = new Map<string, PlannerTileKeysCacheEntry>();
  // Bundles the four maps above by reference for plannerPlayerTileKeys; built once since the Maps themselves are never reassigned, only mutated.
  private readonly plannerPlayerTileKeysContext: PlannerPlayerTileKeysContext = {
    tileKeyCacheByPlayer: this.plannerPlayerTileKeyCacheByPlayer,
    tileCollectionVersionByPlayer: this.plannerPlayerTileCollectionVersionByPlayer,
    topologyVersionByPlayer: this.plannerPlayerTopologyVersionByPlayer,
    topologyDirtyTilesByPlayer: this.plannerPlayerTopologyDirtyTilesByPlayer
  };
  // Deduplicated view of locksByTile keyed by commandId (a lock is stored under TWO tile keys — originKey + targetKey); gives O(1) unique-lock iteration for exportState's activeLocks projection.
  private readonly locksByCommandId = new Map<string, LockRecord>();
  private readonly frontierTilesByOwner = new Map<string, Set<string>>();
  readonly manpowerLossByTileKey = new Map<string, number>();
  private readonly deltaBuffer = new CommandDeltaBuffer();
  // Part 2: index of fort/town anchors that grant frontier support per owner.
  private readonly activeFortAnchorsByOwner = new Map<string, Map<string, number>>();
  // Index of active siege outpost tiles per owner (SIEGE_OUTPOST / SIEGE_TOWER / DREAD_TOWER).
  // Key: ownerId, Value: Set of tileKeys with an active siegeOutpost owned by that player.
  // Maintained in replaceTileState via refreshSiegeOutpostIndexForTile.
  // Replaces the O(territory) sweep in tickTerritoryAutomation.
  private readonly activeSiegeOutpostsByOwner = new Map<string, Set<string>>();
  // Index of active RELAY_BEACON economic structure tiles per owner.
  // Key: ownerId, Value: Set of tileKeys with an active RELAY_BEACON owned by that player.
  // Maintained in replaceTileState via refreshRelayBeaconIndexForTile.
  // Replaces the O(territory) sweep in tickTerritoryAutomation.
  private readonly activeRelayBeaconsByOwner = new Map<string, Set<string>>();
  // Index of tiles carrying a muster flag per owner (mustering system).
  // Key: ownerId, Value: Set of tileKeys whose `muster.ownerId` is that player.
  // Maintained in replaceTileState via refreshMusterIndexForTile. Lets the
  // muster accumulation tick enumerate active musters without scanning the map.
  private readonly musterTilesByOwner = new Map<string, Set<string>>();
  // Index of active Rail Depot tiles per owner (mustering logistics hub).
  private readonly railDepotTilesByOwner = new Map<string, Set<string>>();
  // Index of active Garrison Hall tiles per owner (§4.4 flat manpower-cap
  // bonus) — a plain per-structure count, not town-adjacency-scoped, since
  // GARRISON_HALL uses "same_tile" placement and can sit anywhere.
  private readonly garrisonHallTilesByOwner = new Map<string, Set<string>>();
  // O(1) mirror of monumentClaimOwnerId (§16) — see
  // refreshMonumentOwnerIndexForTile in monument-uniqueness.ts for why.
  private readonly activeMonumentOwnerByType = new Map<MonumentalStructureType, { ownerId: string; tileKey: string }>();
  // Map-wide lookups backing chooseLegacySpawnPlacement — see
  // SpawnPlacementIndex for why they are indexed rather than rescanned.
  private readonly spawnPlacementIndex = new SpawnPlacementIndex();
  // Tech-tree redesign: per-owner tile-set indexes for the new Manpower
  // buildings, maintained the same way as railDepotTilesByOwner/
  // garrisonHallTilesByOwner above (see refreshEconomicStructureTypeIndexForTile
  // in runtime-tile-index-maintenance.ts).
  private readonly assemblyWorksTilesByOwner = new Map<string, Set<string>>();
  private readonly logisticsGuildTilesByOwner = new Map<string, Set<string>>();
  private readonly quartermastersOfficeTilesByOwner = new Map<string, Set<string>>();
  private readonly granaryTilesByOwner = new Map<string, Set<string>>();
  private readonly censusHallTilesByOwner = new Map<string, Set<string>>();
  // Tracks muster manpower reserved by in-flight attacks (remote muster).
  // Key: muster tileKey, Value: total reserved amount. Prevents two concurrent
  // attacks from double-spending the same staged muster.
  private readonly musterReservedByKey = new Map<string, number>();
  private readonly musterAdvanceCooldowns = new Map<string, number>();
  // Tracks which muster tile each connected player is viewing (playerId → tileKey).
  // Used to drive a 1-second targeted tick so the tile panel updates in real time.
  private readonly watchedMusterTileByPlayer = new Map<string, string>();
  // Orchestrates tickMuster/tickWatchedMusterTiles (incl. watched-tile
  // filtering) — lives in runtime-muster-tick.ts so that logic and its
  // context wiring stay together rather than inline on this class.
  private readonly musterTicker = createMusterTickRunner(
    (musterTilesByOwner) => this.musterTickContext(musterTilesByOwner),
    () => this.musterTilesByOwner,
    () => this.watchedMusterTileByPlayer
  );
  private readonly onMusterRemoteAttack: (() => void) | undefined;
  private readonly onMusterRemoteBlocked: (() => void) | undefined;
  private readonly onMusterRemoteBlockedBarbarian: (() => void) | undefined;
  private readonly onAutoFillTiles: ((count: number) => void) | undefined;
  private readonly onPlayerStateUpdateSkippedAi: ((playerId: string) => void) | undefined;
  private readonly onAuthRecoveryRespawn: (() => void) | undefined;
  private readonly onAuthRecoveryRespawnGuarded: (() => void) | undefined;
  // Index of tiles with an active fort per owner (garrison system).
  // Key: ownerId, Value: Set of tileKeys where fort.status === "active" and fort.ownerId matches.
  // Maintained in replaceTileState via refreshFortGarrisonIndexForTile.
  private readonly fortTilesByOwner = new Map<string, Set<string>>();
  // Index of unowned LAND tiles with a town, dock, or resource — navigation
  // beacons for AI directional expansion. Maintained in replaceTileState via
  // refreshNeutralBeaconIndexForTileImpl; rebuilt from this.state.tiles in the
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
  // economicStructure. Maintained in replaceTileState; rebuilt from this.state.tiles
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
  private pendingImperialWard: { playerId: string; charges: number } | undefined; /** v0 Wonder-style starting bonus (§5, §12) for the last season's Planet winner — mirrors pendingImperialWard's lifecycle. */ private pendingGalacticWonderBonus: { playerId: string } | undefined;
  private readonly tileYieldCollectedAtByTile = new Map<string, number>(); /** Perf-only auto-fill scan cache — see AUTO_FILL_SCAN_COOLDOWN_MS in runtime-auto-fill.ts. */ private readonly autoFillOriginCooldownUntil = new Map<string, number>();
  private readonly lastIncomeTickAtMsByPlayer = new Map<string, number>();
  private readonly lastActiveAtMsByPlayer = new Map<string, number>();
  private readonly fortPatrolGraceUntilByTile = new Map<string, number>();
  // Epoch ms when each tile last transitioned into SETTLED ownership. Stamped
  // in replaceTileState; consumed by tickTileShedding to shed newest-first when
  // broke. Not persisted — tiles recovered from the event log tie at -Infinity
  // so they shed last (a restarted empire's core tiles outlast its expansions).
  private readonly tileSettledAtByKey = new Map<string, number>();
  // Fixed-border reach (packages/shared/src/reach/reach.ts): the persistent
  // tileKey -> owning playerId border, maintained incrementally via
  // grantAnchorToBorder as reach anchors activate (see
  // newlyActivatedReachAnchors / applyReachAnchorActivation in
  // replaceTileState). Sticky by design — deactivating an anchor never
  // shrinks this map by itself; it only changes what's available to defend
  // a tile the next time a rival anchor contests it.
  private reachBorder: Map<string, string> = new Map();
  // Change-driven REACH_UPDATE push bookkeeping — see runtime-reach-update.ts.
  private readonly reachUpdateState: ReachUpdateState = createReachUpdateState();
  private outOfReachDecayQueue: OutOfReachDecayQueue = createOutOfReachDecayQueue(); // deadline-ordered; derived state, rebuilt at hydration, never snapshotted
  private readonly isLandTileQuery = (x: number, y: number): boolean => { const t = this.state.tiles.get(simulationTileKey(x, y)); return t ? t.terrain === "LAND" : true; }; // land-gates reach anchors, see ReachAnchor.crossesWater
  private readonly collectVisibleCooldownByPlayer = new Map<string, number>();
  // Throttle per-tick respawn attempts for eliminated AI players. Spawn
  // placement is an O(n-tile) scan; 30 s cooldown keeps it from running
  // every 200 ms when the map is too full to place.
  private readonly lastAiRespawnAttemptMsByPlayer = new Map<string, number>();
  private static readonly AI_RESPAWN_RETRY_INTERVAL_MS = 30_000;
  private readonly lastEmittedStorageCapByPlayer = new Map<string, EmpireStorageCap>();
  // Phase 3c: pre-serialized snapshot form of every tile, kept in sync with
  // this.state.tiles via replaceTileState and the two direct tiles.set paths.
  // Eliminates the O(202k-tile) yield loop from buildRuntimeSnapshotSectionsAsync;
  // checkpoint cost drops from 43-93 s (101 setImmediate waits) to ~50 ms (sort).
  private readonly snapshotTileCache = new Map<string, SnapshotTile>();
  // Epoch ms of the last population growth tick for each settled town tile key.
  // Used by tickPopulationGrowth to compute elapsed minutes since the last update.
  private readonly townLastGrowthTickAtByKey = new Map<string, number>();
  // Running counter of growth ticks skipped due to insufficient food.
  // Exposed for diagnostics / metrics.
  growthStalledNoFoodCounter = 0;
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
  // Incremental union-find backing buildConnectedTownNetworkForPlayer's fast
  // path (see town-connectivity-incremental.ts) — maintained per-player by
  // refreshEconomyCachesForTileChange on every tile mutation, so a
  // townNetworkCacheByPlayer cache-miss can usually resolve via O(towns)
  // union-find lookups instead of a full O(settled tiles) BFS.
  private readonly townConnectivityStateByPlayer = new Map<string, TownConnectivityState>();
  // §4.4 manpower structure bonuses (Garrison Hall flat cap + Rail Depot
  // network cap/regen) — invalidated alongside townNetworkCacheByPlayer since
  // it's derived from that same network plus a Garrison Hall/Rail Depot scan.
  private readonly manpowerStructureBonusCacheByPlayer = new Map<
    string,
    {
      garrisonHallCount: number;
      assemblyWorksNetworkGarrisonHallCount: number;
      railDepotNetworkLogisticsGuildCount: number;
      logisticsGuildCount: number;
      populationBureauManpowerBuildingCount: number;
    }
  >();
  // Counts recovered players whose persisted manpowerCapSnapshot disagreed
  // with what boot hydration computed once this.state.tiles and every
  // structure-by-owner index (garrisonHallTilesByOwner etc.) were fully
  // populated — see the applyManpowerRegen loop near the end of the
  // constructor, and the "deploy just snapped my manpower to full" bug it
  // fixes (that loop used to run BEFORE this.state.tiles existed, computing a
  // structure-bonus-free — artificially low — cap for every recovered
  // player). Purely observational: incrementing it does not change any
  // behavior. Polled into a metric (simManpowerCapBootstrapRestampedTotal)
  // by simulation-service.ts's metricsTicker so a spike here (e.g. this
  // guard silently stops firing on some future refactor) is observable in
  // prod — see feedback_counter_on_skip_paths.md.
  private manpowerCapBootstrapRestampedCount = 0;
  // Defensibility metrics cache; invalidated alongside economy snapshot (same
  // tile mutations change income and border exposure T/E/Ts/Es).
  private readonly defensibilityMetricsCacheByPlayer = new Map<string, PlayerDefensibilityMetrics>();
  // §5 (resource slots) supply/demand caches. emitPlayerStateUpdate calls
  // these on every command AND on the periodic income tick (runtime-passive-
  // income.ts) for every player, so an uncached O(territory) rescan here
  // would be a real per-tick cost at scale, unlike hasFreeResourceSlots'
  // once-per-build call. Supply only depends on SETTLED resource tiles, so
  // it's invalidated on the same SETTLED-gated trigger as
  // economySnapshotCacheByPlayer. Demand depends on fort/siegeOutpost/
  // economicStructure on ANY owned tile (Siege Outposts can be FRONTIER,
  // resource-slot-view.ts), so it must invalidate unconditionally like
  // defensibilityMetricsCacheByPlayer does, not gated on SETTLED.
  private readonly resourceSlotSupplyCacheByPlayer = new Map<string, ResourceSlotTotals>();
  private readonly resourceSlotDemandCacheByPlayer = new Map<string, ResourceSlotTotals>();
  // §5.4 dormancy: derived from both supply and demand, so it must be
  // invalidated on the union of their triggers — piggybacks on the demand
  // cache's unconditional (not SETTLED-gated) invalidation below.
  private readonly resourceSlotDormancyCacheByPlayer = new Map<string, ResourceSlotDormancy>(); private readonly wonderCacheByPlayer = new Map<string, Set<string>>();
  // AI-only rebuild coalescing (2026-07-29 login-stall investigation): AI
  // players settle/expand continuously with no live subscriber, so a
  // continuous-settling AI empire was paying a fresh O(settled-tiles)
  // economy/defensibility rebuild on nearly every command. These track "needs
  // a rebuild eventually" + "when did we last actually rebuild" so a dirty AI
  // player's cache is served as-is (slightly stale) for up to
  // AI_DERIVED_CACHE_COALESCE_MS before the next read pays the real rebuild
  // cost, instead of on literally every mutation. Human players never touch
  // these — see refreshEconomyCachesForTileChange, which still deletes their
  // cache entries immediately so a human's own action is reflected instantly.
  private readonly economySnapshotDirtyPlayerIds = new Set<string>();
  private readonly economySnapshotLastRebuiltAtMsByPlayer = new Map<string, number>();
  private readonly defensibilityMetricsDirtyPlayerIds = new Set<string>();
  private readonly defensibilityMetricsLastRebuiltAtMsByPlayer = new Map<string, number>();
  private readonly resourceSlotSupplyDirtyPlayerIds = new Set<string>(); private readonly resourceSlotSupplyLastRebuiltAtMsByPlayer = new Map<string, number>(); private readonly resourceSlotDemandDirtyPlayerIds = new Set<string>();
  private readonly resourceSlotDemandLastRebuiltAtMsByPlayer = new Map<string, number>(); private readonly resourceSlotDormancyDirtyPlayerIds = new Set<string>(); private readonly resourceSlotDormancyLastRebuiltAtMsByPlayer = new Map<string, number>();
  // Auto-settlement queue was entirely uncached (rebuilt from scratch, O(frontier
  // tiles), on every single emitPlayerStateUpdate call). Coalesced the same way
  // as above for AI; humans settle far less frequently so this mirrors their
  // previous always-fresh behavior in practice while still being safe.
  private readonly autoSettlementQueueCacheByPlayer = new Map<string, { value: Array<{ x: number; y: number }>; computedAtMs: number }>();
  // Per-tile eligibility cache backing the read-through cache passed into
  // orderedAutoSettlementTileKeys for AI players — see AUTO_SETTLEMENT_ELIGIBILITY_TTL_MS.
  private readonly autoSettlementEligibilityCacheByTile = new Map<string, { eligible: boolean; computedAtMs: number }>();
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
    return refreshSpatialFocus({
      playerId,
      now,
      territoryTileKeys: summary.territoryTileKeys,
      hotFrontierTileKeys: summary.hotFrontierTileKeys,
      buildCandidateTileKeys: summary.buildCandidateTileKeys,
      frontierTileKeys: summary.frontierTileKeys,
      focusByPlayer: this.aiSpatialFocusByPlayer,
      productiveByPlayer: this.aiSpatialFocusProductiveByPlayer
    });
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
    this.onAuthRecoveryRespawn = options.onAuthRecoveryRespawn;
    this.onAuthRecoveryRespawnGuarded = options.onAuthRecoveryRespawnGuarded;
    this.commandTrace = options.commandTrace;
    this.onOwnershipChange = options.onOwnershipChange;
    this.onQueueDrain = options.onQueueDrain;
    this.onJobApplied = options.onJobApplied;
    this.wrapJobRun = options.wrapJobRun;
    this.onVisibilityAudit = options.onVisibilityAudit;
    this.trackSyncMainThreadTask = options.trackSyncMainThreadTask;
    this.onCaptureRevealBuilt = options.onCaptureRevealBuilt;
    this.onShardCollected = options.onShardCollected;
    this.pendingImperialWard = options.pendingImperialWard; this.pendingGalacticWonderBonus = options.pendingGalacticWonderBonus;
    const initDocks = createDocksFromInitialState(options.initialState, options.seedDocks ?? seedWorld?.docks ?? []);
    const initDockLinksByDockTileKey = buildDockLinksByDockTileKey(initDocks);
    this.state = new RuntimeState({
      players: createPlayersFromRecoveredState(options.initialState, options.initialPlayers) ??
        (options.initialPlayers ? new Map(options.initialPlayers) : seedWorld!.players),
      tiles: createTilesFromInitialState(
        options.initialState, options.seedTiles ?? seedWorld!.tiles, options.mergeSeedTilesWithInitialState ?? true
      ),
      docks: initDocks,
      dockLinksByDockTileKey: initDockLinksByDockTileKey,
      dockNetworkComponentByTileKey: buildDockNetworkComponentByTileKey(initDockLinksByDockTileKey),
      locksByTile: createLocksFromInitialState(options.initialState),
      // O(radius²)-per-change coverage for the TILE_DELTA_BATCH hot path (see visibility-coverage-cache.ts).
      visibilityCoverage: new VisibilityCoverageTracker(WORLD_WIDTH, WORLD_HEIGHT, {
        visionRadiusForPlayer: (id) => { const p = this.state.players.get(id); return p ? effectiveVisionRadiusForPlayer(p) : 1; },
        getPlayer: (id) => this.state.players.get(id),
        territoryTileKeysForPlayer: (id) => this.summaryForPlayer(id).territoryTileKeys,
        settledTileKeysForPlayer: (id) => {
          const summary = this.summaryForPlayer(id);
          if (summary.frontierTileKeys.size === 0) return summary.territoryTileKeys;
          const settled = new Set<string>();
          for (const key of summary.territoryTileKeys) if (!summary.frontierTileKeys.has(key)) settled.add(key);
          return settled;
        },
        frontierTileKeysForPlayer: (id) => this.summaryForPlayer(id).frontierTileKeys
      }, this.visionFootprintTable)
    });
    for (const [key, tile] of this.state.tiles) this.snapshotTileCache.set(key, mapTile(tile));
    // applyManpowerRegen (which calls playerManpowerCap ->
    // cachedManpowerStructureBonusForPlayer under the hood) used to run in a
    // loop here, immediately after this.state.players was built and BEFORE
    // this.state.tiles existed. garrisonHallTilesByOwner/railDepotTilesByOwner/
    // assemblyWorksTilesByOwner/logisticsGuildTilesByOwner (populated below,
    // from the tile-hydration loop) were all still empty at that point, so
    // that early call computed a structure-bonus-free (artificially LOW) cap
    // for every recovered player, cached it, AND — because refreshManpowerOnly
    // clamps player.manpower down to whatever cap it just computed — silently
    // dropped a recovered player's actual manpower down to that low cap too.
    // The cached-low-cap entry then sat in manpowerStructureBonusCacheByPlayer
    // until the player's first post-boot tile mutation invalidated it
    // (replaceTileState -> refreshEconomyCachesForTileChange); at that point
    // refreshManpowerOnly recomputed the TRUE (higher) cap, saw
    // `cap > previousCap`, and handed the player their entire Garrison
    // Hall/Rail Depot/Assembly Works/Logistics Guild cap bonus as free
    // manpower — indistinguishable from the intentional "build a Garrison
    // Hall, get the extra manpower immediately" mechanic that branch exists
    // for. This is what produced the ~4000 -> full-cap jump right after a
    // deploy (process restart -> boot hydration -> first post-boot command).
    //
    // Fix: this call now runs further below, after this.state.tiles and every
    // structure-by-owner index it depends on are fully populated, so the
    // very first manpower read for a recovered player already sees the true
    // cap — no separate re-stamp step needed, and no window where a stale
    // low-cap cache entry can survive into real gameplay.
    //
    // The per-player connected-town network cache
    // (cachedTownNetworkForPlayer) has the same "read before tiles exist"
    // hazard independent of manpower — see the Weapons Workshop network bonus
    // comment below — so it's still defensively cleared here even though
    // nothing above this point calls into it anymore.
    this.townNetworkCacheByPlayer.clear();
    this.townConnectivityStateByPlayer.clear();
    // Populate the commandId index from the just-created locksByTile map.
    for (const lock of this.state.locksByTile.values()) this.locksByCommandId.set(lock.commandId, lock);
    for (const entry of options.initialState?.tileYieldCollectedAtByTile ?? []) this.tileYieldCollectedAtByTile.set(entry.tileKey, entry.collectedAt);
    for (const entry of options.initialState?.playerYieldCollectionEpochByPlayer ?? []) this.lastIncomeTickAtMsByPlayer.set(entry.playerId, entry.collectedAt);
    // Indexed once: a linear find() per player would be O(players^2) at boot.
    const recoveredPlayersById = new Map((options.initialState?.players ?? []).map((player) => [player.id, player]));
    for (const playerId of this.state.players.keys()) {
      this.playerSummaries.set(playerId, createPlayerRuntimeSummaryFromRecovered(recoveredPlayersById.get(playerId)));
      this.plannerPlayerTileCollectionVersionByPlayer.set(playerId, 0);
      this.territoryVersionByPlayer.set(playerId, 0);
    }
    // First pass: apply tile summaries and shard-site tracking.
    // All tiles are already in this.state.tiles (createTilesFromInitialState produced a
    // complete Map), so anchor registration in the second pass below will find every
    // neighbour regardless of iteration order.
    for (const [tileKey, tile] of this.state.tiles.entries()) {
      this.applyTileToPlayerSummaries(tileKey, tile);
      this.state.visibilityCoverage.tileOwnershipChanged(undefined, tile.ownerId, tile.x, tile.y, undefined, { nextOwnershipState: tile.ownershipState });
      // Seed town +1 vision for any player-owned town present at boot.
      seedTownVisionBonus({ players: this.state.players, coverage: this.state.visibilityCoverage }, tile);
      // Seed Light/Siege Outpost vision bonus for any owned active outpost present at boot.
      seedOutpostVisionBonus(this.outpostVisionDeps(), tile);
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
      // Both seeds run in this unconditional first pass, and through the same
      // predicates their incremental counterparts use — an unowned tile can
      // carry a neutral/capturable town (hasNearbyTown must see it), and a
      // monument is keyed by its STRUCTURE's owner, which monumentClaimOwnerId
      // reads without consulting tile.ownerId at all. Gating either on tile
      // ownership would make a booted world disagree with a live-built one.
      this.spawnPlacementIndex.refreshForTileChange(tileKey, tile);
      const seededMonument = activeMonumentOnTile(tile);
      if (seededMonument) this.activeMonumentOwnerByType.set(seededMonument.type, { ownerId: seededMonument.ownerId, tileKey });
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
    // Second pass: register PlayerCandidateIndex anchors now that this.state.tiles is
    // fully traversed.  Each anchor is stored at the MAX possible radius for its
    // kind — time-dependent radius (e.g. FORT_PATROL_GRACE_MS) is applied at the
    // call site, not stored here, to prevent stale maxRadius bugs.
    for (const [tileKey, tile] of this.state.tiles.entries()) {
      if (!tile.ownerId) continue;
      const ownerId = tile.ownerId;
      if (isSettledTownAnchor(tile, ownerId)) {
        this.playerCandidateIndex.registerAnchor(tileKey, ownerId, TOWN_AUTO_FRONTIER_RADIUS, (k) => this.state.tiles.get(k));
        // Part 2: register in activeFortAnchorsByOwner
        registerFortSupportAnchorImpl(this.activeFortAnchorsByOwner, tileKey, ownerId, TOWN_AUTO_FRONTIER_RADIUS);
      }
      // Populate activeSiegeOutpostsByOwner index
      if (tile.siegeOutpost?.ownerId === ownerId && tile.siegeOutpost.status === "active") {
        let set = this.activeSiegeOutpostsByOwner.get(ownerId);
        if (!set) { set = new Set<string>(); this.activeSiegeOutpostsByOwner.set(ownerId, set); }
        set.add(tileKey);
      }
      // Populate activeRelayBeaconsByOwner index. Vision bonus restoration
      // at boot is handled by seedOutpostVisionBonus in the first pass above.
      if (
        tile.economicStructure?.ownerId === ownerId &&
        tile.economicStructure.type === "RELAY_BEACON" &&
        tile.economicStructure.status === "active"
      ) {
        let set = this.activeRelayBeaconsByOwner.get(ownerId);
        if (!set) { set = new Set<string>(); this.activeRelayBeaconsByOwner.set(ownerId, set); }
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
      // Populate garrisonHallTilesByOwner index (§4.4 flat manpower-cap bonus).
      if (tile.economicStructure?.type === "GARRISON_HALL" && tile.economicStructure.ownerId && tile.economicStructure.status === "active") {
        let set = this.garrisonHallTilesByOwner.get(tile.economicStructure.ownerId);
        if (!set) { set = new Set<string>(); this.garrisonHallTilesByOwner.set(tile.economicStructure.ownerId, set); }
        set.add(tileKey);
      }
      // Seed the tech-tree redesign's new per-owner structure indexes.
      for (const [structureType, index] of [
        ["ASSEMBLY_WORKS", this.assemblyWorksTilesByOwner],
        ["LOGISTICS_GUILD", this.logisticsGuildTilesByOwner],
        ["QUARTERMASTERS_OFFICE", this.quartermastersOfficeTilesByOwner],
        ["GRANARY", this.granaryTilesByOwner],
        ["CENSUS_HALL", this.censusHallTilesByOwner]
      ] as const) {
        if (tile.economicStructure?.type === structureType && tile.economicStructure.ownerId && tile.economicStructure.status === "active") {
          let set = index.get(tile.economicStructure.ownerId);
          if (!set) { set = new Set<string>(); index.set(tile.economicStructure.ownerId, set); }
          set.add(tileKey);
        }
      }
    } for (const tile of this.state.tiles.values()) wonderEffects.syncWatchtowerObservatory(tile); for (const playerId of this.state.players.keys()) wonderEffects.refreshPlayerWonders(playerId, this.settledTilesForPlayer(playerId), this.wonderCacheByPlayer, this.state.players);
    // Fixed-border reach: seed the persistent reachBorder from every anchor
    // already present in the loaded/seeded world (indexes above are now
    // fully populated). Applied one activation at a time through the same
    // grantAnchorToBorder path a live activation uses, so any anchors that
    // already overlap at load time resolve deterministically via live
    // coverage rather than needing special-cased startup logic. No unsettle
    // downgrade is expected to fire here in practice (persisted/seeded
    // worlds start from a consistent state), but if it ever does, it's
    // correct to let it — the tile genuinely isn't defended by anyone else.
    for (const anchor of this.gatherReachAnchors()) {
      this.applyReachAnchorActivation(anchor, "world-init", { contestSettledOnUnclaimed: false });
    }
    this.outOfReachDecayQueue = rebuildOutOfReachDecayQueue(this.state.tiles); // anchors above already cleared timers they now cover
    // Moved here (see the long comment above, right after this.state.tiles is
    // assigned) from immediately after `this.state.players` was built: this is the
    // first point where garrisonHallTilesByOwner/railDepotTilesByOwner/
    // assemblyWorksTilesByOwner/logisticsGuildTilesByOwner all reflect the
    // recovered tiles, so playerManpowerCap sees the TRUE cap for every
    // recovered player on its very first read — the boot-order bug (manpower
    // silently clamped down at boot, then snapped back up to full cap on the
    // player's next tile mutation) can no longer occur.
    for (const player of this.state.players.values()) {
      const previousCapSnapshot = player.manpowerCapSnapshot;
      this.applyManpowerRegen(player);
      // Counter (see manpowerCapBootstrapRestampedCount's declaration): a
      // recovered player whose persisted manpowerCapSnapshot doesn't match
      // what boot hydration just computed. Expected to fire roughly
      // once per structure-owning player per restart (their old snapshot
      // predates this boot's tile hydration) and settle back to 0 — a count
      // that keeps climbing during steady-state, not just at startup, means
      // this guard itself has regressed.
      if (Number.isFinite(previousCapSnapshot) && previousCapSnapshot !== player.manpowerCapSnapshot) {
        this.manpowerCapBootstrapRestampedCount += 1;
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
    for (const playerId of this.state.players.keys()) {
      this.rebuildPlannerCandidateIndexesForPlayer(playerId);
    }
    for (const pendingSettlement of options.initialState?.pendingSettlements ?? []) {
      const pendingTile = this.state.tiles.get(pendingSettlement.tileKey);
      if (!pendingTile || pendingTile.ownerId !== pendingSettlement.ownerId || pendingTile.ownershipState !== "FRONTIER") continue;
      this.addPendingSettlement({ ...pendingSettlement });
      const delayMs = Math.max(0, pendingSettlement.resolvesAt - this.now());
      this.scheduleAfter(delayMs, () => {
        const currentSettlement = this.pendingSettlementsByTile.get(pendingSettlement.tileKey);
        if (!this.pendingSettlementMatches(currentSettlement, pendingSettlement)) return;
        this.removePendingSettlement(pendingSettlement.tileKey);
        const latest = this.state.tiles.get(pendingSettlement.tileKey);
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
    for (const [tileKey, tile] of this.state.tiles) {
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
    for (const lock of uniqueLocksByCommandId(this.state.locksByTile.values())) {
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

  wireDeltaForTileKey(tileKey: string, playerId?: string): SimulationTileWireDelta | undefined {
    const tile = this.state.tiles.get(tileKey);
    return tile ? this.tileDeltaRevealOnly(tile, playerId) : undefined;
  }

  async tickTileShedding(nowMs: number = this.now(), yieldToEventLoop?: () => Promise<void>): Promise<void> {
    await tickTileSheddingImpl({
      nowMs,
      players: this.state.players,
      tiles: this.state.tiles,
      locksByTile: this.state.locksByTile,
      tileSettledAtByKey: this.tileSettledAtByKey,
      applyEconomyAccrual: (player, at) => this.applyEconomyAccrual(player, at),
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      emitEvent: (event) => this.emitEvent(event),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      emitPlayerStateUpdate: (command) => this.emitPlayerStateUpdate(command),
      playerManpowerCap: (player) => this.playerManpowerCap(player),
      onPlayerStateUpdateSkippedAi: (playerId) => this.onPlayerStateUpdateSkippedAi?.(playerId),
      ...(yieldToEventLoop !== undefined ? { yieldToEventLoop } : {}),
      ...(this.trackSyncMainThreadTask !== undefined ? { trackSync: this.trackSyncMainThreadTask } : {})
    });
  }

  tickOrphanedLockSweep(nowMs: number = this.now()): number {
    return tickOrphanedLockSweepImpl({
      nowMs,
      orphanLockGraceMs: ORPHAN_LOCK_GRACE_MS,
      locksByTile: this.state.locksByTile,
      locksByCommandId: this.locksByCommandId,
      refundExpandManpower: (playerId, amount) => { const player = this.state.players.get(playerId); if (player) player.manpower += amount; } // reverses our prior EXPAND debit; next regen tick reclamps overcap
    });
  }

  updatePlayerLastActive(playerId: string, nowMs: number): void {
    this.lastActiveAtMsByPlayer.set(playerId, nowMs);
  }

  private passiveIncomeContext(): RuntimePassiveIncomeContext {
    return {
      players: this.state.players,
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

  private applyPassiveIncomeForPlayer(player: RuntimePlayer, nowMs: number, inactivityCapMs: number): void { applyPassiveIncomeForPlayerImpl(this.passiveIncomeContext(), player, nowMs, inactivityCapMs); }

  /**
   * `goldPerMinuteOverride` lets callers that already computed the player's
   * income this request (e.g. the login snapshot build) reuse that value
   * instead of paying a second, synchronous `cachedEconomySnapshot` rebuild
   * on the live runtime — that rebuild scales with settled-tile count and
   * was blocking the post-subscribe WS event flush (bootstrap/hydrate/
   * welcome-back) whenever the per-player cache had just been invalidated
   * by a recent settle. The result is discarded below 60s of elapsed time
   * regardless, so we also skip the economy lookup entirely in that case.
   */
  welcomeBackSummary(
    playerId: string,
    nowMs: number,
    goldPerMinuteOverride?: number
  ): { goldEarned: number; elapsedMs: number } {
    const lastTickAt = this.lastIncomeTickAtMsByPlayer.get(playerId);
    if (lastTickAt === undefined) {
      return { goldEarned: 0, elapsedMs: 0 };
    }
    const elapsedMs = Math.max(0, nowMs - lastTickAt);
    if (elapsedMs <= 60_000) return { goldEarned: 0, elapsedMs };
    const goldPerMinute =
      goldPerMinuteOverride ?? (() => {
        const player = this.state.players.get(playerId);
        return player ? this.cachedEconomySnapshot(player).incomePerMinute : 0;
      })();
    const goldEarned = goldPerMinute * (elapsedMs / 60_000);
    return { goldEarned: Math.floor(goldEarned), elapsedMs };
  }

  tickPopulationGrowth(nowMs: number = this.now()): ReturnType<typeof tickPopulationGrowthImpl> {
    const result = tickPopulationGrowthImpl({
      nowMs,
      players: this.state.players,
      tiles: this.state.tiles,
      locksByTile: this.state.locksByTile,
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
        : undefined,
      foodDormantTownKeysForPlayer: (playerId) => this.foodDormantTownKeysForPlayer(playerId),
      dormantEconomicStructureKeysForPlayer: (playerId) => this.dormantEconomicStructureKeysForPlayer(playerId)
    });
    if (result.growthStalledNoFood > 0) {
      this.growthStalledNoFoodCounter += result.growthStalledNoFood;
    }
    this.applyCensusHallPopulationBonuses();
    return result;
  }

  // Census Hall (tech-tree redesign): +20,000 population (and cap) per
  // connected city with an active Incubation Engine (Granary) --
  // network-scoped, recomputed every tick rather than granted once, so
  // losing a connection or a neighbor's Granary shrinks the bonus back down.
  // Mirrors the Assembly Works/Rail Depot "network scan" pattern rather than
  // a simple empire-wide tally.
  private applyCensusHallPopulationBonuses(): void {
    for (const [ownerId, censusHallKeys] of this.censusHallTilesByOwner) {
      if (censusHallKeys.size === 0) continue;
      for (const censusHallKey of censusHallKeys) {
        const censusHallTile = this.state.tiles.get(censusHallKey);
        if (!censusHallTile || censusHallTile.economicStructure?.status !== "active") continue;
        const townKey = this.assignedTownKeyForSupportTile(ownerId, censusHallTile.x, censusHallTile.y);
        if (!townKey) continue;
        const townTile = this.state.tiles.get(townKey);
        if (!townTile?.town || townTile.ownerId !== ownerId) continue;
        const connectedGranaryCount = this.censusHallConnectedGranaryBonusCountForPlayer(ownerId, townKey);
        const desiredBonus = connectedGranaryCount * CENSUS_HALL_POPULATION_BONUS_PER_CONNECTED_GRANARY;
        const appliedBonus = townTile.town.censusHallAppliedBonus ?? 0;
        if (desiredBonus === appliedBonus) continue;
        const delta = desiredBonus - appliedBonus;
        const updatedTownTile: DomainTileState = {
          ...townTile,
          town: {
            ...townTile.town,
            maxPopulation: Math.max(0, (townTile.town.maxPopulation ?? 0) + delta),
            // A growing bonus is an instant grant (matches Incubation
            // Engine's "burst" flavor); a shrinking bonus only lowers the
            // cap -- population naturally sitting above the new cap just
            // stops growing further, it isn't forcibly clawed back.
            population: delta > 0 ? (townTile.town.population ?? 0) + delta : (townTile.town.population ?? 0),
            censusHallAppliedBonus: desiredBonus
          }
        };
        this.replaceTileState(townKey, updatedTownTile);
        this.emitEvent({
          eventType: "TILE_DELTA_BATCH",
          commandId: `census-hall-bonus:${ownerId}:${this.now()}`,
          playerId: ownerId,
          tileDeltas: [this.tileDeltaFromState(updatedTownTile)]
        });
      }
    }
  }

  private shardRainContext() {
    return {
      now: this.now,
      players: this.state.players,
      tiles: this.state.tiles,
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

  private watchtowerRevealContext(): WatchtowerRevealRuntimeInput {
    return {
      now: this.now,
      tiles: this.state.tiles,
      pendingWatchtowerReveals: this.pendingWatchtowerReveals,
      visibilityCoverage: this.state.visibilityCoverage,
      visionTransitionCallbacks: this.visionTransitions.callbacks,
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      emitEvent: (event) => this.emitEvent(event),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile)
    };
  }

  private activateWatchtowerAt(targetKey: string, x: number, y: number, playerId: string, commandId: string): void { activateWatchtowerAtImpl(this.watchtowerRevealContext(), targetKey, x, y, playerId, commandId); }

  tickWatchtowerReveals(nowMs: number = this.now()): void {
    tickWatchtowerRevealsImpl(this.watchtowerRevealContext(), nowMs);
  }

  async tickTerritoryAutomation(
    nowMs: number = this.now(),
    yieldToEventLoop?: () => Promise<void>
  ): Promise<void> {
    await tickTerritoryAutomationImpl({
      nowMs,
      players: this.state.players,
      tiles: this.state.tiles,
      locksByTile: this.state.locksByTile,
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
    for (const [playerId, player] of this.state.players) {
      if (!player.isAi) continue;
      this.runAiAutoSettleForPlayer(playerId, nowMs);
      if (yieldToEventLoop) await yieldToEventLoop();
    }
    this.tickMuster(nowMs);
    this.tickFortGarrison(nowMs); this.tickOutOfReachDecay(nowMs);
    // tickMuster/tickFortGarrison mutate many players' tiles via
    // replaceTileState in tight per-tile loops without ever calling
    // emitPlayerStateUpdate themselves (unlike command-driven mutations) — so
    // this is the one place their share of markOutpostVisionDormancyDirty's
    // pending entries actually gets resolved. One resync per dirty player,
    // not per tile mutation.
    this.flushAllOutpostVisionDormancyResyncs();
  }

  tickOutOfReachDecay(nowMs: number = this.now()): number { return tickOutOfReachDecayImpl({ queue: this.outOfReachDecayQueue, nowMs, tiles: this.state.tiles, replaceTileState: (k, t, cid) => this.replaceTileState(k, t, cid), tileDeltaFromState: (t) => this.tileDeltaFromState(t), emitEvent: (e) => this.emitEvent(e), runtimeLogInfo: (p, m) => this.runtimeLogInfo(p, m), gatherReachAnchors: () => this.gatherReachAnchors(), isLandTile: this.isLandTileQuery }); }
  tickFortGarrison(nowMs: number = this.now()): void {
    tickFortGarrisonImpl({
      nowMs,
      players: this.state.players,
      fortTilesByOwner: this.fortTilesByOwner,
      tiles: this.state.tiles,
      playerManpowerCap: (player) => this.playerManpowerCap(player),
      playerManpowerRegenPerMinute: (player) => this.playerManpowerRegenPerMinute(player),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      emitEvent: (event) => this.emitEvent(event),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      isStructureDormant: (playerId, tileKey, field) => this.isStructureDormant(playerId, tileKey, field)
    });
  }

  private musterTickContext(musterTilesByOwner: ReadonlyMap<string, Set<string>> = this.musterTilesByOwner) {
    return {
      players: this.state.players,
      tiles: this.state.tiles,
      musterTilesByOwner,
      activeSiegeOutpostsByOwner: this.activeSiegeOutpostsByOwner,
      activeRelayBeaconsByOwner: this.activeRelayBeaconsByOwner,
      railDepotPositionsByOwner: railDepotPositionsFromKeys(this.railDepotTilesByOwner, this.state.tiles, (playerId, tileKey, field) =>
        this.isStructureDormant(playerId, tileKey, field)
      ),
      applyManpowerRegen: (player: RuntimePlayer, at?: number) => this.applyManpowerRegen(player, at),
      playerManpowerCap: (player: RuntimePlayer) => this.playerManpowerCap(player),
      replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => this.replaceTileState(tileKey, tile, commandId),
      emitEvent: (event: SimulationEvent) => this.emitEvent(event),
      tileDeltaFromState: (tile: DomainTileState) => this.tileDeltaFromState(tile),
      requiredMusterForTarget: (target: DomainTileState) => this.requiredMusterForTarget(target),
      nextTerritoryAutomationCommandId: (label: string, playerId: string, tileKey: string, at: number) =>
        this.nextTerritoryAutomationCommandId(label, playerId, tileKey, at),
      handleFrontierCommand: (command: CommandEnvelope, actionType: FrontierCommandType) => this.handleFrontierCommand(command, actionType),
      locksByTile: this.state.locksByTile,
      advanceCooldowns: this.musterAdvanceCooldowns as MusterAdvanceCooldowns,
      dockLinksByDockTileKey: this.state.dockLinksByDockTileKey,
      isStructureDormant: (playerId: string, tileKey: string, field: "siegeOutpost" | "economicStructure") =>
        this.isStructureDormant(playerId, tileKey, field)
    };
  }

  tickMuster(nowMs: number = this.now()): void {
    this.musterTicker.tickMuster(nowMs);
  }

  tickWatchedMusterTiles(nowMs: number = this.now()): void {
    this.musterTicker.tickWatchedMusterTiles(nowMs);
  }

  emitShardRainHelloFor(playerId: string, nowMs: number = this.now()): void {
    emitShardRainHelloForImpl(this.shardRainContext(), playerId, nowMs);
  }

  currentShardRainWelcomeNotice(nowMs: number = this.now()): Record<string, unknown> {
    return computeShardRainWelcomeNotice({
      nowMs,
      currentSiteCount: this.currentShardRainSiteCount,
      currentExpiresAt: this.currentShardRainExpiresAt
    });
  }

  private respawnContext(): RuntimeRespawnContext {
    return {
      now: this.now,
      players: this.state.players,
      tiles: this.state.tiles,
      playerSummaries: this.playerSummaries,
      plannerPlayerTileCollectionVersionByPlayer: this.plannerPlayerTileCollectionVersionByPlayer,
      pendingRespawnNoticeByPlayerId: this.pendingRespawnNoticeByPlayerId,
      lastRespawnNoticeByPlayerId: this.lastRespawnNoticeByPlayerId,
      pendingSettlementsByTile: this.pendingSettlementsByTile,
      locksByTile: this.state.locksByTile,
      rememberedAutomationVictoryPathByPlayer: this.rememberedAutomationVictoryPathByPlayer,
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      setTileYieldCollectedAt: (commandId, playerId, tileKey, collectedAt) => this.setTileYieldCollectedAt(commandId, playerId, tileKey, collectedAt),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      emitEvent: (event) => this.emitEvent(event), emitPlayerStateUpdate: (command) => this.emitPlayerStateUpdate(command),
      runtimeLogInfo: (payload, message) => this.runtimeLogInfo(payload, message),
      incomePerMinuteForPlayer: (playerId) => this.incomePerMinuteForPlayer(playerId),
      respawnMinimumGold: RESPAWN_MINIMUM_GOLD,
      incrementAuthRecoveryRespawn: () => this.onAuthRecoveryRespawn?.(),
      incrementAuthRecoveryRespawnGuarded: () => this.onAuthRecoveryRespawnGuarded?.(),
      coastalLandKeys: () => this.spawnPlacementIndex.coastalLandKeys(this.state.tiles),
      hasNearbySettled: (x, y, radius) => this.spawnPlacementIndex.hasNearbySettled(x, y, radius),
      hasNearbyTown: (x, y, radius) => this.spawnPlacementIndex.hasNearbyTown(this.state.tiles, x, y, radius),
      hasNearbyFood: (x, y, radius) => this.spawnPlacementIndex.hasNearbyFood(this.state.tiles, x, y, radius),
      claimFairSpawnSite: (isAvailable, rallyAnchor) => this.spawnPlacementIndex.claimFairSpawnSite(this.state.tiles, isAvailable, rallyAnchor)
    };
  }

  private combatSupportContext(): RuntimeCombatSupportContext {
    return {
      now: this.now,
      players: this.state.players,
      tiles: this.state.tiles,
      locksByTile: this.state.locksByTile,
      locksByCommandId: this.locksByCommandId,
      barbarianTileProgress: this.barbarianTileProgress,
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      tileDeltaRevealOnly: (tile, playerId) => this.tileDeltaRevealOnly(tile, playerId),
      emitEvent: (event) => this.emitEvent(event),
      emitPlayerStateUpdate: (command) => this.emitPlayerStateUpdate(command),
      isStructureDormant: (playerId, tileKey, field) => this.isStructureDormant(playerId, tileKey, field),
      manpowerLossByTileKey: this.manpowerLossByTileKey,
      ownedStructureCountForPlayer: (playerId, structureType) => this.ownedStructureCountForPlayer(playerId, structureType)
    };
  }

  private frontierCommandContext(): RuntimeFrontierCommandContext {
    return {
      now: this.now,
      players: this.state.players,
      tiles: this.state.tiles,
      locksByTile: this.state.locksByTile,
      locksByCommandId: this.locksByCommandId,
      musterReservedByKey: this.musterReservedByKey,
      dockLinksByDockTileKey: this.state.dockLinksByDockTileKey,
      rejectCommand: (command, code, message) => this.rejectCommand(command, code, message),
      applyManpowerRegen: (player) => this.applyManpowerRegen(player),
      emitEvent: (event) => this.emitEvent(event), emitPlayerStateUpdate: (command) => this.emitPlayerStateUpdate(command),
      commandTrace: this.commandTrace, onMusterRemoteBlocked: this.onMusterRemoteBlocked,
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
      buildLockedCombatResolution: (lock) => this.buildLockedCombatResolution(lock),
      isInReach: (playerId, x, y) => this.isPlayerTileInReach(playerId, x, y), reachBorderOwnerAt: (x, y) => reachBorderOwnerAtImpl(this.reachBorder, x, y)
    };
  }

  private encirclementApplicationContext(): RuntimeEncirclementApplicationContext {
    return {
      tiles: this.state.tiles,
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
    const autoSettleDeps: AutoSettleCapturedAnchorDeps = { getPlayer: (id) => this.state.players.get(id), hasAvailableDevelopmentSlot: (id) => this.hasAvailableDevelopmentSlot(id), startSettlementProcess: (i) => this.startSettlementProcess(i), now: () => this.now() }; return {
      players: this.state.players,
      tiles: this.state.tiles,
      locksByTile: this.state.locksByTile,
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
      maybeActivateWatchtower: (targetKey, x, y, playerId, commandId) => this.activateWatchtowerAt(targetKey, x, y, playerId, commandId),
      maybeDrainClaimContinuation: (targetKey, x, y, playerId) => tryDrainClaimContinuationImpl(this.devQueueCommandContext(), playerId, targetKey, x, y),
      outOfReachDecayDeadline: (playerId, x, y) => outOfReachDecayDeadlineImpl({ isPlayerTileInReach: (pid, tx, ty) => this.isPlayerTileInReach(pid, tx, ty), gatherReachAnchors: () => this.gatherReachAnchors(), now: () => this.now(), isLandTile: this.isLandTileQuery }, playerId, x, y), registerOutOfReachDecay: (tileKey, deadlineAt) => enqueueOutOfReachDecay(this.outOfReachDecayQueue, tileKey, deadlineAt, (p, m) => this.runtimeLogInfo(p, m)), canAutoSettleCapturedAnchor: (playerId) => canAutoSettleCapturedAnchorImpl(autoSettleDeps, playerId), autoSettleCapturedAnchor: (playerId, targetKey, target, commandId) => autoSettleCapturedAnchorImpl(autoSettleDeps, playerId, targetKey, target, commandId),
      applyBreachToNeighbors: BREAKTHROUGH_ENABLED
        ? (capturedTile, attackerId) => applyBreachToNeighborsImpl({
            capturedTile,
            attackerId,
            nowMs: this.now(),
            tiles: this.state.tiles,
            invalidateTileStringifyCache: (key) => this.tileDeltaStringifyCache.invalidate(key)
          })
        : undefined,
    };
  }

  private emitAutoFillForSettlement(settledTile: DomainTileState, ownerId: string, tileKey: string): void {
    emitAutoFillForSettlementImpl(
      {
        tiles: this.state.tiles,
        replaceTileState: (k, t) => this.replaceTileState(k, t),
        isInReach: (x, y) => this.isPlayerTileInReach(ownerId, x, y),
        onAutoFillTiles: this.onAutoFillTiles,
        autoFillOriginCooldownUntil: this.autoFillOriginCooldownUntil,
        now: this.now,
        emitEvent: (event) => this.emitEvent(event),
        tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
        combatSupportContext: this.combatSupportContext(),
        isAiById: (playerId) => this.state.players.get(playerId)?.isAi,
        recordTileYieldCollectedAt: (k, t) => this.tileYieldCollectedAtByTile.set(k, t)
      },
      settledTile,
      ownerId,
      tileKey
    );
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

  private finalizeRespawnNotice(playerId: string, spawnTileKey: string): void { finalizeRespawnNoticeImpl(this.respawnContext(), playerId, spawnTileKey); }

  private runtimeLogInfo(payload: Record<string, unknown>, message: string): void {
    try {
      // eslint-disable-next-line no-console
      console.info(message, payload);
    } catch {
      // best-effort log; never throw from the diagnostic path
    }
  }
  hasPlayer(playerId: string): boolean { return this.state.players.has(playerId); } humanPlayerCount(): number { return humanPlayerCountOf(this.state.players); } // join-capacity gate
  ensurePlayerHasSpawnTerritory(playerId: string, rallyAnchor?: { x: number; y: number }): boolean {
    const spawned = ensurePlayerHasSpawnTerritoryImpl(this.respawnContext(), playerId, rallyAnchor); if (spawned) wonderEffects.refreshPlayerWonders(playerId, this.settledTilesForPlayer(playerId), this.wonderCacheByPlayer, this.state.players);
    if (spawned && this.pendingImperialWard?.playerId === playerId) {
      const player = this.state.players.get(playerId);
      if (player) player.imperialWardCharges = this.pendingImperialWard.charges;
      this.pendingImperialWard = undefined;
    } if (spawned && this.pendingGalacticWonderBonus?.playerId === playerId) { const player = this.state.players.get(playerId); if (player) { player.galacticWonderManpowerRegenBonusPerMinute = GALACTIC_WONDER_MANPOWER_REGEN_BONUS_PER_MINUTE; player.galacticWonderVisionRadiusBonus = GALACTIC_WONDER_VISION_RADIUS_BONUS; } this.pendingGalacticWonderBonus = undefined; }
    return spawned;
  }

  enqueueBackgroundJob(job: () => void): void {
    this.enqueueJob("ai", job, undefined, "background");
  }

  repairZeroGrossIncomeSettlements(playerIds: Iterable<string>): GrossIncomeRepairResult {
    return repairZeroGrossIncomeSettlementsImpl(
      {
        players: this.state.players,
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

  // Resolved tiles for resyncPlayerOutpostVisionBonuses (a tech unlock's
  // effect on Light/Siege Outpost vision rings) — sourced from the
  // active-only outpost indexes rather than a full tile scan; see
  // resyncPlayerOutpostVisionBonuses's own doc comment for the trade-off.
  private ownedOutpostTilesForPlayer(playerId: string): DomainTileState[] {
    const tileKeys = new Set<string>([
      ...(this.activeRelayBeaconsByOwner.get(playerId) ?? []),
      ...(this.activeSiegeOutpostsByOwner.get(playerId) ?? [])
    ]);
    const tiles: DomainTileState[] = [];
    for (const tileKey of tileKeys) {
      const tile = this.state.tiles.get(tileKey);
      if (tile) tiles.push(tile);
    }
    return tiles;
  }

  // Shared OutpostVisionCoverageDeps builder — every call site
  // (seed/reconcile/resync) needs the same players/coverage/isStructureDormant/
  // callbacks bundle; centralized so isStructureDormant's wiring can't drift
  // between them.
  private outpostVisionDeps(): OutpostVisionCoverageDeps {
    return {
      players: this.state.players,
      coverage: this.state.visibilityCoverage,
      isStructureDormant: (ownerId, tileKey, field) => this.isStructureDormant(ownerId, tileKey, field),
      callbacks: this.visionTransitions.callbacks
    };
  }

  // §5.4: a resource tile gained or lost anywhere in `playerId`'s territory
  // can push one of their outposts into or out of dormancy without that
  // outpost's own tile changing at all, so reconcileOutpostVisionBonus (which
  // only ever looks at the one tile that just mutated) can't catch it.
  //
  // Deliberately NOT resolved eagerly inside replaceTileState: dormancy comes
  // from resourceSlotDormancyForPlayer, which refreshEconomyCachesForTileChange
  // already deletes (for human players) on *every* settled-tile mutation of an
  // owner, regardless of whether that mutation could plausibly touch a
  // FOOD/TITANIUM/CRYSTAL/UMBRITE total — including tickFortGarrison/tickMuster,
  // which call replaceTileState in tight per-tile loops with no
  // emitPlayerStateUpdate in between (the one place that would otherwise
  // naturally coalesce a rebuild). Eagerly resyncing on every replaceTileState
  // call would turn one 30s garrison/muster tick into an O(mutated tiles ×
  // settled tiles) dormancy-rebuild storm for any player who owns an outpost —
  // exactly the class of O(territory)-per-tick cost tickTerritoryAutomation's
  // own indexes were built to avoid. So replaceTileState only marks the owner
  // dirty here (an O(1) Set add); the actual resync is flushed lazily, once
  // per player, from emitPlayerStateUpdate (the command-driven path) and from
  // the end of tickTerritoryAutomation (the tick-driven path) — see
  // flushOutpostVisionDormancyResync.
  private readonly outpostVisionDormancyDirtyPlayerIds = new Set<string>();

  private markOutpostVisionDormancyDirty(playerId: string | undefined): void {
    if (!playerId) return;
    const hasOutposts =
      (this.activeRelayBeaconsByOwner.get(playerId)?.size ?? 0) > 0 ||
      (this.activeSiegeOutpostsByOwner.get(playerId)?.size ?? 0) > 0;
    if (!hasOutposts) return;
    this.outpostVisionDormancyDirtyPlayerIds.add(playerId);
  }

  // Resolves a pending dormancy-driven outpost-vision resync for one player,
  // if one is pending. Cheap no-op when nothing was marked dirty for them.
  private flushOutpostVisionDormancyResync(playerId: string | undefined): void {
    if (!playerId || !this.outpostVisionDormancyDirtyPlayerIds.delete(playerId)) return;
    resyncPlayerOutpostVisionBonuses(this.outpostVisionDeps(), playerId, this.ownedOutpostTilesForPlayer(playerId));
  }

  // Flushes every player left dirty at the end of a tick sweep (muster/fort
  // garrison ticks mutate many players' tiles without ever calling
  // emitPlayerStateUpdate themselves) — one resync per dirty player, not per
  // tile mutation.
  private flushAllOutpostVisionDormancyResyncs(): void {
    if (this.outpostVisionDormancyDirtyPlayerIds.size === 0) return;
    for (const playerId of [...this.outpostVisionDormancyDirtyPlayerIds]) {
      this.flushOutpostVisionDormancyResync(playerId);
    }
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

  private manpowerEconomyContext(): RuntimeManpowerEconomyContext {
    return {
      now: () => this.now(),
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      cachedManpowerStructureBonusForPlayer: (player) => this.cachedManpowerStructureBonusForPlayer(player),
      wonderCacheByPlayer: this.wonderCacheByPlayer,
      getAbilityCooldownUntil: (playerId, abilityKey) => this.getAbilityCooldownUntil(playerId, abilityKey),
      applyEconomyAccrual: (player, nowMs) => this.applyEconomyAccrual(player, nowMs)
    };
  }

  private playerManpowerCap(player: RuntimePlayer): number {
    return playerManpowerCapImpl(this.manpowerEconomyContext(), player);
  }

  private playerManpowerRegenPerMinute(player: RuntimePlayer): number {
    return playerManpowerRegenPerMinuteImpl(this.manpowerEconomyContext(), player);
  }

  playerLogisticsThroughputPerMinute(player: RuntimePlayer): number {
    return playerLogisticsThroughputPerMinuteImpl(this.manpowerEconomyContext(), player);
  }

  private playerManpowerBreakdown(player: RuntimePlayer): ManpowerBreakdown {
    return playerManpowerBreakdownImpl(this.manpowerEconomyContext(), player);
  }

  private effectiveManpowerAt(player: RuntimePlayer, nowMs = this.now()): number {
    return effectiveManpowerAtForPlayerImpl(this.manpowerEconomyContext(), player, nowMs);
  }

  private applyManpowerRegen(player: RuntimePlayer, nowMs = this.now()): void {
    applyManpowerRegenForPlayerImpl(this.manpowerEconomyContext(), player, nowMs);
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
    refreshManpowerOnlyForPlayerImpl(this.manpowerEconomyContext(), player, nowMs);
  }

  private economyCacheContext(): RuntimeEconomyCacheContext {
    return {
      now: () => this.now(),
      tiles: this.state.tiles,
      dockLinksByDockTileKey: this.state.dockLinksByDockTileKey,
      players: this.state.players,
      economySnapshotCacheByPlayer: this.economySnapshotCacheByPlayer,
      economySnapshotDirtyPlayerIds: this.economySnapshotDirtyPlayerIds,
      economySnapshotLastRebuiltAtMsByPlayer: this.economySnapshotLastRebuiltAtMsByPlayer,
      defensibilityMetricsCacheByPlayer: this.defensibilityMetricsCacheByPlayer,
      defensibilityMetricsDirtyPlayerIds: this.defensibilityMetricsDirtyPlayerIds,
      defensibilityMetricsLastRebuiltAtMsByPlayer: this.defensibilityMetricsLastRebuiltAtMsByPlayer,
      upkeepAccrualReadCountByPlayer: this.upkeepAccrualReadCountByPlayer,
      upkeepAccrualCacheByPlayer: this.upkeepAccrualCacheByPlayer,
      settledTilesForPlayer: (playerId) => this.settledTilesForPlayer(playerId),
      cachedTownNetworkForPlayer: (player, settledTiles, maxConnectedTownNames) =>
        this.cachedTownNetworkForPlayer(player, settledTiles, maxConnectedTownNames),
      foodDormantTownKeysForPlayer: (playerId) => this.foodDormantTownKeysForPlayer(playerId),
      dormantEconomicStructureKeysForPlayer: (playerId) => this.dormantEconomicStructureKeysForPlayer(playerId),
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      ...(this.trackSyncMainThreadTask !== undefined ? { trackSyncMainThreadTask: this.trackSyncMainThreadTask } : {}),
      runtimeLogInfo: (payload, message) => this.runtimeLogInfo(payload, message)
    };
  }

  /**
   * Returns a cached PlayerUpdateEconomySnapshot for the player, rebuilding it
   * only when the cache has been invalidated (i.e., a tile affecting this
   * player's income changed via replaceTileState). See cachedEconomySnapshot
   * in runtime-economy.ts for the full rebuild logic and caching rationale.
   */
  private cachedEconomySnapshot(player: RuntimePlayer): PlayerUpdateEconomySnapshot {
    return cachedEconomySnapshotImpl(this.economyCacheContext(), player);
  }

  /**
   * Returns the incremental upkeep accrual snapshot for `player`. See
   * cachedUpkeepAccrual in runtime-economy.ts for the full rebuild logic and
   * caching rationale.
   */
  private cachedUpkeepAccrual(player: RuntimePlayer): UpkeepAccrualSnapshot {
    return cachedUpkeepAccrualImpl(this.economyCacheContext(), player);
  }

  /**
   * See cachedDefensibilityMetrics in runtime-economy.ts for the full
   * rebuild logic and caching rationale.
   */
  private cachedDefensibilityMetrics(
    playerId: string,
    summary: PlayerRuntimeSummary
  ): PlayerDefensibilityMetrics {
    return cachedDefensibilityMetricsImpl(this.economyCacheContext(), playerId, summary);
  }

  private upkeepAccrualContext(): RuntimeUpkeepAccrualContext {
    return {
      tiles: this.state.tiles,
      dockLinksByDockTileKey: this.state.dockLinksByDockTileKey,
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
    const previous = this.state.tiles.get(tileKey);
    const sameOwner = Boolean(previous?.ownerId && previous.ownerId === tile.ownerId);
    // See refreshEconomyCachesForTileChange for why this is gated on SETTLED
    // ownership instead of invalidating unconditionally on every mutation.
    refreshEconomyCachesForTileChange({
      tileKey,
      previous,
      next: tile,
      players: this.state.players,
      economySnapshotCacheByPlayer: this.economySnapshotCacheByPlayer,
      tileYieldContextCacheByPlayer: this.tileYieldContextCacheByPlayer,
      townNetworkCacheByPlayer: this.townNetworkCacheByPlayer,
      townConnectivityStateByPlayer: this.townConnectivityStateByPlayer,
      defensibilityMetricsCacheByPlayer: this.defensibilityMetricsCacheByPlayer,
      upkeepAccrualCacheByPlayer: this.upkeepAccrualCacheByPlayer,
      manpowerStructureBonusCacheByPlayer: this.manpowerStructureBonusCacheByPlayer,
      resourceSlotSupplyCacheByPlayer: this.resourceSlotSupplyCacheByPlayer,
      resourceSlotDemandCacheByPlayer: this.resourceSlotDemandCacheByPlayer,
      resourceSlotDormancyCacheByPlayer: this.resourceSlotDormancyCacheByPlayer,
      economySnapshotDirtyPlayerIds: this.economySnapshotDirtyPlayerIds,
      defensibilityMetricsDirtyPlayerIds: this.defensibilityMetricsDirtyPlayerIds,
      resourceSlotSupplyDirtyPlayerIds: this.resourceSlotSupplyDirtyPlayerIds, resourceSlotDemandDirtyPlayerIds: this.resourceSlotDemandDirtyPlayerIds, resourceSlotDormancyDirtyPlayerIds: this.resourceSlotDormancyDirtyPlayerIds
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
    const ownershipChangeSample = buildOwnershipChangeSample(tileKey, tile, previous, commandId);
    if (ownershipChangeSample) {
      if (this.onOwnershipChange) this.onOwnershipChange(ownershipChangeSample);
      appendTownLostEventLogIfApplicable(ownershipChangeSample, previous?.town, this.state.players, this.now());
    }
    if (previous) this.removeTileFromPlayerSummaries(tileKey, previous);
    this.state.tiles.set(tileKey, tile);
    this.snapshotTileCache.set(tileKey, mapTile(tile));
    this.applyTileToPlayerSummaries(tileKey, tile);
    if (!sameOwner) {
      if (previous?.ownerId) this.markPlannerPlayerTopologyTileChanged(previous.ownerId, tileKey);
      if (tile.ownerId) this.markPlannerPlayerTopologyTileChanged(tile.ownerId, tileKey);
      // Ownership changed → bump the territory version so the barb-activation
      // signature (getBarbActivationVisionSignature) knows to recompute. Same-owner
      // mutations (muster, pop growth, income) leave this counter unchanged.
      if (previous?.ownerId) this.territoryVersionByPlayer.set(previous.ownerId, (this.territoryVersionByPlayer.get(previous.ownerId) ?? 0) + 1);
      if (tile.ownerId) this.territoryVersionByPlayer.set(tile.ownerId, (this.territoryVersionByPlayer.get(tile.ownerId) ?? 0) + 1);
    }
    // A FRONTIER tile holds no standing vision (see visibility-coverage-cache.ts's
    // tileOwnershipChanged), so the footprint must also be recomputed on a
    // same-owner ownershipState flip — most importantly SETTLE, which grants
    // the tile's footprint for the first time even though ownerId never changes.
    if (!sameOwner || previous?.ownershipState !== tile.ownershipState) {
      this.state.visibilityCoverage.tileOwnershipChanged(previous?.ownerId, tile.ownerId, tile.x, tile.y, this.visionTransitions.callbacks, {
        previousOwnershipState: previous?.ownershipState,
        nextOwnershipState: tile.ownershipState
      });
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
      activeRelayBeaconsByOwner: this.activeRelayBeaconsByOwner,
      musterTilesByOwner: this.musterTilesByOwner,
      fortTilesByOwner: this.fortTilesByOwner,
      railDepotTilesByOwner: this.railDepotTilesByOwner,
      garrisonHallTilesByOwner: this.garrisonHallTilesByOwner,
      assemblyWorksTilesByOwner: this.assemblyWorksTilesByOwner,
      logisticsGuildTilesByOwner: this.logisticsGuildTilesByOwner,
      quartermastersOfficeTilesByOwner: this.quartermastersOfficeTilesByOwner,
      granaryTilesByOwner: this.granaryTilesByOwner,
      censusHallTilesByOwner: this.censusHallTilesByOwner
    });
    if (refreshNeutralBeaconIndexForTileImpl({ tileKey, previous, next: tile, neutralBeaconTileKeys: this.neutralBeaconTileKeys })) {
      this.beaconGeneration += 1;
    }
    this.spawnPlacementIndex.refreshForTileChange(tileKey, tile);
    refreshMonumentOwnerIndexForTile({ tileKey, previous, next: tile, activeMonumentOwnerByType: this.activeMonumentOwnerByType });
    // Structure count index: keep ownedStructureCountByPlayerByType consistent
    // across capture / build / cancel / removal transitions. Each slot is
    // tracked by the STRUCTURE's ownerId (not the tile's), to match the
    // ownedStructureCountForPlayer contract used by structureBuildGoldCost.
    this.refreshOwnedStructureCountIndexForTile(previous, tile);
    if (previous?.ownerId !== tile.ownerId) this.cancelPendingSettlementIfOwnerChanged(tileKey, tile.ownerId, commandId);
    // Wonder bonus fields (e.g. Deepwater Engine's dock gold multiplier) must be
    // refreshed both on ownership change AND when a same-owner tile finishes
    // settling (FRONTIER → SETTLED) — refreshPlayerWonders only counts SETTLED
    // tiles, so claim-then-settle (the common path) used to leave the bonus
    // fields stuck at their pre-claim values until some unrelated !sameOwner
    // mutation happened to touch the tile again.
    const justBecameSettledForSameOwner = sameOwner && tile.ownershipState === "SETTLED" && !wasSettledForSameOwner;
    if (tile.naturalWonder && (!sameOwner || justBecameSettledForSameOwner)) {
      wonderEffects.syncWatchtowerObservatory(tile);
      if (previous?.ownerId) wonderEffects.refreshPlayerWonders(previous.ownerId, this.settledTilesForPlayer(previous.ownerId), this.wonderCacheByPlayer, this.state.players);
      if (tile.ownerId) wonderEffects.refreshPlayerWonders(tile.ownerId, this.settledTilesForPlayer(tile.ownerId), this.wonderCacheByPlayer, this.state.players);
      if (!sameOwner) {
        wonderEffects.applyConscriptionEngineFirstClaim(tile, this.state.players, this.now());
        wonderEffects.announceNaturalWonderClaim(tile, this.state.players, this.now());
      }
    }
    flushRadiusYieldRefresh({ tileKey, previous, next: tile, tiles: this.state.tiles, dockLinksByDockTileKey: this.state.dockLinksByDockTileKey, settledTilesForPlayer: (p) => this.settledTilesForPlayer(p), tileDeltaFromState: (t) => this.tileDeltaFromState(t), emitEvent: (e) => this.emitEvent(e), now: () => this.now() });
    reconcileTownVisionBonus({ players: this.state.players, coverage: this.state.visibilityCoverage, callbacks: this.visionTransitions.callbacks }, previous, tile);
    reconcileOutpostVisionBonus(this.outpostVisionDeps(), previous, tile);
    // §5.4: this tile's own mutation can change either owner's FOOD/UMBRITE
    // slot totals (a resource tile gained/lost, a new demand consumer built)
    // without touching any of their outposts directly — mark them dirty for
    // a lazy resync (flushOutpostVisionDormancyResync's doc comment above
    // explains why this can't just resync eagerly here).
    this.markOutpostVisionDormancyDirty(previous?.ownerId);
    if (tile.ownerId !== previous?.ownerId) this.markOutpostVisionDormancyDirty(tile.ownerId);
    // Fixed-border reach: if this mutation just activated a new reach anchor
    // (town gained/changed owner, an outpost-family structure went active,
    // or a dock tile gained an owner), extend the persistent border with it.
    // Territory is sticky — losing your own anchor does nothing by itself
    // (see newlyActivatedReachAnchors' doc comment) — the SETTLED -> FRONTIER
    // unsettle transition only fires here, on the *overtaking* side of a
    // border contest.
    for (const anchor of this.newlyActivatedReachAnchors(previous, tile)) {
      this.applyReachAnchorActivation(anchor, commandId);
    }
    // Deactivation side: normally a no-op (sticky), but closes the gap where
    // a rival's reach already covers ground this anchor stops defending —
    // see applyReachAnchorDeactivation's doc comment.
    for (const anchor of this.newlyDeactivatedReachAnchors(previous, tile)) {
      this.applyReachAnchorDeactivation(anchor, commandId);
    }
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
      tiles: this.state.tiles,
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
      tiles: this.state.tiles,
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
      tiles: this.state.tiles,
      tileKey,
      previous,
      next
    });
  }

  private removeFrontierTileFromOwnerIndex(tileKey: string, ownerId: string): void { removeFrontierTileFromOwnerIndexImpl(this.frontierTilesByOwner, tileKey, ownerId); }

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
    // The settlement never completes once the tile changes hands mid-settle
    // (e.g. captured out from under the settling player) — refund the gold
    // spent to start it, same as a cancelled structure build.
    const settler = this.state.players.get(pendingSettlement.ownerId);
    if (settler) refundSettleCost(settler, pendingSettlement.goldCost, this.playerManpowerCap(settler));
    this.emitPlayerStateUpdate({ commandId, playerId: pendingSettlement.ownerId });
    return pendingSettlement;
  }

  private tileKeySetToTiles(keys: Iterable<string>): DomainTileState[] {
    const result: DomainTileState[] = [];
    for (const key of keys) {
      const tile = this.state.tiles.get(key);
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
    for (const lock of this.state.locksByTile.values()) {
      if (lock.playerId === playerId) return undefined;
    }
    const ownedTiles = this.tileKeySetToTiles(this.summaryForPlayer(playerId).territoryTileKeys);
    const player = this.state.players.get(playerId);
    return chooseNextOwnedFrontierCommandFromLookup(this.state.tiles, ownedTiles, playerId, clientSeq, issuedAt, sessionPrefix, {
      canAttack: (player?.points ?? 0) >= FRONTIER_CLAIM_COST && (player?.manpower ?? 0) >= ATTACK_MANPOWER_MIN,
      canExpand: (player?.points ?? 0) >= FRONTIER_CLAIM_COST && (player?.manpower ?? 0) >= EXPAND_MANPOWER_COST,
      dockLinksByDockTileKey: this.state.dockLinksByDockTileKey
    });
  }

  explainNextAutomationCommand(
    playerId: string,
    clientSeq: number,
    issuedAt: number,
    sessionPrefix: "ai-runtime" | "system-runtime",
    options?: { skipPreplan?: boolean; reservedDevelopmentSlots?: number; decisionCooldowns?: DecisionCooldownMap; beaconBoostActive?: boolean }
  ): { command?: CommandEnvelope; diagnostic: AutomationPlannerDiagnostic } {
    const player = this.state.players.get(playerId);
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
      this.aiHotFrontierStreakByPlayer.delete(playerId);
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
    for (const lock of this.state.locksByTile.values()) {
      if (lock.playerId !== playerId) continue;
      if (lock.source === "automation") continue;
      hasActiveLock = true;
      break;
    }
    let preplanDiagnostic: AutomationPlannerDiagnostic | undefined;
    if (!options?.skipPreplan) {
      const townTiles = this.tileKeySetToTiles(summary.ownedTownTierByTile.keys()); // resolved only when preplan actually runs
      const preplan = chooseAutomationPreplanCommand({
        playerId,
        points: player.points,
        manpower: player.manpower,
        techIds: [...player.techIds],
        domainIds: player.domainIds ? [...player.domainIds] : [],
        strategicResources: { ...(player.strategicResources ?? {}) },
        settledTileCount: summary.settledTileCount,
        townCount: summary.townCount,
        incomePerMinute: this.estimatedIncomePerMinuteForPlayer(playerId),
        hasActiveLock,
        ownedTiles, townTiles,
        clientSeq, issuedAt, sessionPrefix,
        ...(options?.decisionCooldowns ? { decisionCooldowns: options.decisionCooldowns } : {})
      });
      preplanDiagnostic = preplan.diagnostic;
      if (preplan.command) return preplan;
    }
    const forceBroadFrontierScan = shouldForceBroadFrontierScan(this.aiHotFrontierStreakByPlayer, playerId);
    const playerScopeKeyCount = plannerPlayerScopeKeyCount(summary);
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
      tilesByKey: this.state.tiles,
      dockLinksByDockTileKey: this.state.dockLinksByDockTileKey,
      // Fixed-border reach: lets the AI's frontier-candidate enumeration
      // prune EXPAND targets outside the player's reach (see ReachLookup in
      // frontier-command-planner.ts — this was the one deliberately-deferred
      // integration point from that change, now that isPlayerTileInReach
      // exists). ATTACK candidates are unaffected.
      reachLookup: { isInReach: (pid, x, y) => this.isPlayerTileInReach(pid, x, y) },
      playerScopeKeyCount,
      playerScopeTileCount: playerScopeKeyCount,
      previousVictoryPath: this.rememberedAutomationVictoryPathByPlayer.get(playerId),
      pathPopulationCounts: this.rememberedAutomationVictoryPathCounts(),
      onStrategicSnapshot: (snapshot) => {
        if (summary.territoryTileKeys.size <= 0) return;
        this.rememberedAutomationVictoryPathByPlayer.set(playerId, snapshot.primaryVictoryPath);
      },
      ...(preplanDiagnostic?.preplanProgressState ? { preplanProgressState: preplanDiagnostic.preplanProgressState } : {}),
      ...(spatialFocus ? { spatialFocusFront: spatialFocus.primaryFront } : {}),
      ...(forceBroadFrontierScan ? { forceBroadFrontierScan } : {}),
      ...(options?.decisionCooldowns ? { decisionCooldowns: options.decisionCooldowns } : {}), ...(options?.beaconBoostActive ? { beaconBoostActive: true } : {}),
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
    recordHotFrontierStreak(this.aiHotFrontierStreakByPlayer, playerId, plan.diagnostic.broadFallbackSkipped);
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

  // Shared context builder for the export-surface free functions in
  // runtime-export.ts, mirroring townNetworkContext()'s pattern (Stage 4).
  // Superset of what any single export function needs — matches
  // RuntimeExportContext, which is itself derived from the impl functions'
  // own parameter types, so a mismatch here is a compile error, not a
  // silent drift.
  private exportContext(): RuntimeExportContext {
    return {
      tiles: this.state.tiles,
      locksByCommandId: this.locksByCommandId,
      players: this.state.players,
      pendingSettlementsByTile: this.pendingSettlementsByTile,
      tileYieldCollectedAtByTile: this.tileYieldCollectedAtByTile,
      playerYieldCollectionEpochByPlayer: this.lastIncomeTickAtMsByPlayer,
      docks: this.state.docks,
      terrainEpoch: this.terrainEpoch,
      tileDeltaStringifyCache: this.tileDeltaStringifyCache,
      applyManpowerRegen: this.applyManpowerRegen.bind(this),
      playerManpowerCap: this.playerManpowerCap.bind(this),
      playerManpowerRegenPerMinute: this.playerManpowerRegenPerMinute.bind(this),
      playerLogisticsThroughputPerMinute: this.playerLogisticsThroughputPerMinute.bind(this),
      playerManpowerBreakdown: this.playerManpowerBreakdown.bind(this),
      incomePerMinuteForPlayer: this.incomePerMinuteForPlayer.bind(this),
      summaryForPlayer: this.summaryForPlayer.bind(this),
      growthStalledNoFoodCounter: this.growthStalledNoFoodCounter,
      recordedEventsByCommandId: this.replayCache.recordedEventsByCommandId,
      prebuiltTiles: this.snapshotTileCache,
      plannerGatingLockPlayerIds: () => this.plannerGatingLockPlayerIds(),
      refreshManpowerOnly: (player) => this.refreshManpowerOnly(player),
      plannerPlayerTileKeys: (playerId, summary) => this.plannerPlayerTileKeys(playerId, summary),
      ownedStructureCountsForPlayer: (playerId) => this.ownedStructureCountsForPlayer(playerId),
      estimatedIncomePerMinuteForPlayer: (playerId) => this.estimatedIncomePerMinuteForPlayer(playerId),
      reachTileKeysForPlayer: (playerId) => this.reachTileKeysForPlayer(playerId),
      neutralBeaconTileKeys: this.neutralBeaconTileKeys,
      beaconGeneration: this.beaconGeneration,
      yieldBearingTilesByOwner: this.yieldBearingTilesByOwner,
      expansionObjectiveCacheByPlayer: this.expansionObjectiveCacheByPlayer,
      musterTilesByOwner: this.musterTilesByOwner,
      locksByTile: this.state.locksByTile,
      resourceSlotSupplyForPlayer: (playerId) => this.resourceSlotSupplyForPlayer(playerId),
      resourceSlotDemandForPlayer: (playerId) => this.resourceSlotDemandForPlayer(playerId),
      playerSummaries: this.playerSummaries,
      ...(this.trackSyncMainThreadTask !== undefined ? { trackSync: this.trackSyncMainThreadTask } : {})
    };
  }

  exportSnapshotSections(): SimulationSnapshotSections {
    return snapshotSectionsForRuntime(this.exportContext());
  }

  async exportSnapshotSectionsAsync(yieldToEventLoop: () => Promise<void>): Promise<SimulationSnapshotSections> {
    return snapshotSectionsAsyncForRuntime(this.exportContext(), yieldToEventLoop);
  }

  exportPlannerWorldView(playerIds: string[]): PlannerWorldView {
    return plannerWorldViewForRuntime(this.exportContext(), playerIds);
  }

  // Cheap O(players) aggregate of empire sizes for the scale metric. Uses the
  // incrementally-maintained per-player territory Sets (Set.size is O(1)); does
  // NOT iterate the 202,500-tile world. Excludes barbarians (not real empires).
  empireTileCounts(): { totalOwnedTiles: number; maxEmpireTiles: number } {
    return empireTileCountsForRuntime(this.playerSummaries);
  }

  // Cumulative count of boot-time manpowerCapSnapshot corrections — see
  // manpowerCapBootstrapRestampedCount's declaration for why this exists.
  manpowerCapBootstrapRestampedTotal(): number {
    return this.manpowerCapBootstrapRestampedCount;
  }

  exportPlannerPlayerViews(playerIds: string[]): PlannerPlayerView[] {
    return plannerPlayerViewsForRuntime(this.exportContext(), playerIds);
  }

  exportPlayerDebugSnapshot(): RuntimePlayerDebugSnapshot {
    return playerDebugSnapshotForRuntime(this.exportContext());
  }

  // Lean per-second metrics row (skips exportPlayerDebugSnapshot's sort/clone/lock-scan work; see RuntimeAiPlayerMetricsRow doc comment).
  exportAiPlayerMetricsSnapshot(): RuntimeAiPlayerMetricsRow[] {
    return aiPlayerMetricsSnapshotForRuntime(this.exportContext());
  }

  exportTilesForKeys(tileKeys: Iterable<string>): PlannerTileView[] {
    return tilesForKeysForRuntime(this.exportContext(), tileKeys);
  }

  exportState(): RuntimeExportState {
    return exportStateForRuntime(this.exportContext());
  }

  async exportStateAsync(yieldToEventLoop: () => Promise<void>): Promise<RuntimeExportState> {
    return exportStateAsyncForRuntime(this.exportContext(), yieldToEventLoop);
  }

  getPlayersForLeaderboard(): RuntimeExportState["players"] {
    return leaderboardPlayersForRuntime(this.exportContext());
  }

  // Shared context builder for the visibility-surface free functions in
  // runtime-visibility.ts, mirroring townNetworkContext()'s pattern (Stage
  // 4) and exportContext()'s pattern above (Stage 5a). visibilityCoverage
  // and barbActivationVisibilityCache stay owned by SimulationRuntime and
  // are threaded in by reference — see runtime-visibility.ts's header
  // comment for why ownership must not move.
  private classifyVisibilityContext(): RuntimeClassifyVisibilityContext {
    return {
      players: this.state.players,
      tiles: this.state.tiles,
      locksByTile: this.state.locksByTile,
      docks: this.state.docks,
      dockLinksByDockTileKey: this.state.dockLinksByDockTileKey,
      applyManpowerRegen: (player) => this.applyManpowerRegen(player),
      visibilityCoverage: this.state.visibilityCoverage,
      ...(this.trackSyncMainThreadTask !== undefined ? { trackSyncMainThreadTask: this.trackSyncMainThreadTask } : {})
    };
  }

  private classifyVisibilityForPlayer(playerId: string): RuntimeVisibilityClassification {
    return classifyVisibilityForPlayerForRuntime(this.classifyVisibilityContext(), playerId);
  }

  getBarbActivationVisionSignature(): string {
    return getBarbActivationVisionSignatureForRuntime({
      players: this.state.players,
      tileCollectionVersionForPlayer: (playerId) =>
        this.territoryVersionByPlayer.get(playerId) ?? 0
    });
  }

  exportBarbActivationVisibleUnion(): { keys: string[]; signature: string } {
    return exportBarbActivationVisibleUnionForRuntime({
      players: this.state.players,
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
    emitVisibilityAuditForRuntime({
      onVisibilityAudit: this.onVisibilityAudit,
      playerId,
      tile,
      tileKey,
      redacted,
      classification
    });
  }

  exportVisibleStateForPlayer(playerId: string): ReturnType<SimulationRuntime["exportState"]> {
    return exportVisibleStateForPlayerForRuntime(this.visibleStateDeps(), playerId);
  }

  private visibleStateDeps(): RuntimeVisibleStateContext {
    return {
      tiles: this.state.tiles,
      locksByCommandId: this.locksByCommandId,
      players: this.state.players,
      pendingSettlementsByTile: this.pendingSettlementsByTile,
      docks: this.state.docks,
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
      refreshManpowerOnly: (player: RuntimePlayer) => this.refreshManpowerOnly(player),
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
    return exportVisibleStateForPlayerAsyncForRuntime(this.visibleStateDeps(), playerId, yieldToEventLoop);
  }

  exportTilesInAreaForPlayer(
    playerId: string,
    centerX: number,
    centerY: number,
    radius: number,
    options?: { fullVisibility?: boolean }
  ): SimulationTileWireDelta[] {
    return exportTilesInAreaForPlayerForRuntime(
      {
        tiles: this.state.tiles,
        players: this.state.players,
        tileDeltaFromState: (tile, context) => this.tileDeltaFromState(tile, context),
        tileYieldEconomyContextForPlayer: (player) => this.tileYieldEconomyContextForPlayer(player),
        filterTileDeltasForPlayer: (tileDeltas, visiblePlayerId) => this.filterTileDeltasForPlayer(tileDeltas, visiblePlayerId)
      },
      playerId,
      centerX,
      centerY,
      radius,
      options
    );
  }

  filterTileDeltasForPlayer<TDelta extends { x: number; y: number; terrain?: Terrain | undefined; ownerId?: string | undefined; forceVisibleForPlayerId?: string | undefined }>(
    tileDeltas: readonly TDelta[], playerId: string, options?: TileDeltaVisibilityFilterOptions
  ): TDelta[] {
    return filterTileDeltasForPlayerImpl(
      {
        players: this.state.players,
        tiles: this.state.tiles,
        locksByTile: this.state.locksByTile,
        docks: this.state.docks,
        dockLinksByDockTileKey: this.state.dockLinksByDockTileKey,
        summaryForPlayer: (id) => this.summaryForPlayer(id),
        visibilityCoverage: this.state.visibilityCoverage,
        hasFullVision: (pid) => this.getAbilityCooldownUntil(pid, ASTRAL_DOCK_LAUNCH_ACTIVE_UNTIL_KEY) > this.now(),
        ...(this.onVisibilityAudit ? { onVisibilityAudit: this.onVisibilityAudit } : {})
      },
      tileDeltas,
      playerId,
      options
    );
  }

  private settledTilesForPlayer(playerId: string): DomainTileState[] {
    return settledTilesForPlayerForRuntime(this.state.tiles, (id) => this.summaryForPlayer(id), playerId);
  }

  // --- Fixed-border reach (packages/shared/src/reach/reach.ts) ---

  // Every reach anchor world-wide, right now: every player's town tiles,
  // every active outpost-family structure tile (RELAY_BEACON /
  // SIEGE_OUTPOST / SIEGE_TOWER / DREAD_TOWER — same "active" predicate
  // outpost-aura.ts uses, sourced from the already-maintained
  // activeRelayBeaconsByOwner / activeSiegeOutpostsByOwner indexes), and
  // every owned dock tile. Used both for `liveReachForOwner`'s "can this
  // owner currently defend this tile" check during a contest, and once at
  // startup to seed `reachBorder`. `activatedAt` is unused by the current
  // border model (grantAnchorToBorder resolves contests via live coverage,
  // not build order) but is still populated for API completeness / possible
  // future use.
  private gatherReachAnchors(): ReachAnchor[] {
    return gatherReachAnchorsImpl({
      playerSummaries: this.playerSummaries,
      tiles: this.state.tiles,
      activeRelayBeaconsByOwner: this.activeRelayBeaconsByOwner,
      activeSiegeOutpostsByOwner: this.activeSiegeOutpostsByOwner,
      docks: this.state.docks,
      tileSettledAtByKey: this.tileSettledAtByKey,
      now: this.now()
    });
  }

  // Detects any reach anchor that just became active on this tile as a
  // result of `previous` -> `tile` (town gained/changed owner, an
  // outpost-family structure went active, or a dock tile gained an owner —
  // AND, for TOWN/OUTPOST, the tile just became SETTLED: re-settling a tile
  // that was downgraded by the unsettle transition while it still carried a
  // live structure must re-fire the grant, since gatherReachAnchors now
  // excludes non-SETTLED tiles entirely — without this, a re-settled anchor
  // would silently stop extending the border even though it once did).
  // A single tile can in principle activate more than one anchor kind at
  // once (e.g. a town tile that also carries a dock), so this returns a
  // list. Deactivations (structure destroyed/captured away, town lost, or a
  // downgrade to FRONTIER) are NOT reported here — the border is sticky and
  // only changes on a new activation contesting it (see
  // grantAnchorToBorder's doc comment).
  private newlyActivatedReachAnchors(previous: DomainTileState | undefined, tile: DomainTileState): ReachAnchor[] {
    return newlyActivatedReachAnchorsImpl(previous, tile, this.now());
  }

  // Mirror of newlyActivatedReachAnchors, inverted: detects any reach anchor
  // that just went INACTIVE on this tile as a result of `previous` -> `tile`
  // (town lost/downgraded, an outpost-family structure destroyed/captured
  // away, a dock tile losing its owner, or a SETTLED -> FRONTIER downgrade
  // taking a TOWN/OUTPOST anchor down with it). Feeds
  // applyReachAnchorDeactivation, which re-checks only the tiles this
  // specific anchor used to help defend against rival coverage that already
  // exists right now — see reassessBorderOnAnchorDeactivation's doc comment
  // for why this is needed even though the border is otherwise sticky.
  private newlyDeactivatedReachAnchors(previous: DomainTileState | undefined, tile: DomainTileState): ReachAnchor[] {
    return newlyDeactivatedReachAnchorsImpl(previous, tile, this.now());
  }

  // Border mutation lives in runtime-reach-border-apply.ts, next to the
  // REACH_UPDATE push it feeds. This is the runtime-side adapter: it supplies
  // the world lookups and routes the unsettle downgrade back through replaceTileState.
  private reachBorderApplyContext(): ReachBorderApplyContext {
    return createReachBorderApplyContext({
      gatherReachAnchors: () => this.gatherReachAnchors(), playerSummaryIds: () => this.playerSummaries.keys(), getTile: (k) => this.state.tiles.get(k), isLandTile: this.isLandTileQuery, downgradeToFrontier: (tileKey, cid0) => applyUnsettleDowngrade<DomainTileState, SimulationTileWireDelta>(tileKey, cid0, { getTile: (k) => this.state.tiles.get(k), replaceTileState: (k, t, cid) => this.replaceTileState(k, t, cid), tileDeltaFromState: (t) => this.tileDeltaFromState(t), emitEvent: (e) => this.emitEvent(e) })
    });
  }

  private applyReachAnchorActivation(anchor: ReachAnchor, causeCommandId: string, options?: { contestSettledOnUnclaimed?: boolean }): void {
    this.reachBorder = applyReachAnchorActivationToBorder(this.reachBorder, anchor, this.reachUpdateState, this.reachBorderApplyContext(), causeCommandId, options);
    // Reach caught up over this anchor's disk: anything decaying there for being out of reach is now held ground. O(radius²), not a sweep.
    cancelOutOfReachDecayInAnchorDisk({ tiles: this.state.tiles, replaceTileState: (k, t, cid) => this.replaceTileState(k, t, cid), tileDeltaFromState: (t) => this.tileDeltaFromState(t), emitEvent: (e) => this.emitEvent(e), isLandTile: this.isLandTileQuery }, anchor, causeCommandId);
  }
  private applyReachAnchorDeactivation(anchor: ReachAnchor, causeCommandId: string): void {
    this.reachBorder = applyReachAnchorDeactivationToBorder(this.reachBorder, anchor, this.reachUpdateState, this.reachBorderApplyContext(), causeCommandId);
  }

  private isPlayerTileInReach(playerId: string, x: number, y: number): boolean {
    return isPlayerTileInReachImpl(playerId, x, y, this.reachBorder);
  }

  // Pushes the authoritative reach border to every player it just changed for
  // (runtime-reach-update.ts). Without this the client can only approximate
  // its own border and will keep re-issuing EXPANDs the server rejects as
  // OUT_OF_REACH — the mismatch that used to wedge waypoint queues.
  private flushReachUpdatesForCommand(causeCommandId: string): void {
    flushReachUpdates(this.reachUpdateState, { reachTileKeysForPlayer: (id) => this.reachTileKeysForPlayer(id), emitPlayerMessage: (cmd, payload) => this.emitPlayerMessage(cmd, payload) }, causeCommandId);
  }

  /** Re-push reach to a (re)connecting player, whose client starts with none. */
  resendReachForPlayer(playerId: string): void {
    markReachForResend(this.reachUpdateState, playerId);
    this.flushReachUpdatesForCommand(`reach-update:resend:${this.now()}`);
  }

  // Diagnostic-only (admin debug surface): size of the persistent reach
  // border currently granted to a player, LAND-ONLY — the "reachTiles"
  // answer to "how much of their reach is frontier / still usable" (owned
  // tiles are always a SUBSET of granted reach — a border can extend into
  // ground not yet claimed). The border itself is purely geometric (a
  // radius disk with no terrain awareness — same as the client's
  // computeLocalReachSet), so a coastal or island anchor's disk routinely
  // covers SEA/COASTAL_SEA/MOUNTAIN tiles that can never actually be
  // EXPANDed onto (handleFrontierCommandImpl requires terrain === "LAND").
  // Reporting the raw geometric size overstated how much room a player
  // actually has — an island empire could read as having plenty of "reach"
  // left when most of that disk was open water. Filtered here, not on
  // reachTileKeysForPlayer below: that one feeds the AI planner's actual
  // legality lookup and must stay exactly geometric to match the server's
  // authoritative isInReach check bit-for-bit (filtering there would be
  // harmless for legality — EXPAND already separately requires LAND — but
  // needlessly risks drifting from the ground truth it's meant to mirror).
  // O(border size), not called from any hot path.
  reachTileCountForPlayer(playerId: string): number {
    return reachTileCountForPlayerImpl(playerId, this.reachBorder, this.state.tiles);
  }

  // Real (non-diagnostic) accessor: the full key set the AI planner needs to
  // build its own reachLookup, for both the in-process and worker-thread
  // planning paths — see buildRuntimePlannerPlayerViews's reachTileKeys.
  reachTileKeysForPlayer(playerId: string): string[] {
    return reachTileKeysForPlayerImpl(playerId, this.reachBorder);
  }

  // rival-reach-push.ts's ONLY window into Runtime (that module lives at the
  // service layer, which knows who is connected — Runtime doesn't). Mirrors
  // reachBorderApplyContext() just above; never exposes reachBorder/visibilityCoverage directly.
  rivalReachPushRuntimeDeps(): RivalReachPushRuntimeDeps {
    return {
      reachBorderTileKeysGroupedByOwner: () => reachTileKeysGroupedByOwnerImpl(this.reachBorder),
      reachTileKeysForPlayer: (playerId) => this.reachTileKeysForPlayer(playerId),
      isTileVisibleToPlayer: (viewerId, tileKey) => this.state.visibilityCoverage.isVisible(viewerId, tileKey),
      takeReachChangedTileKeys: (ownerId) => takeReachChangedTileKeysImpl(this.reachUpdateState, ownerId),
      emitRivalReachUpdate: (viewerId, ownerId, tileKeys, revision, causeCommandId) =>
        this.emitPlayerMessage({ commandId: causeCommandId, playerId: viewerId }, { type: "RIVAL_REACH_UPDATE", ownerId, tileKeys, revision })
    };
  }

  // §5 (resource slots): unlike settledTilesForPlayer, includes FRONTIER
  // tiles too — Siege Outposts (structureShowsOnTile) can be built on an
  // owned, unsettled tile, so resourceSlotDemandForPlayer needs every tile
  // that could be carrying a structure, not just settled ones.
  private ownedTilesForPlayer(playerId: string): DomainTileState[] {
    return [...this.summaryForPlayer(playerId).territoryTileKeys]
      .map((tileKey) => this.state.tiles.get(tileKey))
      .filter((tile): tile is DomainTileState => Boolean(tile && tile.ownerId === playerId));
  }

  // §5.6 v1 scope: global per-resource pool, cached per-player rather than
  // incrementally indexed (see resource-slot-view.ts's header comment).
  // Caching added because emitPlayerStateUpdate calls this on the periodic
  // income tick for every player, not just once per BUILD_STRUCTURE command
  // — see the cache field comments above for the invalidation gates.
  // Shared by the 3 resource-slot getters below (same dirty+coalesce shape as cachedEconomySnapshot); forceFresh bypasses the AI window.
  private coalescedResourceSlotRead<V>(cache: Map<string, V>, dirty: Set<string>, lastRebuiltAt: Map<string, number>, playerId: string, forceFresh: boolean, rebuild: () => V): V {
    const cached = cache.get(playerId);
    if (cached && !forceFresh && (!dirty.has(playerId) || (this.state.players.get(playerId)?.isAi && this.now() - (lastRebuiltAt.get(playerId) ?? 0) < AI_DERIVED_CACHE_COALESCE_MS))) return cached;
    const result = rebuild();
    cache.set(playerId, result); dirty.delete(playerId); lastRebuiltAt.set(playerId, this.now());
    return result;
  }

  private resourceSlotSupplyForPlayer(playerId: string, forceFresh = false): ResourceSlotTotals {
    return this.coalescedResourceSlotRead(this.resourceSlotSupplyCacheByPlayer, this.resourceSlotSupplyDirtyPlayerIds, this.resourceSlotSupplyLastRebuiltAtMsByPlayer, playerId, forceFresh, () => {
      const settledTiles = this.settledTilesForPlayer(playerId); const { waterworksKeys, foundryKeys } = radiusStructureKeysForSettledTiles(settledTiles); const p = this.state.players.get(playerId);
      const totals = resourceSlotSupplyForPlayerImpl(settledTiles, waterworksKeys, foundryKeys, p ? domainGrantedResourceSlots(p) : undefined, p ? techGrantedFishFoodSlotBonus(p) : 0); wonderEffects.applyFoundryHeartSlotBonus(wonderEffects.playerHasWonderType(this.wonderCacheByPlayer, playerId, "FOUNDRY_HEART"), totals); return totals;
    });
  }

  private resourceSlotDemandForPlayer(playerId: string, forceFresh = false): ResourceSlotTotals {
    return this.coalescedResourceSlotRead(this.resourceSlotDemandCacheByPlayer, this.resourceSlotDemandDirtyPlayerIds, this.resourceSlotDemandLastRebuiltAtMsByPlayer, playerId, forceFresh, () => {
      const p = this.state.players.get(playerId); const waivers = p ? slotWaiversForPlayer(p) : undefined; return resourceSlotDemandForPlayerImpl(this.ownedTilesForPlayer(playerId), playerId, waivers);
    });
  }

  // §5.4: dormant structures/towns short on their resource; no build-gate consumer, so it always coalesces for AI.
  private resourceSlotDormancyForPlayer(playerId: string): ResourceSlotDormancy {
    return this.coalescedResourceSlotRead(this.resourceSlotDormancyCacheByPlayer, this.resourceSlotDormancyDirtyPlayerIds, this.resourceSlotDormancyLastRebuiltAtMsByPlayer, playerId, false, () => {
      const supply = this.resourceSlotSupplyForPlayer(playerId);
      const p = this.state.players.get(playerId); const waivers = p ? slotWaiversForPlayer(p) : undefined; return resourceSlotDormantContributorsForPlayerImpl(this.ownedTilesForPlayer(playerId), playerId, supply, waivers);
    });
  }

  isStructureDormant(playerId: string, tileKey: string, field: "fort" | "observatory" | "siegeOutpost" | "economicStructure"): boolean {
    const structure = this.state.tiles.get(tileKey)?.[field];
    if (!structure || structure.ownerId !== playerId) return false;
    const slotType: SlotStructureType =
      field === "fort" || field === "siegeOutpost"
        ? ((structure as { variant?: string }).variant ?? (field === "fort" ? "FORT" : "SIEGE_OUTPOST")) as SlotStructureType
        : field === "observatory"
          ? ("OBSERVATORY" as SlotStructureType)
          : ((structure as { type: string }).type as SlotStructureType);
    const requirements = structureSlotRequirements(slotType);
    if (requirements.length === 0) return false;
    const dormancy = this.resourceSlotDormancyForPlayer(playerId);
    const key = `${tileKey}:${field}`;
    return requirements.some((req) => dormancy[req.resource].has(key));
  }

  isTownFoodDormant(playerId: string, tileKey: string): boolean {
    const dormancy = this.resourceSlotDormancyForPlayer(playerId);
    return dormancy.FOOD.has(`${tileKey}:town`);
  }

  // §5.4/§5.3: a town's FOOD-slot dormancy set, keyed by plain tile key
  // ("x,y") rather than the "x,y:town" contributor key resourceSlotDormancyForPlayer
  // uses internally — buildFedTownKeys and its callers work in plain tile keys.
  private foodDormantTownKeysForPlayer(playerId: string): ReadonlySet<string> {
    return this.dormantContributorKeysForPlayer(playerId, ":town");
  }

  // §5.4: which of this player's structures (of the given field) are
  // currently dormant, keyed by plain tile key ("x,y") rather than the
  // "x,y:field" contributor key resourceSlotDormancyForPlayer uses
  // internally — the various support-structure/combat/garrison consumers
  // this feeds (economy-network.ts, runtime-combat-support.ts,
  // runtime-fort-garrison-tick.ts, runtime-muster-tick.ts) all work in plain
  // tile keys. A structure is dormant here iff it's short on ANY of its
  // required resources (matches isStructureDormant's own logic) — checked
  // across all four resource sets, not just one, since e.g. GARRISON_HALL
  // requires both FOOD and CRYSTAL.
  dormantFieldKeysForPlayer(playerId: string, field: "fort" | "observatory" | "siegeOutpost" | "economicStructure"): ReadonlySet<string> {
    return this.dormantContributorKeysForPlayer(playerId, `:${field}`, true);
  }

  private dormantContributorKeysForPlayer(playerId: string, suffix: string, acrossAllResources = false): ReadonlySet<string> {
    const dormancy = this.resourceSlotDormancyForPlayer(playerId);
    const result = new Set<string>();
    const resourceSets = acrossAllResources ? Object.values(dormancy) : [dormancy.FOOD];
    for (const resourceSet of resourceSets) {
      for (const key of resourceSet) {
        if (key.endsWith(suffix)) result.add(key.slice(0, -suffix.length));
      }
    }
    return result;
  }

  // §5.4: dormant economicStructure tile keys ("x,y") for this player —
  // threaded into economy-network.ts's support-structure bonus checks
  // (Mintworks/Bank/Caravanary/Clearing House/Garrison Hall/Rail Depot/Customs
  // House) so a dormant instance stops granting its bonus without losing
  // its build-time uniqueness/existence.
  dormantEconomicStructureKeysForPlayer(playerId: string): ReadonlySet<string> {
    return this.dormantFieldKeysForPlayer(playerId, "economicStructure");
  }

  // §14.2: per-structure dormancy detail (tile+field key, plus which
  // required resource(s) are short) for the client's "dormant/unpowered
  // structure" indicator — sent alongside resourceSlots on PLAYER_UPDATE.
  dormantStructuresForPlayer(playerId: string): DormantStructureDetail[] {
    return dormantStructureDetailsFromDormancyImpl(this.resourceSlotDormancyForPlayer(playerId));
  }

  private townNetworkContext(): RuntimeTownNetworkContext {
    return {
      tiles: this.state.tiles,
      townNetworkCacheByPlayer: this.townNetworkCacheByPlayer,
      townConnectivityStateByPlayer: this.townConnectivityStateByPlayer,
      tileYieldContextCacheByPlayer: this.tileYieldContextCacheByPlayer,
      quartermastersOfficeTilesByOwner: this.quartermastersOfficeTilesByOwner,
      ...(this.trackSyncMainThreadTask !== undefined ? { trackSyncMainThreadTask: this.trackSyncMainThreadTask } : {}),
      players: this.state.players,
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      settledTilesForPlayer: (playerId) => this.settledTilesForPlayer(playerId),
      foodDormantTownKeysForPlayer: (playerId) => this.foodDormantTownKeysForPlayer(playerId),
      dormantEconomicStructureKeysForPlayer: (playerId) => this.dormantEconomicStructureKeysForPlayer(playerId)
    };
  }

  private orderedTownTilesForPlayer(playerId: string): DomainTileState[] {
    return orderedTownTilesForPlayerImpl(this.townNetworkContext(), playerId);
  }

  private fedTownKeysForPlayer(player: DomainPlayer): Set<string> {
    return fedTownKeysForPlayerImpl(this.townNetworkContext(), player);
  }

  // Shared with cachedEconomySnapshot so buildConnectedTownNetworkForPlayer
  // (O(settled_tiles + towns^2)) fires once per cache-miss cycle, not twice.
  private cachedTownNetworkForPlayer(
    player: DomainPlayer,
    settledTiles: readonly DomainTileState[],
    maxConnectedTownNames: number
  ): Map<string, ConnectedTownNetworkEntry> {
    return cachedTownNetworkForPlayerImpl(this.townNetworkContext(), player, settledTiles, maxConnectedTownNames);
  }

  // §4.4 (docs/manpower-economy-rewrite-plan.md): Garrison Hall's flat cap
  // bonus is a plain per-structure count (garrisonHallTilesByOwner) — NOT
  // town-adjacency-scoped, because GARRISON_HALL uses "same_tile" placement
  // (structure-placement-metadata.json) and can sit on any settled/resource/
  // support/dock tile with no town nearby at all, unlike RAIL_DEPOT/
  // CLEARING_HOUSE's "town_support" mode. The Rail Depot network bonus is
  // separate: it only amplifies Garrison Halls built adjacent to (supporting)
  // a town inside a Rail-Depot-having network — see
  // railDepotNetworkGarrisonHallCountForPlayer. Cached and invalidated at the
  // same tile-mutation chokepoint as the town-network cache, so a manpower
  // read (called many times per tick, per the guardrails in
  // docs/game-mechanics.md §13/AGENTS.md) stays an O(1) map lookup except on
  // an actual cache-miss.
  private cachedManpowerStructureBonusForPlayer(player: RuntimePlayer): ManpowerStructureBonus {
    return cachedManpowerStructureBonusForPlayerImpl(
      {
        tiles: this.state.tiles,
        manpowerStructureBonusCacheByPlayer: this.manpowerStructureBonusCacheByPlayer,
        garrisonHallTilesByOwner: this.garrisonHallTilesByOwner,
        railDepotTilesByOwner: this.railDepotTilesByOwner,
        assemblyWorksTilesByOwner: this.assemblyWorksTilesByOwner,
        logisticsGuildTilesByOwner: this.logisticsGuildTilesByOwner,
        quartermastersOfficeTilesByOwner: this.quartermastersOfficeTilesByOwner,
        granaryTilesByOwner: this.granaryTilesByOwner,
        censusHallTilesByOwner: this.censusHallTilesByOwner,
        townNetworkCacheByPlayer: this.townNetworkCacheByPlayer,
        activeMonumentOwnerByType: this.activeMonumentOwnerByType,
        dormantEconomicStructureKeysForPlayer: (playerId) => this.dormantEconomicStructureKeysForPlayer(playerId),
        summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
        settledTilesForPlayer: (playerId) => this.settledTilesForPlayer(playerId),
        rebuildTownNetworkUninstrumented: (p, settledTiles) => this.rebuildTownNetworkUninstrumented(p, settledTiles)
      },
      player
    );
  }

  // Same rebuild as cachedTownNetworkForPlayer, without the
  // trackSyncMainThreadTask wrapper — see cachedManpowerStructureBonusForPlayer
  // for why an uninstrumented path is needed here.
  private rebuildTownNetworkUninstrumented(
    player: DomainPlayer,
    settledTiles: readonly DomainTileState[]
  ): Map<string, ConnectedTownNetworkEntry> {
    return rebuildTownNetworkUninstrumentedImpl(this.townNetworkContext(), player, settledTiles);
  }

  // §4.4: "only one Rail Depot may be built per connected-town network" —
  // checked at build time (see resolveTownSupportTarget in
  // runtime-structure-command-handlers.ts).
  private railDepotAlreadyInNetworkForPlayer(playerId: string, townKey: string): boolean {
    return railDepotAlreadyInNetworkForPlayerImpl(this.townNetworkContext(), playerId, townKey);
  }

  // Assembly Works (tech-tree redesign): "only one Assembly Works may be
  // built per connected-town network" — mirrors railDepotAlreadyInNetworkForPlayer
  // exactly, retargeted.
  private assemblyWorksAlreadyInNetworkForPlayer(playerId: string, townKey: string): boolean {
    return assemblyWorksAlreadyInNetworkForPlayerImpl(this.townNetworkContext(), playerId, townKey);
  }

  // Quartermaster's Office (tech-tree redesign): true when the player owns
  // an active Quartermaster's Office within QUARTERMASTERS_OFFICE_RADIUS
  // (Chebyshev) tiles of (x, y). A plain radius scan over the player's own
  // (rare, late-game) Quartermaster's Offices, same cost tradeoff as
  // monumentClaimOwnerId's full scan -- this only runs on a War-branch
  // structure build/upgrade command, not every tick.
  private hasNearbyQuartermastersOfficeForPlayer(playerId: string, x: number, y: number): boolean {
    return hasNearbyQuartermastersOfficeForPlayerImpl(this.townNetworkContext(), playerId, x, y);
  }

  // Census Hall (tech-tree redesign): connected-network Incubation Engine
  // (Granary) count, for the +20,000 population per connected city bonus.
  private censusHallConnectedGranaryBonusCountForPlayer(playerId: string, townKey: string): number {
    return censusHallConnectedGranaryBonusCountForPlayerImpl(this.townNetworkContext(), playerId, townKey);
  }

  private tileYieldEconomyContextForPlayer(player: DomainPlayer): RuntimeTileYieldEconomyContext {
    return tileYieldEconomyContextForPlayerImpl(this.townNetworkContext(), player);
  }

  private enrichTileWithTownContext(tile: DomainTileState, player: RuntimePlayer | undefined, context: RuntimeTileYieldEconomyContext): DomainTileState {
    return enrichTileWithTownContextImpl(tile, player, context, this.state.tiles);
  }

  private incomeStorageContext(): RuntimeIncomeStorageContext {
    return {
      players: this.state.players,
      tiles: this.state.tiles,
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      cachedEconomySnapshot: (player) => this.cachedEconomySnapshot(player),
      respawnPlayerOnUnownedLand: (playerId, commandId) => this.respawnPlayerOnUnownedLand(playerId, commandId)
    };
  }

  private incomePerMinuteForPlayer(playerId: string): number {
    return incomePerMinuteForPlayerImpl(this.incomeStorageContext(), playerId);
  }

  private hasActiveSettlementTownForPlayer(playerId: string): boolean {
    return hasActiveSettlementTownForPlayerImpl(this.incomeStorageContext(), playerId);
  }

  private ensureGrossIncomeSettlementForPlayer(playerId: string, commandId: string): boolean {
    return ensureGrossIncomeSettlementForPlayerImpl(this.incomeStorageContext(), playerId, commandId);
  }

  private estimatedIncomePerMinuteForPlayer(playerId: string): number {
    return estimatedIncomePerMinuteForPlayerImpl(this.incomeStorageContext(), playerId);
  }

  private activeDevelopmentProcessCountForPlayer(playerId: string): number { return this.summaryForPlayer(playerId).activeDevelopmentProcessCount; }

  private autoSettlementQueueForPlayer(playerId: string): Array<{ x: number; y: number }> {
    // Coalesced for AI (2026-07-29 login-stall investigation): this was
    // entirely uncached, re-derived from scratch on every emitPlayerStateUpdate
    // call (every command, every passive-income credit) — O(frontier tiles)
    // work every single time. AI players expand continuously and have no live
    // subscriber, so serving the same list for up to AI_DERIVED_CACHE_COALESCE_MS
    // is invisible; humans are unaffected (cache bypassed below, same as before).
    const player = this.state.players.get(playerId);
    if (player?.isAi) {
      const cached = this.autoSettlementQueueCacheByPlayer.get(playerId);
      if (cached && this.now() - cached.computedAtMs < AI_DERIVED_CACHE_COALESCE_MS) return cached.value;
    }
    // frontierTilesByOwner keeps this O(frontier) instead of O(territory) — orderedAutoSettlementTileKeys filters to FRONTIER tiles anyway.
    const frontierKeys = this.frontierTilesByOwner.get(playerId) ?? new Set<string>();
    let supportLookupCalls = 0;
    // AI-only read-through cache for the per-tile eligibility result (see
    // AUTO_SETTLEMENT_ELIGIBILITY_TTL_MS). Humans get undefined here, so
    // orderedAutoSettlementTileKeys falls back to its original always-fresh
    // behavior for them — zero behavior change.
    const eligibilityCache = player?.isAi
      ? {
          get: (tileKey: string): boolean | undefined => {
            const entry = this.autoSettlementEligibilityCacheByTile.get(tileKey);
            if (!entry || this.now() - entry.computedAtMs >= AUTO_SETTLEMENT_ELIGIBILITY_TTL_MS) return undefined;
            return entry.eligible;
          },
          set: (tileKey: string, eligible: boolean): void => {
            this.autoSettlementEligibilityCacheByTile.set(tileKey, { eligible, computedAtMs: this.now() });
          }
        }
      : undefined;
    const rebuild = (): Array<{ x: number; y: number }> => {
      return orderedAutoSettlementTileKeys(playerId, frontierKeys, {
        getTile: (tileKey) => this.state.tiles.get(tileKey),
        isBlocked: (tileKey) => this.state.locksByTile.has(tileKey) || this.pendingSettlementsByTile.has(tileKey),
        isInReach: (tile) => this.isPlayerTileInReach(playerId, tile.x, tile.y),
        hasTownSupport: (tile) => {
          supportLookupCalls += 1;
          return this.supportedTownKeysForTile(playerId, tile.x, tile.y).some((townKey) => {
            const town = this.state.tiles.get(townKey)?.town;
            return Boolean(town && town.populationTier !== "SETTLEMENT");
          });
        },
        isRevealedToPlayer: (tile) => this.state.visibilityCoverage.isVisible(playerId, simulationTileKey(tile.x, tile.y)) && isAutoSettlementResourceTechRevealed(tile, player), // fog-of-war + tech-reveal gates
        eligibilityCache
      })
        .map((tileKey) => {
          const [rawX, rawY] = tileKey.split(",");
          const x = Number(rawX);
          const y = Number(rawY);
          return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
        })
        .filter((tile): tile is { x: number; y: number } => Boolean(tile));
    };
    // Instrumentation only (2026-07-29 login-stall investigation): a single
    // call was clocked at 6.5s, but O(frontier x 8-neighbor-scan) should be
    // low tens of milliseconds even for 10k+ frontier tiles. The trackSync
    // "details" field gets truncated to "[Object]" in the pretty-printed
    // fly logs (util.inspect depth), so log a flat, guaranteed-visible line
    // directly whenever this is suspiciously slow — real frontierCount /
    // supportLookupCalls tells us whether N is genuinely enormous or the
    // cost is coming from somewhere unaccounted for.
    const rebuildStartedAt = this.now();
    const value = this.trackSyncMainThreadTask
      ? this.trackSyncMainThreadTask("auto_settlement_queue_rebuild", { playerId }, rebuild)
      : rebuild();
    const rebuildDurationMs = this.now() - rebuildStartedAt;
    if (rebuildDurationMs > 500) {
      this.runtimeLogInfo(
        { playerId, frontierCount: frontierKeys.size, supportLookupCalls, resultLength: value.length, durationMs: rebuildDurationMs },
        "[auto_settlement_queue_rebuild] slow call detail"
      );
    }
    if (player?.isAi) this.autoSettlementQueueCacheByPlayer.set(playerId, { value, computedAtMs: this.now() });
    return value;
  }

  storageCapForPlayer(playerId: string): EmpireStorageCap | undefined {
    return storageCapForPlayerImpl(this.incomeStorageContext(), playerId);
  }

  private playerStateUpdateContext(): RuntimePlayerStateUpdateContext {
    return {
      players: this.state.players,
      lastEmittedStorageCapByPlayer: this.lastEmittedStorageCapByPlayer,
      applyManpowerRegen: (player) => this.applyManpowerRegen(player),
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      cachedDefensibilityMetrics: (playerId, summary) => this.cachedDefensibilityMetrics(playerId, summary),
      cachedEconomySnapshot: (player) => this.cachedEconomySnapshot(player),
      resourceSlotSupplyForPlayer: (playerId) => this.resourceSlotSupplyForPlayer(playerId),
      resourceSlotDemandForPlayer: (playerId) => this.resourceSlotDemandForPlayer(playerId),
      dormantStructuresForPlayer: (playerId) => this.dormantStructuresForPlayer(playerId),
      emitPlayerMessage: (command, payload) => this.emitPlayerMessage(command, payload),
      playerManpowerCap: (player) => this.playerManpowerCap(player),
      playerManpowerRegenPerMinute: (player) => this.playerManpowerRegenPerMinute(player),
      playerLogisticsThroughputPerMinute: (player) => this.playerLogisticsThroughputPerMinute(player),
      playerManpowerBreakdown: (player) => this.playerManpowerBreakdown(player),
      pendingSettlementsSnapshotForPlayer: (playerId) => this.pendingSettlementsSnapshotForPlayer(playerId),
      autoSettlementQueueForPlayer: (playerId) => this.autoSettlementQueueForPlayer(playerId),
      activeDevelopmentProcessCountForPlayer: (playerId) => this.activeDevelopmentProcessCountForPlayer(playerId),
      weaponsFactoryCountsForPlayer: (playerId) => weaponsFactoryCountsForPlayer(playerId, this.state.tiles.values())
    };
  }

  private emitPlayerStateUpdate(command: Pick<CommandEnvelope, "commandId" | "playerId">, playerId = command.playerId): void {
    // Instrumentation only (2026-07-28 login-stall investigation): everything
    // this calls (cachedDefensibilityMetrics, autoSettlementQueueForPlayer,
    // etc.) was previously untracked, so a slow call anywhere in here showed
    // up as unattributed time inside whichever OUTER phase (e.g.
    // apply_passive_income_for_player) happened to call it. Wrapping the
    // whole function first gives a coarse signal; the two calls below narrow
    // it further without changing behavior.
    const run = (): void => emitPlayerStateUpdateImpl(this.playerStateUpdateContext(), command, playerId);
    if (this.trackSyncMainThreadTask) {
      this.trackSyncMainThreadTask("emit_player_state_update", { playerId }, run);
    } else {
      run();
    }
    // Piggybacks on the dormancy rebuild emitPlayerStateUpdateImpl's own
    // cachedEconomySnapshot call already just did (or will do, on whichever
    // side reads it first) — see flushOutpostVisionDormancyResync's doc
    // comment on markOutpostVisionDormancyDirty for why this is deferred
    // here instead of resolved inside replaceTileState.
    this.flushOutpostVisionDormancyResync(playerId);
  }

  private handleSyncAllianceCommand(command: CommandEnvelope): void {
    const actor = this.state.players.get(command.playerId);
    const payload = parseAllianceSyncPayload(command.payloadJson);
    const target = payload ? this.state.players.get(payload.targetPlayerId) : undefined;
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
    if (wasAllied !== payload.allied) this.state.visibilityCoverage.syncAllianceChange(actor.id, target.id, payload.allied, this.visionTransitions.callbacks);

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
          this.state.players.get(playerId) ?? { techIds: new Set<string>(), domainIds: new Set<string>() },
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

  private scheduleDrain(scheduling: "immediate" | "background" = "immediate"): void { scheduleDrainImpl(this.jobQueueContext(), this.jobQueueMutableState(), scheduling); }

  private drainQueues(): void { drainQueuesImpl(this.jobQueueContext(), this.jobQueueMutableState()); }

  private handleFrontierCommand(command: CommandEnvelope, actionType: FrontierCommandType): boolean { return handleFrontierCommandImpl(this.frontierCommandContext(), command, actionType); }

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
    const actor = this.state.players.get(input.playerId);
    if (!actor) return;
    applySettleCost(actor);
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

    this.scheduleAfter(settleDurationMs, () =>
      this.resolvePendingSettlement({
        ownerId: input.playerId,
        tileKey: input.targetKey,
        startedAt: input.startedAt,
        resolvesAt,
        commandId: input.commandId
      })
    );
  }

  // Extracted from startSettlementProcess's scheduled-timer closure so
  // RUSH_BUY (§6.3) can trigger the exact same completion early, without a
  // second copy of this logic. Idempotent via pendingSettlementMatches: if
  // this already ran (rush-buy) by the time the original timer fires, the
  // match check fails and the timer's call is a no-op — same pattern
  // completeStructureBuild already relies on for its own status guard.
  private resolvePendingSettlement(input: {
    ownerId: string;
    tileKey: string;
    startedAt: number;
    resolvesAt: number;
    commandId: string;
  }): void {
    const expectedSettlement = {
      ownerId: input.ownerId,
      tileKey: input.tileKey,
      startedAt: input.startedAt,
      resolvesAt: input.resolvesAt,
      goldCost: SETTLE_COST,
      commandId: input.commandId
    };
    const currentSettlement = this.pendingSettlementsByTile.get(input.tileKey);
    if (!this.pendingSettlementMatches(currentSettlement, expectedSettlement)) return;
    this.removePendingSettlement(input.tileKey);
    tryDrainDevQueueImpl(this.devQueueCommandContext(), input.ownerId); // slot freed -- see tryDrainDevQueueImpl doc comment
    const latest = this.state.tiles.get(input.tileKey);
    if (
      !latest ||
      latest.ownerId !== input.ownerId ||
      latest.ownershipState !== "FRONTIER"
    ) {
      this.emitPlayerStateUpdate({ commandId: input.commandId, playerId: input.ownerId });
      return;
    }
    const settledTile: DomainTileState = {
      ...latest,
      ownerId: input.ownerId,
      ownershipState: "SETTLED",
      ...(latest.town ? { town: latest.town } : {})
    };
    this.setTileYieldCollectedAt(input.commandId, input.ownerId, input.tileKey, this.now());
    this.replaceTileState(input.tileKey, settledTile);
    tryDrainClaimContinuationBuildTailImpl(this.devQueueCommandContext(), input.ownerId, input.tileKey, settledTile.x, settledTile.y);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: input.commandId,
      playerId: input.ownerId,
      // ownerId/ownershipState forced regardless of the sparse-diff cache; see
      // the recovered-settle path above for why "unchanged" isn't safe to drop here.
      tileDeltas: [{ ...this.tileDeltaFromState(settledTile), ownerId: settledTile.ownerId ?? undefined, ownershipState: settledTile.ownershipState ?? undefined }]
    });
    this.emitAutoFillForSettlement(settledTile, input.ownerId, input.tileKey);
    this.emitPlayerStateUpdate({ commandId: input.commandId, playerId: input.ownerId });
    this.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: input.commandId, playerId: input.ownerId });
  }

  private rushBuyCommandContext(): RuntimeRushBuyCommandContext {
    return buildRushBuyCommandContext({
      players: this.state.players,
      pendingSettlementsByTile: this.pendingSettlementsByTile,
      locksByTile: this.state.locksByTile,
      tiles: this.state.tiles,
      wonderCacheByPlayer: this.wonderCacheByPlayer,
      now: () => this.now(),
      rejectCommand: (command, code, message) => this.rejectCommand(command, code, message),
      resolvePendingSettlement: (input) => this.resolvePendingSettlement(input),
      resolveLock: (lock) => this.resolveLock(lock),
      completeStructureBuild: (targetKey, ownerId, structureType, commandId) => this.completeStructureBuild(targetKey, ownerId, structureType, commandId),
      emitPlayerStateUpdate: (command) => this.emitPlayerStateUpdate(command),
      emitEvent: (event) => this.emitEvent(event),
      structureCommandContext: () => this.structureCommandContext()
    });
  }

  private handleSettleCommand(command: CommandEnvelope): void {
    const actor = this.state.players.get(command.playerId);
    const payload = parseSettlePayload(command.payloadJson);
    if (!actor || !payload) { this.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.state.tiles.get(targetKey);
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
    // Fixed-border reach: SETTLE requires the tile to be inside the actor's
    // resolved reach set (packages/shared/src/reach/reach.ts), same gate as
    // EXPAND's OUT_OF_REACH check in validateFrontierCommand — SETTLE has its
    // own handler (not routed through validateFrontierCommand) so the check
    // is applied here directly.
    if (!this.isPlayerTileInReach(command.playerId, target.x, target.y)) {
      this.rejectCommand(command, "OUT_OF_REACH", "tile is outside your reach"); return;
    }
    if (this.pendingSettlementsByTile.has(targetKey)) { this.rejectCommand(command, "SETTLE_INVALID", "tile is already settling"); return; }
    if (this.rejectIfNoDevelopmentSlot(command, "SETTLE_INVALID", "development slots are busy")) return;
    const settleRejection = settleRejectionForActor(actor); if (settleRejection) { this.rejectCommand(command, settleRejection.code, settleRejection.message); return; }

    this.startSettlementProcess({
      commandId: command.commandId,
      playerId: command.playerId,
      targetKey,
      target,
      startedAt: this.now()
    });
  }

  private handleCancelSettleCommand(command: CommandEnvelope): void {
    const actor = this.state.players.get(command.playerId);
    const payload = parseSettlePayload(command.payloadJson);
    if (!actor || !payload) { this.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const pendingSettlement = this.pendingSettlementsByTile.get(targetKey);
    if (!pendingSettlement || pendingSettlement.ownerId !== command.playerId) {
      this.rejectCommand(command, "SETTLE_CANCEL_INVALID", "no settlement in progress on tile");
      return;
    }
    this.removePendingSettlement(targetKey);
    refundSettleCost(actor, pendingSettlement.goldCost, this.playerManpowerCap(actor));
    this.emitPlayerStateUpdate(command);
    this.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
    tryDrainDevQueueImpl(this.devQueueCommandContext(), command.playerId); // slot freed -- see tryDrainDevQueueImpl doc comment
  }

  // Dev/waypoint queue command handling + drain logic lives in
  // runtime-dev-queue-command-handlers.ts / runtime-waypoint-queue-command-handlers.ts
  // (this file is already oversized) -- these just build their context.
  devQueueCommandContext(): RuntimeDevQueueCommandContext {
    return {
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      now: () => this.now(),
      emitEvent: (event) => this.emitEvent(event),
      rejectCommand: (command, code, message) => this.rejectCommand(command, code, message),
      hasAvailableDevelopmentSlot: (playerId) => this.hasAvailableDevelopmentSlot(playerId),
      nextDrainCommandId: (playerId, tileKey) => this.nextTerritoryAutomationCommandId("dev-queue-drain", playerId, tileKey, this.now()),
      dispatchSettle: (command) => this.handleSettleCommand(command),
      dispatchBuild: (command) => handleBuildStructureCommandImpl(this.structureCommandContext(), command),
      dispatchRemoveStructure: (command) => handleRemoveStructureCommandImpl(this.structureCommandContext(), command), ...devQueueBuildReservationContext(this.structureCommandContext())
    };
  }

  // See runtime-claim-continuation-command-handlers.ts (context builder lives there; oversized file).
  private claimContinuationCommandContext() { return claimContinuationContextFromDevQueueContext(this.devQueueCommandContext(), this.state.tiles); }
  private waypointQueueCommandContext(): RuntimeWaypointQueueCommandContext { return { summaryForPlayer: (playerId) => this.summaryForPlayer(playerId), now: () => this.now(), emitEvent: (event) => this.emitEvent(event), rejectCommand: (command, code, message) => this.rejectCommand(command, code, message) }; }

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
    const actor = this.state.players.get(playerId);
    if (!actor?.isAi) return 0;
    let settledCount = 0;
    for (const { x, y } of this.autoSettlementQueueForPlayer(playerId)) {
      if (settleRejectionForActor(actor)) break;
      if (!this.hasAvailableDevelopmentSlot(playerId)) break;
      const targetKey = simulationTileKey(x, y);
      const target = this.state.tiles.get(targetKey);
      if (!target || target.ownerId !== playerId || target.ownershipState !== "FRONTIER") continue;
      if (target.frontierDecayKind === "ENCIRCLEMENT") continue;
      if (target.terrain !== "LAND") continue;
      if (this.pendingSettlementsByTile.has(targetKey)) continue;
      // Fixed-border reach: same OUT_OF_REACH gate handleSettleCommand applies
      // to a human's SETTLE command (see its comment above) -- this path
      // bypasses that handler entirely, so the check must be repeated here.
      if (!this.isPlayerTileInReach(playerId, target.x, target.y)) continue;
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
    const actor = this.state.players.get(command.playerId);
    const payload = parseTilePayload(command.payloadJson);
    if (!actor || !payload) { this.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
    this.applyManpowerRegen(actor);
    const target = this.state.tiles.get(simulationTileKey(payload.x, payload.y));
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
    const actor = this.state.players.get(command.playerId);
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
    for (const key of ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE", "SHARD"] as const) {
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

  private economicStructureCommandContext(): RuntimeEconomicStructureCommandContext {
    return buildEconomicStructureCommandContext({
      players: this.state.players,
      tiles: this.state.tiles,
      locksByTile: this.state.locksByTile,
      now: this.now,
      rejectCommand: (command, code, message) => this.rejectCommand(command, code, message),
      emitEvent: (event) => this.emitEvent(event),
      emitPlayerStateUpdate: (command) => this.emitPlayerStateUpdate(command),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      applyEncirclement: (changedKeys, playerId, commandId, options) => this.applyEncirclement(changedKeys, playerId, commandId, options),
      ownedTileCountForPlayer: (playerId) => this.ownedTileCountForPlayer(playerId),
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      playerManpowerCap: (player) => this.playerManpowerCap(player),
      addStrategicResource: (player, resource, amount) => this.addStrategicResource(player, resource, amount)
    });
  }

  private abilityCommandContext(): RuntimeAbilityCommandContext {
    return buildAbilityCommandContext({
      players: this.state.players,
      tiles: this.state.tiles,
      activeAetherBridgesByPlayer: this.activeAetherBridgesByPlayer,
      activeAetherWallsByPlayer: this.activeAetherWallsByPlayer,
      now: this.now,
      emitEvent: (event) => this.emitEvent(event),
      emitPlayerMessage: (command, payload) => this.emitPlayerMessage(command, payload),
      revealTargetsForPlayer: (playerId) => this.revealTargetsForPlayer(playerId),
      revealCapacityForPlayer: (player) => this.revealCapacityForPlayer(player),
      spendStrategicResource: (player, resource, amount) => this.spendStrategicResource(player, resource, amount),
      pickReadyOwnedObservatoryAny: (playerId, now) => this.pickReadyOwnedObservatoryAny(playerId, now),
      pickReadyOwnedObservatoryForTarget: (playerId, targetX, targetY, now) => this.pickReadyOwnedObservatoryForTarget(playerId, targetX, targetY, now),
      stampObservatoryCooldown: (tileKey, durationMs, now, commandId, playerId) =>
        this.stampObservatoryCooldown(tileKey, durationMs, now, commandId, playerId),
      buildRevealEmpireStats: (target) => this.buildRevealEmpireStats(target),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      filterTileDeltasForPlayer: (tileDeltas, playerId) => this.filterTileDeltasForPlayer(tileDeltas, playerId),
      isTileShieldedByEnemyAegisDome: (actorId, targetX, targetY) => this.isTileShieldedByEnemyAegisDome(actorId, targetX, targetY),
      isStructureDormant: (playerId, tileKey, field) => this.isStructureDormant(playerId, tileKey, field),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      isCoastalLand: (x, y) => this.isCoastalLand(x, y),
      closestAetherBridgeOrigin: (playerId, targetX, targetY) =>
        this.closestAetherBridgeOrigin(playerId, targetX, targetY),
      wallSegments: (originX, originY, direction, length) => this.wallSegments(originX, originY, direction, length),
      activeAetherBridgesForPlayer: (playerId) => this.activeAetherBridgesForPlayer(playerId),
      activeAetherWallsForPlayer: (playerId) => this.activeAetherWallsForPlayer(playerId),
      crossingBlockedByAetherWall: (fromX, fromY, toX, toY) =>
        this.crossingBlockedByAetherWall(fromX, fromY, toX, toY),
      reachBorderOwnerAt: (x, y) => reachBorderOwnerAtImpl(this.reachBorder, x, y),
      grantAetherBridgeReach: (playerId, x, y, commandId) => this.applyReachAnchorActivation(aetherBridgeReachAnchor(playerId, x, y, this.now()), commandId)
    });
  }

  private mapCommandContext(): RuntimeMapCommandContext {
    return buildMapCommandContext({
      players: this.state.players,
      tiles: this.state.tiles,
      now: this.now,
      emitEvent: (event) => this.emitEvent(event),
      ownedLandWithinRange: (playerId, x, y, range) => this.ownedLandWithinRange(playerId, x, y, range),
      pickReadyOwnedObservatoryForTarget: (playerId, targetX, targetY, now) => this.pickReadyOwnedObservatoryForTarget(playerId, targetX, targetY, now),
      stampObservatoryCooldown: (tileKey, durationMs, now, commandId, playerId) =>
        this.stampObservatoryCooldown(tileKey, durationMs, now, commandId, playerId),
      spendStrategicResource: (player, resource, amount) => this.spendStrategicResource(player, resource, amount),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      bumpTerrainEpoch: () => { this.terrainEpoch = nextTerrainEpoch++; },
      isStructurePowered: (ownerId, tileKey, structureType) => this.isStructurePowered(ownerId, tileKey, structureType),
      isTileShieldedByEnemyAegisDome: (actorId, targetX, targetY) => this.isTileShieldedByEnemyAegisDome(actorId, targetX, targetY),
      isTileShieldedByAegisLock: (actorId, targetX, targetY) =>
        this.isTileShieldedByAegisLock(actorId, targetX, targetY),
      isTileBombardBlockedByRadar: (actorId, targetX, targetY) =>
        isTileBombardBlockedByRadarImpl(
          this.state.tiles,
          (playerId, tileKey, field) => this.isStructureDormant(playerId, tileKey, field),
          actorId,
          targetX,
          targetY
        ),
      isStructureDormant: (playerId, tileKey, field) => this.isStructureDormant(playerId, tileKey, field),
      emitPlayerMessage: (command, payload) => this.emitPlayerMessage(command, payload),
      getAbilityCooldownUntil: (playerId, abilityKey) => this.getAbilityCooldownUntil(playerId, abilityKey),
      setAbilityCooldownUntil: (playerId, abilityKey, untilMs) => this.setAbilityCooldownUntil(playerId, abilityKey, untilMs),
      strategicResourceAmount: (player, resource) => this.strategicResourceAmount(player, resource),
      addStrategicResource: (player, resource, amount) => this.addStrategicResource(player, resource, amount),
      appendPlayerEventLogEntry: (player, input) => appendPlayerEventLogEntry(player, input)
    });
  }

  private getAbilityCooldownUntil(playerId: string, abilityKey: string): number { return getAbilityCooldownUntilImpl(this.abilityCooldowns, playerId, abilityKey); }

  private setAbilityCooldownUntil(playerId: string, abilityKey: string, untilMs: number): void { setAbilityCooldownUntilImpl(this.abilityCooldowns, playerId, abilityKey, untilMs); }

  private isTileShieldedByAegisLock(actorId: string, targetX: number, targetY: number): boolean { return isTileShieldedByAegisLockImpl(this.state.tiles, this.abilityCooldowns, this.now(), actorId, targetX, targetY); }

  private progressionCommandContext(): RuntimeProgressionCommandContext {
    return buildProgressionCommandContext({
      players: this.state.players,
      tiles: this.state.tiles,
      emitEvent: (event) => this.emitEvent(event),
      emitPlayerStateUpdate: (command, playerId) => this.emitPlayerStateUpdate(command, playerId),
      addStrategicResource: (player, resource, amount) => this.addStrategicResource(player, resource, amount),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      snapshotTileCache: this.snapshotTileCache,
      townConnectivityStateByPlayer: this.townConnectivityStateByPlayer,
      dockLinksByDockTileKey: this.state.dockLinksByDockTileKey,
      settledTilesForPlayer: (playerId) => this.settledTilesForPlayer(playerId),
      outpostVisionDeps: () => this.outpostVisionDeps(),
      visibilityCoverage: this.state.visibilityCoverage,
      visionTransitionCallbacks: this.visionTransitions.callbacks,
      now: () => this.now(),
      invalidateTileStringifyCache: (tileKey) => this.tileDeltaStringifyCache.invalidate(tileKey),
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      economySnapshotCacheByPlayer: this.economySnapshotCacheByPlayer,
      resourceSlotDemandCacheByPlayer: this.resourceSlotDemandCacheByPlayer,
      resourceSlotDormancyCacheByPlayer: this.resourceSlotDormancyCacheByPlayer,
      tileYieldContextCacheByPlayer: this.tileYieldContextCacheByPlayer,
      townNetworkCacheByPlayer: this.townNetworkCacheByPlayer,
      manpowerStructureBonusCacheByPlayer: this.manpowerStructureBonusCacheByPlayer,
      upkeepAccrualCacheByPlayer: this.upkeepAccrualCacheByPlayer,
      ownedOutpostTilesForPlayer: (playerId) => this.ownedOutpostTilesForPlayer(playerId),
      incomePerMinuteForPlayer: (playerId) => this.incomePerMinuteForPlayer(playerId),
      decrementShardRainSiteCount: () => {
        this.currentShardRainSiteCount = Math.max(0, this.currentShardRainSiteCount - 1);
        return this.currentShardRainSiteCount;
      },
      clearShardRainExpiry: () => { this.currentShardRainExpiresAt = undefined; },
      clearLastShardRainHello: () => this.lastShardRainHelloByPlayer.clear(),
      onShardCollected: this.onShardCollected,
      resourceSlotSupplyForPlayer: (playerId) => this.resourceSlotSupplyForPlayer(playerId),
      resourceSlotDemandForPlayer: (playerId) => this.resourceSlotDemandForPlayer(playerId), tileDeltaRevealOnly: (tile, playerId) => this.tileDeltaRevealOnly(tile, playerId)
    });
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

  private revealCapacityForPlayer(player: DomainPlayer): number { return revealCapacityForPlayerImpl(player, this.revealTargetsForPlayer(player.id).size); }

  private ownedLandWithinRange(playerId: string, x: number, y: number, range: number): boolean { return ownedLandWithinRangeImpl(this.state.tiles, playerId, x, y, range); }

  isStructurePowered(ownerId: string, tileKey: string, structureType: EconomicStructureType): boolean {
    return isStructurePoweredImpl(
      this.state.tiles,
      ownerId,
      tileKey,
      structureType,
      (playerId, dormantTileKey, field) => this.isStructureDormant(playerId, dormantTileKey, field)
    );
  }

  // Aegis Dome shields tiles within AEGIS_DOME_PROTECTION_RADIUS for its
  // owner. Worldbreaker Shot is the first ability that respects this — if an
  // enemy player has an active, powered Aegis Dome within range of the target
  // tile, the strike is blocked.
  isTileShieldedByEnemyAegisDome(actorId: string, targetX: number, targetY: number): boolean {
    return isTileShieldedByEnemyAegisDomeImpl(
      this.state.tiles,
      (playerId, tileKey, field) => this.isStructureDormant(playerId, tileKey, field),
      actorId,
      targetX,
      targetY
    );
  }

  /**
   * Effective observatory cast radius for a player: BASE constant plus
   * observatoryRangeBonus + observatoryCastRadiusBonus from techs/domains. Mirrors
   * the client's `ownObservatoryCastRadius` so menu enablement and sim authority
   * agree on which observatories can reach a target.
   */
  private observatoryCastRadiusFor(playerId: string): number { return observatoryCastRadiusForImpl(this.state.players.get(playerId)); }

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
    return pickReadyOwnedObservatoryForTargetImpl({
      tiles: this.state.tiles,
      territoryTileKeys,
      playerId,
      targetX,
      targetY,
      now,
      range,
      isStructureDormant: (dormantPlayerId, tileKey, field) => this.isStructureDormant(dormantPlayerId, tileKey, field)
    });
  }

  /**
   * Variant for abilities with no spatial target (e.g. reveal_empire_stats targets a
   * player). Returns any owned, active, off-cooldown observatory, soonest-ready first.
   */
  private pickReadyOwnedObservatoryAny(playerId: string, now: number): string | undefined {
    return pickReadyOwnedObservatoryAnyImpl(
      this.state.tiles,
      this.summaryForPlayer(playerId).territoryTileKeys,
      playerId,
      now,
      (dormantPlayerId, tileKey, field) => this.isStructureDormant(dormantPlayerId, tileKey, field)
    );
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
    const tile = this.state.tiles.get(tileKey);
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

  private isCoastalLand(x: number, y: number): boolean { return isCoastalLandImpl(this.state.tiles, x, y); }

  private closestAetherBridgeOrigin(playerId: string, targetX: number, targetY: number): { x: number; y: number } | undefined {
    return closestAetherBridgeOriginImpl(this.state.tiles, playerId, targetX, targetY);
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

  private crossingBlockedByAetherWall(fromX: number, fromY: number, toX: number, toY: number): boolean { return crossingBlockedByAetherWallImpl(this.activeAetherWallsByPlayer, this.now(), fromX, fromY, toX, toY); }

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
      const tile = this.state.tiles.get(simulationTileKey(delta.x, delta.y));
      if (tile?.ownershipState !== "SETTLED") continue;
      dockTileKeysInBatch.push(simulationTileKey(delta.x, delta.y));
    }
    if (dockTileKeysInBatch.length === 0) return deltas;
    const revealKeys = computeLinkedDockRevealTileKeys(
      dockTileKeysInBatch,
      this.state.dockLinksByDockTileKey,
      WORLD_WIDTH,
      WORLD_HEIGHT
    );
    if (revealKeys.size === 0) return deltas;
    const seen = new Set<string>(deltas.map((delta) => simulationTileKey(delta.x, delta.y)));
    const additional: typeof deltas = [];
    for (const tileKey of revealKeys) {
      if (seen.has(tileKey)) continue;
      const tile = this.state.tiles.get(tileKey);
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
    return { ...(player ? { player } : {}), ...(ctx ? { fedTownKeys: ctx.fedTownKeys, firstThreeTownKeys: ctx.firstThreeTownKeys, waterworksKeys: ctx.waterworksKeys, foundryKeys: ctx.foundryKeys } : {}), tiles: this.state.tiles, dockLinksByDockTileKey: this.state.dockLinksByDockTileKey };
  }

  private tileDeltaFromState(tile: DomainTileState, context?: RuntimeTileYieldEconomyContext): SimulationTileWireDelta {
    return tileDeltaFromStateImpl(
      {
        players: this.state.players,
        tileDeltaStringifyCache: this.tileDeltaStringifyCache,
        now: () => this.now(),
        tileYieldCollectedAt: (tileKey, ownerId) => this.tileYieldCollectedAt(tileKey, ownerId),
        tileYieldEconomyContextForPlayer: (player) => this.tileYieldEconomyContextForPlayer(player),
        enrichTileWithTownContext: (t, player, ctx) => this.enrichTileWithTownContext(t, player, ctx),
        yieldViewEconomyContext: (player, ctx) => this.yieldViewEconomyContext(player, ctx)
      },
      tile,
      context
    );
  }

  private tileDeltaRevealOnly(tile: DomainTileState, playerId?: string): SimulationTileWireDelta {
    return tileDeltaRevealOnlyImpl(tile, this.tileDeltaStringifyCache, playerId ? this.state.players.get(playerId) : undefined);
  }

  private collectTileYield(
    tile: DomainTileState,
    now: number,
    command: Pick<CommandEnvelope, "commandId" | "playerId">,
    context?: RuntimeTileYieldEconomyContext,
    options: { creditStrategic?: boolean; persistAnchor?: boolean } = {}
  ): {
    gold: number;
    strategic: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>>;
  } {
    const creditStrategic = options.creditStrategic ?? true;
    const persistAnchor = options.persistAnchor ?? true;
    const tileKey = simulationTileKey(tile.x, tile.y);
    const player = tile.ownerId ? this.state.players.get(tile.ownerId) : undefined;
    const resolvedContext = player && context?.player.id === player.id ? context : player ? this.tileYieldEconomyContextForPlayer(player) : undefined;
    const enrichedTile = tile.town && resolvedContext ? this.enrichTileWithTownContext(tile, player, resolvedContext) : tile;
    const yieldView = buildTileYieldView(enrichedTile, this.tileYieldCollectedAt(tileKey, tile.ownerId), now, this.yieldViewEconomyContext(player, resolvedContext));
    const gold = Math.round((yieldView?.yield?.gold ?? 0) * 1e6) / 1e6; // was floor-to-cents; that destroyed buffered gold post-gold-rescope (§6.1)
    const strategic: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>> = {};
    for (const [resource, amount] of Object.entries(yieldView?.yield?.strategic ?? {}) as Array<
      ["FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number]
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

  private strategicResourceAmount(player: DomainPlayer, resource: StrategicResourceKey): number { return player.strategicResources?.[resource] ?? 0; }

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

  private ownedTileCountForPlayer(playerId: string): number { return this.summaryForPlayer(playerId).territoryTileKeys.size; }

  private adjacentTileStates(x: number, y: number): DomainTileState[] {
    const result: DomainTileState[] = [];
    forEachFrontierNeighbor(x, y, (nx, ny) => {
      const tile = this.state.tiles.get(simulationTileKey(nx, ny));
      if (tile) result.push(tile);
    });
    return result;
  }

  private extendFortPatrolGrace(tileKey: string, graceUntil: number): void { this.fortPatrolGraceUntilByTile.set(tileKey, Math.max(this.fortPatrolGraceUntilByTile.get(tileKey) ?? 0, graceUntil)); }

  private isDockCrossingTarget(from: DomainTileState, toX: number, toY: number): boolean {
    return isDockCrossingTargetImpl(from, toX, toY, this.state.dockLinksByDockTileKey);
  }

  private isAetherBridgeCrossingTarget(
    playerId: string,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
  ): boolean {
    return isAetherBridgeCrossingTargetImpl(this.activeAetherBridgesForPlayer(playerId), fromX, fromY, toX, toY);
  }

  private findOwnedDockOriginForCrossing(playerId: string, toX: number, toY: number): DockCrossingOrigin | undefined {
    return resolveOwnedDockOriginForCrossingImpl(this.state, (id) => this.summaryForPlayer(id).territoryTileKeys, playerId, toX, toY);
  }

  private findOwnedAetherBridgeOriginForCrossing(playerId: string, toX: number, toY: number): DomainTileState | undefined {
    return findOwnedAetherBridgeOriginForCrossingImpl(this.state.tiles, this.activeAetherBridgesForPlayer(playerId), playerId, toX, toY);
  }

  private supportedTownKeysForTile(playerId: string, x: number, y: number): string[] {
    return supportedTownKeysForTileImpl(this.state.tiles, playerId, x, y);
  }

  private assignedTownKeyForSupportTile(playerId: string, x: number, y: number): string | undefined { return assignedTownKeyForSupportTileImpl(this.state.tiles, playerId, x, y); }

  private supportedDockKeysForTile(playerId: string, x: number, y: number): string[] {
    return supportedDockKeysForTileImpl(this.state.tiles, playerId, x, y);
  }

  private economicStructureForSupportedTown(playerId: string, townKey: string, structureType: EconomicStructureType): DomainTileState | undefined {
    return economicStructureForSupportedTownImpl(this.state.tiles, playerId, townKey, structureType);
  }

  private firstAvailableTownSupportTile(playerId: string, townKey: string, structureType: EconomicStructureType): DomainTileState | undefined {
    return firstAvailableTownSupportTileImpl(this.state.tiles, playerId, townKey, structureType);
  }

  private ownedStructureCountForPlayer(playerId: string, structureType: BuildableStructureType): number { return ownedStructureCountForPlayerImpl(this.ownedStructureCountByPlayerByType, playerId, structureType); }
  private ownedStructureCountsForPlayer(playerId: string) { return ownedStructureCountsForPlayerImpl(this.ownedStructureCountByPlayerByType, playerId); }

  private adjustOwnedStructureCount(ownerId: string, structureType: BuildableStructureType, delta: number): void { adjustOwnedStructureCountImpl(this.ownedStructureCountByPlayerByType, ownerId, structureType, delta); }

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
    return buildStructureCommandContext({
      players: this.state.players,
      tiles: this.state.tiles,
      musterTilesByOwner: this.musterTilesByOwner,
      locksByTile: this.state.locksByTile,
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
      ownedStructureCountForPlayer: (playerId, structureType) => this.ownedStructureCountForPlayer(playerId, structureType), isPlayerTileInReach: (playerId, x, y) => this.isPlayerTileInReach(playerId, x, y),
      resourceSlotSupplyForPlayer: (playerId) => this.resourceSlotSupplyForPlayer(playerId, true), // forceFresh: hasFreeResourceSlots can't tolerate stale totals
      resourceSlotDemandForPlayer: (playerId) => this.resourceSlotDemandForPlayer(playerId, true),
      supportedTownKeysForTile: (playerId, x, y) => this.supportedTownKeysForTile(playerId, x, y),
      supportedDockKeysForTile: (playerId, x, y) => this.supportedDockKeysForTile(playerId, x, y),
      economicStructureForSupportedTown: (playerId, townKey, structureType) => this.economicStructureForSupportedTown(playerId, townKey, structureType),
      firstAvailableTownSupportTile: (playerId, townKey, structureType) => this.firstAvailableTownSupportTile(playerId, townKey, structureType),
      assignedTownKeyForSupportTile: (playerId, x, y) => this.assignedTownKeyForSupportTile(playerId, x, y),
      railDepotAlreadyInNetwork: (playerId, townKey) => this.railDepotAlreadyInNetworkForPlayer(playerId, townKey),
      assemblyWorksAlreadyInNetwork: (playerId, townKey) => this.assemblyWorksAlreadyInNetworkForPlayer(playerId, townKey),
      hasNearbyQuartermastersOffice: (playerId, x, y) => this.hasNearbyQuartermastersOfficeForPlayer(playerId, x, y),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      completeStructureBuild: (targetKey, ownerId, structureType, commandId) => this.completeStructureBuild(targetKey, ownerId, structureType, commandId),
      completeStructureRemoval: (targetKey, ownerId, commandId) => this.completeStructureRemoval(targetKey, ownerId, commandId),
      flushReachUpdates: (causeCommandId) => this.flushReachUpdatesForCommand(causeCommandId), appendPlayerEventLogEntry: (player, input) => appendPlayerEventLogEntry(player, input)
    });
  }

  private completeStructureBuild(targetKey: string, ownerId: string, structureType: string, commandId: string): void {
    completeStructureBuildImpl(this.structureCommandContext(), targetKey, ownerId, structureType, commandId);
    tryDrainDevQueueImpl(this.devQueueCommandContext(), ownerId); // slot freed -- see tryDrainDevQueueImpl doc comment
  }

  private cancelActiveOutpostAttackLocks(playerId: string, originKey: string): string[] {
    return cancelActiveOutpostAttackLocksImpl(this.structureCommandContext(), playerId, originKey);
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

  private completeStructureRemoval(targetKey: string, ownerId: string, commandId: string): void { completeStructureRemovalImpl(this.structureCommandContext(), targetKey, ownerId, commandId); }

  // Player-ids with at least one *player-issued* frontier lock - i.e. locks
  // that should gate the AI strategic planner. Automation combat locks are
  // filtered so defensive sweeps do not starve the planner.
  private plannerGatingLockPlayerIds(): Set<string> {
    return plannerGatingLockPlayerIdsImpl(this.state.locksByTile);
  }

  private handleCancelCaptureCommand(command: CommandEnvelope): void { handleCancelCaptureCommandImpl(this.combatSupportContext(), command); }

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

  private releaseMusterReservation(lock: LockRecord): void { releaseMusterReservationImpl(this.lockResolutionContext(), lock); }

  private resolveLock(lock: LockRecord): void {
    this.deltaBuffer.begin();
    try { resolveLockImpl(this.lockResolutionContext(), lock); }
    finally { this.deltaBuffer.flush(lock.commandId, lock.playerId, (e: SimulationEvent) => this.emitEvent(e)); }
  }

  private applyEncirclementForExpand(targetKey: string, playerId: string, commandId: string, options?: { bfsCap?: number }): void { applyEncirclementForExpandImpl(this.encirclementApplicationContext(), targetKey, playerId, commandId, options); }

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
      const tile = this.state.tiles.get(tileKey);
      if (!tile || tile.terrain !== "LAND" || tile.ownerId !== playerId) continue;
      if (tile.town) continue;
      targetKey = tileKey;
      break;
    }
    if (!targetKey) return false;
    const target = this.state.tiles.get(targetKey);
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

  private respawnPlayerOnUnownedLand(playerId: string, commandId: string): boolean { return respawnPlayerOnUnownedLandImpl(this.respawnContext(), playerId, commandId); }

  private applyBarbarianWalkOrMultiply(lock: LockRecord, previousTarget: DomainTileState | undefined): void { applyBarbarianWalkOrMultiplyImpl(this.combatSupportContext(), lock, previousTarget); }

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

  private attackManpowerLoss(committedManpower: number, attackerWon: boolean, atkEff: number, defEff: number): number { return attackManpowerLossImpl(committedManpower, attackerWon, atkEff, defEff); }

  private applyLockedManpowerDelta(player: DomainPlayer, manpowerDelta: number): number { return applyLockedManpowerDeltaImpl(player, manpowerDelta); }

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
      tiles: this.state.tiles,
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
    return requiredMusterForTargetImpl(target);
  }

  /**
   * Spend mustered manpower from the origin tile after a resolved attack under
   * the muster system. The pool is untouched (it was already drained into the
   * muster during accumulation).
   */
  private consumeOriginMuster(originKey: string, playerId: string, amount: number): void {
    consumeOriginMusterImpl(this.combatResolutionContext(), originKey, playerId, amount);
  }

  /**
   * Reduce a defending fort's garrison after a repulsed assault.
   * The attrittion fraction is a random draw in [MIN, MAX] applied to the attacking force.
   */
  private applyFortGarrisonAttrition(targetKey: string, attackingForce: number): void {
    applyFortGarrisonAttritionImpl(this.combatResolutionContext(), targetKey, attackingForce);
  }

  private combatResolutionContext(): RuntimeCombatResolutionContext {
    return {
      tiles: this.state.tiles,
      now: this.now,
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      emitEvent: (event) => this.emitEvent(event),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile)
    };
  }

  private respawnIfEliminated(playerId: string, commandId: string): void { respawnIfEliminatedImpl(this.respawnContext(), playerId, commandId); }

  private commandDispatchHandlers(): RuntimeCommandDispatchHandlers {
    return {
      emitUnsupported: (command) => {
        this.rejectCommand(command, "UNSUPPORTED", `${command.type} not yet migrated to the new simulation service`);
      },
      handleSettleCommand: (command) => this.handleSettleCommand(command),
      handleBuildStructureCommand: (command) => handleBuildStructureCommandImpl(this.structureCommandContext(), command),
      normalizeLegacyBuildCommand: (command) => this.normalizeLegacyBuildCommand(command),
      handleSetMusterCommand: (command) => handleSetMusterCommandImpl(this.structureCommandContext(), command),
      handleClearMusterCommand: (command) => handleClearMusterCommandImpl(this.structureCommandContext(), command),
      handleWatchMusterCommand: (command) => this.handleWatchMusterCommand(command),
      handleUnwatchMusterCommand: (command) => this.handleUnwatchMusterCommand(command),
      handleCancelCaptureCommand: (command) => this.handleCancelCaptureCommand(command),
      handleCancelFortBuildCommand: (command) => handleCancelFortBuildCommandImpl(this.structureCommandContext(), command),
      handleCancelStructureBuildCommand: (command) => handleCancelStructureBuildCommandImpl(this.structureCommandContext(), command),
      handleRushBuyCommand: (command) => handleRushBuyCommandImpl(this.rushBuyCommandContext(), command),
      handleCancelSettleCommand: (command) => this.handleCancelSettleCommand(command),
      handleRemoveStructureCommand: (command) => handleRemoveStructureCommandImpl(this.structureCommandContext(), command),
      handleCancelSiegeOutpostBuildCommand: (command) => handleCancelSiegeOutpostBuildCommandImpl(this.structureCommandContext(), command),
      handleCollectTileCommand: (command) => this.handleCollectTileCommand(command),
      handleCollectVisibleCommand: (command) => this.handleCollectVisibleCommand(command),
      handleUncaptureTileCommand: (command) => handleUncaptureTileCommandImpl(this.economicStructureCommandContext(), command),
      handleChooseTechCommand: (command) => handleChooseTechCommandImpl(this.progressionCommandContext(), command),
      handleChooseDomainCommand: (command) => handleChooseDomainCommandImpl(this.progressionCommandContext(), command),
      handleSetConverterStructureEnabledCommand: (command) => handleSetConverterStructureEnabledCommandImpl(this.economicStructureCommandContext(), command),
      handleSetConverterStructureModeCommand: (command) => handleSetConverterStructureModeCommandImpl(this.economicStructureCommandContext(), command),
      handleRevealEmpireCommand: (command) => handleRevealEmpireCommandImpl(this.abilityCommandContext(), command),
      handleRevealEmpireStatsCommand: (command) => handleRevealEmpireStatsCommandImpl(this.abilityCommandContext(), command),
      handleSurveySweepCommand: (command) => handleSurveySweepCommandImpl(this.abilityCommandContext(), command),
      handleAetherLanceCommand: (command) => handleAetherLanceCommandImpl(this.abilityCommandContext(), command),
      handleCastAetherBridgeCommand: (command) => handleCastAetherBridgeCommandImpl(this.abilityCommandContext(), command),
      handleCastAetherWallCommand: (command) => handleCastAetherWallCommandImpl(this.abilityCommandContext(), command),
      handleSiphonTileCommand: (command) => handleSiphonTileCommandImpl(this.abilityCommandContext(), command),
      handlePurgeSiphonCommand: (command) => handlePurgeSiphonCommandImpl(this.abilityCommandContext(), command),
      handleCreateMountainCommand: (command) => handleCreateMountainCommandImpl(this.mapCommandContext(), command),
      handleRemoveMountainCommand: (command) => handleRemoveMountainCommandImpl(this.mapCommandContext(), command),
      handleAirportBombardCommand: (command) => handleAirportBombardCommandImpl(this.mapCommandContext(), command),
      handleImperialExchangeLevyCommand: (command) => handleImperialExchangeLevyCommandImpl(this.mapCommandContext(), command),
      handleWorldEngineStrikeCommand: (command) => handleWorldEngineStrikeCommandImpl(this.mapCommandContext(), command),
      handleAegisLockCommand: (command) => handleAegisLockCommandImpl(this.mapCommandContext(), command),
      handleAstralDockLaunchCommand: (command) => handleAstralDockLaunchCommandImpl(this.mapCommandContext(), command),
      handleTitaniumLevyMusterCommand: (command) => handleTitaniumLevyMusterCommandImpl(this.mapCommandContext(), command),
      handleActivateImperialWardCommand: (command) => handleActivateImperialWardCommandImpl(this.mapCommandContext(), command),
      handleUpgradeTownTierCommand: (command) => handleUpgradeTownTierCommandImpl(this.progressionCommandContext(), command),
      handleCollectShardCommand: (command) => handleCollectShardCommandImpl(this.progressionCommandContext(), command),
      handleSyncAllianceCommand: (command) => this.handleSyncAllianceCommand(command), handleSyncTruceCommand: (command) => handleSyncTruceCommandImpl(this.mapCommandContext(), command),
      handleFrontierCommand: (command, actionType) => this.handleFrontierCommand(command, actionType),
      handleDevQueueEnqueueCommand: (command) => handleDevQueueEnqueueCommandImpl(this.devQueueCommandContext(), command),
      handleDevQueueCancelCommand: (command) => handleDevQueueCancelCommandImpl(this.devQueueCommandContext(), command),
      handleDevQueueMoveToFrontCommand: (command) => handleDevQueueMoveToFrontCommandImpl(this.devQueueCommandContext(), command),
      handleWaypointEnqueueCommand: (command) => handleWaypointEnqueueCommandImpl(this.waypointQueueCommandContext(), command),
      handleWaypointCancelCommand: (command) => handleWaypointCancelCommandImpl(this.waypointQueueCommandContext(), command),
      handleWaypointCancelAllCommand: (command) => handleWaypointCancelAllCommandImpl(this.waypointQueueCommandContext(), command),
      handleClaimContinuationSetCommand: (command) => handleClaimContinuationSetCommandImpl(this.claimContinuationCommandContext(), command)
    };
  }

  private queueCommandForProcessing(command: CommandEnvelope): void {
    this.updatePlayerLastActive(command.playerId, this.now());
    const lane = laneForCommand(command);
    this.enqueueJob(
      lane,
      // Flush after dispatch (collapses several anchor activations into at
      // most one REACH_UPDATE per player), wrapped in try/finally so a
      // throwing handler still flushes what it mutated before throwing.
      () => { try { dispatchRuntimeCommand(command, this.commandDispatchHandlers()); } finally { this.flushReachUpdatesForCommand(`reach-update:${command.commandId}`); } },
      command.type,
      commandScheduling(command),
      command.commandId
    );
  }

  seedLiveBarbarians(targetCount: number, commandId?: string): SeedLiveBarbariansResult {
    return seedLiveBarbariansImpl({
      targetCount,
      commandId: commandId ?? `ops-seed-barbs:${this.now()}`,
      players: this.state.players,
      tiles: this.state.tiles,
      pendingSettlementsByTile: this.pendingSettlementsByTile,
      locksByTile: this.state.locksByTile,
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
