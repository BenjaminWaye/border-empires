import type { Player } from "@border-empires/shared";

type LoggerLike = { warn: (payload: unknown, message: string) => void };
type IncidentLogLike = { record: (event: string, payload: Record<string, unknown>) => void };

type AiTickSample = { elapsedMs: number; aiPlayers: number };
type AiBudgetSample = {
  at: number;
  playerId: string;
  elapsedMs: number;
  overBudgetMs: number;
  phase: string;
  phaseElapsedMs: number;
  reason?: string;
  actionKey?: string;
};
type ChunkSnapshotSample = {
  elapsedMs: number;
  visibilityMaskMs: number;
  summaryReadMs: number;
  serializeMs: number;
  sendMs: number;
  cachedPayloadChunks: number;
  rebuiltChunks: number;
  batches: number;
  chunks: number;
  tiles: number;
};

export interface RuntimeDashboardPayload {
  ok: true;
  at: number;
  runtime: Record<string, number | string>;
  counts: Record<string, number>;
  caches: Record<string, number>;
  queuePressure: Record<string, unknown>;
  aiScheduler: Record<string, unknown>;
  aiBudget: Record<string, unknown>;
  victory: Record<string, unknown>;
  hotspots: Record<string, unknown>;
  collections: Array<{ name: string; entries: number }>;
  history: {
    vitals: unknown[];
    aiTicks: AiTickSample[];
    chunkSnapshots: ChunkSnapshotSample[];
  };
}

export interface CreateServerRuntimeAdminDashboardDeps {
  cachedChunkSnapshotByPlayer: Map<string, { payloadByChunkKey: Map<string, string> }>;
  roundTo: (value: number, digits?: number) => number;
  runtimeMemoryWatermarkThresholdsMb: readonly number[];
  runtimeMemoryWatermarksLogged: Set<number>;
  logger: LoggerLike;
  runtimeIncidentLog: IncidentLogLike;
  players: Map<string, Player>;
  ownership: Map<string, string>;
  townsByTile: Map<string, unknown>;
  barbarianAgents: Map<string, unknown>;
  clustersById: Map<string, unknown>;
  chunkSubscriptionByPlayer: Map<string, unknown>;
  cachedVisibilitySnapshotByPlayer: Map<string, unknown>;
  cachedSummaryChunkByChunkKey: Map<string, unknown>;
  chunkSnapshotGenerationByPlayer: Map<string, unknown>;
  chunkSnapshotSentAtByPlayer: Map<string, unknown>;
  actionTimestampsByPlayer: Map<string, unknown>;
  authIdentityByUid: Map<string, unknown>;
  verifiedFirebaseTokenCacheSize: () => number;
  townFeedingStateByPlayer: Map<string, unknown>;
  tileYieldByTile: Map<string, unknown>;
  tileHistoryByTile: Map<string, unknown>;
  terrainShapesByTile: Map<string, unknown>;
  economicStructuresByTile: Map<string, unknown>;
  docksByTile: Map<string, unknown>;
  fortsByTile: Map<string, unknown>;
  observatoriesByTile: Map<string, unknown>;
  siegeOutpostsByTile: Map<string, unknown>;
  runtimeIntervalsLength: () => number;
  percentile: (values: number[], pct: number) => number;
  now: () => number;
  recentAiBudgetBreachPerf: { push: (sample: AiBudgetSample) => void; values: () => AiBudgetSample[] };
  aiTickBudgetMs: number;
  recentAiTickPerf: { values: () => AiTickSample[] };
  recentChunkSnapshotPerf: { values: () => ChunkSnapshotSample[] };
  sampleRuntimeVitals: () => Record<string, number>;
  recentRuntimeVitals: { values: () => Array<Record<string, number>> };
  cachedChunkPayloadDiagnosticsExtras: {
    onlineSocketCount: () => number;
    runtimeCpuCount: number;
    authPressurePending: () => number;
    simulationCommandQueueDepth: () => number;
    aiSchedulerState: Record<string, unknown>;
    aiWorkerState: Record<string, unknown>;
    combatWorkerState: Record<string, unknown>;
    chunkSerializerWorkerState: Record<string, unknown>;
    chunkReadWorkerState: Record<string, unknown>;
    simulationCommandWorkerState: Record<string, unknown>;
    runtimeHotspotExtra: () => { chunkCacheMb: number };
    runtimeVictoryOverview: () => Record<string, unknown>;
  };
}

export const createServerRuntimeAdminDashboard = (deps: CreateServerRuntimeAdminDashboardDeps) => {
  const cachedChunkPayloadDiagnostics = (): { payloads: number; approxPayloadMb: number } => {
    let payloads = 0;
    let bytes = 0;
    for (const cached of deps.cachedChunkSnapshotByPlayer.values()) {
      payloads += cached.payloadByChunkKey.size;
      for (const payload of cached.payloadByChunkKey.values()) bytes += Buffer.byteLength(payload, "utf8");
    }
    return { payloads, approxPayloadMb: deps.roundTo(bytes / (1024 * 1024), 1) };
  };

  const maybeLogRuntimeMemoryWatermark = (reason: string, memory: Record<string, number>, extra: Record<string, unknown> = {}): void => {
    for (const thresholdMb of deps.runtimeMemoryWatermarkThresholdsMb) {
      if ((memory.rssMb ?? 0) < thresholdMb || deps.runtimeMemoryWatermarksLogged.has(thresholdMb)) continue;
      deps.runtimeMemoryWatermarksLogged.add(thresholdMb);
      deps.logger.warn({ reason, thresholdMb, ...memory, ...extra }, "runtime memory watermark crossed");
      deps.runtimeIncidentLog.record("memory_watermark", { reason, thresholdMb, ...memory, ...extra });
    }
  };

  const logSnapshotSerializationMemory = (stage: string, startedAt: number, memory: Record<string, number>, extra: Record<string, unknown> = {}): void => {
    deps.logger.warn({ stage, elapsedMs: Date.now() - startedAt, ...memory, ...extra }, "snapshot serialization memory");
    deps.runtimeIncidentLog.record("snapshot_serialization", { stage, elapsedMs: Date.now() - startedAt, ...memory, ...extra });
    maybeLogRuntimeMemoryWatermark(`snapshot:${stage}`, memory, extra);
  };

  const runtimeCollectionDiagnostics = (): Array<{ name: string; entries: number }> => {
    const collections = [
      { name: "players", entries: deps.players.size },
      { name: "ownership", entries: deps.ownership.size },
      { name: "townsByTile", entries: deps.townsByTile.size },
      { name: "barbarianAgents", entries: deps.barbarianAgents.size },
      { name: "clustersById", entries: deps.clustersById.size },
      { name: "chunkSubscriptionByPlayer", entries: deps.chunkSubscriptionByPlayer.size },
      { name: "cachedVisibilitySnapshotByPlayer", entries: deps.cachedVisibilitySnapshotByPlayer.size },
      { name: "cachedChunkSnapshotByPlayer", entries: deps.cachedChunkSnapshotByPlayer.size },
      { name: "cachedSummaryChunkByChunkKey", entries: deps.cachedSummaryChunkByChunkKey.size },
      { name: "chunkSnapshotGenerationByPlayer", entries: deps.chunkSnapshotGenerationByPlayer.size },
      { name: "chunkSnapshotSentAtByPlayer", entries: deps.chunkSnapshotSentAtByPlayer.size },
      { name: "actionTimestampsByPlayer", entries: deps.actionTimestampsByPlayer.size },
      { name: "authIdentityByUid", entries: deps.authIdentityByUid.size },
      { name: "verifiedFirebaseTokenCache", entries: deps.verifiedFirebaseTokenCacheSize() },
      { name: "townFeedingStateByPlayer", entries: deps.townFeedingStateByPlayer.size },
      { name: "tileYieldByTile", entries: deps.tileYieldByTile.size },
      { name: "tileHistoryByTile", entries: deps.tileHistoryByTile.size },
      { name: "terrainShapesByTile", entries: deps.terrainShapesByTile.size },
      { name: "economicStructuresByTile", entries: deps.economicStructuresByTile.size },
      { name: "docksByTile", entries: deps.docksByTile.size },
      { name: "fortsByTile", entries: deps.fortsByTile.size },
      { name: "observatoriesByTile", entries: deps.observatoriesByTile.size },
      { name: "siegeOutpostsByTile", entries: deps.siegeOutpostsByTile.size },
      { name: "runtimeIntervals", entries: deps.runtimeIntervalsLength() }
    ];
    return collections.sort((a, b) => b.entries - a.entries || a.name.localeCompare(b.name)).slice(0, 12);
  };

  const perfSummary = <T,>(entries: T[], selectElapsedMs: (entry: T) => number) => {
    const elapsed = entries.map(selectElapsedMs).filter((value) => Number.isFinite(value));
    if (!elapsed.length) return { samples: 0, avgMs: 0, p95Ms: 0, maxMs: 0, lastMs: 0 };
    const sum = elapsed.reduce((total, value) => total + value, 0);
    return {
      samples: elapsed.length,
      avgMs: deps.roundTo(sum / elapsed.length, 1),
      p95Ms: deps.roundTo(deps.percentile(elapsed, 0.95), 1),
      maxMs: deps.roundTo(Math.max(...elapsed), 1),
      lastMs: deps.roundTo(elapsed[elapsed.length - 1] ?? 0, 1)
    };
  };

  const chunkPhaseSummary = (entries: ChunkSnapshotSample[]) => {
    const lastEntry = entries[entries.length - 1];
    return {
      visibilityMaskP95Ms: perfSummary(entries, (entry) => entry.visibilityMaskMs).p95Ms,
      summaryReadP95Ms: perfSummary(entries, (entry) => entry.summaryReadMs).p95Ms,
      serializeP95Ms: perfSummary(entries, (entry) => entry.serializeMs).p95Ms,
      sendP95Ms: perfSummary(entries, (entry) => entry.sendMs).p95Ms,
      cachedPayloadChunksAvg: perfSummary(entries, (entry) => entry.cachedPayloadChunks).avgMs,
      rebuiltChunksAvg: perfSummary(entries, (entry) => entry.rebuiltChunks).avgMs,
      batchesAvg: perfSummary(entries, (entry) => entry.batches).avgMs,
      lastVisibilityMaskMs: deps.roundTo(lastEntry?.visibilityMaskMs ?? 0, 1),
      lastSummaryReadMs: deps.roundTo(lastEntry?.summaryReadMs ?? 0, 1),
      lastSerializeMs: deps.roundTo(lastEntry?.serializeMs ?? 0, 1),
      lastSendMs: deps.roundTo(lastEntry?.sendMs ?? 0, 1),
      lastCachedPayloadChunks: deps.roundTo(lastEntry?.cachedPayloadChunks ?? 0, 1),
      lastRebuiltChunks: deps.roundTo(lastEntry?.rebuiltChunks ?? 0, 1),
      lastBatches: deps.roundTo(lastEntry?.batches ?? 0, 1)
    };
  };

  const recordAiBudgetBreach = (
    actor: Player,
    totalElapsedMs: number,
    phaseTimings: Record<string, number>,
    extras?: { reason?: string; actionKey?: string }
  ): void => {
    if (totalElapsedMs < deps.aiTickBudgetMs) return;
    let hottestPhase = "unknown";
    let hottestElapsed = 0;
    for (const [phase, elapsedMs] of Object.entries(phaseTimings)) {
      if (elapsedMs <= hottestElapsed) continue;
      hottestPhase = phase;
      hottestElapsed = elapsedMs;
    }
    const sample: AiBudgetSample = {
      at: deps.now(),
      playerId: actor.id,
      elapsedMs: totalElapsedMs,
      overBudgetMs: deps.roundTo(totalElapsedMs - deps.aiTickBudgetMs, 1),
      phase: hottestPhase,
      phaseElapsedMs: deps.roundTo(hottestElapsed, 1),
      ...(extras?.reason ? { reason: extras.reason } : {}),
      ...(extras?.actionKey ? { actionKey: extras.actionKey } : {})
    };
    deps.recentAiBudgetBreachPerf.push(sample);
    deps.logger.warn(sample, "ai budget breach");
  };

  const runtimeHotspotDiagnostics = () => {
    const aiEntries = deps.recentAiTickPerf.values();
    const aiBudgetEntries = deps.recentAiBudgetBreachPerf.values();
    const chunkEntries = deps.recentChunkSnapshotPerf.values();
    const lastAiBudgetEntry = aiBudgetEntries[aiBudgetEntries.length - 1];
    return {
      aiTicks: { ...perfSummary(aiEntries, (entry) => entry.elapsedMs), lastAiPlayers: aiEntries[aiEntries.length - 1]?.aiPlayers ?? 0 },
      aiBudget: {
        ...perfSummary(aiBudgetEntries, (entry) => entry.elapsedMs),
        budgetMs: deps.aiTickBudgetMs,
        breaches: aiBudgetEntries.length,
        ...(lastAiBudgetEntry?.phase ? { lastPhase: lastAiBudgetEntry.phase } : {}),
        ...(lastAiBudgetEntry?.reason ? { lastReason: lastAiBudgetEntry.reason } : {}),
        ...(lastAiBudgetEntry?.actionKey ? { lastActionKey: lastAiBudgetEntry.actionKey } : {})
      },
      chunkSnapshots: {
        ...perfSummary(chunkEntries, (entry) => entry.elapsedMs),
        ...chunkPhaseSummary(chunkEntries),
        maxChunks: chunkEntries.reduce((max, entry) => Math.max(max, entry.chunks), 0),
        maxTiles: chunkEntries.reduce((max, entry) => Math.max(max, entry.tiles), 0)
      }
    };
  };

  const runtimeDashboardPayload = (): RuntimeDashboardPayload => {
    const latestVitals = deps.recentRuntimeVitals.values().at(-1) ?? deps.sampleRuntimeVitals();
    const cachePayloads = cachedChunkPayloadDiagnostics();
    const recentAiBudgetBreaches = deps.recentAiBudgetBreachPerf.values();
    const lastAiBudgetBreach = recentAiBudgetBreaches.at(-1);
    const extras = deps.cachedChunkPayloadDiagnosticsExtras;
    return {
      ok: true,
      at: deps.now(),
      runtime: {
        ...latestVitals,
        pid: process.pid,
        cpuCount: extras.runtimeCpuCount,
        nodeVersion: process.version
      },
      counts: {
        onlinePlayers: extras.onlineSocketCount(),
        totalPlayers: deps.players.size,
        aiPlayers: [...deps.players.values()].filter((player) => player.isAi).length,
        ownershipTiles: deps.ownership.size,
        towns: deps.townsByTile.size,
        docks: deps.docksByTile.size,
        clusters: deps.clustersById.size,
        barbarianAgents: deps.barbarianAgents.size
      },
      caches: {
        visibilitySnapshots: deps.cachedVisibilitySnapshotByPlayer.size,
        cachedChunkPlayers: deps.cachedChunkSnapshotByPlayer.size,
        cachedChunkPayloads: cachePayloads.payloads,
        cachedChunkPayloadMb: cachePayloads.approxPayloadMb
      },
      queuePressure: {
        pendingAuthVerifications: extras.authPressurePending(),
        runtimeIntervals: deps.runtimeIntervalsLength(),
        ...extras.simulationCommandWorkerState,
        ...extras.aiWorkerState,
        ...extras.combatWorkerState,
        ...extras.chunkSerializerWorkerState,
        ...extras.chunkReadWorkerState,
        simulationCommandQueueDepth: extras.simulationCommandQueueDepth()
      },
      aiScheduler: extras.aiSchedulerState,
      aiBudget: {
        budgetMs: deps.aiTickBudgetMs,
        breaches: recentAiBudgetBreaches.length,
        ...(lastAiBudgetBreach?.phase ? { lastPhase: lastAiBudgetBreach.phase } : {}),
        ...(lastAiBudgetBreach?.reason ? { lastReason: lastAiBudgetBreach.reason } : {}),
        ...(lastAiBudgetBreach?.actionKey ? { lastActionKey: lastAiBudgetBreach.actionKey } : {}),
        recent: recentAiBudgetBreaches
      },
      victory: extras.runtimeVictoryOverview(),
      hotspots: {
        ...runtimeHotspotDiagnostics(),
        ...extras.runtimeHotspotExtra()
      },
      collections: runtimeCollectionDiagnostics(),
      history: {
        vitals: deps.recentRuntimeVitals.values(),
        aiTicks: deps.recentAiTickPerf.values(),
        chunkSnapshots: deps.recentChunkSnapshotPerf.values()
      }
    };
  };

  return {
    cachedChunkPayloadDiagnostics,
    maybeLogRuntimeMemoryWatermark,
    logSnapshotSerializationMemory,
    runtimeCollectionDiagnostics,
    recordAiBudgetBreach,
    runtimeHotspotDiagnostics,
    runtimeDashboardPayload
  };
};
