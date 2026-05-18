import { EventEmitter } from "node:events";

import type { CommandEnvelope, LockedFrontierCombatResult, ManpowerBreakdown, SimulationEvent } from "@border-empires/sim-protocol";
import type { PlayerRespawnNotice, PlayerRespawnReasonCode } from "@border-empires/shared";
import {
  buildRewritePlayerRespawnNotice,
  type PendingRespawnNoticeContext
} from "./player-respawn-notice.js";
import {
  validateFrontierCommand,
  type DomainPlayer,
  type DomainStrategicResourceKey,
  type DomainTileState,
  type FrontierCommandType
} from "@border-empires/game-domain";
import {
  ATTACK_MANPOWER_MIN,
  BARBARIAN_MULTIPLY_THRESHOLD,
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
  scanOutpostMult,
  rollFrontierCombat,
  structureBuildDurationMs,
  structureBuildGoldCost,
  structureCostDefinition,
  structurePlacementMetadata,
  structureShowsOnTile,
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
  AIRPORT_BOMBARD_OIL_COST,
  AIRPORT_BOMBARD_RANGE,
  ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS,
  CRYSTAL_SYNTHESIZER_OVERLOAD_CRYSTAL,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP,
  FUEL_PLANT_GOLD_UPKEEP,
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
  FORT_AUTO_FRONTIER_RADIUS,
  isActiveFortAnchor,
  isAutoClaimTarget,
  isSettledTownAnchor,
  isValuableAutoSettlementTarget,
  siegeAutoAttackCandidates,
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
  buildStrategicProductionForSettledTiles
} from "./player-update-economy.js";
import { buildConnectedTownNetworkForPlayer, enrichTownWithConnectedNetwork, firstThreeTownKeysForPlayer } from "./economy-network.js";
import { capturedStructureFields } from "./capture-structures.js";
import { createSeedWorld, type SimulationSeedProfile, simulationTileKey } from "./seed-state.js";
import type { RecoveredSimulationState } from "./event-recovery.js";
import type { RecoveredCommandHistory } from "./command-recovery.js";
import { buildSimulationSnapshotCommandEvents, type SimulationSnapshotSections } from "./snapshot-store.js";
import {
  buildModBreakdownForPlayer,
  buildDomainUpdatePayload,
  buildTechUpdatePayload,
  chooseDomainForPlayer,
  chooseTechForPlayer,
  effectiveVisionRadiusForPlayer,
  multiplicativeEffectForPlayer,
  observatoryCastRadiusForPlayer,
  recomputeMods,
  visionRadiusBonusForPlayer
} from "./tech-domain-bridge.js";
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

type RuntimeTileYieldEconomyContext = {
  player: DomainPlayer;
  townNetwork: ReturnType<typeof buildConnectedTownNetworkForPlayer>;
  fedTownKeys: Set<string>;
  firstThreeTownKeys: Set<string>;
};

const UPKEEP_STRATEGIC_KEYS = ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "OIL"] as const;
type UpkeepStrategicKey = (typeof UPKEEP_STRATEGIC_KEYS)[number];
type UpkeepNeed = { gold: number } & Record<UpkeepStrategicKey, number>;

const hasOutstandingUpkeepNeed = (need: UpkeepNeed): boolean => {
  if (need.gold > 0.0001) return true;
  for (const resource of UPKEEP_STRATEGIC_KEYS) {
    if (need[resource] > 0.0001) return true;
  }
  return false;
};

type LockRecord = {
  commandId: string;
  playerId: string;
  actionType: FrontierCommandType;
  manpowerCost: number;
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  targetKey: string;
  originKey: string;
  resolvesAt: number;
  combatResolution?: LockedCombatResolution;
};

type LockedCombatResolution = {
  result: LockedFrontierCombatResult;
  defenderGoldLoss: number;
};

type AetherWallDirection = "N" | "E" | "S" | "W";

type ActiveAetherBridgeView = {
  bridgeId: string;
  ownerId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  startedAt: number;
  endsAt: number;
};

type ActiveAetherWallView = {
  wallId: string;
  ownerId: string;
  origin: { x: number; y: number };
  direction: AetherWallDirection;
  length: 1 | 2 | 3;
  startedAt: number;
  endsAt: number;
};

type SimulationJob = {
  lane: QueueLane;
  run: () => void;
  enqueuedAt: number;
  // Set when the job was enqueued via queueCommandForProcessing; lets the
  // drain emit per-command-type apply-time metrics. Background jobs
  // (enqueueBackgroundJob) leave this undefined; their apply time is still
  // counted in the overall drain duration but not attributed to a type.
  commandType?: CommandEnvelope["type"];
};

type StrategicResourceKey = DomainStrategicResourceKey;
type RuntimePlayer = DomainPlayer & {
  manpowerUpdatedAt?: number;
  manpowerCapSnapshot?: number;
};

type SimulationPersistence = {
  recordCommand: (command: CommandEnvelope) => void;
  recordEvent: (event: SimulationEvent) => void;
  snapshot: () => {
    commands: CommandEnvelope[];
    events: SimulationEvent[];
  };
};

export class InMemorySimulationPersistence implements SimulationPersistence {
  private readonly commands: CommandEnvelope[] = [];
  private readonly events: SimulationEvent[] = [];

  recordCommand(command: CommandEnvelope): void {
    this.commands.push(command);
  }

  recordEvent(event: SimulationEvent): void {
    this.events.push(event);
  }

  snapshot(): { commands: CommandEnvelope[]; events: SimulationEvent[] } {
    return {
      commands: [...this.commands],
      events: [...this.events]
    };
  }
}

type SimulationRuntimeOptions = {
  now?: () => number;
  persistence?: SimulationPersistence;
  backgroundBatchSize?: number;
  scheduleSoon?: (task: () => void) => void;
  scheduleAfter?: (delayMs: number, task: () => void) => void;
  initialState?: RecoveredSimulationState;
  initialCommandHistory?: RecoveredCommandHistory;
  seedProfile?: SimulationSeedProfile;
  seedTiles?: Map<string, DomainTileState>;
  seedDocks?: DockRouteDefinition[];
  initialPlayers?: Map<string, RuntimePlayer>;
  mergeSeedTilesWithInitialState?: boolean;
  commandTrace?: (sample: Record<string, unknown>) => void;
  onQueueDrain?: (sample: {
    durationMs: number;
    processedJobs: number;
    backgroundJobsProcessed: number;
    yieldedForBackground: boolean;
    processedByLane: Record<QueueLane, number>;
    queueDepthsBefore: Record<QueueLane, number>;
    queueDepthsAfter: Record<QueueLane, number>;
  }) => void;
  // Fires once per processed job inside drainQueues with the wall-clock cost
  // of its run() and (when the job was enqueued via queueCommandForProcessing)
  // the originating command type. Lets us see which apply path dominates the
  // drain (likely ATTACK with combat resolution).
  onJobApplied?: (sample: {
    lane: QueueLane;
    durationMs: number;
    commandType?: CommandEnvelope["type"];
  }) => void;
  // Per-COLLECT_VISIBLE phase telemetry. #317 split the inner loop and found
  // it was only ~4% of the call cost — the remaining 96% lives in the three
  // post-loop emits. Adds timing for each so we can localise the hot listener
  // (almost certainly emitPlayerStateUpdate, which fires on every command
  // apply across the runtime, not just COLLECT_VISIBLE — so fixing it once
  // helps ATTACK / SETTLE / EXPAND too).
  onCollectVisibleSample?: (sample: {
    playerId: string;
    yieldMs: number;
    deltaMs: number;
    tileDeltaBatchEmitMs: number;
    collectResultEmitMs: number;
    playerStateUpdateMs: number;
    tilesConsidered: number;
    tilesTouched: number;
  }) => void;
  maxTerminalCommandReplayHistory?: number;
  maxPlayerSeqReplayEntries?: number;
  onVisibilityAudit?: (sample: VisibilityAuditSample) => void;
  onCaptureRevealBuilt?: (sample: {
    commandId: string;
    playerId: string;
    tileCount: number;
    durationMs: number;
  }) => void;
};

export type VisibilityAuditSample = {
  playerId: string;
  tileKey: string;
  x: number;
  y: number;
  ownerId: string;
  reasons: string[];
  redacted: boolean;
};

export type SimulationTileWireDelta = {
  x: number;
  y: number;
  terrain?: Terrain;
  resource?: string;
  dockId?: string;
  ownerId?: string;
  ownershipState?: string;
  townJson?: string;
  townType?: string;
  townName?: string;
  townPopulationTier?: string;
  fortJson?: string;
  observatoryJson?: string;
  siegeOutpostJson?: string;
  economicStructureJson?: string;
  sabotageJson?: string;
  shardSiteJson?: string;
};

const domainTileToWireDelta = (tile: DomainTileState): SimulationTileWireDelta => ({
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
});

const createPlayersFromRecoveredState = (
  initialState?: RecoveredSimulationState,
  fallbackPlayers?: ReadonlyMap<string, RuntimePlayer>
): Map<string, RuntimePlayer> | undefined => {
  if (!initialState?.players || initialState.players.length === 0) return undefined;
  return new Map(
    initialState.players.map((player) => {
      const techIds = new Set(player.techIds ?? []);
      const domainIds = new Set(player.domainIds ?? []);
      return [
        player.id,
        {
          id: player.id,
          isAi: player.isAi ?? fallbackPlayers?.get(player.id)?.isAi ?? false,
          name: player.name ?? player.id,
          points: player.points ?? 0,
          manpower: player.manpower ?? MANPOWER_BASE_CAP,
          ...(typeof player.manpowerUpdatedAt === "number" ? { manpowerUpdatedAt: player.manpowerUpdatedAt } : {}),
          ...(typeof player.manpowerCapSnapshot === "number" ? { manpowerCapSnapshot: player.manpowerCapSnapshot } : {}),
          techIds,
          domainIds,
          mods: recomputeMods({ techIds, domainIds }),
          techRootId: "rewrite-recovered",
          allies: new Set(player.allies ?? []),
          strategicResources: {
            FOOD: player.strategicResources?.FOOD ?? 0,
            IRON: player.strategicResources?.IRON ?? 0,
            CRYSTAL: player.strategicResources?.CRYSTAL ?? 0,
            SUPPLY: player.strategicResources?.SUPPLY ?? 0,
            SHARD: player.strategicResources?.SHARD ?? 0,
            OIL: player.strategicResources?.OIL ?? 0
          },
          strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 }
        }
      ] as const;
    })
  );
};

const priorityOrder: QueueLane[] = ["human_interactive", "human_noninteractive", "system", "ai"];
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

const parseFrontierPayload = (payloadJson: string): { fromX: number; fromY: number; toX: number; toY: number } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (
      typeof parsed.fromX !== "number" ||
      typeof parsed.fromY !== "number" ||
      typeof parsed.toX !== "number" ||
      typeof parsed.toY !== "number"
    ) {
      return null;
    }
    return {
      fromX: parsed.fromX,
      fromY: parsed.fromY,
      toX: parsed.toX,
      toY: parsed.toY
    };
  } catch {
    return null;
  }
};

const parseSettlePayload = (payloadJson: string): { x: number; y: number } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
};

const parseTilePayload = (payloadJson: string): { x: number; y: number } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
};

const parseStructureTilePayload = (payloadJson: string): { x: number; y: number } | null => parseTilePayload(payloadJson);

const parseConverterTogglePayload = (payloadJson: string): { x: number; y: number; enabled: boolean } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number" || typeof parsed.enabled !== "boolean") return null;
    return {
      x: parsed.x,
      y: parsed.y,
      enabled: parsed.enabled
    };
  } catch {
    return null;
  }
};

const parseEconomicStructurePayload = (payloadJson: string): { x: number; y: number; structureType: EconomicStructureType } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number" || typeof parsed.structureType !== "string") return null;
    return {
      x: parsed.x,
      y: parsed.y,
      structureType: parsed.structureType as EconomicStructureType
    };
  } catch {
    return null;
  }
};

const parseRevealPayload = (payloadJson: string): { targetPlayerId: string } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.targetPlayerId !== "string" || parsed.targetPlayerId.length === 0) return null;
    return { targetPlayerId: parsed.targetPlayerId };
  } catch {
    return null;
  }
};

const parseAllianceSyncPayload = (payloadJson: string): { targetPlayerId: string; allied: boolean } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.targetPlayerId !== "string" || parsed.targetPlayerId.length === 0 || typeof parsed.allied !== "boolean") {
      return null;
    }
    return { targetPlayerId: parsed.targetPlayerId, allied: parsed.allied };
  } catch {
    return null;
  }
};

const parseAetherWallPayload = (
  payloadJson: string
): { x: number; y: number; direction: AetherWallDirection; length: 1 | 2 | 3 } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      (parsed.direction !== "N" && parsed.direction !== "E" && parsed.direction !== "S" && parsed.direction !== "W") ||
      (parsed.length !== 1 && parsed.length !== 2 && parsed.length !== 3)
    ) {
      return null;
    }
    return {
      x: parsed.x,
      y: parsed.y,
      direction: parsed.direction,
      length: parsed.length
    };
  } catch {
    return null;
  }
};

const parseAirportBombardPayload = (payloadJson: string): { fromX: number; fromY: number; toX: number; toY: number } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (
      typeof parsed.fromX !== "number" ||
      typeof parsed.fromY !== "number" ||
      typeof parsed.toX !== "number" ||
      typeof parsed.toY !== "number"
    ) {
      return null;
    }
    return {
      fromX: parsed.fromX,
      fromY: parsed.fromY,
      toX: parsed.toX,
      toY: parsed.toY
    };
  } catch {
    return null;
  }
};

const TECH_REQUIREMENTS_BY_STRUCTURE: Partial<Record<EconomicStructureType, string>> = {
  FARMSTEAD: "agriculture",
  CAMP: "leatherworking",
  MINE: "mining",
  MARKET: "trade",
  GRANARY: "pottery",
  BANK: "coinage",
  AIRPORT: "aeronautics",
  FUR_SYNTHESIZER: "workshops",
  ADVANCED_FUR_SYNTHESIZER: "advanced-synthetication",
  IRONWORKS: "alchemy",
  ADVANCED_IRONWORKS: "advanced-synthetication",
  CRYSTAL_SYNTHESIZER: "crystal-lattices",
  ADVANCED_CRYSTAL_SYNTHESIZER: "advanced-synthetication",
  FUEL_PLANT: "plastics",
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
  return undefined;
};

const isConverterStructureType = (structureType: EconomicStructureType): boolean =>
  structureType === "FUR_SYNTHESIZER" ||
  structureType === "ADVANCED_FUR_SYNTHESIZER" ||
  structureType === "IRONWORKS" ||
  structureType === "ADVANCED_IRONWORKS" ||
  structureType === "CRYSTAL_SYNTHESIZER" ||
  structureType === "ADVANCED_CRYSTAL_SYNTHESIZER" ||
  structureType === "FUEL_PLANT";

const economicStructureGoldUpkeepPerInterval = (structureType: EconomicStructureType): number => {
  const perMinute =
    structureType === "ADVANCED_FUR_SYNTHESIZER" || structureType === "FUR_SYNTHESIZER" ? FUR_SYNTHESIZER_GOLD_UPKEEP / 10
      : structureType === "IRONWORKS" || structureType === "ADVANCED_IRONWORKS" ? IRONWORKS_GOLD_UPKEEP / 10
      : structureType === "CRYSTAL_SYNTHESIZER" || structureType === "ADVANCED_CRYSTAL_SYNTHESIZER" ? CRYSTAL_SYNTHESIZER_GOLD_UPKEEP / 10
      : structureType === "FUEL_PLANT" ? FUEL_PLANT_GOLD_UPKEEP / 10
      : 0;
  return perMinute * (ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS / 60_000);
};

const isSyntheticSettlementTown = (
  town: DomainTileState["town"] | undefined,
  x: number,
  y: number
): boolean =>
  Boolean(
    town &&
    town.populationTier === "SETTLEMENT" &&
    town.name === `Settlement ${x},${y}`
  );

const SYNTHETIC_SETTLEMENT_POPULATION = 800;
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

const hydrateSyntheticSettlementTown = (
  town: DomainTileState["town"] | undefined,
  x: number,
  y: number
): DomainTileState["town"] | undefined => {
  if (!town || !isSyntheticSettlementTown(town, x, y)) return town;
  return {
    ...town,
    population: typeof town.population === "number" ? town.population : SYNTHETIC_SETTLEMENT_POPULATION,
    maxPopulation: typeof town.maxPopulation === "number" ? town.maxPopulation : POPULATION_MAX
  };
};

export class SimulationRuntime {
  private readonly events = new EventEmitter();
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
  private readonly barbarianTileProgress = new Map<string, number>();
  private readonly collectVisibleCooldownByPlayer = new Map<string, number>();
  private readonly tileYieldCollectedAtByTile = new Map<string, number>();
  // Epoch ms when each tile last transitioned into SETTLED ownership. Stamped
  // inside replaceTileState; consumed by tickTileShedding to shed newest-first
  // when a player is broke (points <= 0 and net gold/min <= 0). Not persisted —
  // tiles recovered from the event log have no entry and tie at -Infinity, so
  // they're shed last (which matches the intent: an empire that survived
  // restart shouldn't have its core tiles shed before its newer expansions).
  private readonly tileSettledAtByKey = new Map<string, number>();
  private readonly lastEconomyAccrualAtByPlayer = new Map<string, number>();
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
  private draining = false;

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
    for (const cooldown of options.initialState?.collectVisibleCooldownByPlayer ?? []) {
      this.collectVisibleCooldownByPlayer.set(cooldown.playerId, cooldown.cooldownUntil);
    }
    for (const playerId of this.players.keys()) {
      this.playerSummaries.set(playerId, createEmptyPlayerRuntimeSummary());
      this.plannerPlayerTileCollectionVersionByPlayer.set(playerId, 0);
    }
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

  tickShardRain(nowMs: number = this.now()): void {
    this.expireShardFallSites(nowMs);
    this.maybeBroadcastShardRainWarning(nowMs);
    this.maybeSpawnScheduledShardRain(nowMs);
  }

  tickTerritoryAutomation(nowMs: number = this.now()): void {
    const autoClaimedKeys = new Set<string>();
    const autoSettlingKeys = new Set<string>();
    const startedSettlementUpdatesByPlayer = new Map<string, string>();

    for (const playerId of this.players.keys()) {
      if (playerId.startsWith("barbarian-")) continue;
      const summary = this.summaryForPlayer(playerId);
      const actor = this.players.get(playerId);
      if (!actor) continue;
      this.applyEconomyAccrual(actor, nowMs);
      const ownedTileKeys = [...summary.territoryTileKeys];
      const claimDeltas: Array<ReturnType<SimulationRuntime["tileDeltaFromState"]>> = [];
      let claimCommandId: string | undefined;

      for (const anchorKey of ownedTileKeys) {
        const anchor = this.tiles.get(anchorKey);
        if (!anchor) continue;
        const radius = isActiveFortAnchor(anchor, playerId, nowMs)
          ? FORT_AUTO_FRONTIER_RADIUS
          : isSettledTownAnchor(anchor, playerId)
            ? TOWN_AUTO_FRONTIER_RADIUS
            : 0;
        if (radius <= 0) continue;
        for (const coords of coordsInChebyshevRadius(anchor.x, anchor.y, radius)) {
          if (actor.points < FRONTIER_CLAIM_COST) break;
          const targetKey = simulationTileKey(coords.x, coords.y);
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
          this.replaceTileState(targetKey, claimedTile, claimCommandId);
          claimDeltas.push(this.tileDeltaFromState(claimedTile));
        }
      }

      if (claimCommandId && claimDeltas.length > 0) {
        this.emitEvent({
          eventType: "TILE_DELTA_BATCH",
          commandId: claimCommandId,
          playerId,
          goldCost: FRONTIER_CLAIM_COST * claimDeltas.length,
          tileDeltas: claimDeltas
        });
        this.emitPlayerStateUpdate({ commandId: claimCommandId, playerId });
      }
    }

    for (const playerId of this.players.keys()) {
      if (playerId.startsWith("barbarian-")) continue;
      const actor = this.players.get(playerId);
      if (!actor) continue;
      const summary = this.summaryForPlayer(playerId);
      this.applyEconomyAccrual(actor, nowMs);
      for (const anchorKey of [...summary.ownedTownTierByTile.keys()]) {
        const anchor = this.tiles.get(anchorKey);
        if (!anchor || !isSettledTownAnchor(anchor, playerId)) continue;
        for (const coords of coordsInChebyshevRadius(anchor.x, anchor.y, TOWN_AUTO_FRONTIER_RADIUS)) {
          if (this.activeDevelopmentProcessCountForPlayer(playerId) >= DEVELOPMENT_PROCESS_LIMIT) break;
          if (actor.points < SETTLE_COST) break;
          const targetKey = simulationTileKey(coords.x, coords.y);
          if (autoSettlingKeys.has(targetKey) || this.locksByTile.has(targetKey) || this.pendingSettlementsByTile.has(targetKey)) continue;
          const target = this.tiles.get(targetKey);
          if (!isValuableAutoSettlementTarget(target, playerId)) continue;
          autoSettlingKeys.add(targetKey);
          const commandId = this.nextTerritoryAutomationCommandId("settle", playerId, targetKey, nowMs);
          this.startSettlementProcess({
            commandId,
            playerId,
            targetKey,
            target,
            startedAt: nowMs,
            emitStartedUpdate: false
          });
          startedSettlementUpdatesByPlayer.set(playerId, commandId);
        }
      }
    }

    for (const [playerId, commandId] of startedSettlementUpdatesByPlayer.entries()) {
      this.emitPlayerStateUpdate({ commandId, playerId });
    }

    for (const playerId of this.players.keys()) {
      if (playerId.startsWith("barbarian-")) continue;
      const actor = this.players.get(playerId);
      if (!actor) continue;
      this.applyManpowerRegen(actor, nowMs);
      let availableSiegeManpower = actor.manpower;
      let availableSiegeGold = actor.points;
      if (availableSiegeManpower < ATTACK_MANPOWER_MIN || availableSiegeGold < FRONTIER_CLAIM_COST) continue;
      const summary = this.summaryForPlayer(playerId);
      for (const tileKey of [...summary.territoryTileKeys]) {
        const outpost = this.tiles.get(tileKey);
        if (
          !outpost ||
          outpost.siegeOutpost?.ownerId !== playerId ||
          outpost.siegeOutpost.status !== "active"
        ) {
          continue;
        }
        if (availableSiegeManpower < ATTACK_MANPOWER_MIN || availableSiegeGold < FRONTIER_CLAIM_COST) break;
        if (this.locksByTile.has(tileKey)) continue;
        const target = siegeAutoAttackCandidates(outpost, playerId, (x, y) => this.tiles.get(simulationTileKey(x, y)))
          .find((candidate) => {
            const targetKey = simulationTileKey(candidate.x, candidate.y);
            return !this.locksByTile.has(targetKey) && !actor.allies.has(candidate.ownerId ?? "");
          });
        if (!target) continue;
        const commandId = this.nextTerritoryAutomationCommandId("siege", playerId, simulationTileKey(target.x, target.y), nowMs);
        this.handleFrontierCommand(
          {
            commandId,
            sessionId: `system-runtime:territory-automation:${playerId}`,
            playerId,
            clientSeq: 0,
            issuedAt: nowMs,
            type: "ATTACK",
            payloadJson: JSON.stringify({ fromX: outpost.x, fromY: outpost.y, toX: target.x, toY: target.y })
          },
          "ATTACK"
        );
        availableSiegeManpower -= ATTACK_MANPOWER_MIN;
        availableSiegeGold -= FRONTIER_CLAIM_COST;
      }
    }
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

  private canHostShardFallSiteAt(tile: DomainTileState | undefined): boolean {
    if (!tile) return false;
    if (tile.terrain !== "LAND") return false;
    if (tile.dockId) return false;
    if (tile.resource) return false;
    if (tile.town) return false;
    if (tile.shardSite) return false;
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
      if (!this.canHostShardFallSiteAt(tile)) continue;
      const amount = Math.random() > 0.8 ? 2 : 1;
      const updated: DomainTileState = { ...(tile as DomainTileState), shardSite: { kind: "FALL", amount, expiresAt } };
      this.replaceTileState(tileKey, updated);
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
      siteCount: placed.length
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
    this.enqueueJob("ai", job);
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
    const summary = this.summaryForPlayer(player.id);
    const economy = buildPlayerUpdateEconomySnapshot(player, summary, this.tiles);
    const elapsedMinutes = elapsedMs / 60_000;
    const need: UpkeepNeed = {
      gold: Math.max(0, economy.upkeepPerMinute.gold) * elapsedMinutes,
      FOOD: Math.max(0, economy.upkeepPerMinute.food) * elapsedMinutes,
      IRON: Math.max(0, economy.upkeepPerMinute.iron) * elapsedMinutes,
      CRYSTAL: Math.max(0, economy.upkeepPerMinute.crystal) * elapsedMinutes,
      SUPPLY: Math.max(0, economy.upkeepPerMinute.supply) * elapsedMinutes,
      OIL: Math.max(0, economy.upkeepPerMinute.oil) * elapsedMinutes
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
    const tileKeys = [...summary.territoryTileKeys].sort();
    const syntheticCommandId = `accrual:upkeep:${player.id}:${nowMs}`;
    for (const tileKey of tileKeys) {
      if (!hasOutstandingUpkeepNeed(need)) return;
      const tile = this.tiles.get(tileKey);
      if (!tile || tile.ownerId !== player.id || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") continue;
      if (!economyContext) economyContext = this.tileYieldEconomyContextForPlayer(player);
      const enrichedTile = tile.town
        ? { ...tile, town: enrichTownWithConnectedNetwork(tile, economyContext.townNetwork) }
        : tile;
      const lastCollectedAt = this.tileYieldCollectedAtByTile.get(tileKey);
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
        this.setTileYieldCollectedAt(syntheticCommandId, player.id, tileKey, Math.min(nowMs, candidateAnchorMs));
      }
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
    const previous = this.tiles.get(tileKey);
    const sameOwner = Boolean(previous?.ownerId && previous.ownerId === tile.ownerId);
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
    }
    const ownedTiles = [...summary.territoryTileKeys]
      .map((tileKey) => this.tiles.get(tileKey))
      .filter((tile): tile is DomainTileState => tile !== undefined);
    const spatialFocus = this.refreshSpatialFocusForPlayer(playerId, this.now());
    const hasActiveLock = [...this.locksByTile.values()].some((lock) => lock.playerId === playerId);
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
    const lockPlayerIds = new Set<string>();
    for (const lock of this.locksByTile.values()) {
      lockPlayerIds.add(lock.playerId);
    }
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
    hasActiveLock: boolean;
    allies: string[];
  }> {
    const lockPlayerIds = new Set<string>();
    for (const lock of this.locksByTile.values()) {
      lockPlayerIds.add(lock.playerId);
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
          hasActiveLock: lockPlayerIds.has(player.id),
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
      territoryTileKeys: string[];
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
  } {
    return {
      tiles: [...this.tiles.values()]
        .map((tile) => ({
          x: tile.x,
          y: tile.y,
          terrain: tile.terrain,
          ...(tile.resource ? { resource: tile.resource } : {}),
          ...(tile.dockId ? { dockId: tile.dockId } : {}),
          ...(tile.shardSite ? { shardSiteJson: JSON.stringify(tile.shardSite) } : {}),
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
          ...(tile.sabotage ? { sabotageJson: JSON.stringify(tile.sabotage) } : {})
        }))
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
            territoryTileKeys: [...summary.territoryTileKeys],
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
        .sort((left, right) => left.tileKey.localeCompare(right.tileKey))
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
            territoryTileKeys: [...summary.territoryTileKeys],
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
        .sort((left, right) => left.tileKey.localeCompare(right.tileKey))
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
        collected.push(domainTileToWireDelta(tile));
      }
    }
    if (options?.fullVisibility) return collected;
    return this.filterTileDeltasForPlayer(collected, playerId);
  }

  filterTileDeltasForPlayer<TDelta extends { x: number; y: number; terrain?: Terrain | undefined; ownerId?: string | undefined }>(
    tileDeltas: readonly TDelta[],
    playerId: string
  ): TDelta[] {
    if (tileDeltas.length === 0) return [];
    const primaryPlayer = this.players.get(playerId);
    if (!primaryPlayer) return [];

    // Gather per-player vision inputs once, then check each delta lazily.
    // Eager materialisation (classifyVisibilityForPlayer) would expand O(territory × R²)
    // visible keys for the whole world per subscriber per event — at staging load that
    // burns ~1.6M Set ops/sec across subscribers. With typical delta batches of 1–3 tiles
    // the lazy check is O(deltas × territory), ~10× cheaper for the same correctness.
    const playerSummary = this.summaryForPlayer(playerId);
    const playerVisionRadius = Math.max(
      1,
      Math.floor(VISION_RADIUS * (primaryPlayer.mods?.vision ?? 1)) + visionRadiusBonusForPlayer(primaryPlayer)
    );
    const allyVision: Array<{ allyId: string; territory: ReadonlySet<string>; radius: number }> = [];
    for (const allyId of primaryPlayer.allies) {
      const ally = this.players.get(allyId);
      if (!ally) continue;
      allyVision.push({
        allyId,
        territory: this.summaryForPlayer(allyId).territoryTileKeys,
        radius: Math.max(1, Math.floor(VISION_RADIUS * (ally.mods?.vision ?? 1)) + visionRadiusBonusForPlayer(ally))
      });
    }
    const allyAndSelfIds = new Set<string>([playerId, ...primaryPlayer.allies]);
    const lockOriginKeys = new Set<string>();
    const lockTargetKeys = new Set<string>();
    for (const lock of this.locksByTile.values()) {
      if (lock.playerId !== playerId) continue;
      lockOriginKeys.add(lock.originKey);
      lockTargetKeys.add(lock.targetKey);
    }
    const visibilityOwnerIds = new Set<string>([playerId, ...primaryPlayer.allies]);
    const dockRevealKeys = collectLinkedDockRevealKeysForOwners(
      visibilityOwnerIds,
      this.docks,
      (tileKey) => {
        const tile = this.tiles.get(tileKey);
        return tile?.ownershipState === "SETTLED" ? tile.ownerId : undefined;
      },
      this.dockLinksByDockTileKey,
      WORLD_WIDTH,
      WORLD_HEIGHT
    );
    const auditEnabled = Boolean(this.onVisibilityAudit);

    const filtered: TDelta[] = [];
    for (const delta of tileDeltas) {
      const tileKey = simulationTileKey(delta.x, delta.y);
      let visible = false;
      let viaLockTargetOnly = false;
      const reasons: string[] = [];

      if (this.isTileWithinTerritoryRadius(delta.x, delta.y, playerSummary.territoryTileKeys, playerVisionRadius)) {
        visible = true;
        if (auditEnabled) reasons.push("radius:self");
      }
      if (auditEnabled || !visible) {
        for (const { allyId, territory, radius } of allyVision) {
          if (this.isTileWithinTerritoryRadius(delta.x, delta.y, territory, radius)) {
            visible = true;
            if (auditEnabled) reasons.push(`radius:ally:${allyId}`);
            else break;
          }
        }
      }
      if ((auditEnabled || !visible) && lockOriginKeys.has(tileKey)) {
        visible = true;
        if (auditEnabled) reasons.push("lock-origin");
      }
      if ((auditEnabled || !visible) && dockRevealKeys.has(tileKey)) {
        visible = true;
        if (auditEnabled) reasons.push("dock-reveal");
      }
      if (lockTargetKeys.has(tileKey)) {
        if (!visible) {
          visible = true;
          viaLockTargetOnly = true;
          if (auditEnabled) reasons.push("lock-target");
        }
      }
      if (!visible) continue;

      const ownedByOther = Boolean(delta.ownerId) && !allyAndSelfIds.has(delta.ownerId as string);
      if (viaLockTargetOnly && ownedByOther) {
        if (auditEnabled && this.onVisibilityAudit) {
          this.onVisibilityAudit({
            playerId,
            tileKey,
            x: delta.x,
            y: delta.y,
            ownerId: delta.ownerId as string,
            reasons,
            redacted: true
          });
        }
        filtered.push({ x: delta.x, y: delta.y, ...(delta.terrain ? { terrain: delta.terrain } : {}) } as TDelta);
        continue;
      }
      if (ownedByOther && auditEnabled && this.onVisibilityAudit) {
        this.onVisibilityAudit({
          playerId,
          tileKey,
          x: delta.x,
          y: delta.y,
          ownerId: delta.ownerId as string,
          reasons,
          redacted: false
        });
      }
      filtered.push(delta);
    }
    return filtered;
  }

  private isTileWithinTerritoryRadius(
    x: number,
    y: number,
    territoryTileKeys: Iterable<string>,
    radius: number
  ): boolean {
    for (const tileKey of territoryTileKeys) {
      const separator = tileKey.indexOf(",");
      if (separator < 0) continue;
      const tx = Number(tileKey.slice(0, separator));
      const ty = Number(tileKey.slice(separator + 1));
      if (!Number.isInteger(tx) || !Number.isInteger(ty)) continue;
      const dxRaw = Math.abs(x - tx);
      const dyRaw = Math.abs(y - ty);
      const dx = Math.min(dxRaw, WORLD_WIDTH - dxRaw);
      if (dx > radius) continue;
      const dy = Math.min(dyRaw, WORLD_HEIGHT - dyRaw);
      if (dy > radius) continue;
      return true;
    }
    return false;
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
    const settledTiles = this.settledTilesForPlayer(player.id);
    return {
      player,
      townNetwork: buildConnectedTownNetworkForPlayer(player, this.tiles, settledTiles),
      fedTownKeys: this.fedTownKeysForPlayer(player, settledTiles),
      firstThreeTownKeys: firstThreeTownKeysForPlayer(player.id, this.orderedTownTilesForPlayer(player.id))
    };
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

  private emitPlayerStateUpdate(command: Pick<CommandEnvelope, "commandId" | "playerId">, playerId = command.playerId): void {
    const player = this.players.get(playerId);
    if (!player) return;
    this.applyManpowerRegen(player);
    const summary = this.summaryForPlayer(playerId);
    const economy = buildPlayerUpdateEconomySnapshot(player, summary, this.tiles, {
      dockLinksByDockTileKey: this.dockLinksByDockTileKey
    });
    const metrics = buildPlayerDefensibilityMetrics(playerId, this.tiles);
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

  private enqueueJob(lane: QueueLane, run: () => void, commandType?: CommandEnvelope["type"]): void {
    const job: SimulationJob = { lane, run, enqueuedAt: this.now() };
    if (commandType !== undefined) job.commandType = commandType;
    this.jobsByLane[lane].push(job);
    this.scheduleDrain();
  }

  private scheduleDrain(): void {
    if (this.drainScheduled || this.draining) return;
    this.drainScheduled = true;
    this.scheduleSoon(() => {
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
    try {
      let next = this.shiftNextJob();
      while (next) {
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
          this.scheduleDrain();
        }
      }
    }
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
      resolvesAt: validation.resolvesAt
    };
    const combatResolution = actionType === "EXPAND" ? undefined : this.buildLockedCombatResolution(baseLock);
    const lock: LockRecord = {
      ...baseLock,
      ...(combatResolution ? { combatResolution } : {})
    };
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
    return `territory-auto:${label}:${playerId}:${tileKey}:${nowMs}:${this.territoryAutomationCounter}`;
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
    const touchedTileDeltas: Array<ReturnType<SimulationRuntime["tileDeltaFromState"]>> = [];
    const yieldContext = this.tileYieldEconomyContextForPlayer(actor);
    // Iterate this player's owned tiles only (typically tens to a few
    // hundred) rather than every tile on the map (~2095). Staging telemetry
    // showed COLLECT_VISIBLE apply p99 = 286ms — the dominant cost in the
    // runtime drain — almost entirely from the O(all-map-tiles) scan that
    // rejected ~99% of iterations. summary.territoryTileKeys is maintained
    // incrementally as ownership changes, so this is O(owned-tiles).
    const summary = this.summaryForPlayer(command.playerId);
    // Split the inner-loop cost into yield-computation vs delta-build so we
    // can target the right optimisation when this apply is slow on big
    // empires. The whole-loop wall clock is already tracked via the
    // onJobApplied callback; this adds the per-phase breakdown.
    let yieldMs = 0;
    let deltaMs = 0;
    let tilesConsidered = 0;
    const sampleNow = this.now.bind(this);
    for (const tileKey of summary.territoryTileKeys) {
      const tile = this.tiles.get(tileKey);
      if (!tile || tile.ownershipState !== "SETTLED") continue;
      tilesConsidered += 1;
      const yieldStartedAt = sampleNow();
      const collected = this.collectTileYield(tile, now, command, yieldContext);
      yieldMs += sampleNow() - yieldStartedAt;
      const touched = collected.gold > 0 || Object.values(collected.strategic).some((value) => Number(value) > 0);
      if (!touched) continue;
      tiles += 1;
      gold += collected.gold;
      const deltaStartedAt = sampleNow();
      touchedTileDeltas.push(this.tileDeltaFromState(tile, yieldContext));
      deltaMs += sampleNow() - deltaStartedAt;
      for (const [resource, amount] of Object.entries(collected.strategic) as Array<
        ["FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number]
      >) {
        strategic[resource] = (strategic[resource] ?? 0) + amount;
      }
    }
    actor.points += gold;
    this.collectVisibleCooldownByPlayer.set(command.playerId, now + COLLECT_VISIBLE_COOLDOWN_MS);
    // Time each post-loop emit. The inner loop is only ~4% of COLLECT_VISIBLE
    // p99 (per #317 telemetry); the rest lives in these three calls. The
    // dominant one is almost certainly emitPlayerStateUpdate since it's
    // shared across every command apply path — fixing it once helps every
    // command, not just COLLECT_VISIBLE.
    let tileDeltaBatchEmitMs = 0;
    if (touchedTileDeltas.length > 0) {
      const startedAt = sampleNow();
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: command.commandId,
        playerId: command.playerId,
        tileDeltas: touchedTileDeltas
      });
      tileDeltaBatchEmitMs = sampleNow() - startedAt;
    }
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
      deltaMs,
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
    if (!this.spendStrategicResource(actor, "OIL", AIRPORT_BOMBARD_OIL_COST)) {
      this.emitEvent({
        eventType: "COMMAND_REJECTED",
        commandId: command.commandId,
        playerId: command.playerId,
        code: "AIRPORT_BOMBARD_INVALID",
        message: "insufficient OIL for bombardment"
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
    try {
      const parsed = JSON.parse(command.payloadJson) as { domainId?: unknown };
      if (typeof parsed.domainId === "string") domainId = parsed.domainId;
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
    const outcome = chooseDomainForPlayer(actor, domainId, this.tiles.values());
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

  private tileDeltaFromState(tile: DomainTileState, context?: RuntimeTileYieldEconomyContext): {
    x: number;
    y: number;
    terrain?: Terrain;
    resource?: string;
    dockId?: string;
    shardSiteJson?: string;
    ownerId?: string | undefined;
    ownershipState?: string | undefined;
      townJson?: string;
      townType?: "MARKET" | "FARMING";
      townName?: string;
      townPopulationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
      fortJson?: string | undefined;
      observatoryJson?: string | undefined;
      siegeOutpostJson?: string | undefined;
      economicStructureJson?: string | undefined;
      sabotageJson?: string | undefined;
      yield?: { gold?: number; strategic?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>> } | undefined;
      yieldRate?: { goldPerMinute?: number; strategicPerDay?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>> } | undefined;
      yieldCap?: { gold: number; strategicEach: number } | undefined;
    } {
    const player = tile.ownerId ? this.players.get(tile.ownerId) : undefined;
    const resolvedContext = player && context?.player.id === player.id ? context : player ? this.tileYieldEconomyContextForPlayer(player) : undefined;
    const enrichedTile = tile.town && resolvedContext ? { ...tile, town: enrichTownWithConnectedNetwork(tile, resolvedContext.townNetwork) } : tile;
    const yieldView = buildTileYieldView(enrichedTile, this.tileYieldCollectedAtByTile.get(simulationTileKey(tile.x, tile.y)), this.now(), {
      ...(player ? { player } : {}),
      ...(resolvedContext ? { fedTownKeys: resolvedContext.fedTownKeys } : {}),
      ...(resolvedContext ? { firstThreeTownKeys: resolvedContext.firstThreeTownKeys } : {}),
      tiles: this.tiles,
      dockLinksByDockTileKey: this.dockLinksByDockTileKey
    });
    return {
      x: tile.x,
      y: tile.y,
      ...(tile.terrain ? { terrain: tile.terrain } : {}),
      ...(tile.resource ? { resource: tile.resource } : {}),
      ...(tile.dockId ? { dockId: tile.dockId } : {}),
      ...(tile.shardSite ? { shardSiteJson: JSON.stringify(tile.shardSite) } : {}),
      ownerId: tile.ownerId ?? undefined,
      ownershipState: tile.ownershipState ?? undefined,
      ...(enrichedTile.town ? { townJson: JSON.stringify(enrichedTile.town) } : {}),
      ...(enrichedTile.town?.type ? { townType: enrichedTile.town.type } : {}),
      ...(enrichedTile.town?.name ? { townName: enrichedTile.town.name } : {}),
      ...(enrichedTile.town?.populationTier ? { townPopulationTier: enrichedTile.town.populationTier } : {}),
      fortJson: tile.fort ? JSON.stringify(tile.fort) : undefined,
      observatoryJson: tile.observatory ? JSON.stringify(tile.observatory) : undefined,
      siegeOutpostJson: tile.siegeOutpost ? JSON.stringify(tile.siegeOutpost) : undefined,
      economicStructureJson: tile.economicStructure ? JSON.stringify(tile.economicStructure) : undefined,
      sabotageJson: tile.sabotage ? JSON.stringify(tile.sabotage) : undefined,
      ...(yieldView?.yield ? { yield: yieldView.yield } : {}),
      ...(yieldView?.yieldRate ? { yieldRate: yieldView.yieldRate } : {}),
      ...(yieldView?.yieldCap ? { yieldCap: yieldView.yieldCap } : {})
    };
  }

  private collectTileYield(
    tile: DomainTileState,
    now: number,
    command: Pick<CommandEnvelope, "commandId" | "playerId">,
    context?: RuntimeTileYieldEconomyContext
  ): {
    gold: number;
    strategic: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>>;
  } {
    const tileKey = simulationTileKey(tile.x, tile.y);
    const player = tile.ownerId ? this.players.get(tile.ownerId) : undefined;
    const resolvedContext = player && context?.player.id === player.id ? context : player ? this.tileYieldEconomyContextForPlayer(player) : undefined;
    const enrichedTile = tile.town && resolvedContext ? { ...tile, town: enrichTownWithConnectedNetwork(tile, resolvedContext.townNetwork) } : tile;
    const yieldView = buildTileYieldView(enrichedTile, this.tileYieldCollectedAtByTile.get(tileKey), now, {
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
        this.addStrategicResource(this.players.get(tile.ownerId!)!, resource, amount);
      }
    }
    if (gold > 0 || Object.keys(strategic).length > 0) {
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
    let count = 0;
    for (const tile of this.tiles.values()) {
      if (structureType === "FORT" && tile.fort?.ownerId === playerId) count += 1;
      else if (structureType === "OBSERVATORY" && tile.observatory?.ownerId === playerId) count += 1;
      else if (structureType === "SIEGE_OUTPOST" && tile.siegeOutpost?.ownerId === playerId) count += 1;
      else if (tile.economicStructure?.ownerId === playerId && tile.economicStructure.type === structureType) count += 1;
    }
    return count;
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

    const goldCost = structureBuildGoldCost("FORT", this.ownedStructureCountForPlayer(command.playerId, "FORT"));
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
    const startedTile: DomainTileState = {
      ...target,
      fort: {
        ownerId: command.playerId,
        status: "under_construction",
        completesAt: this.now() + structureBuildDurationMs("FORT")
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
    this.scheduleAfter(structureBuildDurationMs("FORT"), () => {
      const latest = this.tiles.get(targetKey);
      if (!latest || latest.ownerId !== command.playerId || !latest.fort || latest.fort.ownerId !== command.playerId) return;
      const { completesAt: _ignoredCompletesAt, ...activeFort } = latest.fort;
      const completedTile: DomainTileState = {
        ...latest,
        economicStructure: undefined,
        fort: { ...activeFort, status: "active" }
      };
      this.replaceTileState(targetKey, completedTile);
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: command.commandId,
        playerId: command.playerId,
        tileDeltas: [this.tileDeltaFromState(completedTile)]
      });
      this.emitPlayerStateUpdate(command);
    });
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
      const latest = this.tiles.get(targetKey);
      if (!latest || latest.ownerId !== command.playerId || !latest.observatory || latest.observatory.ownerId !== command.playerId) return;
      const { completesAt: _ignoredCompletesAt, ...activeObservatory } = latest.observatory;
      const completedTile: DomainTileState = {
        ...latest,
        observatory: { ...activeObservatory, status: "active" }
      };
      this.replaceTileState(targetKey, completedTile);
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: command.commandId,
        playerId: command.playerId,
        tileDeltas: [this.tileDeltaFromState(completedTile)]
      });
      this.emitPlayerStateUpdate(command);
    });
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
    const startedTile: DomainTileState = {
      ...target,
      ...(upgradingLightOutpost ? { economicStructure: undefined } : {}),
      siegeOutpost: {
        ownerId: command.playerId,
        status: "under_construction",
        completesAt: this.now() + structureBuildDurationMs("SIEGE_OUTPOST")
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
    this.scheduleAfter(structureBuildDurationMs("SIEGE_OUTPOST"), () => {
      const latest = this.tiles.get(targetKey);
      if (!latest || latest.ownerId !== command.playerId || !latest.siegeOutpost || latest.siegeOutpost.ownerId !== command.playerId) return;
      const { completesAt: _ignoredCompletesAt, ...activeSiegeOutpost } = latest.siegeOutpost;
      const completedTile: DomainTileState = {
        ...latest,
        siegeOutpost: { ...activeSiegeOutpost, status: "active" }
      };
      this.replaceTileState(targetKey, completedTile);
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: command.commandId,
        playerId: command.playerId,
        tileDeltas: [this.tileDeltaFromState(completedTile)]
      });
      this.emitPlayerStateUpdate(command);
    });
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
      const latest = this.tiles.get(targetKey);
      if (
        !latest ||
        latest.ownerId !== command.playerId ||
        !latest.economicStructure ||
        latest.economicStructure.ownerId !== command.playerId ||
        latest.economicStructure.type !== payload.structureType
      ) {
        return;
      }
      const { completesAt: _ignoredCompletesAt, ...activeStructure } = latest.economicStructure;
      const completedTile: DomainTileState = {
        ...latest,
        economicStructure: { ...activeStructure, status: "active" }
      };
      this.replaceTileState(targetKey, completedTile);
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: command.commandId,
        playerId: command.playerId,
        tileDeltas: [this.tileDeltaFromState(completedTile)]
      });
      this.emitPlayerStateUpdate(command);
    });
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
      const latest = this.tiles.get(targetKey);
      if (!latest || latest.ownerId !== command.playerId) return;

      let completedTile: DomainTileState | undefined;
      if (latest.fort?.ownerId === command.playerId && latest.fort.status === "removing") {
        completedTile = { ...latest, fort: undefined };
      } else if (latest.observatory?.ownerId === command.playerId && latest.observatory.status === "removing") {
        completedTile = { ...latest, observatory: undefined };
      } else if (latest.siegeOutpost?.ownerId === command.playerId && latest.siegeOutpost.status === "removing") {
        completedTile = { ...latest, siegeOutpost: undefined };
      } else if (latest.economicStructure?.ownerId === command.playerId && latest.economicStructure.status === "removing") {
        completedTile = { ...latest, economicStructure: undefined };
      }
      if (!completedTile) return;

      this.replaceTileState(targetKey, completedTile);
      this.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: command.commandId,
        playerId: command.playerId,
        tileDeltas: [this.tileDeltaFromState(completedTile)]
      });
      this.emitPlayerStateUpdate(command);
    });
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

  private attackerOutpostMult(playerId: string, originX: number, originY: number): number {
    return scanOutpostMult(playerId, originX, originY, (x, y) => this.tiles.get(simulationTileKey(x, y)));
  }

  private buildLockedCombatResolution(lock: Pick<LockRecord, "actionType" | "commandId" | "playerId" | "manpowerCost" | "originKey" | "originX" | "originY" | "targetX" | "targetY" | "targetKey">): LockedCombatResolution | undefined {
    const previousTarget = this.tiles.get(lock.targetKey);
    const attackerOutpostMult = this.attackerOutpostMult(lock.playerId, lock.originX, lock.originY);
    const combat =
      lock.actionType === "EXPAND"
        ? {
            ...rollFrontierCombat(previousTarget ?? { terrain: "LAND" }, lock.actionType, undefined, { attackerOutpostMult }),
            attackerWon: true
          }
        : rollFrontierCombat(previousTarget ?? { terrain: "LAND" }, lock.actionType, undefined, { attackerOutpostMult });
    const defenderOwnerId = previousTarget?.ownerId;
    const defender = defenderOwnerId ? this.players.get(defenderOwnerId) : undefined;
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
    if (originLock?.commandId !== lock.commandId || targetLock?.commandId !== lock.commandId) return;

    this.locksByTile.delete(lock.originKey);
    this.locksByTile.delete(lock.targetKey);
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
        this.emitEvent({
          eventType: "TILE_DELTA_BATCH",
          commandId: lock.commandId,
          playerId: lock.playerId,
          tileDeltas: [this.tileDeltaFromState(resolvedOrigin)]
        });
      }
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
    return true;
  }

  private barbarianProgressGain(target: DomainTileState | undefined): number {
    if (!target) return 1;
    return target.resource || target.town || target.fort || target.siegeOutpost || target.dockId ? 2 : 1;
  }

  private applyBarbarianWalkOrMultiply(lock: LockRecord, previousTarget: DomainTileState | undefined): void {
    const gain = this.barbarianProgressGain(previousTarget);
    const sourceProgress = this.barbarianTileProgress.get(lock.originKey) ?? 0;
    const newProgress = sourceProgress + gain;
    if (newProgress >= BARBARIAN_MULTIPLY_THRESHOLD) {
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

    for (const tile of this.tiles.values()) {
      if (tile.terrain !== "LAND" || tile.ownerId) continue;
      const respawnedTile: DomainTileState = {
        ...tile,
        ownerId: playerId,
        ownershipState: "SETTLED",
        town: tile.town ?? {
          name: `Respawn ${tile.x},${tile.y}`,
          type: "FARMING",
          populationTier: "SETTLEMENT"
        }
      };
      actor.manpower = Math.max(actor.manpower, 100);
      const respawnedTileKey = simulationTileKey(tile.x, tile.y);
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
      return;
    }
  }

  private queueCommandForProcessing(command: CommandEnvelope): void {
    this.enqueueJob(laneForCommand(command), () => {
      if (
        command.type !== "ATTACK" &&
        command.type !== "EXPAND" &&
        command.type !== "SETTLE" &&
        command.type !== "BUILD_FORT" &&
        command.type !== "BUILD_OBSERVATORY" &&
        command.type !== "BUILD_SIEGE_OUTPOST" &&
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

      if (command.type === "COLLECT_SHARD") {
        this.handleCollectShardCommand(command);
        return;
      }

      if (command.type === "SYNC_ALLIANCE") {
        this.handleSyncAllianceCommand(command);
        return;
      }

      this.handleFrontierCommand(command, command.type);
    }, command.type);
  }
}

const createTilesFromInitialState = (
  initialState: RecoveredSimulationState | undefined,
  seedTiles: Map<string, DomainTileState>,
  mergeSeedTilesWithInitialState: boolean
): Map<string, DomainTileState> => {
  if (!initialState) return new Map(seedTiles);
  const recoveredTileKeys = new Set<string>();
  for (const tile of initialState.tiles) {
    recoveredTileKeys.add(simulationTileKey(tile.x, tile.y));
  }
  // Some older durable snapshots can contain only changed tiles. In that case we
  // still need to backfill untouched coordinates from the deterministic seed.
  const shouldBackfillMissingSeedTiles = !mergeSeedTilesWithInitialState && recoveredTileKeys.size < seedTiles.size;
  const mergedTiles = mergeSeedTilesWithInitialState || shouldBackfillMissingSeedTiles
    ? new Map(seedTiles)
    : new Map<string, DomainTileState>();

  for (const tile of initialState.tiles) {
    const tileKey = simulationTileKey(tile.x, tile.y);
    const seededTile = mergedTiles.get(tileKey);
    const hydratedTown = hydrateSyntheticSettlementTown(tile.town, tile.x, tile.y);
    mergedTiles.set(tileKey, {
      x: tile.x,
      y: tile.y,
      terrain: tile.terrain ?? seededTile?.terrain ?? "LAND",
      ...(tile.resource ? { resource: tile.resource } : {}),
      ...(tile.dockId ? { dockId: tile.dockId } : {}),
      ...(tile.shardSite ? { shardSite: tile.shardSite } : {}),
      ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
      ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
      ...(hydratedTown ? { town: hydratedTown } : {}),
      ...(tile.fort ? { fort: tile.fort } : {}),
      ...(tile.observatory ? { observatory: tile.observatory } : {}),
      ...(tile.siegeOutpost ? { siegeOutpost: tile.siegeOutpost } : {}),
      ...(tile.economicStructure ? { economicStructure: tile.economicStructure } : {}),
      ...(tile.sabotage ? { sabotage: tile.sabotage } : {})
    });
  }
  return mergedTiles;
};

const createDocksFromInitialState = (
  initialState: RecoveredSimulationState | undefined,
  seedDocks: DockRouteDefinition[]
): DockRouteDefinition[] =>
  (initialState?.docks ?? seedDocks).map((dock) => ({
    dockId: dock.dockId,
    tileKey: dock.tileKey,
    pairedDockId: dock.pairedDockId,
    ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {})
  }));

const parseRecoveredCombatResolution = (combatResolutionJson?: string): LockedCombatResolution | undefined => {
  if (!combatResolutionJson) return undefined;
  try {
    const parsed = JSON.parse(combatResolutionJson) as Partial<LockedCombatResolution> | undefined;
    if (!parsed || typeof parsed !== "object") return undefined;
    if (parsed.result && typeof parsed.defenderGoldLoss === "number") {
      return parsed as LockedCombatResolution;
    }
    if (parsed.result && typeof parsed.defenderGoldLoss !== "number") {
      return {
        result: parsed.result,
        defenderGoldLoss: 0
      };
    }
    return parsed as LockedCombatResolution | undefined;
  } catch {
    return undefined;
  }
};

const createLocksFromInitialState = (initialState?: RecoveredSimulationState): Map<string, LockRecord> => {
  const locksByTile = new Map<string, LockRecord>();
  if (!initialState) return locksByTile;

  for (const lock of initialState.activeLocks) {
    const combatResolution = parseRecoveredCombatResolution(lock.combatResolutionJson);
    const hydratedLock: LockRecord = {
      commandId: lock.commandId,
      playerId: lock.playerId,
      actionType: lock.actionType,
      manpowerCost: 0,
      originX: lock.originX,
      originY: lock.originY,
      targetX: lock.targetX,
      targetY: lock.targetY,
      originKey: lock.originKey,
      targetKey: lock.targetKey,
      resolvesAt: lock.resolvesAt,
      ...(combatResolution ? { combatResolution } : {})
    };
    locksByTile.set(hydratedLock.originKey, hydratedLock);
    locksByTile.set(hydratedLock.targetKey, hydratedLock);
  }

  return locksByTile;
};

const uniqueLocksByCommandId = (locks: Iterable<LockRecord>): LockRecord[] => {
  const deduped = new Map<string, LockRecord>();
  for (const lock of locks) {
    if (!deduped.has(lock.commandId)) deduped.set(lock.commandId, lock);
  }
  return [...deduped.values()];
};

const hydrateCommandHistory = ({
  commandIdsByPlayerSeq,
  recordedEventsByCommandId,
  recoveredCommandHistory
}: {
  commandIdsByPlayerSeq: Map<string, string>;
  recordedEventsByCommandId: Map<string, SimulationEvent[]>;
  recoveredCommandHistory?: RecoveredCommandHistory;
}): void => {
  if (!recoveredCommandHistory) return;

  for (const command of recoveredCommandHistory.commands) {
    if (command.type === "SYNC_ALLIANCE") continue;
    commandIdsByPlayerSeq.set(`${command.playerId}:${command.clientSeq}`, command.commandId);
  }
  for (const [commandId, events] of recoveredCommandHistory.eventsByCommandId.entries()) {
    recordedEventsByCommandId.set(commandId, [...events]);
  }
};

const requeueRecoveredCommands = ({
  recoveredCommandHistory,
  queueCommandForProcessing
}: {
  recoveredCommandHistory?: RecoveredCommandHistory;
  queueCommandForProcessing: (command: CommandEnvelope) => void;
}): void => {
  if (!recoveredCommandHistory) return;

  for (const command of recoveredCommandHistory.commands) {
    if (command.status !== "QUEUED") continue;
    if (recoveredCommandHistory.eventsByCommandId.has(command.commandId)) continue;
    queueCommandForProcessing({
      commandId: command.commandId,
      sessionId: command.sessionId,
      playerId: command.playerId,
      clientSeq: command.clientSeq,
      issuedAt: command.queuedAt,
      type: command.type,
      payloadJson: command.payloadJson
    });
  }
};
