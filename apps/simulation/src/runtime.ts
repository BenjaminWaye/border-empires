import { EventEmitter } from "node:events";

import type { CommandEnvelope, LockedFrontierCombatResult, ManpowerBreakdown, SimulationEvent } from "@border-empires/sim-protocol";
import type { PlayerRespawnNotice, PlayerRespawnReasonCode } from "@border-empires/shared";
import {
  buildRewritePlayerRespawnNotice,
  type PendingRespawnNoticeContext
} from "./player-respawn-notice.js";
import {
  validateFrontierCommand,
  fortAttackManpowerMultiplier,
  type DomainPlayer,
  type DomainTileState,
  type FrontierCommandType
} from "@border-empires/game-domain";
import {
  ATTACK_MANPOWER_MIN,
  ATTACK_MANPOWER_COST,
  SWEEP_ATTACK_COST,
  SWEEP_BUDGET_CAP,
  SWEEP_RADIUS_BY_VARIANT,
  BARBARIAN_MULTIPLY_THRESHOLD,
  BARBARIAN_POPULATION_CAP,
  DEVELOPMENT_PROCESS_LIMIT,
  FOREST_FRONTIER_CLAIM_MULT,
  FRONTIER_CLAIM_COST,
  FRONTIER_CLAIM_MS,
  MANPOWER_BASE_CAP,
  MANPOWER_BASE_REGEN_PER_MINUTE,
  TOWN_MANPOWER_BY_TIER,
  manpowerRegenWeightForSettlementIndex,
  SETTLE_COST,
  VISION_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  grassShadeAt,
  isSeaTerrain,
  landBiomeAt,
  terrainAt,
  type Terrain,
  targetOutpostMult,
  type OutpostPosition,
  rollFrontierCombat,
  structureBuildDurationMs,
  structureBuildGoldCost,
  structureBuildManpowerCost,
  structureCostDefinition,
  structurePlacementMetadata,
  structureShowsOnTile,
  isChosenTrickleResource,
  type BuildableStructureType,
  type EconomicStructureType
} from "@border-empires/shared";
import {
  AETHER_BRIDGE_COOLDOWN_MS,
  AETHER_BRIDGE_CRYSTAL_COST,
  AETHER_BRIDGE_DURATION_MS,
  AETHER_BRIDGE_MAX_SEA_TILES,
  AETHER_WALL_COOLDOWN_MS,
  AETHER_WALL_CRYSTAL_COST,
  AETHER_WALL_DURATION_MS,
  AIRPORT_BOMBARD_CRYSTAL_COST,
  AETHER_TOWER_RADIUS,
  AEGIS_DOME_PROTECTION_RADIUS,
  AIRPORT_BOMBARD_RANGE,
  IMPERIAL_EXCHANGE_LEVY_CRYSTAL_COST,
  IMPERIAL_EXCHANGE_LEVY_COOLDOWN_MS,
  IMPERIAL_EXCHANGE_LEVY_SHARE,
  WORLD_ENGINE_STRIKE_CRYSTAL_COST,
  WORLD_ENGINE_STRIKE_COOLDOWN_MS,
  WORLD_ENGINE_STRIKE_POPULATION_LOSS_RATIO,
  ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS,
  CRYSTAL_SYNTHESIZER_OVERLOAD_CRYSTAL,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP,
  FUR_SYNTHESIZER_OVERLOAD_SUPPLY,
  FUR_SYNTHESIZER_GOLD_UPKEEP,
  IRONWORKS_OVERLOAD_IRON,
  IRONWORKS_GOLD_UPKEEP,
  OBSERVATORY_CAST_RADIUS,
  REVEAL_EMPIRE_ACTIVATION_COST,
  REVEAL_EMPIRE_STATS_COOLDOWN_MS,
  REVEAL_EMPIRE_STATS_CRYSTAL_COST,
  SIPHON_COOLDOWN_MS,
  SIPHON_CRYSTAL_COST,
  SIPHON_DURATION_MS,
  SIPHON_PURGE_CRYSTAL_COST,
  SIPHON_SHARE,
  SYNTH_OVERLOAD_DISABLE_MS,
  SYNTH_OVERLOAD_GOLD_COST,
  POPULATION_MAX,
  TERRAIN_SHAPING_COOLDOWN_MS,
  TERRAIN_SHAPING_CRYSTAL_COST,
  TERRAIN_SHAPING_GOLD_COST
} from "@border-empires/game-domain";
import {
  DEFAULT_MAX_PLAYER_SEQ_REPLAY_ENTRIES,
  DEFAULT_MAX_TERMINAL_COMMAND_REPLAY_HISTORY,
  isTerminalCommandEvent
} from "./command-event-lifecycle.js";
import { laneForCommand, type QueueLane } from "./command-lane.js";
import { isFrontierAdjacent } from "./frontier-adjacency.js";
import {
  buildDockLinksByDockTileKey,
  collectLinkedDockRevealKeysForOwners,
  computeLinkedDockRevealTileKeys,
  isValidDockCrossingTarget,
  type DockRouteDefinition
} from "./dock-network.js";
import { chooseNextOwnedFrontierCommandFromLookup } from "./frontier-command-planner.js";
import { frontierNeighborCoords } from "./frontier-topology.js";
import {
  coordsInChebyshevRadius,
  FRONTIER_DECAY_MS,
  FORT_AUTO_FRONTIER_RADIUS,
  fortAutoAttackCandidates,
  fortAutoFrontierRadiusForTile,
  FORT_PATROL_GRACE_MS,
  isActiveFortAnchor,
  isAutoClaimTarget,
  isSettledTownAnchor,
  MAX_FORT_AUTO_FRONTIER_RADIUS,
  orderedAutoSettlementTileKeys,
  sweepAttackCandidates,
  TOWN_AUTO_FRONTIER_RADIUS
} from "./territory-automation.js";
import { buildPlayerDefensibilityMetrics } from "./player-defensibility-metrics.js";
import {
  candidateIndexKeysAroundTileKey,
  isBuildCandidateTile,
  isHotFrontierTile,
  isStrategicFrontierTile,
  playerIdsAffectedByTileChange
} from "./planner-candidate-index.js";
import {
  addPendingSettlementToSummary,
  applyTileToPlayerSummary,
  cloneStrategicProduction,
  createEmptyPlayerRuntimeSummary,
  removePendingSettlementFromSummary,
  removeTileFromPlayerSummary,
  type PendingSettlementRecord,
  type PlayerRuntimeSummary
} from "./player-runtime-summary.js";
import {
  buildFedTownKeys,
  buildPlayerUpdateEconomySnapshot,
  buildStrategicProductionForSettledTiles,
  refreshTownEconomyFields,
  type PlayerUpdateEconomySnapshot
} from "./player-update-economy.js";
import {
  addTileUpkeepToCache,
  buildUpkeepAccrualSnapshot,
  removeTileUpkeepFromCache,
  type UpkeepAccrualSnapshot
} from "./player-upkeep-incremental.js";
import { buildConnectedTownNetworkForPlayer, enrichTownWithConnectedNetwork, firstThreeTownKeysForPlayer } from "./economy-network.js";
import { capturedStructureFields } from "./capture-structures.js";
import { createSeedWorld, simulationTileKey } from "./seed-state.js";
import { buildSimulationSnapshotCommandEvents, type SimulationSnapshotSections } from "./snapshot-store.js";
import {
  buildModBreakdownForPlayer,
  buildDomainUpdatePayload,
  buildTechUpdatePayload,
  chooseDomainForPlayer,
  type ChosenTrickleResource,
  chosenTrickleRateForPlayer,
  chooseTechForPlayer,
  effectiveVisionRadiusForPlayer,
  multiplicativeEffectForPlayer,
  observatoryCastRadiusForPlayer,
  recomputeMods,
  visionRadiusBonusForPlayer
} from "./tech-domain-bridge.js";
import {
  filterTileDeltasForPlayer as filterTileDeltasForPlayerImpl,
  type VisibilityAuditSample
} from "./tile-delta-visibility-filter.js";
import { buildTileYieldView } from "./tile-yield-view.js";
import { chooseLegacySpawnPlacement } from "./spawn-placement.js";
import type { PlannerPlayerView, PlannerTileView, PlannerWorldView } from "./planner-world-view.js";
import { buildPlannerTileSlice, toPlannerTileView } from "./planner-world-view-slice.js";
import {
  createAutomationNoopDiagnostic,
  planAutomationCommand,
  type AutomationPlannerDiagnostic
} from "./automation-command-planner.js";
import { chooseAutomationPreplanCommand } from "./ai-preplan-command.js";
import type { AutomationVictoryPath } from "./automation-strategic-snapshot.js";
import {
  AI_SPATIAL_FOCUS_EXPIRY_JITTER_MS,
  selectSpatialFocus,
  type AiSpatialFocus
} from "./ai-spatial-focus.js";
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
} from "./runtime-types.js";
import {
  parseAetherWallPayload,
  parseAirportBombardPayload,
  parseAllianceSyncPayload,
  parseConverterTogglePayload,
  parseEconomicStructurePayload,
  parseFrontierPayload,
  parseImperialExchangeLevyPayload,
  parseRevealPayload,
  parseSettlePayload,
  parseSiegeOutpostSweepPayload,
  parseStructureTilePayload,
  parseTilePayload,
  parseWorldEngineStrikePayload
} from "./runtime-command-parsers.js";
import {
  SYNTHETIC_SETTLEMENT_POPULATION,
  createDocksFromInitialState,
  createLocksFromInitialState,
  createPlayersFromRecoveredState,
  createTilesFromInitialState,
  hydrateCommandHistory,
  requeueRecoveredCommands,
  uniqueLocksByCommandId
} from "./runtime-hydration.js";
import { computeEncirclementDeltas, ENCIRCLEMENT_DECAY_MS } from "./encirclement.js";
import { TileDeltaStringifyCache } from "./tile-delta-stringify-cache.js";
import { PlayerCandidateIndex, MAX_SWEEP_RADIUS } from "./player-candidate-index.js";

export { InMemorySimulationPersistence } from "./runtime-types.js";
export type { SimulationTileWireDelta } from "./runtime-types.js";

const plannerPlayerScopeKeyCount = (summary: PlayerRuntimeSummary): number => {
  const scopedKeys = new Set<string>();
  for (const key of summary.territoryTileKeys) scopedKeys.add(key);
  for (const key of summary.frontierTileKeys) scopedKeys.add(key);
  for (const key of summary.hotFrontierTileKeys) scopedKeys.add(key);
  for (const key of summary.strategicFrontierTileKeys) scopedKeys.add(key);
  for (const key of summary.buildCandidateTileKeys) scopedKeys.add(key);
  for (const key of summary.pendingSettlementsByTile.keys()) scopedKeys.add(key);
  return scopedKeys.size;
};

export type { VisibilityAuditSample };

const domainTileToWireDelta = (tile: DomainTileState): SimulationTileWireDelta => ({
  x: tile.x,
  y: tile.y,
  terrain: tile.terrain,
  ...(tile.resource ? { resource: tile.resource } : {}),
  ...(tile.dockId ? { dockId: tile.dockId } : {}),
  ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
  ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
  ...(typeof tile.frontierDecayAt === "number" ? { frontierDecayAt: tile.frontierDecayAt } : {}),
  ...(tile.frontierDecayKind ? { frontierDecayKind: tile.frontierDecayKind } : {}),
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
});

const priorityOrder: QueueLane[] = ["human_interactive", "human_noninteractive", "system", "ai"];
// Force a full upkeep-cache rebuild every N reads to bound floating-point drift
// from the incremental add/subtract sum over a long-lived season.
const UPKEEP_ACCRUAL_REBUILD_INTERVAL = 256;
export const SETTLE_DURATION_MS = 60_000;
export const FOREST_SETTLEMENT_MULT = 2;
export const MAX_SETTLE_DURATION_MS = SETTLE_DURATION_MS * FOREST_SETTLEMENT_MULT;
const COLLECT_VISIBLE_COOLDOWN_MS = 20_000;

const isForestSettlementTile = (x: number, y: number): boolean =>
  terrainAt(x, y) === "LAND" &&
  landBiomeAt(x, y) === "GRASS" &&
  grassShadeAt(x, y) === "DARK";

export const settlementBaseDurationMsForTile = (tile: Pick<DomainTileState, "x" | "y">): number =>
  isForestSettlementTile(tile.x, tile.y) ? SETTLE_DURATION_MS * FOREST_SETTLEMENT_MULT : SETTLE_DURATION_MS;

export const settlementDurationMsForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">,
  baseDurationMs = SETTLE_DURATION_MS
): number => {
  const speedMultiplier = multiplicativeEffectForPlayer(player, "settlementSpeedMult");
  return Math.max(1, Math.round(baseDurationMs / speedMultiplier));
};

const createHumanRuntimePlayer = (playerId: string): RuntimePlayer => ({
  id: playerId,
  isAi: false,
  name: playerId,
  points: 100,
  manpower: MANPOWER_BASE_CAP,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-runtime",
  allies: new Set<string>(),
  strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
  strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 }
});

const strategicResourceForTile = (resource: DomainTileState["resource"] | undefined): StrategicResourceKey | undefined => {
  switch (resource) {
    case "FARM":
    case "FISH":
      return "FOOD";
    case "IRON":
      return "IRON";
    case "GEMS":
      return "CRYSTAL";
    case "FUR":
      return "SUPPLY";
    case "OIL":
      return "OIL";
    default:
      return undefined;
  }
};

const TECH_REQUIREMENTS_BY_STRUCTURE: Partial<Record<EconomicStructureType, string>> = {
  FARMSTEAD: "agriculture",
  CAMP: "leatherworking",
  MINE: "mining",
  MARKET: "trade",
  GRANARY: "pottery",
  SEED_GRANARY: "seed-granaries",
  BANK: "coinage",
  AIRPORT: "aeronautics",
  FUR_SYNTHESIZER: "workshops",
  ADVANCED_FUR_SYNTHESIZER: "advanced-synthetication",
  IRONWORKS: "alchemy",
  ADVANCED_IRONWORKS: "advanced-synthetication",
  CRYSTAL_SYNTHESIZER: "crystal-lattices",
  ADVANCED_CRYSTAL_SYNTHESIZER: "advanced-synthetication",
  CARAVANARY: "ledger-keeping",
  FOUNDRY: "industrial-extraction",
  GARRISON_HALL: "organization",
  CUSTOMS_HOUSE: "trade",
  GOVERNORS_OFFICE: "civil-service",
  RADAR_SYSTEM: "radar"
};

const upgradeBaseTypeForEconomicStructure = (type: EconomicStructureType): EconomicStructureType | undefined => {
  if (type === "ADVANCED_FUR_SYNTHESIZER") return "FUR_SYNTHESIZER";
  if (type === "ADVANCED_IRONWORKS") return "IRONWORKS";
  if (type === "ADVANCED_CRYSTAL_SYNTHESIZER") return "CRYSTAL_SYNTHESIZER";
  if (type === "SEED_GRANARY") return "GRANARY";
  return undefined;
};

const isConverterStructureType = (structureType: EconomicStructureType): boolean =>
  structureType === "FUR_SYNTHESIZER" ||
  structureType === "ADVANCED_FUR_SYNTHESIZER" ||
  structureType === "IRONWORKS" ||
  structureType === "ADVANCED_IRONWORKS" ||
  structureType === "CRYSTAL_SYNTHESIZER" ||
  structureType === "ADVANCED_CRYSTAL_SYNTHESIZER";

const economicStructureGoldUpkeepPerInterval = (structureType: EconomicStructureType): number => {
  const perMinute =
    structureType === "ADVANCED_FUR_SYNTHESIZER" || structureType === "FUR_SYNTHESIZER" ? FUR_SYNTHESIZER_GOLD_UPKEEP / 10
      : structureType === "IRONWORKS" || structureType === "ADVANCED_IRONWORKS" ? IRONWORKS_GOLD_UPKEEP / 10
      : structureType === "CRYSTAL_SYNTHESIZER" || structureType === "ADVANCED_CRYSTAL_SYNTHESIZER" ? CRYSTAL_SYNTHESIZER_GOLD_UPKEEP / 10
      : 0;
  return perMinute * (ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS / 60_000);
};

// Grace beyond resolvesAt before the sweep drops a lock. Normal locks resolve
// inside their setTimeout window; anything still present 60s after its scheduled
// resolution is a leak from a code path that bypassed validation.
const ORPHAN_LOCK_GRACE_MS = 60_000;

const TOWN_CAPTURE_SHOCK_MS = 10 * 60 * 1000;
const TOWN_CAPTURE_POPULATION_LOSS_MULT = 0.95;

const SHARD_RAIN_SCHEDULE_HOURS = [12, 20] as const;
const SHARD_RAIN_TTL_MS = 30 * 60_000;
const SHARD_RAIN_WARNING_LEAD_MS = 60 * 60 * 1000;
const SHARD_RAIN_SITE_MIN = 3;
const SHARD_RAIN_SITE_MAX = 6;
const SHARD_RAIN_COMMAND_ID_PREFIX = "system-shard-rain";
const SHARD_RAIN_SYSTEM_PLAYER_ID = "system-shard-rain";

const shardRainSlotKey = (at: Date): string =>
  `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}-${at.getHours()}`;

const nextShardRainStartAt = (nowMs: number): number => {
  const now = new Date(nowMs);
  const todayBase = new Date(now.getTime());
  todayBase.setMinutes(0, 0, 0);
  for (const hour of SHARD_RAIN_SCHEDULE_HOURS) {
    const candidate = new Date(todayBase.getTime());
    candidate.setHours(hour, 0, 0, 0);
    if (candidate.getTime() > nowMs) return candidate.getTime();
  }
  const tomorrow = new Date(todayBase.getTime());
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(SHARD_RAIN_SCHEDULE_HOURS[0], 0, 0, 0);
  return tomorrow.getTime();
};

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
  private readonly rememberedAutomationVictoryPathByPlayer = new Map<string, AutomationVictoryPath>();
  // Bounded per-AI focus front (BFS of owned tiles around a persistent
  // hot-frontier origin) used to cap planner CPU. Refreshed each tick from
  // refreshSpatialFocusForPlayer; cleared automatically when the player owns
  // no territory.
  private readonly aiSpatialFocusByPlayer = new Map<string, AiSpatialFocus>();
  private readonly plannerPlayerTileKeyCacheByPlayer = new Map<string, {
    tileCollectionVersion: number;
    territoryTileKeys: string[];
    frontierTileKeys: string[];
    hotFrontierTileKeys: string[];
    strategicFrontierTileKeys: string[];
    buildCandidateTileKeys: string[];
    pendingSettlementTileKeys: string[];
  }>();
  private readonly locksByTile: Map<string, LockRecord>;
  // Pooled per-tick accumulators for updateFrontierDecay.
  // Reset via arr.length = 0 at the top of each call (preserves inner arrays).
  private readonly frontierDecayChangedByOwner = new Map<string, Array<SimulationTileWireDelta>>();
  private readonly frontierDecayExpiredByOwner = new Map<string, string[]>();
  // Part 1: index of FRONTIER tiles per owner — avoids full this.tiles scan in updateFrontierDecay.
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
  // Index of yield-bearing SETTLED LAND tiles per owner. A tile is yield-bearing
  // iff it has town, dockId, a strategic resource, or an active converter
  // economicStructure. Maintained in replaceTileState; rebuilt from this.tiles
  // in the constructor. Used by handleCollectVisibleCommand to skip the 99% of
  // settled tiles that produce zero yield (plain land).
  private readonly yieldBearingTilesByOwner = new Map<string, Set<string>>();
  // Per-(owner, BuildableStructureType) counter used by structureBuildGoldCost
  // to apply incremental scaling on each new BUILD_* command. Replaces an
  // O(all_tiles) scan that took 884ms on a 250k-tile world (2026-05-28 prod
  // BUILD_FORT). Maintained in refreshOwnedStructureCountIndexForTile;
  // populated in the constructor's first-pass tile loop.
  private readonly ownedStructureCountByPlayerByType = new Map<string, Map<BuildableStructureType, number>>();
  private readonly barbarianTileProgress = new Map<string, number>();
  private readonly collectVisibleCooldownByPlayer = new Map<string, number>();
  private readonly abilityCooldowns = new Map<string, Map<string, number>>();
  private readonly tileYieldCollectedAtByTile = new Map<string, number>();
  private readonly playerYieldCollectionEpochByPlayer = new Map<string, number>();
  private readonly fortPatrolGraceUntilByTile = new Map<string, number>();
  // Epoch ms when each tile last transitioned into SETTLED ownership. Stamped
  // inside replaceTileState; consumed by tickTileShedding to shed newest-first
  // when a player is broke (points <= 0 and net gold/min <= 0). Not persisted —
  // tiles recovered from the event log have no entry and tie at -Infinity, so
  // they're shed last (which matches the intent: an empire that survived
  // restart shouldn't have its core tiles shed before its newer expansions).
  private readonly tileSettledAtByKey = new Map<string, number>();
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
  // (same replaceTileState triggers). Without this cache, COLLECT_VISIBLE calls
  // tileYieldEconomyContextForPlayer which rebuilds the town network from all
  // settled tiles — O(250k) at target scale.
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
  private readonly recordedEventsByCommandId = new Map<string, SimulationEvent[]>();
  private readonly commandIdsByPlayerSeq = new Map<string, string>();
  private lastShardRainSpawnSlotKey: string | undefined;
  private lastShardRainWarningSlotKey: string | undefined;
  private shardRainTickCounter = 0;
  private currentShardRainExpiresAt: number | undefined;
  private currentShardRainSiteCount = 0;
  private readonly lastShardRainHelloByPlayer = new Map<string, number>();
  private readonly recentShardRainTileKeys = new Set<string>();
  private readonly terminalReplayCommandIds = new Map<string, true>();
  private readonly terminalOnlyReplayCommandIds = new Set<string>();
  private territoryAutomationCounter = 0;
  private readonly maxTerminalCommandReplayHistory: number;
  private readonly maxPlayerSeqReplayEntries: number;
  private readonly backgroundBatchSize: number;
  private readonly scheduleSoon: (task: () => void) => void;
  private readonly scheduleAfter: (delayMs: number, task: () => void) => void;
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
  private readonly onCollectVisibleSample:
    | ((sample: {
        playerId: string;
        yieldMs: number;
        deltaMs: number;
        tileDeltaBatchEmitMs: number;
        collectResultEmitMs: number;
        playerStateUpdateMs: number;
        tilesConsidered: number;
        tilesTouched: number;
      }) => void)
    | undefined;
  private drainScheduled = false;
  private immediateDrainScheduled = false;
  private draining = false;
  private readonly tileDeltaStringifyCache = new TileDeltaStringifyCache();
  private readonly playerCandidateIndex = new PlayerCandidateIndex();

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
    this.maxTerminalCommandReplayHistory = Math.max(
      0,
      options.maxTerminalCommandReplayHistory ?? DEFAULT_MAX_TERMINAL_COMMAND_REPLAY_HISTORY
    );
    this.maxPlayerSeqReplayEntries = Math.max(
      0,
      options.maxPlayerSeqReplayEntries ?? DEFAULT_MAX_PLAYER_SEQ_REPLAY_ENTRIES
    );
    this.scheduleSoon = options.scheduleSoon ?? ((task) => queueMicrotask(task));
    this.scheduleAfter = options.scheduleAfter ?? ((delayMs, task) => void setTimeout(task, delayMs));
    this.commandTrace = options.commandTrace;
    this.onQueueDrain = options.onQueueDrain;
    this.onJobApplied = options.onJobApplied;
    this.onCollectVisibleSample = options.onCollectVisibleSample;
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
    this.docks = createDocksFromInitialState(options.initialState, options.seedDocks ?? seedWorld?.docks ?? []);
    this.dockLinksByDockTileKey = buildDockLinksByDockTileKey(this.docks);
    this.locksByTile = createLocksFromInitialState(options.initialState);
    for (const yieldEntry of options.initialState?.tileYieldCollectedAtByTile ?? []) {
      this.tileYieldCollectedAtByTile.set(yieldEntry.tileKey, yieldEntry.collectedAt);
    }
    for (const yieldEntry of options.initialState?.playerYieldCollectionEpochByPlayer ?? []) {
      this.playerYieldCollectionEpochByPlayer.set(yieldEntry.playerId, yieldEntry.collectedAt);
    }
    for (const cooldown of options.initialState?.collectVisibleCooldownByPlayer ?? []) {
      this.collectVisibleCooldownByPlayer.set(cooldown.playerId, cooldown.cooldownUntil);
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
      }
      // Part 1: populate frontierTilesByOwner index.
      if (tile.ownershipState === "FRONTIER" && tile.ownerId && !tile.ownerId.startsWith("barbarian-")) {
        let set = this.frontierTilesByOwner.get(tile.ownerId);
        if (!set) { set = new Set<string>(); this.frontierTilesByOwner.set(tile.ownerId, set); }
        set.add(tileKey);
      }
      // Populate yieldBearingTilesByOwner index.
      if (this.isYieldBearing(tile) && tile.ownerId) {
        let set = this.yieldBearingTilesByOwner.get(tile.ownerId);
        if (!set) { set = new Set<string>(); this.yieldBearingTilesByOwner.set(tile.ownerId, set); }
        set.add(tileKey);
      }
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
      // Fort kind: active fort (any variant, including patrol-grace) or active WOODEN_FORT.
      if (
        tile.economicStructure?.ownerId === ownerId &&
        tile.economicStructure.type === "WOODEN_FORT" &&
        tile.economicStructure.status === "active"
      ) {
        this.playerCandidateIndex.registerAnchor(tileKey, ownerId, MAX_FORT_AUTO_FRONTIER_RADIUS, (k) => this.tiles.get(k));
        // Part 2: register in activeFortAnchorsByOwner
        this.registerFortSupportAnchor(tileKey, ownerId, MAX_FORT_AUTO_FRONTIER_RADIUS);
      } else if (
        tile.fort?.ownerId === ownerId &&
        tile.fort.status === "active"
      ) {
        this.playerCandidateIndex.registerAnchor(tileKey, ownerId, MAX_FORT_AUTO_FRONTIER_RADIUS, (k) => this.tiles.get(k));
        // Part 2: register in activeFortAnchorsByOwner
        this.registerFortSupportAnchor(tileKey, ownerId, MAX_FORT_AUTO_FRONTIER_RADIUS);
      } else if (isSettledTownAnchor(tile, ownerId)) {
        this.playerCandidateIndex.registerAnchor(tileKey, ownerId, TOWN_AUTO_FRONTIER_RADIUS, (k) => this.tiles.get(k));
        // Part 2: register in activeFortAnchorsByOwner
        this.registerFortSupportAnchor(tileKey, ownerId, TOWN_AUTO_FRONTIER_RADIUS);
      } else if (
        tile.siegeOutpost?.ownerId === ownerId &&
        tile.siegeOutpost.status === "active" &&
        tile.siegeOutpost.sweepActive
      ) {
        this.playerCandidateIndex.registerAnchor(tileKey, ownerId, MAX_SWEEP_RADIUS, (k) => this.tiles.get(k));
        // NOTE: siege outposts are NOT registered in activeFortAnchorsByOwner (by design)
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
          scheduleStructureFinish(tile.fort.completesAt, () => this.completeFortBuild(tileKey, ownerId, recoveredCommandId));
        } else if (tile.fort.status === "removing") {
          scheduleStructureFinish(tile.fort.completesAt, () => this.completeStructureRemoval(tileKey, ownerId, recoveredCommandId));
        }
      }
      if (tile.observatory?.ownerId === ownerId) {
        if (tile.observatory.status === "under_construction") {
          scheduleStructureFinish(tile.observatory.completesAt, () => this.completeObservatoryBuild(tileKey, ownerId, recoveredCommandId));
        } else if (tile.observatory.status === "removing") {
          scheduleStructureFinish(tile.observatory.completesAt, () => this.completeStructureRemoval(tileKey, ownerId, recoveredCommandId));
        }
      }
      if (tile.siegeOutpost?.ownerId === ownerId) {
        if (tile.siegeOutpost.status === "under_construction") {
          scheduleStructureFinish(tile.siegeOutpost.completesAt, () => this.completeSiegeOutpostBuild(tileKey, ownerId, recoveredCommandId));
        } else if (tile.siegeOutpost.status === "removing") {
          scheduleStructureFinish(tile.siegeOutpost.completesAt, () => this.completeStructureRemoval(tileKey, ownerId, recoveredCommandId));
        }
      }
      if (tile.economicStructure?.ownerId === ownerId) {
        if (tile.economicStructure.status === "under_construction") {
          const structureType = tile.economicStructure.type;
          scheduleStructureFinish(tile.economicStructure.completesAt, () => this.completeEconomicStructureBuild(tileKey, ownerId, structureType, recoveredCommandId));
        } else if (tile.economicStructure.status === "removing") {
          scheduleStructureFinish(tile.economicStructure.completesAt, () => this.completeStructureRemoval(tileKey, ownerId, recoveredCommandId));
        }
      }
    }
    const recoveredCommandHistory = options.initialCommandHistory;
    hydrateCommandHistory({
      commandIdsByPlayerSeq: this.commandIdsByPlayerSeq,
      recordedEventsByCommandId: this.recordedEventsByCommandId,
      ...(recoveredCommandHistory ? { recoveredCommandHistory } : {})
    });
    this.rebuildTerminalReplayIndex();
    this.pruneReplayCaches();
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

  // Universal tile-shedding: every minute, for each player whose treasury is
  // empty AND net gold/min is non-positive, shed their most-recently-settled
  // owned SETTLED tile. Strips town + all per-tile structures so the next
  // capturer doesn't inherit the upkeep ghost. Skips locked tiles so the shed
  // never races a combat resolution. One tile per player per call.
  tickTileShedding(nowMs: number = this.now()): void {
    for (const player of this.players.values()) {
      if (player.id.startsWith("barbarian-")) continue;
      // Make sure points/upkeep reflect the current time before the gate test.
      this.applyEconomyAccrual(player, nowMs);
      if ((player.points ?? 0) > 0) continue;
      const summary = this.summaryForPlayer(player.id);
      // Gate is purely treasury==0 after applyEconomyAccrual. We dropped the
      // `net <= threshold` check because `economy.upkeepPerMinute.gold`
      // diverges from the realized treasury drain: upkeep is consumed from
      // tile yield in-place inside consumeUpkeepFromTileYield BEFORE the
      // residual is subtracted from player.points, so a player whose tile
      // yield is fully eaten in-place can show `net = gross - upkeep > 0`
      // while their treasury is still strictly zero. If treasury is zero
      // after accrual, the player is broke regardless of theoretical net.

      let shedTileKey: string | undefined;
      let shedTile: DomainTileState | undefined;
      let shedStamp = -Infinity;
      for (const tileKey of summary.territoryTileKeys) {
        const tile = this.tiles.get(tileKey);
        if (!tile) continue;
        if (tile.ownerId !== player.id) continue;
        if (tile.ownershipState !== "SETTLED") continue;
        if (this.locksByTile.has(tileKey)) continue;
        const stamp = this.tileSettledAtByKey.get(tileKey) ?? -Infinity;
        // Use >= so the very first eligible tile always wins, even when its
        // stamp is -Infinity (which is the case for every tile recovered
        // from the event log — tileSettledAtByKey is in-memory only). Map
        // iteration is insertion order, so on ties the last-inserted tile
        // wins — a reasonable "newest" proxy when stamps are missing.
        if (stamp >= shedStamp) {
          shedStamp = stamp;
          shedTileKey = tileKey;
          shedTile = tile;
        }
      }
      if (!shedTileKey || !shedTile) continue;

      const commandId = `tile-shed:${player.id}:${shedTileKey}:${nowMs}`;
      const shedState: DomainTileState = {
        ...shedTile,
        ownerId: undefined,
        ownershipState: undefined,
        town: undefined,
        fort: undefined,
        observatory: undefined,
        siegeOutpost: undefined,
        economicStructure: undefined
      };
      this.replaceTileState(shedTileKey, shedState, commandId);
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId,
        playerId: player.id,
        tileDeltas: [
          {
            ...this.tileDeltaFromState(shedState),
            ownerId: "",
            ownershipState: "",
            townJson: "",
            fortJson: "",
            observatoryJson: "",
            siegeOutpostJson: "",
            economicStructureJson: ""
          }
        ]
      });
      this.emitPlayerStateUpdate({ commandId, playerId: player.id });
    }
  }

  // Belt-and-braces: drop any LockRecord whose resolvesAt is more than
  // ORPHAN_LOCK_GRACE_MS in the past. resolveLock now cleans matching keys
  // per-side so the leak path (originKey overwritten by a later EXPAND,
  // targetKey orphaned forever) shouldn't happen — but if any future code
  // path inserts to locksByTile without going through validation, this
  // sweep keeps the planner from getting permanently gated.
  tickOrphanedLockSweep(nowMs: number = this.now()): number {
    const cutoff = nowMs - ORPHAN_LOCK_GRACE_MS;
    const droppedCommandIds = new Set<string>();
    for (const [tileKey, lock] of this.locksByTile) {
      if (lock.resolvesAt < cutoff) {
        this.locksByTile.delete(tileKey);
        droppedCommandIds.add(lock.commandId);
      }
    }
    return droppedCommandIds.size;
  }

  tickShardRain(nowMs: number = this.now()): void {
    this.expireShardFallSites(nowMs);
    this.maybeBroadcastShardRainWarning(nowMs);
    this.maybeSpawnScheduledShardRain(nowMs);
  }

  tickTerritoryAutomation(nowMs: number = this.now()): void {
    const _ttaStart = Date.now();
    const autoClaimedKeys = new Set<string>();

    // --- Inner claim-loop accumulators ---
    let _claimSummaryForPlayerMs = 0;
    let _claimAnchorScanMs = 0;
    let _claimReplaceTileStateMs = 0;
    let _claimEmitMs = 0;
    let _playersProcessed = 0;
    let _anchorsIterated = 0;
    let _claimCandidatesEvaluated = 0;
    let _tilesActuallyClaimed = 0;

    for (const playerId of this.players.keys()) {
      if (playerId.startsWith("barbarian-")) continue;
      const _t0 = Date.now();
      const summary = this.summaryForPlayer(playerId);
      const actor = this.players.get(playerId);
      if (!actor) continue;
      this.applyEconomyAccrual(actor, nowMs);
      _claimSummaryForPlayerMs += Date.now() - _t0;
      _playersProcessed++;

      const claimDeltas: Array<ReturnType<SimulationRuntime["tileDeltaFromState"]>> = [];
      let claimCommandId: string | undefined;

      // Use the activeFortAnchorsByOwner index (forts + towns) instead of
      // iterating all territoryTileKeys. O(anchors) vs O(territory) — typically
      // 1–5 entries per player instead of 250k.
      const fortAnchorMap = this.activeFortAnchorsByOwner.get(playerId);
      for (const anchorKey of (fortAnchorMap ? fortAnchorMap.keys() : [])) {
        _anchorsIterated++;
        const _tAnchor = Date.now();
        const anchor = this.tiles.get(anchorKey);
        if (!anchor) {
          _claimAnchorScanMs += Date.now() - _tAnchor;
          continue;
        }
        // Re-derive the effective radius from the tile — the index stores
        // the static max radius but forts may be time-gated (disabledUntil).
        const fortRadius = fortAutoFrontierRadiusForTile(anchor, playerId, nowMs);
        const radius = fortRadius > 0
          ? fortRadius
          : isSettledTownAnchor(anchor, playerId)
            ? TOWN_AUTO_FRONTIER_RADIUS
            : 0;
        if (radius <= 0) {
          _claimAnchorScanMs += Date.now() - _tAnchor;
          continue;
        }
        for (const targetKey of this.playerCandidateIndex.claimCandidates(anchorKey, radius)) {
          _claimCandidatesEvaluated++;
          if (actor.points < FRONTIER_CLAIM_COST) break;
          if (targetKey === anchorKey || autoClaimedKeys.has(targetKey) || this.locksByTile.has(targetKey)) continue;
          const target = this.tiles.get(targetKey);
          if (!isAutoClaimTarget(target)) continue;
          autoClaimedKeys.add(targetKey);
          actor.points -= FRONTIER_CLAIM_COST;
          claimCommandId ??= this.nextTerritoryAutomationCommandId("frontier", playerId, "batch", nowMs);
          const claimedTile: DomainTileState = {
            ...target,
            ownerId: playerId,
            ownershipState: "FRONTIER"
          };
          const _tReplace = Date.now();
          this.replaceTileState(targetKey, claimedTile, claimCommandId);
          const _replaceDuration = Date.now() - _tReplace;
          _claimReplaceTileStateMs += _replaceDuration;
          _claimAnchorScanMs -= _replaceDuration; // replaceTileState already charged separately
          this.extendFortPatrolGrace(targetKey, nowMs + FORT_PATROL_GRACE_MS);
          claimDeltas.push(this.tileDeltaFromState(claimedTile));
          _tilesActuallyClaimed++;
        }
        _claimAnchorScanMs += Date.now() - _tAnchor;
      }

      if (claimCommandId && claimDeltas.length > 0) {
        const _tEmit = Date.now();
        this.emitEvent({
          eventType: "TILE_DELTA_BATCH",
          commandId: claimCommandId,
          playerId,
          goldCost: FRONTIER_CLAIM_COST * claimDeltas.length,
          tileDeltas: claimDeltas
        });
        this.emitPlayerStateUpdate({ commandId: claimCommandId, playerId });
        _claimEmitMs += Date.now() - _tEmit;
      }
    }

    const _ttaAfterClaim = Date.now();
    this.updateFrontierDecay(nowMs);
    const _ttaAfterDecay = Date.now();

    // --- Settle queue block ---
    let _settleQueueNotifyMs = 0;
    let _settleQueueNotifications = 0;

    for (const playerId of this.players.keys()) {
      if (!playerId.startsWith("barbarian-") && this.autoSettlementQueueForPlayer(playerId).length > 0) {
        const _tSettle = Date.now();
        this.emitPlayerStateUpdate({
          commandId: this.nextTerritoryAutomationCommandId("settle-queue", playerId, "batch", nowMs),
          playerId
        });
        _settleQueueNotifyMs += Date.now() - _tSettle;
        _settleQueueNotifications++;
      }
    }

    // --- Siege/sweep block inner accumulators ---
    let _siegeAttackLoopMs = 0;
    let _siegeHandleFrontierCommandMs = 0;
    let _siegeOutpostSweepMs = 0;
    let _siegeLightSweepMs = 0;
    let _siegeAttacksIssued = 0;
    let _siegeOutpostSweepsTicked = 0;
    let _lightOutpostSweepsTicked = 0;

    for (const playerId of this.players.keys()) {
      if (playerId.startsWith("barbarian-")) continue;
      const actor = this.players.get(playerId);
      if (!actor) continue;
      this.applyManpowerRegen(actor, nowMs);
      let availableSiegeManpower = actor.manpower;
      let availableSiegeGold = actor.points;
      if (availableSiegeManpower < ATTACK_MANPOWER_MIN || availableSiegeGold < FRONTIER_CLAIM_COST) continue;
      const summary = this.summaryForPlayer(playerId);

      // --- siege auto-attack loop ---
      // Use the fort-anchor index (forts + wooden-forts + towns) rather than
      // all territory tiles.  Towns return fortRadius=0 from
      // fortAutoFrontierRadiusForTile and are skipped cheaply; what matters is
      // we skip the O(all-territory) scan entirely — O(fort-anchors) is
      // typically 1–5 entries per player.
      const _tAttackLoop = Date.now();
      const fortAnchors = this.activeFortAnchorsByOwner.get(playerId);
      for (const tileKey of (fortAnchors ? fortAnchors.keys() : [])) {
        const fortTile = this.tiles.get(tileKey);
        const fortRadius = fortTile ? fortAutoFrontierRadiusForTile(fortTile, playerId, nowMs) : 0;
        if (!fortTile || fortRadius <= 0) continue;
        if (availableSiegeManpower < ATTACK_MANPOWER_MIN || availableSiegeGold < FRONTIER_CLAIM_COST) break;
        if (this.locksByTile.has(tileKey)) continue;
        const target = this.playerCandidateIndex.sortedFortAttackCandidates(tileKey, FORT_AUTO_FRONTIER_RADIUS)
          .find((candidate) => {
            const targetKey = simulationTileKey(candidate.x, candidate.y);
            return (
              !this.locksByTile.has(targetKey) &&
              !actor.allies.has(candidate.ownerId ?? "") &&
              !this.tileHasActiveFortPatrolGrace(targetKey, nowMs)
            );
          });
        if (!target) continue;
        const commandId = this.nextTerritoryAutomationCommandId("fort", playerId, simulationTileKey(target.x, target.y), nowMs);
        const _tHandleCmd = Date.now();
        this.handleFrontierCommand(
          {
            commandId,
            sessionId: `system-runtime:territory-automation:${playerId}`,
            playerId,
            clientSeq: 0,
            issuedAt: nowMs,
            type: "ATTACK",
            payloadJson: JSON.stringify({ fromX: fortTile.x, fromY: fortTile.y, toX: target.x, toY: target.y })
          },
          "ATTACK"
        );
        _siegeHandleFrontierCommandMs += Date.now() - _tHandleCmd;
        availableSiegeManpower -= ATTACK_MANPOWER_COST;
        availableSiegeGold -= FRONTIER_CLAIM_COST;
        _siegeAttacksIssued++;
      }
      _siegeAttackLoopMs += Date.now() - _tAttackLoop;

      // --- Sweep tick: siege outposts (SIEGE_OUTPOST / SIEGE_TOWER / DREAD_TOWER) ---
      // Iterates only tiles in activeSiegeOutpostsByOwner index — O(active outposts)
      // instead of O(territory).
      const _tOutpostSweep = Date.now();
      for (const tileKey of (this.activeSiegeOutpostsByOwner.get(playerId) ?? [])) {
        const outpostTile = this.tiles.get(tileKey);
        if (
          !outpostTile ||
          outpostTile.siegeOutpost?.ownerId !== playerId ||
          outpostTile.siegeOutpost.status !== "active"
        ) {
          continue;
        }
        const outpostData = outpostTile.siegeOutpost;
        const variant = outpostData.variant ?? "SIEGE_OUTPOST";
        const sweepRadius = SWEEP_RADIUS_BY_VARIANT[variant] ?? 5;
        this.tickSweepStructure(
          {
            tileKey,
            tile: outpostTile,
            sweepBudget: outpostData.sweepBudget,
            sweepActive: outpostData.sweepActive,
            sweepBudgetUpdatedAt: outpostData.sweepBudgetUpdatedAt,
            sweepRadius,
            commandIdPrefix: "sweep",
            applyUpdate: (fields) => ({ ...outpostTile, siegeOutpost: { ...outpostData, ...fields } })
          },
          playerId,
          actor,
          nowMs
        );
        _siegeOutpostSweepsTicked++;
      }
      _siegeOutpostSweepMs += Date.now() - _tOutpostSweep;

      // --- Sweep tick: LIGHT_OUTPOST ---
      // Iterates only tiles in activeLightOutpostsByOwner index — O(active light outposts)
      // instead of O(territory).
      const _tLightSweep = Date.now();
      for (const tileKey of (this.activeLightOutpostsByOwner.get(playerId) ?? [])) {
        const outpostTile = this.tiles.get(tileKey);
        if (
          !outpostTile ||
          outpostTile.economicStructure?.ownerId !== playerId ||
          outpostTile.economicStructure.type !== "LIGHT_OUTPOST" ||
          outpostTile.economicStructure.status !== "active"
        ) {
          continue;
        }
        const econData = outpostTile.economicStructure;
        this.tickSweepStructure(
          {
            tileKey,
            tile: outpostTile,
            sweepBudget: econData.sweepBudget,
            sweepActive: econData.sweepActive,
            sweepBudgetUpdatedAt: econData.sweepBudgetUpdatedAt,
            sweepRadius: SWEEP_RADIUS_BY_VARIANT["LIGHT_OUTPOST"],
            commandIdPrefix: "lo-sweep",
            applyUpdate: (fields) => ({ ...outpostTile, economicStructure: { ...econData, ...fields } })
          },
          playerId,
          actor,
          nowMs
        );
        _lightOutpostSweepsTicked++;
      }
      _siegeLightSweepMs += Date.now() - _tLightSweep;
    }

    const _ttaEnd = Date.now();
    const totalMs = _ttaEnd - _ttaStart;
    if (totalMs >= 100) {
      this.runtimeLogInfo(
        {
          totalMs,
          claimLoopMs: _ttaAfterClaim - _ttaStart,
          updateFrontierDecayMs: _ttaAfterDecay - _ttaAfterClaim,
          settleAndSiegeMs: _ttaEnd - _ttaAfterDecay,
          claim: {
            summaryForPlayerMs: _claimSummaryForPlayerMs,
            anchorScanMs: _claimAnchorScanMs,
            replaceTileStateMs: _claimReplaceTileStateMs,
            emitMs: _claimEmitMs,
            playersProcessed: _playersProcessed,
            anchorsIterated: _anchorsIterated,
            claimCandidatesEvaluated: _claimCandidatesEvaluated,
            tilesActuallyClaimed: _tilesActuallyClaimed
          },
          settle: {
            queueNotifyMs: _settleQueueNotifyMs,
            settleQueueNotifications: _settleQueueNotifications
          },
          siege: {
            attackLoopMs: _siegeAttackLoopMs,
            outpostSweepMs: _siegeOutpostSweepMs,
            lightSweepMs: _siegeLightSweepMs,
            handleFrontierCommandMs: _siegeHandleFrontierCommandMs,
            attacksIssued: _siegeAttacksIssued,
            outpostSweepsTicked: _siegeOutpostSweepsTicked,
            lightSweepsTicked: _lightOutpostSweepsTicked
          }
        },
        "[tick_territory_automation] phase breakdown"
      );
    }
  }

  /**
   * Shared sweep-tick logic for both siege outposts and light outposts.
   * Handles budget regen, pause (no budget), deactivate (no targets), and fire.
   * The caller projects the tile's sweep fields and provides an `applyUpdate`
   * function that returns a new `DomainTileState` with updated sweep fields.
   */
  private tickSweepStructure(
    structure: {
      tileKey: string;
      tile: DomainTileState;
      sweepBudget: number | undefined;
      sweepActive: boolean | undefined;
      sweepBudgetUpdatedAt: number | undefined;
      sweepRadius: number;
      commandIdPrefix: string;
      applyUpdate: (fields: { sweepBudget: number; sweepBudgetUpdatedAt: number; sweepActive?: boolean }) => DomainTileState;
    },
    playerId: string,
    actor: RuntimePlayer,
    nowMs: number
  ): void {
    const { tileKey, tile, sweepRadius, commandIdPrefix, applyUpdate } = structure;

    // Regen sweep budget at the same rate as global MP regen.
    const elapsedMins = (nowMs - (structure.sweepBudgetUpdatedAt ?? nowMs)) / 60_000;
    const regenPerMin = this.playerManpowerRegenPerMinute(actor);
    const rawBudget = (structure.sweepBudget ?? 0) + Math.max(0, elapsedMins * regenPerMin);
    const newBudget = Math.min(SWEEP_BUDGET_CAP, rawBudget);

    if (!structure.sweepActive) {
      // Budget still regens even when sweep is off.
      if (Math.abs(newBudget - (structure.sweepBudget ?? 0)) > 0.001) {
        const regenedTile = applyUpdate({ sweepBudget: newBudget, sweepBudgetUpdatedAt: nowMs });
        this.replaceTileState(tileKey, regenedTile);
        const regenCommandId = this.nextTerritoryAutomationCommandId(`${commandIdPrefix}-regen`, playerId, tileKey, nowMs);
        this.emitEvent({
          eventType: "TILE_DELTA_BATCH",
          commandId: regenCommandId,
          playerId,
          tileDeltas: [this.tileDeltaFromState(regenedTile)]
        });
      }
      return;
    }

    // Use index when available; fall back to sweepAttackCandidates only if anchor not registered.
    // The fallback is an intentional safety net: a sweep outpost that was activated
    // before its anchor registration had a chance to run will still function correctly.
    // Frequent misses here would indicate a registration gap and should be investigated.
    const candidates = this.playerCandidateIndex.hasAnchor(tileKey)
      ? this.playerCandidateIndex.sortedAttackCandidates(tileKey, sweepRadius)
      : sweepAttackCandidates(tile, playerId, sweepRadius, (x, y) => this.tiles.get(simulationTileKey(x, y)));
    const noTargets = candidates.length === 0;
    const nobudget = newBudget < SWEEP_ATTACK_COST;

    if (noTargets) {
      // Deactivate — player must re-toggle.
      const deactivatedTile = applyUpdate({ sweepBudget: newBudget, sweepBudgetUpdatedAt: nowMs, sweepActive: false });
      this.replaceTileState(tileKey, deactivatedTile);
      const deactivateCommandId = this.nextTerritoryAutomationCommandId(`${commandIdPrefix}-deact`, playerId, tileKey, nowMs);
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: deactivateCommandId,
        playerId,
        tileDeltas: [this.tileDeltaFromState(deactivatedTile)]
      });
      return;
    }

    if (nobudget) {
      // Pause — sweepActive stays true; just update regen.
      if (Math.abs(newBudget - (structure.sweepBudget ?? 0)) > 0.001) {
        const pausedTile = applyUpdate({ sweepBudget: newBudget, sweepBudgetUpdatedAt: nowMs });
        this.replaceTileState(tileKey, pausedTile);
        const pauseCommandId = this.nextTerritoryAutomationCommandId(`${commandIdPrefix}-pause`, playerId, tileKey, nowMs);
        this.emitEvent({
          eventType: "TILE_DELTA_BATCH",
          commandId: pauseCommandId,
          playerId,
          tileDeltas: [this.tileDeltaFromState(pausedTile)]
        });
      }
      return;
    }

    // We have targets and budget — fire.
    const sweepTarget = candidates[0]!;
    const afterAttackBudget = newBudget - SWEEP_ATTACK_COST;
    const attackedTile = applyUpdate({ sweepBudget: afterAttackBudget, sweepBudgetUpdatedAt: nowMs });
    this.replaceTileState(tileKey, attackedTile);

    // The fire command uses just the prefix without a suffix for the attack itself
    // (e.g. "sweep" and "lo-sweep", not "sweep-attack").
    const attackPrefix = commandIdPrefix === "sweep" ? "sweep" : commandIdPrefix;
    const sweepCommandId = this.nextTerritoryAutomationCommandId(attackPrefix, playerId, simulationTileKey(sweepTarget.x, sweepTarget.y), nowMs);
    // Enqueue via the existing attack path — encirclement, global MP, and gold
    // are handled there. Sweep budget is deducted above only; global resources
    // are NOT double-deducted here.
    this.handleFrontierCommand(
      {
        commandId: sweepCommandId,
        sessionId: `system-runtime:territory-automation:${playerId}`,
        playerId,
        clientSeq: 0,
        issuedAt: nowMs,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: tile.x, fromY: tile.y, toX: sweepTarget.x, toY: sweepTarget.y })
      },
      "ATTACK"
    );

    const budgetDeltaCommandId = this.nextTerritoryAutomationCommandId(`${commandIdPrefix}-budget`, playerId, tileKey, nowMs);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: budgetDeltaCommandId,
      playerId,
      tileDeltas: [this.tileDeltaFromState(attackedTile)]
    });
  }

  emitShardRainHelloFor(playerId: string, nowMs: number = this.now()): void {
    const player = this.players.get(playerId);
    if (!player) return;
    if (player.id === SHARD_RAIN_SYSTEM_PLAYER_ID) return;
    if (player.id.startsWith("barbarian-")) return;
    if (player.isAi) return;
    const notice = this.computeShardRainNotice(nowMs);
    if (!notice) return;
    const dedupKey = notice.phase === "started" ? (notice.expiresAt as number) : (notice.startsAt as number);
    if (this.lastShardRainHelloByPlayer.get(playerId) === dedupKey) return;
    this.lastShardRainHelloByPlayer.set(playerId, dedupKey);
    this.emitEvent({
      eventType: "PLAYER_MESSAGE",
      commandId: this.nextShardRainCommandId("hello"),
      playerId,
      messageType: "SHARD_RAIN_EVENT",
      payloadJson: JSON.stringify(notice)
    });
  }

  private computeShardRainNotice(nowMs: number): Record<string, unknown> | undefined {
    if (
      this.currentShardRainSiteCount > 0 &&
      typeof this.currentShardRainExpiresAt === "number" &&
      this.currentShardRainExpiresAt > nowMs
    ) {
      return {
        type: "SHARD_RAIN_EVENT",
        phase: "started",
        startsAt: this.currentShardRainExpiresAt - SHARD_RAIN_TTL_MS,
        expiresAt: this.currentShardRainExpiresAt,
        siteCount: this.currentShardRainSiteCount
      };
    }
    const nextStart = nextShardRainStartAt(nowMs);
    if (nextStart - nowMs <= SHARD_RAIN_WARNING_LEAD_MS) {
      return { type: "SHARD_RAIN_EVENT", phase: "upcoming", startsAt: nextStart };
    }
    return undefined;
  }

  private canHostShardFallSiteAt(tile: DomainTileState | undefined, tileKey?: string): boolean {
    if (!tile) return false;
    if (tile.terrain !== "LAND") return false;
    if (tile.dockId) return false;
    if (tile.resource) return false;
    if (tile.town) return false;
    if (tile.shardSite) return false;
    if (tileKey && this.recentShardRainTileKeys.has(tileKey)) return false;
    return true;
  }

  private nextShardRainCommandId(label: string): string {
    this.shardRainTickCounter += 1;
    return `${SHARD_RAIN_COMMAND_ID_PREFIX}:${label}:${this.shardRainTickCounter}:${this.now()}`;
  }

  private broadcastShardRainNotice(payload: Record<string, unknown>): void {
    const commandId = this.nextShardRainCommandId("notice");
    const payloadJson = JSON.stringify(payload);
    for (const player of this.players.values()) {
      if (player.id === SHARD_RAIN_SYSTEM_PLAYER_ID) continue;
      if (player.id.startsWith("barbarian-")) continue;
      if (player.isAi) continue;
      this.emitEvent({
        eventType: "PLAYER_MESSAGE",
        commandId,
        playerId: player.id,
        messageType: "SHARD_RAIN_EVENT",
        payloadJson
      });
    }
  }

  private maybeBroadcastShardRainWarning(nowMs: number): void {
    const current = new Date(nowMs);
    if (current.getMinutes() !== 0) return;
    const nextStart = nextShardRainStartAt(nowMs);
    const remaining = nextStart - nowMs;
    if (remaining > SHARD_RAIN_WARNING_LEAD_MS || remaining <= SHARD_RAIN_WARNING_LEAD_MS - 60_000) return;
    const slot = new Date(nextStart);
    const slotKey = shardRainSlotKey(slot);
    if (this.lastShardRainWarningSlotKey === slotKey) return;
    this.lastShardRainWarningSlotKey = slotKey;
    this.broadcastShardRainNotice({ type: "SHARD_RAIN_EVENT", phase: "upcoming", startsAt: nextStart });
  }

  private maybeSpawnScheduledShardRain(nowMs: number): void {
    const current = new Date(nowMs);
    if (current.getMinutes() !== 0) return;
    if (!SHARD_RAIN_SCHEDULE_HOURS.includes(current.getHours() as (typeof SHARD_RAIN_SCHEDULE_HOURS)[number])) return;
    const slotKey = shardRainSlotKey(current);
    if (this.lastShardRainSpawnSlotKey === slotKey) return;
    this.lastShardRainSpawnSlotKey = slotKey;
    this.spawnShardRain(nowMs);
  }

  private spawnShardRain(nowMs: number): void {
    this.recentShardRainTileKeys.clear();
    const count = SHARD_RAIN_SITE_MIN + Math.floor(Math.random() * (SHARD_RAIN_SITE_MAX - SHARD_RAIN_SITE_MIN + 1));
    const expiresAt = nowMs + SHARD_RAIN_TTL_MS;
    const startsAt = nowMs;
    const placed: { tileKey: string; tile: DomainTileState }[] = [];
    let attempts = 0;
    while (placed.length < count && attempts < count * 300) {
      attempts += 1;
      const x = Math.floor(Math.random() * WORLD_WIDTH);
      const y = Math.floor(Math.random() * WORLD_HEIGHT);
      const tileKey = simulationTileKey(x, y);
      const tile = this.tiles.get(tileKey);
      if (!this.canHostShardFallSiteAt(tile, tileKey)) continue;
      const amount = Math.random() > 0.8 ? 2 : 1;
      const updated: DomainTileState = { ...(tile as DomainTileState), shardSite: { kind: "FALL", amount, expiresAt } };
      this.replaceTileState(tileKey, updated);
      this.recentShardRainTileKeys.add(tileKey);
      placed.push({ tileKey, tile: updated });
    }
    if (placed.length === 0) return;
    this.currentShardRainExpiresAt =
      typeof this.currentShardRainExpiresAt === "number"
        ? Math.max(this.currentShardRainExpiresAt, expiresAt)
        : expiresAt;
    this.currentShardRainSiteCount += placed.length;
    const commandId = this.nextShardRainCommandId("spawn");
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId,
      playerId: SHARD_RAIN_SYSTEM_PLAYER_ID,
      tileDeltas: placed.map((entry) => this.tileDeltaFromState(entry.tile))
    });
    this.broadcastShardRainNotice({
      type: "SHARD_RAIN_EVENT",
      phase: "started",
      startsAt,
      expiresAt,
      siteCount: placed.length,
      sites: placed.map((entry) => ({ x: entry.tile.x, y: entry.tile.y }))
    });
  }

  private expireShardFallSites(nowMs: number): void {
    const expired: { tileKey: string; tile: DomainTileState }[] = [];
    for (const [tileKey, tile] of this.tiles) {
      const site = tile.shardSite;
      if (!site || site.kind !== "FALL") continue;
      if (typeof site.expiresAt !== "number" || site.expiresAt > nowMs) continue;
      const updated: DomainTileState = { ...tile, shardSite: undefined };
      this.replaceTileState(tileKey, updated);
      expired.push({ tileKey, tile: updated });
    }
    if (expired.length === 0) return;
    this.currentShardRainSiteCount = Math.max(0, this.currentShardRainSiteCount - expired.length);
    if (this.currentShardRainSiteCount === 0) {
      this.currentShardRainExpiresAt = undefined;
      this.lastShardRainHelloByPlayer.clear();
    }
    const commandId = this.nextShardRainCommandId("expire");
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId,
      playerId: SHARD_RAIN_SYSTEM_PLAYER_ID,
      tileDeltas: expired.map((entry) => ({ ...this.tileDeltaFromState(entry.tile), shardSiteJson: "" }))
    });
  }

  preparePlayerRespawnNotice(
    playerId: string,
    reasonCode: PlayerRespawnReasonCode,
    triggerEvent: string,
    options?: { wasOnline?: boolean }
  ): void {
    const player = this.players.get(playerId);
    const territoryTiles = this.summaryForPlayer(playerId).territoryTileKeys.size;
    const isAi = player?.isAi === true;
    if (isAi) return;
    this.pendingRespawnNoticeByPlayerId.set(playerId, {
      at: this.now(),
      reasonCode,
      triggerEvent,
      previousTerritoryTiles: territoryTiles,
      previousTerritoryStrength: 0,
      previousExposure: 0,
      wasEliminated: false,
      respawnPending: territoryTiles === 0,
      ...(typeof options?.wasOnline === "boolean" ? { wasOnline: options.wasOnline } : {})
    });
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
    const pending = this.pendingRespawnNoticeByPlayerId.get(playerId);
    if (!pending) return;
    const player = this.players.get(playerId);
    const playerName = player?.name ?? playerId;
    const notice = buildRewritePlayerRespawnNotice({
      playerId,
      playerName,
      context: pending,
      spawnTileKey: spawnTileKey as `${number},${number}`
    });
    this.lastRespawnNoticeByPlayerId.set(playerId, notice);
    this.pendingRespawnNoticeByPlayerId.delete(playerId);
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
    let player = this.players.get(playerId);
    if (!player) {
      player = createHumanRuntimePlayer(playerId);
      this.players.set(playerId, player);
      // Only initialize an empty summary if one does not already exist. The
      // recovery constructor lazily populates per-player summaries from owned
      // tile state via applyTileToPlayerSummaries, so a returning player who
      // owns recovered tiles but is missing from initialState.players already
      // has a populated summary here. Overwriting it would silently wipe
      // their territory and force a respawn at the next zero-territory check.
      if (!this.playerSummaries.has(playerId)) {
        this.playerSummaries.set(playerId, createEmptyPlayerRuntimeSummary());
        this.plannerPlayerTileCollectionVersionByPlayer.set(playerId, 0);
      }
    }

    const territoryTiles = this.summaryForPlayer(playerId).territoryTileKeys.size;
    const hasPendingNotice = this.pendingRespawnNoticeByPlayerId.has(playerId);

    if (territoryTiles > 0) return false;
    if (!player.isAi && !hasPendingNotice) {
      this.preparePlayerRespawnNotice(playerId, "auth_recovery", "ensure_player_has_spawn_territory");
    }

    const blockedTileKeys = new Set<string>([...this.pendingSettlementsByTile.keys(), ...this.locksByTile.keys()]);
    this.rememberedAutomationVictoryPathByPlayer.delete(playerId);
    const spawn = chooseLegacySpawnPlacement({
      playerId,
      tiles: this.tiles.values(),
      blockedTileKeys,
      ...(rallyAnchor ? { rallyAnchor } : {})
    });
    if (!spawn) return false;
    const tileKey = simulationTileKey(spawn.x, spawn.y);
    const tile = this.tiles.get(tileKey);
    if (!tile || tile.terrain !== "LAND" || tile.ownerId) return false;
    const spawnedTile: DomainTileState = {
      ...tile,
      ownerId: playerId,
      ownershipState: "SETTLED",
      town: tile.town ?? {
        name: `Settlement ${tile.x},${tile.y}`,
        type: "FARMING",
        populationTier: "SETTLEMENT",
        population: 800,
        maxPopulation: POPULATION_MAX
      }
    };
    const commandId = `bootstrap-spawn:${playerId}:${this.now()}`;
    this.setTileYieldCollectedAt(commandId, playerId, tileKey, this.now());
    this.replaceTileState(tileKey, spawnedTile);
    this.finalizeRespawnNotice(playerId, tileKey);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId,
      playerId,
      tileDeltas: [this.tileDeltaFromState(spawnedTile)]
    });
    this.emitPlayerStateUpdate({ commandId, playerId });
    return true;
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

  private rebuildTerminalReplayIndex(): void {
    this.terminalReplayCommandIds.clear();
    this.terminalOnlyReplayCommandIds.clear();
    for (const [commandId, events] of this.recordedEventsByCommandId.entries()) {
      if (events.some(isTerminalCommandEvent)) {
        this.terminalReplayCommandIds.set(commandId, true);
      }
    }
  }

  private markTerminalReplayCommand(commandId: string): void {
    this.terminalReplayCommandIds.delete(commandId);
    this.terminalReplayCommandIds.set(commandId, true);
  }

  private markTerminalOnlyReplayCommand(commandId: string): void {
    this.recordedEventsByCommandId.delete(commandId);
    this.terminalOnlyReplayCommandIds.add(commandId);
  }

  private dropReplayHistoryForCommand(commandId: string): void {
    this.recordedEventsByCommandId.delete(commandId);
    this.terminalReplayCommandIds.delete(commandId);
    this.terminalOnlyReplayCommandIds.delete(commandId);
    for (const [playerSeqKey, mappedCommandId] of this.commandIdsByPlayerSeq.entries()) {
      if (mappedCommandId === commandId) this.commandIdsByPlayerSeq.delete(playerSeqKey);
    }
  }

  private pruneReplayCaches(): void {
    while (this.terminalReplayCommandIds.size > this.maxTerminalCommandReplayHistory) {
      const oldestTerminalCommandId = this.terminalReplayCommandIds.keys().next().value;
      if (!oldestTerminalCommandId) break;
      this.dropReplayHistoryForCommand(oldestTerminalCommandId);
    }

    while (this.commandIdsByPlayerSeq.size > this.maxPlayerSeqReplayEntries) {
      const oldestPlayerSeqKey = this.commandIdsByPlayerSeq.keys().next().value;
      if (!oldestPlayerSeqKey) break;
      const oldestCommandId = this.commandIdsByPlayerSeq.get(oldestPlayerSeqKey);
      this.commandIdsByPlayerSeq.delete(oldestPlayerSeqKey);
      if (oldestCommandId) this.terminalOnlyReplayCommandIds.delete(oldestCommandId);
    }
  }

  private summaryForPlayer(playerId: string): PlayerRuntimeSummary {
    const existing = this.playerSummaries.get(playerId);
    if (existing) return existing;
    const summary = createEmptyPlayerRuntimeSummary();
    this.playerSummaries.set(playerId, summary);
    this.plannerPlayerTileCollectionVersionByPlayer.set(playerId, 0);
    return summary;
  }

  private markPlannerPlayerTileCollectionDirty(playerId: string): void {
    const nextVersion = (this.plannerPlayerTileCollectionVersionByPlayer.get(playerId) ?? 0) + 1;
    this.plannerPlayerTileCollectionVersionByPlayer.set(playerId, nextVersion);
    this.plannerPlayerTileKeyCacheByPlayer.delete(playerId);
  }

  private plannerPlayerTileKeys(playerId: string, summary: PlayerRuntimeSummary): {
    tileCollectionVersion: number;
    territoryTileKeys: string[];
    frontierTileKeys: string[];
    hotFrontierTileKeys: string[];
    strategicFrontierTileKeys: string[];
    buildCandidateTileKeys: string[];
    pendingSettlementTileKeys: string[];
  } {
    const tileCollectionVersion = this.plannerPlayerTileCollectionVersionByPlayer.get(playerId) ?? 0;
    const cached = this.plannerPlayerTileKeyCacheByPlayer.get(playerId);
    if (cached && cached.tileCollectionVersion === tileCollectionVersion) return cached;
    const next = {
      tileCollectionVersion,
      territoryTileKeys: [...summary.territoryTileKeys],
      frontierTileKeys: [...summary.frontierTileKeys],
      hotFrontierTileKeys: [...summary.hotFrontierTileKeys],
      strategicFrontierTileKeys: [...summary.strategicFrontierTileKeys],
      buildCandidateTileKeys: [...summary.buildCandidateTileKeys],
      pendingSettlementTileKeys: [...summary.pendingSettlementsByTile.keys()]
    };
    this.plannerPlayerTileKeyCacheByPlayer.set(playerId, next);
    return next;
  }

  private playerManpowerCap(player: RuntimePlayer): number {
    if (player.id === "barbarian-1") return Number.MAX_SAFE_INTEGER;
    const summary = this.summaryForPlayer(player.id);
    let cap = 0;
    for (const tier of summary.ownedTownTierByTile.values()) {
      cap += TOWN_MANPOWER_BY_TIER[tier]?.cap ?? 0;
    }
    return Math.max(MANPOWER_BASE_CAP, cap);
  }

  private playerManpowerRegenPerMinute(player: RuntimePlayer): number {
    const summary = this.summaryForPlayer(player.id);
    let regen = 0;
    let index = 0;
    for (const tier of summary.ownedTownTierByTile.values()) {
      const base = TOWN_MANPOWER_BY_TIER[tier]?.regenPerMinute ?? 0;
      regen += base * manpowerRegenWeightForSettlementIndex(index);
      index += 1;
    }
    return Math.max(MANPOWER_BASE_REGEN_PER_MINUTE, regen);
  }

  private townTierLabel(tier: keyof typeof TOWN_MANPOWER_BY_TIER, count: number): string {
    const labels: Record<keyof typeof TOWN_MANPOWER_BY_TIER, { singular: string; plural: string }> = {
      SETTLEMENT: { singular: "Settlement", plural: "Settlements" },
      TOWN: { singular: "Town", plural: "Towns" },
      CITY: { singular: "City", plural: "Cities" },
      GREAT_CITY: { singular: "Great City", plural: "Great Cities" },
      METROPOLIS: { singular: "Metropolis", plural: "Metropolises" }
    };
    const label = labels[tier];
    if (count === 1) return label.singular;
    return `${count} ${label.plural}`;
  }

  private manpowerRegenWeightNote(weight: number): string | undefined {
    if (weight === 1) return undefined;
    return `${Math.round(weight * 100)}% scaling`;
  }

  private playerManpowerBreakdown(player: RuntimePlayer): ManpowerBreakdown {
    const summary = this.summaryForPlayer(player.id);
    const capByTier = new Map<keyof typeof TOWN_MANPOWER_BY_TIER, { count: number; amount: number }>();
    const regenByTierAndWeight = new Map<string, { tier: keyof typeof TOWN_MANPOWER_BY_TIER; count: number; amount: number; weight: number }>();
    let index = 0;
    for (const tier of summary.ownedTownTierByTile.values()) {
      const capBase = TOWN_MANPOWER_BY_TIER[tier]?.cap ?? 0;
      if (capBase !== 0) {
        const current = capByTier.get(tier) ?? { count: 0, amount: 0 };
        capByTier.set(tier, { count: current.count + 1, amount: current.amount + capBase });
      }
      const regenBase = TOWN_MANPOWER_BY_TIER[tier]?.regenPerMinute ?? 0;
      if (regenBase !== 0) {
        const weight = manpowerRegenWeightForSettlementIndex(index);
        const key = `${tier}:${weight}`;
        const current = regenByTierAndWeight.get(key) ?? { tier, count: 0, amount: 0, weight };
        regenByTierAndWeight.set(key, { ...current, count: current.count + 1, amount: current.amount + regenBase * weight });
      }
      index += 1;
    }
    const capLines = [...capByTier.entries()].map(([tier, line]) => ({
      label: this.townTierLabel(tier, line.count),
      amount: line.amount
    }));
    const regenLines = [...regenByTierAndWeight.values()].map((line) => {
      const note = this.manpowerRegenWeightNote(line.weight);
      return {
        label: this.townTierLabel(line.tier, line.count),
        amount: line.amount,
        ...(note ? { note } : {})
      };
    });
    const townCap = capLines.reduce((total, line) => total + line.amount, 0);
    const townRegen = regenLines.reduce((total, line) => total + line.amount, 0);
    return {
      cap: townCap >= MANPOWER_BASE_CAP && capLines.length > 0 ? capLines : [{ label: "Base minimum", amount: MANPOWER_BASE_CAP }],
      regen:
        townRegen >= MANPOWER_BASE_REGEN_PER_MINUTE && regenLines.length > 0
          ? regenLines
          : [{ label: "Base minimum", amount: MANPOWER_BASE_REGEN_PER_MINUTE }]
    };
  }

  private effectiveManpowerAt(player: RuntimePlayer, nowMs = this.now()): number {
    const cap = this.playerManpowerCap(player);
    if (!Number.isFinite(player.manpower)) return cap;
    if (!Number.isFinite(player.manpowerUpdatedAt)) return Math.min(cap, Math.max(0, player.manpower));
    const updatedAt = player.manpowerUpdatedAt ?? nowMs;
    const elapsedMinutes = Math.max(0, (nowMs - updatedAt) / 60_000);
    const regenPerMinute = this.playerManpowerRegenPerMinute(player);
    const nextManpower = elapsedMinutes > 0 ? player.manpower + elapsedMinutes * regenPerMinute : player.manpower;
    return Math.max(0, Math.min(cap, nextManpower));
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
    const snapshot = buildPlayerUpdateEconomySnapshot(player, summary, this.tiles, {
      dockLinksByDockTileKey: this.dockLinksByDockTileKey
    });
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
      for (const key of ["gold", "food", "iron", "crystal", "supply", "oil"] as const) {
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
      SUPPLY: Math.max(0, upkeep.supply) * elapsedMinutes,
      OIL: Math.max(0, upkeep.oil) * elapsedMinutes
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
      SHARD: player.strategicResources?.SHARD ?? 0,
      OIL: player.strategicResources?.OIL ?? 0
    };
    let mutated = false;
    if (need.FOOD > 0) {
      stock.FOOD = Math.max(0, stock.FOOD - need.FOOD);
      mutated = true;
    }
    if (need.IRON > 0) {
      stock.IRON = Math.max(0, stock.IRON - need.IRON);
      mutated = true;
    }
    if (need.CRYSTAL > 0) {
      stock.CRYSTAL = Math.max(0, stock.CRYSTAL - need.CRYSTAL);
      mutated = true;
    }
    if (need.SUPPLY > 0) {
      stock.SUPPLY = Math.max(0, stock.SUPPLY - need.SUPPLY);
      mutated = true;
    }
    if (need.OIL > 0) {
      stock.OIL = Math.max(0, stock.OIL - need.OIL);
      mutated = true;
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
    const yieldBearingSet = this.yieldBearingTilesByOwner.get(player.id);
    const tileKeys = yieldBearingSet ? [...yieldBearingSet].sort() : [];
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
      const enrichedTile = tile.town
        ? (() => {
            const networkTown = enrichTownWithConnectedNetwork(tile, economyContext!.townNetwork);
            const refreshedTown = networkTown
              ? refreshTownEconomyFields(networkTown, tile, player, this.tiles, economyContext!.fedTownKeys, economyContext!.firstThreeTownKeys)
              : networkTown;
            return { ...tile, town: refreshedTown };
          })()
        : tile;
      const lastCollectedAt = this.tileYieldCollectedAt(tileKey, player.id);
      const yieldView = buildTileYieldView(enrichedTile, lastCollectedAt, nowMs, {
        player,
        fedTownKeys: economyContext.fedTownKeys,
        firstThreeTownKeys: economyContext.firstThreeTownKeys,
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
    this.recordedEventsByCommandId.delete(syntheticCommandId);
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
    this.applyTileToPlayerSummaries(tileKey, tile);
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
    // Part 1: maintain frontierTilesByOwner index.
    const prevIsFrontier = previous?.ownershipState === "FRONTIER" && previous?.ownerId && !previous.ownerId.startsWith("barbarian-");
    const nextIsFrontier = tile.ownershipState === "FRONTIER" && tile.ownerId && !tile.ownerId.startsWith("barbarian-");
    if (prevIsFrontier && previous!.ownerId !== tile.ownerId) {
      this.removeFrontierTileFromOwnerIndex(tileKey, previous!.ownerId!);
    }
    if (nextIsFrontier) {
      this.addFrontierTileToOwnerIndex(tileKey, tile.ownerId!);
    } else if (prevIsFrontier && previous!.ownerId === tile.ownerId) {
      // Was frontier for this owner, no longer frontier
      this.removeFrontierTileFromOwnerIndex(tileKey, tile.ownerId!);
    }
    // Part 2: maintain activeFortAnchorsByOwner index.
    this.refreshFortAnchorIndexForTile(tileKey, previous, tile);
    // Yield-bearing index: maintain yieldBearingTilesByOwner.
    this.refreshYieldBearingIndexForTile(tileKey, previous, tile);
    // Sweep outpost indexes: maintain activeSiegeOutpostsByOwner and activeLightOutpostsByOwner.
    this.refreshSiegeOutpostIndexForTile(tileKey, previous, tile);
    this.refreshLightOutpostIndexForTile(tileKey, previous, tile);
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
    this.playerYieldCollectionEpochByPlayer.set(playerId, collectedAt);
    this.emitEvent({
      eventType: "PLAYER_YIELD_COLLECTION_EPOCH_UPDATED",
      commandId,
      playerId,
      collectedAt
    });
  }

  private tileYieldCollectedAt(tileKey: string, ownerId?: string): number | undefined {
    const tileAnchor = this.tileYieldCollectedAtByTile.get(tileKey);
    const playerAnchor = ownerId ? this.playerYieldCollectionEpochByPlayer.get(ownerId) : undefined;
    if (typeof tileAnchor === "number" && typeof playerAnchor === "number") return Math.max(tileAnchor, playerAnchor);
    return tileAnchor ?? playerAnchor;
  }

  private rebuildPlannerCandidateIndexesForPlayer(playerId: string): void {
    const summary = this.summaryForPlayer(playerId);
    summary.hotFrontierTileKeys.clear();
    summary.strategicFrontierTileKeys.clear();
    summary.buildCandidateTileKeys.clear();
    for (const tileKey of summary.territoryTileKeys) {
      const tile = this.tiles.get(tileKey);
      if (!tile || tile.ownerId !== playerId) continue;
      if (isHotFrontierTile(playerId, tile, this.tiles)) summary.hotFrontierTileKeys.add(tileKey);
      if (isStrategicFrontierTile(playerId, tile, this.tiles)) summary.strategicFrontierTileKeys.add(tileKey);
      if (isBuildCandidateTile(playerId, tile, this.tiles)) summary.buildCandidateTileKeys.add(tileKey);
    }
    this.markPlannerPlayerTileCollectionDirty(playerId);
  }

  private refreshPlannerCandidateIndexesAroundTileChange(
    tileKey: string,
    previous?: DomainTileState,
    next?: DomainTileState
  ): void {
    const affectedKeys = candidateIndexKeysAroundTileKey(tileKey);
    const affectedPlayerIds = playerIdsAffectedByTileChange(tileKey, this.tiles, previous, next);
    for (const playerId of affectedPlayerIds) {
      const summary = this.summaryForPlayer(playerId);
      for (const candidateKey of affectedKeys) {
        summary.hotFrontierTileKeys.delete(candidateKey);
        summary.strategicFrontierTileKeys.delete(candidateKey);
        summary.buildCandidateTileKeys.delete(candidateKey);
        const candidateTile = this.tiles.get(candidateKey);
        if (!candidateTile || candidateTile.ownerId !== playerId) continue;
        if (isHotFrontierTile(playerId, candidateTile, this.tiles)) summary.hotFrontierTileKeys.add(candidateKey);
        if (isStrategicFrontierTile(playerId, candidateTile, this.tiles)) summary.strategicFrontierTileKeys.add(candidateKey);
        if (isBuildCandidateTile(playerId, candidateTile, this.tiles)) summary.buildCandidateTileKeys.add(candidateKey);
      }
      this.markPlannerPlayerTileCollectionDirty(playerId);
    }
    this.playerCandidateIndex.refreshAroundTile(tileKey, (k) => this.tiles.get(k));
  }

  /**
   * Keep PlayerCandidateIndex anchor registrations consistent with tile state.
   * Called from replaceTileState after the tile is already written to this.tiles.
   * Registers/unregisters anchors when a tile gains or loses a fort, town,
   * active WOODEN_FORT, or active siege outpost (for sweep).
   *
   * Each anchor is stored at the MAXIMUM possible radius for its kind, not the
   * current effective radius.  This prevents stale maxRadius when time-dependent
   * conditions (e.g. FORT_PATROL_GRACE_MS) change the effective radius without
   * triggering a tile mutation.  Re-registration fires only when the anchor KIND
   * or OWNER changes, not on radius drift.
   */
  private refreshPlayerCandidateIndexAnchorForTile(
    tileKey: string,
    previous: DomainTileState | undefined,
    next: DomainTileState
  ): void {
    const prevOwnerId = previous?.ownerId;
    const nextOwnerId = next.ownerId;

    // Detect anchor kind (ignoring time-dependent radius factors like patrol grace).
    // Returns the max-possible radius for the kind, or 0 if not an anchor.
    const anchorKindMaxRadius = (tile: DomainTileState, ownerId: string): number => {
      // Fort kind: active fort (any variant, including grace state) or active WOODEN_FORT.
      if (
        tile.ownerId === ownerId &&
        tile.economicStructure?.ownerId === ownerId &&
        tile.economicStructure.type === "WOODEN_FORT" &&
        tile.economicStructure.status === "active"
      ) return MAX_FORT_AUTO_FRONTIER_RADIUS;
      if (
        tile.ownerId === ownerId &&
        tile.fort?.ownerId === ownerId &&
        tile.fort.status === "active"
      ) return MAX_FORT_AUTO_FRONTIER_RADIUS;
      // Town kind.
      if (isSettledTownAnchor(tile, ownerId)) return TOWN_AUTO_FRONTIER_RADIUS;
      // Active siege outpost with sweep enabled.
      if (
        tile.siegeOutpost?.ownerId === ownerId &&
        tile.siegeOutpost.status === "active" &&
        tile.siegeOutpost.sweepActive
      ) return MAX_SWEEP_RADIUS;
      return 0;
    };

    const prevMaxRadius = previous && prevOwnerId ? anchorKindMaxRadius(previous, prevOwnerId) : 0;
    const nextMaxRadius = nextOwnerId ? anchorKindMaxRadius(next, nextOwnerId) : 0;

    if (prevMaxRadius <= 0 && nextMaxRadius <= 0) return;
    if (prevMaxRadius > 0 && nextMaxRadius <= 0) {
      this.playerCandidateIndex.unregisterAnchor(tileKey);
      return;
    }
    if (prevMaxRadius <= 0 && nextMaxRadius > 0) {
      this.playerCandidateIndex.registerAnchor(tileKey, nextOwnerId!, nextMaxRadius, (k) => this.tiles.get(k));
      return;
    }
    // Both are anchors — re-register only if owner or anchor KIND (max radius) changed.
    // Radius drift from time-dependent conditions does NOT trigger re-registration.
    if (prevOwnerId !== nextOwnerId || prevMaxRadius !== nextMaxRadius) {
      this.playerCandidateIndex.unregisterAnchor(tileKey);
      this.playerCandidateIndex.registerAnchor(tileKey, nextOwnerId!, nextMaxRadius, (k) => this.tiles.get(k));
    }
  }

  // ---- Part 1 helpers: frontierTilesByOwner index ----

  private addFrontierTileToOwnerIndex(tileKey: string, ownerId: string): void {
    let set = this.frontierTilesByOwner.get(ownerId);
    if (!set) { set = new Set<string>(); this.frontierTilesByOwner.set(ownerId, set); }
    set.add(tileKey);
  }

  private removeFrontierTileFromOwnerIndex(tileKey: string, ownerId: string): void {
    const set = this.frontierTilesByOwner.get(ownerId);
    if (set) set.delete(tileKey);
  }

  // ---- Part 2 helpers: activeFortAnchorsByOwner index ----

  /**
   * Returns the max radius this tile contributes as a fort-support anchor for its owner,
   * considering only FORT + WOODEN_FORT + town kinds (NOT siege outposts).
   * Returns 0 if the tile is not a fort-support anchor.
   */
  private fortSupportAnchorMaxRadius(tile: DomainTileState, ownerId: string): number {
    if (
      tile.ownerId === ownerId &&
      tile.economicStructure?.ownerId === ownerId &&
      tile.economicStructure.type === "WOODEN_FORT" &&
      tile.economicStructure.status === "active"
    ) return MAX_FORT_AUTO_FRONTIER_RADIUS;
    if (
      tile.ownerId === ownerId &&
      tile.fort?.ownerId === ownerId &&
      tile.fort.status === "active"
    ) return MAX_FORT_AUTO_FRONTIER_RADIUS;
    if (isSettledTownAnchor(tile, ownerId)) return TOWN_AUTO_FRONTIER_RADIUS;
    return 0;
  }

  private registerFortSupportAnchor(tileKey: string, ownerId: string, maxRadius: number): void {
    let map = this.activeFortAnchorsByOwner.get(ownerId);
    if (!map) { map = new Map<string, number>(); this.activeFortAnchorsByOwner.set(ownerId, map); }
    map.set(tileKey, maxRadius);
  }

  private unregisterFortSupportAnchor(tileKey: string, ownerId: string): void {
    const map = this.activeFortAnchorsByOwner.get(ownerId);
    if (map) map.delete(tileKey);
  }

  /**
   * Called from replaceTileState to keep activeFortAnchorsByOwner in sync.
   * Mirrors the logic in refreshPlayerCandidateIndexAnchorForTile but only for
   * fort-support kinds (forts + towns, NOT siege outposts).
   */
  private refreshFortAnchorIndexForTile(
    tileKey: string,
    previous: DomainTileState | undefined,
    next: DomainTileState
  ): void {
    const prevOwnerId = previous?.ownerId;
    const nextOwnerId = next.ownerId;
    const prevMaxRadius = previous && prevOwnerId ? this.fortSupportAnchorMaxRadius(previous, prevOwnerId) : 0;
    const nextMaxRadius = nextOwnerId ? this.fortSupportAnchorMaxRadius(next, nextOwnerId) : 0;

    if (prevMaxRadius <= 0 && nextMaxRadius <= 0) return;
    if (prevMaxRadius > 0 && prevOwnerId) {
      this.unregisterFortSupportAnchor(tileKey, prevOwnerId);
    }
    if (nextMaxRadius > 0 && nextOwnerId) {
      this.registerFortSupportAnchor(tileKey, nextOwnerId, nextMaxRadius);
    }
  }

  // ---- Yield-bearing tile index helpers ----

  /**
   * Returns true iff the tile would produce a non-zero yield buffer when passed
   * to buildTileYieldView — i.e., it is SETTLED LAND owned by someone AND has at
   * least one income source (town, dock, strategic resource, or active converter).
   *
   * This predicate mirrors the "would produce a non-undefined yield field" logic
   * in buildTileYieldView (tile-yield-view.ts:82). The outer gate (SETTLED + LAND
   * + ownerId) is the same as line 92 of that function; the income conditions
   * below correspond to: townGoldPerMinute > 0, dockGoldPerMinute > 0, and
   * strategicPerDay having at least one entry (lines 96–124).
   *
   * Critically: a tile with only `town: undefined` / `dockId: undefined` /
   * `resource: undefined` / no active converter earns zero yield and is NOT
   * yield-bearing. Plain settled land tiles — the vast majority at scale — are
   * intentionally excluded.
   */
  private isYieldBearing(tile: DomainTileState): boolean {
    if (!tile.ownerId || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") return false;
    // Town income (any town, including SETTLEMENT tier — those earn base gold)
    if (tile.town) return true;
    // Dock income (any dock earns at least DOCK_INCOME_PER_MIN * PASSIVE_INCOME_MULT)
    if (tile.dockId) return true;
    // Strategic resource terrain — only the resources that strategicDailyFromResource
    // maps to a non-empty result (all cases except `default: return {}`)
    if (tile.resource !== undefined && tile.resource !== null) {
      switch (tile.resource) {
        case "FARM":
        case "FISH":
        case "IRON":
        case "WOOD":
        case "FUR":
        case "GEMS":
        case "OIL":
          return true;
        default:
          break;
      }
    }
    // Active converter economicStructure — only the types that converterDailyOutput maps
    // to a non-empty result (FUR_SYNTHESIZER, ADVANCED_FUR_SYNTHESIZER, IRONWORKS,
    // ADVANCED_IRONWORKS, CRYSTAL_SYNTHESIZER, ADVANCED_CRYSTAL_SYNTHESIZER)
    if (tile.economicStructure?.status === "active") {
      switch (tile.economicStructure.type) {
        case "FUR_SYNTHESIZER":
        case "ADVANCED_FUR_SYNTHESIZER":
        case "IRONWORKS":
        case "ADVANCED_IRONWORKS":
        case "CRYSTAL_SYNTHESIZER":
        case "ADVANCED_CRYSTAL_SYNTHESIZER":
          return true;
        default:
          break;
      }
    }
    return false;
  }

  private addYieldBearingTileToOwnerIndex(tileKey: string, ownerId: string): void {
    let set = this.yieldBearingTilesByOwner.get(ownerId);
    if (!set) { set = new Set<string>(); this.yieldBearingTilesByOwner.set(ownerId, set); }
    set.add(tileKey);
  }

  private removeYieldBearingTileFromOwnerIndex(tileKey: string, ownerId: string): void {
    const set = this.yieldBearingTilesByOwner.get(ownerId);
    if (set) set.delete(tileKey);
  }

  private refreshYieldBearingIndexForTile(
    tileKey: string,
    previous: DomainTileState | undefined,
    next: DomainTileState
  ): void {
    const prevIsYieldBearing = previous ? this.isYieldBearing(previous) : false;
    const prevOwnerId = previous?.ownerId;
    const nextIsYieldBearing = this.isYieldBearing(next);
    const nextOwnerId = next.ownerId;

    // Remove from previous owner's index if it was yield-bearing
    if (prevIsYieldBearing && prevOwnerId) {
      this.removeYieldBearingTileFromOwnerIndex(tileKey, prevOwnerId);
    }
    // Add to new owner's index if it is yield-bearing
    if (nextIsYieldBearing && nextOwnerId) {
      this.addYieldBearingTileToOwnerIndex(tileKey, nextOwnerId);
    }
  }

  // ---- Siege outpost index helpers ----

  private isSiegeOutpostActive(tile: DomainTileState, ownerId: string): boolean {
    return tile.siegeOutpost?.ownerId === ownerId && tile.siegeOutpost.status === "active";
  }

  private refreshSiegeOutpostIndexForTile(
    tileKey: string,
    previous: DomainTileState | undefined,
    next: DomainTileState
  ): void {
    const prevOwnerId = previous?.ownerId;
    const prevActive = previous && prevOwnerId ? this.isSiegeOutpostActive(previous, prevOwnerId) : false;
    const nextOwnerId = next.ownerId;
    const nextActive = nextOwnerId ? this.isSiegeOutpostActive(next, nextOwnerId) : false;

    if (!prevActive && !nextActive) return;
    // When owner changes, remove from old owner and add to new.
    // When active state changes for same owner, add or remove.
    // When active state is unchanged for same owner, do nothing — avoids
    // mutating the set while it is being iterated in tickTerritoryAutomation,
    // which would cause JavaScript Set iteration to revisit the key after re-add.
    if (prevActive && nextActive && prevOwnerId === nextOwnerId) return;
    if (prevActive && prevOwnerId) {
      const set = this.activeSiegeOutpostsByOwner.get(prevOwnerId);
      if (set) set.delete(tileKey);
    }
    if (nextActive && nextOwnerId) {
      let set = this.activeSiegeOutpostsByOwner.get(nextOwnerId);
      if (!set) { set = new Set<string>(); this.activeSiegeOutpostsByOwner.set(nextOwnerId, set); }
      set.add(tileKey);
    }
  }

  // ---- Light outpost index helpers ----

  private isLightOutpostActive(tile: DomainTileState, ownerId: string): boolean {
    return (
      tile.economicStructure?.ownerId === ownerId &&
      tile.economicStructure.type === "LIGHT_OUTPOST" &&
      tile.economicStructure.status === "active"
    );
  }

  private refreshLightOutpostIndexForTile(
    tileKey: string,
    previous: DomainTileState | undefined,
    next: DomainTileState
  ): void {
    const prevOwnerId = previous?.ownerId;
    const prevActive = previous && prevOwnerId ? this.isLightOutpostActive(previous, prevOwnerId) : false;
    const nextOwnerId = next.ownerId;
    const nextActive = nextOwnerId ? this.isLightOutpostActive(next, nextOwnerId) : false;

    if (!prevActive && !nextActive) return;
    // Same-owner, same-active-state: no-op to avoid mutating the set while
    // it is being iterated in tickTerritoryAutomation (re-add after delete
    // would cause JavaScript Set iteration to revisit the key).
    if (prevActive && nextActive && prevOwnerId === nextOwnerId) return;
    if (prevActive && prevOwnerId) {
      const set = this.activeLightOutpostsByOwner.get(prevOwnerId);
      if (set) set.delete(tileKey);
    }
    if (nextActive && nextOwnerId) {
      let set = this.activeLightOutpostsByOwner.get(nextOwnerId);
      if (!set) { set = new Set<string>(); this.activeLightOutpostsByOwner.set(nextOwnerId, set); }
      set.add(tileKey);
    }
  }

  /**
   * DEV_ASSERT_YIELD_INDEX=1 cross-check: rebuild the expected yield-bearing set
   * from territoryTileKeys and compare against yieldBearingTilesByOwner. Logs
   * a loud error on any divergence but does NOT throw (prod-safe if accidentally
   * enabled). Off by default.
   */
  private assertYieldIndexCorrect(playerId: string, _now: number, _yieldContext: RuntimeTileYieldEconomyContext): void {
    const summary = this.summaryForPlayer(playerId);
    const expected = new Set<string>();
    for (const tileKey of summary.territoryTileKeys) {
      const tile = this.tiles.get(tileKey);
      if (tile && this.isYieldBearing(tile)) expected.add(tileKey);
    }
    const actual = this.yieldBearingTilesByOwner.get(playerId) ?? new Set<string>();
    let ok = true;
    for (const key of expected) {
      if (!actual.has(key)) { ok = false; console.error(`[YIELD-INDEX] player=${playerId} MISSING from index: ${key}`); }
    }
    for (const key of actual) {
      if (!expected.has(key)) { ok = false; console.error(`[YIELD-INDEX] player=${playerId} SPURIOUS in index: ${key}`); }
    }
    if (ok) console.debug(`[YIELD-INDEX] player=${playerId} OK expected=${expected.size} actual=${actual.size}`);
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
    const ownedTiles = [...this.summaryForPlayer(playerId).territoryTileKeys]
      .map((tileKey) => this.tiles.get(tileKey))
      .filter((tile): tile is DomainTileState => Boolean(tile));
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
    options?: {
      skipPreplan?: boolean;
      collectVisibleOnCooldown?: boolean;
    }
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
      this.frontierDecayChangedByOwner.delete(playerId);
      this.frontierDecayExpiredByOwner.delete(playerId);
    }
    const ownedTiles = [...summary.territoryTileKeys]
      .map((tileKey) => this.tiles.get(tileKey))
      .filter((tile): tile is DomainTileState => tile !== undefined);
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
        sessionPrefix,
        ...(options?.collectVisibleOnCooldown ? { collectVisibleOnCooldown: true } : {})
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
      frontierTiles: [...summary.frontierTileKeys]
        .map((tileKey) => this.tiles.get(tileKey))
        .filter((tile): tile is DomainTileState => tile !== undefined),
      hotFrontierTiles: [...summary.hotFrontierTileKeys]
        .map((tileKey) => this.tiles.get(tileKey))
        .filter((tile): tile is DomainTileState => tile !== undefined),
      strategicFrontierTiles: [...summary.strategicFrontierTileKeys]
        .map((tileKey) => this.tiles.get(tileKey))
        .filter((tile): tile is DomainTileState => tile !== undefined),
      buildCandidateTiles: [...summary.buildCandidateTileKeys]
        .map((tileKey) => this.tiles.get(tileKey))
        .filter((tile): tile is DomainTileState => tile !== undefined),
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
      ...(options?.collectVisibleOnCooldown ? { collectVisibleOnCooldown: true } : {}),
      ...(spatialFocus ? { spatialFocusFront: spatialFocus.primaryFront } : {}),
      clientSeq,
      issuedAt,
      sessionPrefix
    });
    if (preplanDiagnostic?.preplanReason) {
      plan.diagnostic = {
        ...plan.diagnostic,
        preplanReason: preplanDiagnostic.preplanReason,
        ...(typeof preplanDiagnostic.preplanHasCollectibleVisibleYieldSource === "boolean"
          ? { preplanHasCollectibleVisibleYieldSource: preplanDiagnostic.preplanHasCollectibleVisibleYieldSource }
          : {}),
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
    this.pruneReplayCaches();
    if (this.terminalOnlyReplayCommandIds.has(command.commandId)) return;
    const existingEvents = this.recordedEventsByCommandId.get(command.commandId);
    if (existingEvents) {
      for (const event of existingEvents) this.events.emit("event", event);
      return;
    }

    if (command.type !== "SYNC_ALLIANCE") {
      const playerSeqKey = `${command.playerId}:${command.clientSeq}`;
      const existingCommandId = this.commandIdsByPlayerSeq.get(playerSeqKey);
      if (existingCommandId) {
        if (this.terminalOnlyReplayCommandIds.has(existingCommandId)) return;
        const replayEvents = this.recordedEventsByCommandId.get(existingCommandId);
        if (replayEvents) {
          for (const event of replayEvents) this.events.emit("event", event);
          return;
        }
        this.commandIdsByPlayerSeq.delete(playerSeqKey);
      }

      this.commandIdsByPlayerSeq.set(playerSeqKey, command.commandId);
    }
    this.persistence.recordCommand(command);
    this.queueCommandForProcessing(command);
  }

  snapshot(): { commands: CommandEnvelope[]; events: SimulationEvent[] } {
    return this.persistence.snapshot();
  }

  exportSnapshotSections(): SimulationSnapshotSections {
    return {
      initialState: {
        tiles: [...this.tiles.values()]
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
          .sort((left, right) => (left.x - right.x) || (left.y - right.y)),
        activeLocks: [...new Map([...this.locksByTile.entries()].map(([, lock]) => [lock.commandId, lock])).values()]
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
          .sort((left, right) => left.commandId.localeCompare(right.commandId))
        ,
        players: [...this.players.values()]
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
            incomePerMinute: this.incomePerMinuteForPlayer(player.id),
            ownedTownTileKeys: [...this.summaryForPlayer(player.id).ownedTownTierByTile.keys()]
          }))
          .sort((left, right) => left.id.localeCompare(right.id)),
        pendingSettlements: [...this.pendingSettlementsByTile.values()]
          .map((settlement) => ({ ...settlement }))
          .sort((left, right) => left.tileKey.localeCompare(right.tileKey)),
        tileYieldCollectedAtByTile: [...this.tileYieldCollectedAtByTile.entries()]
          .map(([tileKey, collectedAt]) => ({ tileKey, collectedAt }))
          .sort((left, right) => left.tileKey.localeCompare(right.tileKey)),
        playerYieldCollectionEpochByPlayer: [...this.playerYieldCollectionEpochByPlayer.entries()]
          .map(([playerId, collectedAt]) => ({ playerId, collectedAt }))
          .sort((left, right) => left.playerId.localeCompare(right.playerId)),
        collectVisibleCooldownByPlayer: [...this.collectVisibleCooldownByPlayer.entries()]
          .map(([playerId, cooldownUntil]) => ({ playerId, cooldownUntil }))
          .sort((left, right) => left.playerId.localeCompare(right.playerId))
        ,
        ...(this.docks.length
          ? {
              docks: this.docks.map((dock) => ({
                dockId: dock.dockId,
                tileKey: dock.tileKey,
                pairedDockId: dock.pairedDockId,
                ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {})
              }))
            }
          : {})
      },
      commandEvents: buildSimulationSnapshotCommandEvents(this.recordedEventsByCommandId)
    };
  }

  exportPlannerWorldView(playerIds: string[]): PlannerWorldView {
    const players = this.exportPlannerPlayerViews(playerIds);
    const tiles = buildPlannerTileSlice({
      playerIds,
      tiles: this.tiles,
      docks: this.docks,
      summaryForPlayer: (playerId) => this.summaryForPlayer(playerId)
    });

    return { tiles, players, docks: this.docks.map((dock) => ({ ...dock, ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {}) })) };
  }

  exportPlannerPlayerViews(playerIds: string[]): PlannerPlayerView[] {
    const lockPlayerIds = this.plannerGatingLockPlayerIds();
    const players: PlannerPlayerView[] = [];
    for (const playerId of playerIds) {
      const player = this.players.get(playerId);
      if (!player) continue;
      // Use the manpower-only refresh — full applyManpowerRegen also runs
      // applyEconomyAccrual, which is O(territory tiles) per player and is
      // the dominant cost in sync_players_export under steady-state AI play.
      // Economy accrual catches up on the next real command tick.
      this.refreshManpowerOnly(player);
      const summary = this.summaryForPlayer(playerId);
      const tileKeys = this.plannerPlayerTileKeys(playerId, summary);
      players.push({
        id: player.id,
        points: player.points,
        manpower: player.manpower,
        techIds: [...player.techIds].sort(),
        domainIds: [...(player.domainIds ?? [])].sort(),
        strategicResources: { ...(player.strategicResources ?? {}) },
        settledTileCount: summary.settledTileCount,
        townCount: summary.townCount,
        incomePerMinute: this.estimatedIncomePerMinuteForPlayer(playerId),
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

  // Minimal per-player snapshot for the /debug/players HTTP route. Mirrors
  // exportState().players but skips the O(world-tile) tile projection so a
  // debug scrape never disturbs hot-path latency. Uses the manpower-only
  // refresh for the same reason exportPlannerPlayerViews does — economy
  // accrual catches up on the next real command tick.
  exportPlayerDebugSnapshot(): Array<{
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
  }> {
    // Build both sets in one pass — debug callers want to distinguish
    // "planner is gated" from "anything is locked" (e.g. fort auto-attack
    // firing). Without `hasAnyLock`, the only signal a fort is firing
    // would be the metrics buffer.
    const plannerBlockedIds = new Set<string>();
    const anyLockIds = new Set<string>();
    for (const lock of this.locksByTile.values()) {
      anyLockIds.add(lock.playerId);
      if (lock.source !== "automation") plannerBlockedIds.add(lock.playerId);
    }
    return [...this.players.values()]
      .map((player) => {
        this.refreshManpowerOnly(player);
        const summary = this.summaryForPlayer(player.id);
        return {
          id: player.id,
          ...(player.name ? { name: player.name } : {}),
          isAi: player.isAi === true,
          points: player.points,
          manpower: player.manpower,
          manpowerCap: this.playerManpowerCap(player),
          manpowerRegenPerMinute: this.playerManpowerRegenPerMinute(player),
          techIds: [...player.techIds].sort(),
          domainIds: [...(player.domainIds ?? [])].sort(),
          strategicResources: { ...(player.strategicResources ?? {}) },
          settledTileCount: summary.settledTileCount,
          townCount: summary.townCount,
          incomePerMinute: this.estimatedIncomePerMinuteForPlayer(player.id),
          strategicProductionPerMinute: cloneStrategicProduction(summary.strategicProductionPerMinute),
          activeDevelopmentProcessCount: summary.activeDevelopmentProcessCount,
          plannerBlocked: plannerBlockedIds.has(player.id),
          hasAnyLock: anyLockIds.has(player.id),
          allies: [...player.allies].sort()
        };
      })
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  exportTilesForKeys(tileKeys: Iterable<string>): PlannerTileView[] {
    const result: PlannerTileView[] = [];
    for (const tileKey of tileKeys) {
      const tile = this.tiles.get(tileKey);
      if (tile) result.push(toPlannerTileView(tile));
    }
    return result;
  }

  exportState(): {
    tiles: Array<{
      x: number;
      y: number;
      terrain: Terrain;
      resource?: string;
      dockId?: string;
      shardSiteJson?: string;
      ownerId?: string;
      ownershipState?: string;
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
  } {
    return {
      tiles: [...this.tiles.values()]
        .map((tile) => {
          const tileKey = simulationTileKey(tile.x, tile.y);
          const cached = this.tileDeltaStringifyCache.getOrComputeAll(tileKey, tile);
          return {
            x: tile.x,
            y: tile.y,
            terrain: tile.terrain,
            ...(tile.resource ? { resource: tile.resource } : {}),
            ...(tile.dockId ? { dockId: tile.dockId } : {}),
            ...(cached.shardSiteJson ? { shardSiteJson: cached.shardSiteJson } : {}),
            ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
            ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
            ...(typeof tile.frontierDecayAt === "number" ? { frontierDecayAt: tile.frontierDecayAt } : {}),
            ...(tile.frontierDecayKind ? { frontierDecayKind: tile.frontierDecayKind } : {}),
            ...(cached.townJson ? { townJson: cached.townJson } : {}),
            ...(tile.town?.type ? { townType: tile.town.type } : {}),
            ...(tile.town?.name ? { townName: tile.town.name } : {}),
            ...(tile.town?.populationTier ? { townPopulationTier: tile.town.populationTier } : {}),
            ...(cached.fortJson ? { fortJson: cached.fortJson } : {}),
            ...(cached.observatoryJson ? { observatoryJson: cached.observatoryJson } : {}),
            ...(cached.siegeOutpostJson ? { siegeOutpostJson: cached.siegeOutpostJson } : {}),
            ...(cached.economicStructureJson ? { economicStructureJson: cached.economicStructureJson } : {}),
            ...(cached.sabotageJson ? { sabotageJson: cached.sabotageJson } : {})
          };
        })
        .sort((left, right) => (left.x - right.x) || (left.y - right.y)),
      players: [...this.players.values()]
        .map((player) => {
          this.applyManpowerRegen(player);
          const summary = this.summaryForPlayer(player.id);
          return {
            id: player.id,
            ...(player.name ? { name: player.name } : {}),
            points: player.points,
            manpower: player.manpower,
            manpowerCap: this.playerManpowerCap(player),
            manpowerRegenPerMinute: this.playerManpowerRegenPerMinute(player),
            manpowerBreakdown: this.playerManpowerBreakdown(player),
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
            incomePerMinute: this.incomePerMinuteForPlayer(player.id),
            strategicProductionPerMinute: cloneStrategicProduction(summary.strategicProductionPerMinute),
            activeDevelopmentProcessCount: summary.activeDevelopmentProcessCount
          };
        })
        .sort((left, right) => left.id.localeCompare(right.id)),
      pendingSettlements: [...this.pendingSettlementsByTile.values()]
        .map((settlement) => ({ ...settlement }))
        .sort((left, right) => left.tileKey.localeCompare(right.tileKey)),
      activeLocks: [...new Map([...this.locksByTile.entries()].map(([, lock]) => [lock.commandId, lock])).values()]
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
      docks: this.docks.map((dock) => ({ ...dock, ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {}) })),
      tileYieldCollectedAtByTile: [...this.tileYieldCollectedAtByTile.entries()]
        .map(([tileKey, collectedAt]) => ({ tileKey, collectedAt }))
        .sort((left, right) => left.tileKey.localeCompare(right.tileKey)),
      playerYieldCollectionEpochByPlayer: [...this.playerYieldCollectionEpochByPlayer.entries()]
        .map(([playerId, collectedAt]) => ({ playerId, collectedAt }))
        .sort((left, right) => left.playerId.localeCompare(right.playerId)),
      terrainEpoch: this.terrainEpoch
    };
  }

  private classifyVisibilityForPlayer(playerId: string): {
    radiusSelfKeys: Set<string>;
    radiusAllyKeys: Map<string, Set<string>>;
    lockOriginKeys: Set<string>;
    dockRevealKeys: Set<string>;
    lockTargetOnlyKeys: Set<string>;
    fullVisionKeys: Set<string>;
    visibleKeys: Set<string>;
    allyAndSelfIds: Set<string>;
  } {
    const keyFor = (x: number, y: number): string => simulationTileKey(((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH, ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT);
    const parseKey = (tileKey: string): { x: number; y: number } | undefined => {
      const [rawX, rawY] = tileKey.split(",");
      const x = Number(rawX);
      const y = Number(rawY);
      if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
      return { x, y };
    };
    const radiusSelfKeys = new Set<string>();
    const radiusAllyKeys = new Map<string, Set<string>>();
    const lockOriginKeys = new Set<string>();
    const dockRevealKeys = new Set<string>();
    const fullVisionKeys = new Set<string>();
    const addVision = (
      territoryTileKeys: Iterable<string>,
      vision: number,
      visionRadiusBonus: number,
      sink: Set<string>
    ): void => {
      const radius = Math.max(1, Math.floor(VISION_RADIUS * vision) + visionRadiusBonus);
      for (const tileKey of territoryTileKeys) {
        const coords = parseKey(tileKey);
        if (!coords) continue;
        for (let dy = -radius; dy <= radius; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            const wrapped = keyFor(coords.x + dx, coords.y + dy);
            sink.add(wrapped);
            fullVisionKeys.add(wrapped);
          }
        }
      }
    };

    const primaryPlayer = this.players.get(playerId);
    if (primaryPlayer) {
      this.applyManpowerRegen(primaryPlayer);
      const primarySummary = this.summaryForPlayer(playerId);
      addVision(primarySummary.territoryTileKeys, primaryPlayer.mods?.vision ?? 1, visionRadiusBonusForPlayer(primaryPlayer), radiusSelfKeys);
      for (const allyId of primaryPlayer.allies) {
        const ally = this.players.get(allyId);
        if (!ally) continue;
        this.applyManpowerRegen(ally);
        const allySink = new Set<string>();
        addVision(this.summaryForPlayer(allyId).territoryTileKeys, ally.mods?.vision ?? 1, visionRadiusBonusForPlayer(ally), allySink);
        radiusAllyKeys.set(allyId, allySink);
      }
    } else {
      // Fallback for sessions whose Firebase UID has no live player row in
      // this.players (the fog admin auth lands here when the admin hasn't
      // joined as a normal player). Mirrors the fallback in
      // buildPlayerSubscriptionSnapshot so the fog-restore (live) subscribe
      // path returns the same visibility set as the bootstrap path did. Use
      // default vision=1 and visionRadiusBonus=0 since we have no live mods.
      const territoryTileKeys: string[] = [];
      for (const [tileKey, tile] of this.tiles) {
        if (tile.ownerId === playerId) territoryTileKeys.push(tileKey);
      }
      if (territoryTileKeys.length > 0) addVision(territoryTileKeys, 1, 0, radiusSelfKeys);
    }
    for (const lock of this.locksByTile.values()) {
      if (lock.playerId !== playerId) continue;
      lockOriginKeys.add(lock.originKey);
      fullVisionKeys.add(lock.originKey);
    }
    if (primaryPlayer) {
      const visibilityOwnerIds = new Set<string>([playerId, ...primaryPlayer.allies]);
      for (const revealKey of collectLinkedDockRevealKeysForOwners(
        visibilityOwnerIds,
        this.docks,
        (tileKey) => {
          const tile = this.tiles.get(tileKey);
          return tile?.ownershipState === "SETTLED" ? tile.ownerId : undefined;
        },
        this.dockLinksByDockTileKey,
        WORLD_WIDTH,
        WORLD_HEIGHT
      )) {
        dockRevealKeys.add(revealKey);
        fullVisionKeys.add(revealKey);
      }
    }

    // Lock targets reveal the tile under attack so the player can see where
    // their attack landed, but must not leak the opponent's settled state if
    // the viewer has no other vision of that tile. Track these separately so
    // the serializer can redact opponent-controlled fields.
    const lockTargetOnlyKeys = new Set<string>();
    for (const lock of this.locksByTile.values()) {
      if (lock.playerId !== playerId) continue;
      if (fullVisionKeys.has(lock.targetKey)) continue;
      lockTargetOnlyKeys.add(lock.targetKey);
    }

    const allyAndSelfIds = new Set<string>([playerId, ...(primaryPlayer?.allies ?? [])]);
    const visibleKeys = new Set<string>([...fullVisionKeys, ...lockTargetOnlyKeys]);

    return {
      radiusSelfKeys,
      radiusAllyKeys,
      lockOriginKeys,
      dockRevealKeys,
      lockTargetOnlyKeys,
      fullVisionKeys,
      visibleKeys,
      allyAndSelfIds
    };
  }

  // ─── Barbarian activation: union of non-barb fog ────────────────────────────
  // The system-job worker can't compute this itself (it only sees the
  // barbarian player), so the main process owns the cache and ships the keys
  // via `vision_union` messages. Signature is per-(player, tileCollectionVersion,
  // vision, visionRadiusBonus) — covers territory changes and vision-mod
  // unlocks (tech/domain) without per-event subscription wiring.

  private cachedBarbActivationUnion: Set<string> | null = null;
  private cachedBarbActivationSignature = "";

  getBarbActivationVisionSignature(): string {
    const parts: string[] = [];
    for (const player of this.players.values()) {
      if (player.id.startsWith("barbarian-")) continue;
      const tcv = this.plannerPlayerTileCollectionVersionByPlayer.get(player.id) ?? 0;
      const v = player.mods?.vision ?? 1;
      const vrb = visionRadiusBonusForPlayer(player);
      parts.push(`${player.id}:${tcv}:${v}:${vrb}`);
    }
    parts.sort();
    return parts.join("|");
  }

  exportBarbActivationVisibleUnion(): { keys: string[]; signature: string } {
    const signature = this.getBarbActivationVisionSignature();
    if (this.cachedBarbActivationUnion && this.cachedBarbActivationSignature === signature) {
      return { keys: [...this.cachedBarbActivationUnion], signature };
    }
    const union = new Set<string>();
    for (const player of this.players.values()) {
      if (player.id.startsWith("barbarian-")) continue;
      const summary = this.summaryForPlayer(player.id);
      const radius = Math.max(
        1,
        Math.floor(VISION_RADIUS * (player.mods?.vision ?? 1)) + visionRadiusBonusForPlayer(player)
      );
      for (const tileKey of summary.territoryTileKeys) {
        const [rawX, rawY] = tileKey.split(",");
        const x = Number(rawX);
        const y = Number(rawY);
        if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
        for (let dy = -radius; dy <= radius; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            const wx = ((x + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
            const wy = ((y + dy) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
            union.add(`${wx},${wy}`);
          }
        }
      }
    }
    this.cachedBarbActivationUnion = union;
    this.cachedBarbActivationSignature = signature;
    return { keys: [...union], signature };
  }

  private emitVisibilityAudit(
    playerId: string,
    tile: { x: number; y: number; ownerId?: string | undefined },
    tileKey: string,
    redacted: boolean,
    classification: ReturnType<SimulationRuntime["classifyVisibilityForPlayer"]>
  ): void {
    const onVisibilityAudit = this.onVisibilityAudit;
    if (!onVisibilityAudit) return;
    if (!tile.ownerId || classification.allyAndSelfIds.has(tile.ownerId)) return;
    const reasons: string[] = [];
    if (classification.radiusSelfKeys.has(tileKey)) reasons.push("radius:self");
    for (const [allyId, set] of classification.radiusAllyKeys) {
      if (set.has(tileKey)) reasons.push(`radius:ally:${allyId}`);
    }
    if (classification.lockOriginKeys.has(tileKey)) reasons.push("lock-origin");
    if (classification.dockRevealKeys.has(tileKey)) reasons.push("dock-reveal");
    if (classification.lockTargetOnlyKeys.has(tileKey)) reasons.push("lock-target");
    onVisibilityAudit({
      playerId,
      tileKey,
      x: tile.x,
      y: tile.y,
      ownerId: tile.ownerId,
      reasons,
      redacted
    });
  }

  exportVisibleStateForPlayer(playerId: string): ReturnType<SimulationRuntime["exportState"]> {
    const classification = this.classifyVisibilityForPlayer(playerId);
    const { lockTargetOnlyKeys, visibleKeys, allyAndSelfIds } = classification;

    return {
      tiles: [...visibleKeys]
        .map((tileKey) => this.tiles.get(tileKey))
        .filter((tile): tile is DomainTileState => Boolean(tile))
        .map((tile) => {
          const tileKey = simulationTileKey(tile.x, tile.y);
          const isLockTargetOnly = lockTargetOnlyKeys.has(tileKey);
          const ownedByOther = Boolean(tile.ownerId) && !allyAndSelfIds.has(tile.ownerId as string);
          if (isLockTargetOnly && ownedByOther) {
            this.emitVisibilityAudit(playerId, tile, tileKey, true, classification);
            return { x: tile.x, y: tile.y, terrain: tile.terrain };
          }
          if (ownedByOther) this.emitVisibilityAudit(playerId, tile, tileKey, false, classification);
          return {
            x: tile.x,
            y: tile.y,
            terrain: tile.terrain,
            ...(tile.resource ? { resource: tile.resource } : {}),
            ...(tile.dockId ? { dockId: tile.dockId } : {}),
            ...(tile.shardSite ? { shardSiteJson: JSON.stringify(tile.shardSite) } : {}),
            ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
            ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
            ...(typeof tile.frontierDecayAt === "number" ? { frontierDecayAt: tile.frontierDecayAt } : {}),
            ...(tile.frontierDecayKind ? { frontierDecayKind: tile.frontierDecayKind } : {}),
            ...(tile.town ? { townJson: JSON.stringify(tile.town) } : {}),
            ...(tile.town?.type ? { townType: tile.town.type } : {}),
            ...(tile.town?.name ? { townName: tile.town.name } : {}),
            ...(tile.town?.populationTier ? { townPopulationTier: tile.town.populationTier } : {}),
            ...(tile.fort ? { fortJson: JSON.stringify(tile.fort) } : {}),
            ...(tile.observatory ? { observatoryJson: JSON.stringify(tile.observatory) } : {}),
            ...(tile.siegeOutpost ? { siegeOutpostJson: JSON.stringify(tile.siegeOutpost) } : {}),
            ...(tile.economicStructure ? { economicStructureJson: JSON.stringify(tile.economicStructure) } : {}),
            ...(tile.sabotage ? { sabotageJson: JSON.stringify(tile.sabotage) } : {})
          };
        })
        .sort((left, right) => (left.x - right.x) || (left.y - right.y)),
      players: [...this.players.values()]
        .map((player) => {
          this.applyManpowerRegen(player);
          const summary = this.summaryForPlayer(player.id);
          return {
            id: player.id,
            ...(player.name ? { name: player.name } : {}),
            points: player.points,
            manpower: player.manpower,
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
            incomePerMinute: this.incomePerMinuteForPlayer(player.id),
            strategicProductionPerMinute: player.id === playerId
              ? this.cachedEconomySnapshot(player).strategicProductionPerMinute
              : cloneStrategicProduction(summary.strategicProductionPerMinute),
            activeDevelopmentProcessCount: summary.activeDevelopmentProcessCount
          };
        })
        .sort((left, right) => left.id.localeCompare(right.id)),
      pendingSettlements: [...this.pendingSettlementsByTile.values()]
        .map((settlement) => ({ ...settlement }))
        .sort((left, right) => left.tileKey.localeCompare(right.tileKey)),
      activeLocks: [...new Map([...this.locksByTile.entries()].map(([, lock]) => [lock.commandId, lock])).values()]
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
      docks: this.docks.map((dock) => ({ ...dock, ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {}) })),
      tileYieldCollectedAtByTile: [...this.tileYieldCollectedAtByTile.entries()]
        .map(([tileKey, collectedAt]) => ({ tileKey, collectedAt }))
        .sort((left, right) => left.tileKey.localeCompare(right.tileKey)),
      playerYieldCollectionEpochByPlayer: [...this.playerYieldCollectionEpochByPlayer.entries()]
        .map(([playerId, collectedAt]) => ({ playerId, collectedAt }))
        .sort((left, right) => left.playerId.localeCompare(right.playerId)),
      terrainEpoch: this.terrainEpoch
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
    const classification = this.classifyVisibilityForPlayer(playerId);
    await yieldToEventLoop();
    const { lockTargetOnlyKeys, visibleKeys, allyAndSelfIds } = classification;

    const TILE_CHUNK = 500;
    const tiles: ReturnType<SimulationRuntime["exportState"]>["tiles"] = [];
    let idx = 0;
    for (const tileKey of visibleKeys) {
      const tile = this.tiles.get(tileKey);
      if (tile) {
        const wrappedTileKey = simulationTileKey(tile.x, tile.y);
        const isLockTargetOnly = lockTargetOnlyKeys.has(wrappedTileKey);
        const ownedByOther = Boolean(tile.ownerId) && !allyAndSelfIds.has(tile.ownerId as string);
        if (isLockTargetOnly && ownedByOther) {
          this.emitVisibilityAudit(playerId, tile, wrappedTileKey, true, classification);
          tiles.push({ x: tile.x, y: tile.y, terrain: tile.terrain });
        } else {
          if (ownedByOther) this.emitVisibilityAudit(playerId, tile, wrappedTileKey, false, classification);
          tiles.push({
            x: tile.x,
            y: tile.y,
            terrain: tile.terrain,
            ...(tile.resource ? { resource: tile.resource } : {}),
            ...(tile.dockId ? { dockId: tile.dockId } : {}),
            ...(tile.shardSite ? { shardSiteJson: JSON.stringify(tile.shardSite) } : {}),
            ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
            ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
            ...(typeof tile.frontierDecayAt === "number" ? { frontierDecayAt: tile.frontierDecayAt } : {}),
            ...(tile.frontierDecayKind ? { frontierDecayKind: tile.frontierDecayKind } : {}),
            ...(tile.town ? { townJson: JSON.stringify(tile.town) } : {}),
            ...(tile.town?.type ? { townType: tile.town.type } : {}),
            ...(tile.town?.name ? { townName: tile.town.name } : {}),
            ...(tile.town?.populationTier ? { townPopulationTier: tile.town.populationTier } : {}),
            ...(tile.fort ? { fortJson: JSON.stringify(tile.fort) } : {}),
            ...(tile.observatory ? { observatoryJson: JSON.stringify(tile.observatory) } : {}),
            ...(tile.siegeOutpost ? { siegeOutpostJson: JSON.stringify(tile.siegeOutpost) } : {}),
            ...(tile.economicStructure ? { economicStructureJson: JSON.stringify(tile.economicStructure) } : {}),
            ...(tile.sabotage ? { sabotageJson: JSON.stringify(tile.sabotage) } : {})
          });
        }
      }
      idx += 1;
      if (idx % TILE_CHUNK === 0) await yieldToEventLoop();
    }
    tiles.sort((left, right) => (left.x - right.x) || (left.y - right.y));
    await yieldToEventLoop();

    const players = [...this.players.values()]
      .map((player) => {
        this.applyManpowerRegen(player);
        const summary = this.summaryForPlayer(player.id);
        return {
          id: player.id,
          ...(player.name ? { name: player.name } : {}),
          points: player.points,
          manpower: player.manpower,
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
          incomePerMinute: this.incomePerMinuteForPlayer(player.id),
          strategicProductionPerMinute: player.id === playerId
            ? this.cachedEconomySnapshot(player).strategicProductionPerMinute
            : cloneStrategicProduction(summary.strategicProductionPerMinute),
          activeDevelopmentProcessCount: summary.activeDevelopmentProcessCount
        };
      })
      .sort((left, right) => left.id.localeCompare(right.id));

    return {
      tiles,
      players,
      pendingSettlements: [...this.pendingSettlementsByTile.values()]
        .map((settlement) => ({ ...settlement }))
        .sort((left, right) => left.tileKey.localeCompare(right.tileKey)),
      activeLocks: [...new Map([...this.locksByTile.entries()].map(([, lock]) => [lock.commandId, lock])).values()]
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
      docks: this.docks.map((dock) => ({ ...dock, ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {}) })),
      tileYieldCollectedAtByTile: [...this.tileYieldCollectedAtByTile.entries()]
        .map(([tileKey, collectedAt]) => ({ tileKey, collectedAt }))
        .sort((left, right) => left.tileKey.localeCompare(right.tileKey)),
      playerYieldCollectionEpochByPlayer: [...this.playerYieldCollectionEpochByPlayer.entries()]
        .map(([playerId, collectedAt]) => ({ playerId, collectedAt }))
        .sort((left, right) => left.playerId.localeCompare(right.playerId)),
      terrainEpoch: this.terrainEpoch
    };
  }

  exportTilesInAreaForPlayer(
    playerId: string,
    centerX: number,
    centerY: number,
    radius: number,
    options?: { fullVisibility?: boolean }
  ): SimulationTileWireDelta[] {
    const wrapX = (value: number): number => ((value % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
    const wrapY = (value: number): number => ((value % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
    // Reuse the owner's economy context across all tiles in the request so the
    // per-tile refresh inside tileDeltaFromState doesn't rebuild the same
    // fed-town set / connected-town network 9× for a radius-1 fetch.
    const tileOwner = this.tiles.get(simulationTileKey(wrapX(centerX), wrapY(centerY)))?.ownerId;
    const ownerForContext = tileOwner ? this.players.get(tileOwner) : undefined;
    const tileYieldContext = ownerForContext ? this.tileYieldEconomyContextForPlayer(ownerForContext) : undefined;
    const collected: SimulationTileWireDelta[] = [];
    const seen = new Set<string>();
    const r = Math.max(0, Math.floor(radius));
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        const x = wrapX(centerX + dx);
        const y = wrapY(centerY + dy);
        const tileKey = simulationTileKey(x, y);
        if (seen.has(tileKey)) continue;
        seen.add(tileKey);
        const tile = this.tiles.get(tileKey);
        if (!tile) continue;
        const delta = this.tileDeltaFromState(tile, tile.ownerId && ownerForContext && tile.ownerId === ownerForContext.id ? tileYieldContext : undefined);
        collected.push(delta);
      }
    }
    if (options?.fullVisibility) return collected;
    return this.filterTileDeltasForPlayer(collected, playerId);
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
        ...(this.onVisibilityAudit ? { onVisibilityAudit: this.onVisibilityAudit } : {})
      },
      tileDeltas,
      playerId
    );
  }


  private settledTileCountForPlayer(playerId: string): number {
    return this.summaryForPlayer(playerId).settledTileCount;
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
    const context: RuntimeTileYieldEconomyContext = {
      player,
      townNetwork: buildConnectedTownNetworkForPlayer(player, this.tiles, settledTiles, { maxConnectedTownNames: 16 }),
      fedTownKeys: this.fedTownKeysForPlayer(player, settledTiles),
      firstThreeTownKeys: firstThreeTownKeysForPlayer(player.id, this.orderedTownTilesForPlayer(player.id))
    };
    this.tileYieldContextCacheByPlayer.set(player.id, context);
    return context;
  }

  private incomePerMinuteForPlayer(playerId: string): number {
    const player = this.players.get(playerId);
    if (!player) return 0;
    return buildPlayerUpdateEconomySnapshot(player, this.summaryForPlayer(playerId), this.tiles, {
      dockLinksByDockTileKey: this.dockLinksByDockTileKey
    }).incomePerMinute;
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

  private pendingSettlementsForPlayer(playerId: string): Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> {
    return this.pendingSettlementsSnapshotForPlayer(playerId);
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

  private emitPlayerStateUpdate(command: Pick<CommandEnvelope, "commandId" | "playerId">, playerId = command.playerId): void {
    const player = this.players.get(playerId);
    if (!player) return;
    this.applyManpowerRegen(player);
    const summary = this.summaryForPlayer(playerId);
    // Use cached snapshots — O(1) on cache hit (rebuilt at most once per tile
    // mutation via replaceTileState invalidation).
    const economy = this.cachedEconomySnapshot(player);
    const metrics = this.cachedDefensibilityMetrics(playerId, summary);
    player.strategicProductionPerMinute = economy.strategicProductionPerMinute;
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
        manpowerBreakdown: this.playerManpowerBreakdown(player),
        incomePerMinute: economy.incomePerMinute,
        strategicResources: {
          FOOD: player.strategicResources?.FOOD ?? 0,
          IRON: player.strategicResources?.IRON ?? 0,
          CRYSTAL: player.strategicResources?.CRYSTAL ?? 0,
          SUPPLY: player.strategicResources?.SUPPLY ?? 0,
          SHARD: player.strategicResources?.SHARD ?? 0,
          OIL: player.strategicResources?.OIL ?? 0
        },
        strategicProductionPerMinute: economy.strategicProductionPerMinute,
        economyBreakdown: economy.economyBreakdown,
        upkeepPerMinute: economy.upkeepPerMinute,
        upkeepLastTick: economy.upkeepLastTick,
        T: metrics.T,
        E: metrics.E,
        Ts: metrics.Ts,
        Es: metrics.Es,
        pendingSettlements: this.pendingSettlementsForPlayer(playerId),
        autoSettlementQueue: this.autoSettlementQueueForPlayer(playerId),
        developmentProcessLimit: DEVELOPMENT_PROCESS_LIMIT,
        activeDevelopmentProcessCount: this.activeDevelopmentProcessCountForPlayer(playerId)
      }
    );
  }

  private handleSyncAllianceCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseAllianceSyncPayload(command.payloadJson);
    const target = payload ? this.players.get(payload.targetPlayerId) : undefined;
    if (!actor || !payload || !target || target.id === actor.id) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid alliance sync payload"
      });
      return;
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

  private rejectIfNoDevelopmentSlot(command: CommandEnvelope, code: string, message: string): boolean {
    if (this.activeDevelopmentProcessCountForPlayer(command.playerId) < DEVELOPMENT_PROCESS_LIMIT) return false;
    this.emitEvent({
      eventType: "COMMAND_REJECTED",
      commandId: command.commandId,
      playerId: command.playerId,
      code,
      message
    });
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

  private handleFrontierCommand(command: CommandEnvelope, actionType: FrontierCommandType): void {
    const actor = this.players.get(command.playerId);
    const payload = parseFrontierPayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    this.applyManpowerRegen(actor);

    const submittedFrom = this.tiles.get(simulationTileKey(payload.fromX, payload.fromY));
    const to = this.tiles.get(simulationTileKey(payload.toX, payload.toY));
    if (!submittedFrom || !to) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "UNKNOWN_TILE",
        message: "origin or target tile not found"
      });
      return;
    }

    // Recover from stale client origin selection by re-picking a valid owned adjacent origin.
    const from =
      submittedFrom.ownerId === actor.id
        ? submittedFrom
        : this.adjacentTileStates(to.x, to.y).find((candidate) => candidate.ownerId === actor.id && candidate.terrain === "LAND") ??
          this.findOwnedDockOriginForCrossing(actor.id, to.x, to.y) ??
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
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "ORIGIN_CUT_OFF",
        message: "origin tile is cut off from supply and cannot launch actions"
      });
      return;
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
      isBridgeCrossing: false,
      targetShielded: isDockCrossing ? false : this.crossingBlockedByAetherWall(from.x, from.y, to.x, to.y),
      defenderIsAlliedOrTruced: Boolean(to.ownerId && actor.allies.has(to.ownerId)),
      expandClaimDurationMs
    });

    if (!validation.ok) {
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
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: validation.code,
        message: validation.message
      });
      return;
    }

    const baseLock: LockRecord = {
      commandId: command.commandId,
      playerId: command.playerId,
      actionType,
      manpowerCost: validation.manpowerCost,
      originX: validation.origin.x,
      originY: validation.origin.y,
      targetX: validation.target.x,
      targetY: validation.target.y,
      originKey: simulationTileKey(validation.origin.x, validation.origin.y),
      targetKey: simulationTileKey(validation.target.x, validation.target.y),
      resolvesAt: validation.resolvesAt,
      source: lockSourceFromSessionId(command.sessionId)
    };
    const combatResolution = actionType === "EXPAND" ? undefined : this.buildLockedCombatResolution(baseLock);
    const lock: LockRecord = {
      ...baseLock,
      ...(combatResolution ? { combatResolution } : {})
    };
    if (
      actionType === "ATTACK" &&
      from.ownershipState === "FRONTIER" &&
      to.ownerId &&
      to.ownerId !== command.playerId &&
      fortAutoFrontierRadiusForTile(to, to.ownerId, this.now()) > 0
    ) {
      this.extendFortPatrolGrace(lock.originKey, validation.resolvesAt + FORT_PATROL_GRACE_MS);
    }
    this.locksByTile.set(lock.originKey, lock);
    this.locksByTile.set(lock.targetKey, lock);
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
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "UNKNOWN_TILE",
        message: "tile not found"
      });
      return;
    }
    if (target.ownerId !== command.playerId || target.ownershipState !== "FRONTIER") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SETTLE_INVALID",
        message: "tile is not one of your frontier tiles"
      });
      return;
    }
    // Encirclement guard: a cut-off tile cannot be settled. Settling a
    // disconnected tile would let a player convert an encircled pocket into
    // permanent territory, defeating the encirclement mechanic. Natural
    // frontier expiry also uses `frontierDecayAt`, so use the explicit owner.
    if (target.frontierDecayKind === "ENCIRCLEMENT") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "ORIGIN_CUT_OFF",
        message: "tile is cut off from supply and cannot be settled"
      });
      return;
    }
    if (target.terrain !== "LAND") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SETTLE_INVALID",
        message: "tile is not valid land"
      });
      return;
    }

    if (this.pendingSettlementsByTile.has(targetKey)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SETTLE_INVALID",
        message: "tile is already settling"
      });
      return;
    }
    if (this.rejectIfNoDevelopmentSlot(command, "SETTLE_INVALID", "development slots are busy")) return;
    if (actor.points < SETTLE_COST) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "INSUFFICIENT_GOLD",
        message: "insufficient gold to settle"
      });
      return;
    }

    this.startSettlementProcess({
      commandId: command.commandId,
      playerId: command.playerId,
      targetKey,
      target,
      startedAt: this.now()
    });
  }

  private handleCollectVisibleCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    if (!actor) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "unknown player"
      });
      return;
    }
    this.applyManpowerRegen(actor);

    const now = this.now();
    const cooldownUntil = this.collectVisibleCooldownByPlayer.get(command.playerId) ?? 0;
    if (cooldownUntil > now) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "COLLECT_COOLDOWN",
        message: "collect visible is on cooldown"
      });
      return;
    }

    let tiles = 0;
    let gold = 0;
    const strategic: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>> = {};
    const yieldContext = this.tileYieldEconomyContextForPlayer(actor);
    let yieldMs = 0;
    let tilesConsidered = 0;
    const sampleNow = this.now.bind(this);
    // Use the yieldBearingTilesByOwner index so we iterate only tiles with
    // income potential (O(yield-bearing) instead of O(all-settled)). The inner
    // SETTLED guard is kept as a safety net for index drift.
    const yieldBearingKeys = this.yieldBearingTilesByOwner.get(command.playerId);
    if (yieldBearingKeys) {
      for (const tileKey of yieldBearingKeys) {
        const tile = this.tiles.get(tileKey);
        if (!tile || tile.ownershipState !== "SETTLED") continue;
        tilesConsidered += 1;
        const yieldStartedAt = sampleNow();
        const collected = this.collectTileYield(tile, now, command, yieldContext, {
          creditStrategic: false,
          persistAnchor: false
        });
        yieldMs += sampleNow() - yieldStartedAt;
        const touched = collected.gold > 0 || Object.values(collected.strategic).some((value) => Number(value) > 0);
        if (!touched) continue;
        tiles += 1;
        gold += collected.gold;
        for (const [resource, amount] of Object.entries(collected.strategic) as Array<[StrategicResourceKey, number]>) {
          strategic[resource] = (strategic[resource] ?? 0) + amount;
        }
      }
    }
    // DEV_ASSERT: cross-check index vs full scan in dev mode
    if (process.env.DEV_ASSERT_YIELD_INDEX === "1") {
      this.assertYieldIndexCorrect(command.playerId, now, yieldContext);
    }
    this.collectVisibleCooldownByPlayer.set(command.playerId, now + COLLECT_VISIBLE_COOLDOWN_MS);
    this.setPlayerYieldCollectionEpoch(command.commandId, command.playerId, now);
    actor.points += gold;
    for (const [resource, amount] of Object.entries(strategic) as Array<[StrategicResourceKey, number]>) {
      if (amount > 0) this.addStrategicResource(actor, resource, amount);
    }
    // COLLECT_VISIBLE is a player-level economy operation. The player epoch
    // below clears derived tile buffers without emitting one zero-yield tile
    // delta per touched tile.
    const tileDeltaBatchEmitMs = 0;
    const collectResultStartedAt = sampleNow();
    this.emitEvent({
      eventType: "COLLECT_RESULT",
      commandId: command.commandId,
      playerId: command.playerId,
      mode: "visible",
      tiles,
      gold,
      strategic
    });
    const collectResultEmitMs = sampleNow() - collectResultStartedAt;
    const playerStateUpdateStartedAt = sampleNow();
    this.emitPlayerStateUpdate(command);
    const playerStateUpdateMs = sampleNow() - playerStateUpdateStartedAt;
    this.onCollectVisibleSample?.({
      playerId: command.playerId,
      yieldMs,
      deltaMs: 0,
      tileDeltaBatchEmitMs,
      collectResultEmitMs,
      playerStateUpdateMs,
      tilesConsidered,
      tilesTouched: tiles
    });
  }

  private handleCollectTileCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    this.applyManpowerRegen(actor);
    const target = this.tiles.get(simulationTileKey(payload.x, payload.y));
    if (!target || target.ownerId !== command.playerId || target.ownershipState !== "SETTLED") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "COLLECT_EMPTY",
        message: "tile is not a settled owned tile"
      });
      return;
    }

    const collected = this.collectTileYield(target, this.now(), command);
    const gold = collected.gold;
    const strategic = collected.strategic;
    const touched = gold > 0 || Object.values(strategic).some((value) => Number(value) > 0);
    if (!touched) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "COLLECT_EMPTY",
        message: "yield is empty"
      });
      return;
    }
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

  private handleUncaptureTileCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseStructureTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "UNKNOWN_TILE",
        message: "tile not found"
      });
      return;
    }
    if (target.ownerId !== command.playerId) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "UNCAPTURE_NOT_OWNER",
        message: "tile is not owned by you"
      });
      return;
    }
    if (this.ownedTileCountForPlayer(command.playerId) <= 1) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "UNCAPTURE_LAST_TILE",
        message: "cannot uncapture your last tile"
      });
      return;
    }
    if (target.town?.populationTier === "SETTLEMENT") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "UNCAPTURE_SETTLEMENT",
        message: "cannot abandon your settlement"
      });
      return;
    }
    const summary = this.summaryForPlayer(command.playerId);
    if (summary.ownedTownTierByTile.size <= 1 && summary.ownedTownTierByTile.has(targetKey)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "UNCAPTURE_LAST_TOWN",
        message: "cannot abandon your last town"
      });
      return;
    }
    if (this.locksByTile.has(targetKey)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "LOCKED",
        message: "tile locked in combat"
      });
      return;
    }

    const updatedTile: DomainTileState = {
      ...target,
      ownerId: undefined,
      ownershipState: undefined,
      fort: undefined,
      observatory: undefined,
      siegeOutpost: undefined,
      economicStructure: undefined
    };
    this.replaceTileState(targetKey, updatedTile, command.commandId);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
    this.emitPlayerStateUpdate(command);
  }

  private handleOverloadSynthesizerCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseStructureTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    const structure = target?.economicStructure;
    if (!target || !structure || structure.ownerId !== command.playerId) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SYNTH_OVERLOAD_INVALID",
        message: "no owned synthesizer on tile"
      });
      return;
    }
    if (!actor.techIds.has("overload-protocols")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SYNTH_OVERLOAD_INVALID",
        message: "unlock synthesizer overload via Overload Protocols first"
      });
      return;
    }
    if (
      structure.type !== "FUR_SYNTHESIZER" &&
      structure.type !== "ADVANCED_FUR_SYNTHESIZER" &&
      structure.type !== "IRONWORKS" &&
      structure.type !== "ADVANCED_IRONWORKS" &&
      structure.type !== "CRYSTAL_SYNTHESIZER" &&
      structure.type !== "ADVANCED_CRYSTAL_SYNTHESIZER"
    ) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SYNTH_OVERLOAD_INVALID",
        message: "only synthesizer structures can overload"
      });
      return;
    }
    if (structure.status === "under_construction" || structure.status === "removing") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SYNTH_OVERLOAD_INVALID",
        message: "synthesizer is not ready"
      });
      return;
    }
    if (structure.disabledUntil && structure.disabledUntil > this.now()) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SYNTH_OVERLOAD_INVALID",
        message: "synthesizer is recovering from overload"
      });
      return;
    }
    if (actor.points < SYNTH_OVERLOAD_GOLD_COST) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SYNTH_OVERLOAD_INVALID",
        message: "insufficient gold for synthesizer overload"
      });
      return;
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
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    const structure = target?.economicStructure;
    if (!target || !structure || structure.ownerId !== command.playerId) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "CONVERTER_TOGGLE_INVALID",
        message: "no owned converter on tile"
      });
      return;
    }
    if (!isConverterStructureType(structure.type)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "CONVERTER_TOGGLE_INVALID",
        message: "only converter structures can be toggled"
      });
      return;
    }
    if (structure.status === "under_construction" || structure.status === "removing") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "CONVERTER_TOGGLE_INVALID",
        message: "converter is not ready"
      });
      return;
    }
    if (structure.disabledUntil && structure.disabledUntil > this.now()) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "CONVERTER_TOGGLE_INVALID",
        message: "converter is recovering from overload"
      });
      return;
    }

    if (payload.enabled) {
      if (target.ownerId !== command.playerId || target.ownershipState !== "SETTLED") {
        this.emitEvent({
          eventType: "COMMAND_REJECTED",
          commandId: command.commandId,
          playerId: command.playerId,
          code: "CONVERTER_TOGGLE_INVALID",
          message: "converter requires settled owned tile"
        });
        return;
      }
      const upkeep = economicStructureGoldUpkeepPerInterval(structure.type);
      if (actor.points < upkeep) {
        this.emitEvent({
          eventType: "COMMAND_REJECTED",
          commandId: command.commandId,
          playerId: command.playerId,
          code: "CONVERTER_TOGGLE_INVALID",
          message: "insufficient gold for converter upkeep"
        });
        return;
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

  private handleRevealEmpireCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseRevealPayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    if (!actor.techIds.has("cryptography") && this.revealTargetsForPlayer(actor.id).size === 0) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REVEAL_EMPIRE_INVALID",
        message: "unlock reveal capability via tech/domain first"
      });
      return;
    }
    if (payload.targetPlayerId === actor.id) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REVEAL_EMPIRE_INVALID",
        message: "cannot reveal yourself"
      });
      return;
    }
    if (!this.players.has(payload.targetPlayerId) || actor.allies.has(payload.targetPlayerId)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REVEAL_EMPIRE_INVALID",
        message: "target empire not found or not hostile"
      });
      return;
    }
    const reveals = this.revealTargetsForPlayer(actor.id);
    if (reveals.has(payload.targetPlayerId)) {
      reveals.delete(payload.targetPlayerId);
    } else {
      if (this.revealCapacityForPlayer(actor) < 1 || reveals.size >= 1) {
        this.emitEvent({
          eventType: "COMMAND_REJECTED",
          commandId: command.commandId,
          playerId: command.playerId,
          code: "REVEAL_EMPIRE_INVALID",
          message: "only one revealed empire allowed"
        });
        return;
      }
      if (!this.spendStrategicResource(actor, "CRYSTAL", REVEAL_EMPIRE_ACTIVATION_COST)) {
        this.emitEvent({
          eventType: "COMMAND_REJECTED",
          commandId: command.commandId,
          playerId: command.playerId,
          code: "REVEAL_EMPIRE_INVALID",
          message: "insufficient crystal to activate reveal"
        });
        return;
      }
      reveals.clear();
      reveals.add(payload.targetPlayerId);
    }
    this.emitPlayerMessage(command, {
      type: "REVEAL_EMPIRE_UPDATE",
      activeTargets: [...reveals].sort(),
      revealCapacity: this.revealCapacityForPlayer(actor)
    });
  }

  private handleRevealEmpireStatsCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseRevealPayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const target = this.players.get(payload.targetPlayerId);
    if (!actor.techIds.has("surveying")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REVEAL_EMPIRE_STATS_INVALID",
        message: "requires Surveying"
      });
      return;
    }
    if (!target || payload.targetPlayerId === actor.id || actor.allies.has(payload.targetPlayerId)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REVEAL_EMPIRE_STATS_INVALID",
        message: "target empire not found or not hostile"
      });
      return;
    }
    const revealNow = this.now();
    const revealObservatoryKey = this.pickReadyOwnedObservatoryAny(actor.id, revealNow);
    if (!revealObservatoryKey) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REVEAL_EMPIRE_STATS_INVALID",
        message: "no ready observatory available"
      });
      return;
    }
    if (!this.spendStrategicResource(actor, "CRYSTAL", REVEAL_EMPIRE_STATS_CRYSTAL_COST)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REVEAL_EMPIRE_STATS_INVALID",
        message: "insufficient CRYSTAL for empire stats reveal"
      });
      return;
    }
    this.stampObservatoryCooldown(revealObservatoryKey, REVEAL_EMPIRE_STATS_COOLDOWN_MS, revealNow, command.commandId, command.playerId);
    this.emitPlayerMessage(command, {
      type: "REVEAL_EMPIRE_STATS_RESULT",
      stats: this.buildRevealEmpireStats(target)
    });
  }

  private handleCastAetherBridgeCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const target = this.tiles.get(simulationTileKey(payload.x, payload.y));
    if (!actor.techIds.has("navigation")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AETHER_BRIDGE_INVALID",
        message: "requires Aether Bridge"
      });
      return;
    }
    if (!target || !this.isCoastalLand(target.x, target.y)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AETHER_BRIDGE_INVALID",
        message: "target must be coastal land"
      });
      return;
    }
    const origin = this.closestAetherBridgeOrigin(actor.id, target.x, target.y);
    if (!origin) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AETHER_BRIDGE_INVALID",
        message: "no settled coastal tile can reach this target"
      });
      return;
    }
    const bridgeNow = this.now();
    const bridgeObservatoryKey = this.pickReadyOwnedObservatoryForTarget(actor.id, target.x, target.y, bridgeNow);
    if (!bridgeObservatoryKey) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AETHER_BRIDGE_INVALID",
        message: "no ready observatory in range"
      });
      return;
    }
    if (!this.spendStrategicResource(actor, "CRYSTAL", AETHER_BRIDGE_CRYSTAL_COST)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AETHER_BRIDGE_INVALID",
        message: "insufficient CRYSTAL for aether bridge"
      });
      return;
    }
    this.stampObservatoryCooldown(bridgeObservatoryKey, AETHER_BRIDGE_COOLDOWN_MS, bridgeNow, command.commandId, command.playerId);
    const active = this.activeAetherBridgesForPlayer(actor.id);
    active.push({
      bridgeId: `${command.commandId}:bridge`,
      ownerId: actor.id,
      from: origin,
      to: { x: target.x, y: target.y },
      startedAt: this.now(),
      endsAt: this.now() + AETHER_BRIDGE_DURATION_MS
    });
    this.activeAetherBridgesByPlayer.set(actor.id, active);
    this.emitPlayerMessage(command, {
      type: "AETHER_BRIDGE_UPDATE",
      bridges: active
    });
  }

  private handleCastAetherWallCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseAetherWallPayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    if (!actor.techIds.has("harborcraft")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AETHER_WALL_INVALID",
        message: "requires Aether Moorings"
      });
      return;
    }
    const wallNow = this.now();
    const wallObservatoryKey = this.pickReadyOwnedObservatoryForTarget(actor.id, payload.x, payload.y, wallNow);
    if (!wallObservatoryKey) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AETHER_WALL_INVALID",
        message: "no ready observatory in range"
      });
      return;
    }
    const segments = this.wallSegments(payload.x, payload.y, payload.direction, payload.length);
    for (const segment of segments) {
      const base = this.tiles.get(simulationTileKey(segment.baseX, segment.baseY));
      const outward = this.tiles.get(simulationTileKey(segment.toX, segment.toY));
      if (!base || base.terrain !== "LAND" || base.ownerId !== actor.id || base.ownershipState !== "SETTLED") {
        this.emitEvent({
          eventType: "COMMAND_REJECTED",
          commandId: command.commandId,
          playerId: command.playerId,
          code: "AETHER_WALL_INVALID",
          message: "wall must anchor on your settled land"
        });
        return;
      }
      if (!outward || outward.terrain !== "LAND" || outward.ownerId === actor.id) {
        this.emitEvent({
          eventType: "COMMAND_REJECTED",
          commandId: command.commandId,
          playerId: command.playerId,
          code: "AETHER_WALL_INVALID",
          message: "wall must face passable land"
        });
        return;
      }
      if (this.crossingBlockedByAetherWall(segment.fromX, segment.fromY, segment.toX, segment.toY)) {
        this.emitEvent({
          eventType: "COMMAND_REJECTED",
          commandId: command.commandId,
          playerId: command.playerId,
          code: "AETHER_WALL_INVALID",
          message: "that border already has an aether wall"
        });
        return;
      }
    }
    if (!this.spendStrategicResource(actor, "CRYSTAL", AETHER_WALL_CRYSTAL_COST)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AETHER_WALL_INVALID",
        message: "insufficient CRYSTAL for aether wall"
      });
      return;
    }
    this.stampObservatoryCooldown(wallObservatoryKey, AETHER_WALL_COOLDOWN_MS, wallNow, command.commandId, command.playerId);
    const active = this.activeAetherWallsForPlayer(actor.id);
    active.push({
      wallId: `${command.commandId}:wall`,
      ownerId: actor.id,
      origin: { x: payload.x, y: payload.y },
      direction: payload.direction,
      length: payload.length,
      startedAt: this.now(),
      endsAt: this.now() + AETHER_WALL_DURATION_MS
    });
    this.activeAetherWallsByPlayer.set(actor.id, active);
    this.emitPlayerMessage(command, {
      type: "AETHER_WALL_UPDATE",
      walls: active
    });
  }

  private handleSiphonTileCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!actor.techIds.has("logistics")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SIPHON_INVALID",
        message: "requires Logistics"
      });
      return;
    }
    if (!target || target.terrain !== "LAND" || !target.ownerId || target.ownerId === actor.id || actor.allies.has(target.ownerId)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SIPHON_INVALID",
        message: "target enemy-controlled town or resource tile"
      });
      return;
    }
    if (!target.town && !target.resource) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SIPHON_INVALID",
        message: "target must be a town or resource tile"
      });
      return;
    }
    const siphonNow = this.now();
    const siphonObservatoryKey = this.pickReadyOwnedObservatoryForTarget(actor.id, target.x, target.y, siphonNow);
    if (!siphonObservatoryKey) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SIPHON_INVALID",
        message: "no ready observatory within 30 tiles of target"
      });
      return;
    }
    if (target.sabotage) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SIPHON_INVALID",
        message: "tile already siphoned"
      });
      return;
    }
    if (!this.spendStrategicResource(actor, "CRYSTAL", SIPHON_CRYSTAL_COST)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SIPHON_INVALID",
        message: "insufficient CRYSTAL for siphon"
      });
      return;
    }
    this.stampObservatoryCooldown(siphonObservatoryKey, SIPHON_COOLDOWN_MS, siphonNow, command.commandId, command.playerId);
    const updatedTile: DomainTileState = {
      ...target,
      sabotage: {
        ownerId: actor.id,
        endsAt: this.now() + SIPHON_DURATION_MS,
        outputMultiplier: 1 - SIPHON_SHARE
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

  private handlePurgeSiphonCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target || target.ownerId !== actor.id || !target.sabotage) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "PURGE_SIPHON_INVALID",
        message: "tile is not siphoned"
      });
      return;
    }
    if (!this.spendStrategicResource(actor, "CRYSTAL", SIPHON_PURGE_CRYSTAL_COST)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "PURGE_SIPHON_INVALID",
        message: "insufficient CRYSTAL to purge siphon"
      });
      return;
    }
    const updatedTile: DomainTileState = { ...target, sabotage: undefined };
    this.replaceTileState(targetKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
  }

  private handleCreateMountainCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!actor.techIds.has("terrain-engineering")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "CREATE_MOUNTAIN_INVALID",
        message: "requires Terrain Engineering"
      });
      return;
    }
    if (
      !target ||
      target.terrain !== "LAND" ||
      target.town ||
      target.dockId ||
      target.fort ||
      target.observatory ||
      target.siegeOutpost ||
      target.economicStructure
    ) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "CREATE_MOUNTAIN_INVALID",
        message: "cannot create mountain on this tile"
      });
      return;
    }
    if (!this.ownedLandWithinRange(actor.id, target.x, target.y, 2)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "CREATE_MOUNTAIN_INVALID",
        message: "target must be within 2 tiles of your land"
      });
      return;
    }
    const createMountainNow = this.now();
    const createMountainObservatoryKey = this.pickReadyOwnedObservatoryForTarget(actor.id, target.x, target.y, createMountainNow);
    if (!createMountainObservatoryKey) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "CREATE_MOUNTAIN_INVALID",
        message: "no ready observatory in range"
      });
      return;
    }
    if (actor.points < TERRAIN_SHAPING_GOLD_COST || !this.spendStrategicResource(actor, "CRYSTAL", TERRAIN_SHAPING_CRYSTAL_COST)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "CREATE_MOUNTAIN_INVALID",
        message: "insufficient resources for create mountain"
      });
      return;
    }
    actor.points -= TERRAIN_SHAPING_GOLD_COST;
    this.stampObservatoryCooldown(createMountainObservatoryKey, TERRAIN_SHAPING_COOLDOWN_MS, createMountainNow, command.commandId, command.playerId);
    const updatedTile: DomainTileState = {
      ...target,
      terrain: "MOUNTAIN",
      ownerId: undefined,
      ownershipState: undefined,
      sabotage: undefined,
      fort: undefined,
      observatory: undefined,
      siegeOutpost: undefined,
      economicStructure: undefined
    };
    this.replaceTileState(targetKey, updatedTile);
    this.terrainEpoch = nextTerrainEpoch++;
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
  }

  private handleRemoveMountainCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!actor.techIds.has("terrain-engineering")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REMOVE_MOUNTAIN_INVALID",
        message: "requires Terrain Engineering"
      });
      return;
    }
    if (!target || target.terrain !== "MOUNTAIN") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REMOVE_MOUNTAIN_INVALID",
        message: "target must be mountain"
      });
      return;
    }
    const removeMountainNow = this.now();
    const removeMountainObservatoryKey = this.pickReadyOwnedObservatoryForTarget(actor.id, target.x, target.y, removeMountainNow);
    if (!removeMountainObservatoryKey) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REMOVE_MOUNTAIN_INVALID",
        message: "no ready observatory in range"
      });
      return;
    }
    if (actor.points < TERRAIN_SHAPING_GOLD_COST || !this.spendStrategicResource(actor, "CRYSTAL", TERRAIN_SHAPING_CRYSTAL_COST)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "REMOVE_MOUNTAIN_INVALID",
        message: "insufficient resources for remove mountain"
      });
      return;
    }
    actor.points -= TERRAIN_SHAPING_GOLD_COST;
    this.stampObservatoryCooldown(removeMountainObservatoryKey, TERRAIN_SHAPING_COOLDOWN_MS, removeMountainNow, command.commandId, command.playerId);
    const updatedTile: DomainTileState = { ...target, terrain: "LAND" };
    this.replaceTileState(targetKey, updatedTile);
    this.terrainEpoch = nextTerrainEpoch++;
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
  }

  private handleAirportBombardCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseAirportBombardPayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const airport = this.tiles.get(simulationTileKey(payload.fromX, payload.fromY));
    if (
      !airport ||
      airport.ownerId !== actor.id ||
      airport.economicStructure?.ownerId !== actor.id ||
      airport.economicStructure.type !== "AIRPORT" ||
      airport.economicStructure.status !== "active"
    ) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AIRPORT_BOMBARD_INVALID",
        message: "select an active airport first"
      });
      return;
    }
    if (Math.max(Math.abs(payload.toX - payload.fromX), Math.abs(payload.toY - payload.fromY)) > AIRPORT_BOMBARD_RANGE) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AIRPORT_BOMBARD_INVALID",
        message: "target must be within 30 tiles of the airport"
      });
      return;
    }
    if (!this.isStructurePowered(actor.id, simulationTileKey(payload.fromX, payload.fromY), "AIRPORT")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AIRPORT_BOMBARD_INVALID",
        message: "airport requires a nearby Aether Tower"
      });
      return;
    }
    if (!this.spendStrategicResource(actor, "CRYSTAL", AIRPORT_BOMBARD_CRYSTAL_COST)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AIRPORT_BOMBARD_INVALID",
        message: "insufficient CRYSTAL for bombardment"
      });
      return;
    }
    const changedTiles: Array<ReturnType<SimulationRuntime["tileDeltaFromState"]>> = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const tileKey = simulationTileKey(payload.toX + dx, payload.toY + dy);
        const tile = this.tiles.get(tileKey);
        if (!tile || tile.terrain !== "LAND" || !tile.ownerId || tile.ownerId === actor.id || actor.allies.has(tile.ownerId)) continue;
        const updatedTile: DomainTileState = {
          ...tile,
          ownerId: undefined,
          ownershipState: undefined,
          town: undefined,
          fort: undefined,
          observatory: undefined,
          siegeOutpost: undefined,
          economicStructure: undefined,
          sabotage: undefined
        };
        this.replaceTileState(tileKey, updatedTile, command.commandId);
        changedTiles.push(this.tileDeltaFromState(updatedTile));
      }
    }
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: changedTiles
    });
  }

  private getAbilityCooldownUntil(playerId: string, abilityKey: string): number {
    return this.abilityCooldowns.get(playerId)?.get(abilityKey) ?? 0;
  }

  private setAbilityCooldownUntil(playerId: string, abilityKey: string, untilMs: number): void {
    let map = this.abilityCooldowns.get(playerId);
    if (!map) {
      map = new Map();
      this.abilityCooldowns.set(playerId, map);
    }
    map.set(abilityKey, untilMs);
  }

  private handleImperialExchangeLevyCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseImperialExchangeLevyPayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const tileKey = simulationTileKey(payload.fromX, payload.fromY);
    const tile = this.tiles.get(tileKey);
    if (
      !tile ||
      tile.ownerId !== actor.id ||
      tile.economicStructure?.ownerId !== actor.id ||
      tile.economicStructure.type !== "IMPERIAL_EXCHANGE" ||
      tile.economicStructure.status !== "active"
    ) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "IMPERIAL_EXCHANGE_LEVY_INVALID",
        message: "select an active Imperial Exchange"
      });
      return;
    }
    if (!actor.techIds || !actor.techIds.has("exchange-levy")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "IMPERIAL_EXCHANGE_LEVY_INVALID",
        message: "requires Exchange Levy Writs research"
      });
      return;
    }
    if (!this.isStructurePowered(actor.id, tileKey, "IMPERIAL_EXCHANGE")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "IMPERIAL_EXCHANGE_LEVY_INVALID",
        message: "Imperial Exchange requires a nearby Aether Tower"
      });
      return;
    }
    const now = this.now();
    const cooldownUntil = this.getAbilityCooldownUntil(actor.id, "imperial_exchange_levy");
    if (cooldownUntil > now) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "IMPERIAL_EXCHANGE_LEVY_INVALID",
        message: "ability on cooldown"
      });
      return;
    }
    if (!this.spendStrategicResource(actor, "CRYSTAL", IMPERIAL_EXCHANGE_LEVY_CRYSTAL_COST)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "IMPERIAL_EXCHANGE_LEVY_INVALID",
        message: "insufficient CRYSTAL"
      });
      return;
    }
    let totalTransferred = 0;
    for (const other of this.players.values()) {
      if (other.id === actor.id) continue;
      if (actor.allies.has(other.id)) continue;
      const stock = this.strategicResourceAmount(other, payload.resource);
      const take = Math.floor(stock * IMPERIAL_EXCHANGE_LEVY_SHARE);
      if (take <= 0) continue;
      other.strategicResources = {
        ...(other.strategicResources ?? {}),
        [payload.resource]: Math.max(0, stock - take)
      };
      totalTransferred += take;
    }
    if (totalTransferred > 0) this.addStrategicResource(actor, payload.resource, totalTransferred);
    this.setAbilityCooldownUntil(actor.id, "imperial_exchange_levy", now + IMPERIAL_EXCHANGE_LEVY_COOLDOWN_MS);
  }

  private handleWorldEngineStrikeCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseWorldEngineStrikePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const anchorKey = simulationTileKey(payload.fromX, payload.fromY);
    const anchor = this.tiles.get(anchorKey);
    if (
      !anchor ||
      anchor.ownerId !== actor.id ||
      anchor.economicStructure?.ownerId !== actor.id ||
      anchor.economicStructure.type !== "WORLD_ENGINE" ||
      anchor.economicStructure.status !== "active"
    ) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "WORLD_ENGINE_STRIKE_INVALID",
        message: "select an active World Engine"
      });
      return;
    }
    if (!actor.techIds || !actor.techIds.has("worldbreaker-fire")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "WORLD_ENGINE_STRIKE_INVALID",
        message: "requires Worldbreaker Fire research"
      });
      return;
    }
    if (!this.isStructurePowered(actor.id, anchorKey, "WORLD_ENGINE")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "WORLD_ENGINE_STRIKE_INVALID",
        message: "World Engine requires a nearby Aether Tower"
      });
      return;
    }
    const now = this.now();
    const cooldownUntil = this.getAbilityCooldownUntil(actor.id, "world_engine_strike");
    if (cooldownUntil > now) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "WORLD_ENGINE_STRIKE_INVALID",
        message: "ability on cooldown"
      });
      return;
    }
    const targetKey = simulationTileKey(payload.toX, payload.toY);
    if (this.isTileShieldedByEnemyAegisDome(actor.id, payload.toX, payload.toY)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "WORLD_ENGINE_STRIKE_INVALID",
        message: "blocked by an Aegis Dome"
      });
      return;
    }
    if (!this.spendStrategicResource(actor, "CRYSTAL", WORLD_ENGINE_STRIKE_CRYSTAL_COST)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "WORLD_ENGINE_STRIKE_INVALID",
        message: "insufficient CRYSTAL"
      });
      return;
    }
    const target = this.tiles.get(targetKey);
    if (target) {
      let updated: DomainTileState = target;
      // Destroy non-actor economic structure on the target tile.
      if (target.economicStructure && target.economicStructure.ownerId !== actor.id) {
        updated = { ...updated, economicStructure: undefined };
      }
      // Reduce SETTLED town population. Demote tier based on new pop, floored at TOWN.
      if (target.town && (target.ownershipState === "SETTLED" || target.ownershipState === "FRONTIER") && target.ownerId !== actor.id) {
        const pop = typeof target.town.population === "number" ? target.town.population : 0;
        if (pop > 0) {
          const loss = Math.floor(pop * WORLD_ENGINE_STRIKE_POPULATION_LOSS_RATIO);
          if (loss > 0) {
            const newPop = Math.max(1, pop - loss);
            const currentTier = updated.town!.populationTier;
            let nextTier = currentTier;
            if (currentTier !== "SETTLEMENT") {
              if (newPop >= 5_000_000) nextTier = "METROPOLIS";
              else if (newPop >= 1_000_000) nextTier = "GREAT_CITY";
              else if (newPop >= 100_000) nextTier = "CITY";
              else nextTier = "TOWN";
            }
            updated = { ...updated, town: { ...updated.town!, population: newPop, populationTier: nextTier } };
          }
        }
      }
      if (updated !== target) {
        this.replaceTileState(targetKey, updated, command.commandId);
        this.emitEvent({
          eventType: "TILE_DELTA_BATCH",
          commandId: command.commandId,
          playerId: command.playerId,
          tileDeltas: [this.tileDeltaFromState(updated)]
        });
      }
    }
    this.setAbilityCooldownUntil(actor.id, "world_engine_strike", now + WORLD_ENGINE_STRIKE_COOLDOWN_MS);
  }

  private handleCollectShardCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    const amount = target?.shardSite?.amount ?? 0;
    if (!target || !target.shardSite || amount <= 0) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "COLLECT_EMPTY",
        message: "no shard present"
      });
      return;
    }
    if (
      target.ownerId !== command.playerId ||
      (target.ownershipState !== "FRONTIER" && target.ownershipState !== "SETTLED")
    ) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "COLLECT_NOT_OWNED",
        message: "shard tile must be owned by you"
      });
      return;
    }
    this.addStrategicResource(actor, "SHARD", amount);
    if (target.shardSite?.kind === "FALL") {
      this.currentShardRainSiteCount = Math.max(0, this.currentShardRainSiteCount - 1);
      if (this.currentShardRainSiteCount === 0) {
      this.currentShardRainExpiresAt = undefined;
      this.lastShardRainHelloByPlayer.clear();
    }
    } else {
      // Non-FALL (CACHE) shards are one-time collectibles — request a
      // checkpoint so the cleared state survives a process restart.
      this.onShardCollected?.();
    }
    const updatedTile: DomainTileState = { ...target, shardSite: undefined };
    this.replaceTileState(targetKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [{ ...this.tileDeltaFromState(updatedTile), shardSiteJson: "" }]
    });
    this.emitEvent({
      eventType: "COLLECT_RESULT",
      commandId: command.commandId,
      playerId: command.playerId,
      mode: "tile",
      x: payload.x,
      y: payload.y,
      tiles: 1,
      gold: 0,
      strategic: { SHARD: amount }
    });
    this.emitPlayerStateUpdate(command);
  }

  private handleChooseTechCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    if (!actor) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "unknown player"
      });
      return;
    }
    let techId = "";
    try {
      const parsed = JSON.parse(command.payloadJson) as { techId?: unknown };
      if (typeof parsed.techId === "string") techId = parsed.techId;
    } catch {
      techId = "";
    }
    if (!techId) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "TECH_INVALID",
        message: "missing tech id"
      });
      return;
    }
    const outcome = chooseTechForPlayer(actor, techId, this.tiles.values());
    if (!outcome.ok) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "TECH_INVALID",
        message: outcome.reason
      });
      return;
    }
    // Tech can change upkeep multipliers (fortGoldUpkeepMult, fortIronUpkeepMult,
    // outpostSupplyUpkeepMult). Invalidate the incremental cache so it is rebuilt
    // from scratch with the new multipliers on the next accrual tick.
    this.upkeepAccrualCacheByPlayer.delete(actor.id);
    this.emitEvent({
      eventType: "TECH_UPDATE",
      commandId: command.commandId,
      playerId: command.playerId,
      payloadJson: JSON.stringify(buildTechUpdatePayload(actor, this.tiles.values(), { incomePerMinute: this.incomePerMinuteForPlayer(actor.id) }))
    });
  }

  private handleChooseDomainCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    if (!actor) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "unknown player"
      });
      return;
    }
    let domainId = "";
    let chosenTrickleResource: ChosenTrickleResource | undefined;
    try {
      const parsed = JSON.parse(command.payloadJson) as { domainId?: unknown; chosenTrickleResource?: unknown };
      if (typeof parsed.domainId === "string") domainId = parsed.domainId;
      if (isChosenTrickleResource(parsed.chosenTrickleResource)) {
        chosenTrickleResource = parsed.chosenTrickleResource;
      }
    } catch {
      domainId = "";
    }
    if (!domainId) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "DOMAIN_INVALID",
        message: "missing domain id"
      });
      return;
    }
    const outcome = chooseDomainForPlayer(
      actor,
      domainId,
      this.tiles.values(),
      chosenTrickleResource ? { chosenTrickleResource } : undefined
    );
    if (!outcome.ok) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "DOMAIN_INVALID",
        message: outcome.reason
      });
      return;
    }
    // Domain can change upkeep multipliers (e.g. reduced fort/outpost upkeep
    // domain bonuses). Invalidate the incremental cache so it is rebuilt from
    // scratch with the new multipliers on the next accrual tick.
    this.upkeepAccrualCacheByPlayer.delete(actor.id);
    this.emitEvent({
      eventType: "DOMAIN_UPDATE",
      commandId: command.commandId,
      playerId: command.playerId,
      payloadJson: JSON.stringify(buildDomainUpdatePayload(actor, this.tiles.values(), { incomePerMinute: this.incomePerMinuteForPlayer(actor.id) }))
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

  private revealCapacityForPlayer(player: DomainPlayer): number {
    return player.techIds.has("cryptography") || this.revealTargetsForPlayer(player.id).size > 0 ? 1 : 0;
  }

  private ownedLandWithinRange(playerId: string, x: number, y: number, range: number): boolean {
    for (let dy = -range; dy <= range; dy += 1) {
      for (let dx = -range; dx <= range; dx += 1) {
        const tile = this.tiles.get(simulationTileKey(x + dx, y + dy));
        if (tile?.ownerId === playerId && tile.terrain === "LAND") return true;
      }
    }
    return false;
  }

  /**
   * Wrapped chebyshev distance honoring world-map cylindrical wrap.
   * Mirrors `chebyshevDistanceWrapped` on the client.
   */
  private wrappedChebyshev(ax: number, ay: number, bx: number, by: number): number {
    const dxRaw = Math.abs(ax - bx);
    const dyRaw = Math.abs(ay - by);
    const dx = Math.min(dxRaw, WORLD_WIDTH - dxRaw);
    const dy = Math.min(dyRaw, WORLD_HEIGHT - dyRaw);
    return Math.max(dx, dy);
  }

  isStructurePowered(ownerId: string, tileKey: string, structureType: EconomicStructureType): boolean {
    const tile = this.tiles.get(tileKey);
    const structure = tile?.economicStructure;
    if (!tile || !structure) return false;
    if (structure.ownerId !== ownerId || structure.type !== structureType || structure.status !== "active") return false;
    for (const candidate of this.tiles.values()) {
      const tower = candidate.economicStructure;
      if (!tower || tower.ownerId !== ownerId || tower.type !== "AETHER_TOWER" || tower.status !== "active") continue;
      if (this.wrappedChebyshev(candidate.x, candidate.y, tile.x, tile.y) <= AETHER_TOWER_RADIUS) return true;
    }
    return false;
  }

  // Aegis Dome shields tiles within AEGIS_DOME_PROTECTION_RADIUS for its
  // owner. Worldbreaker Shot is the first ability that respects this — if an
  // enemy player has an active, powered Aegis Dome within range of the target
  // tile, the strike is blocked.
  isTileShieldedByEnemyAegisDome(actorId: string, targetX: number, targetY: number): boolean {
    for (const candidate of this.tiles.values()) {
      const dome = candidate.economicStructure;
      if (!dome || dome.type !== "AEGIS_DOME" || dome.status !== "active") continue;
      if (!dome.ownerId || dome.ownerId === actorId) continue;
      if (this.wrappedChebyshev(candidate.x, candidate.y, targetX, targetY) > AEGIS_DOME_PROTECTION_RADIUS) continue;
      if (this.isStructurePowered(dome.ownerId, simulationTileKey(candidate.x, candidate.y), "AEGIS_DOME")) return true;
    }
    return false;
  }

  /**
   * Effective observatory cast radius for a player: BASE constant plus
   * observatoryRangeBonus + observatoryCastRadiusBonus from techs/domains. Mirrors
   * the client's `ownObservatoryCastRadius` so menu enablement and sim authority
   * agree on which observatories can reach a target.
   */
  private observatoryCastRadiusFor(playerId: string): number {
    const player = this.players.get(playerId);
    if (!player) return OBSERVATORY_CAST_RADIUS;
    return observatoryCastRadiusForPlayer(player, OBSERVATORY_CAST_RADIUS);
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
    let bestKey: string | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const [tileKey, tile] of this.tiles) {
      if (tile.ownerId !== playerId) continue;
      const obs = tile.observatory;
      if (!obs || obs.ownerId !== playerId || obs.status !== "active") continue;
      const distance = this.wrappedChebyshev(tile.x, tile.y, targetX, targetY);
      if (distance > range) continue;
      const cooldownUntil = obs.cooldownUntil ?? 0;
      if (cooldownUntil > now) continue;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestKey = tileKey;
      }
    }
    return bestKey;
  }

  /**
   * Variant for abilities with no spatial target (e.g. reveal_empire_stats targets a
   * player). Returns any owned, active, off-cooldown observatory, soonest-ready first.
   */
  private pickReadyOwnedObservatoryAny(playerId: string, now: number): string | undefined {
    let bestKey: string | undefined;
    let bestCooldownUntil = Number.POSITIVE_INFINITY;
    for (const [tileKey, tile] of this.tiles) {
      if (tile.ownerId !== playerId) continue;
      const obs = tile.observatory;
      if (!obs || obs.ownerId !== playerId || obs.status !== "active") continue;
      const cooldownUntil = obs.cooldownUntil ?? 0;
      if (cooldownUntil > now) continue;
      if (cooldownUntil < bestCooldownUntil) {
        bestCooldownUntil = cooldownUntil;
        bestKey = tileKey;
      }
    }
    return bestKey;
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
    const tile = this.tiles.get(simulationTileKey(x, y));
    if (!tile || tile.terrain !== "LAND") return false;
    return [
      this.tiles.get(simulationTileKey(x, y - 1)),
      this.tiles.get(simulationTileKey(x + 1, y)),
      this.tiles.get(simulationTileKey(x, y + 1)),
      this.tiles.get(simulationTileKey(x - 1, y))
    ].some((neighbor) => Boolean(neighbor?.terrain && isSeaTerrain(neighbor.terrain)));
  }

  private seaTileCountBetween(ax: number, ay: number, bx: number, by: number): number | undefined {
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    if (steps <= 1) return 0;
    let seaTiles = 0;
    for (let index = 1; index < steps; index += 1) {
      const x = Math.round(ax + ((bx - ax) * index) / steps);
      const y = Math.round(ay + ((by - ay) * index) / steps);
      const tile = this.tiles.get(simulationTileKey(x, y));
      if (!tile || !isSeaTerrain(tile.terrain)) return undefined;
      seaTiles += 1;
    }
    return seaTiles;
  }

  private closestAetherBridgeOrigin(playerId: string, targetX: number, targetY: number): { x: number; y: number } | undefined {
    let best: { x: number; y: number; seaTiles: number; distance: number } | undefined;
    for (const tile of this.tiles.values()) {
      if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED" || !this.isCoastalLand(tile.x, tile.y)) continue;
      const seaTiles = this.seaTileCountBetween(tile.x, tile.y, targetX, targetY);
      if (seaTiles === undefined || seaTiles > AETHER_BRIDGE_MAX_SEA_TILES) continue;
      const distance = Math.max(Math.abs(tile.x - targetX), Math.abs(tile.y - targetY));
      if (!best || seaTiles < best.seaTiles || (seaTiles === best.seaTiles && distance < best.distance)) {
        best = { x: tile.x, y: tile.y, seaTiles, distance };
      }
    }
    return best ? { x: best.x, y: best.y } : undefined;
  }

  private wallSegments(originX: number, originY: number, direction: AetherWallDirection, length: 1 | 2 | 3): Array<{
    baseX: number;
    baseY: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  }> {
    const segments: Array<{ baseX: number; baseY: number; fromX: number; fromY: number; toX: number; toY: number }> = [];
    for (let index = 0; index < length; index += 1) {
      const baseX = direction === "N" || direction === "S" ? originX + index : originX;
      const baseY = direction === "E" || direction === "W" ? originY + index : originY;
      const toX = direction === "E" ? baseX + 1 : direction === "W" ? baseX - 1 : baseX;
      const toY = direction === "S" ? baseY + 1 : direction === "N" ? baseY - 1 : baseY;
      segments.push({ baseX, baseY, fromX: baseX, fromY: baseY, toX, toY });
    }
    return segments;
  }

  private activeAetherBridgesForPlayer(playerId: string): ActiveAetherBridgeView[] {
    const active = (this.activeAetherBridgesByPlayer.get(playerId) ?? []).filter((bridge) => bridge.endsAt > this.now());
    this.activeAetherBridgesByPlayer.set(playerId, active);
    return active;
  }

  private activeAetherWallsForPlayer(playerId: string): ActiveAetherWallView[] {
    const active = (this.activeAetherWallsByPlayer.get(playerId) ?? []).filter((wall) => wall.endsAt > this.now());
    this.activeAetherWallsByPlayer.set(playerId, active);
    return active;
  }

  private crossingBlockedByAetherWall(fromX: number, fromY: number, toX: number, toY: number): boolean {
    for (const walls of this.activeAetherWallsByPlayer.values()) {
      for (const wall of walls) {
        if (wall.endsAt <= this.now()) continue;
        for (const segment of this.wallSegments(wall.origin.x, wall.origin.y, wall.direction, wall.length)) {
          if (
            (segment.fromX === fromX && segment.fromY === fromY && segment.toX === toX && segment.toY === toY) ||
            (segment.fromX === toX && segment.fromY === toY && segment.toX === fromX && segment.toY === fromY)
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private buildRevealEmpireStats(target: DomainPlayer): Record<string, unknown> {
    let settledTiles = 0;
    let frontierTiles = 0;
    let controlledTowns = 0;
    for (const tile of this.tiles.values()) {
      if (tile.ownerId !== target.id) continue;
      if (tile.ownershipState === "SETTLED") settledTiles += 1;
      if (tile.ownershipState === "FRONTIER") frontierTiles += 1;
      if (tile.town) controlledTowns += 1;
    }
    return {
      playerId: target.id,
      playerName: target.name ?? target.id,
      revealedAt: this.now(),
      tiles: settledTiles + frontierTiles,
      settledTiles,
      frontierTiles,
      controlledTowns,
      incomePerMinute: 0,
      techCount: target.techIds.size,
      gold: target.points,
      manpower: target.manpower,
      manpowerCap: Math.max(target.manpower, 100),
      strategicResources: {
        FOOD: target.strategicResources?.FOOD ?? 0,
        IRON: target.strategicResources?.IRON ?? 0,
        CRYSTAL: target.strategicResources?.CRYSTAL ?? 0,
        SUPPLY: target.strategicResources?.SUPPLY ?? 0,
        SHARD: target.strategicResources?.SHARD ?? 0,
        OIL: target.strategicResources?.OIL ?? 0
      }
    };
  }

  private emitEvent(event: SimulationEvent): void {
    if (event.eventType === "TILE_DELTA_BATCH") {
      const expanded = this.expandTileDeltasWithLinkedDocks(event.tileDeltas);
      if (expanded !== event.tileDeltas) event = { ...event, tileDeltas: expanded };
    }
    this.persistence.recordEvent(event);
    const existingEvents = this.recordedEventsByCommandId.get(event.commandId) ?? [];
    existingEvents.push(event);
    this.recordedEventsByCommandId.set(event.commandId, existingEvents);
    if (isTerminalCommandEvent(event)) this.markTerminalReplayCommand(event.commandId);
    if (event.eventType === "COMBAT_CANCELLED") {
      for (const cancelledCommandId of event.cancelledCommandIds ?? []) {
        if (cancelledCommandId !== event.commandId) this.markTerminalOnlyReplayCommand(cancelledCommandId);
      }
    }
    this.pruneReplayCaches();
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
    const enrichedTile = tile.town && resolvedContext
      ? (() => {
          const networkTown = enrichTownWithConnectedNetwork(tile, resolvedContext.townNetwork);
          const refreshedTown = networkTown && player
            ? refreshTownEconomyFields(networkTown, tile, player, this.tiles, resolvedContext.fedTownKeys, resolvedContext.firstThreeTownKeys)
            : networkTown;
          return { ...tile, town: refreshedTown };
        })()
      : tile;
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
      ...(enrichedTile.town ? { townJson: JSON.stringify(enrichedTile.town) } : {}),
      ...(enrichedTile.town?.type ? { townType: enrichedTile.town.type } : {}),
      ...(enrichedTile.town?.name ? { townName: enrichedTile.town.name } : {}),
      ...(enrichedTile.town?.populationTier ? { townPopulationTier: enrichedTile.town.populationTier } : {}),
      fortJson: cached.fortJson,
      observatoryJson: cached.observatoryJson,
      siegeOutpostJson: cached.siegeOutpostJson,
      economicStructureJson: cached.economicStructureJson,
      sabotageJson: cached.sabotageJson,
      ...(yieldView?.yield ? { yield: yieldView.yield } : {}),
      ...(yieldView?.yieldRate ? { yieldRate: yieldView.yieldRate } : {}),
      ...(yieldView?.yieldCap ? { yieldCap: yieldView.yieldCap } : {})
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
    strategic: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>>;
  } {
    const creditStrategic = options.creditStrategic ?? true;
    const persistAnchor = options.persistAnchor ?? true;
    const tileKey = simulationTileKey(tile.x, tile.y);
    const player = tile.ownerId ? this.players.get(tile.ownerId) : undefined;
    const resolvedContext = player && context?.player.id === player.id ? context : player ? this.tileYieldEconomyContextForPlayer(player) : undefined;
    const enrichedTile = tile.town && resolvedContext
      ? (() => {
          const networkTown = enrichTownWithConnectedNetwork(tile, resolvedContext.townNetwork);
          const refreshedTown = networkTown && player
            ? refreshTownEconomyFields(networkTown, tile, player, this.tiles, resolvedContext.fedTownKeys, resolvedContext.firstThreeTownKeys)
            : networkTown;
          return { ...tile, town: refreshedTown };
        })()
      : tile;
    const yieldView = buildTileYieldView(enrichedTile, this.tileYieldCollectedAt(tileKey, tile.ownerId), now, {
      ...(player ? { player } : {}),
      ...(resolvedContext ? { fedTownKeys: resolvedContext.fedTownKeys } : {}),
      ...(resolvedContext ? { firstThreeTownKeys: resolvedContext.firstThreeTownKeys } : {}),
      tiles: this.tiles,
      dockLinksByDockTileKey: this.dockLinksByDockTileKey
    });
    const gold = Math.floor((yieldView?.yield?.gold ?? 0) * 100) / 100;
    const strategic: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>> = {};
    for (const [resource, amount] of Object.entries(yieldView?.yield?.strategic ?? {}) as Array<
      ["FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number]
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
    let count = 0;
    for (const tile of this.tiles.values()) {
      if (tile.ownerId === playerId) count += 1;
    }
    return count;
  }

  private adjacentTileStates(x: number, y: number): DomainTileState[] {
    return frontierNeighborCoords(x, y)
      .map((coords) => this.tiles.get(simulationTileKey(coords.x, coords.y)))
      .filter((tile): tile is DomainTileState => tile !== undefined);
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

  private frontierDecayPausedForTile(playerId: string, tileKey: string, tile: DomainTileState): boolean {
    if (this.pendingSettlementsByTile.has(tileKey)) return true;
    if (tile.resource || tile.town || tile.dockId) return true;
    return this.supportedTownKeysForTile(playerId, tile.x, tile.y).some((townKey) => {
      const town = this.tiles.get(townKey)?.town;
      return Boolean(town && town.populationTier !== "SETTLEMENT");
    });
  }

  /**
   * Part 2 rewrite: instead of scanning a radius² neighbourhood of cells,
   * iterate the pre-built activeFortAnchorsByOwner index for the player and
   * check coverage. O(anchors) per tile instead of O(radius²).
   *
   * Semantics preserved: returns true if any fort/wooden-fort/town anchor
   * owned by playerId has an effective radius that covers tile.
   */
  private frontierSupportedByActiveFort(tile: DomainTileState, playerId: string, nowMs: number): boolean {
    // Fast path: the tile itself is an anchor (e.g. a fort sitting on a frontier tile).
    if (fortAutoFrontierRadiusForTile(tile, playerId, nowMs) > 0) return true;
    const anchors = this.activeFortAnchorsByOwner.get(playerId);
    if (!anchors) return false;
    for (const [anchorKey, _maxRadius] of anchors) {
      const anchor = this.tiles.get(anchorKey);
      if (!anchor) continue;
      const effectiveRadius = fortAutoFrontierRadiusForTile(anchor, playerId, nowMs);
      // fortAutoFrontierRadiusForTile returns 0 for towns; fall back to TOWN_AUTO_FRONTIER_RADIUS.
      const radius = effectiveRadius > 0 ? effectiveRadius : (isSettledTownAnchor(anchor, playerId) ? TOWN_AUTO_FRONTIER_RADIUS : 0);
      if (radius <= 0) continue;
      const dx = Math.abs(anchor.x - tile.x);
      const wrappedDx = Math.min(dx, WORLD_WIDTH - dx);
      const dy = Math.abs(anchor.y - tile.y);
      const wrappedDy = Math.min(dy, WORLD_HEIGHT - dy);
      if (Math.max(wrappedDx, wrappedDy) <= radius) return true;
    }
    return false;
  }

  // Fast path for decay-timer-only mutations in updateFrontierDecay. Starting or
  // clearing a frontier decay timer changes only frontierDecayAt/frontierDecayKind
  // — ownerId and ownershipState are unchanged — so none of replaceTileState's
  // ownership-change maintenance (economy/summary/planner/index refreshes) applies.
  // This collapses the cold first-tick cost from O(frontier × (territory + radius²))
  // to O(frontier). Caller is responsible for emitting the tile delta.
  private setFrontierDecayTimerFields(tileKey: string, tile: DomainTileState): void {
    this.tiles.set(tileKey, tile);
    this.tileDeltaStringifyCache.invalidate(tileKey);
  }

  private updateFrontierDecay(nowMs: number): void {
    // Reset pooled accumulators without discarding inner arrays (pool pattern).
    for (const arr of this.frontierDecayChangedByOwner.values()) arr.length = 0;
    for (const arr of this.frontierDecayExpiredByOwner.values()) arr.length = 0;

    const addChangedDelta = (playerId: string, delta: SimulationTileWireDelta): void => {
      const existing = this.frontierDecayChangedByOwner.get(playerId);
      if (existing) existing.push(delta);
      else {
        const arr: SimulationTileWireDelta[] = [delta];
        this.frontierDecayChangedByOwner.set(playerId, arr);
      }
    };
    const addExpiredKey = (playerId: string, tileKey: string): void => {
      const existing = this.frontierDecayExpiredByOwner.get(playerId);
      if (existing) existing.push(tileKey);
      else this.frontierDecayExpiredByOwner.set(playerId, [tileKey]);
    };

    // Part 3: collect expired tiles separately to apply via bulk path.
    // Key: ownerId, Value: array of [tileKey, expiredTileState]
    const expiredTilesByOwner = new Map<string, Array<[string, DomainTileState]>>();

    // Part 1: iterate only frontier tiles via frontierTilesByOwner index,
    // avoiding the full this.tiles scan (was O(all_tiles), now O(frontier_tiles)).
    for (const [ownerId, frontierKeys] of this.frontierTilesByOwner) {
      for (const tileKey of frontierKeys) {
        if (this.locksByTile.has(tileKey)) continue;
        const tile = this.tiles.get(tileKey);
        // tile could be undefined if index is stale, or non-FRONTIER for same reason — skip.
        if (!tile || tile.ownershipState !== "FRONTIER" || tile.ownerId !== ownerId) continue;

        if (this.frontierDecayPausedForTile(ownerId, tileKey, tile)) {
          if (tile.frontierDecayAt === undefined) continue;
          const queuedTile: DomainTileState = {
            ...tile,
            frontierDecayAt: undefined,
            frontierDecayKind: undefined
          };
          this.setFrontierDecayTimerFields(tileKey, queuedTile);
          addChangedDelta(ownerId, this.tileDeltaFromState(queuedTile));
          continue;
        }
        if (this.frontierSupportedByActiveFort(tile, ownerId, nowMs)) {
          if (tile.frontierDecayAt === undefined) continue;
          const supportedTile: DomainTileState = {
            ...tile,
            frontierDecayAt: undefined,
            frontierDecayKind: undefined
          };
          this.setFrontierDecayTimerFields(tileKey, supportedTile);
          addChangedDelta(ownerId, this.tileDeltaFromState(supportedTile));
          continue;
        }

        const decayAt = tile.frontierDecayAt ?? nowMs + FRONTIER_DECAY_MS;
        if (decayAt <= nowMs) {
          // Part 3: collect for bulk expiry instead of individual replaceTileState.
          const expiredTile: DomainTileState = {
            ...tile,
            ownerId: undefined,
            ownershipState: undefined,
            frontierDecayAt: undefined,
            frontierDecayKind: undefined,
            fort: undefined,
            observatory: undefined,
            siegeOutpost: undefined,
            economicStructure: undefined,
            sabotage: undefined
          };
          const bucket = expiredTilesByOwner.get(ownerId);
          if (bucket) bucket.push([tileKey, expiredTile]);
          else expiredTilesByOwner.set(ownerId, [[tileKey, expiredTile]]);
          continue;
        }

        if (tile.frontierDecayAt !== decayAt) {
          const decayingTile: DomainTileState = {
            ...tile,
            frontierDecayAt: decayAt,
            frontierDecayKind: "NATURAL"
          };
          this.setFrontierDecayTimerFields(tileKey, decayingTile);
          addChangedDelta(ownerId, this.tileDeltaFromState(decayingTile));
        }
      }
    }

    // Part 3: bulk-apply expired tiles, deduplicating planner index work.
    if (expiredTilesByOwner.size > 0) {
      this.bulkClearFrontierOwnership(expiredTilesByOwner, nowMs);
      for (const [ownerId, pairs] of expiredTilesByOwner) {
        for (const [tileKey, expiredTile] of pairs) {
          addChangedDelta(ownerId, this.tileDeltaFromState(expiredTile));
          addExpiredKey(ownerId, tileKey);
        }
      }
    }

    for (const [playerId, tileDeltas] of this.frontierDecayChangedByOwner) {
      if (tileDeltas.length === 0) continue;
      const commandId = this.nextTerritoryAutomationCommandId("frontier-decay", playerId, "batch", nowMs);
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId,
        playerId,
        tileDeltas
      });
      this.emitPlayerStateUpdate({ commandId, playerId });
    }

    // Re-check encirclement for neighbors of tiles that expired this tick.
    // A tile expiry can cut off neighbors that were connected through it.
    for (const [playerId, expiredKeys] of this.frontierDecayExpiredByOwner) {
      if (expiredKeys.length === 0) continue;
      const commandId = this.nextTerritoryAutomationCommandId("frontier-decay-encirclement", playerId, "batch", nowMs);
      this.applyEncirclement(expiredKeys, playerId, commandId);
    }
  }

  /**
   * Part 3: Bulk expiry path. Applies all expired frontier tiles with deduped
   * planner/candidate index refreshes, avoiding O(expiredCount * radius²) cost.
   *
   * For each expired tile:
   *   - Directly mutates this.tiles to the cleared state
   *   - Updates frontierTilesByOwner and activeFortAnchorsByOwner
   *   - Handles player summaries (O(1) per tile)
   *   - Defers planner/playerCandidateIndex work until after all mutations
   *
   * Then does ONE deduped refresh pass over the union of all affected candidate keys.
   */
  private bulkClearFrontierOwnership(
    expiredTilesByOwner: Map<string, Array<[string, DomainTileState]>>,
    nowMs: number
  ): void {
    // Dedupe keys that need planner-candidate-index refresh.
    const dirtyPlannerKeysByPlayer = new Map<string, Set<string>>();
    const dirtyWatchedKeys = new Set<string>();
    const commandIdPrefix = `frontier-decay-expired-bulk:${nowMs}`;

    for (const [ownerId, pairs] of expiredTilesByOwner) {
      for (const [tileKey, expiredTile] of pairs) {
        const previous = this.tiles.get(tileKey);

        // 1. Invalidate stringify cache (cheap, keep per-tile).
        this.tileDeltaStringifyCache.invalidate(tileKey);

        // 2. Update player summaries (O(1) per tile, keep per-tile).
        if (previous) this.removeTileFromPlayerSummaries(tileKey, previous);
        this.tiles.set(tileKey, expiredTile);
        this.applyTileToPlayerSummaries(tileKey, expiredTile);

        // 3. Settle-at bookkeeping (expiredTile is unowned, so clear).
        this.tileSettledAtByKey.delete(tileKey);

        // 4. Fort patrol grace (clear on expiry).
        this.fortPatrolGraceUntilByTile.delete(tileKey);

        // 5. Part 1: update frontierTilesByOwner — tile is no longer FRONTIER.
        this.removeFrontierTileFromOwnerIndex(tileKey, ownerId);

        // 6. Part 2: update activeFortAnchorsByOwner — expired tile loses any anchor status.
        this.refreshFortAnchorIndexForTile(tileKey, previous, expiredTile);

        // 7. Cancel pending settlement if owner changed (it always does on expiry).
        this.cancelPendingSettlementIfOwnerChanged(tileKey, expiredTile.ownerId, commandIdPrefix);

        // 8 & 9. Collect planner dirty keys and playerCandidateIndex watched keys (deduped).
        // Use numeric coordinates to avoid per-tile string-parse overhead from
        // candidateIndexKeysAroundTileKey. Expand 2 hops inline.
        {
          const ex = expiredTile.x;
          const ey = expiredTile.y;
          let ownerSet = dirtyPlannerKeysByPlayer.get(ownerId);
          if (!ownerSet) { ownerSet = new Set<string>(); dirtyPlannerKeysByPlayer.set(ownerId, ownerSet); }
          // Include the tile itself and all tiles within 2 hops (Chebyshev radius 2 = 5x5 - 1 = 24 neighbors).
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const nx = ((ex + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
              const ny = ((ey + dy) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
              const nk = `${nx},${ny}`;
              ownerSet.add(nk);
              dirtyWatchedKeys.add(nk);
              // Check for other affected players in the neighborhood.
              const neighborTile = this.tiles.get(nk);
              const neighborOwner = neighborTile?.ownerId;
              if (neighborOwner && neighborOwner !== ownerId) {
                let nset = dirtyPlannerKeysByPlayer.get(neighborOwner);
                if (!nset) { nset = new Set<string>(); dirtyPlannerKeysByPlayer.set(neighborOwner, nset); }
                nset.add(nk);
              }
            }
          }
        }

        // 10. PlayerCandidateIndex anchor: unregister if this tile was an anchor.
        // refreshPlayerCandidateIndexAnchorForTile logic inline:
        const prevOwnerId = previous?.ownerId;
        if (previous && prevOwnerId) {
          // Use anchorKindMaxRadius detection: fort, wooden-fort, town, sweep outpost.
          const hadFort =
            (previous.economicStructure?.ownerId === prevOwnerId &&
              previous.economicStructure.type === "WOODEN_FORT" &&
              previous.economicStructure.status === "active") ||
            (previous.fort?.ownerId === prevOwnerId && previous.fort.status === "active");
          const hadTown = isSettledTownAnchor(previous, prevOwnerId);
          const hadSweep =
            previous.siegeOutpost?.ownerId === prevOwnerId &&
            previous.siegeOutpost.status === "active" &&
            previous.siegeOutpost.sweepActive;
          if (hadFort || hadTown || hadSweep) {
            this.playerCandidateIndex.unregisterAnchor(tileKey);
          }
        }
        // expiredTile has no owner, so no re-register.
      }
    }

    // 11. Deduped planner-candidate-index refresh.
    for (const [pid, candidateKeys] of dirtyPlannerKeysByPlayer) {
      const summary = this.summaryForPlayer(pid);
      for (const candidateKey of candidateKeys) {
        summary.hotFrontierTileKeys.delete(candidateKey);
        summary.strategicFrontierTileKeys.delete(candidateKey);
        summary.buildCandidateTileKeys.delete(candidateKey);
        const candidateTile = this.tiles.get(candidateKey);
        if (!candidateTile || candidateTile.ownerId !== pid) continue;
        if (isHotFrontierTile(pid, candidateTile, this.tiles)) summary.hotFrontierTileKeys.add(candidateKey);
        if (isStrategicFrontierTile(pid, candidateTile, this.tiles)) summary.strategicFrontierTileKeys.add(candidateKey);
        if (isBuildCandidateTile(pid, candidateTile, this.tiles)) summary.buildCandidateTileKeys.add(candidateKey);
      }
      this.markPlannerPlayerTileCollectionDirty(pid);
    }

    // 12. Deduped playerCandidateIndex refresh.
    for (const watchedKey of dirtyWatchedKeys) {
      this.playerCandidateIndex.refreshAroundTile(watchedKey, (k) => this.tiles.get(k));
    }
  }

  private isDockCrossingTarget(from: DomainTileState, toX: number, toY: number): boolean {
    if (!from.dockId) return false;
    return isValidDockCrossingTarget(simulationTileKey(from.x, from.y), toX, toY, this.dockLinksByDockTileKey);
  }

  private findOwnedDockOriginForCrossing(playerId: string, toX: number, toY: number): DomainTileState | undefined {
    for (const tile of this.tiles.values()) {
      if (tile.ownerId !== playerId || tile.terrain !== "LAND" || !tile.dockId) continue;
      if (this.isDockCrossingTarget(tile, toX, toY)) return tile;
    }
    return undefined;
  }

  private supportedTownKeysForTile(playerId: string, x: number, y: number): string[] {
    return this.adjacentTileStates(x, y)
      .filter((tile) => tile.ownerId === playerId && tile.ownershipState === "SETTLED" && tile.town)
      .map((tile) => simulationTileKey(tile.x, tile.y));
  }

  private supportedDockKeysForTile(playerId: string, x: number, y: number): string[] {
    return this.adjacentTileStates(x, y)
      .filter((tile) => tile.ownerId === playerId && tile.ownershipState === "SETTLED" && tile.dockId)
      .map((tile) => simulationTileKey(tile.x, tile.y));
  }

  private economicStructureForSupportedTown(playerId: string, townKey: string, structureType: EconomicStructureType): DomainTileState | undefined {
    const [townXRaw, townYRaw] = townKey.split(",");
    const townX = Number(townXRaw);
    const townY = Number(townYRaw);
    return this.adjacentTileStates(townX, townY).find(
      (tile) => tile.ownerId === playerId && tile.economicStructure?.ownerId === playerId && tile.economicStructure.type === structureType
    );
  }

  private firstAvailableTownSupportTile(playerId: string, townKey: string, structureType: EconomicStructureType): DomainTileState | undefined {
    const [townXRaw, townYRaw] = townKey.split(",");
    const townX = Number(townXRaw);
    const townY = Number(townYRaw);
    return this.adjacentTileStates(townX, townY).find((tile) => {
      if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") return false;
      if (tile.town || tile.fort || tile.observatory || tile.siegeOutpost || tile.economicStructure) return false;
      return structureShowsOnTile(structureType, {
        ownershipState: tile.ownershipState,
        resource: tile.resource,
        dockId: tile.dockId,
        townPopulationTier: undefined,
        supportedTownCount: this.supportedTownKeysForTile(playerId, tile.x, tile.y).length,
        supportedDockCount: this.supportedDockKeysForTile(playerId, tile.x, tile.y).length
      });
    });
  }

  private ownedStructureCountForPlayer(playerId: string, structureType: BuildableStructureType): number {
    return this.ownedStructureCountByPlayerByType.get(playerId)?.get(structureType) ?? 0;
  }

  private adjustOwnedStructureCount(ownerId: string, structureType: BuildableStructureType, delta: number): void {
    let byType = this.ownedStructureCountByPlayerByType.get(ownerId);
    if (!byType) {
      if (delta <= 0) return;
      byType = new Map();
      this.ownedStructureCountByPlayerByType.set(ownerId, byType);
    }
    const next = (byType.get(structureType) ?? 0) + delta;
    if (next <= 0) {
      byType.delete(structureType);
      if (byType.size === 0) this.ownedStructureCountByPlayerByType.delete(ownerId);
    } else {
      byType.set(structureType, next);
    }
  }

  private refreshOwnedStructureCountIndexForTile(
    previous: DomainTileState | undefined,
    next: DomainTileState
  ): void {
    // Each slot's ownerId is independent of the tile's ownerId — a captured tile
    // can retain a previous owner's fort until the new owner razes/replaces it.
    // Track each slot separately by structure ownership, decrement only when the
    // slot changes occupant.
    const prevFortOwner = previous?.fort?.ownerId;
    const nextFortOwner = next.fort?.ownerId;
    if (prevFortOwner !== nextFortOwner) {
      if (prevFortOwner) this.adjustOwnedStructureCount(prevFortOwner, "FORT", -1);
      if (nextFortOwner) this.adjustOwnedStructureCount(nextFortOwner, "FORT", 1);
    }
    const prevObsOwner = previous?.observatory?.ownerId;
    const nextObsOwner = next.observatory?.ownerId;
    if (prevObsOwner !== nextObsOwner) {
      if (prevObsOwner) this.adjustOwnedStructureCount(prevObsOwner, "OBSERVATORY", -1);
      if (nextObsOwner) this.adjustOwnedStructureCount(nextObsOwner, "OBSERVATORY", 1);
    }
    const prevSiegeOwner = previous?.siegeOutpost?.ownerId;
    const nextSiegeOwner = next.siegeOutpost?.ownerId;
    if (prevSiegeOwner !== nextSiegeOwner) {
      if (prevSiegeOwner) this.adjustOwnedStructureCount(prevSiegeOwner, "SIEGE_OUTPOST", -1);
      if (nextSiegeOwner) this.adjustOwnedStructureCount(nextSiegeOwner, "SIEGE_OUTPOST", 1);
    }
    const prevEcoOwner = previous?.economicStructure?.ownerId;
    const prevEcoType = previous?.economicStructure?.type as BuildableStructureType | undefined;
    const nextEcoOwner = next.economicStructure?.ownerId;
    const nextEcoType = next.economicStructure?.type as BuildableStructureType | undefined;
    if (prevEcoOwner !== nextEcoOwner || prevEcoType !== nextEcoType) {
      if (prevEcoOwner && prevEcoType) this.adjustOwnedStructureCount(prevEcoOwner, prevEcoType, -1);
      if (nextEcoOwner && nextEcoType) this.adjustOwnedStructureCount(nextEcoOwner, nextEcoType, 1);
    }
  }

  private handleBuildFortCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseStructureTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    this.applyManpowerRegen(actor);

    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "UNKNOWN_TILE",
        message: "tile not found"
      });
      return;
    }
    if (!actor.techIds.has("masonry")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "unlock forts via Masonry first"
      });
      return;
    }
    if (target.terrain !== "LAND") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "fort requires land tile"
      });
      return;
    }
    if (target.ownerId !== command.playerId || target.ownershipState !== "SETTLED") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "fort tile must be settled and owned"
      });
      return;
    }
    if (!structureShowsOnTile("FORT", {
      ownershipState: target.ownershipState,
      resource: target.resource,
      dockId: target.dockId,
      townPopulationTier: target.town?.populationTier,
      supportedTownCount: 0,
      supportedDockCount: 0
    })) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "fort cannot be built on this tile"
      });
      return;
    }
    const upgradingWoodenFort =
      target.economicStructure?.ownerId === command.playerId &&
      target.economicStructure.type === "WOODEN_FORT" &&
      (target.economicStructure.status === "active" || target.economicStructure.status === "inactive");
    if (target.fort || target.observatory || target.siegeOutpost || (target.economicStructure && !upgradingWoodenFort)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "tile already has structure"
      });
      return;
    }
    if (this.rejectIfNoDevelopmentSlot(command, "BUILD_INVALID", "development slots are busy")) return;

    const fortGoldCostMult = multiplicativeEffectForPlayer(actor, "fortBuildGoldCostMult");
    const goldCost = Math.max(
      0,
      Math.round(structureBuildGoldCost("FORT", this.ownedStructureCountForPlayer(command.playerId, "FORT")) * fortGoldCostMult)
    );
    const manpowerCost = structureBuildManpowerCost("FORT");
    if (actor.points < goldCost) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "INSUFFICIENT_GOLD",
        message: "insufficient gold for fort"
      });
      return;
    }
    if (actor.manpower < manpowerCost) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "INSUFFICIENT_MANPOWER",
        message: `need ${manpowerCost.toFixed(0)} manpower to build fort`
      });
      return;
    }
    if (!this.spendStrategicResource(actor, "IRON", 45)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "insufficient IRON for fort"
      });
      return;
    }

    actor.points -= goldCost;
    actor.manpower = Math.max(0, actor.manpower - manpowerCost);
    // multiplicativeEffectForPlayer enforces value > 0 when multiplying, so the
    // result is always strictly positive (defaulting to 1 when no domain or
    // tech configures the key). Divide directly — no floor guard needed.
    const fortBuildSpeedMult = multiplicativeEffectForPlayer(actor, "fortBuildSpeedMult");
    const fortBuildDurationMs = Math.max(1, Math.round(structureBuildDurationMs("FORT") / fortBuildSpeedMult));
    const startedTile: DomainTileState = {
      ...target,
      fort: {
        ownerId: command.playerId,
        status: "under_construction",
        completesAt: this.now() + fortBuildDurationMs
      }
    };
    this.replaceTileState(targetKey, startedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(startedTile)]
    });
    this.emitPlayerStateUpdate(command);
    this.scheduleAfter(fortBuildDurationMs, () => {
      this.completeFortBuild(targetKey, command.playerId, command.commandId);
    });
  }

  private completeFortBuild(targetKey: string, ownerId: string, commandId: string): void {
    const latest = this.tiles.get(targetKey);
    if (!latest || latest.ownerId !== ownerId || !latest.fort || latest.fort.ownerId !== ownerId) return;
    if (latest.fort.status !== "under_construction") return;
    const { completesAt: _ignoredCompletesAt, ...activeFort } = latest.fort;
    const completedTile: DomainTileState = {
      ...latest,
      economicStructure: undefined,
      fort: { ...activeFort, status: "active" }
    };
    this.replaceTileState(targetKey, completedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId,
      playerId: ownerId,
      tileDeltas: [this.tileDeltaFromState(completedTile)]
    });
    this.emitPlayerStateUpdate({ commandId, playerId: ownerId });
  }

  private handleBuildObservatoryCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseStructureTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }

    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "UNKNOWN_TILE",
        message: "tile not found"
      });
      return;
    }
    if (!actor.techIds.has("cartography")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "unlock observatories via Cartography first"
      });
      return;
    }
    if (target.terrain !== "LAND") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "observatory requires land tile"
      });
      return;
    }
    if (target.ownerId !== command.playerId || target.ownershipState !== "SETTLED") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "observatory requires settled owned tile"
      });
      return;
    }
    if (!structureShowsOnTile("OBSERVATORY", {
      ownershipState: target.ownershipState,
      resource: target.resource,
      dockId: target.dockId,
      townPopulationTier: target.town?.populationTier,
      supportedTownCount: 0,
      supportedDockCount: 0
    })) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "observatory cannot be built on this tile"
      });
      return;
    }
    if (target.fort || target.observatory || target.siegeOutpost || target.economicStructure) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "tile already has structure"
      });
      return;
    }
    if (this.rejectIfNoDevelopmentSlot(command, "BUILD_INVALID", "development slots are busy")) return;

    const goldCost = structureBuildGoldCost("OBSERVATORY", this.ownedStructureCountForPlayer(command.playerId, "OBSERVATORY"));
    if (actor.points < goldCost) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "INSUFFICIENT_GOLD",
        message: "insufficient gold for observatory"
      });
      return;
    }
    if (!this.spendStrategicResource(actor, "CRYSTAL", 45)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "insufficient CRYSTAL for observatory"
      });
      return;
    }

    actor.points -= goldCost;
    const startedTile: DomainTileState = {
      ...target,
      observatory: {
        ownerId: command.playerId,
        status: "under_construction",
        completesAt: this.now() + structureBuildDurationMs("OBSERVATORY")
      }
    };
    this.replaceTileState(targetKey, startedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(startedTile)]
    });
    this.emitPlayerStateUpdate(command);
    this.scheduleAfter(structureBuildDurationMs("OBSERVATORY"), () => {
      this.completeObservatoryBuild(targetKey, command.playerId, command.commandId);
    });
  }

  private completeObservatoryBuild(targetKey: string, ownerId: string, commandId: string): void {
    const latest = this.tiles.get(targetKey);
    if (!latest || latest.ownerId !== ownerId || !latest.observatory || latest.observatory.ownerId !== ownerId) return;
    if (latest.observatory.status !== "under_construction") return;
    const { completesAt: _ignoredCompletesAt, ...activeObservatory } = latest.observatory;
    const completedTile: DomainTileState = {
      ...latest,
      observatory: { ...activeObservatory, status: "active" }
    };
    this.replaceTileState(targetKey, completedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId,
      playerId: ownerId,
      tileDeltas: [this.tileDeltaFromState(completedTile)]
    });
    this.emitPlayerStateUpdate({ commandId, playerId: ownerId });
  }

  private handleBuildSiegeOutpostCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseStructureTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    this.applyManpowerRegen(actor);

    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "UNKNOWN_TILE",
        message: "tile not found"
      });
      return;
    }
    if (!actor.techIds.has("leatherworking")) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "unlock siege outposts via Leatherworking first"
      });
      return;
    }
    if (target.terrain !== "LAND") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "siege outpost requires land tile"
      });
      return;
    }
    if (target.ownerId !== command.playerId) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "siege outpost tile must be owned"
      });
      return;
    }
    if (
      !structureShowsOnTile("SIEGE_OUTPOST", {
        ownershipState: target.ownershipState,
        resource: target.resource,
        dockId: target.dockId,
        townPopulationTier: target.town?.populationTier,
        supportedTownCount: this.supportedTownKeysForTile(command.playerId, target.x, target.y).length,
        supportedDockCount: this.supportedDockKeysForTile(command.playerId, target.x, target.y).length
      })
    ) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "siege outpost cannot be built on this tile"
      });
      return;
    }
    const upgradingLightOutpost =
      target.economicStructure?.ownerId === command.playerId &&
      target.economicStructure.type === "LIGHT_OUTPOST" &&
      (target.economicStructure.status === "active" || target.economicStructure.status === "inactive");
    if (target.siegeOutpost || target.fort || target.observatory || (target.economicStructure && !upgradingLightOutpost)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "tile already has structure"
      });
      return;
    }
    if (this.rejectIfNoDevelopmentSlot(command, "BUILD_INVALID", "development slots are busy")) return;

    const goldCost = structureBuildGoldCost("SIEGE_OUTPOST", this.ownedStructureCountForPlayer(command.playerId, "SIEGE_OUTPOST"));
    const manpowerCost = structureBuildManpowerCost("SIEGE_OUTPOST");
    if (actor.points < goldCost) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "INSUFFICIENT_GOLD",
        message: "insufficient gold for siege outpost"
      });
      return;
    }
    if (actor.manpower < manpowerCost) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "INSUFFICIENT_MANPOWER",
        message: `need ${manpowerCost.toFixed(0)} manpower to build siege outpost`
      });
      return;
    }
    if (!this.spendStrategicResource(actor, "SUPPLY", 45)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "insufficient SUPPLY for siege outpost"
      });
      return;
    }

    actor.points -= goldCost;
    actor.manpower = Math.max(0, actor.manpower - manpowerCost);
    // See fort-build path for the divide-without-guard rationale: the helper
    // already filters out zero/negative effect values before multiplying.
    const outpostDeploymentSpeedMult = multiplicativeEffectForPlayer(actor, "outpostDeploymentSpeedMult");
    const siegeOutpostBuildDurationMs = Math.max(
      1,
      Math.round(structureBuildDurationMs("SIEGE_OUTPOST") / outpostDeploymentSpeedMult)
    );
    const startedTile: DomainTileState = {
      ...target,
      ...(upgradingLightOutpost ? { economicStructure: undefined } : {}),
      siegeOutpost: {
        ownerId: command.playerId,
        status: "under_construction",
        completesAt: this.now() + siegeOutpostBuildDurationMs
      }
    };
    this.replaceTileState(targetKey, startedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(startedTile)]
    });
    this.emitPlayerStateUpdate(command);
    this.scheduleAfter(siegeOutpostBuildDurationMs, () => {
      this.completeSiegeOutpostBuild(targetKey, command.playerId, command.commandId);
    });
  }

  private completeSiegeOutpostBuild(targetKey: string, ownerId: string, commandId: string): void {
    const latest = this.tiles.get(targetKey);
    if (!latest || latest.ownerId !== ownerId || !latest.siegeOutpost || latest.siegeOutpost.ownerId !== ownerId) return;
    if (latest.siegeOutpost.status !== "under_construction") return;
    const { completesAt: _ignoredCompletesAt, ...activeSiegeOutpost } = latest.siegeOutpost;
    const completedTile: DomainTileState = {
      ...latest,
      siegeOutpost: { ...activeSiegeOutpost, status: "active", sweepBudget: SWEEP_BUDGET_CAP, sweepActive: false, sweepBudgetUpdatedAt: this.now() }
    };
    this.replaceTileState(targetKey, completedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId,
      playerId: ownerId,
      tileDeltas: [this.tileDeltaFromState(completedTile)]
    });
    this.emitPlayerStateUpdate({ commandId, playerId: ownerId });
  }

  private cancelActiveOutpostAttackLocks(playerId: string, originKey: string): string[] {
    const cancelled: string[] = [];
    const lock = this.locksByTile.get(originKey);
    if (!lock || lock.playerId !== playerId || lock.actionType !== "ATTACK") return cancelled;
    this.locksByTile.delete(lock.originKey);
    this.locksByTile.delete(lock.targetKey);
    cancelled.push(lock.commandId);
    return cancelled;
  }

  private handleSetSiegeOutpostSweepCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseSiegeOutpostSweepPayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    // Accept either an active siege outpost OR an active LIGHT_OUTPOST.
    const hasSiegeOutpost =
      target?.ownerId === command.playerId &&
      target.siegeOutpost?.ownerId === command.playerId &&
      target.siegeOutpost.status === "active";
    const hasLightOutpost =
      target?.ownerId === command.playerId &&
      target.economicStructure?.ownerId === command.playerId &&
      target.economicStructure.type === "LIGHT_OUTPOST" &&
      target.economicStructure.status === "active";
    if (!target || (!hasSiegeOutpost && !hasLightOutpost)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "active owned outpost-family structure required"
      });
      return;
    }
    let updatedTile: DomainTileState;
    if (hasSiegeOutpost) {
      updatedTile = {
        ...target,
        siegeOutpost: {
          ...target.siegeOutpost!,
          sweepActive: payload.enabled
        }
      };
    } else {
      updatedTile = {
        ...target,
        economicStructure: {
          ...target.economicStructure!,
          sweepActive: payload.enabled
        }
      };
    }
    this.replaceTileState(targetKey, updatedTile, command.commandId);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
    this.emitPlayerStateUpdate(command);
  }

  private handleBuildEconomicStructureCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseEconomicStructurePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    this.applyManpowerRegen(actor);

    let target = this.tiles.get(simulationTileKey(payload.x, payload.y));
    if (!target) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "UNKNOWN_TILE",
        message: "tile not found"
      });
      return;
    }

    const requiredTechId = TECH_REQUIREMENTS_BY_STRUCTURE[payload.structureType];
    if (requiredTechId && !actor.techIds.has(requiredTechId)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: `unlock ${payload.structureType.toLowerCase().replaceAll("_", " ")} first`
      });
      return;
    }

    if (structurePlacementMetadata(payload.structureType).placementMode === "town_support" && target.town) {
      if (target.town.populationTier === "SETTLEMENT") {
        this.emitEvent({
          eventType: "COMMAND_REJECTED",
          commandId: command.commandId,
          playerId: command.playerId,
          code: "BUILD_INVALID",
          message: "settlements cannot support economic structures — grow this town first"
        });
        return;
      }
      const supportTarget = this.firstAvailableTownSupportTile(command.playerId, simulationTileKey(target.x, target.y), payload.structureType);
      if (!supportTarget) {
        this.emitEvent({
          eventType: "COMMAND_REJECTED",
          commandId: command.commandId,
          playerId: command.playerId,
          code: "BUILD_INVALID",
          message: `${payload.structureType.toLowerCase().replaceAll("_", " ")} needs an open support tile next to this town`
        });
        return;
      }
      if (this.economicStructureForSupportedTown(command.playerId, simulationTileKey(target.x, target.y), payload.structureType)) {
        this.emitEvent({
          eventType: "COMMAND_REJECTED",
          commandId: command.commandId,
          playerId: command.playerId,
          code: "BUILD_INVALID",
          message: `town already has ${payload.structureType.toLowerCase().replaceAll("_", " ")}`
        });
        return;
      }
      target = supportTarget;
    }

    if (target.terrain !== "LAND") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "structure requires land tile"
      });
      return;
    }
    if (target.ownerId !== command.playerId || target.ownershipState !== "SETTLED") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "structure requires settled owned tile"
      });
      return;
    }

    const targetKey = simulationTileKey(target.x, target.y);
    const upgradeBaseType = upgradeBaseTypeForEconomicStructure(payload.structureType);
    const upgradingBaseEconomic =
      upgradeBaseType &&
      target.economicStructure?.ownerId === command.playerId &&
      target.economicStructure.type === upgradeBaseType &&
      (target.economicStructure.status === "active" || target.economicStructure.status === "inactive");
    if (
      !structureShowsOnTile(payload.structureType, {
        ownershipState: target.ownershipState,
        resource: target.resource,
        dockId: target.dockId,
        townPopulationTier: target.town?.populationTier,
        supportedTownCount: this.supportedTownKeysForTile(command.playerId, target.x, target.y).length,
        supportedDockCount: this.supportedDockKeysForTile(command.playerId, target.x, target.y).length
      })
    ) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: `${payload.structureType.toLowerCase().replaceAll("_", " ")} cannot be built on this tile`
      });
      return;
    }
    if (target.fort || target.observatory || target.siegeOutpost || (target.economicStructure && !upgradingBaseEconomic)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: "tile already has structure"
      });
      return;
    }
    if (this.rejectIfNoDevelopmentSlot(command, "BUILD_INVALID", "development slots are busy")) return;

    const goldCost = structureBuildGoldCost(payload.structureType, this.ownedStructureCountForPlayer(command.playerId, payload.structureType));
    const manpowerCost = structureBuildManpowerCost(payload.structureType);
    if (actor.points < goldCost) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "INSUFFICIENT_GOLD",
        message: `insufficient gold for ${payload.structureType.toLowerCase().replaceAll("_", " ")}`
      });
      return;
    }
    if (actor.manpower < manpowerCost) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "INSUFFICIENT_MANPOWER",
        message: `need ${manpowerCost.toFixed(0)} manpower for ${payload.structureType.toLowerCase().replaceAll("_", " ")}`
      });
      return;
    }
    const resourceCost = structureCostDefinition(payload.structureType).resourceCost;
    if (resourceCost && !this.spendStrategicResource(actor, resourceCost.resource, resourceCost.amount)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BUILD_INVALID",
        message: `insufficient ${resourceCost.resource} for ${payload.structureType.toLowerCase().replaceAll("_", " ")}`
      });
      return;
    }

    actor.points -= goldCost;
    actor.manpower = Math.max(0, actor.manpower - manpowerCost);
    const startedTile: DomainTileState = {
      ...target,
      ...(upgradingBaseEconomic ? { economicStructure: undefined } : {}),
      economicStructure: {
        ownerId: command.playerId,
        type: payload.structureType,
        status: "under_construction",
        completesAt: this.now() + structureBuildDurationMs(payload.structureType)
      }
    };
    this.replaceTileState(targetKey, startedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(startedTile)]
    });
    this.emitPlayerStateUpdate(command);
    this.scheduleAfter(structureBuildDurationMs(payload.structureType), () => {
      this.completeEconomicStructureBuild(targetKey, command.playerId, payload.structureType, command.commandId);
    });
  }

  private completeEconomicStructureBuild(
    targetKey: string,
    ownerId: string,
    expectedType: EconomicStructureType,
    commandId: string
  ): void {
    const latest = this.tiles.get(targetKey);
    if (
      !latest ||
      latest.ownerId !== ownerId ||
      !latest.economicStructure ||
      latest.economicStructure.ownerId !== ownerId ||
      latest.economicStructure.type !== expectedType
    ) {
      return;
    }
    if (latest.economicStructure.status !== "under_construction") return;
    const { completesAt: _ignoredCompletesAt, ...activeStructure } = latest.economicStructure;
    const sweepInit = expectedType === "LIGHT_OUTPOST"
      ? { sweepBudget: SWEEP_BUDGET_CAP, sweepActive: false as const, sweepBudgetUpdatedAt: this.now() }
      : {};
    const completedTile: DomainTileState = {
      ...latest,
      economicStructure: { ...activeStructure, status: "active", ...sweepInit }
    };
    this.replaceTileState(targetKey, completedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId,
      playerId: ownerId,
      tileDeltas: [this.tileDeltaFromState(completedTile)]
    });
    this.emitPlayerStateUpdate({ commandId, playerId: ownerId });
  }

  private handleCancelFortBuildCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseStructureTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }
    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target?.fort || target.fort.ownerId !== command.playerId || target.fort.status !== "under_construction") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "FORT_CANCEL_INVALID",
        message: "no fort under construction on tile"
      });
      return;
    }

    const updatedTile: DomainTileState = { ...target, fort: undefined };
    this.replaceTileState(targetKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
  }

  private handleCancelStructureBuildCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseStructureTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }

    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "STRUCTURE_CANCEL_INVALID",
        message: "no removable structure action on tile"
      });
      return;
    }

    let updatedTile: DomainTileState | undefined;
    if (target.fort?.ownerId === command.playerId && (target.fort.status === "under_construction" || target.fort.status === "removing")) {
      updatedTile = {
        ...target,
        fort:
          target.fort.status === "under_construction"
            ? undefined
            : {
                ...target.fort,
                status: target.fort.previousStatus ?? "active",
                previousStatus: undefined,
                completesAt: undefined
              }
      };
    } else if (
      target.observatory?.ownerId === command.playerId &&
      (target.observatory.status === "under_construction" || target.observatory.status === "removing")
    ) {
      updatedTile = {
        ...target,
        observatory:
          target.observatory.status === "under_construction"
            ? undefined
            : {
                ...target.observatory,
                status: target.observatory.previousStatus ?? "active",
                previousStatus: undefined,
                completesAt: undefined
              }
      };
    } else if (
      target.siegeOutpost?.ownerId === command.playerId &&
      (target.siegeOutpost.status === "under_construction" || target.siegeOutpost.status === "removing")
    ) {
      updatedTile = {
        ...target,
        siegeOutpost:
          target.siegeOutpost.status === "under_construction"
            ? undefined
            : {
                ...target.siegeOutpost,
                status: target.siegeOutpost.previousStatus ?? "active",
                previousStatus: undefined,
                completesAt: undefined
              }
      };
    } else if (
      target.economicStructure?.ownerId === command.playerId &&
      (target.economicStructure.status === "under_construction" || target.economicStructure.status === "removing")
    ) {
      updatedTile = {
        ...target,
        economicStructure:
          target.economicStructure.status === "under_construction"
            ? undefined
            : {
                ...target.economicStructure,
                status: target.economicStructure.previousStatus ?? "inactive",
                previousStatus: undefined,
                completesAt: undefined
              }
      };
    }

    if (!updatedTile) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "STRUCTURE_CANCEL_INVALID",
        message: "no removable structure action on tile"
      });
      return;
    }

    this.replaceTileState(targetKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
  }

  private handleRemoveStructureCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseStructureTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }

    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target || target.terrain !== "LAND" || target.ownerId !== command.playerId || target.ownershipState !== "SETTLED") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "STRUCTURE_REMOVE_INVALID",
        message: "structure requires settled owned tile"
      });
      return;
    }

    const fort = target.fort?.ownerId === command.playerId ? target.fort : undefined;
    const observatory = target.observatory?.ownerId === command.playerId ? target.observatory : undefined;
    const siegeOutpost = target.siegeOutpost?.ownerId === command.playerId ? target.siegeOutpost : undefined;
    const economicStructure = target.economicStructure?.ownerId === command.playerId ? target.economicStructure : undefined;
    const ownedStructure = fort ?? observatory ?? siegeOutpost ?? economicStructure;

    if (!ownedStructure) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "STRUCTURE_REMOVE_INVALID",
        message: "no owned structure on tile"
      });
      return;
    }
    if (ownedStructure.status === "under_construction") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "STRUCTURE_REMOVE_INVALID",
        message: "cancel construction instead"
      });
      return;
    }
    if (ownedStructure.status === "removing") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "STRUCTURE_REMOVE_INVALID",
        message: "structure is already being removed"
      });
      return;
    }
    if (this.rejectIfNoDevelopmentSlot(command, "STRUCTURE_REMOVE_INVALID", "development slots are busy")) return;

    let updatedTile: DomainTileState;
    let removeDurationMs: number;
    if (fort) {
      removeDurationMs = structureBuildDurationMs("FORT");
      updatedTile = {
        ...target,
        fort: {
          ...fort,
          status: "removing",
          previousStatus: "active",
          completesAt: this.now() + removeDurationMs
        }
      };
    } else if (observatory) {
      removeDurationMs = structureBuildDurationMs("OBSERVATORY");
      updatedTile = {
        ...target,
        observatory: {
          ...observatory,
          status: "removing",
          previousStatus: observatory.status === "inactive" ? "inactive" : "active",
          completesAt: this.now() + removeDurationMs
        }
      };
    } else if (siegeOutpost) {
      removeDurationMs = structureBuildDurationMs("SIEGE_OUTPOST");
      updatedTile = {
        ...target,
        siegeOutpost: {
          ...siegeOutpost,
          status: "removing",
          previousStatus: "active",
          completesAt: this.now() + removeDurationMs
        }
      };
    } else {
      const structure = economicStructure as NonNullable<typeof economicStructure>;
      removeDurationMs = structureBuildDurationMs(structure.type);
      updatedTile = {
        ...target,
        economicStructure: {
          ...structure,
          status: "removing",
          previousStatus: structure.status === "inactive" ? "inactive" : "active",
          completesAt: this.now() + removeDurationMs
        }
      };
    }

    this.replaceTileState(targetKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
    this.emitPlayerStateUpdate(command);

    this.scheduleAfter(removeDurationMs, () => {
      this.completeStructureRemoval(targetKey, command.playerId, command.commandId);
    });
  }

  private completeStructureRemoval(targetKey: string, ownerId: string, commandId: string): void {
    const latest = this.tiles.get(targetKey);
    if (!latest || latest.ownerId !== ownerId) return;

    let completedTile: DomainTileState | undefined;
    if (latest.fort?.ownerId === ownerId && latest.fort.status === "removing") {
      completedTile = { ...latest, fort: undefined };
    } else if (latest.observatory?.ownerId === ownerId && latest.observatory.status === "removing") {
      completedTile = { ...latest, observatory: undefined };
    } else if (latest.siegeOutpost?.ownerId === ownerId && latest.siegeOutpost.status === "removing") {
      completedTile = { ...latest, siegeOutpost: undefined };
    } else if (latest.economicStructure?.ownerId === ownerId && latest.economicStructure.status === "removing") {
      completedTile = { ...latest, economicStructure: undefined };
    }
    if (!completedTile) return;

    this.replaceTileState(targetKey, completedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId,
      playerId: ownerId,
      tileDeltas: [this.tileDeltaFromState(completedTile)]
    });
    this.emitPlayerStateUpdate({ commandId, playerId: ownerId });
  }

  private handleCancelSiegeOutpostBuildCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    const payload = parseStructureTilePayload(command.payloadJson);
    if (!actor || !payload) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }

    const targetKey = simulationTileKey(payload.x, payload.y);
    const target = this.tiles.get(targetKey);
    if (!target?.siegeOutpost || target.siegeOutpost.ownerId !== command.playerId || target.siegeOutpost.status !== "under_construction") {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "SIEGE_OUTPOST_CANCEL_INVALID",
        message: "no siege outpost under construction on tile"
      });
      return;
    }

    const updatedTile: DomainTileState = { ...target, siegeOutpost: undefined };
    this.replaceTileState(targetKey, updatedTile);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: [this.tileDeltaFromState(updatedTile)]
    });
    this.emitPlayerStateUpdate(command);
  }

  // Player-ids with at least one *player-issued* frontier lock — i.e. locks
  // that should gate the AI strategic planner. Passive defensive fire from
  // forts and siege/light outposts (sweep) also creates playerId-scoped
  // combat locks via `handleFrontierCommand` from territory-automation; those
  // carry `source: "automation"` and are filtered out here so they don't
  // starve the planner with a perpetual `active_lock` noop (territory-
  // automation re-locks every ~3 s as long as a valid target stays in range).
  private plannerGatingLockPlayerIds(): Set<string> {
    const lockPlayerIds = new Set<string>();
    for (const lock of this.locksByTile.values()) {
      if (lock.source === "automation") continue;
      lockPlayerIds.add(lock.playerId);
    }
    return lockPlayerIds;
  }

  private activeFrontierLocksForPlayer(playerId: string): LockRecord[] {
    const locks = new Map<string, LockRecord>();
    for (const lock of this.locksByTile.values()) {
      if (lock.playerId !== playerId) continue;
      if (lock.actionType !== "EXPAND" && lock.actionType !== "ATTACK") continue;
      locks.set(lock.commandId, lock);
    }
    return [...locks.values()].sort((left, right) => left.commandId.localeCompare(right.commandId));
  }

  private handleCancelCaptureCommand(command: CommandEnvelope): void {
    const actor = this.players.get(command.playerId);
    if (!actor) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "BAD_COMMAND",
        message: "invalid command payload"
      });
      return;
    }

    const activeLocks = this.activeFrontierLocksForPlayer(command.playerId);
    if (activeLocks.length === 0) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "NO_ACTIVE_CAPTURE",
        message: "no active capture to cancel"
      });
      return;
    }

    for (const lock of activeLocks) {
      this.locksByTile.delete(lock.originKey);
      this.locksByTile.delete(lock.targetKey);
    }

    this.emitEvent({
      eventType: "COMBAT_CANCELLED",
      commandId: command.commandId,
      playerId: command.playerId,
      count: activeLocks.length,
      cancelledCommandIds: activeLocks.map((lock) => lock.commandId)
    });
    this.emitPlayerStateUpdate(command);
  }

  private visibleRadiusForPlayer(playerId: string): number {
    const player = this.players.get(playerId);
    return player ? effectiveVisionRadiusForPlayer(player) : 1;
  }

  private buildCaptureRevealTileDeltas(playerId: string, centerX: number, centerY: number): Array<ReturnType<SimulationRuntime["tileDeltaFromState"]>> {
    const radius = this.visibleRadiusForPlayer(playerId);
    const deltas = new Map<string, ReturnType<SimulationRuntime["tileDeltaFromState"]>>();
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const tile = this.tiles.get(simulationTileKey(centerX + dx, centerY + dy));
        if (!tile) continue;
        deltas.set(simulationTileKey(tile.x, tile.y), this.tileDeltaFromState(tile));
      }
    }
    return [...deltas.values()].sort((left, right) => (left.x - right.x) || (left.y - right.y));
  }

  private originTileHeldByActiveFort(playerId: string, originKey: string): boolean {
    const origin = this.tiles.get(originKey);
    if (!origin || origin.terrain !== "LAND" || origin.ownerId !== playerId) return false;
    const activeFort =
      origin.fort?.ownerId === playerId &&
      origin.fort.status === "active" &&
      (origin.fort.disabledUntil ?? 0) <= this.now();
    const activeWoodenFort =
      origin.economicStructure?.ownerId === playerId &&
      origin.economicStructure.type === "WOODEN_FORT" &&
      origin.economicStructure.status === "active";
    return activeFort || activeWoodenFort;
  }

  private attackerOutpostMult(playerId: string, targetX: number, targetY: number): number {
    // Gather the player's active outposts from their territory (O(territory) one-time,
    // but iterates a much smaller set than 121 grid tiles when outpost count is low).
    // TODO(perf): maintain a per-player outpost index to make this O(outposts).
    const summary = this.summaryForPlayer(playerId);
    const outposts: OutpostPosition[] = [];
    for (const tileKey of summary.territoryTileKeys) {
      const tile = this.tiles.get(tileKey);
      if (!tile) continue;
      if (
        tile.siegeOutpost?.ownerId === playerId &&
        tile.siegeOutpost.status === "active"
      ) {
        outposts.push({ x: tile.x, y: tile.y, variant: tile.siegeOutpost.variant ?? "SIEGE_OUTPOST" });
      } else if (
        tile.economicStructure?.ownerId === playerId &&
        tile.economicStructure.type === "LIGHT_OUTPOST" &&
        tile.economicStructure.status === "active"
      ) {
        outposts.push({ x: tile.x, y: tile.y, variant: "LIGHT_OUTPOST" });
      }
    }
    return targetOutpostMult(outposts, targetX, targetY);
  }

  private buildLockedCombatResolution(lock: Pick<LockRecord, "actionType" | "commandId" | "playerId" | "manpowerCost" | "originKey" | "originX" | "originY" | "targetX" | "targetY" | "targetKey">): LockedCombatResolution | undefined {
    const previousTarget = this.tiles.get(lock.targetKey);
    const attackerOutpostMult = this.attackerOutpostMult(lock.playerId, lock.targetX, lock.targetY);
    const attacker = this.players.get(lock.playerId);
    const defenderOwnerId = previousTarget?.ownerId;
    const defender = defenderOwnerId ? this.players.get(defenderOwnerId) : undefined;
    const targetHasActiveFort =
      Boolean(
        previousTarget?.fort &&
        previousTarget.fort.status === "active" &&
        previousTarget.fort.ownerId === defenderOwnerId
      );
    const combatModifiers = {
      attackerOutpostMult,
      attackVsSettledMult: attacker ? multiplicativeEffectForPlayer(attacker, "attackVsSettledMult") : 1,
      attackVsFortsMult: attacker ? multiplicativeEffectForPlayer(attacker, "attackVsFortsMult") : 1,
      fortDefenseMult: defender ? multiplicativeEffectForPlayer(defender, "fortDefenseMult") : 1
    };
    const targetForCombat: Parameters<typeof rollFrontierCombat>[0] = previousTarget
      ? {
          terrain: previousTarget.terrain,
          ownershipState: previousTarget.ownershipState,
          dockId: previousTarget.dockId,
          townType: previousTarget.town?.type,
          hasFort: targetHasActiveFort
        }
      : { terrain: "LAND" };
    const combat =
      lock.actionType === "EXPAND"
        ? {
            ...rollFrontierCombat(targetForCombat, lock.actionType, undefined, combatModifiers),
            attackerWon: true
          }
        : rollFrontierCombat(targetForCombat, lock.actionType, undefined, combatModifiers);
    const targetWasSettled = previousTarget?.ownershipState === "SETTLED";
    const defenderTileCountBeforeCapture = defenderOwnerId ? Math.max(1, this.summaryForPlayer(defenderOwnerId).settledTileCount) : 0;
    const plunder =
      combat.attackerWon && defender && targetWasSettled
        ? this.previewSettledCapturePlunder({ defender, defenderTileCountBeforeCapture, target: previousTarget })
        : undefined;
    const manpowerDelta =
      lock.actionType === "ATTACK"
        ? -this.attackManpowerLoss(lock.manpowerCost, combat.attackerWon, combat.atkEff, combat.defEff)
        : 0;
    const originHeldByFort = this.originTileHeldByActiveFort(lock.playerId, lock.originKey);
    const result: LockedFrontierCombatResult = {
      attackType: lock.actionType,
      attackerWon: combat.attackerWon,
      ...(combat.attackerWon ? { winnerId: lock.playerId } : defenderOwnerId ? { winnerId: defenderOwnerId } : {}),
      ...(defenderOwnerId ? { defenderOwnerId } : {}),
      origin: { x: lock.originX, y: lock.originY },
      target: { x: lock.targetX, y: lock.targetY },
      changes:
        combat.attackerWon
          ? [{ x: lock.targetX, y: lock.targetY, ownerId: lock.playerId, ownershipState: lock.playerId === "barbarian-1" ? "SETTLED" : "FRONTIER" }]
          : defenderOwnerId && !originHeldByFort
            ? [{ x: lock.originX, y: lock.originY, ownerId: defenderOwnerId, ownershipState: "FRONTIER" }]
            : [],
      pointsDelta: 0,
      manpowerDelta,
      pillagedGold: plunder?.gold ?? 0,
      pillagedShare: plunder?.share ?? 0,
      pillagedStrategic: plunder?.strategic ?? {},
      atkEff: combat.atkEff,
      defEff: combat.defEff,
      winChance: combat.winChance,
      levelDelta: 0
    };
    return {
      result,
      defenderGoldLoss: plunder?.defenderGoldLoss ?? 0
    };
  }

  private resolveLock(lock: LockRecord): void {
    const originLock = this.locksByTile.get(lock.originKey);
    const targetLock = this.locksByTile.get(lock.targetKey);
    const originMatches = originLock?.commandId === lock.commandId;
    const targetMatches = targetLock?.commandId === lock.commandId;
    // Always clean up keys still pointing at THIS lock — even if the other
    // side was superseded by a later command's overwrite. Skipping the
    // delete on partial mismatch is what stranded ai-3 for 18h in prod:
    // the surviving key kept playerId in the planner's active-lock set.
    if (originMatches) this.locksByTile.delete(lock.originKey);
    if (targetMatches) this.locksByTile.delete(lock.targetKey);
    // Partial / no match means a later command already replaced this lock's
    // slot on at least one tile — that command will (or did) emit its own
    // COMBAT_RESOLVED. Don't double-emit or re-apply tile state.
    if (!originMatches || !targetMatches) return;
    const previousTarget = this.tiles.get(lock.targetKey);
    const previousOwnerId = previousTarget?.ownerId;
    const targetWasSettled = previousTarget?.ownershipState === "SETTLED";
    const combatResolution = lock.combatResolution ?? this.buildLockedCombatResolution(lock);
    const combatResult = combatResolution?.result;
    const attacker = this.players.get(lock.playerId);
    const defender = previousOwnerId ? this.players.get(previousOwnerId) : undefined;
    const attackerWon = combatResult?.attackerWon ?? false;
    const originLost = Boolean(combatResult?.changes.some((change) => change.x === lock.originX && change.y === lock.originY));
    if (attacker && (lock.actionType === "EXPAND" || lock.actionType === "ATTACK")) {
      attacker.points = Math.max(0, attacker.points - FRONTIER_CLAIM_COST);
    }
    this.emitEvent({
      eventType: "COMBAT_RESOLVED",
      commandId: lock.commandId,
      playerId: lock.playerId,
      actionType: lock.actionType,
      originX: lock.originX,
      originY: lock.originY,
      targetX: lock.targetX,
      targetY: lock.targetY,
      attackerWon,
      ...(typeof combatResult?.manpowerDelta === "number" && combatResult.manpowerDelta < -0.01 ? { manpowerDelta: combatResult.manpowerDelta } : {}),
      ...(typeof combatResult?.pillagedGold === "number" && combatResult.pillagedGold > 0.01 ? { pillagedGold: combatResult.pillagedGold } : {}),
      ...(combatResult?.pillagedStrategic && Object.keys(combatResult.pillagedStrategic).length > 0 ? { pillagedStrategic: combatResult.pillagedStrategic } : {}),
      ...(combatResult ? { combatResult } : {})
    });
    if (attacker && typeof combatResult?.manpowerDelta === "number") this.applyLockedManpowerDelta(attacker, combatResult.manpowerDelta);
    if (attackerWon && attacker && defender && targetWasSettled && combatResolution) {
      this.applySettledCapturePlunder({
        attacker,
        defender,
        gold: combatResolution.result.pillagedGold,
        defenderGoldLoss: combatResolution.defenderGoldLoss
      });
    }
    // When the captured town is a SETTLEMENT (the previous owner's home), it evacuates:
    // the town disappears from the captured tile and is re-rooted on one of the previous
    // owner's remaining SETTLED tiles. If they have no remaining territory, the existing
    // respawnIfEliminated() call below places a fresh settlement on unowned land.
    let settlementCaptureRelocationPopulation: number | undefined;
    if (attackerWon) {
      // Population shock: only when capturing a town from another player (skip neutral / unowned).
      let capturedTown = previousTarget?.town;
      const isSettlementCapture =
        !!capturedTown
        && capturedTown.populationTier === "SETTLEMENT"
        && !!previousOwnerId
        && previousOwnerId !== lock.playerId;
      if (capturedTown && previousOwnerId && previousOwnerId !== lock.playerId) {
        const popBefore = typeof capturedTown.population === "number" ? capturedTown.population : SYNTHETIC_SETTLEMENT_POPULATION;
        const popAfter = Math.max(1, popBefore * TOWN_CAPTURE_POPULATION_LOSS_MULT);
        const captureShockUntil = this.now() + TOWN_CAPTURE_SHOCK_MS;
        if (isSettlementCapture) {
          // Evacuate: strip the town entirely from the captured tile; we'll relocate it below.
          settlementCaptureRelocationPopulation = popAfter;
          capturedTown = undefined;
        } else {
          capturedTown = { ...capturedTown, population: popAfter, populationBeforeCapture: popBefore, captureShockUntil };
        }
      }
      const resolvedTarget: DomainTileState = {
        x: lock.targetX,
        y: lock.targetY,
        terrain: previousTarget?.terrain ?? "LAND",
        ...(previousTarget?.resource ? { resource: previousTarget.resource } : {}),
        ...(previousTarget?.dockId ? { dockId: previousTarget.dockId } : {}),
        ...(capturedTown ? { town: capturedTown } : {}),
        ...capturedStructureFields(previousTarget, lock.playerId),
        ownerId: lock.playerId,
        // Barbarians have no settlement loop and would otherwise sit on
        // permanent FRONTIER tiles — fragile to retake and rendered with
        // frontier opacity so the skull overlay reads as washed-out.
        ownershipState: lock.playerId === "barbarian-1" ? "SETTLED" : "FRONTIER"
      };
      this.replaceTileState(lock.targetKey, resolvedTarget, lock.commandId);
      if (resolvedTarget.ownershipState === "FRONTIER") {
        this.extendFortPatrolGrace(lock.targetKey, this.now() + FORT_PATROL_GRACE_MS);
      } else {
        this.fortPatrolGraceUntilByTile.delete(lock.targetKey);
      }
      let tileDeltas: ReturnType<SimulationRuntime["tileDeltaFromState"]>[];
      if (attacker?.isAi) {
        tileDeltas = [this.tileDeltaFromState(resolvedTarget)];
      } else {
        const measure = Boolean(this.onCaptureRevealBuilt);
        const startedAt = measure ? this.now() : 0;
        tileDeltas = this.buildCaptureRevealTileDeltas(lock.playerId, lock.targetX, lock.targetY);
        if (measure) {
          this.onCaptureRevealBuilt?.({
            commandId: lock.commandId,
            playerId: lock.playerId,
            tileCount: tileDeltas.length,
            durationMs: Math.max(0, this.now() - startedAt)
          });
        }
      }
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: lock.commandId,
        playerId: lock.playerId,
        tileDeltas
      });
      if (lock.playerId === "barbarian-1") {
        this.applyBarbarianWalkOrMultiply(lock, previousTarget);
      } else if (previousTarget?.ownerId === "barbarian-1") {
        this.barbarianTileProgress.delete(lock.targetKey);
      }
    } else if (originLost && previousOwnerId) {
      const previousOrigin = this.tiles.get(lock.originKey);
      if (previousOrigin) {
        // Town is a worldgen entity tied to the tile — mirror the attacker-wins branch (~6008) which preserves it.
        const resolvedOrigin: DomainTileState = {
          ...previousOrigin,
          ownerId: previousOwnerId,
          ownershipState: "FRONTIER",
          ...capturedStructureFields(previousOrigin, previousOwnerId)
        };
        this.replaceTileState(lock.originKey, resolvedOrigin, lock.commandId);
        this.extendFortPatrolGrace(lock.originKey, this.now() + FORT_PATROL_GRACE_MS);
        const tileDeltas = [this.tileDeltaFromState(resolvedOrigin)];

        // Successful barb counter-attack: barb JUMPS from defender tile to the
        // attacker's origin instead of growing its population. The defender
        // tile releases to neutral so total barb tile count is unchanged.
        // Without this, every failed player attack against a barb grows
        // barbarian-1 by one tile (and spreads them across the map).
        if (previousOwnerId === "barbarian-1") {
          const defenderTile = this.tiles.get(lock.targetKey);
          if (defenderTile?.ownerId === "barbarian-1" && !this.locksByTile.has(lock.targetKey)) {
            const releasedDefender: DomainTileState = {
              x: defenderTile.x,
              y: defenderTile.y,
              terrain: defenderTile.terrain,
              ...(defenderTile.resource ? { resource: defenderTile.resource } : {}),
              ...(defenderTile.dockId ? { dockId: defenderTile.dockId } : {})
            };
            this.replaceTileState(lock.targetKey, releasedDefender, lock.commandId);
            this.barbarianTileProgress.delete(lock.targetKey);
            tileDeltas.push(this.tileDeltaFromState(releasedDefender));
          }
        }

        this.emitEvent({
          eventType: "TILE_DELTA_BATCH",
          commandId: lock.commandId,
          playerId: lock.playerId,
          tileDeltas
        });
      }
    }
    // Encirclement: re-check connectivity for players affected by ownership
    // changes from ATTACK or EXPAND.
    // ATTACK can sever connections (enemy takes a tile out of a supply chain).
    // EXPAND can reconnect previously cut-off regions (new frontier tile bridges
    // a pocket back to settled supply), so we run the check for EXPAND too.
    if (lock.actionType === "ATTACK") {
      const encirclementChangedKeys: string[] = [];
      if (attackerWon) encirclementChangedKeys.push(lock.targetKey);
      if (originLost) encirclementChangedKeys.push(lock.originKey);
      if (encirclementChangedKeys.length > 0) {
        const affectedPlayerIds = new Set<string>();
        if (attackerWon && previousOwnerId) affectedPlayerIds.add(previousOwnerId);
        if (attackerWon) affectedPlayerIds.add(lock.playerId);
        if (originLost) affectedPlayerIds.add(lock.playerId);
        if (originLost && previousOwnerId) affectedPlayerIds.add(previousOwnerId);
        for (const pid of affectedPlayerIds) {
          this.applyEncirclement(encirclementChangedKeys, pid, lock.commandId);
        }
      }
    } else if (lock.actionType === "EXPAND" && attackerWon) {
      // A successful EXPAND adds a new frontier tile owned by the expander.
      // This can reconnect a previously cut-off pocket (the new tile bridges
      // the pocket back to settled supply). We scope the check to the expander
      // only — EXPAND never alters another player's territory.
      this.applyEncirclement([lock.targetKey], lock.playerId, lock.commandId);
    }
    if (attacker) this.emitPlayerStateUpdate({ commandId: lock.commandId, playerId: attacker.id });
    if (originLost && defender) this.emitPlayerStateUpdate({ commandId: lock.commandId, playerId: defender.id });
    if (originLost) this.respawnIfEliminated(lock.playerId, lock.commandId);
    if (attackerWon && previousOwnerId && previousOwnerId !== lock.playerId) {
      // If we captured the previous owner's SETTLEMENT and they still have other territory,
      // re-root a fresh SETTLEMENT town on one of their remaining tiles. If they have
      // no territory left, respawnIfEliminated places a settlement on unowned land instead.
      if (settlementCaptureRelocationPopulation !== undefined) {
        this.relocateSettlementForPlayer(
          previousOwnerId,
          lock.commandId,
          settlementCaptureRelocationPopulation
        );
      }
      this.respawnIfEliminated(previousOwnerId, lock.commandId);
      this.ensureGrossIncomeSettlementForPlayer(previousOwnerId, lock.commandId);
      this.emitPlayerStateUpdate({ commandId: lock.commandId, playerId: previousOwnerId });
    }
  }

  /**
   * Re-check encirclement connectivity for tiles owned by `playerId` in the
   * region around `changedKeys`. Apply `frontierDecayAt` to newly cut-off
   * tiles and clear it for reconnected tiles. Emit a TILE_DELTA_BATCH for
   * any tiles that changed.
   */
  private applyEncirclement(changedKeys: string[], playerId: string, commandId: string): void {
    const getTile = (key: string) => this.tiles.get(key);
    const nowMs = this.now();
    const { cutOff, reconnected } = computeEncirclementDeltas(changedKeys, playerId, getTile, nowMs, {
      onCapExceeded: (pid, visited, cap) => {
        this.runtimeLogInfo(
          {
            playerId: pid,
            bfsVisited: visited,
            bfsCap: cap,
            changedKeysCount: changedKeys.length,
            commandId
          },
          "[applyEncirclement] BFS cap exceeded — skipping detection this tick"
        );
      }
    });

    const tileDeltas: ReturnType<SimulationRuntime["tileDeltaFromState"]>[] = [];

    for (const key of cutOff) {
      const tile = this.tiles.get(key);
      if (!tile) continue;
      // Min-wins: don't overwrite a shorter existing timer.
      const encirclementExpiresAt = nowMs + ENCIRCLEMENT_DECAY_MS;
      const newDecayAt =
        typeof tile.frontierDecayAt === "number"
          ? Math.min(tile.frontierDecayAt, encirclementExpiresAt)
          : encirclementExpiresAt;
      const newDecayKind = newDecayAt === encirclementExpiresAt ? "ENCIRCLEMENT" : tile.frontierDecayKind;
      if (tile.frontierDecayAt === newDecayAt && tile.frontierDecayKind === newDecayKind) continue; // already has this or shorter timer
      const updated: typeof tile = { ...tile, frontierDecayAt: newDecayAt, frontierDecayKind: newDecayKind };
      this.replaceTileState(key, updated, commandId);
      tileDeltas.push(this.tileDeltaFromState(updated));
    }

    for (const key of reconnected) {
      const tile = this.tiles.get(key);
      if (!tile) continue;
      if (typeof tile.frontierDecayAt !== "number" || tile.frontierDecayKind !== "ENCIRCLEMENT") continue;
      const updated: typeof tile = { ...tile, frontierDecayAt: undefined, frontierDecayKind: undefined };
      this.replaceTileState(key, updated, commandId);
      tileDeltas.push(this.tileDeltaFromState(updated));
    }

    if (tileDeltas.length > 0) {
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId,
        playerId,
        tileDeltas
      });
    }
  }

  private relocateSettlementForPlayer(
    playerId: string,
    commandId: string,
    population: number
  ): boolean {
    const summary = this.summaryForPlayer(playerId);
    if (summary.territoryTileKeys.size === 0) return false; // respawnIfEliminated handles full eliminations.
    if (summary.ownedTownTierByTile.size > 0) return false;
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
    // Prefer a remaining SETTLED tile that does NOT already have a town. If none
    // exists, fall back to any owned land tile without overwriting world towns.
    let targetKey: string | undefined;
    let fallbackKey: string | undefined;
    for (const tileKey of summary.territoryTileKeys) {
      const tile = this.tiles.get(tileKey);
      if (!tile || tile.terrain !== "LAND" || tile.ownerId !== playerId) continue;
      if (tile.town) continue;
      if (!fallbackKey) fallbackKey = tileKey;
      if (tile.ownershipState === "SETTLED" && !targetKey) {
        targetKey = tileKey;
      }
    }
    targetKey ??= fallbackKey;
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
    const actor = this.players.get(playerId);
    if (!actor) return false;
    if (!actor.isAi && !this.pendingRespawnNoticeByPlayerId.has(playerId)) {
      this.preparePlayerRespawnNotice(playerId, "auth_recovery", commandId, { wasOnline: true });
    }
    const blockedTileKeys = new Set<string>([...this.pendingSettlementsByTile.keys(), ...this.locksByTile.keys()]);
    const spawn = chooseLegacySpawnPlacement({
      playerId,
      tiles: this.tiles.values(),
      blockedTileKeys
    });
    if (!spawn) return false;
    const respawnedTileKey = simulationTileKey(spawn.x, spawn.y);
    const tile = this.tiles.get(respawnedTileKey);
    if (!tile || tile.terrain !== "LAND" || tile.ownerId || tile.town || tile.dockId) return false;
    const respawnedTile: DomainTileState = {
      ...tile,
      ownerId: playerId,
      ownershipState: "SETTLED",
      town: {
        name: `Respawn ${tile.x},${tile.y}`,
        type: "FARMING",
        populationTier: "SETTLEMENT",
        population: SYNTHETIC_SETTLEMENT_POPULATION,
        maxPopulation: POPULATION_MAX
      }
    };
    actor.manpower = Math.max(actor.manpower, 100);
    const respawnCommandId = `${commandId}:respawn:${playerId}`;
    this.setTileYieldCollectedAt(respawnCommandId, playerId, respawnedTileKey, this.now());
    this.replaceTileState(respawnedTileKey, respawnedTile, respawnCommandId);
    this.finalizeRespawnNotice(playerId, respawnedTileKey);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: respawnCommandId,
      playerId,
      tileDeltas: [this.tileDeltaFromState(respawnedTile)]
    });
    this.emitPlayerStateUpdate({ commandId: respawnCommandId, playerId });
    this.runtimeLogInfo(
      {
        type: "respawn_placed",
        playerId,
        commandId: respawnCommandId,
        tileKey: respawnedTileKey,
        goldIncomePerMinute: this.summaryForPlayer(playerId).goldIncomePerMinute,
        incomePerMinute: this.incomePerMinuteForPlayer(playerId)
      },
      "placed respawn settlement"
    );
    return true;
  }

  private barbarianProgressGain(target: DomainTileState | undefined): number {
    // Multiply progress only accumulates when a barb actually CAPTURES a
    // non-barb player's tile. Walking into neutral land or shuffling between
    // own tiles contributes zero — otherwise barbs multiply every 3 steps
    // even when no one's territory is being eaten, which is what was
    // spreading them across the map.
    if (!target?.ownerId || target.ownerId === "barbarian-1") return 0;
    return target.resource || target.town || target.fort || target.siegeOutpost || target.dockId ? 2 : 1;
  }

  private applyBarbarianWalkOrMultiply(lock: LockRecord, previousTarget: DomainTileState | undefined): void {
    const gain = this.barbarianProgressGain(previousTarget);
    const sourceProgress = this.barbarianTileProgress.get(lock.originKey) ?? 0;
    const newProgress = sourceProgress + gain;
    // Population cap: at/over cap, an otherwise-multiplying walk becomes a
    // plain walk that carries the over-threshold progress to the target,
    // so the target re-attempts the multiply on its next action — natural
    // "barbs pent up waiting for room to spawn" behavior once a barb dies.
    const barbTileCount = this.summaryForPlayer("barbarian-1").territoryTileKeys.size;
    if (newProgress >= BARBARIAN_MULTIPLY_THRESHOLD && barbTileCount < BARBARIAN_POPULATION_CAP) {
      this.barbarianTileProgress.set(lock.originKey, 0);
      this.barbarianTileProgress.set(lock.targetKey, 0);
      return;
    }
    this.barbarianTileProgress.delete(lock.originKey);
    this.barbarianTileProgress.set(lock.targetKey, newProgress);
    const previousOrigin = this.tiles.get(lock.originKey);
    if (!previousOrigin || previousOrigin.ownerId !== "barbarian-1") return;
    const releasedOrigin: DomainTileState = {
      x: previousOrigin.x,
      y: previousOrigin.y,
      terrain: previousOrigin.terrain,
      ...(previousOrigin.resource ? { resource: previousOrigin.resource } : {}),
      ...(previousOrigin.dockId ? { dockId: previousOrigin.dockId } : {})
    };
    this.replaceTileState(lock.originKey, releasedOrigin);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: lock.commandId,
      playerId: lock.playerId,
      tileDeltas: [this.tileDeltaFromState(releasedOrigin)]
    });
  }

  private previewSettledCapturePlunder(input: {
    defender: DomainPlayer;
    defenderTileCountBeforeCapture: number;
    target: DomainTileState;
  }): { gold: number; share: number; defenderGoldLoss: number; strategic: Partial<Record<StrategicResourceKey, number>> } {
    const share = 1 / Math.max(1, input.defenderTileCountBeforeCapture);
    const defenderGoldShare = Math.max(0, input.defender.points * share);
    const storedYieldGold = input.target.town ? 1 : 0;
    const gold = Math.round((defenderGoldShare + storedYieldGold) * 100) / 100;

    const strategic: Partial<Record<StrategicResourceKey, number>> = {};
    const strategicResource = strategicResourceForTile(input.target.resource);
    if (strategicResource) {
      strategic[strategicResource] = 1;
    }
    return { gold, share, defenderGoldLoss: defenderGoldShare, strategic };
  }

  private applySettledCapturePlunder(input: {
    attacker: DomainPlayer;
    defender: DomainPlayer;
    gold: number;
    defenderGoldLoss: number;
  }): void {
    if (input.gold <= 0) return;
    input.defender.points = Math.max(0, input.defender.points - input.defenderGoldLoss);
    input.attacker.points += input.gold;
  }

  private attackManpowerLoss(committedManpower: number, attackerWon: boolean, atkEff: number, defEff: number): number {
    if (committedManpower <= 0) return 0;
    if (attackerWon) return Math.max(10, committedManpower * 0.16);
    const combatRatio = defEff / Math.max(1, atkEff);
    return committedManpower * Math.min(1.25, 0.6 + combatRatio * 0.35);
  }

  private applyLockedManpowerDelta(player: DomainPlayer, manpowerDelta: number): number {
    if (manpowerDelta >= -0.01) return 0;
    const loss = Math.abs(manpowerDelta);
    player.manpower = Math.max(0, player.manpower - loss);
    return loss;
  }

  private settleAttackManpower(
    player: DomainPlayer,
    committedManpower: number,
    attackerWon: boolean,
    atkEff: number,
    defEff: number
  ): number {
    const loss = this.attackManpowerLoss(committedManpower, attackerWon, atkEff, defEff);
    player.manpower = Math.max(0, player.manpower - loss);
    return loss;
  }

  private respawnIfEliminated(playerId: string, commandId: string): void {
    const actor = this.players.get(playerId);
    if (!actor) return;
    if (this.summaryForPlayer(playerId).territoryTileKeys.size > 0) return;
    if (!actor.isAi && !this.pendingRespawnNoticeByPlayerId.has(playerId)) {
      this.preparePlayerRespawnNotice(playerId, "eliminated", commandId, { wasOnline: true });
    }

    const blockedTileKeys = new Set<string>([...this.pendingSettlementsByTile.keys(), ...this.locksByTile.keys()]);
    const spawn = chooseLegacySpawnPlacement({
      playerId,
      tiles: this.tiles.values(),
      blockedTileKeys
    });
    if (!spawn) return;
    const respawnedTileKey = simulationTileKey(spawn.x, spawn.y);
    const tile = this.tiles.get(respawnedTileKey);
    if (!tile || tile.terrain !== "LAND" || tile.ownerId || tile.town || tile.dockId) return;
    const respawnedTile: DomainTileState = {
      ...tile,
      ownerId: playerId,
      ownershipState: "SETTLED",
      town: {
        name: `Respawn ${tile.x},${tile.y}`,
        type: "FARMING",
        populationTier: "SETTLEMENT",
        population: SYNTHETIC_SETTLEMENT_POPULATION,
        maxPopulation: POPULATION_MAX
      }
    };
    actor.manpower = Math.max(actor.manpower, 100);
    const respawnCommandId = `${commandId}:respawn:${playerId}`;
    this.setTileYieldCollectedAt(respawnCommandId, playerId, respawnedTileKey, this.now());
    this.replaceTileState(respawnedTileKey, respawnedTile, respawnCommandId);
    this.finalizeRespawnNotice(playerId, respawnedTileKey);
    this.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: respawnCommandId,
      playerId,
      tileDeltas: [this.tileDeltaFromState(respawnedTile)]
    });
  }

  private queueCommandForProcessing(command: CommandEnvelope): void {
    const lane = laneForCommand(command);
    const scheduling =
      command.type !== "SYNC_ALLIANCE" &&
      (command.sessionId.startsWith("ai-runtime:") || command.sessionId.startsWith("system-runtime:"))
        ? "background"
        : "immediate";
    this.enqueueJob(lane, () => {
      if (
        command.type !== "ATTACK" &&
        command.type !== "EXPAND" &&
        command.type !== "SETTLE" &&
        command.type !== "BUILD_FORT" &&
        command.type !== "BUILD_OBSERVATORY" &&
        command.type !== "BUILD_SIEGE_OUTPOST" &&
        command.type !== "SET_SIEGE_OUTPOST_SWEEP" &&
        command.type !== "BUILD_ECONOMIC_STRUCTURE" &&
        command.type !== "CANCEL_CAPTURE" &&
        command.type !== "CANCEL_FORT_BUILD" &&
        command.type !== "CANCEL_STRUCTURE_BUILD" &&
        command.type !== "REMOVE_STRUCTURE" &&
        command.type !== "CANCEL_SIEGE_OUTPOST_BUILD" &&
        command.type !== "UNCAPTURE_TILE" &&
        command.type !== "COLLECT_VISIBLE" &&
        command.type !== "COLLECT_TILE" &&
        command.type !== "CHOOSE_TECH" &&
        command.type !== "CHOOSE_DOMAIN" &&
        command.type !== "OVERLOAD_SYNTHESIZER" &&
        command.type !== "SET_CONVERTER_STRUCTURE_ENABLED" &&
        command.type !== "REVEAL_EMPIRE" &&
        command.type !== "REVEAL_EMPIRE_STATS" &&
        command.type !== "CAST_AETHER_BRIDGE" &&
        command.type !== "CAST_AETHER_WALL" &&
        command.type !== "SIPHON_TILE" &&
        command.type !== "PURGE_SIPHON" &&
        command.type !== "CREATE_MOUNTAIN" &&
        command.type !== "REMOVE_MOUNTAIN" &&
        command.type !== "AIRPORT_BOMBARD" &&
        command.type !== "IMPERIAL_EXCHANGE_LEVY" &&
        command.type !== "WORLD_ENGINE_STRIKE" &&
        command.type !== "COLLECT_SHARD" &&
        command.type !== "SYNC_ALLIANCE"
      ) {
        this.emitEvent({
          eventType: "COMMAND_REJECTED",
          commandId: command.commandId,
          playerId: command.playerId,
          code: "UNSUPPORTED",
          message: `${command.type} not yet migrated to the new simulation service`
        });
        return;
      }

      if (command.type === "SETTLE") {
        this.handleSettleCommand(command);
        return;
      }

      if (command.type === "BUILD_FORT") {
        this.handleBuildFortCommand(command);
        return;
      }

      if (command.type === "BUILD_OBSERVATORY") {
        this.handleBuildObservatoryCommand(command);
        return;
      }

      if (command.type === "BUILD_SIEGE_OUTPOST") {
        this.handleBuildSiegeOutpostCommand(command);
        return;
      }

      if (command.type === "SET_SIEGE_OUTPOST_SWEEP") {
        this.handleSetSiegeOutpostSweepCommand(command);
        return;
      }

      if (command.type === "BUILD_ECONOMIC_STRUCTURE") {
        this.handleBuildEconomicStructureCommand(command);
        return;
      }

      if (command.type === "CANCEL_CAPTURE") {
        this.handleCancelCaptureCommand(command);
        return;
      }

      if (command.type === "CANCEL_FORT_BUILD") {
        this.handleCancelFortBuildCommand(command);
        return;
      }

      if (command.type === "CANCEL_STRUCTURE_BUILD") {
        this.handleCancelStructureBuildCommand(command);
        return;
      }

      if (command.type === "REMOVE_STRUCTURE") {
        this.handleRemoveStructureCommand(command);
        return;
      }

      if (command.type === "CANCEL_SIEGE_OUTPOST_BUILD") {
        this.handleCancelSiegeOutpostBuildCommand(command);
        return;
      }

      if (command.type === "COLLECT_VISIBLE") {
        this.handleCollectVisibleCommand(command);
        return;
      }

      if (command.type === "COLLECT_TILE") {
        this.handleCollectTileCommand(command);
        return;
      }

      if (command.type === "UNCAPTURE_TILE") {
        this.handleUncaptureTileCommand(command);
        return;
      }

      if (command.type === "CHOOSE_TECH") {
        this.handleChooseTechCommand(command);
        return;
      }

      if (command.type === "CHOOSE_DOMAIN") {
        this.handleChooseDomainCommand(command);
        return;
      }

      if (command.type === "OVERLOAD_SYNTHESIZER") {
        this.handleOverloadSynthesizerCommand(command);
        return;
      }

      if (command.type === "SET_CONVERTER_STRUCTURE_ENABLED") {
        this.handleSetConverterStructureEnabledCommand(command);
        return;
      }

      if (command.type === "REVEAL_EMPIRE") {
        this.handleRevealEmpireCommand(command);
        return;
      }

      if (command.type === "REVEAL_EMPIRE_STATS") {
        this.handleRevealEmpireStatsCommand(command);
        return;
      }

      if (command.type === "CAST_AETHER_BRIDGE") {
        this.handleCastAetherBridgeCommand(command);
        return;
      }

      if (command.type === "CAST_AETHER_WALL") {
        this.handleCastAetherWallCommand(command);
        return;
      }

      if (command.type === "SIPHON_TILE") {
        this.handleSiphonTileCommand(command);
        return;
      }

      if (command.type === "PURGE_SIPHON") {
        this.handlePurgeSiphonCommand(command);
        return;
      }

      if (command.type === "CREATE_MOUNTAIN") {
        this.handleCreateMountainCommand(command);
        return;
      }

      if (command.type === "REMOVE_MOUNTAIN") {
        this.handleRemoveMountainCommand(command);
        return;
      }

      if (command.type === "AIRPORT_BOMBARD") {
        this.handleAirportBombardCommand(command);
        return;
      }

      if (command.type === "IMPERIAL_EXCHANGE_LEVY") {
        this.handleImperialExchangeLevyCommand(command);
        return;
      }

      if (command.type === "WORLD_ENGINE_STRIKE") {
        this.handleWorldEngineStrikeCommand(command);
        return;
      }

      if (command.type === "COLLECT_SHARD") {
        this.handleCollectShardCommand(command);
        return;
      }

      if (command.type === "SYNC_ALLIANCE") {
        this.handleSyncAllianceCommand(command);
        return;
      }

      this.handleFrontierCommand(command, command.type);
    }, command.type, scheduling);
  }
}
