import { fileURLToPath } from "node:url";
import { PerformanceObserver } from "node:perf_hooks";
import crypto from "node:crypto";
import fs from "node:fs";

import { Server, ServerCredentials, loadPackageDefinition, type UntypedServiceImplementation } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import {
  SIMULATION_PROTO_PATH,
  measurePlayerSubscriptionSnapshot,
  summarizePlayerSubscriptionSnapshotCache,
  type CommandEnvelope,
  type CurrentSeasonSummary,
  type PlayerSubscriptionSnapshot,
  type SeasonArchiveRow,
  type SimulationEvent,
  type SimulationSeasonState
} from "@border-empires/sim-protocol";
import { INITIAL_BARBARIAN_COUNT, WORLD_HEIGHT, WORLD_WIDTH, setWorldSeed, type Terrain } from "@border-empires/shared";

import { createSimulationCommandStore } from "../command-store-factory/command-store-factory.js";
import type { SimulationCommandStore } from "../command-store/command-store.js";
import { createSimulationEventStore } from "../event-store-factory/event-store-factory.js";
import type { SimulationEventStore } from "../event-store/event-store.js";
import { createSimulationSnapshotStore } from "../snapshot-store-factory/snapshot-store-factory.js";
import type { SimulationSnapshotStore } from "../snapshot-store/snapshot-store.js";
import { createSnapshotCheckpointManager } from "../snapshot-checkpoint-manager/snapshot-checkpoint-manager.js";
import { createWorkerSnapshotStringifier, type WorkerMemoryMetrics } from "../snapshot-stringifier/snapshot-stringifier.js";
import { createSnapshotBuilder } from "../snapshot-builder/snapshot-builder.js";
import { createAiCommandProducer } from "../ai/ai-command-producer.js";
import { createWorkerAiCommandProducer } from "../ai/ai-command-producer-worker.js";
import { recoverCommandHistory } from "../command-recovery/command-recovery.js";
import { createSystemCommandProducer } from "../ai/system-command-producer.js";
import { createWorkerSystemCommandProducer } from "../ai/system-command-producer-worker.js";
import { loadLegacySnapshotBootstrap } from "../legacy-snapshot-bootstrap/legacy-snapshot-bootstrap.js";
import { buildNextClientSeqByPlayer } from "../next-client-seq/next-client-seq.js";
import { buildPlayerSubscriptionSnapshot } from "../player-snapshot/player-snapshot.js";
import { yieldToEventLoop } from "../event-loop-yield.js";
import { enrichSnapshotTilesForGlobalVisibility } from "../live-snapshot-view/live-snapshot-view.js";
import { createSeedPlayers, createSeedWorld, type SimulationSeedProfile } from "../seed-state/seed-state.js";
import { createPlayerSubscriptionRegistry } from "../subscription-registry/subscription-registry.js";
import { createSimulationPersistenceQueue } from "../simulation-persistence-queue/simulation-persistence-queue.js";
import { SqliteWriterChannel, WriterBackedCommandStore, WriterBackedEventStore } from "../sqlite-writer-channel/sqlite-writer-channel.js";
import { applyPlayerMessageToSnapshot, applyTileDeltasToSnapshot } from "../subscription-snapshot-cache/subscription-snapshot-cache.js";
import { SimulationRuntime, type VisibilityAuditSample } from "../runtime/runtime.js";
import { loadSimulationStartupRecovery } from "../startup-recovery/startup-recovery.js";
import { createStartupReplayCompactionRunner } from "../startup-replay-compaction.js";
import { buildLeaderboardFromPlayers } from "../world-status-snapshot/world-status-snapshot.js";
import { createGlobalStatusBroadcastScheduler } from "../global-status-broadcast-scheduler/global-status-broadcast-scheduler.js";
import { personalizeSeasonVictoryObjectives } from "../personalized-season-victory/personalized-season-victory.js";
import { laneForCommand } from "../command-lane/command-lane.js";
import { createAiBudgetTracker } from "../ai/ai-time-budget-tracker.js";
import { AI_PLANNER_PHASES, createSimulationMetrics, type AiPlannerPhase } from "../metrics/metrics.js";
import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";
import { createSeasonSummaryStore } from "../season-summary-store-factory.js";
import type { SeasonSummaryStore } from "../season-summary-store.js";
import { buildArchiveRow, buildCurrentSeasonSummary, leaderboardSignature } from "../season-summary/season-summary.js";
import { createInitialSeasonState, updateSeasonVictoryTrackers } from "../season-lifecycle.js";
import { generateSeasonWorld, type SimulationMapStyle, type SimulationRulesetId } from "../season-worldgen/season-worldgen.js";
import type { AutomationPlannerDiagnostic } from "../ai/automation-command-planner.js";
import { createMainThreadTaskTracker } from "../main-thread-task-tracker/main-thread-task-tracker.js";
import { createSimRequestTracer } from "../request-tracer.js";

const parseRallyAnchor = (value: string | undefined): { x: number; y: number } | undefined => {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as { x?: unknown; y?: unknown };
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return undefined;
    if (!Number.isInteger(parsed.x) || !Number.isInteger(parsed.y)) return undefined;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return undefined;
  }
};

export type SimulationRuntimeIdentity = {
  sourceType: "legacy-snapshot" | "managed-season" | "seed-profile";
  seasonId: string;
  worldSeed: number;
  snapshotLabel?: string;
  fingerprint: string;
  playerCount: number;
  seededTileCount: number;
};

export type SimulationHealthSnapshot = {
  ok: boolean;
  runtimeIdentity: SimulationRuntimeIdentity;
  persistence: {
    degraded: boolean;
    pendingCount: number;
    lastFailureAt?: number;
    fatalError?: string;
  };
  season: {
    seasonId: string;
    worldSeed: number;
    status: SimulationSeasonState["status"];
  };
  startupRecovery: {
    recoveredCommandCount: number;
    recoveredEventCount: number;
  };
};

type ProtoCommandEnvelope = {
  command_id: string;
  session_id: string;
  player_id: string;
  client_seq: number;
  issued_at: number;
  type: string;
  payload_json: string;
};

type ProtoSeasonSummaryRequest = Record<string, never>;
type ProtoSeasonSummaryResponse = {
  ok: boolean;
  summary_json?: string;
};
type ProtoSeasonArchivesResponse = {
  ok: boolean;
  archives_json?: string;
};
type ProtoStartNextSeasonRequest = {
  force?: boolean;
};
type ProtoStartNextSeasonResponse = {
  ok: boolean;
  season_id: string;
};
type ProtoSeedBarbariansRequest = {
  count?: number;
};
type ProtoSeedBarbariansResponse = {
  ok: boolean;
  requested: number;
  placed: number;
  detail_json: string;
};

const formatNoFrontierDiagnostic = (
  source: "worker" | "runtime",
  diagnostic: AutomationPlannerDiagnostic
): string => {
  const parts = [
    `source=${source}`,
    diagnostic.playerId,
    `owned=${diagnostic.ownedTileCount ?? 0}`,
    `owned_frontier=${diagnostic.ownedFrontierTileCount ?? 0}`,
    `frontier=${diagnostic.frontierTileCountInput ?? 0}`,
    `hot=${diagnostic.hotFrontierTileCountInput ?? 0}`,
    `strategic=${diagnostic.strategicFrontierTileCountInput ?? 0}`,
    `origins=${diagnostic.frontierOriginCount ?? 0}`,
    `dock_origins=${diagnostic.dockOriginCount ?? 0}`,
    `scope_keys=${diagnostic.playerScopeKeyCount ?? 0}`,
    `scope_tiles=${diagnostic.playerScopeTileCount ?? 0}`,
    `settle=${diagnostic.settlementCandidateFound ? 1 : 0}`,
    `enemy=${diagnostic.frontierEnemyTargetCount}`,
    `enemy_player=${diagnostic.frontierEnemyPlayerTargetCount ?? 0}`,
    `barbarian=${diagnostic.frontierBarbarianTargetCount ?? 0}`,
    `neutral=${diagnostic.frontierNeutralTargetCount}`,
    `econ=${diagnostic.frontierOpportunityEconomic ?? 0}`,
    `support=${diagnostic.frontierOpportunityTownSupport ?? 0}`,
    `scout=${diagnostic.frontierOpportunityScout ?? 0}`,
    `scaffold=${diagnostic.frontierOpportunityScaffold ?? 0}`,
    `waste=${diagnostic.frontierOpportunityWaste ?? 0}`,
    `preplan=${diagnostic.preplanProgressState ?? "none"}`
  ];
  return parts.join(":");
};

type TileDeltaBatchTile = Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"][number];
type ProtoSimulationEvent = {
  event_type: string;
  command_id: string;
  player_id: string;
  message_type?: string;
  action_type: string;
  origin_x: number;
  origin_y: number;
  target_x: number;
  target_y: number;
  resolves_at: number;
  code: string;
  message: string;
  attacker_won: boolean;
  manpower_delta?: number;
  pillaged_gold?: number;
  pillaged_strategic_json?: string;
  combat_result_json?: string;
  collect_mode?: string;
  gold?: number;
  strategic_json?: string;
  tiles?: number;
  collect_x?: number;
  collect_y?: number;
  payload_json?: string;
  tile_deltas: Array<{
    x: number;
    y: number;
    terrain?: string | undefined;
    resource?: string | undefined;
    dock_id?: string | undefined;
    owner_id?: string | undefined;
    ownership_state?: string | undefined;
    frontier_decay_at?: number | undefined;
    town_json?: string | undefined;
    town_type?: string | undefined;
    town_name?: string | undefined;
    town_population_tier?: string | undefined;
    fort_json?: string | undefined;
    observatory_json?: string | undefined;
    siege_outpost_json?: string | undefined;
    economic_structure_json?: string | undefined;
    sabotage_json?: string | undefined;
    shard_site_json?: string | undefined;
    muster_json?: string | undefined;
  }>;
  tileDeltas?: Array<{
    x: number;
    y: number;
    terrain?: string | undefined;
    resource?: string | undefined;
    dockId?: string | undefined;
    ownerId?: string | null | undefined;
    ownershipState?: string | null | undefined;
    frontierDecayAt?: number | null | undefined;
    frontierDecayKind?: "NATURAL" | "ENCIRCLEMENT" | null | undefined;
    townJson?: string | undefined;
    townType?: string | undefined;
    townName?: string | undefined;
    townPopulationTier?: string | undefined;
    fortJson?: string | undefined;
    observatoryJson?: string | undefined;
    siegeOutpostJson?: string | undefined;
    economicStructureJson?: string | undefined;
    sabotageJson?: string | undefined;
    shardSiteJson?: string | undefined;
    musterJson?: string | undefined;
    yield?: {
      gold?: number;
      strategic?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>>;
    } | undefined;
    yieldRate?: {
      goldPerMinute?: number;
      strategicPerDay?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>>;
    } | undefined;
    yieldCap?: { gold: number; strategicEach: number } | undefined;
  }>;
  count?: number;
  cancelled_command_ids?: string[];
};

type SimulationServiceOptions = {
  host?: string;
  port?: number;
  sqlitePath?: string;
  applySchema?: boolean;
  checkpointEveryEvents?: number;
  checkpointForceAfterEvents?: number;
  checkpointMaxRssBytes?: number;
  checkpointMaxHeapUsedBytes?: number;
  startupReplayCompactionMinEvents?: number;
  seedProfile?: SimulationSeedProfile;
  rulesetId?: SimulationRulesetId;
  mapStyle?: SimulationMapStyle;
  aiPlayerCount?: number;
  snapshotDir?: string;
  enableAiAutopilot?: boolean;
  aiTickMs?: number;
  aiMinCommandIntervalMs?: number;
  aiMaxEventLoopLagMs?: number;
  enableSystemAutopilot?: boolean;
  systemTickMs?: number;
  globalStatusBroadcastDebounceMs?: number;
  systemPlayerIds?: string[];
  nonCompetitivePlayerIds?: ReadonlySet<string>;
  startupRecoveryTimeoutMs?: number;
  allowSeedRecoveryFallback?: boolean;
  requireDurableStartupState?: boolean;
  useAiWorker?: boolean;
  aiDryRun?: boolean;
  aiMaxCommandsPerTick?: number;
  aiDisableExpand?: boolean;
  aiDisableBuild?: boolean;
  commandStore?: SimulationCommandStore;
  eventStore?: SimulationEventStore;
  snapshotStore?: SimulationSnapshotStore;
  seasonSummaryStore?: SeasonSummaryStore;
  runtimeOptions?: ConstructorParameters<typeof SimulationRuntime>[0];
  log?: Pick<Console, "error" | "info" | "warn">;
};

type SimulationTileDelta = {
  x: number;
  y: number;
  terrain?: Terrain;
  resource?: string | undefined;
  dockId?: string | undefined;
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  frontierDecayAt?: number | undefined;
  frontierDecayKind?: "NATURAL" | "ENCIRCLEMENT" | undefined;
  townJson?: string | undefined;
  townType?: "MARKET" | "FARMING";
  townName?: string | undefined;
  townPopulationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
  fortJson?: string | undefined;
  observatoryJson?: string | undefined;
  siegeOutpostJson?: string | undefined;
  economicStructureJson?: string | undefined;
  sabotageJson?: string | undefined;
  shardSiteJson?: string | undefined;
};

const recoveredStateFromSeedWorld = (seedWorld: ReturnType<typeof createSeedWorld>): RecoveredSimulationState => ({
  tiles: [...seedWorld.tiles.values()]
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
  activeLocks: []
});

type ProtoPackage = {
  border_empires: {
    simulation: {
      SimulationService: {
        service: object;
      };
    };
  };
};

const packageDefinition = loadSync(fileURLToPath(SIMULATION_PROTO_PATH), {
  keepCase: true,
  longs: Number,
  defaults: true,
  enums: String,
  oneofs: false
});

const proto = loadPackageDefinition(packageDefinition) as unknown as ProtoPackage;

const formatGrpcBindAddress = (host: string, port: number): string =>
  host.includes(":") && !host.startsWith("[") ? `[${host}]:${port}` : `${host}:${port}`;

const toCommandEnvelope = (value: ProtoCommandEnvelope): CommandEnvelope => ({
  commandId: value.command_id,
  sessionId: value.session_id,
  playerId: value.player_id,
  clientSeq: value.client_seq,
  issuedAt: value.issued_at,
  type: value.type as CommandEnvelope["type"],
  payloadJson: value.payload_json
});

// Event types that exist purely for in-sim bookkeeping (replay anchors,
// snapshot reconstruction, etc.) and have no client-facing audience. Writing
// them to the gRPC stream wastes bandwidth and — because the gateway proto
// shape is flat — has historically tripped consumers into mis-tagging them
// as empty-code COMMAND_REJECTED. Filter them at the wire boundary so the
// gateway never sees them in the first place.
export const WIRE_INTERNAL_EVENT_TYPES: ReadonlySet<SimulationEvent["eventType"]> = new Set([
  "SETTLEMENT_STARTED",
  "TILE_YIELD_ANCHOR_UPDATED",
  "TILE_YIELD_ANCHOR_BATCH",
  "PLAYER_YIELD_COLLECTION_EPOCH_UPDATED"
]);

export const isWireInternalEvent = (event: SimulationEvent): boolean =>
  WIRE_INTERNAL_EVENT_TYPES.has(event.eventType);

export const toProtoEvent = (value: SimulationEvent): ProtoSimulationEvent => ({
  event_type: value.eventType,
  command_id: value.commandId,
  player_id: value.playerId,
  ...("messageType" in value ? { message_type: value.messageType } : {}),
  action_type: "actionType" in value ? value.actionType : "",
  origin_x: "originX" in value ? value.originX : 0,
  origin_y: "originY" in value ? value.originY : 0,
  target_x: "targetX" in value ? value.targetX : 0,
  target_y: "targetY" in value ? value.targetY : 0,
  resolves_at: "resolvesAt" in value ? value.resolvesAt : 0,
  code: "code" in value ? value.code : "",
  message: "message" in value ? value.message : "",
  attacker_won: "attackerWon" in value ? value.attackerWon : false,
  ...("manpowerDelta" in value && typeof value.manpowerDelta === "number" ? { manpower_delta: value.manpowerDelta } : {}),
  ...("pillagedGold" in value && typeof value.pillagedGold === "number" ? { pillaged_gold: value.pillagedGold } : {}),
  ...("pillagedStrategic" in value && value.pillagedStrategic ? { pillaged_strategic_json: JSON.stringify(value.pillagedStrategic) } : {}),
  ...("combatResult" in value && value.combatResult ? { combat_result_json: JSON.stringify(value.combatResult) } : {}),
  ...(value.eventType === "COLLECT_RESULT"
    ? {
        collect_mode: value.mode,
        gold: value.gold,
        strategic_json: JSON.stringify(value.strategic),
        tiles: value.tiles,
        ...(typeof value.x === "number" ? { collect_x: value.x } : {}),
        ...(typeof value.y === "number" ? { collect_y: value.y } : {})
      }
    : {}),
  ...(value.eventType === "TECH_UPDATE" || value.eventType === "DOMAIN_UPDATE" || value.eventType === "PLAYER_MESSAGE"
    ? { payload_json: value.payloadJson }
    : {}),
  ...(value.eventType === "COMBAT_CANCELLED"
    ? {
        count: value.count,
        cancelled_command_ids: value.cancelledCommandIds ?? []
      }
    : {}),
  tile_deltas:
    value.eventType === "TILE_DELTA_BATCH"
      ? value.tileDeltas.map((tile: TileDeltaBatchTile) => ({
          x: tile.x,
          y: tile.y,
          ...(tile.terrain ? { terrain: tile.terrain } : {}),
          ...(tile.resource ? { resource: tile.resource } : {}),
          ...(tile.dockId ? { dock_id: tile.dockId } : {}),
          ...("ownerId" in tile ? { owner_id: tile.ownerId ?? "" } : {}),
          ...("ownershipState" in tile ? { ownership_state: tile.ownershipState ?? "" } : {}),
          ...("frontierDecayAt" in tile ? { frontier_decay_at: tile.frontierDecayAt ?? 0 } : {}),
          ...("frontierDecayKind" in tile ? { frontier_decay_kind: tile.frontierDecayKind ?? "" } : {}),
          ...(tile.townJson ? { town_json: tile.townJson } : {}),
          ...(tile.townType ? { town_type: tile.townType } : {}),
          ...(tile.townName ? { town_name: tile.townName } : {}),
          ...(tile.townPopulationTier ? { town_population_tier: tile.townPopulationTier } : {}),
          ...("fortJson" in tile ? { fort_json: tile.fortJson ?? "" } : {}),
          ...("observatoryJson" in tile ? { observatory_json: tile.observatoryJson ?? "" } : {}),
          ...("siegeOutpostJson" in tile ? { siege_outpost_json: tile.siegeOutpostJson ?? "" } : {}),
          ...("economicStructureJson" in tile ? { economic_structure_json: tile.economicStructureJson ?? "" } : {}),
          ...("sabotageJson" in tile ? { sabotage_json: tile.sabotageJson ?? "" } : {}),
          ...("shardSiteJson" in tile ? { shard_site_json: tile.shardSiteJson ?? "" } : {}),
          ...("musterJson" in tile ? { muster_json: tile.musterJson ?? "" } : {}),
          ...("yield" in tile && tile.yield ? { yield_json: JSON.stringify(tile.yield) } : {}),
          ...("yieldRate" in tile && tile.yieldRate ? { yield_rate_json: JSON.stringify(tile.yieldRate) } : {}),
          ...("yieldCap" in tile && tile.yieldCap ? { yield_cap_json: JSON.stringify(tile.yieldCap) } : {})
        }))
      : [],
  ...(value.eventType === "TILE_DELTA_BATCH"
    ? {
        tile_delta_json: JSON.stringify(value.tileDeltas),
        tileDeltas: value.tileDeltas.map((tile: TileDeltaBatchTile) => ({
          x: tile.x,
          y: tile.y,
          ...(tile.terrain ? { terrain: tile.terrain } : {}),
          ...(tile.resource ? { resource: tile.resource } : {}),
          ...(tile.dockId ? { dockId: tile.dockId } : {}),
          ...("ownerId" in tile ? { ownerId: tile.ownerId ?? null } : {}),
          ...("ownershipState" in tile ? { ownershipState: tile.ownershipState ?? null } : {}),
          ...("frontierDecayAt" in tile ? { frontierDecayAt: tile.frontierDecayAt ?? null } : {}),
          ...("frontierDecayKind" in tile ? { frontierDecayKind: tile.frontierDecayKind ?? null } : {}),
          ...(tile.townJson ? { townJson: tile.townJson } : {}),
          ...(tile.townType ? { townType: tile.townType } : {}),
          ...(tile.townName ? { townName: tile.townName } : {}),
          ...(tile.townPopulationTier ? { townPopulationTier: tile.townPopulationTier } : {}),
          ...("fortJson" in tile ? { fortJson: tile.fortJson } : {}),
          ...("observatoryJson" in tile ? { observatoryJson: tile.observatoryJson } : {}),
          ...("siegeOutpostJson" in tile ? { siegeOutpostJson: tile.siegeOutpostJson } : {}),
          ...("economicStructureJson" in tile ? { economicStructureJson: tile.economicStructureJson } : {}),
          ...("sabotageJson" in tile ? { sabotageJson: tile.sabotageJson } : {}),
          ...("shardSiteJson" in tile ? { shardSiteJson: tile.shardSiteJson } : {}),
          ...("musterJson" in tile ? { musterJson: tile.musterJson } : {}),
          ...("yield" in tile ? { yield: tile.yield } : {}),
          ...("yieldRate" in tile ? { yieldRate: tile.yieldRate } : {}),
          ...("yieldCap" in tile ? { yieldCap: tile.yieldCap } : {})
        }))
      }
    : {})
});

// Shared serializer for both SubscribePlayer and FetchTileDetail tile arrays.
// Both are full-snapshot paths (no clear-signaling semantics) so all structure
// fields use truthy guards — absent means not present, never "was removed".
// TILE_DELTA_BATCH uses toProtoEvent with `?? ""` clear-signaling for removals;
// keep the two serializers separate.
const toFullSnapshotProtoTile = (tile: {
  x: number; y: number;
  terrain?: string | undefined; resource?: string | undefined; dockId?: string | undefined;
  ownerId?: string | undefined; ownershipState?: string | undefined;
  frontierDecayAt?: number | undefined; frontierDecayKind?: string | undefined;
  townJson?: string | undefined; townType?: string | undefined; townName?: string | undefined; townPopulationTier?: string | undefined;
  fortJson?: string | undefined; observatoryJson?: string | undefined; siegeOutpostJson?: string | undefined;
  economicStructureJson?: string | undefined; sabotageJson?: string | undefined; shardSiteJson?: string | undefined;
  musterJson?: string | undefined;
  yield?: unknown; yieldRate?: unknown; yieldCap?: unknown;
}) => ({
  x: tile.x,
  y: tile.y,
  ...(tile.terrain ? { terrain: tile.terrain } : {}),
  ...(tile.resource ? { resource: tile.resource } : {}),
  ...(tile.dockId ? { dock_id: tile.dockId } : {}),
  ...(tile.ownerId ? { owner_id: tile.ownerId } : {}),
  ...(tile.ownershipState ? { ownership_state: tile.ownershipState } : {}),
  ...(typeof tile.frontierDecayAt === "number" ? { frontier_decay_at: tile.frontierDecayAt } : {}),
  ...(tile.frontierDecayKind ? { frontier_decay_kind: tile.frontierDecayKind } : {}),
  ...(tile.townJson ? { town_json: tile.townJson } : {}),
  ...(tile.townType ? { town_type: tile.townType } : {}),
  ...(tile.townName ? { town_name: tile.townName } : {}),
  ...(tile.townPopulationTier ? { town_population_tier: tile.townPopulationTier } : {}),
  ...(tile.fortJson ? { fort_json: tile.fortJson } : {}),
  ...(tile.observatoryJson ? { observatory_json: tile.observatoryJson } : {}),
  ...(tile.siegeOutpostJson ? { siege_outpost_json: tile.siegeOutpostJson } : {}),
  ...(tile.economicStructureJson ? { economic_structure_json: tile.economicStructureJson } : {}),
  ...(tile.sabotageJson ? { sabotage_json: tile.sabotageJson } : {}),
  ...(tile.shardSiteJson ? { shard_site_json: tile.shardSiteJson } : {}),
  ...(tile.musterJson ? { muster_json: tile.musterJson } : {}),
  ...(tile.yield ? { yield_json: JSON.stringify(tile.yield) } : {}),
  ...(tile.yieldRate ? { yield_rate_json: JSON.stringify(tile.yieldRate) } : {}),
  ...(tile.yieldCap ? { yield_cap_json: JSON.stringify(tile.yieldCap) } : {})
});

const randomSeasonWorldSeed = (): number => crypto.randomInt(1, 1_000_000_000);

const buildBootstrapSeason = ({
  seasonSequence,
  rulesetId,
  mapStyle,
  aiPlayerCount,
  now
}: {
  seasonSequence: number;
  rulesetId: SimulationRulesetId;
  mapStyle: SimulationMapStyle;
  aiPlayerCount?: number;
  now: number;
}): {
  seasonState: SimulationSeasonState;
  initialState: ReturnType<typeof generateSeasonWorld>["initialState"];
  initialPlayers: ReturnType<typeof generateSeasonWorld>["initialPlayers"];
} => {
  const requestedWorldSeed = randomSeasonWorldSeed();
  const generatedWorld = generateSeasonWorld(rulesetId, requestedWorldSeed, {
    mapStyle,
    ...(typeof aiPlayerCount === "number" ? { aiPlayerCount } : {})
  });
  const seasonState = createInitialSeasonState({
    seasonSequence,
    rulesetId,
    worldSeed: generatedWorld.worldSeed,
    startedAt: now
  });
  return {
    seasonState,
    initialState: {
      ...generatedWorld.initialState,
      season: seasonState
    },
    initialPlayers: generatedWorld.initialPlayers
  };
};

type ActivePlayerIdentity = {
  id: string;
  isAi: boolean;
};

const createActivePlayerIdentityMap = (
  players: Iterable<{ id: string; isAi: boolean }>
): Map<string, ActivePlayerIdentity> =>
  new Map(
    [...players].map((player) => [
      player.id,
      {
        id: player.id,
        isAi: player.isAi
      }
    ])
  );

const createRecoveredActivePlayerIdentityMap = (
  initialState: RecoveredSimulationState | undefined,
  fallbackPlayers: ReadonlyMap<string, ActivePlayerIdentity>
): Map<string, ActivePlayerIdentity> | undefined => {
  if (!initialState?.players || initialState.players.length === 0) return undefined;
  return new Map(
    initialState.players.map((player) => [
      player.id,
      {
        id: player.id,
        isAi: player.isAi ?? fallbackPlayers.get(player.id)?.isAi ?? false
      }
    ])
  );
};

const zeroGrossIncomeRepairCandidateIds = (initialState: RecoveredSimulationState | undefined): string[] => {
  const ids = new Set<string>();
  for (const player of initialState?.players ?? []) ids.add(player.id);
  for (const tile of initialState?.tiles ?? []) {
    if (tile.ownerId) ids.add(tile.ownerId);
  }
  return [...ids];
};

const normalizeAutopilotEnabled = (value: boolean | string | number | undefined): boolean =>
  value === true || value === 1 || value === "1" || value === "true";

export const createSimulationService = async (options: SimulationServiceOptions = {}) => {
  const log = options.log ?? console;
  const nonCompetitivePlayerIds = options.nonCompetitivePlayerIds;
  const aiAutopilotEnabled = normalizeAutopilotEnabled(options.enableAiAutopilot as boolean | string | number | undefined);
  const systemAutopilotEnabled = normalizeAutopilotEnabled(
    options.enableSystemAutopilot as boolean | string | number | undefined
  );
  const commandTraceEnabled = process.env.SIMULATION_COMMAND_TRACE === "1";
  const slowSubmitWarnMs = Math.max(50, Number(process.env.SIMULATION_SLOW_SUBMIT_WARN_MS ?? 250));
  const slowRuntimeSubmitWarnMs = Math.max(10, Number(process.env.SIMULATION_SLOW_RUNTIME_SUBMIT_WARN_MS ?? 50));
  const verboseSnapshotDiagnostics = process.env.SIMULATION_VERBOSE_SNAPSHOT_DIAGNOSTICS === "1";
  const slowSnapshotBuildWarnMs = Math.max(0, Number(process.env.SIMULATION_SLOW_SNAPSHOT_BUILD_WARN_MS ?? 100));
  const simulationMetricsLogIntervalMs = Math.max(0, Number(process.env.SIMULATION_METRICS_LOG_INTERVAL_MS ?? 0));
  // Threshold for "filter fanout took too long on a single TILE_DELTA_BATCH"
  // diagnostic. Set 0 to disable. Captures total + max-per-subscriber filter
  // time so we can tell whether filterTileDeltasForPlayer is the source of
  // simulation event-loop stalls under heavy combat load.
  const slowTileDeltaFilterWarnMs = Math.max(0, Number(process.env.SIMULATION_SLOW_TILE_DELTA_FILTER_WARN_MS ?? 50));
  // Threshold for "buildCaptureRevealTileDeltas took too long" diagnostic.
  // Each successful human capture builds (2*VISION_RADIUS+1)² tile deltas;
  // under heavy combat the build itself (before fanout) could block the loop.
  const slowCaptureRevealBuildWarnMs = Math.max(0, Number(process.env.SIMULATION_SLOW_CAPTURE_REVEAL_BUILD_WARN_MS ?? 20));
  const captureRevealBuildSample = (sample: { commandId: string; playerId: string; tileCount: number; durationMs: number }): void => {
    if (slowCaptureRevealBuildWarnMs <= 0 || sample.durationMs < slowCaptureRevealBuildWarnMs) return;
    recordLagDiagnostic("warn", "capture_reveal_build_slow", sample);
  };
  const slowQueueDrainWarnMs = Math.max(25, Number(process.env.SIMULATION_SLOW_QUEUE_DRAIN_WARN_MS ?? 100));
  const slowPersistenceWarnMs = Math.max(25, Number(process.env.SIMULATION_SLOW_PERSISTENCE_WARN_MS ?? 100));
  const slowAiSyncWarnMs = Math.max(10, Number(process.env.SIMULATION_SLOW_AI_SYNC_WARN_MS ?? 50));
  const mainThreadTasks = createMainThreadTaskTracker();
  const logWriters = log as Partial<Record<"info" | "warn" | "error", (...args: unknown[]) => void>>;
  const emitLog = (level: "info" | "warn" | "error", message: string, payload: Record<string, unknown>): void => {
    const writer = logWriters[level];
    if (typeof writer === "function") {
      writer.call(log, payload, message);
      return;
    }
    console[level](message, payload);
  };
  // ---------------------------------------------------------------------------
  // Death-forensics ring buffer — rolling window of recent lag diagnostics
  // forwarded to the gateway main thread so both watchdog-kill and sim-exit
  // write paths have the sim's last known state.
  // ---------------------------------------------------------------------------
  const LAG_DIAG_RING_CAP = 50;
  type LagDiagEntry = {
    at: number;
    level: "warn" | "error";
    event: string;
    phase?: unknown;
    durationMs?: unknown;
  };
  const lagDiagRing: LagDiagEntry[] = [];
  const appendLagDiagRing = (level: "warn" | "error", event: string, payload: Record<string, unknown>): void => {
    lagDiagRing.push({
      at: Date.now(),
      level,
      event,
      ...(payload.phase !== undefined ? { phase: payload.phase } : {}),
      ...(typeof payload.durationMs === "number" ? { durationMs: payload.durationMs } : {})
    });
    if (lagDiagRing.length > LAG_DIAG_RING_CAP) lagDiagRing.shift();
  };
  const recordLagDiagnostic = (
    level: "info" | "warn" | "error",
    event: string,
    payload: Record<string, unknown>
  ): void => {
    if (level === "info") return;
    emitLog(level, `simulation lag diagnostic: ${event}`, payload);
    appendLagDiagRing(level, event, payload);
  };
  const commandTraceSample = (sample: Record<string, unknown>): void => {
    if (!commandTraceEnabled) return;
    log.info({ ...sample }, "simulation command trace");
  };
  const recordSnapshotBuildTiming = (
    phase: string,
    durationMs: number,
    payload: Record<string, unknown> = {}
  ): void => {
    if (slowSnapshotBuildWarnMs <= 0 || durationMs < slowSnapshotBuildWarnMs) return;
    recordLagDiagnostic("warn", "simulation_snapshot_build_slow", {
      phase,
      durationMs,
      ...payload
    });
  };
  const visibilityAuditAttributedEnabled = process.env.SIMULATION_VISIBILITY_AUDIT === "1";
  const visibilityAuditDedupMs = Math.max(1000, Number(process.env.SIMULATION_VISIBILITY_AUDIT_DEDUP_MS ?? 30_000));
  const visibilityAuditDedup = new Map<string, number>();
  const visibilityAuditDedupMaxEntries = 10_000;
  const handleVisibilityAudit = (sample: VisibilityAuditSample): void => {
    const isUnattributed = sample.reasons.length === 0;
    if (!isUnattributed && !visibilityAuditAttributedEnabled) return;
    const dedupKey = `${sample.playerId}:${sample.tileKey}`;
    const at = Date.now();
    const last = visibilityAuditDedup.get(dedupKey);
    if (last !== undefined && at - last < visibilityAuditDedupMs) return;
    visibilityAuditDedup.set(dedupKey, at);
    if (visibilityAuditDedup.size > visibilityAuditDedupMaxEntries) {
      const cutoff = at - visibilityAuditDedupMs * 5;
      for (const [key, ts] of visibilityAuditDedup) {
        if (ts < cutoff) visibilityAuditDedup.delete(key);
      }
    }
    emitLog(isUnattributed ? "warn" : "info", "simulation visibility audit", {
      event: isUnattributed ? "sim_visibility_unattributed" : "sim_visibility_attributed",
      playerId: sample.playerId,
      tileKey: sample.tileKey,
      x: sample.x,
      y: sample.y,
      ownerId: sample.ownerId,
      reasons: sample.reasons,
      redacted: sample.redacted
    });
  };
  const hasSqlitePath =
    typeof options.sqlitePath === "string" && options.sqlitePath.length > 0;
  const isDbBackedStartup = hasSqlitePath || options.requireDurableStartupState === true;
  const requireDurableStartupState = options.requireDurableStartupState ?? hasSqlitePath;
  const rulesetId = options.rulesetId;
  const mapStyle = options.mapStyle ?? "continents";
  const seedPlayers = createSeedPlayers(options.seedProfile);
  let snapshotStringifier: ReturnType<typeof createWorkerSnapshotStringifier> | undefined;
  // Only spin up a stringify worker for SQLite-backed deployments — full
  // snapshots there are ~18MB and inline JSON.stringify blocks the
  // simulation event loop. In-memory tests stay inline.
  if (options.sqlitePath && process.env.SIMULATION_SNAPSHOT_STRINGIFY_INLINE !== "1") {
    try {
      snapshotStringifier = createWorkerSnapshotStringifier();
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        "failed to start snapshot-stringify worker; falling back to inline JSON.stringify"
      );
    }
  }
  // Snapshot build pool: moves enrichment + assembly off the simulation event
  // loop so the sim thread is free to answer gRPC pings while the 1–3 s build
  // runs in a worker.  Falls back to sync inline build if worker unavailable.
  let snapshotBuildPool: ReturnType<typeof createSnapshotBuilder> | undefined;
  if (options.sqlitePath && process.env.SIMULATION_SNAPSHOT_BUILD_INLINE !== "1") {
    try {
      snapshotBuildPool = createSnapshotBuilder();
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        "failed to start snapshot-build workers; falling back to inline sync build"
      );
    }
  }
  // Memoise worldgen baselines per (rulesetId, worldSeed) so the snapshot
  // store can compact saves and rehydrate loads without paying the 200k-tile
  // generation cost more than once per seed per process.
  //
  // SQLite persistence layer: on first boot of a new season, generated tiles
  // are written to a `worldgen_baselines` table. On subsequent restarts the
  // table row is read instead of calling generateSeasonWorld, eliminating the
  // 30-74s synchronous block that held the sim worker event loop hostage
  // during startup recovery (root cause of the SERVER_STARTING cascade on
  // staging sim-worker restarts).
  type WorldgenTiles = ReturnType<typeof generateSeasonWorld>["initialState"]["tiles"];
  const worldgenBaselineCache = new Map<string, WorldgenTiles>();

  let worldgenDb: import("node:sqlite").DatabaseSync | undefined;
  if (options.sqlitePath) {
    const { openSqliteDatabase } = await import("../sqlite-db.js");
    worldgenDb = openSqliteDatabase(options.sqlitePath);
    // Always run CREATE TABLE IF NOT EXISTS — idempotent, and must be present
    // even when applySchema is false (e.g. first deploy that adds this table).
    worldgenDb.exec(`
      CREATE TABLE IF NOT EXISTS worldgen_baselines (
        cache_key TEXT PRIMARY KEY,
        tiles_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
  }

  const readWorldgenBaselineFromDb = (cacheKey: string): WorldgenTiles | undefined => {
    if (!worldgenDb) return undefined;
    const row = worldgenDb
      .prepare(`SELECT tiles_json FROM worldgen_baselines WHERE cache_key = ?`)
      .get(cacheKey) as { tiles_json: string } | undefined;
    if (!row) return undefined;
    try {
      return JSON.parse(row.tiles_json) as WorldgenTiles;
    } catch (err) {
      log.error({ err, cacheKey }, "worldgen_baselines row corrupt — falling back to cold generation");
      return undefined;
    }
  };

  const writeWorldgenBaselineToDb = (cacheKey: string, tiles: WorldgenTiles): void => {
    if (!worldgenDb) return;
    try {
      worldgenDb
        .prepare(`INSERT OR REPLACE INTO worldgen_baselines (cache_key, tiles_json, created_at) VALUES (?, ?, ?)`)
        .run(cacheKey, JSON.stringify(tiles), Date.now());
    } catch (err) {
      log.error({ err, cacheKey }, "failed to persist worldgen baseline to SQLite (non-fatal)");
    }
  };

  const resolveWorldgenBaseline = (input: { rulesetId: string; worldSeed: number }) => {
    if (input.rulesetId !== "seasonal-default") return [];
    const cacheKey = `${input.rulesetId}:${input.worldSeed}`;

    const inMemory = worldgenBaselineCache.get(cacheKey);
    if (inMemory) return inMemory;

    // SQLite persisted baseline survives sim-worker restarts — avoids the
    // 30-74s generateSeasonWorld block that previously held the event loop
    // hostage during startup recovery on every container restart.
    const t0 = Date.now();
    const persisted = readWorldgenBaselineFromDb(cacheKey);
    if (persisted) {
      worldgenBaselineCache.set(cacheKey, persisted);
      log.info({ cacheKey, durationMs: Date.now() - t0 }, "worldgen baseline loaded from SQLite cache (cold-start block eliminated)");
      return persisted;
    }

    // Cold generation: only on first boot of a brand-new season seed.
    log.info({ cacheKey }, "worldgen baseline not cached — running generateSeasonWorld (expected on first season boot only)");
    const genT0 = Date.now();
    const generated = generateSeasonWorld(input.rulesetId as SimulationRulesetId, input.worldSeed);
    const tiles = generated.initialState.tiles;
    const genMs = Date.now() - genT0;
    log.info({ cacheKey, durationMs: genMs, tileCount: tiles.length }, "worldgen baseline generated — persisting to SQLite");
    worldgenBaselineCache.set(cacheKey, tiles);
    writeWorldgenBaselineToDb(cacheKey, tiles);
    return tiles;
  };
  const storeFactoryOptions = {
    ...(options.sqlitePath ? { sqlitePath: options.sqlitePath } : {}),
    ...(typeof options.applySchema === "boolean" ? { applySchema: options.applySchema } : {}),
    ...(snapshotStringifier ? { stringify: snapshotStringifier } : {}),
    resolveBaseline: resolveWorldgenBaseline
  };
  const commandStoreBase =
    options.commandStore ??
    (await createSimulationCommandStore(storeFactoryOptions));
  const eventStoreBase =
    options.eventStore ??
    (await createSimulationEventStore(storeFactoryOptions));
  // Route all SQLite writes through a dedicated worker thread so the sim
  // thread's event loop is never blocked by I/O (157–822ms per write observed).
  // Only wrap when using real SQLite stores (not injected test doubles).
  // Reads stay on the sim thread; WAL mode allows concurrent readers.
  const writerChannel =
    !options.commandStore && !options.eventStore && storeFactoryOptions.sqlitePath
      ? new SqliteWriterChannel(storeFactoryOptions.sqlitePath)
      : undefined;
  const commandStore = writerChannel
    ? new WriterBackedCommandStore(writerChannel, commandStoreBase)
    : commandStoreBase;
  const eventStore = writerChannel
    ? new WriterBackedEventStore(writerChannel, eventStoreBase)
    : eventStoreBase;
  const snapshotStore =
    options.snapshotStore ??
    (await createSimulationSnapshotStore({
      ...storeFactoryOptions,
      ...(writerChannel ? { writerChannel } : {}),
      // A post-INSERT prune failure (e.g. corrupt world_events index) is made
      // non-fatal in the store so it can't wedge the checkpoint loop; surface
      // it here as a counter + log so a degraded DB is still alarmable.
      onPruneFailure: (err: unknown) => {
        simulationMetrics.incrementSimSnapshotPruneFailed();
        log.error({ err }, "snapshot prune/cleanup failed (non-fatal; snapshot already committed)");
      }
    }));
  const seasonSummaryStore =
    options.seasonSummaryStore ??
    (await createSeasonSummaryStore(storeFactoryOptions));
  let legacySnapshotBootstrap: ReturnType<typeof loadLegacySnapshotBootstrap> | undefined;
  let bootstrappedInitialPlayers: ReturnType<typeof generateSeasonWorld>["initialPlayers"] | undefined;
  let bootstrappedCurrentSummary: CurrentSeasonSummary | undefined;
  let bootstrappedSeasonState: SimulationSeasonState | undefined;
  const bootstrapManagedSeason = async ({
    seasonSequence,
    logMessage,
    logContext
  }: {
    seasonSequence: number;
    logMessage: string;
    logContext: Record<string, unknown>;
  }): Promise<{
    initialState: ReturnType<typeof generateSeasonWorld>["initialState"];
    initialCommandHistory: ReturnType<typeof recoverCommandHistory>;
    recoveredCommandCount: number;
    recoveredEventCount: number;
  }> => {
    if (!rulesetId) throw new Error("managed season bootstrap requires rulesetId");
    const bootstrap = buildBootstrapSeason({
      seasonSequence,
      rulesetId,
      mapStyle,
      ...(typeof options.aiPlayerCount === "number" ? { aiPlayerCount: options.aiPlayerCount } : {}),
      now: Date.now()
    });
    const bootstrapRuntime = new SimulationRuntime({
      ...(options.runtimeOptions ?? {}),
      initialState: bootstrap.initialState,
      initialCommandHistory: recoverCommandHistory([], []),
      mergeSeedTilesWithInitialState: false,
      initialPlayers: bootstrap.initialPlayers
    });
    const currentSummary = buildCurrentSeasonSummary({
      seasonState: bootstrap.seasonState,
      runtimeState: bootstrapRuntime.exportState(),
      onlinePlayers: 0,
      updatedAt: bootstrap.seasonState.startedAt,
      ...(options.nonCompetitivePlayerIds ? { nonCompetitivePlayerIds: options.nonCompetitivePlayerIds } : {})
    });
    await seasonSummaryStore.bootstrapSeason({
      snapshotSections: {
        initialState: bootstrap.initialState,
        commandEvents: []
      },
      currentSummary,
      createdAt: bootstrap.seasonState.startedAt
    });
    bootstrappedInitialPlayers = bootstrap.initialPlayers;
    bootstrappedCurrentSummary = currentSummary;
    bootstrappedSeasonState = bootstrap.seasonState;
    log.info(
      {
        ...logContext,
        rulesetId,
        mapStyle,
        seasonId: bootstrap.seasonState.seasonId,
        worldSeed: bootstrap.seasonState.worldSeed
      },
      logMessage
    );
    return {
      initialState: bootstrap.initialState,
      initialCommandHistory: recoverCommandHistory([], []),
      recoveredCommandCount: 0,
      recoveredEventCount: 0
    };
  };
  if (options.snapshotDir) {
    try {
      legacySnapshotBootstrap = loadLegacySnapshotBootstrap(options.snapshotDir);
    } catch (error) {
      const isMissingSnapshotFile = typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
      if (!isMissingSnapshotFile) throw error;
      log.info(
        { snapshotDir: options.snapshotDir, err: error },
        "legacy snapshot bootstrap files not found; continuing without legacy bootstrap"
      );
    }
  }
  const startupRecovery = await (async () => {
    const startupRecoveryStartedAt = Date.now();
    const timeoutMs = options.startupRecoveryTimeoutMs ?? 120_000;
    try {
      const recoveryPromise = loadSimulationStartupRecovery({
        commandStore,
        eventStore,
        snapshotStore,
        ...(options.seedProfile ? { seedProfile: options.seedProfile } : {}),
        ...(legacySnapshotBootstrap ? { bootstrapState: legacySnapshotBootstrap.initialState } : {}),
        requireDurableState: requireDurableStartupState
      });
      const recovery = await Promise.race([
        recoveryPromise,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`simulation startup recovery timed out after ${timeoutMs}ms`)), timeoutMs);
        })
      ]);
      log.info(
        {
          durationMs: Date.now() - startupRecoveryStartedAt,
          timeoutMs,
          recoveredCommandCount: recovery.recoveredCommandCount,
          recoveredEventCount: recovery.recoveredEventCount
        },
        "simulation startup recovery completed"
      );
      return recovery;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (
        rulesetId &&
        errorMessage.includes("requires durable state") &&
        !legacySnapshotBootstrap
      ) {
        return bootstrapManagedSeason({
          seasonSequence: 1,
          logMessage: "simulation bootstrapped initial managed season",
          logContext: {}
        });
      }
      if (
        !options.allowSeedRecoveryFallback ||
        legacySnapshotBootstrap ||
        !options.seedProfile ||
        requireDurableStartupState
      ) {
        log.error(
          { err: error, durationMs: Date.now() - startupRecoveryStartedAt, timeoutMs },
          "simulation startup recovery failed"
        );
        throw error;
      }
      log.error(
        { err: error, seedProfile: options.seedProfile, durationMs: Date.now() - startupRecoveryStartedAt, timeoutMs },
        "simulation startup recovery failed; falling back to seed world"
      );
      const seedWorld = createSeedWorld(options.seedProfile);
      return {
        initialState: recoveredStateFromSeedWorld(seedWorld),
        initialCommandHistory: recoverCommandHistory([], []),
        recoveredCommandCount: 0,
        recoveredEventCount: 0
      };
    }
  })();
  const recoveredSeason = startupRecovery.initialState.season;
  const shouldReplaceRecoveredSeedState =
    isDbBackedStartup &&
    !legacySnapshotBootstrap &&
    Boolean(rulesetId) &&
    Boolean(recoveredSeason) &&
    recoveredSeason!.rulesetId.startsWith("seed:") &&
    recoveredSeason!.rulesetId !== rulesetId;
  const effectiveStartupRecovery = shouldReplaceRecoveredSeedState
    ? await bootstrapManagedSeason({
        seasonSequence: 1,
        logMessage: "simulation replaced recovered seed-backed world with managed season bootstrap",
        logContext: {
          previousSeasonId: recoveredSeason!.seasonId,
          previousRulesetId: recoveredSeason!.rulesetId,
          previousWorldSeed: recoveredSeason!.worldSeed
        }
      })
    : startupRecovery;
  const shouldRepairZeroGrossIncomeSettlements =
    isDbBackedStartup ||
    Boolean(legacySnapshotBootstrap) ||
    effectiveStartupRecovery.recoveredCommandCount > 0 ||
    effectiveStartupRecovery.recoveredEventCount > 0;
  let currentSeasonState =
    effectiveStartupRecovery.initialState.season ??
    bootstrappedSeasonState ??
    createInitialSeasonState({
      seasonSequence: 1,
      rulesetId: rulesetId ?? `seed:${options.seedProfile ?? "default"}`,
      worldSeed: 0,
      startedAt: Date.now()
    });
  setWorldSeed(currentSeasonState.worldSeed);
  const runtimePlayers = legacySnapshotBootstrap?.players ?? bootstrappedInitialPlayers ?? seedPlayers;
  let runtimeSeededTileCount = effectiveStartupRecovery.initialState.tiles.length;
  const fallbackActivePlayers = createActivePlayerIdentityMap(runtimePlayers.values());
  let activePlayers =
    createRecoveredActivePlayerIdentityMap(effectiveStartupRecovery.initialState, fallbackActivePlayers) ?? fallbackActivePlayers;
  const runtimeBackgroundBatchSize = Math.max(
    1,
    Number(process.env.SIMULATION_RUNTIME_BACKGROUND_BATCH_SIZE ?? 1)
  );
  let loginExportsInFlight = 0;
  let onShardCollectedCallback: (() => void) | undefined;
  let runtime = new SimulationRuntime({
    ...(options.runtimeOptions ?? {}),
    ...(options.seedProfile ? { seedProfile: options.seedProfile } : {}),
    backgroundBatchSize: runtimeBackgroundBatchSize,
    initialState: effectiveStartupRecovery.initialState,
    initialCommandHistory: effectiveStartupRecovery.initialCommandHistory,
    mergeSeedTilesWithInitialState: !isDbBackedStartup,
    // Drain on setImmediate (next loop tick), not queueMicrotask. Microtasks
    // run inside the current task before any I/O — that means a gRPC
    // SubmitCommand handler's drain microtask blocks the ack TCP write the
    // SAME loop turn. sim_command_accept_latency_ms{human_interactive} was
    // p95 884ms in prod, entirely accounted for by the apply running before
    // the ack returned. setImmediate lets the ack leave the worker before
    // the apply starts. Drain still runs ~1ms later — no semantic change,
    // sim is still the authoritative validator (the apply emits
    // COMMAND_REJECTED via the event stream if it fails).
    scheduleSoon: (task) => void setImmediate(task),
    ...(commandTraceEnabled
      ? {
          commandTrace: (sample: Record<string, unknown>) =>
            commandTraceSample({
              source: "runtime",
              ...sample
            })
        }
      : {}),
    onQueueDrain: (sample) => {
      simulationMetrics.observeSimRuntimeDrain({
        durationMs: sample.durationMs,
        processedJobs: sample.processedJobs,
        processedByLane: sample.processedByLane
      });
      if (sample.durationMs < slowQueueDrainWarnMs) return;
      recordLagDiagnostic("warn", "runtime_queue_drain_slow", sample);
    },
    onJobApplied: (sample) => {
      simulationMetrics.observeSimRuntimeApply({
        lane: sample.lane,
        durationMs: sample.durationMs,
        ...(sample.commandType ? { commandType: sample.commandType } : {})
      });
    },
    onVisibilityAudit: handleVisibilityAudit,
    shouldPauseBackground: () => {
      if (loginExportsInFlight > 0) {
        simulationMetrics.incrementSimLoginExportPausedDrain();
        return true;
      }
      return false;
    },
    onShardCollected: () => {
      onShardCollectedCallback?.();
    },
    onCaptureRevealBuilt: captureRevealBuildSample,
    onMusterRemoteAttack: () => { simulationMetrics.incrementSimMusterRemoteAttack(); },
    onMusterRemoteBlocked: () => { simulationMetrics.incrementSimMusterRemoteBlocked(); },
    onMusterRemoteBlockedBarbarian: () => { simulationMetrics.incrementSimMusterRemoteBlockedBarbarian(); },
    ...(legacySnapshotBootstrap ? { seedTiles: legacySnapshotBootstrap.seedTiles } : {}),
    initialPlayers: runtimePlayers
  });
  const simulationMetrics = createSimulationMetrics();
  const runtimeIdentity = (): SimulationRuntimeIdentity => {
    if (legacySnapshotBootstrap) {
      return {
        ...legacySnapshotBootstrap.runtimeIdentity,
        playerCount: activePlayers.size,
        seededTileCount: runtimeSeededTileCount
      };
    }
    const sourceType: SimulationRuntimeIdentity["sourceType"] = rulesetId ? "managed-season" : "seed-profile";
    const fingerprint = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          sourceType,
          seasonId: currentSeasonState.seasonId,
          worldSeed: currentSeasonState.worldSeed,
          seededTileCount: runtimeSeededTileCount
        })
      )
      .digest("hex");
    return {
      sourceType,
      seasonId: currentSeasonState.seasonId,
      worldSeed: currentSeasonState.worldSeed,
      fingerprint,
      playerCount: activePlayers.size,
      seededTileCount: runtimeSeededTileCount
    };
  };
  const startupReplayCompactionMinEvents = Math.max(
    1,
    options.startupReplayCompactionMinEvents ?? 10_000
  );
  let lastCpuSampleAt = Date.now();
  let lastCpuUsage = process.cpuUsage();
  const pendingGcDurationsMs: number[] = [];
  let gcObserver: PerformanceObserver | undefined;
  try {
    gcObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (Number.isFinite(entry.duration) && entry.duration >= 0) pendingGcDurationsMs.push(entry.duration);
      }
    });
    gcObserver.observe({ entryTypes: ["gc"] });
  } catch {
    gcObserver = undefined;
  }
  let checkpointSaveStartMs = 0;
  const snapshotCheckpointManager = createSnapshotCheckpointManager({
    eventStore,
    snapshotStore,
    exportSnapshotSections: async () => {
      const snapshotSections = await runtime.exportSnapshotSectionsAsync(yieldToEventLoop);
      return {
        ...snapshotSections,
        initialState: {
          ...snapshotSections.initialState,
          season: currentSeasonState
        }
      };
    },
    checkpointEveryEvents: options.checkpointEveryEvents ?? 5000,
    ...(typeof options.checkpointForceAfterEvents === "number"
      ? { forceCheckpointAfterEvents: options.checkpointForceAfterEvents }
      : {}),
    ...(typeof options.checkpointMaxRssBytes === "number" ? { maxCheckpointRssBytes: options.checkpointMaxRssBytes } : {}),
    ...(typeof options.checkpointMaxHeapUsedBytes === "number"
      ? { maxCheckpointHeapUsedBytes: options.checkpointMaxHeapUsedBytes }
      : {}),
    onCheckpointPhase: ({ phase, pendingEvents, memoryUsage, lastAppliedEventId }) => {
      simulationMetrics.setSimCheckpointRssMb(memoryUsage.rssBytes / (1024 * 1024));
      if (phase === "before_save") checkpointSaveStartMs = Date.now();
      if (phase === "after_save" && checkpointSaveStartMs > 0) {
        simulationMetrics.observeSimCheckpointExportMs(Date.now() - checkpointSaveStartMs);
        checkpointSaveStartMs = 0;
      }
      // Replay-cache observability: recordedCommandHistorySize is the count of
      // commands whose events embed in this snapshot (previously leaked to 122k);
      // recordedHistoryEvicted>0 means an unforeseen server prefix is leaking past
      // the classification gate and hitting the hard cap.
      const replayCacheStats = phase === "before_save" ? runtime.replayCacheStats() : undefined;
      if (replayCacheStats) simulationMetrics.setReplayCacheStats(replayCacheStats);
      log.info(
        {
          phase,
          pendingEvents,
          rssBytes: memoryUsage.rssBytes,
          heapUsedBytes: memoryUsage.heapUsedBytes,
          heapTotalBytes: memoryUsage.heapTotalBytes,
          ...(typeof lastAppliedEventId === "number" ? { lastAppliedEventId } : {}),
          ...(replayCacheStats ? { replayCache: replayCacheStats } : {})
        },
        phase === "skipped_high_memory"
          ? "simulation checkpoint deferred due to memory watermark"
          : "simulation checkpoint phase"
      );
    }
  });
  // Wire the deferred callback so CACHE shard collections trigger an immediate checkpoint.
  onShardCollectedCallback = () => {
    void snapshotCheckpointManager.checkpointNow().catch((error) => {
      log.error({ err: error }, "simulation forced checkpoint after shard collect failed");
    });
  };
  const runStartupReplayCompaction = createStartupReplayCompactionRunner({
    checkpointNow: snapshotCheckpointManager.checkpointNow,
    recoveredEventCount: effectiveStartupRecovery.recoveredEventCount,
    startupReplayCompactionMinEvents,
    log
  });
  let startupReplayCompactionPromise: Promise<void> | undefined;
  let fatalPersistenceError: Error | undefined;
  const persistenceQueue = createSimulationPersistenceQueue({
    commandStore,
    eventStore,
    onEventStoreWrite: (durationMs) => simulationMetrics.observeSimEventStoreWriteMs(durationMs),
    onDiagnostic: (sample) => {
      if (!sample.failed && sample.durationMs < slowPersistenceWarnMs) return;
      recordLagDiagnostic(sample.failed ? "error" : "warn", "simulation_persistence_slow", sample);
    },
    onEventPersisted: () => {
      void snapshotCheckpointManager.onEventPersisted().catch((error) => {
        log.error({ err: error }, "simulation snapshot checkpoint failed");
      });
    },
    onPersistenceFailure: (error) => {
      if (fatalPersistenceError) return;
      fatalPersistenceError = error;
      recordLagDiagnostic("error", "simulation_persistence_failed", {
        error: error.message
      });
      log.error({ err: error }, "simulation entering fatal persistence failure mode");
      // Dump the error to /data/ before exiting so flyctl logs don't need to
      // retain it — the file survives the restart and is logged on next boot.
      try {
        const stamp = new Date().toISOString();
        const payload = JSON.stringify({ at: stamp, error: error.message, stack: error.stack ?? "" });
        fs.writeFileSync("/data/last-persistence-failure.json", payload);
      } catch {
        // /data/ may not exist in dev; ignore silently
      }
      setTimeout(() => {
        process.exitCode = 1;
        process.kill(process.pid, "SIGTERM");
      }, 25).unref();
    },
    log
  });
  const server = new Server();
  const eventStreams = new Set<{ write: (event: ProtoSimulationEvent) => void }>();
  const subscriptionRegistry = createPlayerSubscriptionRegistry();
  const snapshotCacheByPlayerId = new Map<string, PlayerSubscriptionSnapshot>();
  // Post-season proto-tile cache: tiles are frozen after season end so the
  // marshalled proto tile array is an immutable constant for a given seasonId.
  // All players get identical full-visibility tiles post-season, so one cached
  // array can be shared across all concurrent SubscribePlayer RPCs.
  let postSeasonProtoTilesCache: { seasonId: string; tiles: ReturnType<typeof toFullSnapshotProtoTile>[] } | undefined;
  let sharedFullVisibilityTilesCache: PlayerSubscriptionSnapshot["tiles"] | undefined;
  const invalidateSharedFullVisibilityTilesCache = (): void => {
    sharedFullVisibilityTilesCache = undefined;
  };
  const sharedFullVisibilityTiles = (runtimeState: ReturnType<SimulationRuntime["exportState"]>): PlayerSubscriptionSnapshot["tiles"] => {
    if (!sharedFullVisibilityTilesCache) sharedFullVisibilityTilesCache = enrichSnapshotTilesForGlobalVisibility(runtimeState);
    return sharedFullVisibilityTilesCache;
  };
  // Batch coalescing for full-visibility exports (season-ended / spectator).
  // Each 202k-tile exportStateAsync produces a fresh runtimeState object, which
  // busts the WeakMap-keyed economy caches inside buildLivePlayerEconomySnapshot.
  // Sharing one in-flight promise means all concurrent full-vis logins get the
  // same runtimeState → economy caches hit for every player after the first.
  type FullVisExport = ReturnType<SimulationRuntime["exportState"]>;
  let inFlightFullVisExportPromise: Promise<FullVisExport> | undefined;
  const getOrStartFullVisExport = (): Promise<FullVisExport> => {
    if (!inFlightFullVisExportPromise) {
      inFlightFullVisExportPromise = runtime.exportStateAsync(yieldToEventLoop).finally(() => {
        inFlightFullVisExportPromise = undefined;
      });
    }
    return inFlightFullVisExportPromise;
  };
  const refreshSnapshotCacheMetrics = () => {
    const cacheSummary = summarizePlayerSubscriptionSnapshotCache(snapshotCacheByPlayerId.entries());
    simulationMetrics.setSimSnapshotCache({
      entries: cacheSummary.entryCount,
      bytes: cacheSummary.totalSnapshotJsonBytes
    });
    return cacheSummary;
  };
  const setCachedSnapshot = (playerId: string, snapshot: PlayerSubscriptionSnapshot) => {
    snapshotCacheByPlayerId.set(playerId, snapshot);
    return refreshSnapshotCacheMetrics();
  };
  const deleteCachedSnapshot = (playerId: string) => {
    snapshotCacheByPlayerId.delete(playerId);
    return refreshSnapshotCacheMetrics();
  };
  const clearCachedSnapshots = () => {
    snapshotCacheByPlayerId.clear();
    postSeasonProtoTilesCache = undefined;
    return refreshSnapshotCacheMetrics();
  };
  const stopGameplayTickers = (): void => {
    if (shardRainTicker) { clearInterval(shardRainTicker); shardRainTicker = undefined; }
    if (tileSheddingTicker) { clearInterval(tileSheddingTicker); tileSheddingTicker = undefined; }
    if (territoryAutomationTicker) { clearInterval(territoryAutomationTicker); territoryAutomationTicker = undefined; }
    if (orphanLockSweepTicker) { clearInterval(orphanLockSweepTicker); orphanLockSweepTicker = undefined; }
    if (watchedMusterTicker) { clearInterval(watchedMusterTicker); watchedMusterTicker = undefined; }
    if (populationGrowthTicker) { clearInterval(populationGrowthTicker); populationGrowthTicker = undefined; }
    if (passiveIncomeTicker) { clearInterval(passiveIncomeTicker); passiveIncomeTicker = undefined; }
    log.info("season ended — gameplay tickers stopped");
  };
  // Proactively build and cache full-vis snapshots for all subscribed players
  // immediately after season end. Tiles are frozen post-season so cached
  // snapshots stay valid indefinitely. Concurrent logins share one runtimeState
  // via getOrStartFullVisExport + sharedFullVisibilityTiles batch coalescing.
  const warmSeasonEndSnapshots = (): void => {
    const playerIds = subscriptionRegistry.subscribedPlayerIds();
    if (playerIds.length === 0) return;
    log.info({ playerCount: playerIds.length }, "[season_end_warm] warming full-vis snapshots");
    for (const playerId of playerIds) {
      void buildAndCachePlayerSnapshotAsync(playerId, {
        cacheSnapshot: true,
        trigger: "season_end_warm"
      }).then(() => {
        simulationMetrics.incrementSimSeasonEndSnapshotWarm();
      }).catch((err: unknown) => {
        simulationMetrics.incrementSimSeasonEndSnapshotWarmFailed();
        log.error({ err, playerId }, "[season_end_warm] snapshot warm failed");
      });
    }
  };
  const recordSnapshotDiagnostics = (
    playerId: string,
    snapshot: PlayerSubscriptionSnapshot,
    options: { trigger: string; fullVisibility: boolean; seasonEnded: boolean; worldTileCount: number }
  ) => {
    const measure = measurePlayerSubscriptionSnapshot(snapshot);
    const cacheSummary = refreshSnapshotCacheMetrics();
    const memory = process.memoryUsage();
    const rssMb = memory.rss / (1024 * 1024);
    const heapUsedMb = memory.heapUsed / (1024 * 1024);
    simulationMetrics.observeSimSnapshotBuild({
      trigger: options.trigger,
      playerId,
      fullVisibility: options.fullVisibility ? 1 : 0,
      seasonEnded: options.seasonEnded ? 1 : 0,
      tileCount: measure.tileCount,
      snapshotJsonBytes: measure.snapshotJsonBytes,
      tilesJsonBytes: measure.tilesJsonBytes,
      worldStatusJsonBytes: measure.worldStatusJsonBytes,
      cacheEntries: cacheSummary.entryCount,
      cacheBytes: cacheSummary.totalSnapshotJsonBytes,
      rssMb,
      heapUsedMb
    });
    if (verboseSnapshotDiagnostics) {
      log.info(
        {
          trigger: options.trigger,
          playerId,
          fullVisibility: options.fullVisibility,
          seasonEnded: options.seasonEnded,
          tileCount: measure.tileCount,
          worldTileCount: options.worldTileCount,
          snapshotJsonBytes: measure.snapshotJsonBytes,
          tilesJsonBytes: measure.tilesJsonBytes,
          playerJsonBytes: measure.playerJsonBytes,
          worldStatusJsonBytes: measure.worldStatusJsonBytes,
          seasonJsonBytes: measure.seasonJsonBytes,
          docksJsonBytes: measure.docksJsonBytes,
          cacheEntries: cacheSummary.entryCount,
          cacheBytes: cacheSummary.totalSnapshotJsonBytes,
          cacheTopPlayers: cacheSummary.topEntries,
          rssMb,
          heapUsedMb
        },
        "simulation snapshot diagnostics"
      );
    }
  };
  const preparePlayerSlowLogMs = 250;
  // 5s: Phase 3b broadcast uses cheap player-only path (no tile export).
  const globalStatusBroadcastDebounceMs = options.globalStatusBroadcastDebounceMs ?? 5000;
  let metricsTicker: ReturnType<typeof setInterval> | undefined;
  let eventLoopSampler: ReturnType<typeof setInterval> | undefined;
  let shardRainTicker: ReturnType<typeof setInterval> | undefined;
  let tileSheddingTicker: ReturnType<typeof setInterval> | undefined;
  let territoryAutomationTicker: ReturnType<typeof setInterval> | undefined;
  let orphanLockSweepTicker: ReturnType<typeof setInterval> | undefined;
  let watchedMusterTicker: ReturnType<typeof setInterval> | undefined;
  let populationGrowthTicker: ReturnType<typeof setInterval> | undefined;
  let passiveIncomeTicker: ReturnType<typeof setInterval> | undefined;
  let eventLoopWindowMaxMs = 0;
  let latestEventLoopLagMs = 0;
  let expectedEventLoopTickAt = Date.now() + 100;
  let lastSimulationMetricsLogAt = 0;
  let currentSummary = bootstrappedCurrentSummary;
  let currentSummarySignature = currentSummary ? leaderboardSignature(currentSummary) : "";
  let lastCurrentSummaryPersistedAt = currentSummary?.updatedAt ?? 0;
  let seasonVictoryTimer: ReturnType<typeof setTimeout> | undefined;
  let seasonRolloverInFlight = false;
  const sampleCpuPercent = (): number => {
    const at = Date.now();
    const elapsedMicros = Math.max(1, at - lastCpuSampleAt) * 1_000;
    const cpuUsage = process.cpuUsage(lastCpuUsage);
    lastCpuUsage = process.cpuUsage();
    lastCpuSampleAt = at;
    return ((cpuUsage.user + cpuUsage.system) / elapsedMicros) * 100;
  };
  // Async variant used by SubscribePlayer to interleave the heavy per-tile
  // enrichment with grpc dispatch + watchdog heartbeats. See player-snapshot.ts
  // for the duplication rationale.
  const buildAndCachePlayerSnapshotAsync = async (
    playerId: string,
    options?: { includeWorldStatus?: boolean; fullVisibility?: boolean; trigger?: string; cacheSnapshot?: boolean }
  ): Promise<PlayerSubscriptionSnapshot> => {
    // Phase 4: block ai-lane drain jobs for the full snapshot build duration
    // (runtime export + enrichment both yield dozens of times for large empires).
    // System-lane jobs are NOT paused — they settle commands the export depends on.
    loginExportsInFlight += 1;
    try {
    const totalStartedAt = Date.now();
    const seasonEnded = currentSeasonState.status === "ended";
    const useFullVisibility = options?.fullVisibility === true || seasonEnded;
    const runtimeExportStartedAt = Date.now();
    // Phase 3a: a normal bootstrap no longer pays the ~10s full-world
    // exportStateAsync. We serve the player's visible tiles and attach the
    // leaderboard / season-victory from the cached season summary below. Only
    // the full-visibility paths (season-ended / admin spectator) still need the
    // whole world materialised.
    const needsFullWorldExport = useFullVisibility;
    // Use the shared coalesced export so all concurrent full-vis logins
    // share one runtimeState object — hits WeakMap economy caches for all.
    const worldStatusRuntimeState = needsFullWorldExport
      ? await getOrStartFullVisExport()
      : undefined;
    // Route the per-player visible export through the async chunked path
    // when we don't already have a full-world runtime state captured.
    // exportVisibleStateForPlayer was the last contiguous sync block in
    // the bootstrap snapshot pipeline after PR #343 made the downstream
    // enrichment chunked — for a player with ~13k owned tiles the vision
    // raster + visible-tile map was its own multi-second main-thread block.
    const runtimeState =
      worldStatusRuntimeState ?? (await runtime.exportVisibleStateForPlayerAsync(playerId, yieldToEventLoop));
    recordSnapshotBuildTiming("runtime_export_async", Date.now() - runtimeExportStartedAt, {
      playerId,
      trigger: options?.trigger ?? "",
      fullVisibility: useFullVisibility,
      includeWorldStatus: options?.includeWorldStatus === true
    });
    const respawnNotice = runtime.peekRespawnNoticeForPlayer(playerId);
    const snapshotBuildStartedAt = Date.now();
    const buildOpts = {
      includeWorldStatus: needsFullWorldExport,
      fullVisibility: useFullVisibility,
      // Pass pre-computed global tiles so the worker skips the O(202k) enrichment.
      ...(useFullVisibility ? { sharedFullVisibilityTiles: sharedFullVisibilityTiles(runtimeState) } : {}),
      // worldStatusRuntimeState is always === runtimeState for full-vis; the
      // worker falls back to runtimeState automatically, so omit it here.
      seasonState: currentSeasonState,
      ...(respawnNotice ? { respawnNotice } : {}),
      ...(nonCompetitivePlayerIds ? { nonCompetitivePlayerIds } : {})
    };
    // Full-visibility builds (season-ended / spectator) bypass the worker pool.
    // For full-vis the per-tile enrichment is already memoised on the main
    // thread via sharedFullVisibilityTiles (passed in buildOpts and reused by
    // reference in player-snapshot.ts), so the worker has nothing to compute —
    // it would only structured-clone the entire 202k-tile runtimeState across
    // the boundary and clone the 202k-tile snapshot back. That clone was a ~4s
    // synchronous block on the sim event loop per login (prod snapshot_materialize
    // 4134ms), which stacked across bootstrap retries and killed the sim worker,
    // wedging post-season logins. Inline reuses the cached tiles by reference and
    // does only the cheap per-player economy/worldStatus work (~100ms). The
    // worker still serves fog-of-war logins, where enrichment is per-player and
    // the returned tile set is small.
    const useWorkerBuild = snapshotBuildPool !== undefined && !useFullVisibility;
    if (useFullVisibility) simulationMetrics.incrementSimFullVisInlineBuild();
    const snapshot = useWorkerBuild
      ? await snapshotBuildPool!.build(playerId, runtimeState, buildOpts)
      : buildPlayerSubscriptionSnapshot(playerId, runtimeState, undefined, buildOpts);
    recordSnapshotBuildTiming("snapshot_materialize", Date.now() - snapshotBuildStartedAt, {
      playerId,
      trigger: options?.trigger ?? "",
      fullVisibility: useFullVisibility,
      tileCount: snapshot.tiles.length
    });
    if (!useFullVisibility || options?.cacheSnapshot === true) {
      const cacheStartedAt = Date.now();
      setCachedSnapshot(playerId, snapshot);
      recordSnapshotBuildTiming("cache_snapshot", Date.now() - cacheStartedAt, {
        playerId,
        trigger: options?.trigger ?? "",
        tileCount: snapshot.tiles.length
      });
    }
    const diagnosticsStartedAt = Date.now();
    recordSnapshotDiagnostics(playerId, snapshot, {
      trigger:
        options?.trigger ??
        (seasonEnded && options?.fullVisibility !== true
          ? "season_ended_full_visibility"
          : options?.includeWorldStatus === true
            ? "subscribe_with_world_status"
            : "live_subscribe"),
      fullVisibility: useFullVisibility,
      seasonEnded,
      worldTileCount: WORLD_WIDTH * WORLD_HEIGHT
    });
    recordSnapshotBuildTiming("snapshot_diagnostics", Date.now() - diagnosticsStartedAt, {
      playerId,
      trigger: options?.trigger ?? "",
      tileCount: snapshot.tiles.length
    });
    recordSnapshotBuildTiming("total_async", Date.now() - totalStartedAt, {
      playerId,
      trigger: options?.trigger ?? "",
      fullVisibility: useFullVisibility,
      includeWorldStatus: options?.includeWorldStatus === true,
      tileCount: snapshot.tiles.length
    });
    // Phase 3a: for a normal bootstrap (world status requested but no full-world
    // export), attach the leaderboard / season-victory from the cached season
    // summary so the client still receives world_status at INIT without paying
    // the export. Self rank/progress fills in on the next global-status push.
    if (options?.includeWorldStatus === true && !needsFullWorldExport) {
      const summary = await readCurrentSummary();
      return { ...snapshot, worldStatus: { leaderboard: summary.leaderboard, seasonVictory: summary.seasonVictory } };
    }
    return snapshot;
    } finally {
      loginExportsInFlight -= 1;
    }
  };
  // Per-(player, mode) in-flight subscribe deduplication. Resolves the
  // "thundering herd" of bootstrap retries that piled up sequentially in the
  // 2026-05-20 outage: client gateway timed out at 10s and retried 4× while a
  // single buildAndCachePlayerSnapshot was still running on the main thread,
  // amplifying the stall to 100+ seconds. Sharing the in-flight promise means
  // retry N+1 returns the same snapshot as N without rebuilding.
  type InFlightSubscribeKey = string;
  const inFlightSubscribeBuilds = new Map<InFlightSubscribeKey, Promise<PlayerSubscriptionSnapshot>>();
  const buildSubscribeKey = (playerId: string, mode: string, fullVisibility: boolean): InFlightSubscribeKey =>
    `${playerId}|${mode}|${fullVisibility ? "1" : "0"}`;
  const clearSeasonVictoryTimer = (): void => {
    if (!seasonVictoryTimer) return;
    clearTimeout(seasonVictoryTimer);
    seasonVictoryTimer = undefined;
  };
  const scheduleSeasonVictoryRecheck = (at: number | undefined): void => {
    clearSeasonVictoryTimer();
    if (currentSeasonState.status === "ended") return;
    // `at` undefined = no contested objective; 5-min fallback keeps season-victory fresh (Phase 3b).
    const delayMs = typeof at === "number" ? Math.max(0, at - Date.now()) : 300_000;
    seasonVictoryTimer = setTimeout(() => {
      void recomputeAndPersistCurrentSummary({ forcePersist: true, commandId: `season-victory:${Date.now()}` });
    }, delayMs);
  };
  const persistCurrentSummary = async (summary: CurrentSeasonSummary, force = false): Promise<void> => {
    const signature = leaderboardSignature(summary);
    const enoughTimePassed = summary.updatedAt - lastCurrentSummaryPersistedAt >= 15_000;
    if (!force && signature === currentSummarySignature && !enoughTimePassed) return;
    await seasonSummaryStore.saveCurrentSummary(summary);
    currentSummary = summary;
    currentSummarySignature = signature;
    lastCurrentSummaryPersistedAt = summary.updatedAt;
  };
  const recomputeAndPersistCurrentSummary = async ({
    forcePersist = false,
    commandId,
    runtimeState: providedRuntimeState
  }: {
    forcePersist?: boolean;
    commandId?: string;
    /** Pass an already-fetched export to avoid a redundant O(202k-tile) scan. */
    runtimeState?: ReturnType<SimulationRuntime["exportState"]>;
  } = {}): Promise<CurrentSeasonSummary> => {
    // Reuse a caller-provided export snapshot to skip the expensive O(202k) tile
    // scan when the caller already holds a fresh snapshot (e.g. flushGlobalStatusBroadcast).
    // Use the async chunked path when no snapshot is provided — avoids blocking the
    // main thread for the full 202k-tile synchronous scan (season victory timer, cold start).
    const runtimeState = providedRuntimeState ?? await runtime.exportStateAsync(yieldToEventLoop);
    const baseSummary = buildCurrentSeasonSummary({
      seasonState: currentSeasonState,
      runtimeState,
      onlinePlayers: subscriptionRegistry.subscribedPlayerIds().length,
      updatedAt: Date.now(),
      acceptLatencyP95Ms: simulationMetrics.currentAcceptLatencyP95Ms(),
      ...(options.nonCompetitivePlayerIds ? { nonCompetitivePlayerIds: options.nonCompetitivePlayerIds } : {})
    });
    const trackerResult = updateSeasonVictoryTrackers({
      seasonState: currentSeasonState,
      objectives: baseSummary.seasonVictory,
      now: baseSummary.updatedAt
    });
    currentSeasonState = trackerResult.seasonState;
    scheduleSeasonVictoryRecheck(trackerResult.nextTimerAt);
    const finalSummary =
      trackerResult.changed || trackerResult.crownedWinner
        ? buildCurrentSeasonSummary({
            seasonState: currentSeasonState,
            runtimeState,
            onlinePlayers: subscriptionRegistry.subscribedPlayerIds().length,
            updatedAt: baseSummary.updatedAt,
            acceptLatencyP95Ms: simulationMetrics.currentAcceptLatencyP95Ms(),
            ...(options.nonCompetitivePlayerIds ? { nonCompetitivePlayerIds: options.nonCompetitivePlayerIds } : {})
          })
        : {
            ...baseSummary,
            seasonVictory: trackerResult.objectives
          };
    await persistCurrentSummary(finalSummary, forcePersist || Boolean(trackerResult.crownedWinner));
    if (trackerResult.crownedWinner) {
      clearCachedSnapshots();
      closeAutopilots();
      log.info("autopilots stopped on season end");
      warmSeasonEndSnapshots();
      if (commandId) scheduleGlobalStatusBroadcast(commandId);
    }
    return finalSummary;
  };
  const parseSubscribeOptions = (
    subscriptionJson: string | undefined
  ): { mode: "bootstrap-only" | "live"; emitBootstrapEvent: boolean; subscriptionKey?: string; fullVisibility: boolean; trigger?: string } => {
    if (!subscriptionJson) return { mode: "live", emitBootstrapEvent: true, fullVisibility: false };
    try {
      const parsed = JSON.parse(subscriptionJson) as {
        mode?: unknown;
        emitBootstrapEvent?: unknown;
        subscriptionKey?: unknown;
        fullVisibility?: unknown;
        trigger?: unknown;
      };
      return {
        mode: parsed.mode === "bootstrap-only" ? "bootstrap-only" : "live",
        emitBootstrapEvent: parsed.emitBootstrapEvent === false ? false : parsed.mode === "bootstrap-only" ? false : true,
        ...(typeof parsed.subscriptionKey === "string" && parsed.subscriptionKey.length > 0 ? { subscriptionKey: parsed.subscriptionKey } : {}),
        fullVisibility: parsed.fullVisibility === true,
        ...(typeof parsed.trigger === "string" && parsed.trigger.length > 0 ? { trigger: parsed.trigger } : {})
      };
    } catch {
      return { mode: "live", emitBootstrapEvent: true, fullVisibility: false };
    }
  };
  let nextSubscriptionNamespace = 0;
  const performGlobalStatusBroadcast = async (commandId: string | undefined): Promise<void> => {
    if (subscriptionRegistry.subscribedPlayerIds().length === 0) return;
    if (persistenceQueue.isDegraded() || persistenceQueue.pendingCount() > 250) return;
    // Phase 3b: O(n_players) player-only fetch replaces the O(202k-tile) exportStateAsync.
    // Season-victory objectives are served from the cached currentSummary; they stay fresh
    // via the recomputeAndPersistCurrentSummary timer (every 5 min or on victory pressure).
    const globalLeaderboard = buildLeaderboardFromPlayers(
      runtime.getPlayersForLeaderboard(),
      options.nonCompetitivePlayerIds
    );
    if (currentSummary) {
      const refreshed = {
        ...currentSummary,
        leaderboard: globalLeaderboard,
        overall: globalLeaderboard.overall,
        byTiles: globalLeaderboard.byTiles,
        byIncome: globalLeaderboard.byIncome,
        byTechs: globalLeaderboard.byTechs,
        updatedAt: Date.now()
      };
      const sig = leaderboardSignature(refreshed);
      if (sig !== currentSummarySignature) { currentSummary = refreshed; currentSummarySignature = sig; }
    }
    const acceptLatencyP95Ms = simulationMetrics.currentAcceptLatencyP95Ms();
    for (const subscribedPlayerId of subscriptionRegistry.subscribedPlayerIds()) {
      const selfOverall = globalLeaderboard.overall.find((e) => e.id === subscribedPlayerId);
      const selfByTiles = globalLeaderboard.byTiles.find((e) => e.id === subscribedPlayerId);
      const selfByIncome = globalLeaderboard.byIncome.find((e) => e.id === subscribedPlayerId);
      const selfByTechs = globalLeaderboard.byTechs.find((e) => e.id === subscribedPlayerId);
      const playerLeaderboard = {
        ...globalLeaderboard,
        ...(selfOverall ? { selfOverall } : {}),
        ...(selfByTiles ? { selfByTiles } : {}),
        ...(selfByIncome ? { selfByIncome } : {}),
        ...(selfByTechs ? { selfByTechs } : {})
      };
      const seasonVictory = personalizeSeasonVictoryObjectives(currentSummary?.seasonVictory ?? [], []);
      const seasonWinner = currentSummary?.seasonWinner;
      const payload = {
        type: "GLOBAL_STATUS_UPDATE" as const,
        leaderboard: playerLeaderboard,
        seasonVictory,
        ...(seasonWinner ? { seasonWinner } : {}),
        ...(typeof acceptLatencyP95Ms === "number" ? { acceptLatencyP95Ms } : {})
      };
      const cachedSnapshot = snapshotCacheByPlayerId.get(subscribedPlayerId);
      if (cachedSnapshot)
        snapshotCacheByPlayerId.set(subscribedPlayerId, applyPlayerMessageToSnapshot(cachedSnapshot, payload));
      const globalStatusEvent = toProtoEvent({
        eventType: "PLAYER_MESSAGE",
        commandId: commandId ?? `global-status:${Date.now()}`,
        playerId: subscribedPlayerId,
        messageType: "GLOBAL_STATUS_UPDATE",
        payloadJson: JSON.stringify(payload)
      });
      for (const stream of eventStreams) stream.write(globalStatusEvent);
    }
  };
  // Single-flight + debounce for leaderboard-only broadcasts. See global-status-broadcast-scheduler.
  const globalStatusBroadcaster = createGlobalStatusBroadcastScheduler({
    debounceMs: globalStatusBroadcastDebounceMs,
    perform: performGlobalStatusBroadcast,
    onCoalesced: () => simulationMetrics.incrementSimGlobalStatusBroadcastCoalesced(),
    onError: (error) => log.error({ err: error }, "failed to refresh current season summary")
  });
  const scheduleGlobalStatusBroadcast = (commandId: string): void => globalStatusBroadcaster.schedule(commandId);
  const submitDurableCommand = async (command: CommandEnvelope): Promise<void> => {
    if (fatalPersistenceError || persistenceQueue.isDegraded()) {
      throw fatalPersistenceError ?? new Error("simulation persistence degraded");
    }
    commandTraceSample({
      source: "service",
      phase: "queued",
      commandId: command.commandId,
      playerId: command.playerId,
      clientSeq: command.clientSeq,
      type: command.type
    });
    invalidateSharedFullVisibilityTilesCache();
    const runtimeSubmitStartedAt = Date.now();
    mainThreadTasks.trackSync(
      "runtime_submit_command",
      {
        commandId: command.commandId,
        playerId: command.playerId,
        type: command.type
      },
      () => {
        runtime.updatePlayerLastActive(command.playerId, runtimeSubmitStartedAt);
        runtime.submitCommand(command);
      }
    );
    const runtimeSubmitDurationMs = Date.now() - runtimeSubmitStartedAt;
    if (runtimeSubmitDurationMs >= slowRuntimeSubmitWarnMs) {
      recordLagDiagnostic("warn", "runtime_submit_command_slow", {
        commandId: command.commandId,
        playerId: command.playerId,
        type: command.type,
        durationMs: runtimeSubmitDurationMs,
        queueDepths: runtime.queueDepths()
      });
    }
  };
  const autopilotMaxPersistencePending = 256;
  const recoveredCommands = effectiveStartupRecovery.initialCommandHistory.commands;
  const nextClientSeqByPlayers = (playerIds: string[]): Record<string, number> =>
    buildNextClientSeqByPlayer(recoveredCommands, playerIds);
  const useAiWorker = options.useAiWorker ?? false;
  const aiMaxEventLoopLagMs = Math.max(1, options.aiMaxEventLoopLagMs ?? 250);

  // Layer 2: rolling time-budget tracker — caps AI work to 200ms per 1s window.
  const aiBudgetTracker = createAiBudgetTracker();

  // Layer 3: event-loop-lag observer. Uses hrtime to detect when the sim
  // main thread is too busy to run AI on schedule.
  let lastAiShouldRunHr = process.hrtime.bigint();
  let aiShouldRunFirstCall = true;
  const baseAiTickMs = options.aiTickMs ?? 250;

  const aiShouldRun = () => {
    if (currentSeasonState.status === "ended") {
      simulationMetrics.incrementSimAiTickThrottled("season_ended");
      return false;
    }
    const hrNow = process.hrtime.bigint();
    if (aiShouldRunFirstCall) {
      aiShouldRunFirstCall = false;
      lastAiShouldRunHr = hrNow;
    } else {
      const gapMs = Number(hrNow - lastAiShouldRunHr) / 1e6;
      lastAiShouldRunHr = hrNow;
      // Only flag loop lag when tick is at or near the base interval.
      // When adaptive backoff is active (gap > baseInterval * 1.5),
      // the adaptive throttle already handles the load — skip the check.
      if (gapMs > baseAiTickMs + 20 && gapMs < baseAiTickMs * 1.5) {
        simulationMetrics.incrementSimAiTickThrottled("loop_lag");
        return false;
      }
    }

    if (!aiBudgetTracker.available()) {
      simulationMetrics.incrementSimAiTickThrottled("budget");
      return false;
    }

    return (
      !persistenceQueue.isDegraded() &&
      persistenceQueue.pendingCount() < autopilotMaxPersistencePending &&
      latestEventLoopLagMs <= aiMaxEventLoopLagMs
    );
  };

  const systemShouldRun = () => {
    if (currentSeasonState.status === "ended") {
      simulationMetrics.incrementSimAiTickThrottled("season_ended");
      return false;
    }
    return (
      !persistenceQueue.isDegraded() &&
      persistenceQueue.pendingCount() < autopilotMaxPersistencePending &&
      latestEventLoopLagMs <= aiMaxEventLoopLagMs
    );
  };
  let aiCommandProducer:
    | ReturnType<typeof createAiCommandProducer>
    | ReturnType<typeof createWorkerAiCommandProducer>
    | undefined;
  let systemCommandProducer:
    | ReturnType<typeof createSystemCommandProducer>
    | ReturnType<typeof createWorkerSystemCommandProducer>
    | undefined;
  let unsubscribeRuntimeEvents: (() => void) | undefined;
  const closeAutopilots = (): void => {
    aiCommandProducer?.close();
    systemCommandProducer?.close();
    aiCommandProducer = undefined;
    systemCommandProducer = undefined;
  };
  const resolveAutopilotAiPlayerIds = (): string[] => {
    const activeAiPlayerIds = [...activePlayers.values()].filter((player) => player.isAi).map((player) => player.id);
    if (activeAiPlayerIds.length > 0) return activeAiPlayerIds;
    const seedAiPlayerIds = [...seedPlayers.values()].filter((player) => player.isAi).map((player) => player.id);
    if (seedAiPlayerIds.length > 0) {
      emitLog("warn", "simulation ai autopilot recovered zero AI players; falling back to seed AI identities", {
        activePlayerCount: activePlayers.size,
        fallbackAiPlayerCount: seedAiPlayerIds.length,
        fallbackAiPlayerIds: seedAiPlayerIds.slice(0, 6)
      });
      return seedAiPlayerIds;
    }
    return [];
  };
  const startAutopilots = (): void => {
    closeAutopilots();
    const aiPlayerIds = resolveAutopilotAiPlayerIds();
    const systemPlayerIds = options.systemPlayerIds ?? (activePlayers.has("barbarian-1") ? ["barbarian-1"] : []);
    emitLog("info", "simulation autopilot startup", {
      enableAiAutopilot: aiAutopilotEnabled,
      enableSystemAutopilot: systemAutopilotEnabled,
      useAiWorker,
      aiPlayerCount: aiPlayerIds.length,
      aiPlayerIdsSample: aiPlayerIds.slice(0, 6),
      systemPlayerCount: systemPlayerIds.length,
      systemPlayerIds
    });
    simulationMetrics.setSimAiAutopilotState({
      enabled: aiAutopilotEnabled,
      playerCount: aiPlayerIds.length
    });
    if (aiAutopilotEnabled) {
      if (aiPlayerIds.length === 0) {
        emitLog("warn", "simulation ai autopilot enabled with zero AI players", {
          activePlayerCount: activePlayers.size,
          recoveredPlayerCount: effectiveStartupRecovery.initialState.players?.length ?? 0,
          seedPlayerCount: seedPlayers.size
        });
      }
      aiCommandProducer = useAiWorker
        ? createWorkerAiCommandProducer({
            runtime: {
              queueDepths: () => runtime.queueDepths(),
              onEvent: (handler) => runtime.onEvent(handler),
              exportPlannerWorldView: (playerIds) =>
                mainThreadTasks.trackSync("ai_export_planner_world_view", { playerCount: playerIds.length }, () =>
                  runtime.exportPlannerWorldView(playerIds)
                ),
              exportPlannerPlayerViews: (playerIds) =>
                mainThreadTasks.trackSync("ai_export_planner_player_views", { playerCount: playerIds.length }, () =>
                  runtime.exportPlannerPlayerViews(playerIds)
                ),
              exportTilesForKeys: (keys) =>
                mainThreadTasks.trackSync("ai_export_tiles_for_keys", undefined, () =>
                  runtime.exportTilesForKeys(keys)
                )
            },
            aiPlayerIds,
            submitCommand: submitDurableCommand,
            shouldRun: aiShouldRun,
            startingClientSeqByPlayer: nextClientSeqByPlayers(aiPlayerIds),
            tickIntervalMs: options.aiTickMs ?? 250,
            minCommandIntervalMs: options.aiMinCommandIntervalMs ?? 1_000,
            onPlannerTick: ({ breached }) => {
              if (breached) simulationMetrics.incrementSimAiPlannerBreaches();
            },
            onCommand: ({ playerId, commandType }) => {
              simulationMetrics.observeSimAiCommand(commandType, playerId);
            },
            onRejectedCommand: ({ commandType }) => {
              simulationMetrics.observeSimAiCommandRejected(commandType);
            },
            onDecision: (diagnostic) => {
              if (diagnostic.preplanReason) {
                simulationMetrics.observeSimAiPreplan(diagnostic.preplanReason, diagnostic.playerId);
              }
              if (diagnostic.preplanProgressState) {
                simulationMetrics.observeSimAiPreplanProgress(diagnostic.preplanProgressState, diagnostic.playerId);
              }
              if (diagnostic.settleDecisionReason && typeof diagnostic.settleDecisionTopScore === "number") {
                simulationMetrics.observeSimAiSettleDecision(
                  diagnostic.settleDecisionReason,
                  diagnostic.playerId,
                  diagnostic.settleDecisionTopScore
                );
              }
              if (diagnostic.broadFallbackSkipped) {
                simulationMetrics.incrementSimAiBroadFallbackSkipped(diagnostic.playerId);
              }
              if (diagnostic.narrowAnalyzeCapped) {
                simulationMetrics.incrementSimAiNarrowAnalyzeCapped(diagnostic.playerId);
              }
              if (diagnostic.expansionObjectiveKind) {
                simulationMetrics.observeSimAiExpansionObjective(diagnostic.expansionObjectiveKind);
              }
              if (diagnostic.utilityWinner) {
                simulationMetrics.observeSimAiUtilityDecision(diagnostic.utilityWinner, diagnostic.playerId);
              }
            },
            onDiagnostic: (sample) => {
              if (AI_PLANNER_PHASES.includes(sample.phase as AiPlannerPhase)) {
                simulationMetrics.observeSimAiPlannerPhaseMs(sample.phase as AiPlannerPhase, sample.durationMs);
              }
              if (sample.durationMs < slowAiSyncWarnMs) return;
              recordLagDiagnostic("warn", "simulation_ai_worker_slow", sample);
            },
            onTick: ({ durationMs }) => {
              simulationMetrics.observeSimTickDurationMs("ai", durationMs);
              aiBudgetTracker.recordWork(durationMs);
              simulationMetrics.setSimAiBudgetUsedMs(aiBudgetTracker.usedMs());
            },
            onThrottle: (reason) => {
              simulationMetrics.incrementSimAiTickThrottled(reason);
            },
            onIntervalChange: (intervalMs) => {
              simulationMetrics.setSimAiCurrentTickIntervalMs(intervalMs);
            },
            onSlowTick: (sample) => {
              // Rare-event diagnostic: a single ai tick that crossed the
              // 1s threshold. Per-phase histograms aren't enough — the
              // sample is what each outlier tick was actually doing.
              emitLog("warn", "simulation ai tick slow", {
                phase: "ai_tick_slow",
                durationMs: sample.durationMs,
                planRequestCount: sample.planRequestCount,
                submitCount: sample.submitCount,
                preplanWaitMs: sample.preplanWaitMs,
                queueDepthAiAtStart: sample.queueDepthAiAtStart,
                pendingPlayerSyncAtStart: sample.pendingPlayerSyncAtStart,
                pendingTileDeltasAtStart: sample.pendingTileDeltasAtStart,
                iterationOrderLength: sample.iterationOrderLength,
                lastPlayerId: sample.lastPlayerId,
                lastCommandType: sample.lastCommandType
              });
            },
            onNoCommand: (diagnostic) => {
              if (diagnostic.noCommandReason) {
                simulationMetrics.observeSimAiNoop(diagnostic.noCommandReason, diagnostic.playerId);
                if (diagnostic.noCommandReason === "no_frontier_targets") {
                  simulationMetrics.observeSimAiNoFrontierDetail(formatNoFrontierDiagnostic("worker", diagnostic));
                }
              }
            },
            ...(options.aiDryRun ? { experimentDryRun: true } : {}),
            ...(options.aiMaxCommandsPerTick ? { experimentMaxCommandsPerTick: options.aiMaxCommandsPerTick } : {}),
            ...(options.aiDisableExpand ? { experimentDisableExpand: true } : {}),
            ...(options.aiDisableBuild ? { experimentDisableBuild: true } : {}),
            onExperimentFilter: (reason) => {
              if (reason === "dry_run") simulationMetrics.incrementSimAiDryRunSkipped();
              else if (reason === "command_cap") simulationMetrics.incrementSimAiCommandCapSkipped();
              else if (reason === "expand_disabled") simulationMetrics.incrementSimAiExpandDisabled();
              else if (reason === "build_disabled") simulationMetrics.incrementSimAiBuildDisabled();
            }
          })
        : createAiCommandProducer({
            runtime,
            aiPlayerIds,
            submitCommand: submitDurableCommand,
            shouldRun: aiShouldRun,
            startingClientSeqByPlayer: nextClientSeqByPlayers(aiPlayerIds),
            tickIntervalMs: options.aiTickMs ?? 250,
            onPlannerTick: ({ breached }) => {
              if (breached) simulationMetrics.incrementSimAiPlannerBreaches();
            },
            onCommand: ({ playerId, commandType }) => {
              simulationMetrics.observeSimAiCommand(commandType, playerId);
            },
            onRejectedCommand: ({ commandType }) => {
              simulationMetrics.observeSimAiCommandRejected(commandType);
            },
            onDecision: (diagnostic) => {
              if (diagnostic.preplanReason) {
                simulationMetrics.observeSimAiPreplan(diagnostic.preplanReason, diagnostic.playerId);
              }
              if (diagnostic.preplanProgressState) {
                simulationMetrics.observeSimAiPreplanProgress(diagnostic.preplanProgressState, diagnostic.playerId);
              }
              if (diagnostic.settleDecisionReason && typeof diagnostic.settleDecisionTopScore === "number") {
                simulationMetrics.observeSimAiSettleDecision(
                  diagnostic.settleDecisionReason,
                  diagnostic.playerId,
                  diagnostic.settleDecisionTopScore
                );
              }
              if (diagnostic.broadFallbackSkipped) {
                simulationMetrics.incrementSimAiBroadFallbackSkipped(diagnostic.playerId);
              }
              if (diagnostic.narrowAnalyzeCapped) {
                simulationMetrics.incrementSimAiNarrowAnalyzeCapped(diagnostic.playerId);
              }
              if (diagnostic.utilityWinner) {
                simulationMetrics.observeSimAiUtilityDecision(diagnostic.utilityWinner, diagnostic.playerId);
              }
            },
            onTick: ({ durationMs }) => {
              simulationMetrics.observeSimTickDurationMs("ai", durationMs);
            },
            onNoCommand: (diagnostic) => {
              if (diagnostic.noCommandReason) {
                simulationMetrics.observeSimAiNoop(diagnostic.noCommandReason, diagnostic.playerId);
                if (diagnostic.noCommandReason === "no_frontier_targets") {
                  simulationMetrics.observeSimAiNoFrontierDetail(formatNoFrontierDiagnostic("runtime", diagnostic));
                }
              }
            }
          });
      simulationMetrics.setSimAiCurrentTickIntervalMs(options.aiTickMs ?? 250);
    }
    if (systemAutopilotEnabled) {
      systemCommandProducer = useAiWorker
        ? createWorkerSystemCommandProducer({
            runtime,
            systemPlayerIds,
            submitCommand: submitDurableCommand,
            shouldRun: systemShouldRun,
            startingClientSeqByPlayer: nextClientSeqByPlayers(systemPlayerIds),
            tickIntervalMs: options.systemTickMs ?? 500,
            onTick: ({ durationMs }) => {
              simulationMetrics.observeSimTickDurationMs("system", durationMs);
            }
          })
        : createSystemCommandProducer({
            runtime,
            systemPlayerIds,
            submitCommand: submitDurableCommand,
            shouldRun: systemShouldRun,
            startingClientSeqByPlayer: nextClientSeqByPlayers(systemPlayerIds),
            tickIntervalMs: options.systemTickMs ?? 500,
            onTick: ({ durationMs }) => {
              simulationMetrics.observeSimTickDurationMs("system", durationMs);
            }
          });
    }
  };
  const attachRuntimeEventHandlers = (): void => {
    unsubscribeRuntimeEvents?.();
    unsubscribeRuntimeEvents = runtime.onEvent((event) => {
      if (
        commandTraceEnabled &&
        (event.eventType === "COMMAND_ACCEPTED" ||
          event.eventType === "COMMAND_REJECTED" ||
          event.eventType === "COMBAT_RESOLVED" ||
          event.eventType === "TILE_DELTA_BATCH")
      ) {
        commandTraceSample({
          source: "event",
          phase: event.eventType,
          commandId: event.commandId,
          playerId: event.playerId,
          actionType: "actionType" in event ? event.actionType : undefined,
          code: "code" in event ? event.code : undefined,
          message: "message" in event ? event.message : undefined,
          attackerWon: "attackerWon" in event ? event.attackerWon : undefined,
          manpowerDelta: "manpowerDelta" in event ? event.manpowerDelta : undefined,
          targetX: "targetX" in event ? event.targetX : undefined,
          targetY: "targetY" in event ? event.targetY : undefined
        });
      }
      const shouldBroadcastGlobalStatus =
        event.eventType === "TILE_DELTA_BATCH" ||
        event.eventType === "TECH_UPDATE" ||
        event.eventType === "DOMAIN_UPDATE" ||
        (event.eventType === "PLAYER_MESSAGE" && event.messageType === "SOCIAL_STATE_SYNCED");
      persistenceQueue.enqueueEvent(event);
      if (shouldBroadcastGlobalStatus) scheduleGlobalStatusBroadcast(event.commandId);
      if (event.eventType === "PLAYER_MESSAGE") {
        const payload = event.payloadJson ? (JSON.parse(event.payloadJson) as Record<string, unknown>) : undefined;
        if (payload) {
          const cachedSnapshot = snapshotCacheByPlayerId.get(event.playerId);
          if (cachedSnapshot) {
            setCachedSnapshot(event.playerId, applyPlayerMessageToSnapshot(cachedSnapshot, payload));
          }
        }
      }
      if (event.eventType === "TECH_UPDATE" || event.eventType === "DOMAIN_UPDATE") {
        const payload = event.payloadJson ? (JSON.parse(event.payloadJson) as Record<string, unknown>) : undefined;
        if (payload) {
          const cachedSnapshot = snapshotCacheByPlayerId.get(event.playerId);
          if (cachedSnapshot) {
            setCachedSnapshot(event.playerId, applyPlayerMessageToSnapshot(cachedSnapshot, { type: event.eventType, ...payload }));
          }
        }
      }
      // TILE_DELTA_BATCH events describe authoritative tile changes. Each
      // subscribed player only sees the subset of tiles they have vision of,
      // so we fan out one event per subscribed player with their filtered
      // (and where required, redacted) deltas — instead of a single global
      // broadcast that would leak opponent tile state outside fog of war.
      // The same filter is applied to each player's cached snapshot so the
      // server-held cache stays consistent with what the player can actually see.
      //
      // Trade-off: we lose the gateway's preSerializeBroadcast optimisation
      // (each subscriber now gets their own JSON.stringify) and the simulation
      // emits N proto events per command instead of one. With the lazy filter
      // (runtime.filterTileDeltasForPlayer) the added sim cost is roughly
      // O(N_subscribed × deltas × territory) — at staging load ~1% of one
      // core on top of the existing snapshot-cache rebuild that was already
      // O(N_subscribed × snapshot_size). If subscriber count grows large
      // enough that gateway per-player serialisation becomes the hot spot,
      // group subscribers by identical filtered tile-sets and stringify once
      // per group, or maintain a per-player incremental visible-tile set so
      // the filter is O(deltas) instead of O(deltas × territory).
      if (event.eventType === "TILE_DELTA_BATCH") {
        const fanoutStartedAt = slowTileDeltaFilterWarnMs > 0 ? Date.now() : 0;
        let maxFilterMs = 0;
        let slowestFilterPlayerId = "";
        let subscriberCount = 0;
        for (const subscribedPlayerId of subscriptionRegistry.subscribedPlayerIds()) {
          const filterStartedAt = slowTileDeltaFilterWarnMs > 0 ? Date.now() : 0;
          const filteredDeltas = runtime.filterTileDeltasForPlayer(event.tileDeltas, subscribedPlayerId);
          if (slowTileDeltaFilterWarnMs > 0) {
            const filterMs = Date.now() - filterStartedAt;
            subscriberCount += 1;
            if (filterMs > maxFilterMs) {
              maxFilterMs = filterMs;
              slowestFilterPlayerId = subscribedPlayerId;
            }
          }
          const cachedSnapshot = snapshotCacheByPlayerId.get(subscribedPlayerId);
          if (cachedSnapshot && filteredDeltas.length > 0) {
            setCachedSnapshot(subscribedPlayerId, applyTileDeltasToSnapshot(cachedSnapshot, filteredDeltas));
          }
          if (filteredDeltas.length === 0) continue;
          const perPlayerEvent = toProtoEvent({
            ...event,
            playerId: subscribedPlayerId,
            tileDeltas: filteredDeltas
          });
          for (const stream of eventStreams) stream.write(perPlayerEvent);
        }
        if (slowTileDeltaFilterWarnMs > 0) {
          const totalFanoutMs = Date.now() - fanoutStartedAt;
          if (totalFanoutMs >= slowTileDeltaFilterWarnMs || maxFilterMs >= slowTileDeltaFilterWarnMs) {
            recordLagDiagnostic("warn", "tile_delta_filter_slow", {
              commandId: event.commandId,
              deltaCount: event.tileDeltas.length,
              subscriberCount,
              totalFanoutMs,
              maxFilterMs,
              slowestFilterPlayerId,
              latestEventLoopLagMs,
              queueDepths: runtime.queueDepths()
            });
          }
        }
        return;
      }
      if (isWireInternalEvent(event)) return;
      if (!subscriptionRegistry.isSubscribed(event.playerId)) return;
      const protoEvent = toProtoEvent(event);
      for (const stream of eventStreams) stream.write(protoEvent);
    });
  };
  attachRuntimeEventHandlers();
  if (shouldRepairZeroGrossIncomeSettlements) {
    runtime.repairZeroGrossIncomeSettlements(zeroGrossIncomeRepairCandidateIds(effectiveStartupRecovery.initialState));
  }
  startAutopilots();
  const replaceRuntime = ({
    nextRuntime,
    nextPlayers,
    nextSeasonState,
    nextSeededTileCount
  }: {
    nextRuntime: SimulationRuntime;
    nextPlayers: typeof activePlayers;
    nextSeasonState: SimulationSeasonState;
    nextSeededTileCount: number;
  }): void => {
    runtime = nextRuntime;
    activePlayers = nextPlayers;
    currentSeasonState = nextSeasonState;
    runtimeSeededTileCount = nextSeededTileCount;
    clearCachedSnapshots();
    attachRuntimeEventHandlers();
    runtime.repairZeroGrossIncomeSettlements([...nextPlayers.keys()]);
    startAutopilots();
  };
  const readCurrentSummary = async (): Promise<CurrentSeasonSummary> => {
    if (currentSummary) return currentSummary;
    const persisted = await seasonSummaryStore.loadCurrentSummary();
    if (persisted) {
      currentSummary = persisted;
      currentSummarySignature = leaderboardSignature(persisted);
      lastCurrentSummaryPersistedAt = persisted.updatedAt;
      return persisted;
    }
    return recomputeAndPersistCurrentSummary({ forcePersist: true });
  };
  const readSeasonArchives = async (): Promise<SeasonArchiveRow[]> => seasonSummaryStore.listArchives();
  await recomputeAndPersistCurrentSummary({ forcePersist: true });
  const startNextSeason = async (force = false): Promise<{ seasonId: string }> => {
    if (seasonRolloverInFlight) throw new Error("season rollover already in progress");
    if (currentSeasonState.status !== "ended" && !force) {
      throw new Error("cannot start next season before current season has ended");
    }
    if (!rulesetId) {
      throw new Error("start-next requires SIMULATION_RULESET_ID");
    }
    seasonRolloverInFlight = true;
    try {
      const endedSummary = await readCurrentSummary();
      const archiveSummary = buildArchiveRow({
        ...endedSummary,
        status: "ended",
        ...(currentSeasonState.endedAt ? { endedAt: currentSeasonState.endedAt } : {})
      });
      const bootstrap = buildBootstrapSeason({
        seasonSequence: currentSeasonState.seasonSequence + 1,
        rulesetId,
        mapStyle,
        ...(typeof options.aiPlayerCount === "number" ? { aiPlayerCount: options.aiPlayerCount } : {}),
        now: Date.now()
      });
      const nextRuntime = new SimulationRuntime({
        ...(options.runtimeOptions ?? {}),
        initialState: bootstrap.initialState,
        initialCommandHistory: recoverCommandHistory([], []),
        mergeSeedTilesWithInitialState: false,
        initialPlayers: bootstrap.initialPlayers,
        onVisibilityAudit: handleVisibilityAudit,
        onCaptureRevealBuilt: captureRevealBuildSample,
        shouldPauseBackground: () => {
          if (loginExportsInFlight > 0) {
            simulationMetrics.incrementSimLoginExportPausedDrain();
            return true;
          }
          return false;
        }
      });
      const nextSummary = buildCurrentSeasonSummary({
        seasonState: bootstrap.seasonState,
        runtimeState: nextRuntime.exportState(),
        onlinePlayers: 0,
        updatedAt: bootstrap.seasonState.startedAt,
        ...(nonCompetitivePlayerIds ? { nonCompetitivePlayerIds } : {})
      });
      await seasonSummaryStore.startNextSeason({
        archiveSummary,
        snapshotSections: {
          initialState: bootstrap.initialState,
          commandEvents: []
        },
        currentSummary: nextSummary,
        createdAt: bootstrap.seasonState.startedAt
      });
      replaceRuntime({
        nextRuntime,
        nextPlayers: createActivePlayerIdentityMap(bootstrap.initialPlayers.values()),
        nextSeasonState: bootstrap.seasonState,
        nextSeededTileCount: bootstrap.initialState.tiles.length
      });
      currentSummary = nextSummary;
      currentSummarySignature = leaderboardSignature(nextSummary);
      lastCurrentSummaryPersistedAt = nextSummary.updatedAt;
      clearSeasonVictoryTimer();
      for (const stream of eventStreams) {
        stream.write(
          toProtoEvent({
            eventType: "PLAYER_MESSAGE",
            commandId: `season-rollover:${Date.now()}`,
            playerId: "",
            messageType: "SYSTEM",
            payloadJson: JSON.stringify({ type: "SEASON_ROLLOVER", seasonId: bootstrap.seasonState.seasonId })
          })
        );
      }
      return { seasonId: bootstrap.seasonState.seasonId };
    } finally {
      seasonRolloverInFlight = false;
    }
  };

  // Ops-only live barbarian reintroduction (see runtime.seedLiveBarbarians).
  // Reads the live `runtime` handle so it targets the current season even after
  // a rollover. The TILE_DELTA_BATCH the runtime emits flows through the normal
  // onEvent path → persistence + fog-of-war broadcast, so no extra wiring here.
  const DEFAULT_BARB_SEED_COUNT = INITIAL_BARBARIAN_COUNT;
  const MAX_BARB_SEED_COUNT = 500;
  const seedBarbarians = async (
    count = DEFAULT_BARB_SEED_COUNT
  ): Promise<{ requested: number; placed: number; detail: Record<string, unknown> }> => {
    if (currentSeasonState.status === "ended") {
      throw new Error("cannot seed barbarians while season is ended");
    }
    const requested = Math.min(MAX_BARB_SEED_COUNT, Math.max(0, Math.floor(count)));
    const detail = runtime.seedLiveBarbarians(requested);
    return { requested: detail.requested, placed: detail.placed, detail };
  };

  const serviceImplementation: UntypedServiceImplementation = {
    SubmitCommand(
      call: { request: ProtoCommandEnvelope },
      callback: (error: Error | null, response: { ok: boolean }) => void
    ) {
      const command = toCommandEnvelope(call.request);
      void (async () => {
        const acceptStartedAt = Date.now();
        const lane = laneForCommand(command);
        const simTracer = createSimRequestTracer({
          commandId: command.commandId,
          commandType: command.type,
          playerId: command.playerId,
          lane
        });
        try {
          if (fatalPersistenceError) {
            throw fatalPersistenceError;
          }
          if (currentSeasonState.status === "ended") {
            simTracer.stage("sim_rejected", { reason: "season_ended" });
            callback(new Error("season ended"), { ok: false });
            return;
          }
          simTracer.stage("sim_submit_durable_start", { queueDepths: runtime.queueDepths() });
          await submitDurableCommand(command);
          simTracer.stage("sim_submit_durable_end", { queueDepths: runtime.queueDepths() });
          const acceptDurationMs = Date.now() - acceptStartedAt;
          simulationMetrics.observeSimCommandAcceptLatencyMs(lane, acceptDurationMs);
          if (acceptDurationMs >= slowSubmitWarnMs) {
            recordLagDiagnostic("warn", "simulation_submit_command_slow", {
              commandId: command.commandId,
              playerId: command.playerId,
              type: command.type,
              lane,
              durationMs: acceptDurationMs,
              queueDepths: runtime.queueDepths(),
              persistencePendingCount: persistenceQueue.pendingCount(),
              latestEventLoopLagMs
            });
          }
          simTracer.done();
          callback(null, { ok: true });
        } catch (error) {
          simTracer.stage("sim_submit_failed", { error: error instanceof Error ? error.message : String(error) });
          recordLagDiagnostic("error", "simulation_submit_command_failed", {
            commandId: command.commandId,
            playerId: command.playerId,
            type: command.type,
            lane,
            durationMs: Date.now() - acceptStartedAt,
            error: error instanceof Error ? error.message : String(error),
            persistencePendingCount: persistenceQueue.pendingCount(),
            latestEventLoopLagMs
          });
          callback(error instanceof Error ? error : new Error("failed to persist simulation command"), { ok: false });
        }
      })();
    },
    PreparePlayer(
      call: { request: { player_id: string; rally_anchor_json?: string } },
      callback: (error: Error | null, response: { ok: boolean; player_id: string; playerId?: string; spawned: boolean }) => void
    ) {
      const prepareStartedAt = Date.now();
      let spawned = false;
      try {
        if (currentSeasonState.status !== "ended") {
          const spawnStartedAt = Date.now();
          const rallyAnchor = parseRallyAnchor(call.request.rally_anchor_json);
          spawned = runtime.ensurePlayerHasSpawnTerritory(call.request.player_id, rallyAnchor);
          simulationMetrics.observeSimPreparePlayerLatencyMs("spawn", Date.now() - spawnStartedAt);
          if (spawned) {
            deleteCachedSnapshot(call.request.player_id);
            log.info({ playerId: call.request.player_id }, "spawned runtime territory for prepared player");
          }
          try {
            runtime.emitShardRainHelloFor(call.request.player_id);
          } catch (error) {
            log.error({ err: error, playerId: call.request.player_id }, "shard rain hello failed");
          }
        }
        const prepareDurationMs = Date.now() - prepareStartedAt;
        simulationMetrics.observeSimPreparePlayerLatencyMs("prepare", prepareDurationMs);
        if (spawned || prepareDurationMs >= preparePlayerSlowLogMs) {
          log.info({
            playerId: call.request.player_id,
            prepareDurationMs,
            spawned
          }, "prepare player completed");
        }
        callback(null, {
          ok: true,
          player_id: call.request.player_id,
          playerId: call.request.player_id,
          spawned
        });
      } catch (error) {
        const prepareDurationMs = Date.now() - prepareStartedAt;
        simulationMetrics.observeSimPreparePlayerLatencyMs("prepare", prepareDurationMs);
        log.error(
          {
            playerId: call.request.player_id,
            prepareDurationMs,
            error: error instanceof Error ? error.message : String(error)
          },
          "prepare player failed"
        );
        callback(error instanceof Error ? error : new Error("failed to prepare simulation player"), {
          ok: false,
          player_id: call.request.player_id,
          playerId: call.request.player_id,
          spawned
        });
      }
    },
    SubscribePlayer(
      call: { request: { player_id: string; subscription_json: string } },
      callback: (
        error: Error | null,
        response: {
          ok: boolean;
          player_id: string;
          playerId?: string;
          player_json?: string;
          world_status_json?: string;
          season_json?: string;
          docks?: Array<{
            dock_id: string;
            tile_key: string;
            paired_dock_id: string;
            connected_dock_ids?: string[];
          }>;
          tiles: Array<ReturnType<typeof toFullSnapshotProtoTile>>;
        }
      ) => void
    ) {
      if (fatalPersistenceError) {
        callback(fatalPersistenceError, {
          ok: false,
          player_id: call.request.player_id,
          playerId: call.request.player_id,
          tiles: []
        });
        return;
      }
      const subscribeOptions = parseSubscribeOptions(call.request.subscription_json);
      if (subscribeOptions.mode !== "bootstrap-only") {
        subscriptionRegistry.subscribe(call.request.player_id, subscribeOptions.subscriptionKey);
      }
      // Dedupe concurrent subscribes for the same (player, mode, visibility).
      // The bootstrap retry loop in the gateway can fire 3-4 RPCs while the
      // first build is still running; sharing the in-flight promise prevents
      // those retries from queuing new sync builds behind it.
      const buildPromise = (() => {
        const key = buildSubscribeKey(
          call.request.player_id,
          subscribeOptions.mode,
          subscribeOptions.fullVisibility ?? false
        );
        const existing = inFlightSubscribeBuilds.get(key);
        if (existing) return existing;
        const promise = (async () => {
          try {
            return subscribeOptions.mode === "bootstrap-only"
              ? await buildAndCachePlayerSnapshotAsync(call.request.player_id, {
                  includeWorldStatus: true,
                  fullVisibility: subscribeOptions.fullVisibility,
                  ...(subscribeOptions.trigger ? { trigger: subscribeOptions.trigger } : {})
                })
              : await (() => {
                  // Phase B3: reuse the cached snapshot when available. For
                  // normal logins, always check cache. For full-vis (admin/spectator
                  // or season-ended), only check cache post-season — warming pre-builds
                  // full-vis snapshots there; during active season full-vis is only for
                  // admin spectators who shouldn't get a stale non-full-vis snapshot.
                  const useFullVisibility = subscribeOptions.fullVisibility === true || currentSeasonState.status === "ended";
                  const seasonEnded = currentSeasonState.status === "ended";
                  if (!useFullVisibility || seasonEnded) {
                    const cached = snapshotCacheByPlayerId.get(call.request.player_id);
                    if (cached) return cached;
                  }
                  return buildAndCachePlayerSnapshotAsync(call.request.player_id, {
                    fullVisibility: subscribeOptions.fullVisibility,
                    ...(subscribeOptions.trigger ? { trigger: subscribeOptions.trigger } : {})
                  });
                })()
          } finally {
            inFlightSubscribeBuilds.delete(key);
          }
        })();
        inFlightSubscribeBuilds.set(key, promise);
        return promise;
      })();
      const stringifySnapshot = snapshotStringifier
        ? (payload: unknown) => snapshotStringifier(payload)
        : async (payload: unknown) => JSON.stringify(payload);

      void buildPromise.then(
        async (snapshotPayload) => {
          try {
            const [playerJson, worldStatusJson, seasonJson] = await Promise.all([
              snapshotPayload.player ? stringifySnapshot(snapshotPayload.player) : undefined,
              snapshotPayload.worldStatus ? stringifySnapshot(snapshotPayload.worldStatus) : undefined,
              snapshotPayload.season ? stringifySnapshot(snapshotPayload.season) : undefined,
            ]);

            if (process.env.DEBUG_SIM_SUBSCRIBE === "1") {
              log.info(
                JSON.stringify({
                  type: "debug_subscribe_player",
                  playerId: call.request.player_id,
                  runtimeTiles: snapshotPayload.tiles.length,
                  snapshotTiles: snapshotPayload.tiles.length,
                  snapshotLength: JSON.stringify(snapshotPayload).length
                })
              );
            }
            callback(null, {
              ok: true,
              player_id: snapshotPayload.playerId,
              playerId: snapshotPayload.playerId,
              ...(playerJson ? { player_json: playerJson } : {}),
              ...(worldStatusJson ? { world_status_json: worldStatusJson } : {}),
              ...(seasonJson ? { season_json: seasonJson } : {}),
              ...(snapshotPayload.docks?.length
                ? {
                    docks: snapshotPayload.docks.map((dock) => ({
                      dock_id: dock.dockId,
                      tile_key: dock.tileKey,
                      paired_dock_id: dock.pairedDockId,
                      ...(dock.connectedDockIds?.length ? { connected_dock_ids: [...dock.connectedDockIds] } : {})
                    }))
                  }
                : {}),
              tiles: (() => {
                // Post-season: tiles are frozen and all players share identical
                // full-visibility tiles, so marshal once and reuse.
                if (currentSeasonState.status === "ended") {
                  const cached = postSeasonProtoTilesCache;
                  if (cached !== undefined && cached.seasonId === currentSeasonState.seasonId) {
                    simulationMetrics.incrementSimPostSeasonProtoTileCacheHit();
                    return cached.tiles;
                  }
                  const mapped = snapshotPayload.tiles.map(toFullSnapshotProtoTile);
                  postSeasonProtoTilesCache = { seasonId: currentSeasonState.seasonId, tiles: mapped };
                  simulationMetrics.incrementSimPostSeasonProtoTileCacheMiss();
                  return mapped;
                }
                return snapshotPayload.tiles.map(toFullSnapshotProtoTile);
              })()
            });
            if (!subscribeOptions.emitBootstrapEvent) return;
            const bootstrapEvent = toProtoEvent({
              eventType: "TILE_DELTA_BATCH",
              commandId: `bootstrap:${call.request.player_id}:${Date.now()}`,
              playerId: call.request.player_id,
              tileDeltas: snapshotPayload.tiles
            });
            // Re-broadcast the snapshot's player block as a PLAYER_UPDATE event so
            // any prior PLAYER_UPDATE that fired before this subscriber attached
            // (e.g. a startup `repairZeroGrossIncomeSettlements` respawn) is
            // unconditionally superseded by a fresh value on the event stream.
            // Include storageCap so the economy panel shows real caps immediately
            // rather than the floor defaults from client-state initialisation.
            const hydrateStorageCap = runtime.storageCapForPlayer(call.request.player_id);
            const hydrateEvent = snapshotPayload.player
              ? toProtoEvent({
                  eventType: "PLAYER_MESSAGE",
                  commandId: `subscribe-hydrate:${call.request.player_id}:${Date.now()}`,
                  playerId: call.request.player_id,
                  messageType: "PLAYER_UPDATE",
                  payloadJson: JSON.stringify({
                    type: "PLAYER_UPDATE",
                    ...snapshotPayload.player,
                    ...(hydrateStorageCap ? { storageCap: hydrateStorageCap } : {})
                  })
                })
              : undefined;
            // Emit a WELCOME_BACK message showing how much the player earned
            // since their last active session (capped at 12h of accrual).
            const welcomeBack = runtime.welcomeBackSummary(call.request.player_id, Date.now());
            const welcomeBackEvent = welcomeBack.elapsedMs > 60_000
              ? toProtoEvent({
                  eventType: "PLAYER_MESSAGE",
                  commandId: `welcome-back:${call.request.player_id}:${Date.now()}`,
                  playerId: call.request.player_id,
                  messageType: "WELCOME_BACK",
                  payloadJson: JSON.stringify({ type: "WELCOME_BACK", goldEarned: welcomeBack.goldEarned, elapsedMs: welcomeBack.elapsedMs })
                })
              : undefined;
            runtime.updatePlayerLastActive(call.request.player_id, Date.now());
            queueMicrotask(() => {
              for (const stream of eventStreams) stream.write(bootstrapEvent);
              if (hydrateEvent) {
                for (const stream of eventStreams) stream.write(hydrateEvent);
              }
              if (welcomeBackEvent) {
                for (const stream of eventStreams) stream.write(welcomeBackEvent);
              }
            });
          } catch (err) {
            callback(err instanceof Error ? err : new Error(String(err)), {
              ok: false,
              player_id: call.request.player_id,
              playerId: call.request.player_id,
              tiles: []
            });
          }
        },
        (error) => {
          callback(error instanceof Error ? error : new Error(String(error)), {
            ok: false,
            player_id: call.request.player_id,
            playerId: call.request.player_id,
            tiles: []
          });
        }
      );
    },
    UnsubscribePlayer(
      call: { request: { player_id: string; subscription_key?: string } },
      callback: (error: Error | null, response: { ok: boolean }) => void
    ) {
      subscriptionRegistry.unsubscribe(call.request.player_id, call.request.subscription_key);
      // Keep the snapshot in cache on unsubscribe so reconnects can skip the
      // cold 16s rebuild. The delta replay (lastAppliedEventId) brings the client
      // current after bootstrap. Spawn path has its own deleteCachedSnapshot call.
      callback(null, { ok: true });
    },
    FetchTileDetail(
      call: { request: { player_id: string; x: number; y: number; full_visibility?: boolean } },
      callback: (
        error: Error | null,
        response: {
          ok: boolean;
          player_id: string;
          playerId?: string;
          x: number;
          y: number;
          tiles: Array<{
            x: number;
            y: number;
            terrain?: string;
            resource?: string;
            dock_id?: string;
            owner_id?: string;
            ownership_state?: string;
            frontier_decay_at?: number;
            frontier_decay_kind?: string;
            town_json?: string;
            town_type?: string;
            town_name?: string;
            town_population_tier?: string;
            fort_json?: string;
            observatory_json?: string;
            siege_outpost_json?: string;
            economic_structure_json?: string;
            sabotage_json?: string;
            shard_site_json?: string;
            muster_json?: string;
            yield_json?: string;
            yield_rate_json?: string;
            yield_cap_json?: string;
          }>;
          player_upkeep_json?: string;
        }
      ) => void
    ) {
      const seasonEnded = currentSeasonState.status === "ended";
      const fullVisibility = call.request.full_visibility === true || seasonEnded;
      const tiles = runtime.exportTilesInAreaForPlayer(
        call.request.player_id,
        Math.floor(Number(call.request.x) || 0),
        Math.floor(Number(call.request.y) || 0),
        1,
        { fullVisibility }
      );
      const cached = snapshotCacheByPlayerId.get(call.request.player_id);
      const upkeep = cached?.player?.upkeepLastTick;
      callback(null, {
        ok: true,
        player_id: call.request.player_id,
        playerId: call.request.player_id,
        x: call.request.x,
        y: call.request.y,
        tiles: tiles.map(toFullSnapshotProtoTile),
        ...(upkeep ? { player_upkeep_json: JSON.stringify(upkeep) } : {})
      });
    },
    GetSubscriptionNamespace(
      _call: { request: Record<string, never> },
      callback: (error: Error | null, response: { ok: boolean; namespace: string }) => void
    ) {
      nextSubscriptionNamespace += 1;
      callback(null, { ok: true, namespace: nextSubscriptionNamespace.toString(36) });
    },
    Ping(
      _call: unknown,
      callback: (error: Error | null, response: { ok: boolean }) => void
    ) {
      callback(null, { ok: true });
    },
    GetCurrentSeasonSummary(
      _call: { request: ProtoSeasonSummaryRequest },
      callback: (error: Error | null, response: ProtoSeasonSummaryResponse) => void
    ) {
      void readCurrentSummary()
        .then((summary) => callback(null, { ok: true, summary_json: JSON.stringify(summary) }))
        .catch((error) => callback(error instanceof Error ? error : new Error("failed to load current season summary"), { ok: false }));
    },
    ListSeasonArchives(
      _call: { request: ProtoSeasonSummaryRequest },
      callback: (error: Error | null, response: ProtoSeasonArchivesResponse) => void
    ) {
      void readSeasonArchives()
        .then((archives) => callback(null, { ok: true, archives_json: JSON.stringify(archives) }))
        .catch((error) => callback(error instanceof Error ? error : new Error("failed to load season archives"), { ok: false }));
    },
    StartNextSeason(
      call: { request: ProtoStartNextSeasonRequest },
      callback: (error: Error | null, response: ProtoStartNextSeasonResponse) => void
    ) {
      void startNextSeason(call.request.force === true)
        .then((result) => callback(null, { ok: true, season_id: result.seasonId }))
        .catch((error) =>
          callback(error instanceof Error ? error : new Error("failed to start next season"), {
            ok: false,
            season_id: ""
          })
        );
    },
    SeedBarbarians(
      call: { request: ProtoSeedBarbariansRequest },
      callback: (error: Error | null, response: ProtoSeedBarbariansResponse) => void
    ) {
      const requestedCount =
        typeof call.request.count === "number" && call.request.count > 0 ? call.request.count : undefined;
      void seedBarbarians(requestedCount)
        .then((result) =>
          callback(null, {
            ok: true,
            requested: result.requested,
            placed: result.placed,
            detail_json: JSON.stringify(result.detail)
          })
        )
        .catch((error) =>
          callback(error instanceof Error ? error : new Error("failed to seed barbarians"), {
            ok: false,
            requested: 0,
            placed: 0,
            detail_json: ""
          })
        );
    },
    StreamEvents(call: { write: (event: ProtoSimulationEvent) => void; on: (event: string, listener: () => void) => void }) {
      eventStreams.add(call);
      call.on("close", () => {
        eventStreams.delete(call);
      });
    }
  };

  server.addService(
    proto.border_empires.simulation.SimulationService.service as Parameters<typeof server.addService>[0],
    serviceImplementation
  );

  let boundPort = options.port ?? 50051;
  const host = options.host ?? "127.0.0.1";

  return {
    get runtime() {
      return runtime;
    },
    startupRecovery: effectiveStartupRecovery,
    async start(): Promise<{ host: string; port: number; address: string }> {
      const requestedPort = options.port ?? 50051;
      const port = await new Promise<number>((resolve, reject) => {
        server.bindAsync(
          formatGrpcBindAddress(host, requestedPort),
          ServerCredentials.createInsecure(),
          (error, resolvedPort) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(resolvedPort);
          }
        );
      });
      boundPort = port;
      server.start();
      shardRainTicker = setInterval(() => {
        if (currentSeasonState.status === "ended") return;
        try {
          mainThreadTasks.trackSync("tick_shard_rain", undefined, () => runtime.tickShardRain(Date.now()));
        } catch (error) {
          log.error({ err: error }, "shard rain tick failed");
        }
      }, 60_000);
      let tileSheddingRunning = false;
      tileSheddingTicker = setInterval(() => {
        if (currentSeasonState.status === "ended") return;
        // Overlap guard: applyEconomyAccrual rebuilds tileYieldEconomyContextForPlayer
        // (buildConnectedTownNetworkForPlayer BFS) on cache miss — ~540ms per player.
        // Running 6 players synchronously was a ~3.2s block exceeding the 2500ms gRPC
        // timeout. Async with per-player yields lets commands drain between players.
        if (tileSheddingRunning) {
          log.info("[tile_shedding] skipping tick — previous tick still running");
          return;
        }
        tileSheddingRunning = true;
        void runtime.tickTileShedding(Date.now(), yieldToEventLoop)
          .catch((error) => { log.error({ err: error }, "tile shedding tick failed"); })
          .finally(() => { tileSheddingRunning = false; });
      }, 60_000);
      populationGrowthTicker = setInterval(() => {
        if (currentSeasonState.status === "ended") return;
        try {
          const growthResult = mainThreadTasks.trackSync("tick_population_growth", undefined, () => runtime.tickPopulationGrowth(Date.now()));
          if (growthResult) {
            const { townsGrown, growthStalledNoFood, townsSkippedWar, townsSkippedCaptureShock, townsSkippedUnfed, townsSkippedLogisticCap, playersSkippedNoFedTowns, playerDiag } = growthResult;
            const anyStalled = growthStalledNoFood > 0 || townsSkippedUnfed > 0 || playersSkippedNoFedTowns > 0;
            if (anyStalled || townsGrown === 0) {
              const diagByPlayer: Record<string, unknown> = {};
              for (const [pid, d] of playerDiag) {
                if (d.grown === 0 && d.totalTowns > 0) diagByPlayer[pid] = d;
              }
              log.warn({
                townsGrown,
                growthStalledNoFood,
                townsSkippedWar,
                townsSkippedCaptureShock,
                townsSkippedUnfed,
                townsSkippedLogisticCap,
                playersSkippedNoFedTowns,
                stalledPlayers: diagByPlayer
              }, "[pop_growth] growth stalled or zero this tick");
            } else {
              log.info({ townsGrown, growthStalledNoFood, townsSkippedWar, townsSkippedUnfed }, "[pop_growth] tick ok");
            }
          }
        } catch (error) {
          log.error({ err: error }, "population growth tick failed");
        }
      }, 60_000);
      let territoryAutomationRunning = false;
      territoryAutomationTicker = setInterval(() => {
        if (currentSeasonState.status === "ended") return;
        // Overlap guard: if the previous async tick is still in progress (took
        // >30s despite yields), skip rather than race two instances on the same
        // shared mutable state (tiles, players, frontierTilesByOwner, etc.).
        if (territoryAutomationRunning) {
          log.info("[territory_automation] skipping tick — previous tick still running");
          return;
        }
        territoryAutomationRunning = true;
        // Async with inter-player yields so the 30s watchdog never fires on a busy
        // tick. trackSync would return before the promise resolves; use void+catch.
        void runtime.tickTerritoryAutomation(Date.now(), yieldToEventLoop)
          .catch((error) => { log.error({ err: error }, "territory automation tick failed"); })
          .finally(() => { territoryAutomationRunning = false; });
      }, 30_000);
      orphanLockSweepTicker = setInterval(() => {
        if (currentSeasonState.status === "ended") return;
        try {
          mainThreadTasks.trackSync("tick_orphan_lock_sweep", undefined, () => {
            const dropped = runtime.tickOrphanedLockSweep(Date.now());
            if (dropped > 0) log.error({ dropped }, "orphan-lock sweep dropped stale locks");
          });
        } catch (error) {
          log.error({ err: error }, "orphan lock sweep tick failed");
        }
      }, 30_000);
      watchedMusterTicker = setInterval(() => {
        if (currentSeasonState.status === "ended") return;
        runtime.tickWatchedMusterTiles(Date.now());
      }, 1_000);
      let passiveIncomeRunning = false;
      passiveIncomeTicker = setInterval(() => {
        if (currentSeasonState.status === "ended") return;
        // Overlap guard: if a previous async tick is still running skip to avoid
        // double-crediting players whose lastIncomeTickAtMs hasn't been advanced yet.
        if (passiveIncomeRunning) {
          log.info("[passive_income] skipping tick — previous tick still running");
          return;
        }
        passiveIncomeRunning = true;
        // Async with per-player yields — cachedEconomySnapshot can rebuild
        // O(settledTiles) per player on cache miss (after territory mutations).
        // Running all 6 players back-to-back synchronously was a 15s stall risk.
        void runtime.applyPassiveIncomeAsync(Date.now(), 12 * 60 * 60 * 1000, yieldToEventLoop)
          .catch((error) => { log.error({ err: error }, "passive income tick failed"); })
          .finally(() => { passiveIncomeRunning = false; });
      }, 15_000);
      eventLoopSampler = setInterval(() => {
        const now = Date.now();
        const lagMs = Math.max(0, now - expectedEventLoopTickAt);
        latestEventLoopLagMs = lagMs;
        eventLoopWindowMaxMs = Math.max(eventLoopWindowMaxMs, lagMs);
        simulationMetrics.observeSimEventLoopDelayMs(lagMs);
        expectedEventLoopTickAt = now + 100;
        // Focused warn whenever a 5s+ block is detected. Otherwise the spike
        // is silently rolled into sim_event_loop_max_ms in the 1Hz dump and
        // we lose the exact moment to correlate with other logs. Block was
        // detected just NOW (the sampler is `lagMs` ms late firing), so the
        // block started at `now - lagMs`. Includes runtime + memory context
        // so we can localise what was running.
        if (lagMs >= 2_000) {
          const memory = process.memoryUsage();
          emitLog("warn", "simulation event loop blocked", {
            phase: "event_loop_blocked",
            lagMs,
            detectedAtMs: now,
            blockStartedAtMs: now - lagMs,
            queueDepths: runtime.queueDepths(),
            heapUsedMb: memory.heapUsed / (1024 * 1024),
            heapTotalMb: memory.heapTotal / (1024 * 1024),
            rssMb: memory.rss / (1024 * 1024),
            persistencePendingCount: persistenceQueue.pendingCount(),
            persistenceDegraded: persistenceQueue.isDegraded(),
            activePlayerCount: activePlayers.size,
            mainThreadTasks: mainThreadTasks.recentSince(now - lagMs, now)
              .sort((a, b) => (b.active ? b.elapsedMs : b.durationMs) - (a.active ? a.elapsedMs : a.durationMs))
              .slice(0, 8)
          });
        }
      }, 100);
      metricsTicker = setInterval(() => {
        simulationMetrics.setSimEventLoopMaxMs(eventLoopWindowMaxMs);
        eventLoopWindowMaxMs = 0;
        simulationMetrics.setSimHumanInteractiveBacklogMs(runtime.queueBacklogMs().human_interactive);
        simulationMetrics.setSimCpuPercent(sampleCpuPercent());
        const memory = process.memoryUsage();
        simulationMetrics.setSimHeapUsageMb({
          heapUsedMb: memory.heapUsed / (1024 * 1024),
          heapTotalMb: memory.heapTotal / (1024 * 1024)
        });
        if (pendingGcDurationsMs.length > 0) {
          for (const durationMs of pendingGcDurationsMs.splice(0)) {
            simulationMetrics.observeSimGcPauseMs(durationMs);
          }
        }
        const now = Date.now();
        if (simulationMetricsLogIntervalMs > 0 && now - lastSimulationMetricsLogAt >= simulationMetricsLogIntervalMs) {
          lastSimulationMetricsLogAt = now;
          const sample = simulationMetrics.snapshot();
          const workerMemoryMb = (() => {
            const toMb = (bytes?: number): number | undefined =>
              typeof bytes === "number" ? Math.round((bytes / (1024 * 1024)) * 10) / 10 : undefined;
            type HasWorkerMetrics = { getWorkerMetrics: () => WorkerMemoryMetrics };
            const snapshotMetrics =
              snapshotStringifier && "getWorkerMetrics" in snapshotStringifier
                ? (snapshotStringifier as HasWorkerMetrics).getWorkerMetrics()
                : undefined;
            const buildWorkerMetrics = snapshotBuildPool?.getMetrics();
            const aiMetrics =
              aiCommandProducer && "getWorkerMetrics" in aiCommandProducer
                ? (aiCommandProducer as HasWorkerMetrics).getWorkerMetrics()
                : undefined;
            const systemMetrics =
              systemCommandProducer && "getWorkerMetrics" in systemCommandProducer
                ? (systemCommandProducer as HasWorkerMetrics).getWorkerMetrics()
                : undefined;
            // Per-worker rss is intentionally dropped — process.memoryUsage().rss
            // inside a Worker returns the shared-process RSS, not the worker's
            // contribution. Heap, external, and arrayBuffers are per-V8-isolate
            // (per-worker) and useful.
            return {
              snapshot: snapshotMetrics
                ? {
                    heap_used_mb: toMb(snapshotMetrics.heapUsedBytes),
                    external_mb: toMb(snapshotMetrics.externalBytes),
                    array_buffers_mb: toMb(snapshotMetrics.arrayBuffersBytes),
                    respawn_count: snapshotMetrics.respawnCount,
                    last_exit_code: snapshotMetrics.lastExitCode
                  }
                : undefined,
              build_workers: buildWorkerMetrics?.map((m, i) => ({
                slot: i,
                heap_used_mb: toMb(m.heapUsedBytes),
                respawn_count: m.respawnCount,
                last_exit_code: m.lastExitCode
              })),
              ai: aiMetrics
                ? {
                    heap_used_mb: toMb(aiMetrics.heapUsedBytes),
                    external_mb: toMb(aiMetrics.externalBytes),
                    array_buffers_mb: toMb(aiMetrics.arrayBuffersBytes),
                    respawn_count: aiMetrics.respawnCount,
                    last_exit_code: aiMetrics.lastExitCode
                  }
                : undefined,
              system: systemMetrics
                ? {
                    heap_used_mb: toMb(systemMetrics.heapUsedBytes),
                    external_mb: toMb(systemMetrics.externalBytes),
                    array_buffers_mb: toMb(systemMetrics.arrayBuffersBytes),
                    respawn_count: systemMetrics.respawnCount,
                    last_exit_code: systemMetrics.lastExitCode
                  }
                : undefined
            };
          })();
          const toMbRounded = (bytes: number): number =>
            Math.round((bytes / (1024 * 1024)) * 10) / 10;
          log.info(
            {
              sim_event_loop_max_ms: sample.simEventLoopMaxMs,
              sim_event_loop_delay_ms: sample.simEventLoopDelayMs,
              sim_tick_duration_ms: sample.simTickDurationMs,
              sim_prepare_player_latency_ms: sample.simPreparePlayerLatencyMs,
              sim_human_interactive_backlog_ms: sample.simHumanInteractiveBacklogMs,
              sim_ai_autopilot_enabled: sample.simAiAutopilotEnabled,
              sim_ai_autopilot_player_count: sample.simAiAutopilotPlayerCount,
              sim_ai_planner_breaches: sample.simAiPlannerBreaches,
              sim_ai_command_total: sample.simAiCommandTotalByType,
              sim_ai_command_recent: sample.simAiCommandRecent,
              sim_ai_preplan_total: sample.simAiPreplanTotalByReason,
              sim_ai_preplan_recent: sample.simAiPreplanRecent,
              sim_ai_preplan_progress_total: sample.simAiPreplanProgressTotalByState,
              sim_ai_preplan_progress_recent: sample.simAiPreplanProgressRecent,
              sim_ai_noop_total: sample.simAiNoopTotalByReason,
              sim_ai_noop_recent: sample.simAiNoopRecent,
              sim_ai_no_frontier_recent: sample.simAiNoFrontierRecent,
              sim_ai_settle_decision_total: sample.simAiSettleDecisionTotalByReason,
              sim_ai_settle_decision_recent: sample.simAiSettleDecisionRecent,
              sim_ai_settle_decision_top_score: sample.simAiSettleDecisionTopScore,
              sim_ai_planner_phase_ms: sample.simAiPlannerPhaseMs,
              sim_runtime_drain_ms: sample.simRuntimeDrainMs,
              sim_runtime_drain_jobs_per_call: sample.simRuntimeDrainJobsPerCall,
              sim_runtime_drain_ms_by_lane: sample.simRuntimeDrainMsByLane,
              sim_runtime_apply_ms_by_command: sample.simRuntimeApplyMsByCommandType,
              sim_checkpoint_rss_mb: sample.simCheckpointRssMb,
              sim_cpu_percent: sample.simCpuPercent,
              sim_rss_mb: toMbRounded(memory.rss),
              sim_heap_used_mb: sample.simHeapUsedMb,
              sim_heap_total_mb: sample.simHeapTotalMb,
              sim_external_mb: toMbRounded(memory.external),
              sim_array_buffers_mb: toMbRounded(memory.arrayBuffers),
              sim_gc_pause_ms: sample.simGcPauseMs,
              sim_command_accept_latency_ms: sample.simCommandAcceptLatencyMsByLane,
              sim_event_store_write_ms: sample.simEventStoreWriteMs,
              sim_snapshot_tile_count: sample.simSnapshotTileCount,
              sim_snapshot_json_bytes: sample.simSnapshotJsonBytes,
              sim_snapshot_tiles_json_bytes: sample.simSnapshotTilesJsonBytes,
              sim_snapshot_cache_entries: sample.simSnapshotCacheEntries,
              sim_snapshot_cache_bytes: sample.simSnapshotCacheBytes,
              sim_snapshot_recent: sample.simSnapshotRecent,
              sim_worker_memory: workerMemoryMb
            },
            "simulation metrics sample"
          );
        }
      }, 1_000);
      const recoveredAiPlayerCount = [...activePlayers.values()].filter((player) => player.isAi).length;
      log.info(
        {
          envAiPlayerCountHint: options.aiPlayerCount,
          recoveredAiPlayerCount
        },
        `recovered ${effectiveStartupRecovery.recoveredCommandCount} commands and ${effectiveStartupRecovery.recoveredEventCount} world events; ${effectiveStartupRecovery.initialState.activeLocks.length} unresolved locks from event log; ${recoveredAiPlayerCount} AI players locked in at season start`
      );
      if (legacySnapshotBootstrap) {
        log.info(
          `legacy snapshot bootstrap loaded: ${legacySnapshotBootstrap.playerProfiles.size} players, ${legacySnapshotBootstrap.initialState.tiles.length} tiles, season ${legacySnapshotBootstrap.season?.seasonId ?? "unknown"}`
        );
      } else if (effectiveStartupRecovery.recoveredEventCount === 0 && effectiveStartupRecovery.recoveredCommandCount === 0) {
        log.info(
          `seed profile ${options.seedProfile ?? "default"}: ${recoveredAiPlayerCount} AI, ${effectiveStartupRecovery.initialState.tiles.filter((tile) => tile.ownershipState === "SETTLED").length} settled tiles, ${effectiveStartupRecovery.initialState.tiles.filter((tile) => tile.town).length} town designations`
        );
      }
      log.info(`simulation service listening on ${boundPort}`);
      if (runStartupReplayCompaction && !startupReplayCompactionPromise) {
        startupReplayCompactionPromise = Promise.resolve().then(runStartupReplayCompaction);
      } else if (
        "getLastLoadedFormatVersion" in snapshotStore &&
        typeof (snapshotStore as { getLastLoadedFormatVersion?: () => number | undefined }).getLastLoadedFormatVersion === "function"
      ) {
        // One-shot v0 -> v1 snapshot migration. If startup-replay-compaction
        // didn't already force a checkpoint and the loaded snapshot is a
        // legacy v0 row, force one now so the next steady-state save is the
        // compact form. This is what shrinks an existing 100+ MB snapshot
        // down to the mutable overlay without waiting for the next natural
        // checkpoint.
        const loadedVersion = (snapshotStore as { getLastLoadedFormatVersion: () => number | undefined }).getLastLoadedFormatVersion();
        if (loadedVersion === 0) {
          startupReplayCompactionPromise = Promise.resolve()
            .then(() => snapshotCheckpointManager.checkpointNow({ ignoreMemoryGuard: true }))
            .then((result) => {
              log.info({ checkpointResult: result }, "simulation snapshot migrated from v0 to v1");
            })
            .catch((error) => {
              log.error({ err: error }, "simulation v0 -> v1 snapshot migration failed");
            });
        }
      }
      return { host, port: boundPort, address: `${host}:${boundPort}` };
    },
    async close(): Promise<void> {
      closeAutopilots();
      clearSeasonVictoryTimer();
      if (metricsTicker) clearInterval(metricsTicker);
      if (eventLoopSampler) clearInterval(eventLoopSampler);
      if (shardRainTicker) clearInterval(shardRainTicker);
      if (tileSheddingTicker) clearInterval(tileSheddingTicker);
      if (territoryAutomationTicker) clearInterval(territoryAutomationTicker);
      if (orphanLockSweepTicker) clearInterval(orphanLockSweepTicker);
      if (watchedMusterTicker) clearInterval(watchedMusterTicker);
      if (populationGrowthTicker) clearInterval(populationGrowthTicker);
      if (passiveIncomeTicker) clearInterval(passiveIncomeTicker);
      gcObserver?.disconnect();
      globalStatusBroadcaster.dispose();
      if (startupReplayCompactionPromise) {
        await startupReplayCompactionPromise;
      }
      await new Promise<void>((resolve, reject) => {
        server.tryShutdown((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      unsubscribeRuntimeEvents?.();
      globalStatusBroadcaster.dispose();
      await persistenceQueue.whenIdle();
      // All persistence tasks have resolved — their acks mean the writer worker
      // has committed every write. Safe to terminate the worker now.
      await writerChannel?.terminate();
    },
    renderMetrics(): string {
      return simulationMetrics.renderPrometheus();
    },
    healthSnapshot(): SimulationHealthSnapshot {
      const degraded = persistenceQueue.isDegraded();
      const lastFailureAt = persistenceQueue.lastFailureAt();
      return {
        ok: !fatalPersistenceError,
        runtimeIdentity: runtimeIdentity(),
        persistence: {
          degraded,
          pendingCount: persistenceQueue.pendingCount(),
          ...(typeof lastFailureAt === "number" ? { lastFailureAt } : {}),
          ...(fatalPersistenceError ? { fatalError: fatalPersistenceError.message } : {})
        },
        season: {
          seasonId: currentSeasonState.seasonId,
          worldSeed: currentSeasonState.worldSeed,
          status: currentSeasonState.status
        },
        startupRecovery: {
          recoveredCommandCount: effectiveStartupRecovery.recoveredCommandCount,
          recoveredEventCount: effectiveStartupRecovery.recoveredEventCount
        }
      };
    },
    metricsSnapshot() {
      return simulationMetrics.snapshot();
    },
    playerDebugSnapshot() {
      return runtime.exportPlayerDebugSnapshot();
    },
    /** Snapshot of the recent lag-diagnostic ring buffer for death forensics. */
    lagDiagSnapshot(): readonly LagDiagEntry[] {
      return lagDiagRing.slice();
    }
  };
};
