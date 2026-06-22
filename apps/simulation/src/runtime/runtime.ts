import { EventEmitter } from "node:events";

import type { CommandEnvelope, ManpowerBreakdown, SimulationEvent } from "@border-empires/sim-protocol";
import type { PlayerRespawnNotice, PlayerRespawnReasonCode } from "@border-empires/shared";
import {
  type PendingRespawnNoticeContext
} from "../player-respawn-notice.js";
import {
  validateFrontierCommand,
  fortAttackManpowerMultiplier,
  MANPOWER_BASE_CAP,
  MANPOWER_BASE_REGEN_PER_MINUTE,
  TOWN_MANPOWER_BY_TIER,
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
  MUSTER_SYSTEM_ENABLED,
  MUSTER_ATTACK_COST,
  FORT_GARRISON_ATTRITION_MIN,
  FORT_GARRISON_ATTRITION_MAX,
  DEVELOPMENT_PROCESS_LIMIT,
  FOREST_FRONTIER_CLAIM_MULT,
  FRONTIER_CLAIM_COST,
  FRONTIER_CLAIM_MS,
  SETTLE_COST,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  grassShadeAt,
  landBiomeAt,
  terrainAt,
  type Terrain,
  type BuildableStructureType,
  type EconomicStructureType,
  type StructureSpec
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
import { isFrontierAdjacent } from "../frontier-adjacency/frontier-adjacency.js";
import {
  buildDockLinksByDockTileKey,
  computeLinkedDockRevealTileKeys,
  isValidDockCrossingTarget,
  type DockRouteDefinition
} from "../dock-network/dock-network.js";
import { chooseNextOwnedFrontierCommandFromLookup } from "../ai/frontier-command-planner.js";
import { forEachFrontierNeighbor } from "../frontier-topology.js";
import {
  coordsInChebyshevRadius,
  FRONTIER_DECAY_MS,
  fortAutoAttackCandidates,
  isActiveFortAnchor,
  isSettledTownAnchor,
  orderedAutoSettlementTileKeys,
  TOWN_AUTO_FRONTIER_RADIUS
} from "../territory-automation/territory-automation.js";
import { buildPlayerDefensibilityMetrics } from "../player-defensibility-metrics.js";
import {
  candidateIndexKeysAroundTileKey,
  isBuildCandidateTile,
  isHotFrontierTile,
  isStrategicFrontierTile,
  playerIdsAffectedByTileChange
} from "../ai/planner-candidate-index.js";
import {
  addPendingSettlementToSummary,
  applyTileToPlayerSummary,
  cloneStrategicProduction,
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
  addTileUpkeepToCache,
  buildUpkeepAccrualSnapshot,
  removeTileUpkeepFromCache,
  type UpkeepAccrualSnapshot
} from "../player-upkeep-incremental/player-upkeep-incremental.js";
import { buildConnectedTownNetworkForPlayer, enrichTownWithConnectedNetwork, firstThreeTownKeysForPlayer, firstThreeTownsGoldOutputMultiplierForPlayer } from "../economy-network/economy-network.js";
import { createSeedWorld, simulationTileKey } from "../seed-state/seed-state.js";
import type { SimulationSnapshotSections } from "../snapshot-store/snapshot-store.js";
import {
  buildModBreakdownForPlayer,
  chosenTrickleRateForPlayer,
  multiplicativeEffectForPlayer,
  recomputeMods
} from "../tech-domain-bridge/tech-domain-bridge.js";
import {
  filterTileDeltasForPlayer as filterTileDeltasForPlayerImpl,
  type VisibilityAuditSample
} from "../tile-delta-visibility-filter.js";
import { buildTileYieldView } from "../tile-yield-view/tile-yield-view.js";
import { VisionExpansionCache } from "../vision-expansion-cache.js";
import type { PlannerPlayerView, PlannerTileView, PlannerWorldView } from "../ai/planner-world-view.js";
import type { ExpansionObjective } from "../ai/ai-expansion-objective.js";
import {
  createAutomationNoopDiagnostic,
  planAutomationCommand,
  type AutomationPlannerDiagnostic
} from "../ai/automation-command-planner.js";
import { chooseAutomationPreplanCommand } from "../ai/ai-preplan-command.js";
import type { AutomationVictoryPath } from "../ai/automation-strategic-snapshot.js";
import {
  AI_SPATIAL_FOCUS_EXPIRY_JITTER_MS,
  selectSpatialFocus,
  type AiSpatialFocus
} from "../ai/ai-spatial-focus.js";
import {
  InMemorySimulationPersistence,
  TERRITORY_AUTO_COMMAND_PREFIX,
  UPKEEP_STRATEGIC_KEYS,
  hasOutstandingUpkeepNeed,
  lockSourceFromSessionId,
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
  type StrategicResourceKey,
  type UpkeepNeed
} from "../runtime-types.js";
import {
  parseAllianceSyncPayload,
  parseConverterTogglePayload,
  parseEconomicStructurePayload,
  parseFrontierPayload,
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
import { ENCIRCLEMENT_DECAY_MS } from "../encirclement/encirclement.js";
import { TileDeltaStringifyCache } from "../tile-delta-stringify-cache/tile-delta-stringify-cache.js";
import { PlayerCandidateIndex } from "../player-candidate-index/player-candidate-index.js";
import { domainTileToWireDelta } from "../runtime-tile-deltas.js";
import {
  FOREST_SETTLEMENT_MULT,
  MAX_SETTLE_DURATION_MS,
  SETTLE_DURATION_MS,
  settlementBaseDurationMsForTile,
  settlementDurationMsForPlayer
} from "../runtime-settlement-rules.js";
import {
  TECH_REQUIREMENTS_BY_STRUCTURE,
  economicStructureGoldUpkeepPerInterval,
  isConverterStructureType,
  upgradeBaseTypeForEconomicStructure
} from "../runtime-structure-rules/runtime-structure-rules.js";
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
import {
  effectiveManpowerAt,
  playerManpowerBreakdownFromSummary,
  playerManpowerCapFromSummary,
  playerManpowerRegenPerMinuteFromSummary
} from "../runtime-manpower.js";
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
import { createHumanRuntimePlayer } from "../runtime-player-factory.js";
import {
  activeAetherBridgesForPlayer as activeAetherBridgesForPlayerImpl,
  activeAetherWallsForPlayer as activeAetherWallsForPlayerImpl,
  buildRevealEmpireStats as buildRevealEmpireStatsImpl,
  closestAetherBridgeOrigin as closestAetherBridgeOriginImpl,
  crossingBlockedByAetherWall as crossingBlockedByAetherWallImpl,
  getAbilityCooldownUntil as getAbilityCooldownUntilImpl,
  isCoastalLand as isCoastalLandImpl,
  isStructurePowered as isStructurePoweredImpl,
  isTileShieldedByEnemyAegisDome as isTileShieldedByEnemyAegisDomeImpl,
  observatoryCastRadiusFor as observatoryCastRadiusForImpl,
  ownedLandWithinRange as ownedLandWithinRangeImpl,
  pickReadyOwnedObservatoryAny as pickReadyOwnedObservatoryAnyImpl,
  pickReadyOwnedObservatoryForTarget as pickReadyOwnedObservatoryForTargetImpl,
  revealCapacityForPlayer as revealCapacityForPlayerImpl,
  seaTileCountBetween as seaTileCountBetweenImpl,
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
import { handleSiphonTileCommand as handleSiphonTileCommandImpl } from "../runtime-siphon-command-handlers.js";
import {
  handleAirportBombardCommand as handleAirportBombardCommandImpl,
  handleCreateMountainCommand as handleCreateMountainCommandImpl,
  handleImperialExchangeLevyCommand as handleImperialExchangeLevyCommandImpl,
  handleRemoveMountainCommand as handleRemoveMountainCommandImpl,
  handleWorldEngineStrikeCommand as handleWorldEngineStrikeCommandImpl,
  type RuntimeMapCommandContext
} from "../runtime-map-command-handlers.js";
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


export { InMemorySimulationPersistence } from "../runtime-types.js";
export type { SimulationTileWireDelta } from "../runtime-types.js";

export type { VisibilityAuditSample };

const priorityOrder: QueueLane[] = ["human_interactive", "human_noninteractive", "system", "ai"];
// Force a full upkeep-cache rebuild every N reads to bound floating-point drift
// from the incremental add/subtract sum over a long-lived season.
const UPKEEP_ACCRUAL_REBUILD_INTERVAL = 256;
export { FOREST_SETTLEMENT_MULT, MAX_SETTLE_DURATION_MS, SETTLE_DURATION_MS };
const RESPAWN_MINIMUM_GOLD = 100;
export { settlementBaseDurationMsForTile, settlementDurationMsForPlayer };

// Grace beyond resolvesAt before the sweep drops a lock. Normal locks resolve
// inside their setTimeout window; anything still present 60s after its scheduled
// resolution is a leak from a code path that bypassed validation.
const ORPHAN_LOCK_GRACE_MS = 60_000;

// Process-global monotonically increasing counter so each runtime instance
// gets a unique starting epoch, and every terrain mutation gets a fresh number.
// Consumers (e.g. live-snapshot-view) cache derived terrain structures (island
// map) by this epoch; cache misses are O(world tiles) but happen only when
// terrain actually changes, which is rare (only create_mountain / remove_mountain).
let nextTerrainEpoch = 1;

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
  private readonly eagerVisibilitySetCache = new Map<string, { collectionVersion: number; keys: Set<string> }>();
  private readonly plannerPlayerTopologyVersionByPlayer = new Map<string, number>();
  private readonly plannerPlayerTopologyDirtyTilesByPlayer = new Map<string, Set<string>>();
  private readonly rememberedAutomationVictoryPathByPlayer = new Map<string, AutomationVictoryPath>();
  // Bounded per-AI focus front (BFS of owned tiles around a persistent
  // hot-frontier origin) used to cap planner CPU. Refreshed each tick from
  // refreshSpatialFocusForPlayer; cleared automatically when the player owns
  // no territory.
  private readonly aiSpatialFocusByPlayer = new Map<string, AiSpatialFocus>();
  private readonly plannerPlayerTileKeyCacheByPlayer = new Map<string, {
    tileCollectionVersion: number;
    topologyVersion: number;
    territoryTileKeys: string[];
    frontierTileKeys: string[];
    hotFrontierTileKeys: string[];
    strategicFrontierTileKeys: string[];
    buildCandidateTileKeys: string[];
    pendingSettlementTileKeys: string[];
  }>();
  private readonly locksByTile: Map<string, LockRecord>;
  // Deduplicated view of locksByTile keyed by commandId.  A single lock is
  // stored under TWO tile keys (originKey + targetKey); this index gives O(1)
  // unique-lock iteration for exportState's activeLocks projection, replacing
  // the per-call `new Map([...locksByTile.entries()].map(...))` dedup.
  private readonly locksByCommandId = new Map<string, LockRecord>();
  // Index of FRONTIER tiles per owner — avoids full this.tiles scan in autoSettlementQueueForPlayer.
  // Key: ownerId, Value: Set of tile keys that are FRONTIER-owned by that player.
  // Maintained in replaceTileState; rebuilt from this.tiles in the constructor.
  private readonly frontierTilesByOwner = new Map<string, Set<string>>();
  // Part 2: index of fort/town anchors that grant frontier support per owner.
  // Key: ownerId, Value: Map of (anchorTileKey → maxRadius) for FORT + WOODEN_FORT + TOWN kinds only.
  // Siege outposts are excluded (they do not grant frontier support).
  // Maintained in replaceTileState via refreshFortAnchorIndexForTile.
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
  private readonly tileYieldCollectedAtByTile = new Map<string, number>();
  private readonly lastIncomeTickAtMsByPlayer = new Map<string, number>();
  private readonly lastActiveAtMsByPlayer = new Map<string, number>();
  private readonly fortPatrolGraceUntilByTile = new Map<string, number>();
  // Epoch ms when each tile last transitioned into SETTLED ownership. Stamped
  // inside replaceTileState; consumed by tickTileShedding to shed newest-first
  // when a player is broke (points <= 0 and net gold/min <= 0). Not persisted —
  // tiles recovered from the event log have no entry and tie at -Infinity, so
  // they're shed last (which matches the intent: an empire that survived
  // restart shouldn't have its core tiles shed before its newer expansions).
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
  // Per-player territorial vision expansion cache.  Avoids O(territory×r²)
  // recomputation on every classifyVisibilityForPlayer call; invalidated lazily
  // via signature (tileCollectionVersion:vision:visionRadiusBonus).
  private readonly visionExpansionCache = new VisionExpansionCache(WORLD_WIDTH, WORLD_HEIGHT);
  private readonly lastEconomyAccrualAtByPlayer = new Map<string, number>();
  // Cached economy snapshot per player. Invalidated in replaceTileState whenever
  // a tile mutates in a way that could change income/upkeep rates (ownership,
  // town, fort, economicStructure, siegeOutpost, observatory, dockId changes).
  // applyEconomyAccrual and emitPlayerStateUpdate both read from this cache so
  // each player pays O(settled-tiles) at most once per tick instead of once per
  // call site.  The cache is keyed by player ID; a missing entry means dirty.
  private readonly economySnapshotCacheByPlayer = new Map<string, PlayerUpdateEconomySnapshot>();
  // Incremental upkeep accrual cache per player. Unlike economySnapshotCacheByPlayer
  // (invalidate-on-mutation, O(tiles) to rebuild), this cache is kept warm by
  // O(1) add/subtract in replaceTileState. applyEconomyAccrual reads upkeep from
  // here instead of triggering a full snapshot rebuild on every tile mutation.
  // A missing entry is lazily populated on first read (O(settled-tiles) once).
  // Must be invalidated (deleted) when tech/domain multipliers change.
  private readonly upkeepAccrualCacheByPlayer = new Map<string, UpkeepAccrualSnapshot>();
  // Per-player read counter for the upkeep cache. Drives the periodic full
  // rebuild that bounds floating-point drift (see cachedUpkeepAccrual).
  private readonly upkeepAccrualReadCountByPlayer = new Map<string, number>();
  // Cached tile-yield economy context per player. Includes town network, fed-town
  // keys, and first-three-town keys. Invalidated alongside economySnapshotCacheByPlayer
  // (same replaceTileState triggers). Used by consumeUpkeepFromTileYield and
  // applyPassiveIncome to avoid rebuilding the town network from all settled tiles.
  private readonly tileYieldContextCacheByPlayer = new Map<string, RuntimeTileYieldEconomyContext>();
  // Cached defensibility metrics per player.  Invalidated alongside the
  // economy snapshot cache because the same tile mutations that change income
  // also change border exposure (T, E, Ts, Es).
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
  private readonly onVisibilityAudit: ((sample: VisibilityAuditSample) => void) | undefined;
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
    | ((sample: { lane: QueueLane; durationMs: number; commandType?: CommandEnvelope["type"] }) => void)
    | undefined;
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
      jitterMs
    });
    if (focus) {
      this.aiSpatialFocusByPlayer.set(playerId, focus);
    } else {
      this.aiSpatialFocusByPlayer.delete(playerId);
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
    // Background drain (AI/system commands) previously used setTimeout(0) for
    // scheduleAfter(0, ...) calls, which fires in the Timers phase — BEFORE the
    // Check phase where setImmediate callbacks (snapshot-build yields and human-
    // interactive drains) run.  This caused every snapshot-build yield to be
    // preceded by a ~200ms AI drain callback, stalling player login for 22+ s.
    //
    // Fix: use setImmediate for delay=0 so background drains land in the Check
    // phase.  Within a single Check phase, callbacks fire in registration order.
    // Snapshot-build yields register their next setImmediate BEFORE the drain
    // registers its next setImmediate (snapshot yields from step 1, drain from
    // step 2 of the same Check phase), so snapshot chunks always run ahead of
    // drains in the next iteration.  Total snapshot build time drops from ~22 s
    // (110 yields × 200 ms stall each) to the bare computation cost (~500 ms).
    // Real-delay timers (settleDurationMs, etc.) are unaffected — they still use
    // setTimeout for accurate wall-clock scheduling.
    this.scheduleAfter = options.scheduleAfter ?? ((delayMs, task) =>
      delayMs === 0 ? void setImmediate(task) : void setTimeout(task, delayMs)
    );
    this.shouldPauseBackground = options.shouldPauseBackground;
    this.onMusterRemoteAttack = options.onMusterRemoteAttack;
    this.onMusterRemoteBlocked = options.onMusterRemoteBlocked;
    this.commandTrace = options.commandTrace;
    this.onQueueDrain = options.onQueueDrain;
    this.onJobApplied = options.onJobApplied;
    this.onVisibilityAudit = options.onVisibilityAudit;
    this.onCaptureRevealBuilt = options.onCaptureRevealBuilt;
    this.onShardCollected = options.onShardCollected;
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
    }
    // First pass: apply tile summaries and shard-site tracking.
    // All tiles are already in this.tiles (createTilesFromInitialState produced a
    // complete Map), so anchor registration in the second pass below will find every
    // neighbour regardless of iteration order.
    for (const [tileKey, tile] of this.tiles.entries()) {
      this.applyTileToPlayerSummaries(tileKey, tile);
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
          tileDeltas: [this.tileDeltaFromState(settledTile)]
        });
        this.emitPlayerStateUpdate({ commandId: recoveredSettleCommandId, playerId: pendingSettlement.ownerId });
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
      ...(yieldToEventLoop !== undefined ? { yieldToEventLoop } : {})
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

  applyPassiveIncome(nowMs: number, inactivityCapMs: number): void {
    // Kept synchronous for callers that don't have a yield function.
    // Production path uses applyPassiveIncomeAsync (see below).
    for (const player of this.players.values()) {
      this.applyPassiveIncomeForPlayer(player, nowMs, inactivityCapMs);
    }
  }

  async applyPassiveIncomeAsync(
    nowMs: number,
    inactivityCapMs: number,
    yieldToEventLoop: () => Promise<void>
  ): Promise<void> {
    for (const player of this.players.values()) {
      this.applyPassiveIncomeForPlayer(player, nowMs, inactivityCapMs);
      // Yield between players: cachedEconomySnapshot may rebuild O(settledTiles)
      // on cache miss, so batching all 6 players back-to-back is a 15s stall risk.
      await yieldToEventLoop();
    }
  }

  private applyPassiveIncomeForPlayer(player: RuntimePlayer, nowMs: number, inactivityCapMs: number): void {
    const lastActiveAt = this.lastActiveAtMsByPlayer.get(player.id) ?? 0;
    if (nowMs - lastActiveAt > inactivityCapMs) return;

    const lastTickAt = this.lastIncomeTickAtMsByPlayer.get(player.id);
    if (lastTickAt === undefined) {
      // First tick: seed the anchor at nowMs so we start accruing from here
      this.lastIncomeTickAtMsByPlayer.set(player.id, nowMs);
      return;
    }

    const elapsedMs = nowMs - lastTickAt;
    if (elapsedMs <= 0) return;
    const elapsedMinutes = elapsedMs / 60_000;

    const economy = this.cachedEconomySnapshot(player);
    const goldPerMinute = economy.incomePerMinute;
    const summary = this.summaryForPlayer(player.id);
    const storageCap = computeEmpireStorageCap(summary, goldPerMinute, economy.strategicProductionPerMinute);

    // Credit gold
    let anyCredited = false;
    const goldEarned = goldPerMinute * elapsedMinutes;
    if (goldEarned > 0) {
      const availableGoldCap = Math.max(0, storageCap.GOLD - player.points);
      const creditedGold = Math.min(goldEarned, availableGoldCap);
      if (creditedGold > 0) {
        player.points += creditedGold;
        anyCredited = true;
      }
    }

    // Credit strategic resources
    const sp = economy.strategicProductionPerMinute;
    const strategicKeys = ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD"] as const;
    for (const resource of strategicKeys) {
      const ratePerMinute = sp[resource] ?? 0;
      if (ratePerMinute <= 0) continue;
      const earned = ratePerMinute * elapsedMinutes;
      const cap = storageCap[resource as keyof typeof storageCap] ?? 0;
      const current = (player.strategicResources ?? {})[resource] ?? 0;
      const available = Math.max(0, cap - current);
      const credited = Math.min(earned, available);
      if (credited > 0) {
        this.addStrategicResource(player, resource, credited);
        anyCredited = true;
      }
    }

    this.lastIncomeTickAtMsByPlayer.set(player.id, nowMs);

    if (anyCredited) {
      this.emitPlayerStateUpdate({ commandId: `income-tick:${player.id}:${nowMs}`, playerId: player.id });
    }
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
      // exactOptionalPropertyTypes: omit key entirely when undefined rather than
      // setting it to undefined, which would be rejected by the optional type.
      ...(yieldToEventLoop !== undefined ? { yieldToEventLoop } : {})
    });
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
      emitEvent: (event) => this.emitEvent(event),
      emitPlayerStateUpdate: (command) => this.emitPlayerStateUpdate(command)
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
      applyEncirclementForExpand: (targetKey, playerId, commandId) => this.applyEncirclementForExpand(targetKey, playerId, commandId),
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
        : undefined
    };
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
    return ensurePlayerHasSpawnTerritoryImpl(this.respawnContext(), playerId, rallyAnchor);
  }

  enqueueBackgroundJob(job: () => void): void {
    this.enqueueJob("ai", job, undefined, "background");
  }

  repairZeroGrossIncomeSettlements(playerIds: Iterable<string>): number {
    let repaired = 0;
    for (const playerId of new Set(playerIds)) {
      if (!this.players.has(playerId)) {
        const recoveredSummary = this.playerSummaries.get(playerId);
        if (!recoveredSummary || recoveredSummary.territoryTileKeys.size === 0) continue;
        this.players.set(playerId, createHumanRuntimePlayer(playerId));
      }
      if (this.ensureGrossIncomeSettlementForPlayer(playerId, `startup-gross-income-settlement:${playerId}`)) {
        repaired += 1;
      }
    }
    return repaired;
  }

  queueDepths(): Record<QueueLane, number> {
    return {
      human_interactive: this.jobsByLane.human_interactive.length,
      human_noninteractive: this.jobsByLane.human_noninteractive.length,
      system: this.jobsByLane.system.length,
      ai: this.jobsByLane.ai.length
    };
  }

  queueBacklogMs(nowMs = this.now()): Record<QueueLane, number> {
    const backlogFor = (lane: QueueLane): number => {
      const oldest = this.jobsByLane[lane][0];
      if (!oldest) return 0;
      return Math.max(0, nowMs - oldest.enqueuedAt);
    };
    return {
      human_interactive: backlogFor("human_interactive"),
      human_noninteractive: backlogFor("human_noninteractive"),
      system: backlogFor("system"),
      ai: backlogFor("ai")
    };
  }

  private summaryForPlayer(playerId: string): PlayerRuntimeSummary {
    const existing = this.playerSummaries.get(playerId);
    if (existing) return existing;
    const summary = createEmptyPlayerRuntimeSummary();
    this.playerSummaries.set(playerId, summary);
    this.plannerPlayerTileCollectionVersionByPlayer.set(playerId, 0);
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
    this.plannerPlayerTileKeyCacheByPlayer.delete(playerId);
  }

  private plannerPlayerTileKeys(playerId: string, summary: PlayerRuntimeSummary): {
    tileCollectionVersion: number;
    topologyVersion: number;
    topologyDirtyTileKeys: string[];
    territoryTileKeys: string[];
    frontierTileKeys: string[];
    hotFrontierTileKeys: string[];
    strategicFrontierTileKeys: string[];
    buildCandidateTileKeys: string[];
    pendingSettlementTileKeys: string[];
  } {
    // Drain dirty tiles on every call — they are transient (consumed per sync)
    // and must NOT be cached, so they are read and cleared here before the
    // cache check, ensuring each syncPlayers call gets the correct delta.
    const dirtySet = this.plannerPlayerTopologyDirtyTilesByPlayer.get(playerId);
    const topologyDirtyTileKeys: string[] = dirtySet && dirtySet.size > 0 ? [...dirtySet] : [];
    dirtySet?.clear();

    const tileCollectionVersion = this.plannerPlayerTileCollectionVersionByPlayer.get(playerId) ?? 0;
    const topologyVersion = this.plannerPlayerTopologyVersionByPlayer.get(playerId) ?? 0;
    const cached = this.plannerPlayerTileKeyCacheByPlayer.get(playerId);
    if (cached && cached.tileCollectionVersion === tileCollectionVersion) {
      return { ...cached, topologyDirtyTileKeys };
    }
    const next = {
      tileCollectionVersion,
      topologyVersion,
      territoryTileKeys: [...summary.territoryTileKeys],
      frontierTileKeys: [...summary.frontierTileKeys],
      hotFrontierTileKeys: [...summary.hotFrontierTileKeys],
      strategicFrontierTileKeys: [...summary.strategicFrontierTileKeys],
      buildCandidateTileKeys: [...summary.buildCandidateTileKeys],
      pendingSettlementTileKeys: [...summary.pendingSettlementsByTile.keys()]
    };
    this.plannerPlayerTileKeyCacheByPlayer.set(playerId, next);
    return { ...next, topologyDirtyTileKeys };
  }

  private playerManpowerCap(player: RuntimePlayer): number {
    if (player.id === "barbarian-1") return Number.MAX_SAFE_INTEGER;
    return playerManpowerCapFromSummary(this.summaryForPlayer(player.id));
  }

  private playerManpowerRegenPerMinute(player: RuntimePlayer): number {
    return playerManpowerRegenPerMinuteFromSummary(this.summaryForPlayer(player.id));
  }

  playerLogisticsThroughputPerMinute(player: RuntimePlayer): number {
    // Logistics throughput = same as manpower regen for now; tune later.
    return this.playerManpowerRegenPerMinute(player);
  }

  private playerManpowerBreakdown(player: RuntimePlayer): ManpowerBreakdown {
    return playerManpowerBreakdownFromSummary(this.summaryForPlayer(player.id));
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
    const snapshot = buildPlayerUpdateEconomySnapshot(player, summary, this.tiles, {
      dockLinksByDockTileKey: this.dockLinksByDockTileKey
    }, econMult);
    this.economySnapshotCacheByPlayer.set(player.id, snapshot);
    return snapshot;
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

  private applyEconomyAccrual(player: RuntimePlayer, nowMs = this.now()): void {
    const last = this.lastEconomyAccrualAtByPlayer.get(player.id);
    if (last === undefined) {
      this.lastEconomyAccrualAtByPlayer.set(player.id, nowMs);
      return;
    }
    const elapsedMs = nowMs - last;
    if (elapsedMs <= 0) return;
    // Rate-limit to once per 15s. consumeUpkeepFromTileYield is O(yield_bearing_tiles)
    // and was being triggered on every AI command (~1/s), causing untracked
    // 8-17s main-thread stalls. The passive income tick (also 15s) handles
    // income; upkeep drain on the same cadence keeps the two in sync.
    if (elapsedMs < 15_000) return;
    if (!this.playerSummaries.has(player.id)) {
      this.lastEconomyAccrualAtByPlayer.set(player.id, nowMs);
      return;
    }
    // Use the incremental upkeep cache (stays warm across mutations via
    // replaceTileState; O(1) per tile change).  The full cachedEconomySnapshot
    // is NOT read here — that would rebuild O(settled-tiles) on every cache miss
    // caused by a tile mutation.  Income accrual (gold/min from towns) is handled
    // separately in the tile-yield path; this path covers upkeep drain only.
    const upkeep = this.cachedUpkeepAccrual(player);
    // DEV_ASSERT_ECONOMY_INCREMENTAL: on-demand cross-check against full snapshot.
    // Enable with DEV_ASSERT_ECONOMY_INCREMENTAL=1 in env; OFF by default.
    if (process.env["DEV_ASSERT_ECONOMY_INCREMENTAL"] === "1") {
      const full = buildPlayerUpdateEconomySnapshot(player, this.summaryForPlayer(player.id), this.tiles, {
        dockLinksByDockTileKey: this.dockLinksByDockTileKey
      });
      // Round both sides to 4dp to match buildPlayerUpdateEconomySnapshot's
      // toFixed(4) on upkeepPerMinute — avoids false positives from raw-float
      // rounding noise below the gameplay-significant precision.
      const round4 = (n: number): number => Number(n.toFixed(4));
      const mismatches: string[] = [];
      for (const key of ["gold", "food", "iron", "crystal", "supply"] as const) {
        const inc = round4(upkeep[key]);
        const fullV = round4((full.upkeepPerMinute as Record<string, number | undefined>)[key] ?? 0);
        if (inc !== fullV) mismatches.push(`${key}: incremental=${inc} full=${fullV}`);
      }
      if (mismatches.length > 0) {
        // eslint-disable-next-line no-console
        console.error(`[DEV_ASSERT_ECONOMY_INCREMENTAL] player=${player.id} mismatch: ${mismatches.join(", ")}`);
      }
    }
    const summary = this.summaryForPlayer(player.id);
    const elapsedMinutes = elapsedMs / 60_000;
    // Clockwork Stipend: credit the player's chosen resource trickle BEFORE
    // upkeep drain, so the trickle helps cover upkeep on a starved empire
    // instead of being instantly clawed back.
    const trickle = chosenTrickleRateForPlayer(player);
    if (trickle && trickle.ratePerMinute > 0) {
      const credit = trickle.ratePerMinute * elapsedMinutes;
      if (credit > 0) {
        const current = player.strategicResources ?? {};
        player.strategicResources = {
          ...current,
          [trickle.resource]: (current[trickle.resource] ?? 0) + credit
        };
      }
    }
    const need: UpkeepNeed = {
      gold: Math.max(0, upkeep.gold) * elapsedMinutes,
      FOOD: Math.max(0, upkeep.food) * elapsedMinutes,
      IRON: Math.max(0, upkeep.iron) * elapsedMinutes,
      CRYSTAL: Math.max(0, upkeep.crystal) * elapsedMinutes,
      SUPPLY: Math.max(0, upkeep.supply) * elapsedMinutes
    };
    // Towns pay their own upkeep from accumulated yield before raiding the
    // treasury — mirrors the legacy server's `consumeYieldForPlayer` order
    // so an offline player whose tile income covers upkeep keeps the
    // stockpile they logged out with.
    this.consumeUpkeepFromTileYield(player, summary, need, nowMs);
    if (need.gold > 0) {
      player.points = Math.max(0, (player.points ?? 0) - need.gold);
    }
    const stock = {
      FOOD: player.strategicResources?.FOOD ?? 0,
      IRON: player.strategicResources?.IRON ?? 0,
      CRYSTAL: player.strategicResources?.CRYSTAL ?? 0,
      SUPPLY: player.strategicResources?.SUPPLY ?? 0,
      SHARD: player.strategicResources?.SHARD ?? 0
    };
    let mutated = false;
    for (const res of ["FOOD", "IRON", "CRYSTAL", "SUPPLY"] as const) {
      if (need[res] > 0) {
        stock[res] = Math.max(0, stock[res] - need[res]);
        mutated = true;
      }
    }
    if (mutated) player.strategicResources = stock;
    this.lastEconomyAccrualAtByPlayer.set(player.id, nowMs);
  }

  private consumeUpkeepFromTileYield(
    player: RuntimePlayer,
    summary: PlayerRuntimeSummary,
    need: UpkeepNeed,
    nowMs: number
  ): void {
    if (!hasOutstandingUpkeepNeed(need)) return;
    if (summary.territoryTileKeys.size <= 0) return;
    let economyContext: RuntimeTileYieldEconomyContext | undefined;
    // Use yield-bearing index to skip plain settled tiles that produce nothing.
    // Sort for deterministic drain order — same as the old full-territory sort.
    // The sorted array is cached (sortedYieldBearingKeysByOwner) and invalidated
    // only when the underlying set changes, avoiding O(n log n) spread+sort
    // on every tick for players whose yield-bearing set is stable.
    const yieldBearingSet = this.yieldBearingTilesByOwner.get(player.id);
    let tileKeys: readonly string[];
    if (!yieldBearingSet || yieldBearingSet.size === 0) {
      tileKeys = [];
    } else {
      let cached = this.sortedYieldBearingKeysByOwner.get(player.id);
      if (!cached) {
        cached = [...yieldBearingSet].sort();
        this.sortedYieldBearingKeysByOwner.set(player.id, cached);
      }
      tileKeys = cached;
    }
    const syntheticCommandId = `accrual:upkeep:${player.id}:${nowMs}`;
    // Collect anchor updates locally and emit ONE batch event at the end of
    // the loop. Pre-batch, each updated tile fired a TILE_YIELD_ANCHOR_UPDATED
    // event → separate SQLite appendEvent each. At ~2,000 owned tiles staging
    // observed 84 pending appendEvents from a single upkeep tick, blocking
    // the main event loop for 25s+. One batch event = one appendEvent.
    const batchedAnchors: Array<{ tileKey: string; collectedAt: number }> = [];
    for (const tileKey of tileKeys) {
      if (!hasOutstandingUpkeepNeed(need)) return;
      const tile = this.tiles.get(tileKey);
      if (!tile || tile.ownerId !== player.id || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") continue;
      if (!economyContext) economyContext = this.tileYieldEconomyContextForPlayer(player);
      const enrichedTile = tile.town ? this.enrichTileWithTownContext(tile, player, economyContext!) : tile;
      const lastCollectedAt = this.tileYieldCollectedAt(tileKey, player.id);
      const yieldView = buildTileYieldView(enrichedTile, lastCollectedAt, nowMs, {
        player,
        fedTownKeys: economyContext.fedTownKeys,
        firstThreeTownKeys: economyContext.firstThreeTownKeys,
        waterworksKeys: economyContext.waterworksKeys,
        tiles: this.tiles,
        dockLinksByDockTileKey: this.dockLinksByDockTileKey
      });
      if (!yieldView?.yield) continue;
      const anchorWas = lastCollectedAt ?? 0;
      // The single per-tile anchor is shared across every resource the tile
      // produces. We compute a per-resource candidate anchor from the
      // remaining buffer (newAnchor = now - remaining/rate) and pick the
      // latest — so no resource is ever credited with more than its math
      // allows. The trade-off: when upkeep consumes one resource on a
      // mixed-yield tile, the unconsumed resource's remaining yield is
      // drained too (lost, not banked). Mixed-yield tiles are rare, and
      // per-resource anchors would cost a snapshot-schema change.
      let candidateAnchorMs = anchorWas;
      const updateCandidate = (remaining: number, ratePerMs: number): void => {
        if (ratePerMs <= 0) return;
        const resourceAnchor = nowMs - remaining / ratePerMs;
        if (resourceAnchor > candidateAnchorMs) candidateAnchorMs = resourceAnchor;
      };
      const availableGold = yieldView.yield.gold ?? 0;
      if (availableGold > 0 && need.gold > 0) {
        const consumed = Math.min(availableGold, need.gold);
        need.gold -= consumed;
        updateCandidate(availableGold - consumed, yieldView.yieldRate.goldPerMinute / 60_000);
      }
      for (const resource of UPKEEP_STRATEGIC_KEYS) {
        const available = yieldView.yield.strategic[resource] ?? 0;
        if (available > 0 && need[resource] > 0) {
          const consumed = Math.min(available, need[resource]);
          need[resource] -= consumed;
          const ratePerMs = (yieldView.yieldRate.strategicPerDay[resource] ?? 0) / (1440 * 60_000);
          updateCandidate(available - consumed, ratePerMs);
        }
      }
      if (candidateAnchorMs > anchorWas) {
        const collectedAt = Math.min(nowMs, candidateAnchorMs);
        // Update the in-memory map immediately so subsequent tiles in this
        // loop see fresh anchor state. Defer the event emission until after
        // the loop so we can emit one batch event instead of N singletons.
        this.tileYieldCollectedAtByTile.set(tileKey, collectedAt);
        batchedAnchors.push({ tileKey, collectedAt });
      }
    }
    if (batchedAnchors.length > 0) {
      this.emitEvent({
        eventType: "TILE_YIELD_ANCHOR_BATCH",
        commandId: syntheticCommandId,
        playerId: player.id,
        anchors: batchedAnchors
      });
    }
    // Drop the synthetic commandId from the in-memory replay cache. The
    // anchor events are already durably persisted via emitEvent →
    // persistence.recordEvent, so event-store recovery still reconstructs
    // anchors. The cache only retains entries until a terminal event marks
    // their commandId prunable — accrual never emits terminal events, so
    // these would otherwise accumulate forever (and bloat every snapshot
    // built from this map).
    this.replayCache.recordedEventsByCommandId.delete(syntheticCommandId);
  }

  private applyTileToPlayerSummaries(tileKey: string, tile: DomainTileState): void {
    if (!tile.ownerId) return;
    applyTileToPlayerSummary(this.summaryForPlayer(tile.ownerId), tileKey, tile);
    this.markPlannerPlayerTileCollectionDirty(tile.ownerId);
  }

  private removeTileFromPlayerSummaries(tileKey: string, tile: DomainTileState): void {
    if (!tile.ownerId) return;
    removeTileFromPlayerSummary(this.summaryForPlayer(tile.ownerId), tileKey, tile);
    this.markPlannerPlayerTileCollectionDirty(tile.ownerId);
  }

  private replaceTileState(tileKey: string, tile: DomainTileState, commandId = `tile-owner-change:${tileKey}`): void {
    this.tileDeltaStringifyCache.invalidate(tileKey);
    const previous = this.tiles.get(tileKey);
    const sameOwner = Boolean(previous?.ownerId && previous.ownerId === tile.ownerId);
    // Invalidate the economy snapshot cache for affected owners so the next
    // call to cachedEconomySnapshot() rebuilds with fresh tile data.
    // We invalidate conservatively — any tile mutation could change income/upkeep
    // for its owner(s).  O(1) map.delete per call.
    if (previous?.ownerId) {
      this.economySnapshotCacheByPlayer.delete(previous.ownerId);
      this.defensibilityMetricsCacheByPlayer.delete(previous.ownerId);
      this.tileYieldContextCacheByPlayer.delete(previous.ownerId);
    }
    if (tile.ownerId) {
      this.economySnapshotCacheByPlayer.delete(tile.ownerId);
      this.defensibilityMetricsCacheByPlayer.delete(tile.ownerId);
      this.tileYieldContextCacheByPlayer.delete(tile.ownerId);
    }
    // Incrementally maintain the upkeep accrual cache.  The cache is keyed by
    // owner; subtract the previous tile's contribution and add the new one.
    // Multipliers (fortGoldUpkeepMult etc.) are sourced from the player object
    // which is looked up live — no stale-multiplier risk unless tech/domain
    // changes the player object without calling replaceTileState (that path
    // deletes the cache entry explicitly in handleChooseTech/Domain helpers).
    if (previous?.ownerId) {
      const prevPlayer = this.players.get(previous.ownerId);
      const prevCache = this.upkeepAccrualCacheByPlayer.get(previous.ownerId);
      if (prevPlayer && prevCache) {
        removeTileUpkeepFromCache(prevCache, previous, previous.ownerId, prevPlayer);
      }
    }
    if (tile.ownerId) {
      const nextPlayer = this.players.get(tile.ownerId);
      const nextCache = this.upkeepAccrualCacheByPlayer.get(tile.ownerId);
      if (nextPlayer && nextCache) {
        addTileUpkeepToCache(nextCache, tile, tile.ownerId, nextPlayer);
      }
    }
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
    if (previous) this.removeTileFromPlayerSummaries(tileKey, previous);
    this.tiles.set(tileKey, tile);
    this.snapshotTileCache.set(tileKey, mapTile(tile));
    this.applyTileToPlayerSummaries(tileKey, tile);
    if (!sameOwner) {
      if (previous?.ownerId) this.markPlannerPlayerTopologyTileChanged(previous.ownerId, tileKey);
      if (tile.ownerId) this.markPlannerPlayerTopologyTileChanged(tile.ownerId, tileKey);
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
      fortTilesByOwner: this.fortTilesByOwner
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
      markPlannerPlayerTileCollectionDirty: (id) => this.markPlannerPlayerTileCollectionDirty(id)
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
      markPlannerPlayerTileCollectionDirty: (playerId) => this.markPlannerPlayerTileCollectionDirty(playerId)
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

  private assertYieldIndexCorrect(playerId: string, now: number, yieldContext: RuntimeTileYieldEconomyContext): void {
    assertYieldIndexCorrectImpl({
      playerId,
      tiles: this.tiles,
      yieldBearingTilesByOwner: this.yieldBearingTilesByOwner,
      summary: this.summaryForPlayer(playerId),
      now,
      yieldContext
    });
  }

  private addPendingSettlement(record: PendingSettlementRecord): void {
    this.pendingSettlementsByTile.set(record.tileKey, record);
    addPendingSettlementToSummary(this.summaryForPlayer(record.ownerId), record);
    this.markPlannerPlayerTileCollectionDirty(record.ownerId);
  }

  private removePendingSettlement(tileKey: string): PendingSettlementRecord | undefined {
    const record = this.pendingSettlementsByTile.get(tileKey);
    if (!record) return undefined;
    this.pendingSettlementsByTile.delete(tileKey);
    removePendingSettlementFromSummary(this.summaryForPlayer(record.ownerId), tileKey);
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
    options?: { skipPreplan?: boolean; reservedDevelopmentSlots?: number }
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
      isPendingSettlement: (tile) => summary.pendingSettlementsByTile.has(simulationTileKey(tile.x, tile.y)),
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
      clientSeq,
      issuedAt,
      sessionPrefix
    });
    if (preplanDiagnostic?.preplanReason) {
      plan.diagnostic = {
        ...plan.diagnostic,
        preplanReason: preplanDiagnostic.preplanReason,
        ...(typeof preplanDiagnostic.preplanNeedsEconomy === "boolean"
          ? { preplanNeedsEconomy: preplanDiagnostic.preplanNeedsEconomy }
          : {}),
        ...(typeof preplanDiagnostic.preplanNeedsFood === "boolean"
          ? { preplanNeedsFood: preplanDiagnostic.preplanNeedsFood }
          : {}),
        ...(typeof preplanDiagnostic.preplanTechChoiceAffordable === "boolean"
          ? { preplanTechChoiceAffordable: preplanDiagnostic.preplanTechChoiceAffordable }
          : {}),
        ...(typeof preplanDiagnostic.preplanDomainChoiceAffordable === "boolean"
          ? { preplanDomainChoiceAffordable: preplanDiagnostic.preplanDomainChoiceAffordable }
          : {}),
        ...(preplanDiagnostic.preplanProgressState
          ? { preplanProgressState: preplanDiagnostic.preplanProgressState }
          : {})
      };
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

    if (command.type !== "SYNC_ALLIANCE") {
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
    return classifyVisibilityForPlayerImpl({
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
        this.plannerPlayerTileCollectionVersionByPlayer.get(visiblePlayerId) ?? 0
    });
  }

  getBarbActivationVisionSignature(): string {
    return getBarbActivationVisionSignatureImpl({
      players: this.players,
      tileCollectionVersionForPlayer: (playerId) =>
        this.plannerPlayerTileCollectionVersionByPlayer.get(playerId) ?? 0
    });
  }

  exportBarbActivationVisibleUnion(): { keys: string[]; signature: string } {
    return exportBarbActivationVisibleUnionImpl({
      players: this.players,
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      tileCollectionVersionForPlayer: (playerId) =>
        this.plannerPlayerTileCollectionVersionByPlayer.get(playerId) ?? 0,
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
      cachedEconomySnapshot: (player: RuntimePlayer) => this.cachedEconomySnapshot(player)
    };
  }

  // Async variant that yields to the event loop between heavy sections so
  // a big-territory bootstrap snapshot build no longer blocks the main
  // thread contiguously. PR #343 chunked the per-tile enrichment downstream
  // of this function, but the upstream classifyVisibilityForPlayer (vision
  // raster expansion, O(territory × radius²)) plus the visible-tile map
  // here are themselves sync — for a player with ~13k owned tiles and
  // vision radius 5 that's ~1.5M iterations purely in this function, which
  // can graze the 30s gateway watchdog SIGKILL threshold on shared-cpu-1x.
  //
  // Output is identical to the sync version for the same inputs (parity
  // test in runtime.export-visible-async.test.ts).
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
    tileDeltas: readonly TDelta[],
    playerId: string
  ): TDelta[] {
    return filterTileDeltasForPlayerImpl(
      {
        players: this.players,
        tiles: this.tiles,
        locksByTile: this.locksByTile,
        docks: this.docks,
        dockLinksByDockTileKey: this.dockLinksByDockTileKey,
        summaryForPlayer: (id) => this.summaryForPlayer(id),
        eagerVisibilitySetCache: this.eagerVisibilitySetCache,
        tileCollectionVersionForPlayer: (pid) => {
          // Include ally territory versions so ally expansion invalidates the cache.
          // Counters only ever increment, so the sum is monotonically increasing.
          const player = this.players.get(pid);
          let v = this.plannerPlayerTileCollectionVersionByPlayer.get(pid) ?? 0;
          if (player) {
            for (const allyId of player.allies) {
              v += this.plannerPlayerTileCollectionVersionByPlayer.get(allyId) ?? 0;
            }
          }
          return v;
        },
        ...(this.onVisibilityAudit ? { onVisibilityAudit: this.onVisibilityAudit } : {})
      },
      tileDeltas,
      playerId
    );
  }


  private strategicProductionPerMinuteForPlayer(playerId: string): Record<StrategicResourceKey, number> {
    return cloneStrategicProduction(this.summaryForPlayer(playerId).strategicProductionPerMinute);
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

  private tileYieldEconomyContextForPlayer(player: DomainPlayer): RuntimeTileYieldEconomyContext {
    const cached = this.tileYieldContextCacheByPlayer.get(player.id);
    if (cached) return cached;
    const settledTiles = this.settledTilesForPlayer(player.id);
    const waterworksKeys = new Set<string>();
    for (const tile of settledTiles) {
      if (tile.economicStructure?.type === "WATERWORKS" && tile.economicStructure.status === "active") {
        waterworksKeys.add(`${tile.x},${tile.y}`);
      }
    }
    const context: RuntimeTileYieldEconomyContext = {
      player,
      townNetwork: buildConnectedTownNetworkForPlayer(player, this.tiles, settledTiles, { maxConnectedTownNames: 16 }),
      fedTownKeys: this.fedTownKeysForPlayer(player, settledTiles),
      // Skip expensive first-three-town key computation if the player has no
      // domain granting firstThreeTownsGoldOutputMult — multiplier is 1.0 so
      // the key set has no effect. Skips O(towns) sort for most players.
      firstThreeTownKeys: firstThreeTownsGoldOutputMultiplierForPlayer(player) !== 1
        ? firstThreeTownKeysForPlayer(player.id, this.orderedTownTilesForPlayer(player.id).map(t => `${t.x},${t.y}`))
        : new Set<string>(),
      waterworksKeys
    };
    this.tileYieldContextCacheByPlayer.set(player.id, context);
    return context;
  }

  private enrichTileWithTownContext(tile: DomainTileState, player: RuntimePlayer | undefined, context: RuntimeTileYieldEconomyContext): DomainTileState {
    if (!tile.town) return tile;
    const networkTown = enrichTownWithConnectedNetwork(tile, context.townNetwork);
    const tileKey = `${tile.x},${tile.y}`;
    const refreshedTown = networkTown && player
      ? refreshTownEconomyFields(networkTown, tile, player, this.tiles, context.fedTownKeys, context.firstThreeTownKeys, context.townNetwork?.get(tileKey)?.connectedTownKeys)
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
    return computeEmpireStorageCap(summary, economy.incomePerMinute, economy.strategicProductionPerMinute);
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
    const storageCap = computeEmpireStorageCap(summary, economy.incomePerMinute, economy.strategicProductionPerMinute);
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
        developmentProcessLimit: DEVELOPMENT_PROCESS_LIMIT,
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

    if (payload.allied) {
      actor.allies.add(target.id);
      target.allies.add(actor.id);
    } else {
      actor.allies.delete(target.id);
      target.allies.delete(actor.id);
    }

    this.emitPlayerMessage(
      { commandId: command.commandId, playerId: actor.id },
      {
        type: "SOCIAL_STATE_SYNCED",
        playerId: actor.id,
        targetPlayerId: target.id,
        allied: payload.allied
      }
    );
  }

  private rejectCommand(command: Pick<CommandEnvelope, "commandId" | "playerId">, code: string, message: string): void {
    this.emitEvent({ eventType: "COMMAND_REJECTED", commandId: command.commandId, playerId: command.playerId, code, message });
  }

  private rejectIfNoDevelopmentSlot(command: CommandEnvelope, code: string, message: string): boolean {
    if (this.activeDevelopmentProcessCountForPlayer(command.playerId) < DEVELOPMENT_PROCESS_LIMIT) return false;
    this.rejectCommand(command, code, message);
    return true;
  }

  private enqueueJob(
    lane: QueueLane,
    run: () => void,
    commandType?: CommandEnvelope["type"],
    scheduling: "immediate" | "background" = "immediate"
  ): void {
    const job: SimulationJob = { lane, run, enqueuedAt: this.now(), scheduling };
    if (commandType !== undefined) job.commandType = commandType;
    this.jobsByLane[lane].push(job);
    this.scheduleDrain(scheduling);
  }

  private scheduleDrain(scheduling: "immediate" | "background" = "immediate"): void {
    if (this.draining) return;
    if (scheduling === "immediate") {
      if (this.immediateDrainScheduled) return;
      this.immediateDrainScheduled = true;
      this.scheduleSoon(() => {
        this.immediateDrainScheduled = false;
        this.drainQueues();
      });
      return;
    }
    if (this.drainScheduled || this.immediateDrainScheduled) return;
    this.drainScheduled = true;
    this.scheduleAfter(0, () => {
      this.drainScheduled = false;
      this.drainQueues();
    });
  }

  private drainQueues(): void {
    if (this.draining) return;
    this.draining = true;
    const drainStartedAt = this.now();
    const queueDepthsBefore = this.queueDepths();
    const processedByLane: Record<QueueLane, number> = {
      human_interactive: 0,
      human_noninteractive: 0,
      system: 0,
      ai: 0
    };
    let processedJobs = 0;
    let shouldYieldForBackground = false;
    let backgroundJobsProcessed = 0;
    let currentDrainScheduling: "immediate" | "background" = "immediate";
    try {
      let next = this.shiftNextJob();
      while (next) {
        currentDrainScheduling = next.scheduling ?? "immediate";
        if (currentDrainScheduling === "background") {
          const hasImmediateWork =
            this.jobsByLane.human_interactive.some((job) => (job.scheduling ?? "immediate") === "immediate") ||
            this.jobsByLane.human_noninteractive.some((job) => (job.scheduling ?? "immediate") === "immediate");
          if (hasImmediateWork) {
            this.jobsByLane[next.lane].unshift(next);
            shouldYieldForBackground = true;
            break;
          }
        }
        if (next.lane === "ai" && this.shouldPauseBackground?.()) {
          this.jobsByLane[next.lane].unshift(next);
          shouldYieldForBackground = true;
          break;
        }
        if ((next.lane === "system" || next.lane === "ai") && backgroundJobsProcessed >= this.backgroundBatchSize) {
          this.jobsByLane[next.lane].unshift(next);
          shouldYieldForBackground = true;
          break;
        }
        const jobStartedAt = this.now();
        next.run();
        if (this.onJobApplied) {
          const jobDurationMs = Math.max(0, this.now() - jobStartedAt);
          this.onJobApplied({
            lane: next.lane,
            durationMs: jobDurationMs,
            ...(next.commandType ? { commandType: next.commandType } : {})
          });
        }
        processedJobs += 1;
        processedByLane[next.lane] += 1;
        if (next.lane === "system" || next.lane === "ai") {
          backgroundJobsProcessed += 1;
        }
        next = this.shiftNextJob();
        if (currentDrainScheduling === "immediate" && next && (next.scheduling ?? "immediate") === "background") {
          this.jobsByLane[next.lane].unshift(next);
          shouldYieldForBackground = true;
          break;
        }
      }
    } finally {
      this.draining = false;
      if (processedJobs > 0) {
        this.onQueueDrain?.({
          durationMs: Math.max(0, this.now() - drainStartedAt),
          processedJobs,
          backgroundJobsProcessed,
          yieldedForBackground: shouldYieldForBackground,
          processedByLane,
          queueDepthsBefore,
          queueDepthsAfter: this.queueDepths()
        });
      }
      if (this.hasQueuedJobs()) {
        if (shouldYieldForBackground) {
          this.scheduleAfter(0, () => this.drainQueues());
        } else {
          this.scheduleDrain(this.nextQueuedScheduling());
        }
      }
    }
  }

  private nextQueuedScheduling(): "immediate" | "background" {
    for (const lane of priorityOrder) {
      const next = this.jobsByLane[lane][0];
      if (next) return next.scheduling ?? "immediate";
    }
    return "immediate";
  }

  private shiftNextJob(): SimulationJob | undefined {
    for (const lane of priorityOrder) {
      const next = this.jobsByLane[lane].shift();
      if (next) return next;
    }
    return undefined;
  }

  private hasQueuedJobs(): boolean {
    return priorityOrder.some((lane) => this.jobsByLane[lane].length > 0);
  }

  private handleFrontierCommand(command: CommandEnvelope, actionType: FrontierCommandType): boolean {
    const actor = this.players.get(command.playerId);
    const payload = parseFrontierPayload(command.payloadJson);
    if (!actor || !payload) { this.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return false; }
    this.applyManpowerRegen(actor);

    const submittedFrom = this.tiles.get(simulationTileKey(payload.fromX, payload.fromY));
    const to = this.tiles.get(simulationTileKey(payload.toX, payload.toY));
    if (!submittedFrom || !to) { this.rejectCommand(command, "UNKNOWN_TILE", "origin or target tile not found"); return false; }

    // Recover from stale client origin selection by re-picking a valid owned adjacent origin.
    const from =
      submittedFrom.ownerId === actor.id
        ? submittedFrom
        : this.adjacentTileStates(to.x, to.y).find((candidate) => candidate.ownerId === actor.id && candidate.terrain === "LAND") ??
          this.findOwnedDockOriginForCrossing(actor.id, to.x, to.y) ??
          this.findOwnedAetherBridgeOriginForCrossing(actor.id, to.x, to.y) ??
          submittedFrom;

    const originLock = this.locksByTile.get(simulationTileKey(from.x, from.y));
    const targetLock = this.locksByTile.get(simulationTileKey(to.x, to.y));
    this.commandTrace?.({
      phase: "frontier_validate",
      commandId: command.commandId,
      playerId: command.playerId,
      actionType,
      submittedOrigin: { x: payload.fromX, y: payload.fromY },
      resolvedOrigin: { x: from.x, y: from.y },
      target: { x: to.x, y: to.y },
      originLockOwnerId: originLock?.playerId,
      originLockResolvesAt: originLock?.resolvesAt,
      targetLockOwnerId: targetLock?.playerId,
      targetLockResolvesAt: targetLock?.resolvesAt
    });
    // Encirclement guard: a cut-off frontier tile cannot be used as an attack
    // or expand source. Attacks *against* cut-off tiles proceed normally.
    // `frontierDecayAt` is shared by natural frontier expiry and encirclement,
    // so only the explicit encirclement owner marks a tile as action-blocked.
    if (
      (actionType === "ATTACK" || actionType === "EXPAND") &&
      from.ownershipState === "FRONTIER" &&
      from.frontierDecayKind === "ENCIRCLEMENT"
    ) {
      this.rejectCommand(command, "ORIGIN_CUT_OFF", "origin tile is cut off from supply and cannot launch actions");
      return false;
    }

    const isDockCrossing = this.isDockCrossingTarget(from, to.x, to.y);
    const isForestTarget =
      terrainAt(to.x, to.y) === "LAND" &&
      landBiomeAt(to.x, to.y) === "GRASS" &&
      grassShadeAt(to.x, to.y) === "DARK";
    const expandClaimDurationMs =
      actionType === "EXPAND"
        ? isForestTarget
          ? FRONTIER_CLAIM_MS * FOREST_FRONTIER_CLAIM_MULT
          : FRONTIER_CLAIM_MS
        : undefined;
    const requiredMuster = MUSTER_SYSTEM_ENABLED && actionType === "ATTACK"
      ? this.requiredMusterForTarget(to)
      : undefined;
    const musterSource = MUSTER_SYSTEM_ENABLED && actionType === "ATTACK" && to.ownerId !== "barbarian-1" && actor.id !== "barbarian-1"
      ? this.resolveMusterSource(actor.id, simulationTileKey(from.x, from.y), requiredMuster ?? MUSTER_ATTACK_COST)
      : undefined;
    const validation = validateFrontierCommand({
      now: this.now(),
      actor,
      actionType,
      from,
      to,
      originLockedUntil: originLock?.resolvesAt,
      originLockOwnerId: originLock?.playerId,
      targetLockedUntil: targetLock?.resolvesAt,
      targetLockOwnerId: targetLock?.playerId,
      actionGoldCost: actor.id === "barbarian-1" ? 0 : FRONTIER_CLAIM_COST,
      isAdjacent: isFrontierAdjacent(from.x, from.y, to.x, to.y),
      isDockCrossing,
      isBridgeCrossing: this.isAetherBridgeCrossingTarget(actor.id, from.x, from.y, to.x, to.y),
      targetShielded: isDockCrossing ? false : this.crossingBlockedByAetherWall(from.x, from.y, to.x, to.y),
      defenderIsAlliedOrTruced: Boolean(to.ownerId && actor.allies.has(to.ownerId)),
      expandClaimDurationMs,
      musterSystemEnabled: MUSTER_SYSTEM_ENABLED,
      originMuster: musterSource?.available ?? (from.muster?.ownerId === actor.id ? from.muster.amount : 0),
      requiredMuster
    });

    if (!validation.ok) {
      if (validation.code === "INSUFFICIENT_MUSTER" && MUSTER_SYSTEM_ENABLED && actionType === "ATTACK") {
        this.onMusterRemoteBlocked?.();
      }
      this.commandTrace?.({
        phase: "frontier_reject",
        commandId: command.commandId,
        playerId: command.playerId,
        actionType,
        code: validation.code,
        message: validation.message,
        cooldownRemainingMs: "cooldownRemainingMs" in validation ? validation.cooldownRemainingMs : undefined,
        originLockOwnerId: originLock?.playerId,
        originLockResolvesAt: originLock?.resolvesAt,
        targetLockOwnerId: targetLock?.playerId,
        targetLockResolvesAt: targetLock?.resolvesAt
      });
      this.rejectCommand(command, validation.code, validation.message);
      return false;
    }

    const resolvedOriginKey = simulationTileKey(validation.origin.x, validation.origin.y);
    const effectiveMusterSourceKey = musterSource?.sourceKey ?? resolvedOriginKey;
    const baseLock: LockRecord = {
      commandId: command.commandId,
      playerId: command.playerId,
      actionType,
      manpowerCost: validation.manpowerCost,
      originX: validation.origin.x,
      originY: validation.origin.y,
      targetX: validation.target.x,
      targetY: validation.target.y,
      originKey: resolvedOriginKey,
      targetKey: simulationTileKey(validation.target.x, validation.target.y),
      resolvesAt: validation.resolvesAt,
      source: lockSourceFromSessionId(command.sessionId),
      ...(actionType === "ATTACK" && MUSTER_SYSTEM_ENABLED && actor.id !== "barbarian-1" ? { musterSourceKey: effectiveMusterSourceKey } : {})
    };
    // Reserve the muster amount so concurrent in-flight attacks can't double-spend.
    if (baseLock.musterSourceKey && actionType === "ATTACK") {
      const prev = this.musterReservedByKey.get(baseLock.musterSourceKey) ?? 0;
      this.musterReservedByKey.set(baseLock.musterSourceKey, prev + validation.manpowerCost);
      if (musterSource && baseLock.musterSourceKey !== resolvedOriginKey) {
        this.onMusterRemoteAttack?.();
      }
    }
    const combatResolution = actionType === "EXPAND" ? undefined : this.buildLockedCombatResolution(baseLock);
    const lock: LockRecord = {
      ...baseLock,
      ...(combatResolution ? { combatResolution } : {})
    };
    this.locksByTile.set(lock.originKey, lock);
    this.locksByTile.set(lock.targetKey, lock);
    this.locksByCommandId.set(lock.commandId, lock);
    this.commandTrace?.({
      phase: "frontier_accept",
      commandId: command.commandId,
      playerId: command.playerId,
      actionType,
      origin: { x: lock.originX, y: lock.originY },
      target: { x: lock.targetX, y: lock.targetY },
      resolvesAt: lock.resolvesAt
    });
    this.emitEvent({
      eventType: "COMMAND_ACCEPTED",
      commandId: command.commandId,
      playerId: command.playerId,
      actionType,
      originX: validation.origin.x,
      originY: validation.origin.y,
      targetX: validation.target.x,
      targetY: validation.target.y,
      resolvesAt: validation.resolvesAt,
      ...(combatResolution ? { combatResult: combatResolution.result } : {})
    });
    // Notify the defender that an attack is incoming on one of their tiles
    // so the rewrite client can render the under-attack overlay. Routed via
    // PLAYER_MESSAGE with playerId=defender — the gateway delivers this to
    // the defender's socket, even when the attacker is an unsubscribed AI.
    // Re-uses the attacker's commandId so the alert is recorded alongside
    // the rest of that command's events (avoids unbounded growth in the
    // non-terminal replay map). The gateway's PLAYER_MESSAGE handler
    // recognises the ATTACK_ALERT messageType and skips markResolved so
    // the attacker's real recovery slot stays open until COMBAT_RESOLVED.
    const defenderOwnerId = combatResolution?.result.defenderOwnerId;
    if (
      actionType === "ATTACK" &&
      defenderOwnerId &&
      defenderOwnerId !== command.playerId
    ) {
      this.emitEvent({
        eventType: "PLAYER_MESSAGE",
        commandId: command.commandId,
        playerId: defenderOwnerId,
        messageType: "ATTACK_ALERT",
        payloadJson: JSON.stringify({
          type: "ATTACK_ALERT",
          attackerId: command.playerId,
          attackerName: actor.name ?? command.playerId,
          x: validation.target.x,
          y: validation.target.y,
          fromX: validation.origin.x,
          fromY: validation.origin.y,
          resolvesAt: validation.resolvesAt
        })
      });
    }
    this.scheduleLockResolution(lock);
    return true;
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
      goldCost: SETTLE_COST
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
        goldCost: SETTLE_COST
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
        tileDeltas: [this.tileDeltaFromState(settledTile)]
      });
      this.emitPlayerStateUpdate({ commandId: input.commandId, playerId: input.playerId });
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
      getAbilityCooldownUntil: (playerId, abilityKey) => this.getAbilityCooldownUntil(playerId, abilityKey),
      setAbilityCooldownUntil: (playerId, abilityKey, untilMs) => this.setAbilityCooldownUntil(playerId, abilityKey, untilMs),
      strategicResourceAmount: (player, resource) => this.strategicResourceAmount(player, resource),
      addStrategicResource: (player, resource, amount) => this.addStrategicResource(player, resource, amount)
    };
  }

  private handleCreateMountainCommand(command: CommandEnvelope): void {
    handleCreateMountainCommandImpl(this.mapCommandContext(), command);
  }

  private handleRemoveMountainCommand(command: CommandEnvelope): void {
    handleRemoveMountainCommandImpl(this.mapCommandContext(), command);
  }

  private handleAirportBombardCommand(command: CommandEnvelope): void {
    handleAirportBombardCommandImpl(this.mapCommandContext(), command);
  }

  private getAbilityCooldownUntil(playerId: string, abilityKey: string): number {
    return getAbilityCooldownUntilImpl(this.abilityCooldowns, playerId, abilityKey);
  }

  private setAbilityCooldownUntil(playerId: string, abilityKey: string, untilMs: number): void {
    setAbilityCooldownUntilImpl(this.abilityCooldowns, playerId, abilityKey, untilMs);
  }

  private handleImperialExchangeLevyCommand(command: CommandEnvelope): void {
    handleImperialExchangeLevyCommandImpl(this.mapCommandContext(), command);
  }

  private handleWorldEngineStrikeCommand(command: CommandEnvelope): void {
    handleWorldEngineStrikeCommandImpl(this.mapCommandContext(), command);
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
      setTileState: (tileKey, tile) => { this.tiles.set(tileKey, tile); this.snapshotTileCache.set(tileKey, mapTile(tile)); },
      invalidateTileStringifyCache: (tileKey) => this.tileDeltaStringifyCache.invalidate(tileKey),
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId),
      invalidateEconomySnapshot: (playerId) => this.economySnapshotCacheByPlayer.delete(playerId),
      invalidateTileYieldContext: (playerId) => this.tileYieldContextCacheByPlayer.delete(playerId),
      invalidateUpkeepAccrual: (playerId) => this.upkeepAccrualCacheByPlayer.delete(playerId),
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
    playerId: string,
    targetX: number,
    targetY: number,
    now: number,
    range = this.observatoryCastRadiusFor(playerId)
  ): string | undefined {
    return pickReadyOwnedObservatoryForTargetImpl({ tiles: this.tiles, playerId, targetX, targetY, now, range });
  }

  /**
   * Variant for abilities with no spatial target (e.g. reveal_empire_stats targets a
   * player). Returns any owned, active, off-cooldown observatory, soonest-ready first.
   */
  private pickReadyOwnedObservatoryAny(playerId: string, now: number): string | undefined {
    return pickReadyOwnedObservatoryAnyImpl(this.tiles, playerId, now);
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

  private seaTileCountBetween(ax: number, ay: number, bx: number, by: number): number | undefined {
    return seaTileCountBetweenImpl(this.tiles, ax, ay, bx, by);
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
    return buildRevealEmpireStatsImpl(this.tiles.values(), target, this.now());
  }

  private emitEvent(event: SimulationEvent): void {
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

  private tileDeltaFromState(tile: DomainTileState, context?: RuntimeTileYieldEconomyContext): SimulationTileWireDelta {
    const player = tile.ownerId ? this.players.get(tile.ownerId) : undefined;
    const resolvedContext = player && context?.player.id === player.id ? context : player ? this.tileYieldEconomyContextForPlayer(player) : undefined;
    const enrichedTile = tile.town && resolvedContext ? this.enrichTileWithTownContext(tile, player, resolvedContext) : tile;
    const yieldView = buildTileYieldView(enrichedTile, this.tileYieldCollectedAt(simulationTileKey(tile.x, tile.y), tile.ownerId), this.now(), {
      ...(player ? { player } : {}),
      ...(resolvedContext ? { fedTownKeys: resolvedContext.fedTownKeys } : {}),
      ...(resolvedContext ? { firstThreeTownKeys: resolvedContext.firstThreeTownKeys } : {}),
      tiles: this.tiles,
      dockLinksByDockTileKey: this.dockLinksByDockTileKey
    });
    const tileKey = simulationTileKey(tile.x, tile.y);
    const cached = this.tileDeltaStringifyCache.getOrComputeAll(tileKey, tile);
    return {
      x: tile.x,
      y: tile.y,
      ...(tile.terrain ? { terrain: tile.terrain } : {}),
      ...(tile.resource ? { resource: tile.resource } : {}),
      ...(tile.dockId ? { dockId: tile.dockId } : {}),
      ...(cached.shardSiteJson ? { shardSiteJson: cached.shardSiteJson } : {}),
      // Explicit `undefined` (rather than `...({})`) is load-bearing on these
      // fields: subscribers diff by own-property existence to detect clears
      // (uncapture, structure removal). See the uncapture regression test.
      ownerId: tile.ownerId ?? undefined,
      ownershipState: tile.ownershipState ?? undefined,
      frontierDecayAt: tile.frontierDecayAt ?? undefined,
      frontierDecayKind: tile.frontierDecayKind ?? undefined,
      breachShockUntil: tile.breachShockUntil ?? undefined,
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
      ...(yieldView?.yield ? { yield: yieldView.yield } : {})
      // yieldRate and yieldCap are derived client-side from static yield tables
      // + townJson (goldPerMinute/cap). See packages/client/src/yield-derivation.ts.
    };
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
    const yieldView = buildTileYieldView(enrichedTile, this.tileYieldCollectedAt(tileKey, tile.ownerId), now, {
      ...(player ? { player } : {}),
      ...(resolvedContext ? { fedTownKeys: resolvedContext.fedTownKeys } : {}),
      ...(resolvedContext ? { firstThreeTownKeys: resolvedContext.firstThreeTownKeys } : {}),
      tiles: this.tiles,
      dockLinksByDockTileKey: this.dockLinksByDockTileKey
    });
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

  private tileHasActiveFortPatrolGrace(tileKey: string, nowMs: number): boolean {
    const graceUntil = this.fortPatrolGraceUntilByTile.get(tileKey) ?? 0;
    if (graceUntil <= nowMs) {
      if (graceUntil > 0) this.fortPatrolGraceUntilByTile.delete(tileKey);
      return false;
    }
    return true;
  }

  private isDockCrossingTarget(from: DomainTileState, toX: number, toY: number): boolean {
    if (!from.dockId) return false;
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
    for (const tile of this.tiles.values()) {
      if (tile.ownerId !== playerId || tile.terrain !== "LAND" || !tile.dockId) continue;
      if (this.isDockCrossingTarget(tile, toX, toY)) return tile;
    }
    return undefined;
  }

  private findOwnedAetherBridgeOriginForCrossing(
    playerId: string, toX: number, toY: number
  ): DomainTileState | undefined {
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
  }

  private handleUnwatchMusterCommand(command: CommandEnvelope): void {
    this.watchedMusterTileByPlayer.delete(command.playerId);
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
    resolveLockImpl(this.lockResolutionContext(), lock);
  }

  private applyEncirclementForExpand(targetKey: string, playerId: string, commandId: string): void {
    applyEncirclementForExpandImpl(this.encirclementApplicationContext(), targetKey, playerId, commandId);
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
    requiredMuster: number
  ): { sourceKey: string; available: number } | undefined {
    const origin = this.tiles.get(originKey);
    if (!origin) return undefined;

    // Fast path: origin tile's own muster suffices.
    if (origin.muster?.ownerId === actorId) {
      const reserved = this.musterReservedByKey.get(originKey) ?? 0;
      const available = origin.muster.amount - reserved;
      if (available >= requiredMuster) return { sourceKey: originKey, available };
    }

    const musterKeys = this.musterTilesByOwner.get(actorId);
    if (!musterKeys) return undefined;

    let bestKey: string | undefined;
    let bestDist = Infinity;

    for (const tileKey of musterKeys) {
      if (tileKey === originKey) continue; // already checked above
      const tile = this.tiles.get(tileKey);
      if (!tile?.muster || tile.muster.ownerId !== actorId) continue;
      const reserved = this.musterReservedByKey.get(tileKey) ?? 0;
      const available = tile.muster.amount - reserved;
      if (available < requiredMuster) continue;

      // Chebyshev distance with world wrapping.
      const dx = Math.min(Math.abs(tile.x - origin.x), WORLD_WIDTH - Math.abs(tile.x - origin.x));
      const dy = Math.min(Math.abs(tile.y - origin.y), WORLD_HEIGHT - Math.abs(tile.y - origin.y));
      const dist = Math.max(dx, dy);
      if (dist <= 4 && dist < bestDist) {
        bestDist = dist;
        bestKey = tileKey;
      }
    }

    if (!bestKey) return undefined;
    const tile = this.tiles.get(bestKey)!;
    const reserved = this.musterReservedByKey.get(bestKey) ?? 0;
    return { sourceKey: bestKey, available: tile.muster!.amount - reserved };
  }

  /**
   * Manpower an attacker must have mustered on the origin tile to strike this
   * target. Phase 5 baseline: the flat attack cost. Phase 7 raises it to the
   * target fort's garrison; Phase 8 lowers it for barbarian raids.
   */
  private requiredMusterForTarget(target: DomainTileState): number {
    // Barbarian tiles are raided cheaply from the pool (handled in validateFrontierCommand).
    if (target.ownerId === "barbarian-1") return BARBARIAN_RAID_COST;
    const fortGarrison = (target.fort?.status === "active" && target.fort.garrison != null)
      ? target.fort.garrison
      : 0;
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
      handleCreateMountainCommand: (command) => this.handleCreateMountainCommand(command),
      handleRemoveMountainCommand: (command) => this.handleRemoveMountainCommand(command),
      handleAirportBombardCommand: (command) => this.handleAirportBombardCommand(command),
      handleImperialExchangeLevyCommand: (command) => this.handleImperialExchangeLevyCommand(command),
      handleWorldEngineStrikeCommand: (command) => this.handleWorldEngineStrikeCommand(command),
      handleUpgradeTownTierCommand: (command) => this.handleUpgradeTownTierCommand(command),
      handleCollectShardCommand: (command) => this.handleCollectShardCommand(command),
      handleSyncAllianceCommand: (command) => this.handleSyncAllianceCommand(command),
      handleFrontierCommand: (command, actionType) => this.handleFrontierCommand(command, actionType)
    };
  }

  private queueCommandForProcessing(command: CommandEnvelope): void {
    const lane = laneForCommand(command);
    this.enqueueJob(lane, () => dispatchRuntimeCommand(command, this.commandDispatchHandlers()), command.type, commandScheduling(command));
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
