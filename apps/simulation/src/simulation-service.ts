import { fileURLToPath } from "node:url";
import { PerformanceObserver } from "node:perf_hooks";

import { Server, ServerCredentials, loadPackageDefinition, type UntypedServiceImplementation } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { SIMULATION_PROTO_PATH, type CommandEnvelope, type PlayerSubscriptionSnapshot, type SimulationEvent } from "@border-empires/sim-protocol";

import { createSimulationCommandStore } from "./command-store-factory.js";
import type { SimulationCommandStore } from "./command-store.js";
import { createSimulationEventStore } from "./event-store-factory.js";
import type { SimulationEventStore } from "./event-store.js";
import { createSimulationSnapshotStore } from "./snapshot-store-factory.js";
import type { SimulationSnapshotStore } from "./snapshot-store.js";
import { createSnapshotCheckpointManager } from "./snapshot-checkpoint-manager.js";
import { createAiCommandProducer } from "./ai-command-producer.js";
import { createWorkerAiCommandProducer } from "./ai-command-producer-worker.js";
import { recoverCommandHistory } from "./command-recovery.js";
import { createSystemCommandProducer } from "./system-command-producer.js";
import { createWorkerSystemCommandProducer } from "./system-command-producer-worker.js";
import { loadLegacySnapshotBootstrap } from "./legacy-snapshot-bootstrap.js";
import { buildNextClientSeqByPlayer } from "./next-client-seq.js";
import { buildPlayerSubscriptionSnapshot } from "./player-snapshot.js";
import { createSeedPlayers, createSeedWorld, type SimulationSeedProfile } from "./seed-state.js";
import { createPlayerSubscriptionRegistry } from "./subscription-registry.js";
import { createSimulationPersistenceQueue } from "./simulation-persistence-queue.js";
import { applyPlayerMessageToSnapshot, applyTileDeltasToSnapshot } from "./subscription-snapshot-cache.js";
import { SimulationRuntime } from "./runtime.js";
import { loadSimulationStartupRecovery } from "./startup-recovery.js";
import { createStartupReplayCompactionRunner } from "./startup-replay-compaction.js";
import { buildWorldStatusSnapshot } from "./world-status-snapshot.js";
import { laneForCommand } from "./command-lane.js";
import { createSimulationMetrics } from "./metrics.js";

type ProtoCommandEnvelope = {
  command_id: string;
  session_id: string;
  player_id: string;
  client_seq: number;
  issued_at: number;
  type: string;
  payload_json: string;
};

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
  }>;
  tileDeltas?: Array<{
    x: number;
    y: number;
    terrain?: string | undefined;
    resource?: string | undefined;
    dockId?: string | undefined;
    ownerId?: string | null | undefined;
    ownershipState?: string | null | undefined;
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
    yield?: {
      gold?: number;
      strategic?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>>;
    } | undefined;
    yieldRate?: {
      goldPerMinute?: number;
      strategicPerDay?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>>;
    } | undefined;
    yieldCap?: { gold: number; strategicEach: number } | undefined;
  }>;
};

type SimulationServiceOptions = {
  host?: string;
  port?: number;
  databaseUrl?: string;
  applySchema?: boolean;
  checkpointEveryEvents?: number;
  checkpointForceAfterEvents?: number;
  checkpointMaxRssBytes?: number;
  checkpointMaxHeapUsedBytes?: number;
  startupReplayCompactionMinEvents?: number;
  seedProfile?: SimulationSeedProfile;
  snapshotDir?: string;
  enableAiAutopilot?: boolean;
  aiTickMs?: number;
  aiMaxEventLoopLagMs?: number;
  enableSystemAutopilot?: boolean;
  systemTickMs?: number;
  globalStatusBroadcastDebounceMs?: number;
  systemPlayerIds?: string[];
  startupRecoveryTimeoutMs?: number;
  allowSeedRecoveryFallback?: boolean;
  requireDurableStartupState?: boolean;
  useAiWorker?: boolean;
  commandStore?: SimulationCommandStore;
  eventStore?: SimulationEventStore;
  snapshotStore?: SimulationSnapshotStore;
  runtimeOptions?: ConstructorParameters<typeof SimulationRuntime>[0];
  log?: Pick<Console, "error" | "info">;
};

type SimulationTileDelta = {
  x: number;
  y: number;
  terrain?: "LAND" | "SEA" | "MOUNTAIN";
  resource?: string | undefined;
  dockId?: string | undefined;
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
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

const recoveredStateFromSeedWorld = (seedWorld: ReturnType<typeof createSeedWorld>) => ({
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

const toProtoEvent = (value: SimulationEvent): ProtoSimulationEvent => ({
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
  tile_deltas:
    value.eventType === "TILE_DELTA_BATCH"
      ? value.tileDeltas.map((tile) => ({
          x: tile.x,
          y: tile.y,
          ...(tile.terrain ? { terrain: tile.terrain } : {}),
          ...(tile.resource ? { resource: tile.resource } : {}),
          ...(tile.dockId ? { dock_id: tile.dockId } : {}),
          ...("ownerId" in tile ? { owner_id: tile.ownerId ?? "" } : {}),
          ...("ownershipState" in tile ? { ownership_state: tile.ownershipState ?? "" } : {}),
          ...(tile.townJson ? { town_json: tile.townJson } : {}),
          ...(tile.townType ? { town_type: tile.townType } : {}),
          ...(tile.townName ? { town_name: tile.townName } : {}),
          ...(tile.townPopulationTier ? { town_population_tier: tile.townPopulationTier } : {}),
          ...("fortJson" in tile ? { fort_json: tile.fortJson ?? "" } : {}),
          ...("observatoryJson" in tile ? { observatory_json: tile.observatoryJson ?? "" } : {}),
          ...("siegeOutpostJson" in tile ? { siege_outpost_json: tile.siegeOutpostJson ?? "" } : {}),
          ...("economicStructureJson" in tile ? { economic_structure_json: tile.economicStructureJson ?? "" } : {}),
          ...("sabotageJson" in tile ? { sabotage_json: tile.sabotageJson ?? "" } : {}),
          ...("shardSiteJson" in tile ? { shard_site_json: tile.shardSiteJson ?? "" } : {})
        }))
      : [],
  ...(value.eventType === "TILE_DELTA_BATCH"
    ? {
        tile_delta_json: JSON.stringify(value.tileDeltas),
        tileDeltas: value.tileDeltas.map((tile) => ({
          x: tile.x,
          y: tile.y,
          ...(tile.terrain ? { terrain: tile.terrain } : {}),
          ...(tile.resource ? { resource: tile.resource } : {}),
          ...(tile.dockId ? { dockId: tile.dockId } : {}),
          ...("ownerId" in tile ? { ownerId: tile.ownerId ?? null } : {}),
          ...("ownershipState" in tile ? { ownershipState: tile.ownershipState ?? null } : {}),
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
          ...("yield" in tile ? { yield: tile.yield } : {}),
          ...("yieldRate" in tile ? { yieldRate: tile.yieldRate } : {}),
          ...("yieldCap" in tile ? { yieldCap: tile.yieldCap } : {})
        }))
      }
    : {})
});

export const createSimulationService = async (options: SimulationServiceOptions = {}) => {
  const log = options.log ?? console;
  const commandTraceEnabled = process.env.SIMULATION_COMMAND_TRACE === "1";
  const slowSubmitWarnMs = Math.max(50, Number(process.env.SIMULATION_SLOW_SUBMIT_WARN_MS ?? 250));
  const slowRuntimeSubmitWarnMs = Math.max(10, Number(process.env.SIMULATION_SLOW_RUNTIME_SUBMIT_WARN_MS ?? 50));
  const slowQueueDrainWarnMs = Math.max(25, Number(process.env.SIMULATION_SLOW_QUEUE_DRAIN_WARN_MS ?? 100));
  const slowPersistenceWarnMs = Math.max(25, Number(process.env.SIMULATION_SLOW_PERSISTENCE_WARN_MS ?? 100));
  const slowAiSyncWarnMs = Math.max(10, Number(process.env.SIMULATION_SLOW_AI_SYNC_WARN_MS ?? 50));
  const logWriters = log as Partial<Record<"info" | "warn" | "error", (...args: unknown[]) => void>>;
  const emitLog = (level: "info" | "warn" | "error", message: string, payload: Record<string, unknown>): void => {
    const writer = logWriters[level];
    if (typeof writer === "function") {
      writer.call(log, payload, message);
      return;
    }
    console[level](message, payload);
  };
  const recordLagDiagnostic = (
    level: "info" | "warn" | "error",
    event: string,
    payload: Record<string, unknown>
  ): void => {
    if (level === "info") return;
    emitLog(level, `simulation lag diagnostic: ${event}`, payload);
  };
  const commandTraceSample = (sample: Record<string, unknown>): void => {
    if (!commandTraceEnabled) return;
    log.info({ ...sample }, "simulation command trace");
  };
  const isDbBackedStartup = typeof options.databaseUrl === "string" && options.databaseUrl.length > 0;
  const requireDurableStartupState = options.requireDurableStartupState ?? isDbBackedStartup;
  const seedPlayers = createSeedPlayers(options.seedProfile);
  const storeFactoryOptions = {
    ...(options.databaseUrl ? { databaseUrl: options.databaseUrl } : {}),
    ...(typeof options.applySchema === "boolean" ? { applySchema: options.applySchema } : {})
  };
  const commandStore =
    options.commandStore ??
    (await createSimulationCommandStore(storeFactoryOptions));
  const eventStore =
    options.eventStore ??
    (await createSimulationEventStore(storeFactoryOptions));
  const snapshotStore =
    options.snapshotStore ??
    (await createSimulationSnapshotStore(storeFactoryOptions));
  let legacySnapshotBootstrap: ReturnType<typeof loadLegacySnapshotBootstrap> | undefined;
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
      if (
        !options.allowSeedRecoveryFallback ||
        legacySnapshotBootstrap ||
        !options.seedProfile ||
        isDbBackedStartup
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
  const activePlayers = legacySnapshotBootstrap?.players ?? seedPlayers;
  const runtime = new SimulationRuntime({
    ...(options.runtimeOptions ?? {}),
    ...(options.seedProfile ? { seedProfile: options.seedProfile } : {}),
    initialState: startupRecovery.initialState,
    initialCommandHistory: startupRecovery.initialCommandHistory,
    mergeSeedTilesWithInitialState: !isDbBackedStartup,
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
      if (sample.durationMs < slowQueueDrainWarnMs) return;
      recordLagDiagnostic("warn", "runtime_queue_drain_slow", sample);
    },
    ...(legacySnapshotBootstrap ? { seedTiles: legacySnapshotBootstrap.seedTiles } : {}),
    initialPlayers: activePlayers
  });
  const simulationMetrics = createSimulationMetrics();
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
  const snapshotCheckpointManager = createSnapshotCheckpointManager({
    eventStore,
    snapshotStore,
    exportSnapshotSections: () => runtime.exportSnapshotSections(),
    exportProjectionState: () => {
      const s = runtime.exportState();
      return { players: s.players, activeLocks: s.activeLocks };
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
      log.info(
        {
          phase,
          pendingEvents,
          rssBytes: memoryUsage.rssBytes,
          heapUsedBytes: memoryUsage.heapUsedBytes,
          heapTotalBytes: memoryUsage.heapTotalBytes,
          ...(typeof lastAppliedEventId === "number" ? { lastAppliedEventId } : {})
        },
        phase === "skipped_high_memory"
          ? "simulation checkpoint deferred due to memory watermark"
          : "simulation checkpoint phase"
      );
    }
  });
  const runStartupReplayCompaction = createStartupReplayCompactionRunner({
    checkpointNow: snapshotCheckpointManager.checkpointNow,
    recoveredEventCount: startupRecovery.recoveredEventCount,
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
  const preparePlayerSlowLogMs = 250;
  const globalStatusBroadcastDebounceMs = options.globalStatusBroadcastDebounceMs ?? 1000;
  let globalStatusBroadcastTimeout: ReturnType<typeof setTimeout> | undefined;
  let pendingGlobalStatusCommandId: string | undefined;
  let metricsTicker: ReturnType<typeof setInterval> | undefined;
  let eventLoopSampler: ReturnType<typeof setInterval> | undefined;
  let eventLoopWindowMaxMs = 0;
  let latestEventLoopLagMs = 0;
  let expectedEventLoopTickAt = Date.now() + 100;
  const sampleCpuPercent = (): number => {
    const at = Date.now();
    const elapsedMicros = Math.max(1, at - lastCpuSampleAt) * 1_000;
    const cpuUsage = process.cpuUsage(lastCpuUsage);
    lastCpuUsage = process.cpuUsage();
    lastCpuSampleAt = at;
    return ((cpuUsage.user + cpuUsage.system) / elapsedMicros) * 100;
  };
  const buildAndCachePlayerSnapshot = (playerId: string): PlayerSubscriptionSnapshot => {
    const runtimeState = runtime.exportVisibleStateForPlayer(playerId);
    const snapshot = buildPlayerSubscriptionSnapshot(playerId, runtimeState, undefined, {
      includeWorldStatus: false
    });
    snapshotCacheByPlayerId.set(playerId, snapshot);
    return snapshot;
  };
  const parseSubscribeOptions = (
    subscriptionJson: string | undefined
  ): { mode: "bootstrap-only" | "live"; emitBootstrapEvent: boolean } => {
    if (!subscriptionJson) return { mode: "live", emitBootstrapEvent: true };
    try {
      const parsed = JSON.parse(subscriptionJson) as { mode?: unknown; emitBootstrapEvent?: unknown };
      return {
        mode: parsed.mode === "bootstrap-only" ? "bootstrap-only" : "live",
        emitBootstrapEvent: parsed.emitBootstrapEvent === false ? false : parsed.mode === "bootstrap-only" ? false : true
      };
    } catch {
      return { mode: "live", emitBootstrapEvent: true };
    }
  };
  const flushGlobalStatusBroadcast = () => {
    globalStatusBroadcastTimeout = undefined;
    if (subscriptionRegistry.subscribedPlayerIds().length === 0) {
      pendingGlobalStatusCommandId = undefined;
      return;
    }
    if (persistenceQueue.isDegraded() || persistenceQueue.pendingCount() > 250) {
      pendingGlobalStatusCommandId = undefined;
      return;
    }
    const runtimeState = runtime.exportState();
    for (const subscribedPlayerId of subscriptionRegistry.subscribedPlayerIds()) {
      const worldStatus = buildWorldStatusSnapshot(subscribedPlayerId, runtimeState, undefined, {
        acceptLatencyP95Ms: simulationMetrics.currentAcceptLatencyP95Ms()
      });
      const cachedSnapshot = snapshotCacheByPlayerId.get(subscribedPlayerId);
      if (cachedSnapshot) {
        snapshotCacheByPlayerId.set(
          subscribedPlayerId,
          applyPlayerMessageToSnapshot(cachedSnapshot, {
            type: "GLOBAL_STATUS_UPDATE",
            leaderboard: worldStatus.leaderboard,
            seasonVictory: worldStatus.seasonVictory,
            ...(typeof worldStatus.acceptLatencyP95Ms === "number" ? { acceptLatencyP95Ms: worldStatus.acceptLatencyP95Ms } : {})
          })
        );
      }
      const globalStatusEvent = toProtoEvent({
        eventType: "PLAYER_MESSAGE",
        commandId: pendingGlobalStatusCommandId ?? `global-status:${Date.now()}`,
        playerId: subscribedPlayerId,
        messageType: "GLOBAL_STATUS_UPDATE",
        payloadJson: JSON.stringify({
          type: "GLOBAL_STATUS_UPDATE",
          leaderboard: worldStatus.leaderboard,
          seasonVictory: worldStatus.seasonVictory,
          ...(typeof worldStatus.acceptLatencyP95Ms === "number" ? { acceptLatencyP95Ms: worldStatus.acceptLatencyP95Ms } : {})
        })
      });
      for (const stream of eventStreams) stream.write(globalStatusEvent);
    }
    pendingGlobalStatusCommandId = undefined;
  };
  const scheduleGlobalStatusBroadcast = (commandId: string) => {
    pendingGlobalStatusCommandId = commandId;
    if (globalStatusBroadcastTimeout) return;
    globalStatusBroadcastTimeout = setTimeout(flushGlobalStatusBroadcast, globalStatusBroadcastDebounceMs);
  };
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
    const runtimeSubmitStartedAt = Date.now();
    runtime.submitCommand(command);
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
  const aiPlayerIds = [...activePlayers.values()].filter((player) => player.isAi).map((player) => player.id);
  const systemPlayerIds = options.systemPlayerIds ?? (activePlayers.has("barbarian-1") ? ["barbarian-1"] : []);
  const autopilotMaxPersistencePending = 256;
  const recoveredCommands = startupRecovery.initialCommandHistory.commands;
  const nextClientSeqByPlayers = (playerIds: string[]): Record<string, number> =>
    buildNextClientSeqByPlayer(recoveredCommands, playerIds);
  const useAiWorker = options.useAiWorker ?? false;
  const aiMaxEventLoopLagMs = Math.max(1, options.aiMaxEventLoopLagMs ?? 250);
  const aiShouldRun = () =>
    !persistenceQueue.isDegraded() &&
    persistenceQueue.pendingCount() < autopilotMaxPersistencePending &&
    latestEventLoopLagMs <= aiMaxEventLoopLagMs;
  const aiCommandProducer = options.enableAiAutopilot
    ? useAiWorker
        ? createWorkerAiCommandProducer({
          runtime,
          aiPlayerIds,
          submitCommand: submitDurableCommand,
          shouldRun: aiShouldRun,
          startingClientSeqByPlayer: nextClientSeqByPlayers(aiPlayerIds),
          tickIntervalMs: options.aiTickMs ?? 250,
          onPlannerTick: ({ breached }) => {
            if (breached) simulationMetrics.incrementSimAiPlannerBreaches();
          },
          onDiagnostic: (sample) => {
            if (sample.durationMs < slowAiSyncWarnMs) return;
            recordLagDiagnostic("warn", "simulation_ai_worker_slow", sample);
          },
          onTick: ({ durationMs }) => {
            simulationMetrics.observeSimTickDurationMs("ai", durationMs);
          },
          onNoCommand: (diagnostic) => {
            if (diagnostic.noCommandReason) {
              simulationMetrics.observeSimAiNoop(diagnostic.noCommandReason, diagnostic.playerId);
            }
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
          onTick: ({ durationMs }) => {
            simulationMetrics.observeSimTickDurationMs("ai", durationMs);
          },
          onNoCommand: (diagnostic) => {
            if (diagnostic.noCommandReason) {
              simulationMetrics.observeSimAiNoop(diagnostic.noCommandReason, diagnostic.playerId);
            }
          }
        })
    : undefined;
  const systemShouldRun = () =>
    !persistenceQueue.isDegraded() &&
    persistenceQueue.pendingCount() < autopilotMaxPersistencePending &&
    latestEventLoopLagMs <= aiMaxEventLoopLagMs;
  const systemCommandProducer = options.enableSystemAutopilot
    ? useAiWorker
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
        })
    : undefined;

  runtime.onEvent((event) => {
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
      event.eventType === "TILE_DELTA_BATCH" || event.eventType === "TECH_UPDATE" || event.eventType === "DOMAIN_UPDATE";
    persistenceQueue.enqueueEvent(event);
    if (shouldBroadcastGlobalStatus) scheduleGlobalStatusBroadcast(event.commandId);
    if (event.eventType === "PLAYER_MESSAGE") {
      const payload = event.payloadJson ? (JSON.parse(event.payloadJson) as Record<string, unknown>) : undefined;
      if (payload) {
        const cachedSnapshot = snapshotCacheByPlayerId.get(event.playerId);
        if (cachedSnapshot) {
          snapshotCacheByPlayerId.set(event.playerId, applyPlayerMessageToSnapshot(cachedSnapshot, payload));
        }
      }
    }
    if (event.eventType === "TILE_DELTA_BATCH") {
      for (const subscribedPlayerId of subscriptionRegistry.subscribedPlayerIds()) {
        const cachedSnapshot = snapshotCacheByPlayerId.get(subscribedPlayerId);
        if (!cachedSnapshot) continue;
        snapshotCacheByPlayerId.set(subscribedPlayerId, applyTileDeltasToSnapshot(cachedSnapshot, event.tileDeltas));
      }
    }
    if (!subscriptionRegistry.isSubscribed(event.playerId)) return;
    const protoEvent = toProtoEvent(event);
    for (const stream of eventStreams) stream.write(protoEvent);
  });

  const serviceImplementation: UntypedServiceImplementation = {
    SubmitCommand(
      call: { request: ProtoCommandEnvelope },
      callback: (error: Error | null, response: { ok: boolean }) => void
    ) {
      const command = toCommandEnvelope(call.request);
      void (async () => {
        const acceptStartedAt = Date.now();
        const lane = laneForCommand(command);
        try {
          if (fatalPersistenceError) {
            throw fatalPersistenceError;
          }
          await submitDurableCommand(command);
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
          callback(null, { ok: true });
        } catch (error) {
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
      call: { request: { player_id: string } },
      callback: (error: Error | null, response: { ok: boolean; player_id: string; playerId?: string; spawned: boolean }) => void
    ) {
      const prepareStartedAt = Date.now();
      let spawned = false;
      try {
        const spawnStartedAt = Date.now();
        spawned = runtime.ensurePlayerHasSpawnTerritory(call.request.player_id);
        simulationMetrics.observeSimPreparePlayerLatencyMs("spawn", Date.now() - spawnStartedAt);
        if (spawned) {
          snapshotCacheByPlayerId.delete(call.request.player_id);
          log.info({ playerId: call.request.player_id }, "spawned runtime territory for prepared player");
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
          tiles: Array<{
            x: number;
            y: number;
            terrain?: string;
            resource?: string;
            dock_id?: string;
            owner_id?: string;
            ownership_state?: string;
            town_json?: string;
            town_type?: string;
            town_name?: string;
            town_population_tier?: string;
          }>;
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
      subscriptionRegistry.subscribe(call.request.player_id);
      const snapshotPayload = snapshotCacheByPlayerId.get(call.request.player_id) ?? buildAndCachePlayerSnapshot(call.request.player_id);
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
        ...(snapshotPayload.player ? { player_json: JSON.stringify(snapshotPayload.player) } : {}),
        ...(snapshotPayload.worldStatus ? { world_status_json: JSON.stringify(snapshotPayload.worldStatus) } : {}),
        tiles: snapshotPayload.tiles.map((tile) => ({
          x: tile.x,
          y: tile.y,
          ...(tile.terrain ? { terrain: tile.terrain } : {}),
          ...(tile.resource ? { resource: tile.resource } : {}),
          ...(tile.dockId ? { dock_id: tile.dockId } : {}),
          ...(tile.ownerId ? { owner_id: tile.ownerId } : {}),
          ...(tile.ownershipState ? { ownership_state: tile.ownershipState } : {}),
          ...(tile.townJson ? { town_json: tile.townJson } : {}),
          ...(tile.townType ? { town_type: tile.townType } : {}),
          ...(tile.townName ? { town_name: tile.townName } : {}),
          ...(tile.townPopulationTier ? { town_population_tier: tile.townPopulationTier } : {}),
          ...("yield" in tile ? { yield: tile.yield } : {}),
          ...("yieldRate" in tile ? { yieldRate: tile.yieldRate } : {}),
          ...("yieldCap" in tile ? { yieldCap: tile.yieldCap } : {})
        }))
      });
      if (!subscribeOptions.emitBootstrapEvent) return;
      const bootstrapEvent = toProtoEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: `bootstrap:${call.request.player_id}:${Date.now()}`,
        playerId: call.request.player_id,
        tileDeltas: snapshotPayload.tiles
      });
      queueMicrotask(() => {
        for (const stream of eventStreams) stream.write(bootstrapEvent);
      });
    },
    UnsubscribePlayer(
      call: { request: { player_id: string } },
      callback: (error: Error | null, response: { ok: boolean }) => void
    ) {
      subscriptionRegistry.unsubscribe(call.request.player_id);
      snapshotCacheByPlayerId.delete(call.request.player_id);
      callback(null, { ok: true });
    },
    Ping(
      _call: unknown,
      callback: (error: Error | null, response: { ok: boolean }) => void
    ) {
      callback(null, { ok: true });
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
    runtime,
    startupRecovery,
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
      eventLoopSampler = setInterval(() => {
        const now = Date.now();
        const lagMs = Math.max(0, now - expectedEventLoopTickAt);
        latestEventLoopLagMs = lagMs;
        eventLoopWindowMaxMs = Math.max(eventLoopWindowMaxMs, lagMs);
        simulationMetrics.observeSimEventLoopDelayMs(lagMs);
        expectedEventLoopTickAt = now + 100;
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
        const sample = simulationMetrics.snapshot();
        log.info(
          {
            sim_event_loop_max_ms: sample.simEventLoopMaxMs,
            sim_event_loop_delay_ms: sample.simEventLoopDelayMs,
            sim_tick_duration_ms: sample.simTickDurationMs,
            sim_prepare_player_latency_ms: sample.simPreparePlayerLatencyMs,
            sim_human_interactive_backlog_ms: sample.simHumanInteractiveBacklogMs,
            sim_ai_planner_breaches: sample.simAiPlannerBreaches,
            sim_ai_noop_total: sample.simAiNoopTotalByReason,
            sim_ai_noop_recent: sample.simAiNoopRecent,
            sim_checkpoint_rss_mb: sample.simCheckpointRssMb,
            sim_cpu_percent: sample.simCpuPercent,
            sim_heap_used_mb: sample.simHeapUsedMb,
            sim_heap_total_mb: sample.simHeapTotalMb,
            sim_gc_pause_ms: sample.simGcPauseMs,
            sim_command_accept_latency_ms: sample.simCommandAcceptLatencyMsByLane,
            sim_event_store_write_ms: sample.simEventStoreWriteMs
          },
          "simulation metrics sample"
        );
      }, 1_000);
      log.info(
        `recovered ${startupRecovery.recoveredCommandCount} commands and ${startupRecovery.recoveredEventCount} world events; ${startupRecovery.initialState.activeLocks.length} unresolved locks from event log`
      );
      if (legacySnapshotBootstrap) {
        log.info(
          `legacy snapshot bootstrap loaded: ${legacySnapshotBootstrap.playerProfiles.size} players, ${legacySnapshotBootstrap.initialState.tiles.length} tiles, season ${legacySnapshotBootstrap.season?.seasonId ?? "unknown"}`
        );
      } else if (startupRecovery.recoveredEventCount === 0 && startupRecovery.recoveredCommandCount === 0) {
        const aiPlayerCount = [...activePlayers.values()].filter((player) => player.isAi).length;
        log.info(
          `seed profile ${options.seedProfile ?? "default"}: ${aiPlayerCount} AI, ${startupRecovery.initialState.tiles.filter((tile) => tile.ownershipState === "SETTLED").length} settled tiles, ${startupRecovery.initialState.tiles.filter((tile) => tile.town).length} town designations`
        );
      }
      log.info(`simulation service listening on ${boundPort}`);
      if (runStartupReplayCompaction && !startupReplayCompactionPromise) {
        startupReplayCompactionPromise = Promise.resolve().then(runStartupReplayCompaction);
      }
      return { host, port: boundPort, address: `${host}:${boundPort}` };
    },
    async close(): Promise<void> {
      aiCommandProducer?.close();
      systemCommandProducer?.close();
      if (metricsTicker) clearInterval(metricsTicker);
      if (eventLoopSampler) clearInterval(eventLoopSampler);
      gcObserver?.disconnect();
      if (globalStatusBroadcastTimeout) {
        clearTimeout(globalStatusBroadcastTimeout);
        globalStatusBroadcastTimeout = undefined;
      }
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
    },
    renderMetrics(): string {
      return simulationMetrics.renderPrometheus();
    },
    metricsSnapshot() {
      return simulationMetrics.snapshot();
    }
  };
};
