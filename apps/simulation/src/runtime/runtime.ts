import { settleEnvoyDependents, settleEnvoyDependentsBeforeTileChange } from "./runtime-manpower-economy.js";
import { afcEnvoyIncomeInSnapshot } from "../afc-specializations/afc-coalition.js";
import { settleBootstrapManpower } from "./runtime-bootstrap-manpower.js";
import { afcCampaignGuardCounters, afcCampaignStateGauges } from "../afc-specializations/afc-diagnostics.js";
import { oracleDetectionDiagnostics } from "../afc-specializations/afc-oracle-detections.js";
import { buildPlayerCombatSummary } from "../afc-specializations/afc-player-combat-facts.js";
import type { PlayerCombatSummary } from "@border-empires/sim-protocol";
import { withAfcFortFacts, refreshAfcFortFacts } from "../afc-specializations/afc-fort-facts.js";
import { restoreSameOwnerSummaryOrder } from "../runtime-same-owner-summary-order.js";
import { AfcOracleDetectionTracker } from "../afc-specializations/afc-oracle-detections.js";
import { handleAfcActiveCommand } from "../afc-specializations/afc-active-commands.js";
import { expandTileDeltasWithLinkedDocks } from "../runtime-linked-dock-deltas.js";
import { planDirectFrontierCommand } from "../ai/direct-frontier-planner.js";
import { buildAiTacticalView, type AiTacticalView } from "../ai/ai-tactical-view.js";
import { resolvePendingSettlement as resolvePendingSettlementImpl, type SettlementResolutionInput } from "./runtime-settlement-resolution.js";
import { startSettlementProcess as startSettlementProcessImpl, type SettlementStartInput } from "./runtime-settlement-start.js";
import { createIslandNamesTicker } from "../island-names/island-names-ticker.js";
import { EventEmitter } from "node:events";
import type { CommandEnvelope, ManpowerBreakdown, SimulationEvent } from "@border-empires/sim-protocol";
import type { PlayerRespawnNotice, PlayerRespawnReasonCode } from "@border-empires/shared";
import {
  type PendingRespawnNoticeContext
} from "../player-respawn-notice.js";
import { CommandDeltaBuffer } from "../runtime-delta-buffer.js";
import { createRuntimeActivityLogs } from "../activity-dashboard/runtime-activity-logs.js";
import { normalizeLegacyBuildCommand } from "./normalize-legacy-build-command.js";
import { createOnboardingMilestoneTracker } from "../onboarding-milestones/onboarding-milestones.js";
import type { PersistedActivityLogs } from "../activity-dashboard/activity-log-persistence.js";
import { addStrategicResource as addStrategicResourceImpl, spendStrategicResource as spendStrategicResourceImpl, strategicResourceAmount as strategicResourceAmountImpl } from "../runtime-strategic-resource-ledger.js";
import { RuntimeState } from "./runtime-state.js";
import { reachBorderOwnerAt as reachBorderOwnerAtImpl, grantAetherBridgeReach as grantAetherBridgeReachImpl, tickAetherBridgeReachExpiry as tickAetherBridgeReachExpiryImpl } from "../runtime-aether-bridge-reach.js";
import { createReachUpdateState, markReachForResend, type ReachUpdateState } from "../runtime-reach-update/runtime-reach-update.js";
import { seedReachBorderFromAnchors } from "../runtime-reach-update/runtime-reach-border-seed.js";
import { applyReachAutoClaim, applyUnsettleDowngrade, createReachBorderApplyContext, type ReachBorderApplyContext } from "../runtime-reach-update/runtime-reach-border-apply.js"; import { createReachChangedTilesDirtyState, type ReachChangedTilesDirtyState } from "../runtime-reach-update/runtime-reach-contested-tiles.js"; import { flushAllReachUpdates } from "../runtime-reach-update/runtime-reach-flush-all.js";
import { yieldViewEconomyContext as yieldViewEconomyContextImpl } from "./runtime-yield-view-economy-context.js";
import { clearLegacyOutOfReachDecayStamps, isTileBeyondReach as isTileBeyondReachImpl } from "../runtime-reach-update/runtime-reach-out-of-reach.js"; import { applyReachAnchorActivationEffects, applyReachAnchorDeactivationEffects, syncReachVision, type ReachAnchorLifecycleDeps } from "../runtime-reach-update/runtime-reach-anchor-lifecycle.js"; import { autoSettleCapturedAnchor as autoSettleCapturedAnchorImpl, canAutoSettleCapturedAnchor as canAutoSettleCapturedAnchorImpl, type AutoSettleCapturedAnchorDeps } from "../runtime-out-of-reach-auto-settle/runtime-out-of-reach-auto-settle.js";
import { createFrontierAutoHealQueue, enqueueFrontierAutoHeal, rebuildFrontierAutoHealQueue, tickFrontierAutoHeal as tickFrontierAutoHealImpl, type FrontierAutoHealQueue } from "../runtime-frontier-auto-heal/runtime-frontier-auto-heal.js";
import {
  withAfcReachRadii,
  gatherReachAnchors as gatherReachAnchorsImpl,
  newlyActivatedReachAnchors as newlyActivatedReachAnchorsImpl,
  newlyDeactivatedReachAnchors as newlyDeactivatedReachAnchorsImpl,
  isPlayerTileInReach as isPlayerTileInReachImpl,
  reachTileCountForPlayer as reachTileCountForPlayerImpl,
  reachTileKeysForPlayer as reachTileKeysForPlayerImpl
} from "./runtime-reach-anchors.js";
import {
  appendPlayerEventLogEntry,
  PASSIVE_INCOME_INACTIVITY_CAP_MS,
  type DomainPlayer,
  type DomainTileState,
  type FrontierCommandType
} from "@border-empires/game-domain";
import {
  BREAKTHROUGH_ENABLED,
  EMPIRE_INTEGRITY_ENABLED,
  empireIntegrity,
  integrityGrowthMult,
  DEVELOPMENT_PROCESS_LIMIT,
  GALACTIC_WONDER_MANPOWER_REGEN_BONUS_PER_MINUTE, GALACTIC_WONDER_VISION_RADIUS_BONUS,
  isAutoSettleAllowed, normalizeAutoSettlePrefs, settleIgnoresReach,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type Terrain,
  type BuildableStructureType,
  type EconomicStructureType,
  type MonumentalStructureType,
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
} from "../dock-network/dock-network.js";
import {
  isDockCrossingTarget as isDockCrossingTargetImpl,
  isAetherBridgeCrossingTarget as isAetherBridgeCrossingTargetImpl,
  resolveOwnedDockOriginForCrossing as resolveOwnedDockOriginForCrossingImpl,
  findOwnedAetherBridgeOriginForCrossing as findOwnedAetherBridgeOriginForCrossingImpl,
  type DockCrossingOrigin
} from "./runtime-crossing.js";
import { forEachFrontierNeighbor } from "../frontier-topology.js";
import {
  isSettledTownAnchor,
  TOWN_AUTO_FRONTIER_RADIUS
} from "../territory-automation/territory-automation.js";
import type { PlayerDefensibilityMetrics } from "../player-defensibility-metrics.js";
import {
  activeDevelopmentProcessCountForSummary,
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
import { type ConnectedTownNetworkEntry } from "../economy-network/economy-network.js";
import { activeMonumentOnTile, refreshMonumentOwnerIndexForTile } from "../monument-uniqueness.js";
import {
  cachedManpowerStructureBonusForPlayer as cachedManpowerStructureBonusForPlayerImpl,
  type ManpowerStructureBonus
} from "../runtime-manpower-structure-bonus.js";
import { createSeedWorld, simulationTileKey } from "../seed-state/seed-state.js";
import type { SimulationSnapshotSections } from "../snapshot-store/snapshot-store.js";
import {
  additiveEffectForPlayer,
  effectiveVisionRadiusForPlayer,
  domainGrantedResourceSlots
} from "../tech-domain-bridge/tech-domain-bridge.js";
import { slotWaiversForPlayer } from "../tech-domain-bridge/slot-waivers.js"; import { techGrantedFishFoodSlotBonus } from "../tech-domain-bridge/fish-food-slot-bonus.js";
import {
  filterTileDeltasForPlayer as filterTileDeltasForPlayerImpl,
  type TileDeltaVisibilityFilterOptions, type VisibilityAuditSample
} from "../tile-delta-visibility-filter.js";
import {
  dormantStructureDetailsFromDormancy as dormantStructureDetailsFromDormancyImpl,
  resourceSlotDemandForPlayer as resourceSlotDemandForPlayerImpl,
  resourceSlotDormantContributorsForPlayer as resourceSlotDormantContributorsForPlayerImpl,
  type DormantStructureDetail,
  type ResourceSlotDormancy,
  type ResourceSlotTotals
} from "../resource-slot-view/resource-slot-view.js"; import { mergeResourceSlotGrants } from "../resource-slot-view/resource-slot-grants-merge.js";
import { refreshResourceSlotCachesForPlayer as refreshResourceSlotCachesForPlayerImpl } from "../resource-slot-view/resource-slot-cache-refresh.js";
import { foodDormantEconomicStructureKeysFromDormancy } from "../snapshot-economy-helpers.js";
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
  mirrorCandidateKeysIntoCache,
  resetCandidateKeysFromSummary,
  type PlannerPlayerTileKeysContext,
  type PlannerPlayerTileKeysResult,
  type PlannerTileKeysCacheEntry
} from "../planner-tile-keys-cache.js";
import type { AutomationPlannerDiagnostic } from "../ai/automation-command-planner.js";
import {
  RuntimeAutomationAdvisor,
  type AutomationCommandExplanation,
  type AutomationSessionPrefix,
  type ExplainAutomationCommandOptions
} from "../ai/runtime-automation-advisor.js";
import {
  InMemorySimulationPersistence,
  type ActiveAetherBridgeView,
  type ActiveAetherWallView,
  type AetherWallDirection,
  type LockRecord,
  type LockedCombatResolution,
  type RuntimePlayer,
  type RuntimeTileYieldEconomyContext,
  type PersistenceLogStats,
  type SimulationPersistence,
  type SimulationRuntimeOptions,
  type SimulationTileWireDelta,
  type StrategicResourceKey
} from "../runtime-types.js";
import {
  applyEconomyAccrual as applyEconomyAccrualImpl,
  type RuntimeUpkeepAccrualContext
} from "../runtime-upkeep-accrual.js";
import { RuntimeJobQueue } from "../runtime-job-queue-state.js";
import { tileDeltaRevealOnly as tileDeltaRevealOnlyImpl } from "../tile-delta-reveal-only.js";
import { parseSettlePayload } from "../runtime-command-parsers.js";
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
  handleWaypointEnqueueCommand as handleWaypointEnqueueCommandImpl, tryDrainWaypointQueue as tryDrainWaypointQueueImpl,
  type RuntimeWaypointQueueCommandContext
} from "../runtime-waypoint-queue-command-handlers.js"; import { WaypointDrainScheduler, tickWaypointDrain as tickWaypointDrainImpl } from "../runtime-waypoint-drain-scheduler/runtime-waypoint-drain-scheduler.js";
import { handleClaimContinuationSetCommand as handleClaimContinuationSetCommandImpl, tryDrainClaimContinuation as tryDrainClaimContinuationImpl, tryDrainClaimContinuationBuildTail as tryDrainClaimContinuationBuildTailImpl, clearCompletedSettleEntry, claimContinuationContextFromDevQueueContext } from "../runtime-claim-continuation-command-handlers.js";
import { pendingSettlementsSnapshotForPlayer, resolveOverduePendingSettlements, scheduleRecoveredPendingSettlements as scheduleRecoveredPendingSettlementsImpl } from "../runtime-pending-settlements.js";
import {
  createDocksFromInitialState,
  createLocksFromInitialState,
  createPlayersFromRecoveredState,
  createTilesFromInitialState,
  hydrateCommandHistory,
  requeueRecoveredCommands,
  uniqueLocksByCommandId
} from "../runtime-hydration.js";
import { restoreRecoveredTownOrder, restoreTownSettledAt } from "../recovered-town-state/recovered-town-state.js";
import { TileDeltaStringifyCache } from "../tile-delta-stringify-cache/tile-delta-stringify-cache.js";
import { tileDeltaFromState as tileDeltaFromStateImpl } from "../runtime-tile-delta-from-state.js";
import { PlayerCandidateIndex } from "../player-candidate-index/player-candidate-index.js";
import { refundSettleCost, settleRejectionForActor } from "../runtime-settlement-rules.js";
import {
  applyBarbarianWalkOrMultiply as applyBarbarianWalkOrMultiplyImpl,
  applyBreachToNeighbors as applyBreachToNeighborsImpl,
  applyLockedManpowerDelta as applyLockedManpowerDeltaImpl,
  applySettledCapturePlunder as applySettledCapturePlunderImpl,
  activeFrontierLocksForPlayer as activeFrontierLocksForPlayerImpl,
  buildLockedCombatResolution as buildLockedCombatResolutionImpl,
  handleCancelCaptureCommand as handleCancelCaptureCommandImpl,
  plannerGatingLockPlayerIds as plannerGatingLockPlayerIdsImpl,
  type LockedCombatInput,
  type RuntimeCombatSupportContext
} from "../runtime-combat-support.js";
import { buildCaptureRevealTileDeltas as buildCaptureRevealTileDeltasImpl } from "../runtime-reveal-support.js";
import {
  handleWatchMusterCommand as handleWatchMusterCommandImpl,
  handleUnwatchMusterCommand as handleUnwatchMusterCommandImpl
} from "../runtime-muster-watch.js";
import { emitAutoFillForSettlement as emitAutoFillForSettlementImpl } from "../runtime-auto-fill.js";
import { applyCensusHallPopulationBonuses as applyCensusHallPopulationBonusesImpl } from "../runtime-census-hall-bonus.js";
import {
  applyManpowerRegenForPlayer as applyManpowerRegenForPlayerImpl,
  cachedDefensibilityMetrics as cachedDefensibilityMetricsImpl,
  cachedEconomySnapshot as cachedEconomySnapshotImpl,
  cachedUpkeepAccrual as cachedUpkeepAccrualImpl,
  effectiveManpowerAtForPlayer as effectiveManpowerAtForPlayerImpl,
  ensureGrossIncomeSettlementForPlayer as ensureGrossIncomeSettlementForPlayerImpl,
  estimatedIncomePerMinuteForPlayer as estimatedIncomePerMinuteForPlayerImpl,
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
  cachedTownNetworkForPlayer as cachedTownNetworkForPlayerImpl,
  rebuildTownNetworkUninstrumented as rebuildTownNetworkUninstrumentedImpl,
  neuralWorksAlreadyInNetworkForPlayer as neuralWorksAlreadyInNetworkForPlayerImpl,
  reserveLatticeAlreadyInNetworkForPlayer as reserveLatticeAlreadyInNetworkForPlayerImpl,
  hasNearbyQuartermastersOfficeForPlayer as hasNearbyQuartermastersOfficeForPlayerImpl,
  censusHallConnectedIncubationEngineBonusCountForPlayer as censusHallConnectedIncubationEngineBonusCountForPlayerImpl,
  tileYieldEconomyContextForPlayer as tileYieldEconomyContextForPlayerImpl,
  enrichTileWithTownContext as enrichTileWithTownContextImpl,
  type RuntimeTownNetworkContext
} from "./runtime-town-network.js";
import { resolveMusterSource as resolveMusterSourceImpl } from "../runtime-muster-source.js";
import {
  type RuntimeAiPlayerMetricsRow,
  type RuntimeExportState,
  type RuntimePlayerDebugSnapshot
} from "../runtime-state-export.js";
import * as wonderEffects from "../runtime-natural-wonders.js"; import {
  mapTile,
  type SnapshotTile
} from "../runtime-snapshot-sections.js";
import { barbTilesSeenByAnyPlayer } from "../runtime-barb-activation-vision.js";
import { createRuntimeBarbarianBridge, type RuntimeBarbarianBridge } from "../runtime-barbarian-planner-bridge.js";
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
  exportTilesInAreaForPlayerForRuntime,
  exportVisibleStateForPlayerAsyncForRuntime,
  exportVisibleStateForPlayerForRuntime,
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
  isTileShieldedByEnemyAegisDome as isTileShieldedByEnemyAegisDomeImpl, isTileShieldedByEnemyObservatory as isTileShieldedByEnemyObservatoryImpl,
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
import { handleAetherEmpCommand as handleAetherEmpCommandImpl } from "../runtime-aether-emp-command-handler.js";
import { handleAetherLanceCommand as handleAetherLanceCommandImpl } from "../runtime-aether-lance-command-handler.js";
import {
  handleCastAetherBridgeCommand as handleCastAetherBridgeCommandImpl,
  handleCastAetherWallCommand as handleCastAetherWallCommandImpl,
  handleRevealEmpireCommand as handleRevealEmpireCommandImpl,
  handleRevealEmpireStatsCommand as handleRevealEmpireStatsCommandImpl,
  handleSurveySweepCommand as handleSurveySweepCommandImpl,
  type RuntimeAbilityCommandContext
} from "../runtime-ability-command-handlers.js";
import { buildAbilityCommandContext } from "./runtime-ability-command-context.js";
import { handleCancelSiphonCommand as handleCancelSiphonCommandImpl, handlePurgeSiphonCommand as handlePurgeSiphonCommandImpl, handleSiphonTileCommand as handleSiphonTileCommandImpl } from "../runtime-siphon-command-handlers.js"; import { SiphonModeLifecycle } from "../siphon-mode/siphon-mode-lifecycle.js"; import { resourceSlotSupplyWithSiphonTransfer } from "../siphon-mode/siphon-slot-transfer.js"; import { stampObservatoryCooldown as stampObservatoryCooldownImpl } from "../observatory-cooldown-stamp/observatory-cooldown-stamp.js";
import { isObservatoryShielding, isTileShieldedByOwnersIndexedTowers } from "../aether-shield/aether-shield.js";
import { createAetherShieldTicker, type AetherShieldTicker } from "../aether-shield/aether-shield-tick.js";
import { handleSyncAllianceCommand as handleSyncAllianceCommandImpl } from "../runtime-alliance-sync-command.js";
import { type RuntimeMapCommandContext } from "../runtime-map-command-handlers.js";
import { buildMapCommandDispatchHandlers } from "./runtime-map-command-dispatch-handlers.js";
import { buildMapCommandContext } from "./runtime-map-command-context.js";
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
  refreshOwnedStructureCountIndexForTile as refreshOwnedStructureCountIndexForTileImpl,
  weaponsFactoryCountsFromIndex
} from "../runtime-owned-structure-index.js";
import { RuntimeEconomyCaches } from "../runtime-economy-caches/runtime-economy-caches.js";
import { createPlayerUpdateEmitter, type PlayerUpdateEmitter } from "../runtime-player-update-emitter/runtime-player-update-emitter.js";
import { runtimeLogError, runtimeLogInfo } from "../runtime-log/runtime-log.js";
import {
  assignedTownKeyForSupportTile as assignedTownKeyForSupportTileImpl,
  economicStructureForSupportedTown as economicStructureForSupportedTownImpl,
  firstAvailableTownSupportTile as firstAvailableTownSupportTileImpl,
  supportedDockKeysForTile as supportedDockKeysForTileImpl,
  supportedTownKeysForTile as supportedTownKeysForTileImpl
} from "../runtime-structure-support/runtime-structure-support.js";
import { tickPopulationGrowth as tickPopulationGrowthImpl } from "../runtime-population-growth.js"; import { tickManpowerFullAlerts as tickManpowerFullAlertsImpl } from "../runtime-manpower-full-alert.js";
import { tickOrphanedLockSweep as tickOrphanedLockSweepImpl } from "../runtime-maintenance-ticks.js";
import {
  isNeutralBeaconTile as isNeutralBeaconTileImpl,
  rebuildPlannerCandidateIndexesForPlayer as rebuildPlannerCandidateIndexesForPlayerImpl,
  refreshNeutralBeaconIndexForTile as refreshNeutralBeaconIndexForTileImpl,
  refreshPlannerCandidateIndexesAroundTileChange as refreshPlannerCandidateIndexesAroundTileChangeImpl,
  refreshPlayerCandidateIndexAnchorForTile as refreshPlayerCandidateIndexAnchorForTileImpl,
  registerFortSupportAnchor as registerFortSupportAnchorImpl
} from "../runtime-tile-index-maintenance.js";
import { RuntimeOwnerTileIndexes } from "../runtime-owner-tile-indexes/runtime-owner-tile-indexes.js";
import { RuntimeShardRain } from "../runtime-shard-rain-state.js";
import {
  activateWatchtowerAt as activateWatchtowerAtImpl,
  tickWatchtowerReveals as tickWatchtowerRevealsImpl,
  type PendingWatchtowerReveal,
  type WatchtowerRevealRuntimeInput
} from "../runtime-watchtower-reveal-tick.js"; import { activateWaystationAt as activateWaystationAtImpl, seedWaystationVisionBonus } from "../runtime-waystation-activation.js";
import type { EmpireStorageCap } from "../runtime-empire-storage.js";
import {
  emitPlayerStateUpdate as emitPlayerStateUpdateImpl,
  type RuntimePlayerStateUpdateContext
} from "../runtime-player-state-update.js";
import {
  applyPassiveIncome as applyPassiveIncomeImpl,
  applyPassiveIncomeAsync as applyPassiveIncomeAsyncImpl,
  welcomeBackSummaryForPlayer,
  type RuntimePassiveIncomeContext
} from "../runtime-passive-income.js";
import { tickTerritoryAutomation as tickTerritoryAutomationImpl } from "../runtime-territory-automation-tick/runtime-territory-automation-tick.js";
import { createTerritoryAutomationCommandIdGenerator } from "../runtime-territory-automation-tick/territory-automation-command-id.js";
import { dormantOwnedActivatables } from "../runtime-territory-automation-tick/dormant-claim-sweep.js";
import {
  seedEligibleFrontierQueueForOwner as seedEligibleFrontierQueueForOwnerImpl,
  seedGrownTownSupportRingForTownTile as seedGrownTownSupportRingForTownTileImpl,
  type EligibleFrontierByOwner,
  type GrownTownSupportRingByOwner
} from "../runtime-auto-settle-eligibility/runtime-auto-settle-eligibility.js";
import {
  buildAutoSettleEligibilityRuntime,
  type AutoSettleEligibilityRuntime
} from "../runtime-auto-settle-eligibility/runtime-auto-settle-eligibility-context.js";
import { createMusterTickRunner } from "../runtime-muster-tick/runtime-muster-tick.js";
import type { MusterAdvanceCooldowns, MusterTickContext } from "../runtime-muster-tick/runtime-muster-tick.js";
import { buildMusterTickContext } from "../runtime-muster-tick/runtime-muster-tick-context.js";
import { reconcileTownVisionBonus, seedTownVisionBonus } from "../runtime-town-vision/runtime-town-vision.js";
import { reconcileOutpostVisionBonus, resyncPlayerOutpostVisionBonuses, seedOutpostVisionBonus } from "../runtime-outpost-vision.js";
import { reconcileObservatoryVisionBonus, resyncPlayerObservatoryVisionBonuses, seedObservatoryVisionBonus } from "../runtime-observatory-vision.js";
import { createStructureVisionWiring } from "../runtime-structure-vision-wiring.js";
import { StructureVisionDormancyTracker } from "../structure-vision-dormancy-tracker.js";
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
import { handleSetObservatoryEnabledCommand as handleSetObservatoryEnabledCommandImpl } from "../runtime-observatory-toggle/runtime-observatory-toggle.js";
import { isStructureDormantForTile, type DormancyStructureField } from "../structure-dormancy-check/structure-dormancy-check.js";
import {
  completeStructureRemoval as completeStructureRemovalImpl,
  handleCancelFortBuildCommand as handleCancelFortBuildCommandImpl,
  handleCancelSiegeBatteryBuildCommand as handleCancelSiegeBatteryBuildCommandImpl,
  handleCancelStructureBuildCommand as handleCancelStructureBuildCommandImpl,
  handleClearMusterCommand as handleClearMusterCommandImpl,
  handleRemoveStructureCommand as handleRemoveStructureCommandImpl,
  handleSetMusterCommand as handleSetMusterCommandImpl
} from "../runtime-structure-lifecycle-command-handlers.js";
import { handleUpgradeMusterCapCommand as handleUpgradeMusterCapCommandImpl } from "../runtime-muster-cap-upgrade-command.js";
import {
  applyEncirclement as applyEncirclementImpl,
  applyEncirclementForExpand as applyEncirclementForExpandImpl,
  type RuntimeEncirclementApplicationContext
} from "../runtime-encirclement-application.js";
import {
  resolveLock as resolveLockImpl,
  type RuntimeLockResolutionContext
} from "../runtime-lock-resolution.js";
import {
  consumeOriginMuster as consumeOriginMusterImpl,
  requiredMusterForTarget as requiredMusterForTargetImpl,
  type RuntimeCombatResolutionContext
} from "../runtime-combat-resolution.js";
import { handleFrontierCommandImpl, type FrontierCommandResult, type RuntimeFrontierCommandContext } from "../runtime-frontier-command.js";
import { createStrandedFrontierCleanup, handleCheckStrandedRegionCommand as handleCheckStrandedRegionCommandImpl } from "../stranded-frontier/stranded-frontier-cleanup.js";
import {
  handleRushBuyCommandImpl,
  type RuntimeRushBuyCommandContext
} from "../runtime-rush-buy-command.js";
import { buildRushBuyCommandContext } from "./runtime-rush-buy-command-context.js";
import {
  seedLiveBarbarians as seedLiveBarbariansImpl,
  type SeedLiveBarbariansResult
} from "../runtime-live-barbarians.js"; import { humanPlayerCountOf, isAlliedOrTruced } from "../runtime-player-factory.js";
import {
  ensurePlayerHasSpawnTerritory as ensurePlayerHasSpawnTerritoryImpl, ensurePlayerHasAfc as ensurePlayerHasAfcImpl,
  consumeRespawnNotice as consumeRespawnNoticeImpl, preparePlayerRespawnNotice as preparePlayerRespawnNoticeImpl,
  respawnIfEliminated as respawnIfEliminatedImpl,
  respawnPlayerOnUnownedLand as respawnPlayerOnUnownedLandImpl,
  type RallySpawnOutcome, type RuntimeRespawnContext
} from "../runtime-respawn-helpers.js";
import { SpawnPlacementIndex } from "../spawn-placement/spawn-placement-index.js";
import { buildRelocatedSettlementTile } from "../runtime-relocated-settlement-tile.js";
import { appendTownLostEventLogIfApplicable, buildOwnershipChangeSample } from "./runtime-ownership-change-sample.js";
import { handleDuplicatePendingSettlement } from "../runtime-settle-duplicate.js";
import { holdDevelopmentForAttack, releaseDevelopmentHold, type AttackDevelopmentHoldContext } from "../attack-development-hold/attack-development-hold.js";
import { installAttackReleaseHandler } from "./runtime-attack-release-handler.js";
import { rescheduleRecoveredStructureTimers } from "../structure-timer-recovery/structure-timer-recovery.js";
import { updateTileSettledAt, withoutStaleCaptureHold } from "../runtime-tile-write-rules/runtime-tile-write-rules.js";
import { ORPHAN_LOCK_GRACE_MS, RESPAWN_MINIMUM_GOLD } from "./runtime-lifecycle-constants.js";

export type { VisibilityAuditSample };
// How long an AI player's economy/defensibility/auto-settlement caches may stay dirty-but-served before the next read pays a real rebuild (2026-07-29 login-stall investigation) — well under both consumers' own tick cadence (passive income 15s, population growth 60s), so never gameplay-visible; just stops a continuously-settling AI from paying a fresh O(settled-tiles) rebuild on nearly every command. Defined in runtime-economy.ts (imported above) so both files share one value.

// Process-global monotonically increasing counter for unique runtime epochs and
// fresh terrain mutation numbers. Consumers cache derived terrain structures by
// epoch; cache misses are O(world tiles) but happen only when terrain changes.
let nextTerrainEpoch = 1;

export class SimulationRuntime {
  private readonly events = new EventEmitter();
  private terrainEpoch = nextTerrainEpoch++;
  private readonly persistence: SimulationPersistence;
  private readonly strandedFrontier = createStrandedFrontierCleanup(() => this.encirclementApplicationContext());
  private readonly now: () => number;
  private readonly state: RuntimeState;
  private readonly siphonModeLifecycle: SiphonModeLifecycle; // Siphon siphon-mode end rules — siphon-mode/siphon-mode-lifecycle.ts
  private readonly aetherShieldTicker: AetherShieldTicker; // Siphon tower-comes-back-online sweep + AETHER_SHIELDS push — aether-shield/aether-shield-tick.ts
  // Non-snapshot rolling history for public and personal activity views.
  private readonly activityLogs = createRuntimeActivityLogs(() => this.now());
  // Human-player TEN_TILES / FIRST_CONTACT reports for the gateway's player funnel (onboarding-milestones.ts).
  private readonly onboardingMilestones = createOnboardingMilestoneTracker({ now: () => this.now(), players: () => this.state.players, tiles: () => this.state.tiles, territoryTileKeys: (playerId) => this.summaryForPlayer(playerId).territoryTileKeys, emitEvent: (event) => this.emitEvent(event) });
  private readonly playerSummaries = new Map<string, PlayerRuntimeSummary>();
  private readonly plannerPlayerTileCollectionVersionByPlayer = new Map<string, number>();
  private readonly visionFootprintTable = createVisionFootprintTableForRuntime(WORLD_WIDTH, WORLD_HEIGHT, () => this.state.tiles, () => this.terrainEpoch); // see vision-footprint-table.ts
  private readonly visionTransitions = new VisionTransitionAccumulator(); // fog-of-war vision edges; see runtime-vision-transition.ts
  // Watchtower "flicker" reveals in flight — see runtime-watchtower-reveal-tick.ts. Self-draining, bounded, never persisted.
  private readonly pendingWatchtowerReveals: PendingWatchtowerReveal[] = [];
  private readonly plannerPlayerTopologyVersionByPlayer = new Map<string, number>();
  private readonly plannerPlayerTopologyDirtyTilesByPlayer = new Map<string, Set<string>>();
  // The AI planner's per-player memory and planning entry point; see ai/runtime-automation-advisor.ts.
  private readonly automationAdvisor: RuntimeAutomationAdvisor = (() => {
    const runtime = this;
    return new RuntimeAutomationAdvisor({
      get state() { return runtime.state; },
      now: () => runtime.now(),
      summaryForPlayer: (playerId) => runtime.summaryForPlayer(playerId),
      respawnIfEliminated: (playerId, commandId) => runtime.respawnIfEliminated(playerId, commandId),
      tileKeySetToTiles: (keys) => runtime.tileKeySetToTiles(keys),
      estimatedIncomePerMinuteForPlayer: (playerId) => runtime.estimatedIncomePerMinuteForPlayer(playerId),
      ownedStructureCountsForPlayer: (playerId) => runtime.ownedStructureCountsForPlayer(playerId),
      isPlayerTileInReach: (playerId, x, y) => runtime.isPlayerTileInReach(playerId, x, y),
      resourceSlotSupplyForPlayer: (playerId) => runtime.resourceSlotSupplyForPlayer(playerId),
      resourceSlotDemandForPlayer: (playerId) => runtime.resourceSlotDemandForPlayer(playerId),
      resourceSlotDormancyForPlayer: (playerId) => runtime.resourceSlotDormancyForPlayer(playerId),
      playerManpowerCap: (player) => runtime.playerManpowerCap(player),
      playerManpowerRegenPerMinute: (player) => runtime.playerManpowerRegenPerMinute(player),
      afcDetectedFlagsForPlayer: id => runtime.oracleDetections.cachedFlagsFor(id),
      tacticalViewForPlayer: (playerId, focusKeys) => runtime.tacticalViewForPlayer(playerId, focusKeys)
    });
  })();
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
  // Per-owner frontier, anchor and structure tile indexes; see runtime-owner-tile-indexes.ts.
  private readonly ownerIndexes = new RuntimeOwnerTileIndexes();
  readonly manpowerLossByTileKey = new Map<string, number>();
  private readonly deltaBuffer = new CommandDeltaBuffer();
  // O(1) mirror of monumentClaimOwnerId (§16) — see
  // refreshMonumentOwnerIndexForTile in monument-uniqueness.ts for why.
  private readonly activeMonumentOwnerByType = new Map<MonumentalStructureType, { ownerId: string; tileKey: string }>();
  // Map-wide lookups backing chooseLegacySpawnPlacement — see
  // SpawnPlacementIndex for why they are indexed rather than rescanned.
  private readonly spawnPlacementIndex = new SpawnPlacementIndex();
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
    () => this.musterTickContext(),
    () => this.ownerIndexes.musterTilesByOwner,
    () => this.watchedMusterTileByPlayer
  );
  private readonly onMusterRemoteAttack: (() => void) | undefined;
  private readonly onMusterRemoteBlocked: (() => void) | undefined;
  private readonly onMusterRemoteBlockedBarbarian: (() => void) | undefined;
  private readonly onAutoFillTiles: ((count: number) => void) | undefined;
  private readonly onUpkeepNettedWhileIncomePaused: ((playerId: string) => void) | undefined;
  private readonly onAuthRecoveryRespawn: (() => void) | undefined;
  private readonly onAuthRecoveryRespawnGuarded: (() => void) | undefined;
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
  private readonly ownedStructureCountByPlayerByType = new Map<string, Map<BuildableStructureType, number>>();
  private readonly barbarianTileProgress = new Map<string, number>();
  private readonly abilityCooldowns = new Map<string, Map<string, number>>();
  private pendingImperialWard: { playerId: string; charges: number } | undefined; /** v0 Wonder-style starting bonus (§5, §12) for the last season's Planet winner — mirrors pendingImperialWard's lifecycle. */ private pendingGalacticWonderBonus: { playerId: string } | undefined;
  /** Perf-only auto-fill scan cache — see AUTO_FILL_SCAN_COOLDOWN_MS in runtime-auto-fill.ts. */ private readonly autoFillOriginCooldownUntil = new Map<string, number>();
  private readonly lastIncomeTickAtMsByPlayer = new Map<string, number>();
  private readonly lastActiveAtMsByPlayer = new Map<string, number>();
  private readonly fortPatrolGraceUntilByTile = new Map<string, number>();
  // Epoch ms when each tile last transitioned into SETTLED ownership. Stamped
  // in replaceTileState; read by resource-slot dormancy (newest food consumer
  // sleeps first) and reach anchors. Town stamps survive restarts via the
  // snapshot (recovered-town-state.ts); other tiles' stamps are not persisted.
  private readonly tileSettledAtByKey = new Map<string, number>();
  // Fixed-border reach (packages/shared/src/reach/reach.ts): the persistent
  // tileKey -> owning playerId border, maintained incrementally via
  // grantAnchorToBorder as reach anchors activate (see
  // newlyActivatedReachAnchors / applyReachAnchorActivation in
  // replaceTileState). Sticky by design — deactivating an anchor never
  // shrinks this map by itself; it only changes what's available to defend
  // a tile the next time a rival anchor contests it.
  private reachBorder: Map<string, string> = new Map();
  // ISLAND_NAMES push (island-names/island-names-ticker.ts); derived, never snapshotted.
  private readonly islandNamesTicker = createIslandNamesTicker({
    tiles: () => this.state.tiles, players: () => this.state.players,
    isPlayerSubscribed: (playerId) => this.isPlayerSubscribed?.(playerId) ?? false, emitPlayerMessage: (command, payload) => this.emitPlayerMessage(command, payload)
  });
  // Change-driven REACH_UPDATE push bookkeeping — see runtime-reach-update.ts.
  private readonly reachUpdateState: ReachUpdateState = createReachUpdateState(); private readonly reachContestedDirtyState: ReachChangedTilesDirtyState = createReachChangedTilesDirtyState(); // changed-reach-tile TILE_DELTA_BATCH dirty set, see runtime-reach-contested-tiles.ts
  private frontierAutoHealQueue: FrontierAutoHealQueue = createFrontierAutoHealQueue(); // deadline-ordered; derived state, rebuilt at hydration, never snapshotted -- see runtime-frontier-auto-heal.ts
  private readonly isLandTileQuery = (x: number, y: number): boolean => { const t = this.state.tiles.get(simulationTileKey(x, y)); return t ? t.terrain === "LAND" : true; }; // land-gates reach anchors, see ReachAnchor.crossesWater
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
  // Derived per-player economy caches and their AI coalescing; see runtime-economy-caches.ts.
  private readonly oracleDetections = new AfcOracleDetectionTracker({
    players: () => this.state.players, tiles: () => this.state.tiles,
    flagsByOwner: () => this.ownerIndexes.musterTilesByOwner, towersByOwner: () => this.ownerIndexes.activeObservatoriesByOwner,
    now: () => this.now(), isTowerDormant: (id, key) => this.isStructureDormant(id, key, "observatory"),
    emit: (playerId, flags) => this.emitPlayerMessage({ commandId: `afc-signals:${playerId}`, playerId }, { type: "AFC_FLAG_DETECTIONS", flags }),
    scheduleSoon: (task) => this.scheduleAfter(0, task)
  });
  private readonly economyCaches = new RuntimeEconomyCaches({
    beforeDockPartnerChange: id => { const player = this.state.players.get(id); if (player) this.applyEconomyAccrual(player, this.now()); },
    dockPartnerOwners: (key) => (this.state.dockLinksByDockTileKey.get(key) ?? []).flatMap(partnerKey => { const owner = this.state.tiles.get(partnerKey)?.ownerId; return owner ? [owner] : []; }),
    now: () => this.now(),
    isAiPlayer: (playerId) => this.state.players.get(playerId)?.isAi === true
  });
  // Counts recovered players whose persisted manpowerCapSnapshot disagreed
  // with what boot hydration computed once this.state.tiles and every
  // structure-by-owner index (ancillaryDepotTilesByOwner etc.) were fully
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
  private manpowerReady = false;
  private readonly wonderCacheByPlayer = new Map<string, Set<string>>();
  // Event-driven auto-settle eligibility, replacing AutoSettlementQueueCache
  // -- see runtime-auto-settle-eligibility.ts's doc comment. Neither map is
  // snapshotted: like frontierTilesByOwner, both are re-derivable from tile
  // state and cold-rebuilt at boot (below).
  private readonly eligibleFrontierByOwner: EligibleFrontierByOwner = new Map<string, Set<string>>();
  private readonly grownTownSupportRingByOwner: GrownTownSupportRingByOwner = new Map<string, Map<string, number>>();
  private readonly pendingRespawnNoticeByPlayerId = new Map<string, PendingRespawnNoticeContext>();
  private readonly lastRespawnNoticeByPlayerId = new Map<string, PlayerRespawnNotice>();
  private readonly revealTargetsByPlayer = new Map<string, Set<string>>();
  private readonly activeAetherBridgesByPlayer = new Map<string, ActiveAetherBridgeView[]>();
  private readonly activeAetherWallsByPlayer = new Map<string, ActiveAetherWallView[]>(); private readonly pendingAetherBridgeReachExpiry = new Map<string, { anchor: ReachAnchor; endsAt: number }>();
  private readonly pendingSettlementsByTile = new Map<string, PendingSettlementRecord>();
  private readonly jobQueue: RuntimeJobQueue;
  private readonly replayCache: RuntimeReplayCache;
  private readonly shardRain: RuntimeShardRain = (() => {
    const runtime = this;
    return new RuntimeShardRain({
      get state() { return runtime.state; },
      now: () => runtime.now(),
      replaceTileState: (tileKey, tile) => runtime.replaceTileState(tileKey, tile),
      emitEvent: (event) => runtime.emitEvent(event),
      tileDeltaFromState: (tile) => runtime.tileDeltaFromState(tile)
    });
  })();
  private readonly nextTerritoryAutomationCommandId = createTerritoryAutomationCommandIdGenerator();
  private dormantClaimSweepDone = false;
  private readonly waypointDrainScheduler = new WaypointDrainScheduler({ isPlayerSubscribed: (playerId) => this.isPlayerSubscribed?.(playerId) ?? false, now: () => this.now() });
  private readonly scheduleAfter: (delayMs: number, task: () => void) => void;
  private scheduledTasksFrozen = false;
  private readonly playerUpdateEmitter: PlayerUpdateEmitter;
  private readonly commandTrace: ((sample: Record<string, unknown>) => void) | undefined;
  private readonly onOwnershipChange: SimulationRuntimeOptions["onOwnershipChange"]; private readonly isPlayerSubscribed: SimulationRuntimeOptions["isPlayerSubscribed"]; private readonly alertedManpowerFullPlayerIds = new Set<string>();
  private readonly onVisibilityAudit: ((sample: VisibilityAuditSample) => void) | undefined;
  private readonly trackSyncMainThreadTask: SimulationRuntimeOptions["trackSyncMainThreadTask"];
  private readonly onCaptureRevealBuilt:
    | ((sample: { commandId: string; playerId: string; tileCount: number; durationMs: number }) => void)
    | undefined;
  private readonly onShardCollected: (() => void) | undefined;
  private readonly tileDeltaStringifyCache = new TileDeltaStringifyCache();
  private readonly playerCandidateIndex = new PlayerCandidateIndex();

  private readonly afcUpgradeRuleset: "afc-v1" | undefined;

  constructor(options: SimulationRuntimeOptions = {}) {
    this.afcUpgradeRuleset = options.initialState?.season?.afcUpgradeRuleset;
    const seedWorld = options.initialPlayers && options.seedTiles ? undefined : createSeedWorld(options.seedProfile);
    this.now = options.now ?? (() => Date.now());
    this.persistence = options.persistence ?? new InMemorySimulationPersistence();
    this.replayCache = new RuntimeReplayCache(
      Math.max(0, options.maxTerminalCommandReplayHistory ?? DEFAULT_MAX_TERMINAL_COMMAND_REPLAY_HISTORY),
      Math.max(0, options.maxPlayerSeqReplayEntries ?? DEFAULT_MAX_PLAYER_SEQ_REPLAY_ENTRIES)
    );
    // scheduleAfter(0, ...) previously used setTimeout(0) (Timers phase, before
    // Check-phase setImmediate snapshot-build yields), so every yield ate a
    // ~200ms AI drain callback first — 22+s login stalls. Fix: setImmediate for
    // delay=0 lands drains in the same Check phase, but registered AFTER
    // snapshot yields re-arm theirs, so yields always run ahead of drains next
    // iteration (~22s → ~500ms). Real-delay timers still use setTimeout.
    const scheduleAfter = options.scheduleAfter ?? ((delayMs, task) =>
      delayMs === 0 ? void setImmediate(task) : void setTimeout(task, delayMs)
    );
    this.scheduleAfter = (delayMs, task) => scheduleAfter(delayMs, () => { if (!this.scheduledTasksFrozen) task(); });
    this.jobQueue = new RuntimeJobQueue({
      backgroundBatchSize: Math.max(1, options.backgroundBatchSize ?? 1),
      now: () => this.now(),
      scheduleSoon: options.scheduleSoon ?? ((task) => queueMicrotask(task)),
      scheduleAfter: this.scheduleAfter,
      shouldPauseBackground: options.shouldPauseBackground,
      wrapJobRun: options.wrapJobRun,
      onQueueDrain: options.onQueueDrain,
      onJobApplied: options.onJobApplied
    });
    this.onMusterRemoteAttack = options.onMusterRemoteAttack;
    this.onMusterRemoteBlocked = options.onMusterRemoteBlocked;
    this.onMusterRemoteBlockedBarbarian = options.onMusterRemoteBlockedBarbarian;
    this.playerUpdateEmitter = createPlayerUpdateEmitter({
      windowMs: options.playerUpdateCoalesceMs ?? 0,
      now: () => this.now(),
      scheduleAfter: (delayMs, task) => this.scheduleAfter(delayMs, task),
      emit: (command, playerId) => emitPlayerStateUpdateImpl(this.playerStateUpdateContext(), command, playerId),
      afterEmit: (playerId) => this.flushOutpostVisionDormancyResync(playerId),
      trackSync: options.trackSyncMainThreadTask,
      onError: (error, playerId) => runtimeLogError({ err: error, playerId }, "coalesced PLAYER_UPDATE emit failed")
    });
    this.onAutoFillTiles = options.onAutoFillTiles;
    this.onUpkeepNettedWhileIncomePaused = options.onUpkeepNettedWhileIncomePaused;
    this.onAuthRecoveryRespawn = options.onAuthRecoveryRespawn;
    this.onAuthRecoveryRespawnGuarded = options.onAuthRecoveryRespawnGuarded;
    this.commandTrace = options.commandTrace;
    this.onOwnershipChange = options.onOwnershipChange; this.isPlayerSubscribed = options.isPlayerSubscribed;
    this.onVisibilityAudit = options.onVisibilityAudit;
    this.trackSyncMainThreadTask = options.trackSyncMainThreadTask;
    this.onCaptureRevealBuilt = options.onCaptureRevealBuilt;
    this.onShardCollected = options.onShardCollected;
    this.pendingImperialWard = options.pendingImperialWard; this.pendingGalacticWonderBonus = options.pendingGalacticWonderBonus;
    const initDocks = createDocksFromInitialState(options.initialState, options.seedDocks ?? seedWorld?.docks ?? [], options.dockRouteBackfillReader);
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
    if (this.afcUpgradeRuleset) for (const player of this.state.players.values()) player.afcUpgradeRuleset = this.afcUpgradeRuleset;
    this.siphonModeLifecycle = new SiphonModeLifecycle({ tiles: this.state.tiles, now: () => this.now(), replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId), tileDeltaFromState: (tile) => this.tileDeltaFromState(tile), emitEvent: (event) => this.emitEvent(event), emitPlayerStateUpdate: (command) => this.emitPlayerStateUpdate(command),
      isObservatoryShielding: (tile) => this.isObservatoryShieldingNow(tile),
      isTileShieldedByOwner: (ownerId, x, y) =>
        isTileShieldedByOwnersIndexedTowers(this.state.tiles, this.ownerIndexes.activeObservatoriesByOwner.get(ownerId) ?? [], (tower) => this.isObservatoryShieldingNow(tower), ownerId, x, y)
    });
    this.aetherShieldTicker = createAetherShieldTicker({
      tiles: () => this.state.tiles,
      activeObservatoriesByOwner: () => this.ownerIndexes.activeObservatoriesByOwner,
      players: () => this.state.players,
      isPlayerSubscribed: (playerId) => this.isPlayerSubscribed?.(playerId) ?? false,
      forEachVisibleKey: (viewerId, visit) => this.state.visibilityCoverage.forEachVisibleKey(viewerId, visit),
      hasFullVision: (playerId) => this.getAbilityCooldownUntil(playerId, ASTRAL_DOCK_LAUNCH_ACTIVE_UNTIL_KEY) > this.now(),
      isStructureDormant: (playerId, tileKey, field) => this.isStructureDormant(playerId, tileKey, field),
      sweepShieldReturns: (towerKeys, commandId) => this.siphonModeLifecycle.sweepShieldReturns(towerKeys, commandId),
      emitPlayerMessage: (command, payload) => this.emitPlayerMessage(command, payload)
    });
    for (const [key, sourceTile] of this.state.tiles) { const tile = withAfcFortFacts(sourceTile, this.state.players); this.state.tiles.set(key, tile); this.snapshotTileCache.set(key, mapTile(tile)); }
    // applyManpowerRegen (which calls playerManpowerCap ->
    // cachedManpowerStructureBonusForPlayer under the hood) used to run in a
    // loop here, immediately after this.state.players was built and BEFORE
    // this.state.tiles existed. ancillaryDepotTilesByOwner/neuralWorksTilesByOwner/
    // reserveLatticeTilesByOwner/ancillaryFactoryTilesByOwner (populated below,
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
    // Hall/Neural Works/Reserve Lattice/Ancillary Factory cap bonus as free
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
    this.economyCaches.clearTownNetworks();
    // Populate the commandId index from the just-created locksByTile map.
    for (const lock of this.state.locksByTile.values()) this.locksByCommandId.set(lock.commandId, lock);
    for (const entry of options.initialState?.playerYieldCollectionEpochByPlayer ?? []) this.lastIncomeTickAtMsByPlayer.set(entry.playerId, entry.collectedAt);
    // Indexed once: a linear find() per player would be O(players^2) at boot.
    const recoveredPlayersById = new Map((options.initialState?.players ?? []).map((player) => [player.id, player]));
    for (const playerId of this.state.players.keys()) {
      this.playerSummaries.set(playerId, createPlayerRuntimeSummaryFromRecovered(recoveredPlayersById.get(playerId)));
      this.plannerPlayerTileCollectionVersionByPlayer.set(playerId, 0);
      // Before the boot manpower settle below: dormancy (and so the cap) dates towns by these stamps.
      restoreTownSettledAt(this.tileSettledAtByKey, this.state.tiles, playerId, recoveredPlayersById.get(playerId)?.townSettledAt);
    }
    // First pass: apply tile summaries and shard-site tracking.
    // All tiles are already in this.state.tiles (createTilesFromInitialState produced a
    // complete Map), so anchor registration in the second pass below will find every
    // neighbour regardless of iteration order.
    for (const [tileKey, tile] of this.state.tiles.entries()) {
      this.applyTileToPlayerSummaries(tileKey, tile);
      this.state.visibilityCoverage.tileOwnershipChanged(undefined, tile.ownerId, tile.x, tile.y, undefined, { nextOwnershipState: tile.ownershipState });
      // Seed town +1 vision here at boot. Outpost/Observatory vision bonuses are
      // seeded in the second pass below instead — both gate on isStructureDormant,
      // which needs this owner's territoryTileKeys already fully built (this pass
      // builds it incrementally), or dormancy gets computed and cached off a
      // still-partial territory.
      seedTownVisionBonus({ players: this.state.players, coverage: this.state.visibilityCoverage }, tile);
      // Boot-time seed for grownTownSupportRingByOwner (cold-rebuilt, not snapshotted -- see field's doc comment).
      seedGrownTownSupportRingForTownTileImpl(this.grownTownSupportRingByOwner, tile, this.state.tiles);
      const site = tile.shardSite;
      if (site && site.kind === "FALL" && typeof site.expiresAt === "number" && site.expiresAt > this.now()) {
        this.shardRain.recordRecoveredFallSite(tileKey, site.expiresAt);
      }
      this.ownerIndexes.seedFromBootTile(tileKey, tile);
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
      if (tile.siegeBattery?.ownerId) this.adjustOwnedStructureCount(tile.siegeBattery.ownerId, "SIEGE_BATTERY", 1);
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
        registerFortSupportAnchorImpl(this.ownerIndexes.activeFortAnchorsByOwner, tileKey, ownerId, TOWN_AUTO_FRONTIER_RADIUS);
      }
      this.ownerIndexes.seedActiveStructuresFromBootTile(tileKey, tile);
      // Seed Outpost/Observatory/Waystation vision bonuses here — see the first-pass comment above.
      seedOutpostVisionBonus(this.structureVision.outpostVisionDeps(), tile);
      seedObservatoryVisionBonus(this.structureVision.observatoryVisionDeps(), tile); seedWaystationVisionBonus(this.state.visibilityCoverage, this.visionTransitions.callbacks, tile);
      this.ownerIndexes.seedMusterAndManpowerStructuresFromBootTile(tileKey, tile);
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
    seedReachBorderFromAnchors({ gatherReachAnchors: () => this.gatherReachAnchors(), applyReachAnchorActivation: (a, cid, o) => this.applyReachAnchorActivation(a, cid, o), tiles: this.state.tiles, reachBorder: () => this.reachBorder, runtimeLogInfo: (p, m) => runtimeLogInfo(p, m) });
    this.clearPersistedOutOfReachDecayTimers();
    this.frontierAutoHealQueue = rebuildFrontierAutoHealQueue(this.state.tiles);
    // Boot-time seed for eligibleFrontierByOwner (one-time O(frontier) cold rebuild -- see field's doc comment).
    for (const [ownerId, frontierKeys] of this.ownerIndexes.frontierTilesByOwner) {
      seedEligibleFrontierQueueForOwnerImpl(this.eligibleFrontierByOwner, ownerId, frontierKeys, this.autoSettleEligibilityRuntime().depsForPlayer(ownerId));
    }
    // Before the manpower settle below: its accrual and the economy caches it fills read town order.
    for (const player of options.initialState?.players ?? []) {
      if (player.ownedTownTileKeys?.length) restoreRecoveredTownOrder(this.summaryForPlayer(player.id), player.ownedTownTileKeys);
    }
    this.manpowerCapBootstrapRestampedCount += settleBootstrapManpower(this.state.players.values(), player => this.applyManpowerRegen(player));
    this.manpowerReady = true;
    for (const playerId of this.state.players.keys()) {
      this.rebuildPlannerCandidateIndexesForPlayer(playerId);
    }
    scheduleRecoveredPendingSettlementsImpl(
      {
        now: () => this.now(),
        scheduleAfter: (delayMs, task) => this.scheduleAfter(delayMs, task),
        tiles: this.state.tiles,
        pendingSettlementsByTile: this.pendingSettlementsByTile,
        addPendingSettlement: (record) => this.addPendingSettlement(record),
        removePendingSettlement: (tileKey) => this.removePendingSettlement(tileKey),
        replaceTileState: (tileKey, tile) => this.replaceTileState(tileKey, tile),
        devQueueCommandContext: () => this.devQueueCommandContext(),
        emitEvent: (event) => this.emitEvent(event),
        emitAutoFillForSettlement: (settledTile, ownerId, tileKey) => this.emitAutoFillForSettlement(settledTile, ownerId, tileKey),
        emitPlayerStateUpdate: (command) => this.emitPlayerStateUpdate(command),
        tileDeltaFromState: (tile) => this.tileDeltaFromState(tile)
      },
      options.initialState?.pendingSettlements ?? []
    );
    rescheduleRecoveredStructureTimers({
      tiles: this.state.tiles,
      now: this.now,
      scheduleAfter: (delayMs, task) => this.scheduleAfter(delayMs, task),
      completeStructureBuild: (tileKey, ownerId, structureType, commandId) => this.completeStructureBuild(tileKey, ownerId, structureType, commandId),
      completeStructureRemoval: (tileKey, ownerId, commandId) => this.completeStructureRemoval(tileKey, ownerId, commandId),
      isTileUnderAttack: (tileKey) => this.state.locksByTile.targetLockAt(tileKey)?.actionType === "ATTACK",
      releaseDevelopmentHold: (tileKey, commandId) => releaseDevelopmentHold(this.attackDevelopmentHoldContext(), tileKey, commandId),
      afcModuleDelivery: () => ({ ...this.respawnContext(), ownedAfcTileKeys: (playerId) => this.summaryForPlayer(playerId).ownedAfcTileKeys })
    });
    installAttackReleaseHandler(this.state.locksByTile, () => this.attackDevelopmentHoldContext(), (ownerId) => tryDrainDevQueueImpl(this.devQueueCommandContext(), ownerId));
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

  /**
   * Graceful shutdown: stop running scheduled tasks (combat-lock resolutions,
   * settle/build completions, job-queue delays) so the final checkpoint
   * exports one consistent moment instead of a world changing between its
   * export yields. Their state stays pending in the snapshot and is
   * rescheduled on the next boot. One-way: the runtime is done after this.
   */
  freezeScheduledTasks(): void {
    this.scheduledTasksFrozen = true;
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

  tickOrphanedLockSweep(nowMs: number = this.now()): number {
    return tickOrphanedLockSweepImpl({
      nowMs,
      orphanLockGraceMs: ORPHAN_LOCK_GRACE_MS,
      locksByTile: this.state.locksByTile,
      locksByCommandId: this.locksByCommandId,
      refundExpandManpower: (playerId, amount) => { const player = this.state.players.get(playerId); if (player) player.manpower += amount; } // reverses our prior EXPAND debit; next regen tick reclamps overcap
    });
  } // docs/replenishment-update-plan.md D1/D11 "Manpower full" email (bounded O(players) sweep, not a per-spend deadline queue -- see runtime-manpower-full-alert.ts's header comment) follows on the same line below to hold this file's net line count:
  tickManpowerFullAlerts(nowMs: number = this.now()): number { return tickManpowerFullAlertsImpl({ nowMs, players: this.state.players, playerManpowerCap: (player) => this.playerManpowerCap(player), playerManpowerRegenPerMinute: (player) => this.playerManpowerRegenPerMinute(player), effectiveManpowerAt: (player, at) => this.effectiveManpowerAt(player, at), isPlayerSubscribed: (playerId) => this.isPlayerSubscribed?.(playerId) ?? false, emitEvent: (event) => this.emitEvent(event), alertedPlayerIds: this.alertedManpowerFullPlayerIds }); }
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

  async applyPassiveIncomeAsync(nowMs: number, yieldToEventLoop: () => Promise<void>): Promise<void> {
    await applyPassiveIncomeAsyncImpl(this.passiveIncomeContext(), nowMs, PASSIVE_INCOME_INACTIVITY_CAP_MS, yieldToEventLoop);
  }

  /** Offline-gold estimate for the welcome-back toast — see welcomeBackSummaryForPlayer. */
  welcomeBackSummary(playerId: string, nowMs: number, goldPerMinuteOverride?: number): { goldEarned: number; elapsedMs: number } {
    return welcomeBackSummaryForPlayer(this.passiveIncomeContext(), playerId, nowMs, goldPerMinuteOverride);
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
      invalidateEconomyCachesForPlayer: (playerId) => this.economyCaches.invalidateEconomySnapshot(playerId),
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

  // Census Hall population bonus -- see runtime-census-hall-bonus.ts.
  private applyCensusHallPopulationBonuses(): void {
    applyCensusHallPopulationBonusesImpl({
      censusHallTilesByOwner: this.ownerIndexes.censusHallTilesByOwner,
      tiles: this.state.tiles,
      now: () => this.now(),
      assignedTownKeyForSupportTile: (playerId, x, y) => this.assignedTownKeyForSupportTile(playerId, x, y),
      connectedIncubationEngineCountForTown: (playerId, townKey) => this.censusHallConnectedIncubationEngineBonusCountForPlayer(playerId, townKey),
      replaceTileState: (tileKey, tile) => this.replaceTileState(tileKey, tile),
      emitEvent: (event) => this.emitEvent(event),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile)
    });
  }

  tickShardRain(nowMs: number = this.now()): void {
    this.shardRain.tick(nowMs);
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

  private activateReachClaimedTile(tileKey: string, playerId: string, commandId: string): void { const tile = this.state.tiles.get(tileKey); if (!tile) return; this.activateWatchtowerAt(tileKey, tile.x, tile.y, playerId, commandId); this.activateWaystationAt(tileKey, tile.x, tile.y, playerId, commandId); } private activateWatchtowerAt(targetKey: string, x: number, y: number, playerId: string, commandId: string): void { activateWatchtowerAtImpl(this.watchtowerRevealContext(), targetKey, x, y, playerId, commandId); } private activateWaystationAt(targetKey: string, x: number, y: number, playerId: string, commandId: string): void { activateWaystationAtImpl({ now: this.now, tiles: this.state.tiles, players: this.state.players, visibilityCoverage: this.state.visibilityCoverage, visionTransitionCallbacks: this.visionTransitions.callbacks, replaceTileState: (tileKey, tile, commandId2) => this.replaceTileState(tileKey, tile, commandId2), emitEvent: (event) => this.emitEvent(event), tileDeltaFromState: (tile) => this.tileDeltaFromState(tile), recordPersonalImpact: (event) => this.activityLogs.recordPersonalImpact(event), refreshManpower: (id) => { const p = this.state.players.get(id); if (p) this.refreshManpowerOnly(p); }, playerManpowerCap: (id) => { const p = this.state.players.get(id); return p ? this.playerManpowerCap(p) : 0; } }, targetKey, x, y, playerId, commandId); }

  tickWatchtowerReveals(nowMs: number = this.now()): void {
    tickWatchtowerRevealsImpl(this.watchtowerRevealContext(), nowMs);
  }

  /** isObservatoryShielding (aether-shield/aether-shield.ts) on this runtime's clock and dormancy. */
  private isObservatoryShieldingNow(tile: DomainTileState): boolean {
    return isObservatoryShielding(tile, this.now(), (playerId, tileKey, field) => this.isStructureDormant(playerId, tileKey, field));
  }

  /** Throttled inside; see aether-shield/aether-shield-tick.ts. */
  tickAetherShields(nowMs: number = this.now()): void {
    this.aetherShieldTicker.tick(nowMs);
    this.oracleDetections.refreshAll();
  }

  /** Live-subscribe push of the player's AETHER_SHIELDS list (simulation-service/live-subscribe-reach-push.ts). */
  resendAetherShieldsForPlayer(playerId: string): void {
    this.aetherShieldTicker.sendTo(playerId, this.now());
    this.oracleDetections.sendTo(playerId);
  }

  /** Throttled inside; see island-names/island-names-ticker.ts. */
  tickIslandNames(nowMs: number = this.now()): void {
    this.islandNamesTicker.tick(nowMs);
  }

  /** Live-subscribe push of the ISLAND_NAMES label list (simulation-service/live-subscribe-reach-push.ts). */
  resendIslandNamesForPlayer(playerId: string): void {
    this.islandNamesTicker.sendTo(playerId, this.now());
  }

  async tickTerritoryAutomation(nowMs: number = this.now(), yieldToEventLoop?: () => Promise<void>): Promise<void> {
    resolveOverduePendingSettlements({ pendingSettlementsByTile: this.pendingSettlementsByTile, nowMs, summaryForPlayer: (id) => this.summaryForPlayer(id), resolve: (record) => this.resolvePendingSettlement(record) });
    if (!this.dormantClaimSweepDone) { this.dormantClaimSweepDone = true; const sweepOwners = new Set<string>(); for (const { tileKey, ownerId } of dormantOwnedActivatables(this.state.tiles)) { this.activateReachClaimedTile(tileKey, ownerId, `dormant-claim-sweep:${tileKey}`); sweepOwners.add(ownerId); } for (const playerId of sweepOwners) this.emitPlayerStateUpdate({ commandId: `dormant-claim-sweep:${playerId}`, playerId }); }
    await tickTerritoryAutomationImpl({
      nowMs,
      players: this.state.players,
      tiles: this.state.tiles,
      locksByTile: this.state.locksByTile,
      activeFortAnchorsByOwner: this.ownerIndexes.activeFortAnchorsByOwner,
      playerCandidateIndex: this.playerCandidateIndex,
      playerManpowerCap: (player) => this.playerManpowerCap(player),
      frontierTileCountForPlayer: (playerId) => this.ownerIndexes.frontierTilesByOwner.get(playerId)?.size ?? 0,
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      applyEconomyAccrual: (player, at) => this.applyEconomyAccrual(player, at),
      autoSettlementQueueLengthForPlayer: (playerId) => this.autoSettlementQueueForPlayer(playerId).length,
      emitPlayerStateUpdate: (input) => this.emitPlayerStateUpdate(input),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      nextTerritoryAutomationCommandId: (label, playerId, tileKey, at) =>
        this.nextTerritoryAutomationCommandId(label, playerId, tileKey, at),
      emitEvent: (event) => this.emitEvent(event),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      onTileClaimed: (tileKey, ownerId, claimCommandId) => this.activateReachClaimedTile(tileKey, ownerId, claimCommandId),
      runtimeLogInfo: (payload, message) => runtimeLogInfo(payload, message),
      ...(this.trackSyncMainThreadTask !== undefined ? { trackSync: this.trackSyncMainThreadTask } : {}),
      ...(yieldToEventLoop !== undefined ? { yieldToEventLoop } : {})
    });
    // Was AI-only; now every player auto-settles FRONTIER tiles in reach for free — see runAutoSettleForPlayer.
    for (const [playerId] of this.state.players) {
      this.runAutoSettleForPlayer(playerId, nowMs);
      if (yieldToEventLoop) await yieldToEventLoop();
    }
    this.tickMuster(nowMs);
    this.tickFrontierAutoHeal(nowMs); this.tickAetherBridgeReachExpiry(nowMs);
    // tickMuster mutates many players' tiles via replaceTileState in tight
    // per-tile loops without ever calling emitPlayerStateUpdate itself
    // (unlike command-driven mutations) — so this is the one place its
    // share of markOutpostVisionDormancyDirty's pending entries actually
    // gets resolved. One resync per dirty player, not per tile mutation.
    this.flushAllOutpostVisionDormancyResyncs();
  }

  private registerFrontierAutoHeal(tileKey: string, deadlineAt: number): void { enqueueFrontierAutoHeal(this.frontierAutoHealQueue, tileKey, deadlineAt, (p, m) => runtimeLogInfo(p, m)); }
  tickFrontierAutoHeal(nowMs: number = this.now()): number { return tickFrontierAutoHealImpl({ queue: this.frontierAutoHealQueue, nowMs, tiles: this.state.tiles, replaceTileState: (k, t, cid) => this.replaceTileState(k, t, cid), tileDeltaFromState: (t) => this.tileDeltaFromState(t), emitEvent: (e) => this.emitEvent(e), runtimeLogInfo: (p, m) => runtimeLogInfo(p, m), reachBorderOwnerAt: (x, y) => reachBorderOwnerAtImpl(this.reachBorder, x, y), onTileClaimed: (k, o, cid) => this.activateReachClaimedTile(k, o, cid) }); }

  private musterTickContext(): MusterTickContext {
    return buildMusterTickContext({
      state: this.state,
      activeSiegeBatteriesByOwner: this.ownerIndexes.activeSiegeBatteriesByOwner,
      activeRelayBeaconsByOwner: this.ownerIndexes.activeRelayBeaconsByOwner,
      neuralWorksTilesByOwner: this.ownerIndexes.neuralWorksTilesByOwner,
      advanceCooldowns: this.musterAdvanceCooldowns as MusterAdvanceCooldowns,
      activeAetherBridgesForPlayer: (playerId: string) => this.activeAetherBridgesForPlayer(playerId),
      applyManpowerRegen: (player: RuntimePlayer, at?: number) => this.applyManpowerRegen(player, at),
      playerManpowerCap: (player: RuntimePlayer) => this.playerManpowerCap(player),
      replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => this.replaceTileState(tileKey, tile, commandId),
      emitEvent: (event: SimulationEvent) => this.emitEvent(event),
      emitPlayerStateUpdate: (input: { commandId: string; playerId: string }) => this.emitPlayerStateUpdate(input),
      tileDeltaFromState: (tile: DomainTileState) => this.tileDeltaFromState(tile),
      requiredMusterForTarget: (target: DomainTileState, attackerId?: string) => this.requiredMusterForTarget(target, attackerId),
      nextTerritoryAutomationCommandId: (label: string, playerId: string, tileKey: string, at: number) => this.nextTerritoryAutomationCommandId(label, playerId, tileKey, at),
      handleFrontierCommand: (command: CommandEnvelope, actionType: FrontierCommandType) => this.handleFrontierCommand(command, actionType),
      isStructureDormant: (playerId: string, tileKey: string, field: "siegeBattery" | "economicStructure") => this.isStructureDormant(playerId, tileKey, field),
      isInReach: (playerId: string, x: number, y: number) => this.isPlayerTileInReach(playerId, x, y)
    });
  }

  tickMuster(nowMs: number = this.now()): void {
    this.musterTicker.tickMuster(nowMs);
  }

  tickWatchedMusterTiles(nowMs: number = this.now()): void {
    this.musterTicker.tickWatchedMusterTiles(nowMs);
  }

  emitShardRainHelloFor(playerId: string, nowMs: number = this.now()): void {
    this.shardRain.emitHelloFor(playerId, nowMs);
  }

  currentShardRainWelcomeNotice(nowMs: number = this.now()): Record<string, unknown> {
    return this.shardRain.welcomeNotice(nowMs);
  }

  private respawnContext(): RuntimeRespawnContext {
    return {
      afcUpgradeRuleset: this.afcUpgradeRuleset,
      now: this.now,
      players: this.state.players,
      tiles: this.state.tiles,
      playerSummaries: this.playerSummaries,
      plannerPlayerTileCollectionVersionByPlayer: this.plannerPlayerTileCollectionVersionByPlayer,
      pendingRespawnNoticeByPlayerId: this.pendingRespawnNoticeByPlayerId,
      lastRespawnNoticeByPlayerId: this.lastRespawnNoticeByPlayerId,
      pendingSettlementsByTile: this.pendingSettlementsByTile,
      locksByTile: this.state.locksByTile,
      rememberedAutomationVictoryPathByPlayer: this.automationAdvisor.victoryPathByPlayer,
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      bumpTerrainEpoch: () => { this.terrainEpoch = nextTerrainEpoch++; },
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      emitEvent: (event) => this.emitEvent(event), emitPlayerStateUpdate: (command) => this.emitPlayerStateUpdate(command),
      scheduleAfter: (delayMs, task) => this.scheduleAfter(delayMs, task),
      runtimeLogInfo: (payload, message) => runtimeLogInfo(payload, message),
      incomePerMinuteForPlayer: (playerId) => this.incomePerMinuteForPlayer(playerId),
      respawnMinimumGold: RESPAWN_MINIMUM_GOLD,
      incrementAuthRecoveryRespawn: () => this.onAuthRecoveryRespawn?.(),
      incrementAuthRecoveryRespawnGuarded: () => this.onAuthRecoveryRespawnGuarded?.(),
      // reachBorder is reassigned on every anchor activation, so it is read lazily per lookup.
      ...this.spawnPlacementIndex.spawnSearchLookups(this.state.tiles, (x, y) => reachBorderOwnerAtImpl(this.reachBorder, x, y))
    };
  }

  private combatSupportContext(): RuntimeCombatSupportContext {
    return {
      ownedTownKeys: id => this.summaryForPlayer(id).ownedTownTierByTile.keys(),
      hasPendingClaim: key => this.pendingSettlementsByTile.has(key),
      isTileShieldedByAegisLock: (id, x, y) => this.isTileShieldedByAegisLock(id, x, y),
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
      ownedStructureCountForPlayer: (playerId, structureType) => this.ownedStructureCountForPlayer(playerId, structureType),
      recordCombatManpowerLoss: (loss) => this.activityLogs.recordCombatManpowerLoss(loss), musterTilesByOwner: this.ownerIndexes.musterTilesByOwner, musterReservedByKey: this.musterReservedByKey
    };
  }

  private attackDevelopmentHoldContext(): AttackDevelopmentHoldContext {
    return {
      now: this.now, scheduleAfter: this.scheduleAfter, tiles: this.state.tiles,
      completeStructureBuild: (tileKey, ownerId, structureType, commandId) => this.completeStructureBuild(tileKey, ownerId, structureType, commandId),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId), tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      emitEvent: (event) => this.emitEvent(event), emitPlayerStateUpdate: (command) => this.emitPlayerStateUpdate(command),
      cancelPendingSettlementForAttack: (tileKey, attackerId, commandId) => {
        const cancelled = this.cancelPendingSettlementIfOwnerChanged(tileKey, attackerId, commandId);
        if (cancelled) tryDrainDevQueueImpl(this.devQueueCommandContext(), cancelled.ownerId); // slot freed
        return Boolean(cancelled);
      }
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
      onMusterRemoteAttack: this.onMusterRemoteAttack, replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId), tileDeltaFromState: (tile) => this.tileDeltaFromState(tile), barbarianTileProgress: this.barbarianTileProgress,
      onMusterRemoteBlockedBarbarian: this.onMusterRemoteBlockedBarbarian,
      scheduleLockResolution: (lock) => this.scheduleLockResolution(lock),
      holdDevelopmentForAttack: (lock) => holdDevelopmentForAttack(this.attackDevelopmentHoldContext(), { targetKey: lock.targetKey, attackerId: lock.playerId, commandId: lock.commandId }),
      adjacentTileStates: (x, y) => this.adjacentTileStates(x, y),
      findOwnedDockOriginForCrossing: (playerId, x, y) => this.findOwnedDockOriginForCrossing(playerId, x, y),
      findOwnedAetherBridgeOriginForCrossing: (playerId, x, y) => this.findOwnedAetherBridgeOriginForCrossing(playerId, x, y),
      isDockCrossingTarget: (from, x, y) => isDockCrossingTargetImpl(from, x, y, this.state.dockLinksByDockTileKey),
      isAetherBridgeCrossingTarget: (playerId, x1, y1, x2, y2) => this.isAetherBridgeCrossingTarget(playerId, x1, y1, x2, y2),
      crossingBlockedByAetherWall: (x1, y1, x2, y2) => this.crossingBlockedByAetherWall(x1, y1, x2, y2),
      isTileWardedByImperialWard: (targetOwnerId) => isTileWardedByImperialWardImpl(this.abilityCooldowns, this.now(), targetOwnerId),
      resolveMusterSource: (playerId, originKey, required, preferred) => this.resolveMusterSource(playerId, originKey, required, preferred),
      requiredMusterForTarget: (target, attackerId) => this.requiredMusterForTarget(target, attackerId),
      buildLockedCombatResolution: (lock) => this.buildLockedCombatResolution(lock),
      isInReach: (playerId, x, y) => this.isPlayerTileInReach(playerId, x, y), reachBorderOwnerAt: (x, y) => reachBorderOwnerAtImpl(this.reachBorder, x, y),
      releaseIfStrandedOrigin: (originKey, ownerId, commandId) => this.strandedFrontier.releaseIfStrandedOrigin(originKey, ownerId, commandId),
      frontierTileCountForPlayer: (playerId) => this.ownerIndexes.frontierTilesByOwner.get(playerId)?.size ?? 0
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
      runtimeLogInfo: (payload, message) => runtimeLogInfo(payload, message),
      registerFrontierAutoHeal: (tileKey, deadlineAt) => this.registerFrontierAutoHeal(tileKey, deadlineAt)
    };
  }

  private lockResolutionContext(): RuntimeLockResolutionContext {
    const autoSettleDeps: AutoSettleCapturedAnchorDeps = { getPlayer: (id) => this.state.players.get(id), hasAvailableDevelopmentSlot: (id) => this.hasAvailableDevelopmentSlot(id), startSettlementProcess: (i) => this.startSettlementProcess(i), now: () => this.now() }; return {
      hasPendingClaim: key => this.pendingSettlementsByTile.has(key),
      isFortDormant: (ownerId, key) => this.isStructureDormant(ownerId, key, "fort"),
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
      buildCaptureRevealTileDeltas: (playerId, centerX, centerY) =>
        buildCaptureRevealTileDeltasImpl(this.combatSupportContext(), playerId, centerX, centerY),
      buildLockedCombatResolution: (lock) => this.buildLockedCombatResolution(lock),
      isTileShieldedByAegisLock: (actorId, targetX, targetY) =>
        this.isTileShieldedByAegisLock(actorId, targetX, targetY),
      consumeOriginMuster: (originKey, playerId, amount) => this.consumeOriginMuster(originKey, playerId, amount),
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
      maybeActivateWatchtower: (targetKey, x, y, playerId, commandId) => this.activateWatchtowerAt(targetKey, x, y, playerId, commandId), maybeActivateWaystation: (targetKey, x, y, playerId, commandId) => this.activateWaystationAt(targetKey, x, y, playerId, commandId),
      maybeDrainClaimContinuation: (targetKey, x, y, playerId) => tryDrainClaimContinuationImpl(this.devQueueCommandContext(), playerId, targetKey, x, y),
      isTileBeyondReach: (playerId, x, y) => isTileBeyondReachImpl({ isPlayerTileInReach: (pid, tx, ty) => this.isPlayerTileInReach(pid, tx, ty), gatherReachAnchors: () => this.gatherReachAnchors(), isLandTile: this.isLandTileQuery }, playerId, x, y), canAutoSettleCapturedAnchor: (playerId) => canAutoSettleCapturedAnchorImpl(autoSettleDeps, playerId), isTownAutoSettleAllowed: (playerId) => { const player = this.state.players.get(playerId); return player !== undefined && isAutoSettleAllowed(normalizeAutoSettlePrefs(player.autoSettle), "towns"); }, autoSettleCapturedAnchor: (playerId, targetKey, target, commandId) => autoSettleCapturedAnchorImpl(autoSettleDeps, playerId, targetKey, target, commandId),
      applyBreachToNeighbors: BREAKTHROUGH_ENABLED
        ? (capturedTile, attackerId) => applyBreachToNeighborsImpl({ capturedTile, attackerId, nowMs: this.now(), tiles: this.state.tiles, invalidateTileStringifyCache: (key) => this.tileDeltaStringifyCache.invalidate(key) })
        : undefined,
      tryDrainWaypointQueue: (playerId) => this.tryDrainWaypointQueue(playerId),
      recordTileFlip: (flip) => { this.activityLogs.recordTileFlip(flip); this.onboardingMilestones.observeTileFlip(flip); }, recordPersonalImpact: (event) => this.activityLogs.recordPersonalImpact(event)
    };
  }

  exportActivityDashboardSnapshot() { return this.activityLogs.exportDashboardSnapshot(this.state.tiles, this.state.players); }
  exportActivityLogs() { return this.activityLogs.export(); }
  restoreActivityLogs(logs: PersistedActivityLogs | undefined) { this.activityLogs.restore(logs); }
  territoryFlipLogGauge() { return this.activityLogs.territoryGauge(); }
  combatManpowerLogGauge() { return this.activityLogs.combatGauge(); }
  personalImpactLogGauge() { return this.activityLogs.personalImpactGauge(); }
  onboardingMilestoneGauge() { return this.onboardingMilestones.gauge(); }
  getPersonalActivityTimeline(playerId: string, from: number, to: number) { return this.activityLogs.personalTimeline(playerId, from, to); }
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
        isAiById: (playerId) => this.state.players.get(playerId)?.isAi
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
    return consumeRespawnNoticeImpl(this.lastRespawnNoticeByPlayerId, playerId);
  }

  hasPlayer(playerId: string): boolean { return this.state.players.has(playerId); } humanPlayerCount(): number { return humanPlayerCountOf(this.state.players); } ensurePlayerHasAfc(playerId: string): boolean { return ensurePlayerHasAfcImpl(this.respawnContext(), playerId); } // join-capacity gate; ensurePlayerHasAfc: migration grant for pre-AFC empires
  ensurePlayerHasSpawnTerritory(playerId: string, rallyAnchor?: { x: number; y: number }, onRallySpawnPlaced?: (outcome: RallySpawnOutcome) => void): boolean {
    const spawned = ensurePlayerHasSpawnTerritoryImpl(this.respawnContext(), playerId, rallyAnchor, onRallySpawnPlaced); if (spawned) wonderEffects.refreshPlayerWonders(playerId, this.settledTilesForPlayer(playerId), this.wonderCacheByPlayer, this.state.players);
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
    return this.jobQueue.depths();
  }

  queueBacklogMs(nowMs = this.now()): Record<QueueLane, number> {
    return this.jobQueue.backlogMs(nowMs);
  }

  private summaryForPlayer(playerId: string): PlayerRuntimeSummary {
    const existing = this.playerSummaries.get(playerId);
    if (existing) return existing;
    const summary = createEmptyPlayerRuntimeSummary();
    this.playerSummaries.set(playerId, summary);
    this.plannerPlayerTileCollectionVersionByPlayer.set(playerId, 0);
    return summary;
  }

  private readonly structureVision = createStructureVisionWiring({
    tiles: () => this.state.tiles,
    players: () => this.state.players,
    coverage: () => this.state.visibilityCoverage,
    callbacks: () => this.visionTransitions.callbacks,
    isStructureDormant: (ownerId, tileKey, field) => this.isStructureDormant(ownerId, tileKey, field),
    activeRelayBeaconsByOwner: this.ownerIndexes.activeRelayBeaconsByOwner,
    activeSiegeBatteriesByOwner: this.ownerIndexes.activeSiegeBatteriesByOwner,
    activeObservatoriesByOwner: this.ownerIndexes.activeObservatoriesByOwner
  });

  // See StructureVisionDormancyTracker's doc comment for why this exists and
  // why it's deferred/lazy rather than resolved eagerly in replaceTileState.
  private readonly outpostVisionDormancyTracker = new StructureVisionDormancyTracker();

  private resyncStructureVisionForPlayer(playerId: string): void {
    resyncPlayerOutpostVisionBonuses(this.structureVision.outpostVisionDeps(), playerId, this.structureVision.ownedOutpostTilesForPlayer(playerId));
    resyncPlayerObservatoryVisionBonuses(this.structureVision.observatoryVisionDeps(), playerId, this.structureVision.ownedObservatoryTilesForPlayer(playerId));
  }

  private markOutpostVisionDormancyDirty(playerId: string | undefined): void {
    this.outpostVisionDormancyTracker.markDirty(
      playerId,
      () =>
        (this.ownerIndexes.activeRelayBeaconsByOwner.get(playerId!)?.size ?? 0) > 0 ||
        (this.ownerIndexes.activeSiegeBatteriesByOwner.get(playerId!)?.size ?? 0) > 0 ||
        (this.ownerIndexes.activeObservatoriesByOwner.get(playerId!)?.size ?? 0) > 0
    );
  }

  private flushOutpostVisionDormancyResync(playerId: string | undefined): void {
    this.outpostVisionDormancyTracker.flush(playerId, () => this.resyncStructureVisionForPlayer(playerId!));
  }

  private flushAllOutpostVisionDormancyResyncs(): void {
    this.outpostVisionDormancyTracker.flushAll((playerId) => this.resyncStructureVisionForPlayer(playerId));
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
      players: this.state.players,
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
    if (this.manpowerReady) settleEnvoyDependents(this.manpowerEconomyContext(), [player.id], nowMs);
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
      economySnapshotCacheByPlayer: this.economyCaches.economySnapshotCacheByPlayer,
      economySnapshotDirtyPlayerIds: this.economyCaches.economySnapshotDirtyPlayerIds,
      economySnapshotLastRebuiltAtMsByPlayer: this.economyCaches.economySnapshotLastRebuiltAtMsByPlayer,
      defensibilityMetricsCacheByPlayer: this.economyCaches.defensibilityMetricsCacheByPlayer,
      defensibilityMetricsDirtyPlayerIds: this.economyCaches.defensibilityMetricsDirtyPlayerIds,
      defensibilityMetricsLastRebuiltAtMsByPlayer: this.economyCaches.defensibilityMetricsLastRebuiltAtMsByPlayer,
      upkeepAccrualReadCountByPlayer: this.economyCaches.upkeepAccrualReadCountByPlayer,
      upkeepAccrualCacheByPlayer: this.economyCaches.upkeepAccrualCacheByPlayer,
      settledTilesForPlayer: (playerId) => this.settledTilesForPlayer(playerId),
      cachedTownNetworkForPlayer: (player, settledTiles, maxConnectedTownNames) =>
        this.cachedTownNetworkForPlayer(player, settledTiles, maxConnectedTownNames),
      foodDormantTownKeysForPlayer: (playerId) => this.foodDormantTownKeysForPlayer(playerId),
      dormantEconomicStructureKeysForPlayer: (playerId) => this.dormantEconomicStructureKeysForPlayer(playerId),
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      ...(this.trackSyncMainThreadTask !== undefined ? { trackSyncMainThreadTask: this.trackSyncMainThreadTask } : {}),
      runtimeLogInfo: (payload, message) => runtimeLogInfo(payload, message)
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
      lastActiveAtMsByPlayer: this.lastActiveAtMsByPlayer,
      playerSummaries: this.playerSummaries,
      cachedUpkeepAccrual: (player) => this.cachedUpkeepAccrual(player),
      cachedEconomySnapshot: (player) => this.cachedEconomySnapshot(player),
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      onUpkeepNettedWhileIncomePaused: this.onUpkeepNettedWhileIncomePaused,
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

  private replaceTileState(tileKey: string, nextTile: DomainTileState, commandId = `tile-owner-change:${tileKey}`): void {
    this.tileDeltaStringifyCache.invalidate(tileKey);
    const previous = this.state.tiles.get(tileKey);
    const tile = withAfcFortFacts(withoutStaleCaptureHold(previous, nextTile, this.now()), this.state.players);
    if (this.manpowerReady) settleEnvoyDependentsBeforeTileChange(this.manpowerEconomyContext(), previous, tile);
    const sameOwner = Boolean(previous?.ownerId && previous.ownerId === tile.ownerId);
    // See refreshEconomyCachesForTileChange for why this is gated on SETTLED
    // ownership instead of invalidating unconditionally on every mutation.
    this.economyCaches.refreshForTileChange(tileKey, previous, tile, this.state.players);
    const wasSettledForSameOwner = updateTileSettledAt(this.tileSettledAtByKey, tileKey, previous, tile, this.now());
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
      // A tile leaving barbarian ownership by ANY route (walk release, erosion, capture) drops its multiply progress.
      if (previous?.ownerId?.startsWith("barbarian-") && !tile.ownerId?.startsWith("barbarian-")) this.barbarianTileProgress.delete(tileKey);
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
    if (tile.ownerId) restoreSameOwnerSummaryOrder(this.summaryForPlayer(tile.ownerId), previousOwnerTileOrder, previousOwnerTownOrder);
    this.refreshPlannerCandidateIndexesAroundTileChange(tileKey, previous, tile);
    this.refreshPlayerCandidateIndexAnchorForTile(tileKey, previous, tile);
    this.ownerIndexes.refreshForTileChange(tileKey, previous, tile);
    this.maintainAutoSettleEligibilityForTileChange(tileKey, previous, tile);
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
    reconcileOutpostVisionBonus(this.structureVision.outpostVisionDeps(), previous, tile);
    reconcileObservatoryVisionBonus(this.structureVision.observatoryVisionDeps(), previous, tile);
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
    if (previous?.muster?.ownerId !== tile.muster?.ownerId || previous?.observatory !== tile.observatory || previous?.resource || tile.resource) this.oracleDetections.queueRefresh();
    this.siphonModeLifecycle.onTileReplaced(tileKey, previous, tile, commandId); // last: may write other tiles
  }

  private rebuildPlannerCandidateIndexesForPlayer(playerId: string): void {
    rebuildPlannerCandidateIndexesForPlayerImpl({
      playerId,
      tiles: this.state.tiles,
      summary: this.summaryForPlayer(playerId),
      markPlannerPlayerTileCollectionDirty: (id) => this.markPlannerPlayerTileCollectionDirty(id),
      onCandidateRebuildComplete: (id, summary) => {
        const entry = this.plannerPlayerTileKeyCacheByPlayer.get(id);
        if (entry) resetCandidateKeysFromSummary(entry, summary);
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
        const entry = this.plannerPlayerTileKeyCacheByPlayer.get(playerId);
        if (entry) mirrorCandidateKeysIntoCache(entry, affectedKeys, summary);
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

  // In-process barbarian planner for the non-worker system producer (local dev/tests); same rules as the worker.
  private barbarianBridgeCache: RuntimeBarbarianBridge | undefined;

  barbarianBridge(): RuntimeBarbarianBridge {
    return this.barbarianBridgeCache ??= createRuntimeBarbarianBridge({
      tiles: this.state.tiles,
      dockLinksByDockTileKey: () => this.state.dockLinksByDockTileKey,
      territoryTileKeys: () => this.summaryForPlayer("barbarian-1").territoryTileKeys,
      tileKeySetToTiles: (keys) => this.tileKeySetToTiles(keys),
      seenBarbTileKeys: () => this.exportBarbTilesSeenByAnyPlayer(),
      now: () => this.now()
    });
  }

  chooseNextOwnedFrontierCommand(
    playerId: string,
    clientSeq: number,
    issuedAt: number,
    sessionPrefix: "ai-runtime" | "system-runtime"
  ): CommandEnvelope | undefined {
    const player = this.state.players.get(playerId);
    return planDirectFrontierCommand({ tiles: this.state.tiles,
      ownedTiles: this.tileKeySetToTiles(this.summaryForPlayer(playerId).territoryTileKeys),
      locks: this.state.locksByTile.values(), dockLinks: this.state.dockLinksByDockTileKey,
      playerId, points: player?.points ?? 0, manpower: player?.manpower ?? 0, frontierTileCount: this.summaryForPlayer(playerId).frontierTileKeys.size,
      clientSeq, issuedAt, sessionPrefix });
  }

  explainNextAutomationCommand(
    playerId: string,
    clientSeq: number,
    issuedAt: number,
    sessionPrefix: AutomationSessionPrefix,
    options?: ExplainAutomationCommandOptions
  ): AutomationCommandExplanation {
    return this.automationAdvisor.explainNextCommand(playerId, clientSeq, issuedAt, sessionPrefix, options);
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

    if (command.type !== "SYNC_ALLIANCE" && command.type !== "SYNC_TRUCE" && command.type !== "SETTLE_DIPLOMACY_TERMS" && command.type !== "CHECK_STRANDED_REGION") {
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
    if (command.type !== "CHECK_STRANDED_REGION") this.persistence.recordCommand(command); // ephemeral: never retained
    this.queueCommandForProcessing(command);
  }

  snapshot(): { commands: CommandEnvelope[]; events: SimulationEvent[] } {
    return this.persistence.snapshot();
  }

  replayCacheStats(): ReturnType<RuntimeReplayCache["stats"]> {
    return this.replayCache.stats();
  }

  /** Size of the retained persistence log, for gauges; undefined when the injected persistence keeps none. */
  persistenceLogStats(): PersistenceLogStats | undefined {
    return this.persistence.stats?.();
  }

  // Shared context builder for the export-surface free functions in
  // runtime-export.ts, mirroring townNetworkContext()'s pattern (Stage 4).
  // Superset of what any single export function needs — matches
  // RuntimeExportContext, which is itself derived from the impl functions'
  // own parameter types, so a mismatch here is a compile error, not a
  // silent drift.
  private exportContext(): RuntimeExportContext {
    return {
      now: () => this.now(),
      tiles: this.state.tiles,
      locksByCommandId: this.locksByCommandId,
      players: this.state.players,
      pendingSettlementsByTile: this.pendingSettlementsByTile,
      playerYieldCollectionEpochByPlayer: this.lastIncomeTickAtMsByPlayer,
      tileSettledAtByKey: this.tileSettledAtByKey,
      docks: this.state.docks,
      terrainEpoch: this.terrainEpoch,
      tileDeltaStringifyCache: this.tileDeltaStringifyCache,
      applyManpowerRegen: this.applyManpowerRegen.bind(this),
      playerManpowerCap: this.playerManpowerCap.bind(this),
      playerManpowerRegenPerMinute: this.playerManpowerRegenPerMinute.bind(this),
      playerLogisticsThroughputPerMinute: this.playerLogisticsThroughputPerMinute.bind(this),
      playerManpowerBreakdown: this.playerManpowerBreakdown.bind(this),
      incomePerMinuteForPlayer: this.incomePerMinuteForPlayer.bind(this),
      envoyIncomePerMinuteForPlayer: player => afcEnvoyIncomeInSnapshot(this.cachedEconomySnapshot(player)),
      summaryForPlayer: this.summaryForPlayer.bind(this),
      growthStalledNoFoodCounter: this.growthStalledNoFoodCounter,
      recordedEventsByCommandId: this.replayCache.recordedEventsByCommandId,
      prebuiltTiles: this.snapshotTileCache,
      plannerGatingLockPlayerIds: () => plannerGatingLockPlayerIdsImpl(this.state.locksByTile),
      refreshManpowerOnly: (player) => this.refreshManpowerOnly(player),
      plannerPlayerTileKeys: (playerId, summary) => this.plannerPlayerTileKeys(playerId, summary),
      ownedStructureCountsForPlayer: (playerId) => this.ownedStructureCountsForPlayer(playerId),
      estimatedIncomePerMinuteForPlayer: (playerId) => this.estimatedIncomePerMinuteForPlayer(playerId),
      reachTileKeysForPlayer: (playerId) => this.reachTileKeysForPlayer(playerId),
      spatialFocusFrontForPlayer: (playerId) => this.spatialFocusFrontTileKeysForPlayer(playerId),
      afcDetectedFlagsForPlayer: id => this.oracleDetections.cachedFlagsFor(id),
      tacticalViewForPlayer: (id, focusKeys) => this.tacticalViewForPlayer(id, focusKeys),
      neutralBeaconTileKeys: this.neutralBeaconTileKeys,
      beaconGeneration: this.beaconGeneration,
      yieldBearingTilesByOwner: this.ownerIndexes.yieldBearingTilesByOwner,
      expansionObjectiveCacheByPlayer: this.expansionObjectiveCacheByPlayer,
      musterTilesByOwner: this.ownerIndexes.musterTilesByOwner,
      locksByTile: this.state.locksByTile,
      resourceSlotSupplyForPlayer: (playerId) => this.resourceSlotSupplyForPlayer(playerId),
      resourceSlotDemandForPlayer: (playerId) => this.resourceSlotDemandForPlayer(playerId),
      foodDormantEconomicStructureKeysForPlayer: (playerId) => foodDormantEconomicStructureKeysFromDormancy(this.resourceSlotDormancyForPlayer(playerId)),
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

  // Single-player lookup for GetPlayerCombatSummary. techIds/domainIds are
  // O(1) — weaponsFactoryCounts reads the maintained per-owner structure
  // index (runtime-owned-structure-index.ts), never a world-tile scan.
  getPlayerCombatSummary(playerId: string, target?: { x: number; y: number }): PlayerCombatSummary | undefined {
    return buildPlayerCombatSummary({ ...this.combatSupportContext(), now: this.now, factoryCountsFor: id => weaponsFactoryCountsFromIndex(this.ownedStructureCountByPlayerByType, id), isFortDormant: (id, key) => this.isStructureDormant(id, key, "fort") }, playerId, target);
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

  // Shared context builder for the visibility-surface free functions in runtime-visibility.ts; visibilityCoverage stays
  // owned by SimulationRuntime and is threaded in by reference (see runtime-visibility.ts's header for why).
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

  /** Sizes of growable barbarian state, for gauges (docs/agents/state-and-persistence-discipline.md). */
  afcStateStats() { return { ...afcCampaignStateGauges(this.state.players.values()), ...afcCampaignGuardCounters, ...oracleDetectionDiagnostics }; }

  barbarianStateSizes(): { tiles: number; progressEntries: number } {
    return { tiles: this.summaryForPlayer("barbarian-1").territoryTileKeys.size, progressEntries: this.barbarianTileProgress.size };
  }

  /** Barbarian tile keys that at least one non-barbarian player can currently see (real fog of war). */
  exportBarbTilesSeenByAnyPlayer(): string[] {
    return barbTilesSeenByAnyPlayer({
      playerIds: () => this.state.players.keys(),
      territoryTileKeys: (id) => this.summaryForPlayer(id).territoryTileKeys,
      isVisibleTo: (viewerId, tileKey) => this.state.visibilityCoverage.isVisible(viewerId, tileKey)
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
      playerManpowerCap: (player: RuntimePlayer) => this.playerManpowerCap(player),
      playerManpowerRegenPerMinute: (player: RuntimePlayer) => this.playerManpowerRegenPerMinute(player),
      playerLogisticsThroughputPerMinute: (player: RuntimePlayer) => this.playerLogisticsThroughputPerMinute(player),
      playerManpowerBreakdown: (player: RuntimePlayer) => this.playerManpowerBreakdown(player),
      cachedEconomySnapshot: (player: RuntimePlayer) => this.cachedEconomySnapshot(player),
      // Seeds the sparse-delta cache's baseline for every tile a player sees
      // at connect time, so their subsequent command/tick deltas for
      // already-visible tiles can be genuinely sparse. This is a perf/
      // payload-size improvement layered on top of (not a substitute for)
      // buildSparseDelta always including ownerId/ownershipState/dockId --
      // see the comment there for why this alone isn't sufficient.
      seedLastEmitted: (tileKey: string, tile: DomainTileState) => this.tileDeltaStringifyCache.setLastEmitted(tileKey, tile, reachBorderOwnerAtImpl(this.reachBorder, tile.x, tile.y)),
      reachBorderOwnerAt: (x: number, y: number) => reachBorderOwnerAtImpl(this.reachBorder, x, y)
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
        tileDeltaFromState: (tile, context, deltaOptions) => this.tileDeltaFromState(tile, context, deltaOptions),
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

  filterTileDeltasForPlayer<TDelta extends { x: number; y: number; terrain?: Terrain | undefined; ownerId?: string | undefined; forceVisibleForPlayerId?: string | readonly string[] | undefined }>(
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
  // SIEGE_BATTERY / SIEGE_TOWER / DREAD_TOWER — same "active" predicate
  // outpost-aura.ts uses, sourced from the already-maintained
  // activeRelayBeaconsByOwner / activeSiegeBatteriesByOwner indexes), and
  // every owned dock tile. Used both for `liveReachForOwner`'s "can this
  // owner currently defend this tile" check during a contest, and once at
  // startup to seed `reachBorder`. `activatedAt` is unused by the current
  // border model (grantAnchorToBorder resolves contests via live coverage,
  // not build order) but is still populated for API completeness / possible
  // future use.
  private gatherReachAnchors(): ReachAnchor[] {
    return gatherReachAnchorsImpl({
      players: this.state.players,
      playerSummaries: this.playerSummaries,
      tiles: this.state.tiles,
      activeRelayBeaconsByOwner: this.ownerIndexes.activeRelayBeaconsByOwner,
      activeSiegeBatteriesByOwner: this.ownerIndexes.activeSiegeBatteriesByOwner,
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
    return withAfcReachRadii(newlyActivatedReachAnchorsImpl(previous, tile, this.now()), this.state.players);
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
    return withAfcReachRadii(newlyDeactivatedReachAnchorsImpl(previous, tile, this.now()), this.state.players);
  }

  // Border mutation lives in runtime-reach-border-apply.ts, next to the
  // REACH_UPDATE push it feeds. This is the runtime-side adapter: it supplies
  // the world lookups and routes the unsettle downgrade back through replaceTileState.
  private reachBorderApplyContext(): ReachBorderApplyContext {
    return createReachBorderApplyContext({
      gatherReachAnchors: () => this.gatherReachAnchors(), playerSummaryIds: () => this.playerSummaries.keys(), getTile: (k) => this.state.tiles.get(k), isLandTile: this.isLandTileQuery, contestedDirtyState: this.reachContestedDirtyState, downgradeToFrontier: (tileKey, cid0) => applyUnsettleDowngrade<DomainTileState, SimulationTileWireDelta>(tileKey, cid0, { getTile: (k) => this.state.tiles.get(k), replaceTileState: (k, t, cid) => this.replaceTileState(k, t, cid), tileDeltaFromState: (t) => this.tileDeltaFromState(t), emitEvent: (e) => this.emitEvent(e) }),
      autoClaimFrontier: (tileKeys, ownerId, cid0) => applyReachAutoClaim<DomainTileState, SimulationTileWireDelta>(tileKeys, ownerId, cid0, { getTile: (k) => this.state.tiles.get(k), replaceTileState: (k, t, cid) => this.replaceTileState(k, t, cid), tileDeltaFromState: (t) => this.tileDeltaFromState(t), emitEvent: (e) => this.emitEvent(e), onTileClaimed: (k, o, cid) => this.activateReachClaimedTile(k, o, cid) })
    });
  }

  private reachAnchorLifecycleDeps(): ReachAnchorLifecycleDeps { return { reachBorder: this.reachBorder, reachUpdateState: this.reachUpdateState, reachBorderApplyContext: this.reachBorderApplyContext(), isLandTile: this.isLandTileQuery, syncReachVision: (oldBorder, newBorder, changedKeys) => syncReachVision(oldBorder, newBorder, changedKeys, { coverage: this.state.visibilityCoverage, viewersForOwner: (ownerId) => { const player = this.state.players.get(ownerId); return player ? [ownerId, ...player.allies] : [ownerId]; }, callbacks: this.visionTransitions.callbacks }) }; }
  private applyReachAnchorActivation(anchor: ReachAnchor, causeCommandId: string, options?: { skipNeutralAutoClaim?: boolean }): void {
    const result = applyReachAnchorActivationEffects(this.reachAnchorLifecycleDeps(), anchor, causeCommandId, options); this.reachBorder = result.border; if (result.autoClaimedTileKeys.length > 0) this.autoSettleEligibilityRuntime().evaluateFrontierKeysForOwner(anchor.ownerId, result.autoClaimedTileKeys);
  }
  private applyReachAnchorDeactivation(anchor: ReachAnchor, causeCommandId: string): void {
    this.reachBorder = applyReachAnchorDeactivationEffects(this.reachAnchorLifecycleDeps(), anchor, causeCommandId);
  } private grantAetherBridgeReach(playerId: string, x: number, y: number, commandId: string, bridgeId: string, endsAt: number): void { grantAetherBridgeReachImpl(this.pendingAetherBridgeReachExpiry, playerId, x, y, commandId, bridgeId, endsAt, this.now(), (a, c) => this.applyReachAnchorActivation(a, c)); } tickAetherBridgeReachExpiry(nowMs: number = this.now()): void { tickAetherBridgeReachExpiryImpl(this.pendingAetherBridgeReachExpiry, nowMs, (a, c) => this.applyReachAnchorDeactivation(a, c)); } /** Strips OUT_OF_REACH timers a pre-removal snapshot still carries (see clearLegacyOutOfReachDecayStamps) and tells each owner in one TILE_DELTA_BATCH, not one per tile. */ private clearPersistedOutOfReachDecayTimers(): void { const deltasByOwner = new Map<string, SimulationTileWireDelta[]>(); const cleared = clearLegacyOutOfReachDecayStamps(this.state.tiles, (k, t) => this.replaceTileState(k, t, "world-init")); for (const tile of cleared) { if (!tile.ownerId) continue; const delta = this.tileDeltaFromState(tile); const existing = deltasByOwner.get(tile.ownerId); if (existing) existing.push(delta); else deltasByOwner.set(tile.ownerId, [delta]); } for (const [playerId, tileDeltas] of deltasByOwner) this.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: "world-init", playerId, tileDeltas }); if (cleared.length > 0) runtimeLogInfo({ cleared: cleared.length }, "[outOfReachDecay] cleared legacy out-of-reach decay timers at boot"); }

  private isPlayerTileInReach(playerId: string, x: number, y: number): boolean {
    return isPlayerTileInReachImpl(playerId, x, y, this.reachBorder);
  }

  // Pushes the authoritative reach border to every player it just changed for
  // (runtime-reach-update.ts). Without this the client can only approximate
  // its own border and will keep re-issuing EXPANDs the server rejects as
  // OUT_OF_REACH — the mismatch that used to wedge waypoint queues.
  private flushReachUpdatesForCommand(causeCommandId: string): void {
    flushAllReachUpdates(this.reachUpdateState, this.reachContestedDirtyState, { reachTileKeysForPlayer: (id) => this.reachTileKeysForPlayer(id), emitPlayerMessage: (cmd, payload) => this.emitPlayerMessage(cmd, payload), getTile: (k) => this.state.tiles.get(k), tileDeltaFromState: (t) => this.tileDeltaFromState(t), emitEvent: (e) => this.emitEvent(e) }, causeCommandId);
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

  // Worker-thread sync counterpart to reachTileKeysForPlayer above.
  private tacticalViewForPlayer(playerId: string, focusKeys: readonly string[]): AiTacticalView {
    return buildAiTacticalView({ focusKeys, isVisible: (key) => this.state.visibilityCoverage.isVisible(playerId, key),
      crystalDormancy: this.resourceSlotDormancyForPlayer(playerId).CRYSTAL, castRange: this.observatoryCastRadiusFor(playerId),
      bridges: this.activeAetherBridgesForPlayer(playerId), walls: this.activeAetherWallsForPlayer(playerId) });
  }

  spatialFocusFrontTileKeysForPlayer(playerId: string): string[] {
    return this.automationAdvisor.spatialFocusFrontTileKeys(playerId);
  }

  recordAiAutomationDiagnosticFeedback(playerId: string, diagnostic: Pick<AutomationPlannerDiagnostic, "scanFoundActionableCandidate" | "broadFallbackSkipped">): void {
    this.automationAdvisor.recordDiagnosticFeedback(playerId, diagnostic);
  }

  // §5 (resource slots): unlike settledTilesForPlayer, includes FRONTIER
  // tiles too — Siege Batteries (structureShowsOnTile) can be built on an
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
  // — see RuntimeEconomyCaches for the caching and AI coalescing, and
  // refreshEconomyCachesForTileChange for the invalidation gates.
  private resourceSlotSupplyForPlayer(playerId: string, forceFresh = false): ResourceSlotTotals {
    return this.economyCaches.resourceSlotSupply(playerId, forceFresh, () => {
      const playerOf = (id: string): RuntimePlayer | undefined => this.state.players.get(id); // Siphon: drained resource tiles' slots move from owner to caster (siphon-slot-transfer.ts).
      const totals = resourceSlotSupplyWithSiphonTransfer({ playerId, tiles: this.state.tiles, settledTilesForPlayer: (id) => this.settledTilesForPlayer(id), activeObservatoryKeysForPlayer: (id) => this.ownerIndexes.activeObservatoriesByOwner.get(id) ?? [], grantedSupplyForPlayer: (id) => { const p = playerOf(id); return p ? mergeResourceSlotGrants(domainGrantedResourceSlots(p), p.waystationResourceSlotBonus) : undefined; }, fishFoodSlotBonusForPlayer: (id) => { const p = playerOf(id); return p ? techGrantedFishFoodSlotBonus(p) : 0; } }); wonderEffects.applyFoundryHeartSlotBonus(wonderEffects.playerHasWonderType(this.wonderCacheByPlayer, playerId, "FOUNDRY_HEART"), totals); return totals;
    });
  }

  private resourceSlotDemandForPlayer(playerId: string, forceFresh = false): ResourceSlotTotals {
    return this.economyCaches.resourceSlotDemand(playerId, forceFresh, () => {
      const p = this.state.players.get(playerId); const waivers = p ? slotWaiversForPlayer(p) : undefined; return resourceSlotDemandForPlayerImpl(this.ownedTilesForPlayer(playerId), playerId, waivers, this.tileSettledAtByKey);
    });
  }

  // §5.4: dormant structures/towns short on their resource; no build-gate consumer, so it always coalesces for AI.
  private resourceSlotDormancyForPlayer(playerId: string): ResourceSlotDormancy {
    return this.economyCaches.resourceSlotDormancy(playerId, () => { const supply = this.resourceSlotSupplyForPlayer(playerId); const p = this.state.players.get(playerId); const waivers = p ? slotWaiversForPlayer(p) : undefined; return resourceSlotDormantContributorsForPlayerImpl(this.ownedTilesForPlayer(playerId), playerId, supply, waivers, this.tileSettledAtByKey); });
  }
  // Per-connect self-heal for a stale resource-slot cache — see resource-slot-cache-refresh.ts.
  refreshResourceSlotCachesForPlayer(playerId: string): void { refreshResourceSlotCachesForPlayerImpl({ hasPlayer: (id) => this.state.players.has(id), refreshSupplyFresh: (id) => this.resourceSlotSupplyForPlayer(id, true), refreshDemandFresh: (id) => this.resourceSlotDemandForPlayer(id, true), clearDormancyCache: (id) => this.economyCaches.resourceSlotDormancyCacheByPlayer.delete(id), readDormancy: (id) => this.resourceSlotDormancyForPlayer(id) }, playerId); }

  isStructureDormant(playerId: string, tileKey: string, field: DormancyStructureField): boolean {
    return isStructureDormantForTile({ tile: this.state.tiles.get(tileKey), tileKey, playerId, field, dormancy: () => this.resourceSlotDormancyForPlayer(playerId) });
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
  // internally — the various support-structure/combat consumers this feeds
  // (economy-network.ts, runtime-combat-support.ts, runtime-muster-tick.ts)
  // all work in plain tile keys. A structure is dormant here iff it's short on ANY of its
  // required resources (matches isStructureDormant's own logic) — checked
  // across all four resource sets, not just one, since e.g. ANCILLARY_DEPOT
  // requires both FOOD and CRYSTAL.
  dormantFieldKeysForPlayer(playerId: string, field: "fort" | "observatory" | "siegeBattery" | "economicStructure"): ReadonlySet<string> {
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
  // (Manufactory/Bank/Trade Nexus/Clearing House/Ancillary Depot/Neural Works/Customs
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
      townNetworkCacheByPlayer: this.economyCaches.townNetworkCacheByPlayer,
      townConnectivityStateByPlayer: this.economyCaches.townConnectivityStateByPlayer,
      tileYieldContextCacheByPlayer: this.economyCaches.tileYieldContextCacheByPlayer,
      quartermastersOfficeTilesByOwner: this.ownerIndexes.quartermastersOfficeTilesByOwner,
      ...(this.trackSyncMainThreadTask !== undefined ? { trackSyncMainThreadTask: this.trackSyncMainThreadTask } : {}),
      players: this.state.players,
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      settledTilesForPlayer: (playerId) => this.settledTilesForPlayer(playerId),
      foodDormantTownKeysForPlayer: (playerId) => this.foodDormantTownKeysForPlayer(playerId),
      dormantEconomicStructureKeysForPlayer: (playerId) => this.dormantEconomicStructureKeysForPlayer(playerId)
    };
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

  // Ancillary Depot's flat cap
  // bonus is a plain per-structure count (ancillaryDepotTilesByOwner) — NOT
  // town-adjacency-scoped, because ANCILLARY_DEPOT uses "same_tile" placement
  // (structure-placement-metadata.json) and can sit on any settled/resource/
  // support/dock tile with no town nearby at all, unlike NEURAL_WORKS/
  // CLEARING_HOUSE's "town_support" mode. The Neural Works network bonus is
  // separate: it only amplifies Ancillary Depots built adjacent to (supporting)
  // a town inside a Neural-Works-having network — see
  // neuralWorksNetworkAncillaryDepotCountForPlayer. Cached and invalidated at the
  // same tile-mutation chokepoint as the town-network cache, so a manpower
  // read (called many times per tick, per the guardrails in
  // docs/game-mechanics.md §13/AGENTS.md) stays an O(1) map lookup except on
  // an actual cache-miss.
  private cachedManpowerStructureBonusForPlayer(player: RuntimePlayer): ManpowerStructureBonus {
    return cachedManpowerStructureBonusForPlayerImpl(
      {
        tiles: this.state.tiles,
        manpowerStructureBonusCacheByPlayer: this.economyCaches.manpowerStructureBonusCacheByPlayer,
        ancillaryDepotTilesByOwner: this.ownerIndexes.ancillaryDepotTilesByOwner,
        neuralWorksTilesByOwner: this.ownerIndexes.neuralWorksTilesByOwner,
        reserveLatticeTilesByOwner: this.ownerIndexes.reserveLatticeTilesByOwner,
        ancillaryFactoryTilesByOwner: this.ownerIndexes.ancillaryFactoryTilesByOwner,
        quartermastersOfficeTilesByOwner: this.ownerIndexes.quartermastersOfficeTilesByOwner,
        incubationEngineTilesByOwner: this.ownerIndexes.incubationEngineTilesByOwner,
        censusHallTilesByOwner: this.ownerIndexes.censusHallTilesByOwner,
        townNetworkCacheByPlayer: this.economyCaches.townNetworkCacheByPlayer,
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

  // §4.4: "only one Neural Works may be built per connected-town network" —
  // checked at build time (see resolveTownSupportTarget in
  // runtime-structure-command-handlers.ts).
  private neuralWorksAlreadyInNetworkForPlayer(playerId: string, townKey: string): boolean {
    return neuralWorksAlreadyInNetworkForPlayerImpl(this.townNetworkContext(), playerId, townKey);
  }

  // Reserve Lattice (tech-tree redesign): "only one Reserve Lattice may be
  // built per connected-town network" — mirrors neuralWorksAlreadyInNetworkForPlayer
  // exactly, retargeted.
  private reserveLatticeAlreadyInNetworkForPlayer(playerId: string, townKey: string): boolean {
    return reserveLatticeAlreadyInNetworkForPlayerImpl(this.townNetworkContext(), playerId, townKey);
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
  // (Incubation Engine) count, for the +20,000 population per connected city bonus.
  private censusHallConnectedIncubationEngineBonusCountForPlayer(playerId: string, townKey: string): number {
    return censusHallConnectedIncubationEngineBonusCountForPlayerImpl(this.townNetworkContext(), playerId, townKey);
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

  private ensureGrossIncomeSettlementForPlayer(playerId: string, commandId: string): boolean {
    return ensureGrossIncomeSettlementForPlayerImpl(this.incomeStorageContext(), playerId, commandId);
  }

  private estimatedIncomePerMinuteForPlayer(playerId: string): number {
    return estimatedIncomePerMinuteForPlayerImpl(this.incomeStorageContext(), playerId);
  }

  private activeDevelopmentProcessCountForPlayer(playerId: string): number { return activeDevelopmentProcessCountForSummary(this.summaryForPlayer(playerId)); }

  // Event-driven auto-settle eligibility -- see runtime-auto-settle-eligibility[-context].ts.
  private autoSettleEligibilityRuntime(): AutoSettleEligibilityRuntime {
    return buildAutoSettleEligibilityRuntime({
      tiles: this.state.tiles,
      players: this.state.players,
      locksByTile: this.state.locksByTile,
      pendingSettlementsByTile: this.pendingSettlementsByTile,
      frontierTilesByOwner: this.ownerIndexes.frontierTilesByOwner,
      eligibleFrontierByOwner: this.eligibleFrontierByOwner,
      grownTownSupportRingByOwner: this.grownTownSupportRingByOwner,
      isVisible: (playerId, tileKey) => this.state.visibilityCoverage.isVisible(playerId, tileKey),
      isPlayerTileInReach: (playerId, x, y) => this.isPlayerTileInReach(playerId, x, y),
      hasAvailableDevelopmentSlot: (playerId) => this.hasAvailableDevelopmentSlot(playerId),
      startSettlementProcess: (input) => this.startSettlementProcess(input),
      nextTerritoryAutomationCommandId: (label, playerId, tileKey, at) => this.nextTerritoryAutomationCommandId(label, playerId, tileKey, at),
      now: () => this.now()
    });
  }

  // Fires on every tile mutation (frontier membership, town capture, tier
  // change) -- see maintainForTileChange's own doc comment for the details.
  private maintainAutoSettleEligibilityForTileChange(tileKey: string, previous: DomainTileState | undefined, next: DomainTileState): void {
    this.autoSettleEligibilityRuntime().maintainForTileChange(tileKey, previous, next);
  }

  // Tech-unlock hook -- see sweepFrontierResourceTechUnlock's own doc comment.
  private sweepFrontierResourceTechUnlock(playerId: string, revealedCategory: string): void {
    this.autoSettleEligibilityRuntime().sweepFrontierResourceTechUnlock(playerId, revealedCategory);
  }

  private autoSettlementQueueForPlayer(playerId: string): Array<{ x: number; y: number }> {
    return this.autoSettleEligibilityRuntime().orderedQueueForPlayer(playerId);
  }

  storageCapForPlayer(playerId: string): EmpireStorageCap | undefined {
    return storageCapForPlayerImpl(this.incomeStorageContext(), playerId);
  }

  private playerStateUpdateContext(): RuntimePlayerStateUpdateContext {
    return {
      players: this.state.players,
      lastEmittedStorageCapByPlayer: this.lastEmittedStorageCapByPlayer,
      hasActiveOwnedAfc: id => [...this.summaryForPlayer(id).ownedAfcTileKeys].some(key => this.state.tiles.get(key)?.afc?.status === "active"),
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
      pendingSettlementsSnapshotForPlayer: (playerId) => pendingSettlementsSnapshotForPlayer(this.summaryForPlayer(playerId)),
      autoSettlementQueueForPlayer: (playerId) => this.autoSettlementQueueForPlayer(playerId),
      activeDevelopmentProcessCountForPlayer: (playerId) => this.activeDevelopmentProcessCountForPlayer(playerId),
      weaponsFactoryCountsForPlayer: (playerId) => weaponsFactoryCountsFromIndex(this.ownedStructureCountByPlayerByType, playerId)
    };
  }

  private emitPlayerStateUpdate(command: Pick<CommandEnvelope, "commandId" | "playerId">, playerId = command.playerId): void {
    this.playerUpdateEmitter.request(command, playerId);
  }

  private handleSyncAllianceCommand(command: CommandEnvelope): void {
    handleSyncAllianceCommandImpl(
      {
        settleEconomyBeforeChange: (player) => { this.applyEconomyAccrual(player, this.now()); this.refreshManpowerOnly(player); },
        invalidateEconomyAfterChange: (id) => { this.economyCaches.invalidateEconomySnapshot(id); this.economyCaches.clearTownNetworks(); this.economyCaches.upkeepAccrualCacheByPlayer.delete(id); },
        emitPlayerStateUpdate: (command) => {
          const player = this.state.players.get(command.playerId);
          if (player) player.manpowerCapSnapshot = this.playerManpowerCap(player);
          this.emitPlayerStateUpdate(command);
        },
        players: this.state.players,
        visibilityCoverage: this.state.visibilityCoverage,
        visionTransitionCallbacks: this.visionTransitions.callbacks, reachBorder: this.reachBorder,
        emitEvent: (event) => this.emitEvent(event),
        emitPlayerMessage: (cmd, payload) => this.emitPlayerMessage(cmd, payload)
      },
      command
    );
    this.oracleDetections.queueRefresh();
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

  private enqueueJob(
    lane: QueueLane,
    run: () => void,
    commandType?: CommandEnvelope["type"],
    scheduling: "immediate" | "background" = "immediate",
    commandId?: string
  ): void {
    this.jobQueue.enqueue(lane, run, commandType, scheduling, commandId);
  }

  private handleFrontierCommand(command: CommandEnvelope, actionType: FrontierCommandType): FrontierCommandResult { return handleFrontierCommandImpl(this.frontierCommandContext(), command, actionType); }

  private startSettlementProcess(input: SettlementStartInput): void {
    startSettlementProcessImpl({
      players: this.state.players, addPendingSettlement: (record) => this.addPendingSettlement(record), scheduleAfter: this.scheduleAfter,
      resolvePendingSettlement: (resolution) => this.resolvePendingSettlement(resolution), emitEvent: (event) => this.emitEvent(event),
      emitPlayerStateUpdate: (command) => this.emitPlayerStateUpdate(command)
    }, input);
  }

  // Extracted from startSettlementProcess's scheduled-timer closure so
  // RUSH_BUY (§6.3) can trigger the exact same completion early, without a
  // second copy of this logic. Idempotent via pendingSettlementMatches: if
  // this already ran (rush-buy) by the time the original timer fires, the
  // match check fails and the timer's call is a no-op — same pattern
  // completeStructureBuild already relies on for its own status guard.
  private resolvePendingSettlement(input: SettlementResolutionInput): void {
    resolvePendingSettlementImpl({
      pendingSettlementsByTile: this.pendingSettlementsByTile,
      tiles: this.state.tiles, players: this.state.players,
      removePendingSettlement: (key) => this.removePendingSettlement(key),
      drainDevQueue: (ownerId) => tryDrainDevQueueImpl(this.devQueueCommandContext(), ownerId),
      retireQueuedSettlement: (ownerId, key) => {
        const context = this.devQueueCommandContext();
        clearCompletedSettleEntry(context, ownerId, context.summaryForPlayer(ownerId), key);
      },
      drainAutoSettle: (ownerId) => this.autoSettleEligibilityRuntime().drainForOwner(ownerId),
      drainBuildTail: (ownerId, key, x, y) => tryDrainClaimContinuationBuildTailImpl(this.devQueueCommandContext(), ownerId, key, x, y),
      emitPlayerStateUpdate: (command) => this.emitPlayerStateUpdate(command),
      now: () => this.now(),
      replaceTileState: (key, tile) => this.replaceTileState(key, tile),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      emitEvent: (event) => this.emitEvent(event),
      emitAutoFillForSettlement: (tile, ownerId, key) => this.emitAutoFillForSettlement(tile, ownerId, key)
    }, input);
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
    if (target.ownerId !== command.playerId || target.ownershipState !== "FRONTIER") { this.rejectCommand(command, "SETTLE_INVALID", "tile is not one of your frontier tiles"); return; }
    if (this.state.locksByTile.targetLockAt(targetKey)?.actionType === "ATTACK") { this.rejectCommand(command, "SETTLE_INVALID", "tile is under attack"); return; } // attack-development-hold.ts
    // Encirclement guard: a cut-off tile cannot be settled. Settling a
    // disconnected tile would let a player convert an encircled pocket into
    // permanent territory, defeating the encirclement mechanic. Natural
    // frontier expiry also uses `frontierDecayAt`, so use the explicit owner.
    if (target.frontierDecayKind === "ENCIRCLEMENT") { this.rejectCommand(command, "ORIGIN_CUT_OFF", "tile is cut off from supply and cannot be garrisoned"); return; }
    if (target.terrain !== "LAND") { this.rejectCommand(command, "SETTLE_INVALID", "tile is not valid land"); return; }
    // Fixed-border reach (packages/shared/src/reach/reach.ts), same gate as
    // EXPAND's OUT_OF_REACH check. Town/dock tiles and tiles holding a captured
    // building are exempt (settleIgnoresReach) -- the same tiles the sim
    // auto-settles out of reach on capture, so manual Garrison must accept them.
    if (!settleIgnoresReach(target) && !this.isPlayerTileInReach(command.playerId, target.x, target.y)) {
      this.rejectCommand(command, "OUT_OF_REACH", "tile is outside your reach"); return;
    }
    if (handleDuplicatePendingSettlement({ emitEvent: (e) => this.emitEvent(e), rejectCommand: (c, code, msg) => this.rejectCommand(c, code, msg) }, this.pendingSettlementsByTile.get(targetKey), command)) return; // see runtime-settle-duplicate.ts
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
      this.rejectCommand(command, "SETTLE_CANCEL_INVALID", "no garrisoning in progress on tile");
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
      emitEvent: (event) => this.emitEvent(event), emitPlayerStateUpdate: (command) => this.emitPlayerStateUpdate(command),
      rejectCommand: (command, code, message) => this.rejectCommand(command, code, message),
      hasAvailableDevelopmentSlot: (playerId) => this.hasAvailableDevelopmentSlot(playerId), isPlayerOnline: (playerId) => this.isPlayerSubscribed?.(playerId) ?? false, isTileUnderAttack: (tileKey) => this.state.locksByTile.targetLockAt(tileKey)?.actionType === "ATTACK",
      nextDrainCommandId: (playerId, tileKey) => this.nextTerritoryAutomationCommandId("dev-queue-drain", playerId, tileKey, this.now()),
      dispatchSettle: (command) => this.handleSettleCommand(command),
      dispatchBuild: (command) => handleBuildStructureCommandImpl(this.structureCommandContext(), command),
      dispatchRemoveStructure: (command) => handleRemoveStructureCommandImpl(this.structureCommandContext(), command), ...devQueueBuildReservationContext(this.structureCommandContext())
    };
  }

  // See runtime-claim-continuation-command-handlers.ts (context builder lives there; oversized file).
  private claimContinuationCommandContext() { return claimContinuationContextFromDevQueueContext(this.devQueueCommandContext(), this.state.tiles); }
  private isHostileTileOwner(playerId: string, targetOwnerId: string | undefined): boolean {
    if (!targetOwnerId || targetOwnerId === playerId) return false;
    const actor = this.state.players.get(playerId); return !actor || !isAlliedOrTruced(actor, targetOwnerId); }
  private waypointQueueCommandContext(): RuntimeWaypointQueueCommandContext { return { summaryForPlayer: (playerId) => this.summaryForPlayer(playerId), now: () => this.now(), emitEvent: (event) => this.emitEvent(event), emitPlayerStateUpdate: (command) => this.emitPlayerStateUpdate(command), rejectCommand: (command, code, message) => this.rejectCommand(command, code, message), tileAt: (x, y) => this.state.tiles.get(simulationTileKey(x, y)), isHostileOwner: (playerId, targetOwnerId) => this.isHostileTileOwner(playerId, targetOwnerId), nextDrainCommandId: (playerId, x, y) => this.nextTerritoryAutomationCommandId("waypoint-queue-drain", playerId, simulationTileKey(x, y), this.now()), dispatchFrontierCommand: (command, actionType) => this.handleFrontierCommand(command, actionType), isPlayerOnline: (playerId) => !this.waypointDrainScheduler.isDrainEligible(playerId), hasActiveLockForPlayer: (playerId) => activeFrontierLocksForPlayerImpl(this.state.locksByTile, playerId).length > 0 }; }
  /** Tick hook (docs/waypoint-client-planning-plan.md §4): drains one leg per drain-eligible player with a non-empty waypoint queue. */ tickWaypointDrain(): void { tickWaypointDrainImpl({ scheduler: this.waypointDrainScheduler, playerIdsWithWaypointQueue: () => [...this.playerSummaries].filter(([, s]) => s.waypointQueue.length > 0).map(([id]) => id), drainForPlayer: (playerId) => this.tryDrainWaypointQueue(playerId) }); }
  private tryDrainWaypointQueue(playerId: string): void { tryDrainWaypointQueueImpl(this.waypointQueueCommandContext(), playerId); }

  /**
   * Server-side auto-settle for every player, gated per tile category by the
   * player's autoSettle prefs (shared auto-settle-prefs.ts; AI/legacy = all on,
   * new humans = off until they answer the join prompt). Same manpower/gold
   * cost and duration as a manual SETTLE — this only removes the need to click
   * SETTLE. Called once per territory-automation tick.
   */
  private runAutoSettleForPlayer(playerId: string, nowMs: number): number {
    return this.autoSettleEligibilityRuntime().runTickForOwner(playerId, nowMs);
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
      pickReadyOwnedObservatoryAny: (playerId, now) => this.pickReadyOwnedObservatoryAny(playerId, now),
      pickReadyOwnedObservatoryForTarget: (playerId, targetX, targetY, now) => this.pickReadyOwnedObservatoryForTarget(playerId, targetX, targetY, now),
      stampObservatoryCooldown: (tileKey, durationMs, now, commandId, playerId) =>
        this.stampObservatoryCooldown(tileKey, durationMs, now, commandId, playerId),
      buildRevealEmpireStats: (target) => this.buildRevealEmpireStats(target),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      filterTileDeltasForPlayer: (tileDeltas, playerId) => this.filterTileDeltasForPlayer(tileDeltas, playerId),
      isTileShieldedByEnemyAegisDome: (actorId, targetX, targetY) => this.isTileShieldedByEnemyAegisDome(actorId, targetX, targetY), isTileShieldedByEnemyObservatory: (actorId, targetX, targetY) => isTileShieldedByEnemyObservatoryImpl(this.state.tiles, (playerId, tileKey, field) => this.isStructureDormant(playerId, tileKey, field), actorId, targetX, targetY, this.now(), (ownerId) => this.ownerIndexes.activeObservatoriesByOwner.get(ownerId) ?? []),
      isStructureDormant: (playerId, tileKey, field) => this.isStructureDormant(playerId, tileKey, field),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      applyEncirclement: (changedKeys, playerId, commandId, options) => this.applyEncirclement(changedKeys, playerId, commandId, options),
      isCoastalLand: (x, y) => this.isCoastalLand(x, y),
      closestAetherBridgeOrigin: (playerId, targetX, targetY) =>
        this.closestAetherBridgeOrigin(playerId, targetX, targetY),
      wallSegments: (originX, originY, direction, length) => this.wallSegments(originX, originY, direction, length),
      activeAetherBridgesForPlayer: (playerId) => this.activeAetherBridgesForPlayer(playerId),
      activeAetherWallsForPlayer: (playerId) => this.activeAetherWallsForPlayer(playerId),
      crossingBlockedByAetherWall: (fromX, fromY, toX, toY) =>
        this.crossingBlockedByAetherWall(fromX, fromY, toX, toY),
      grantAetherBridgeReach: (playerId, x, y, commandId, bridgeId, endsAt) => this.grantAetherBridgeReach(playerId, x, y, commandId, bridgeId, endsAt),
      siphonModeLifecycle: this.siphonModeLifecycle
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
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      applyEncirclement: (changedKeys, playerId, commandId, options) => this.applyEncirclement(changedKeys, playerId, commandId, options),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      bumpTerrainEpoch: () => { this.terrainEpoch = nextTerrainEpoch++; },
      isStructurePowered: (ownerId, tileKey, structureType) => this.isStructurePowered(ownerId, tileKey, structureType),
      isTileShieldedByEnemyAegisDome: (actorId, targetX, targetY) => this.isTileShieldedByEnemyAegisDome(actorId, targetX, targetY),
      isTileBombardBlockedByRadar: (actorId, targetX, targetY) =>
        isTileBombardBlockedByRadarImpl(
          this.state.tiles, (playerId, tileKey, field) => this.isStructureDormant(playerId, tileKey, field),
          actorId, targetX, targetY, this.now()
        ),
      isStructureDormant: (playerId, tileKey, field) => this.isStructureDormant(playerId, tileKey, field),
      emitPlayerMessage: (command, payload) => this.emitPlayerMessage(command, payload),
      getAbilityCooldownUntil: (playerId, abilityKey) => this.getAbilityCooldownUntil(playerId, abilityKey),
      setAbilityCooldownUntil: (playerId, abilityKey, untilMs) => this.setAbilityCooldownUntil(playerId, abilityKey, untilMs),
      appendPlayerEventLogEntry: (player, input) => appendPlayerEventLogEntry(player, input),
      drainAutoSettleForOwner: (playerId) => { this.autoSettleEligibilityRuntime().drainForOwner(playerId); }
    });
  }

  private getAbilityCooldownUntil(playerId: string, abilityKey: string): number { return getAbilityCooldownUntilImpl(this.abilityCooldowns, playerId, abilityKey); }

  private setAbilityCooldownUntil(playerId: string, abilityKey: string, untilMs: number): void { setAbilityCooldownUntilImpl(this.abilityCooldowns, playerId, abilityKey, untilMs); }

  private isTileShieldedByAegisLock(actorId: string, targetX: number, targetY: number): boolean { return isTileShieldedByAegisLockImpl(this.state.tiles, this.abilityCooldowns, this.now(), actorId, targetX, targetY); }

  private progressionCommandContext(): RuntimeProgressionCommandContext {
    return buildProgressionCommandContext({
      settleEconomyBeforeUpgrade: (player) => { this.applyEconomyAccrual(player, this.now()); this.refreshManpowerOnly(player); },
      isTileLocked: (key) => Boolean(this.state.locksByTile.targetLockAt(key)),
      reconcileAfcReach: (playerId, commandId) => { refreshAfcFortFacts(playerId, this.summaryForPlayer(playerId).territoryTileKeys, this.state.tiles, this.state.players, (key, tile) => { this.replaceTileState(key, tile, commandId); this.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId, tileDeltas: [this.tileDeltaFromState(tile)] }); }); this.oracleDetections.refreshAll(); for (const anchor of this.gatherReachAnchors()) if (anchor.ownerId === playerId) this.applyReachAnchorActivation(anchor, commandId); },
      players: this.state.players,
      tiles: this.state.tiles,
      emitEvent: (event) => this.emitEvent(event),
      emitPlayerStateUpdate: (command, playerId) => this.emitPlayerStateUpdate(command, playerId),
      addStrategicResource: (player, resource, amount) => this.addStrategicResource(player, resource, amount),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId), autoClaimFrontier: (tileKeys, ownerId, causeCommandId) => applyReachAutoClaim<DomainTileState, SimulationTileWireDelta>(tileKeys, ownerId, causeCommandId, { getTile: (k) => this.state.tiles.get(k), replaceTileState: (k, t, cid) => this.replaceTileState(k, t, cid), tileDeltaFromState: (t) => this.tileDeltaFromState(t), emitEvent: (e) => this.emitEvent(e), onTileClaimed: (k, o, cid) => this.activateReachClaimedTile(k, o, cid) }),
      snapshotTileCache: this.snapshotTileCache,
      townConnectivityStateByPlayer: this.economyCaches.townConnectivityStateByPlayer,
      dockLinksByDockTileKey: this.state.dockLinksByDockTileKey,
      settledTilesForPlayer: (playerId) => this.settledTilesForPlayer(playerId),
      outpostVisionDeps: () => this.structureVision.outpostVisionDeps(),
      visibilityCoverage: this.state.visibilityCoverage,
      visionTransitionCallbacks: this.visionTransitions.callbacks,
      now: () => this.now(),
      invalidateTileStringifyCache: (tileKey) => this.tileDeltaStringifyCache.invalidate(tileKey),
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      economySnapshotCacheByPlayer: this.economyCaches.economySnapshotCacheByPlayer,
      resourceSlotDemandCacheByPlayer: this.economyCaches.resourceSlotDemandCacheByPlayer,
      resourceSlotDormancyCacheByPlayer: this.economyCaches.resourceSlotDormancyCacheByPlayer,
      tileYieldContextCacheByPlayer: this.economyCaches.tileYieldContextCacheByPlayer,
      townNetworkCacheByPlayer: this.economyCaches.townNetworkCacheByPlayer,
      manpowerStructureBonusCacheByPlayer: this.economyCaches.manpowerStructureBonusCacheByPlayer,
      upkeepAccrualCacheByPlayer: this.economyCaches.upkeepAccrualCacheByPlayer,
      ownedOutpostTilesForPlayer: (playerId) => this.structureVision.ownedOutpostTilesForPlayer(playerId),
      incomePerMinuteForPlayer: (playerId) => this.incomePerMinuteForPlayer(playerId),
      decrementShardRainSiteCount: () => this.shardRain.decrementSiteCount(),
      clearShardRainExpiry: () => this.shardRain.clearExpiry(),
      clearLastShardRainHello: () => this.shardRain.clearHellos(),
      onShardCollected: this.onShardCollected,
      resourceSlotSupplyForPlayer: (playerId) => this.resourceSlotSupplyForPlayer(playerId),
      resourceSlotDemandForPlayer: (playerId) => this.resourceSlotDemandForPlayer(playerId), tileDeltaRevealOnly: (tile, playerId) => this.tileDeltaRevealOnly(tile, playerId),
      maintainAutoSettleEligibility: (tileKey, previous, next) => this.maintainAutoSettleEligibilityForTileChange(tileKey, previous, next),
      sweepFrontierResourceTechUnlock: (playerId, revealedCategory) => this.sweepFrontierResourceTechUnlock(playerId, revealedCategory)
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
      this.state.tiles, ownerId, tileKey, structureType,
      (playerId, dormantTileKey, field) => this.isStructureDormant(playerId, dormantTileKey, field), this.now()
    );
  }

  // Aegis Dome shields tiles within AEGIS_DOME_PROTECTION_RADIUS for its
  // owner. Worldbreaker Shot is the first ability that respects this — if an
  // enemy player has an active, powered Aegis Dome within range of the target
  // tile, the strike is blocked.
  isTileShieldedByEnemyAegisDome(actorId: string, targetX: number, targetY: number): boolean {
    return isTileShieldedByEnemyAegisDomeImpl(
      this.state.tiles, (playerId, tileKey, field) => this.isStructureDormant(playerId, tileKey, field),
      actorId, targetX, targetY, this.now()
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

  // Moved to observatory-cooldown-stamp.ts so the Siphon lifecycle shares the exact same write.
  private stampObservatoryCooldown(tileKey: string, durationMs: number, now: number, commandId: string, playerId: string): void {
    stampObservatoryCooldownImpl({ tiles: this.state.tiles, replaceTileState: (key, tile, id) => this.replaceTileState(key, tile, id), tileDeltaFromState: (tile) => this.tileDeltaFromState(tile), emitEvent: (event) => this.emitEvent(event) }, tileKey, durationMs, now, commandId, playerId);
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

  private expandTileDeltasWithLinkedDocks(deltas: Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"]): Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"] {
    return expandTileDeltasWithLinkedDocks({ tiles: this.state.tiles, dockLinksByDockTileKey: this.state.dockLinksByDockTileKey, tileDeltaFromState: (tile) => this.tileDeltaFromState(tile) }, deltas);
  }

  private scheduleLockResolution(lock: LockRecord): void {
    this.scheduleAfter(Math.max(1, lock.resolvesAt - this.now()), () => {
      this.resolveLock(lock);
    });
  }

  private tileDeltaFromState(tile: DomainTileState, context?: RuntimeTileYieldEconomyContext, options?: { full?: boolean }): SimulationTileWireDelta {
    return tileDeltaFromStateImpl(
      {
        players: this.state.players,
        tileDeltaStringifyCache: this.tileDeltaStringifyCache,
        now: () => this.now(),
        tileYieldEconomyContextForPlayer: (player) => this.tileYieldEconomyContextForPlayer(player),
        enrichTileWithTownContext: (t, player, ctx) => this.enrichTileWithTownContext(t, player, ctx),
        yieldViewEconomyContext: (player, ctx) => yieldViewEconomyContextImpl(player, ctx, this.state.tiles, this.state.dockLinksByDockTileKey, this.state.players),
        reachBorderOwnerAt: (x, y) => reachBorderOwnerAtImpl(this.reachBorder, x, y)
      },
      tile, context, options
    );
  }

  private tileDeltaRevealOnly(tile: DomainTileState, playerId?: string): SimulationTileWireDelta {
    return tileDeltaRevealOnlyImpl(tile, this.tileDeltaStringifyCache, playerId ? this.state.players.get(playerId) : undefined, (x, y) => reachBorderOwnerAtImpl(this.reachBorder, x, y));
  }

  private strategicResourceAmount(player: DomainPlayer, resource: StrategicResourceKey): number { return strategicResourceAmountImpl(player, resource); }

  private spendStrategicResource(player: DomainPlayer, resource: StrategicResourceKey, amount: number): boolean { return spendStrategicResourceImpl(player, resource, amount); }

  private addStrategicResource(player: DomainPlayer, resource: StrategicResourceKey, amount: number): void { addStrategicResourceImpl(player, resource, amount); }

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

  private structureCommandContext(): RuntimeStructureCommandContext {
    return buildStructureCommandContext({
      players: this.state.players,
      tiles: this.state.tiles,
      musterTilesByOwner: this.ownerIndexes.musterTilesByOwner,
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
      ownedStructureCountForPlayer: (playerId, structureType) => this.ownedStructureCountForPlayer(playerId, structureType), reachBorderOwnerAt: (x, y) => reachBorderOwnerAtImpl(this.reachBorder, x, y),
      resourceSlotSupplyForPlayer: (playerId) => this.resourceSlotSupplyForPlayer(playerId, true), // forceFresh: hasFreeResourceSlots can't tolerate stale totals
      resourceSlotDemandForPlayer: (playerId) => this.resourceSlotDemandForPlayer(playerId, true),
      supportedTownKeysForTile: (playerId, x, y) => this.supportedTownKeysForTile(playerId, x, y),
      supportedDockKeysForTile: (playerId, x, y) => this.supportedDockKeysForTile(playerId, x, y),
      economicStructureForSupportedTown: (playerId, townKey, structureType) => this.economicStructureForSupportedTown(playerId, townKey, structureType),
      firstAvailableTownSupportTile: (playerId, townKey, structureType) => this.firstAvailableTownSupportTile(playerId, townKey, structureType),
      assignedTownKeyForSupportTile: (playerId, x, y) => this.assignedTownKeyForSupportTile(playerId, x, y),
      neuralWorksAlreadyInNetwork: (playerId, townKey) => this.neuralWorksAlreadyInNetworkForPlayer(playerId, townKey),
      reserveLatticeAlreadyInNetwork: (playerId, townKey) => this.reserveLatticeAlreadyInNetworkForPlayer(playerId, townKey),
      hasNearbyQuartermastersOffice: (playerId, x, y) => this.hasNearbyQuartermastersOfficeForPlayer(playerId, x, y),
      replaceTileState: (tileKey, tile, commandId) => this.replaceTileState(tileKey, tile, commandId),
      tileDeltaFromState: (tile) => this.tileDeltaFromState(tile),
      bumpTerrainEpoch: () => { this.terrainEpoch = nextTerrainEpoch++; },
      completeStructureBuild: (targetKey, ownerId, structureType, commandId) => this.completeStructureBuild(targetKey, ownerId, structureType, commandId),
      completeStructureRemoval: (targetKey, ownerId, commandId) => this.completeStructureRemoval(targetKey, ownerId, commandId),
      flushReachUpdates: (causeCommandId) => this.flushReachUpdatesForCommand(causeCommandId), appendPlayerEventLogEntry: (player, input) => appendPlayerEventLogEntry(player, input), recordPersonalImpact: (event) => this.activityLogs.recordPersonalImpact(event)
    });
  }

  private completeStructureBuild(targetKey: string, ownerId: string, structureType: string, commandId: string): void {
    completeStructureBuildImpl(this.structureCommandContext(), targetKey, ownerId, structureType, commandId);
    tryDrainDevQueueImpl(this.devQueueCommandContext(), ownerId); // slot freed -- see tryDrainDevQueueImpl doc comment
  }

  private completeStructureRemoval(targetKey: string, ownerId: string, commandId: string): void { completeStructureRemovalImpl(this.structureCommandContext(), targetKey, ownerId, commandId); }

  private handleCancelCaptureCommand(command: CommandEnvelope): void { handleCancelCaptureCommandImpl(this.combatSupportContext(), command); }

  private buildLockedCombatResolution(lock: LockedCombatInput): LockedCombatResolution | undefined {
    return buildLockedCombatResolutionImpl(this.combatSupportContext(), lock);
  }

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
    const relocated = buildRelocatedSettlementTile(target, options.namePrefix, population);
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

  private applySettledCapturePlunder(input: {
    attacker: DomainPlayer;
    defender: DomainPlayer;
    gold: number;
    defenderGoldLoss: number;
  }): void {
    applySettledCapturePlunderImpl(input);
  }

  private applyLockedManpowerDelta(player: DomainPlayer, manpowerDelta: number): number { return applyLockedManpowerDeltaImpl(player, manpowerDelta); }

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
      musterTilesByOwner: this.ownerIndexes.musterTilesByOwner,
      musterReservedByKey: this.musterReservedByKey, locksByTile: this.state.locksByTile
    });
  }

  /**
   * Manpower an attacker must have mustered to strike this target. Phase 5
   * baseline: flat attack cost, raised to a flat per-fort-tier floor,
   * lowered for FRONTIER targets (forts only defend once SETTLED).
   */
  private requiredMusterForTarget(target: DomainTileState, attackerId?: string): number {
    return requiredMusterForTargetImpl(target, attackerId ? this.state.players.get(attackerId) : undefined, target.ownerId ? this.state.players.get(target.ownerId) : undefined);
  }

  /**
   * Spend mustered manpower from the origin tile after a resolved attack under
   * the muster system. The pool is untouched (it was already drained into the
   * muster during accumulation).
   */
  private consumeOriginMuster(originKey: string, playerId: string, amount: number): void {
    consumeOriginMusterImpl(this.combatResolutionContext(), originKey, playerId, amount);
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
      handleAfcSpecializationCommand: (command) => handleAfcActiveCommand({ abilities: this.abilityCommandContext(), playerManpowerCap: (player) => this.playerManpowerCap(player), settleEconomy: player => this.applyEconomyAccrual(player, this.now()), refreshManpower: (player) => this.refreshManpowerOnly(player), emitPlayerStateUpdate: (cmd) => this.emitPlayerStateUpdate(cmd) }, command),
      emitUnsupported: (command) => {
        this.rejectCommand(command, "UNSUPPORTED", `${command.type} not yet migrated to the new simulation service`);
      },
      handleSettleCommand: (command) => this.handleSettleCommand(command),
      handleBuildStructureCommand: (command) => handleBuildStructureCommandImpl(this.structureCommandContext(), command),
      normalizeLegacyBuildCommand,
      handleSetMusterCommand: (command) => { handleSetMusterCommandImpl(this.structureCommandContext(), command); this.musterTicker.tickMusterForPlayer(command.playerId, this.now()); },
      handleClearMusterCommand: (command) => handleClearMusterCommandImpl(this.structureCommandContext(), command), handleUpgradeMusterCapCommand: (command) => handleUpgradeMusterCapCommandImpl(this.structureCommandContext(), command),
      handleWatchMusterCommand: (command) => handleWatchMusterCommandImpl(this.watchedMusterTileByPlayer, command, (e) => this.emitEvent(e)),
      handleUnwatchMusterCommand: (command) => handleUnwatchMusterCommandImpl(this.watchedMusterTileByPlayer, command, (e) => this.emitEvent(e)),
      handleCancelCaptureCommand: (command) => this.handleCancelCaptureCommand(command),
      handleCancelFortBuildCommand: (command) => handleCancelFortBuildCommandImpl(this.structureCommandContext(), command),
      handleCancelStructureBuildCommand: (command) => handleCancelStructureBuildCommandImpl(this.structureCommandContext(), command),
      handleRushBuyCommand: (command) => handleRushBuyCommandImpl(this.rushBuyCommandContext(), command),
      handleCancelSettleCommand: (command) => this.handleCancelSettleCommand(command),
      handleRemoveStructureCommand: (command) => handleRemoveStructureCommandImpl(this.structureCommandContext(), command),
      handleCancelSiegeBatteryBuildCommand: (command) => handleCancelSiegeBatteryBuildCommandImpl(this.structureCommandContext(), command),
      handleCheckStrandedRegionCommand: (command) => handleCheckStrandedRegionCommandImpl(this.strandedFrontier, command),
      handleUncaptureTileCommand: (command) => handleUncaptureTileCommandImpl(this.economicStructureCommandContext(), command),
      handleChooseTechCommand: (command) => handleChooseTechCommandImpl(this.progressionCommandContext(), command),
      handleChooseDomainCommand: (command) => handleChooseDomainCommandImpl(this.progressionCommandContext(), command),
      handleSetConverterStructureEnabledCommand: (command) => handleSetConverterStructureEnabledCommandImpl(this.economicStructureCommandContext(), command),
      handleSetConverterStructureModeCommand: (command) => handleSetConverterStructureModeCommandImpl(this.economicStructureCommandContext(), command),
      handleSetObservatoryEnabledCommand: (command) => handleSetObservatoryEnabledCommandImpl(this.economicStructureCommandContext(), command),
      handleRevealEmpireCommand: (command) => handleRevealEmpireCommandImpl(this.abilityCommandContext(), command),
      handleRevealEmpireStatsCommand: (command) => handleRevealEmpireStatsCommandImpl(this.abilityCommandContext(), command),
      handleSurveySweepCommand: (command) => handleSurveySweepCommandImpl(this.abilityCommandContext(), command),
      handleAetherLanceCommand: (command) => handleAetherLanceCommandImpl(this.abilityCommandContext(), command), handleAetherEmpCommand: (command) => handleAetherEmpCommandImpl(this.abilityCommandContext(), command),
      handleCastAetherBridgeCommand: (command) => handleCastAetherBridgeCommandImpl(this.abilityCommandContext(), command),
      handleCastAetherWallCommand: (command) => handleCastAetherWallCommandImpl(this.abilityCommandContext(), command),
      handleSiphonTileCommand: (command) => handleSiphonTileCommandImpl(this.abilityCommandContext(), command),
      handlePurgeSiphonCommand: (command) => handlePurgeSiphonCommandImpl(this.abilityCommandContext(), command),
      handleCancelSiphonCommand: (command) => handleCancelSiphonCommandImpl(this.abilityCommandContext(), command),
      ...buildMapCommandDispatchHandlers(() => this.mapCommandContext()),
      handleUpgradeTownTierCommand: (command) => handleUpgradeTownTierCommandImpl(this.progressionCommandContext(), command),
      handleCollectShardCommand: (command) => handleCollectShardCommandImpl(this.progressionCommandContext(), command),
      handleSyncAllianceCommand: (command) => this.handleSyncAllianceCommand(command),
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
      runtimeLogInfo: (payload, message) => runtimeLogInfo(payload, message)
    });
  }
}
