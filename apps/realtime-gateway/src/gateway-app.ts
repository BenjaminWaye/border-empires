import { PerformanceObserver } from "node:perf_hooks";

import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { buildFrontierCombatPreview, scanOutpostMult, type OutpostAuraTileFacts } from "@border-empires/shared";
import { ClientMessageSchema } from "@border-empires/shared";

import { preSerializeBroadcast, sendJsonToSocket, unwrapPayloadSource } from "./broadcast-payload.js";
import { createSlowLoginAlerter } from "./slow-login-alert.js";
import { resolveGatewayAuthIdentity } from "./auth-identity.js";
import { reconcileGatewayAuthBinding, type ResolvedGatewayAuthBinding } from "./gateway-auth-binding-resolution.js";
import type { GatewayAuthBindingStore } from "./auth-binding-store.js";
import { createGatewayAuthBindingStore } from "./auth-binding-store-factory.js";
import type { GatewayCommandStore } from "./command-store.js";
import { createGatewayCommandStore } from "./command-store-factory.js";
import {
  createEmailAlertService,
  readAttackAlert,
  readIncomingAllianceRequestAlert,
  readIncomingTruceRequestAlert,
  type EmailAlertConfig,
  type EmailAlertOutcome
} from "./email-alerts.js";
import { submitDurableCommand, submitFrontierCommand, type GatewaySocketSession } from "./frontier-submit.js";
import { registerGatewayHttpRoutes } from "./http-routes.js";
import { createGatewayMetrics } from "./metrics.js";
import { createPlayerSubscriptions } from "./player-subscriptions.js";
import { createPlayerProfileOverrides } from "./player-profile-overrides.js";
import type { GatewayPlayerProfileStore, StoredPlayerProfile } from "./player-profile-store.js";
import { createGatewayPlayerProfileStore } from "./player-profile-store-factory.js";
import { reserveRallyLinkForAuth } from "./rally-link-auth.js";
import { rallyAnchorFromTiles } from "./rally-link-anchor.js";
import { createGatewayRallyLinkStore } from "./rally-link-store-factory.js";
import type { RallyAnchor } from "./rally-link-store.js";
import { withTimeout } from "./promise-timeout.js";
import { retryStartup } from "./startup-retry.js";
import { resolveInitialState } from "./initial-state.js";
import { createFullVisibilityReplacementPayloadCache } from "./full-visibility-replacement-payload-cache.js";
import { buildInitMessage } from "./reconnect-recovery.js";
import { type SimulationSeedProfile } from "./seed-fallback.js";
import { createSimulationClient, type SimulationClientEvent } from "./sim-client.js";
import { selectSocketsForEvent, selectSocketsForTileDeltaBatchByPlayer } from "./socket-routing.js";
import { createSocialState, type SocialTruceRequest } from "./social-state.js";
import { applyPlayerMessageToSnapshot, applyTileDeltasToSnapshot } from "./subscription-snapshot-sync.js";
import { supportedClientMessageTypes } from "./supported-client-messages.js";
import { buildSnapshotTileDetail } from "./tile-detail-snapshot.js";
import { hydrateVisibleLiveProfileOverrides, recoverLivePlayerMessage } from "./live-world-status-recovery.js";
import {
  hydrateCurrentSeasonSummaryDisplayNames,
  hydrateSeasonArchiveDisplayNames
} from "./hq-summary-hydration.js";
import { loadLegacySnapshotBootstrap } from "../../simulation/src/legacy-snapshot-bootstrap.js";
import { isFrontierAdjacent } from "../../simulation/src/frontier-adjacency.js";
import { createSeedPlayers, createSeedWorld } from "../../simulation/src/seed-state.js";
import { seasonalPlayerNameForId } from "../../simulation/src/season-worldgen.js";
import { jsonByteSize, measurePlayerSubscriptionSnapshot, summarizePlayerSubscriptionSnapshotCache, type CommandEnvelope, type PlayerSubscriptionSnapshot, type PlayerSubscriptionSnapshotCacheSummary } from "@border-empires/sim-protocol";

type SocketSession = Omit<GatewaySocketSession, "playerId"> & {
  playerId?: string;
  initSent: boolean;
  pendingPayloads: unknown[];
  channel: "control" | "bulk";
  canToggleFog: boolean;
  fogDisabled: boolean;
};

type SimulationClient = ReturnType<typeof createSimulationClient>;

type RealtimeGatewayAppOptions = {
  host?: string;
  port?: number;
  logger?: boolean;
  simulationAddress?: string;
  simulationWakeAddress?: string;
  simulationClient?: SimulationClient;
  commandStore?: GatewayCommandStore;
  profileStore?: GatewayPlayerProfileStore;
  authBindingStore?: GatewayAuthBindingStore;
  databaseUrl?: string;
  sqlitePath?: string;
  applySchema?: boolean;
  defaultHumanPlayerId?: string;
  simulationSeedProfile?: SimulationSeedProfile;
  allowNonAuthoritativeInitialState?: boolean;
  snapshotDir?: string;
  createCommandId?: () => string;
  now?: () => number;
  simulationPrepareTimeoutMs?: number;
  simulationSubscribeTimeoutMs?: number;
  simulationSubmitTimeoutMs?: number;
  simulationRpcRetryAttempts?: number;
  adminApiToken?: string;
  fogAdminEmail?: string;
  emailAlerts?: EmailAlertConfig;
  playOrigin?: string;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const sendJson = (socket: import("ws").WebSocket, payload: unknown): void => {
  sendJsonToSocket(socket, payload);
};

const canToggleFogForEmail = (email: string | undefined, fogAdminEmail: string | undefined): boolean => {
  const normalized = (email ?? "").trim().toLowerCase();
  const target = (fogAdminEmail ?? "").trim().toLowerCase();
  return normalized.length > 0 && target.length > 0 && normalized === target;
};

const initialSocialNameForSeedPlayer = (playerId: string, seedName: string | undefined): string => {
  if (playerId === "barbarian-1") return "Barbarians";
  if (playerId.startsWith("ai-")) return `AI ${playerId.slice(3)}`;
  return seedName ?? playerId;
};

const seasonalDefaultAiPlayerIds = (): string[] => Array.from({ length: 20 }, (_, index) => `ai-${index + 1}`);

const adjacentKeysForTile = (x: number, y: number): string[] => [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`];

const extractTruceRequestFromPayloads = (
  payloadsByPlayerId: Map<string, unknown[]>,
  playerId: string
): SocialTruceRequest | undefined => {
  for (const payload of payloadsByPlayerId.get(playerId) ?? []) {
    if (!payload || typeof payload !== "object") continue;
    const typed = payload as { type?: unknown; request?: unknown };
    if (typed.type !== "TRUCE_REQUESTED" || !typed.request || typeof typed.request !== "object") continue;
    return typed.request as SocialTruceRequest;
  }
  return undefined;
};

const seededAiTruceDecisionFromSnapshot = (
  snapshot: PlayerSubscriptionSnapshot,
  request: SocialTruceRequest,
  economyStrained = false
): "accept" | "reject" => {
  const tilesByKey = new Map<string, PlayerSubscriptionSnapshot["tiles"][number]>(
    snapshot.tiles.map((tile) => [`${tile.x},${tile.y}`, tile] as const)
  );
  let pressuredBorderTiles = 0;
  let pressuredTownTiles = 0;
  for (const tile of snapshot.tiles) {
    if (tile.ownerId !== request.toPlayerId || tile.terrain !== "LAND") continue;
    const hasRequesterNeighbor = adjacentKeysForTile(tile.x, tile.y).some((key) => tilesByKey.get(key)?.ownerId === request.fromPlayerId);
    if (!hasRequesterNeighbor) continue;
    pressuredBorderTiles += 1;
    if (tile.townType || tile.townJson) pressuredTownTiles += 1;
  }
  const coreThreatened = pressuredTownTiles > 0;
  if (pressuredBorderTiles <= 0) return "reject";
  if (coreThreatened && !economyStrained) return "reject";
  if (request.durationHours === 12) return "accept";
  return economyStrained ? "accept" : "reject";
};

const seededAiEconomyStrained = (
  player:
    | PlayerSubscriptionSnapshot["player"]
    | {
        strategicResources?: Partial<Record<"FOOD", number>>;
        strategicProductionPerMinute?: Partial<Record<"FOOD", number>>;
      }
    | undefined
): boolean => {
  if (!player) return false;
  const incomePerMinute = "incomePerMinute" in player ? player.incomePerMinute : 0;
  const foodStock = player.strategicResources?.FOOD ?? 0;
  const foodProduction = player.strategicProductionPerMinute?.FOOD ?? 0;
  return incomePerMinute < 40 || foodStock < 50 || foodProduction < 0;
};

const playerSubscriptionSnapshotFromSeedWorld = (
  seedWorld: ReturnType<typeof createSeedWorld>,
  playerId: string
): PlayerSubscriptionSnapshot => ({
  playerId,
  tiles: [...seedWorld.tiles.values()].map((tile) => ({
    x: tile.x,
    y: tile.y,
    terrain: tile.terrain,
    ...(tile.resource ? { resource: tile.resource } : {}),
    ...(tile.dockId ? { dockId: tile.dockId } : {}),
    ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
    ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
    ...(tile.town?.type ? { townType: tile.town.type } : {}),
    ...(tile.town?.name ? { townName: tile.town.name } : {}),
    ...(tile.town?.populationTier ? { townPopulationTier: tile.town.populationTier } : {})
  }))
});

const jsonSafeTileDeltaBatch = (
  tileDeltas: Array<
    | NonNullable<Extract<SimulationClientEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"]>[number]
    | NonNullable<PlayerSubscriptionSnapshot["tiles"][number]>
  >
): Array<Record<string, unknown>> =>
  tileDeltas.map((tileDelta) => ({
    ...tileDelta,
    ...("ownerId" in tileDelta && tileDelta.ownerId === undefined ? { ownerId: null } : {}),
    ...("ownershipState" in tileDelta && tileDelta.ownershipState === undefined ? { ownershipState: null } : {}),
    ...("fortJson" in tileDelta && tileDelta.fortJson === undefined ? { fortJson: "" } : {}),
    ...("observatoryJson" in tileDelta && tileDelta.observatoryJson === undefined ? { observatoryJson: "" } : {}),
    ...("siegeOutpostJson" in tileDelta && tileDelta.siegeOutpostJson === undefined ? { siegeOutpostJson: "" } : {}),
    ...("economicStructureJson" in tileDelta && tileDelta.economicStructureJson === undefined
      ? { economicStructureJson: "" }
      : {}),
    ...("sabotageJson" in tileDelta && tileDelta.sabotageJson === undefined ? { sabotageJson: "" } : {}),
    ...("shardSiteJson" in tileDelta && tileDelta.shardSiteJson === undefined ? { shardSiteJson: "" } : {})
  }));

const optionalCommandMetadata = (message: unknown): { commandId?: string; clientSeq?: number } => {
  if (!message || typeof message !== "object") return {};
  const candidate = message as { commandId?: unknown; clientSeq?: unknown };
  return {
    ...(typeof candidate.commandId === "string" ? { commandId: candidate.commandId } : {}),
    ...(typeof candidate.clientSeq === "number" ? { clientSeq: candidate.clientSeq } : {})
  };
};

const readPayloadType = (payload: unknown): string | undefined => {
  const source = unwrapPayloadSource(payload);
  if (!source || typeof source !== "object") return undefined;
  const candidate = source as { type?: unknown };
  return typeof candidate.type === "string" ? candidate.type : undefined;
};

const readPayloadCommandId = (payload: unknown): string | undefined => {
  const source = unwrapPayloadSource(payload);
  if (!source || typeof source !== "object") return undefined;
  const candidate = source as { commandId?: unknown };
  return typeof candidate.commandId === "string" ? candidate.commandId : undefined;
};

const readPayloadTarget = (payload: unknown): { x: number; y: number } | undefined => {
  const source = unwrapPayloadSource(payload);
  if (!source || typeof source !== "object") return undefined;
  const candidate = source as { target?: unknown };
  if (!candidate.target || typeof candidate.target !== "object") return undefined;
  const target = candidate.target as { x?: unknown; y?: unknown };
  return typeof target.x === "number" && typeof target.y === "number" ? { x: target.x, y: target.y } : undefined;
};

const visibleBootstrapPlayerIds = (snapshot: PlayerSubscriptionSnapshot | undefined): string[] => {
  const playerIds = new Set<string>();
  const worldStatus = snapshot?.worldStatus;
  const leaderboard = worldStatus?.leaderboard;
  if (leaderboard) {
    for (const entry of leaderboard.overall) playerIds.add(entry.id);
    for (const entry of leaderboard.byTiles) playerIds.add(entry.id);
    for (const entry of leaderboard.byIncome) playerIds.add(entry.id);
    for (const entry of leaderboard.byTechs) playerIds.add(entry.id);
    if (leaderboard.selfOverall) playerIds.add(leaderboard.selfOverall.id);
    if (leaderboard.selfByTiles) playerIds.add(leaderboard.selfByTiles.id);
    if (leaderboard.selfByIncome) playerIds.add(leaderboard.selfByIncome.id);
    if (leaderboard.selfByTechs) playerIds.add(leaderboard.selfByTechs.id);
  }
  for (const objective of worldStatus?.seasonVictory ?? []) {
    if (objective.leaderPlayerId) playerIds.add(objective.leaderPlayerId);
  }
  return [...playerIds];
};

export const hydrateVisibleLeaderboardProfileOverrides = async (
  snapshot: PlayerSubscriptionSnapshot | undefined,
  profileStore: GatewayPlayerProfileStore,
  profileOverrides: ReturnType<typeof createPlayerProfileOverrides>
): Promise<void> => {
  const visiblePlayerProfiles = await profileStore.getMany(visibleBootstrapPlayerIds(snapshot));
  for (const profile of visiblePlayerProfiles) {
    profileOverrides.upsert(profile.playerId, {
      ...(profile.name ? { name: profile.name } : {}),
      ...(profile.tileColor ? { tileColor: profile.tileColor } : {}),
      ...(typeof profile.profileComplete === "boolean" ? { profileComplete: profile.profileComplete } : {})
    });
  }
};

type PreviewTile = {
  x: number;
  y: number;
  terrain?: string | undefined;
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  dockId?: string | undefined;
  townType?: string | undefined;
  economicStructureJson?: string | undefined;
  siegeOutpostJson?: string | undefined;
};

const previewTileKey = (x: number, y: number): string => `${x},${y}`;

type PreviewTileWithAura = PreviewTile & OutpostAuraTileFacts;

const parseStructureJson = <T>(json: string | undefined): T | undefined => {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
};

// Builds a single tile map keyed by "x,y" that also carries each tile's
// JSON-decoded outpost structures. Parsing happens once per preview, not
// once per scan-cell, so the 5x5 aura sweep does only Map.get() work.
const buildPreviewTileMap = (tiles: PreviewTile[]): Map<string, PreviewTileWithAura> => {
  const map = new Map<string, PreviewTileWithAura>();
  for (const tile of tiles) {
    const siegeOutpost = parseStructureJson<{ ownerId?: string; status?: string }>(tile.siegeOutpostJson);
    const economicStructure = parseStructureJson<{ ownerId?: string; type?: string; status?: string }>(tile.economicStructureJson);
    map.set(previewTileKey(tile.x, tile.y), {
      ...tile,
      ...(siegeOutpost ? { siegeOutpost } : {}),
      ...(economicStructure ? { economicStructure } : {})
    });
  }
  return map;
};

const attackPreviewResult = (
  playerId: string,
  tiles: PreviewTile[] | undefined,
  message: { fromX: number; fromY: number; toX: number; toY: number }
): Record<string, unknown> => {
  const from = { x: message.fromX, y: message.fromY };
  const to = { x: message.toX, y: message.toY };
  if (!tiles) {
    return { type: "ATTACK_PREVIEW_RESULT", from, to, valid: false, reason: "preview unavailable" };
  }
  const tileMap = buildPreviewTileMap(tiles);
  const origin = tileMap.get(previewTileKey(from.x, from.y));
  const target = tileMap.get(previewTileKey(to.x, to.y));
  if (!origin || origin.ownerId !== playerId) {
    return { type: "ATTACK_PREVIEW_RESULT", from, to, valid: false, reason: "origin not owned" };
  }
  if (!target) {
    return { type: "ATTACK_PREVIEW_RESULT", from, to, valid: false, reason: "target not visible" };
  }
  if (!target.ownerId || target.ownerId === playerId) {
    return { type: "ATTACK_PREVIEW_RESULT", from, to, valid: false, reason: "target not hostile" };
  }
  if (!isFrontierAdjacent(from.x, from.y, to.x, to.y)) {
    return { type: "ATTACK_PREVIEW_RESULT", from, to, valid: false, reason: "target not adjacent" };
  }
  const attackerOutpostMult = scanOutpostMult(playerId, from.x, from.y, (x, y) => tileMap.get(previewTileKey(x, y)));
  const preview = buildFrontierCombatPreview(target, { attackerOutpostMult });
  return {
    type: "ATTACK_PREVIEW_RESULT",
    from,
    to,
    valid: true,
    winChance: preview.winChance,
    atkEff: preview.atkEff,
    defEff: preview.defEff,
    defMult: preview.defMult,
    atkMult: preview.atkMult
  };
};

export const createRealtimeGatewayApp = async (options: RealtimeGatewayAppOptions = {}) => {
  const app = Fastify({ logger: options.logger ?? true });
  await app.register(websocket);
  const startupStartedAt = Date.now();
  const allowNonAuthoritativeInitialState =
    options.allowNonAuthoritativeInitialState ??
    process.env.GATEWAY_ALLOW_SEED_FALLBACK !== "0";
  const simulationSeedProfile = options.simulationSeedProfile ?? "default";
  let legacySnapshotBootstrap: ReturnType<typeof loadLegacySnapshotBootstrap> | undefined;
  if (options.snapshotDir) {
    try {
      legacySnapshotBootstrap = loadLegacySnapshotBootstrap(options.snapshotDir);
    } catch (error) {
      const isMissingSnapshotFile = typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
      if (!isMissingSnapshotFile) throw error;
      app.log.warn(
        { snapshotDir: options.snapshotDir, err: error },
        "legacy snapshot bootstrap files not found; continuing without legacy bootstrap"
      );
    }
  }
  const recentGatewayEvents: Array<{ at: number; level: "info" | "warn" | "error"; event: string; payload: Record<string, unknown> }> = [];
  const recordGatewayEvent = (level: "info" | "warn" | "error", event: string, payload: Record<string, unknown> = {}): void => {
    recentGatewayEvents.push({ at: Date.now(), level, event, payload });
    if (recentGatewayEvents.length > 250) recentGatewayEvents.splice(0, recentGatewayEvents.length - 250);
    if (event.startsWith("gateway_fog_")) {
      const logger = level === "error" ? app.log.error.bind(app.log) : level === "warn" ? app.log.warn.bind(app.log) : app.log.info.bind(app.log);
      logger({ event, ...payload }, event);
    }
  };

  const simulationClient =
    options.simulationClient ?? createSimulationClient(options.simulationAddress ?? "127.0.0.1:50051");
  const simulationWakeClient =
    !options.simulationClient && options.simulationWakeAddress && options.simulationWakeAddress !== options.simulationAddress
      ? createSimulationClient(options.simulationWakeAddress)
      : undefined;
  const simulationSubscribeTimeoutMs = Math.max(
    1_000,
    options.simulationSubscribeTimeoutMs ?? Number(process.env.GATEWAY_SIMULATION_SUBSCRIBE_TIMEOUT_MS ?? 8_000)
  );
  const simulationPrepareTimeoutMs = Math.max(
    1_000,
    options.simulationPrepareTimeoutMs ??
      Number(process.env.GATEWAY_SIMULATION_PREPARE_TIMEOUT_MS ?? simulationSubscribeTimeoutMs)
  );
  const simulationPingTimeoutMs = Math.max(1_500, Number(process.env.GATEWAY_SIMULATION_PING_TIMEOUT_MS ?? 20_000));
  const liveProfileHydrationTimeoutMs = 150;
  const simulationSubmitTimeoutMs = Math.max(
    500,
    options.simulationSubmitTimeoutMs ??
      Number(process.env.GATEWAY_SIMULATION_SUBMIT_TIMEOUT_MS ?? Math.min(simulationPingTimeoutMs, 2_500))
  );
  const simulationWakeMaxAttempts = Math.max(1, Number(process.env.GATEWAY_SIMULATION_WAKE_MAX_ATTEMPTS ?? 12));
  const simulationWakeBaseDelayMs = Math.max(100, Number(process.env.GATEWAY_SIMULATION_WAKE_BASE_DELAY_MS ?? 500));
  const simulationWakeMaxDelayMs = Math.max(simulationWakeBaseDelayMs, Number(process.env.GATEWAY_SIMULATION_WAKE_MAX_DELAY_MS ?? 5_000));
  const simulationWakeTotalTimeoutMs = Math.max(
    simulationPingTimeoutMs,
    Number(process.env.GATEWAY_SIMULATION_WAKE_TOTAL_TIMEOUT_MS ?? 90_000)
  );
  const simulationHealthFailureThreshold = Math.max(
    1,
    Number(process.env.GATEWAY_SIMULATION_HEALTH_FAILURE_THRESHOLD ?? 3)
  );
  const simulationHealth = {
    connected: false,
    lastReadyAt: undefined as number | undefined,
    lastError: undefined as string | undefined
  };
  let simulationRpcConnected = false;
  let simulationEventStreamConnected = false;
  let simulationConsecutiveHealthFailures = 0;
  let simulationHealthRefreshInFlight = false;
  const gatewayMetrics = createGatewayMetrics();
  const slowLoginAlerter = createSlowLoginAlerter({
    ...(process.env.GATEWAY_SLOW_LOGIN_ALERT_SLACK_WEBHOOK
      ? { webhookUrl: process.env.GATEWAY_SLOW_LOGIN_ALERT_SLACK_WEBHOOK }
      : {}),
    thresholdMs: Math.max(5_000, Number(process.env.GATEWAY_SLOW_LOGIN_ALERT_THRESHOLD_MS ?? 60_000)),
    metricsSnapshot: () => gatewayMetrics.snapshot(),
    recentEvents: () => recentGatewayEvents,
    log: { error: (payload, message) => app.log.error(payload, message) },
    appLabel: process.env.GATEWAY_SLOW_LOGIN_ALERT_LABEL ?? "border-empires-combined-staging"
  });
  const slowGatewaySubmitWarnMs = Math.max(100, Number(process.env.GATEWAY_SLOW_SUBMIT_WARN_MS ?? 1_000));
  const slowGatewayRpcWarnMs = Math.max(100, Number(process.env.GATEWAY_SLOW_RPC_WARN_MS ?? 1_000));
  // Threshold for "single processSimulationEvent handler took too long" warning.
  // The gateway serializes all sim events through a single Promise chain
  // (simulationEventChain), so any slow handler stalls every subsequent event.
  // Set 0 to disable. Captures wait time in the chain queue separately from
  // run time so we can tell whether this event was slow or just blocked by
  // the previous one.
  const slowGatewaySimEventWarnMs = Math.max(0, Number(process.env.GATEWAY_SLOW_SIM_EVENT_WARN_MS ?? 100));
  let gatewayMetricsTimer: ReturnType<typeof setInterval> | undefined;
  let gatewayEventLoopTimer: ReturnType<typeof setInterval> | undefined;
  let gatewayEventLoopWindowMaxMs = 0;
  let expectedEventLoopTickAt = Date.now() + 100;
  let lastCpuSampleAt = Date.now();
  let lastCpuUsage = process.cpuUsage();
  const pendingGcDurationsMs: number[] = [];
  const pendingInputToStateByCommandId = new Map<string, number>();
  const controlPathEventNames = new Set([
    "gateway_auth",
    "gateway_auth_binding_override",
    "gateway_auth_binding_confirmed",
    "gateway_auth_binding_failed",
    "gateway_auth_bootstrap_ready",
    "gateway_auth_bootstrap_failed",
    "gateway_auth_subscribe_ready",
    "gateway_auth_subscribe_failed",
    "simulation_command_rejected_unavailable",
    "simulation_submit_failed",
    "simulation_event_stream_disconnected",
    "gateway_websocket_message_failed"
  ]);
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
  const sampleCpuPercent = (): number => {
    const at = Date.now();
    const elapsedMicros = Math.max(1, at - lastCpuSampleAt) * 1_000;
    const cpuUsage = process.cpuUsage(lastCpuUsage);
    lastCpuUsage = process.cpuUsage();
    lastCpuSampleAt = at;
    return ((cpuUsage.user + cpuUsage.system) / elapsedMicros) * 100;
  };
  const buildPendingInputToStateEvents = (): Array<{
    at: number;
    level: "info" | "warn" | "error";
    event: string;
    payload: Record<string, unknown>;
  }> =>
    [...pendingInputToStateByCommandId.entries()]
      .map(([commandId, submittedAt]) => {
        const ageMs = Date.now() - submittedAt;
        const level: "info" | "warn" = ageMs >= 5_000 ? "warn" : "info";
        return {
          at: submittedAt,
          level,
          event: "pending_input_to_state",
          payload: {
            commandId,
            ageMs,
            simulationConnected: simulationHealth.connected,
            simulationLastError: simulationHealth.lastError ?? ""
          }
        };
      })
      .sort((left, right) => left.at - right.at);
  const buildAttackDebug = () => {
    const recentEvents = [...recentGatewayEvents];
    const pendingEvents = buildPendingInputToStateEvents();
    return {
      controlPath: recentEvents.filter((event) => controlPathEventNames.has(event.event)),
      hotPath: [...recentEvents.filter((event) => typeof event.payload.commandId === "string"), ...pendingEvents].sort(
        (left, right) => left.at - right.at
      ),
      slowOrWarn: [...recentEvents.filter((event) => event.level !== "info"), ...pendingEvents.filter((event) => event.level !== "info")].sort(
        (left, right) => left.at - right.at
      )
    };
  };
  const buildAttackTraces = () => {
    const grouped = new Map<string, Array<{ at: number; level: "info" | "warn" | "error"; event: string; payload: Record<string, unknown> }>>();
    for (const event of [...recentGatewayEvents, ...buildPendingInputToStateEvents()]) {
      const commandId = typeof event.payload.commandId === "string" ? event.payload.commandId : undefined;
      if (!commandId) continue;
      const existing = grouped.get(commandId);
      if (existing) existing.push(event);
      else grouped.set(commandId, [event]);
    }
    return [...grouped.entries()]
      .map(([traceId, events]) => {
        const sortedEvents = [...events].sort((left, right) => left.at - right.at);
        return {
          traceId,
          firstAt: sortedEvents[0]?.at ?? 0,
          lastAt: sortedEvents[sortedEvents.length - 1]?.at ?? 0,
          events: sortedEvents
        };
      })
      .sort((left, right) => right.lastAt - left.lastAt);
  };
  let simulationHealthTimer: ReturnType<typeof setInterval> | undefined;
  const refreshCombinedSimulationHealth = (): void => {
    simulationHealth.connected = simulationRpcConnected && simulationEventStreamConnected;
    if (simulationHealth.connected) {
      simulationHealth.lastReadyAt = Date.now();
      simulationHealth.lastError = undefined;
      simulationConsecutiveHealthFailures = 0;
    }
  };
  const markSimulationReady = (): void => {
    simulationRpcConnected = true;
    refreshCombinedSimulationHealth();
  };
  const markSimulationUnavailable = (error: unknown): void => {
    simulationRpcConnected = false;
    simulationHealth.connected = false;
    simulationHealth.lastError = error instanceof Error ? error.message : String(error);
  };
  const syncAllianceToSimulation = async (input: { playerId: string; targetPlayerId: string; allied: boolean }): Promise<void> => {
    if (!simulationHealth.connected) {
      recordGatewayEvent("warn", "gateway_social_simulation_sync_skipped", {
        playerId: input.playerId,
        targetPlayerId: input.targetPlayerId,
        allied: input.allied,
        simulationLastError: simulationHealth.lastError ?? ""
      });
      return;
    }

    const command: CommandEnvelope = {
      commandId: `social:${input.allied ? "ally" : "break"}:${input.playerId}:${input.targetPlayerId}:${crypto.randomUUID()}`,
      clientSeq: 0,
      issuedAt: Date.now(),
      type: "SYNC_ALLIANCE",
      sessionId: "system-runtime:social",
      playerId: input.playerId,
      payloadJson: JSON.stringify({ targetPlayerId: input.targetPlayerId, allied: input.allied })
    };
    try {
      await withTimeout(simulationClient.submitCommand(command), simulationSubmitTimeoutMs, "gateway sync alliance");
      markSimulationReady();
    } catch (error) {
      markSimulationUnavailable(error);
      recordGatewayEvent("warn", "gateway_social_simulation_sync_failed", {
        commandId: command.commandId,
        playerId: input.playerId,
        targetPlayerId: input.targetPlayerId,
        allied: input.allied,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
  const markSimulationEventStreamConnected = (): void => {
    simulationEventStreamConnected = true;
    refreshCombinedSimulationHealth();
  };
  const markSimulationEventStreamDisconnected = (error: unknown): void => {
    simulationEventStreamConnected = false;
    simulationHealth.connected = false;
    simulationHealth.lastError = error instanceof Error ? error.message : String(error);
  };
  const refreshSimulationHealth = async (): Promise<void> => {
    if (simulationHealthRefreshInFlight) return;
    simulationHealthRefreshInFlight = true;
    // Test doubles and lightweight local adapters may omit ping; treat them as ready.
    try {
      if (typeof simulationClient.ping !== "function") {
        simulationRpcConnected = true;
        refreshCombinedSimulationHealth();
        return;
      }
      await withTimeout(simulationClient.ping(), simulationPingTimeoutMs, "simulation ping");
      markSimulationReady();
    } catch (error) {
      simulationConsecutiveHealthFailures += 1;
      if (
        simulationConsecutiveHealthFailures >= simulationHealthFailureThreshold ||
        typeof simulationHealth.lastReadyAt !== "number"
      ) {
        markSimulationUnavailable(error);
      } else {
        simulationHealth.lastError = error instanceof Error ? error.message : String(error);
      }
      recordGatewayEvent("warn", "simulation_ping_failed", {
        error: error instanceof Error ? error.message : String(error),
        consecutiveFailures: simulationConsecutiveHealthFailures,
        failureThreshold: simulationHealthFailureThreshold
      });
    } finally {
      simulationHealthRefreshInFlight = false;
    }
  };
  const ensureSimulationReadyForAuth = async (): Promise<void> => {
    await refreshSimulationHealth();
    if (simulationHealth.connected) return;
    const deadlineAt = Date.now() + simulationWakeTotalTimeoutMs;

    for (let attempt = 1; attempt <= simulationWakeMaxAttempts && Date.now() < deadlineAt; attempt += 1) {
      if (simulationWakeClient) {
        try {
          await withTimeout(simulationWakeClient.ping(), simulationPingTimeoutMs, "simulation wake ping");
        } catch {
          // Wake ping can fail while the machine is still cold-starting.
        }
      }
      await refreshSimulationHealth();
      if (simulationHealth.connected) return;
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs <= 0) break;
      const backoffMs = Math.min(simulationWakeMaxDelayMs, simulationWakeBaseDelayMs * attempt);
      await sleep(Math.min(backoffMs, remainingMs));
    }

    recordGatewayEvent("warn", "simulation_wake_exhausted", {
      attempts: simulationWakeMaxAttempts,
      wakeTimeoutMs: simulationWakeTotalTimeoutMs,
      simulationConnected: simulationHealth.connected,
      simulationLastError: simulationHealth.lastError ?? ""
    });
  };
  const commandStoreFactoryOptions = {
    ...(options.databaseUrl ? { databaseUrl: options.databaseUrl } : {}),
    ...(options.sqlitePath ? { sqlitePath: options.sqlitePath } : {}),
    ...(typeof options.applySchema === "boolean" ? { applySchema: options.applySchema } : {})
  };
  const commandStore =
    options.commandStore ??
    (await createGatewayCommandStore(commandStoreFactoryOptions));
  const profileStore =
    options.profileStore ??
    (await createGatewayPlayerProfileStore(commandStoreFactoryOptions));
  const authBindingStore =
    options.authBindingStore ??
    (await createGatewayAuthBindingStore(commandStoreFactoryOptions));
  const rallyLinkStore = await createGatewayRallyLinkStore(commandStoreFactoryOptions);
  const emailAlerts = createEmailAlertService({
    authBindingStore,
    ...(options.emailAlerts ?? {}),
    log: {
      error: (payload, message) => app.log.error(payload, message)
    }
  });
  const recordEmailAlertOutcome = (
    kind: "alliance_request" | "truce_request" | "attack",
    recipientPlayerId: string,
    outcome: EmailAlertOutcome
  ): void => {
    if (outcome === "disabled" || outcome === "recipient_missing") return;
    const level = outcome === "send_failed" ? "warn" : "info";
    recordGatewayEvent(level, "gateway_email_alert_result", { kind, recipientPlayerId, outcome });
  };
  const sendGameplayEmailAlert = (
    kind: "alliance_request" | "truce_request" | "attack",
    recipientPlayerId: string,
    send: () => Promise<EmailAlertOutcome>
  ): void => {
    void send()
      .then((outcome) => recordEmailAlertOutcome(kind, recipientPlayerId, outcome))
      .catch((error) => {
        app.log.error(
          { err: error instanceof Error ? error.message : String(error), kind, recipientPlayerId },
          "gameplay email alert failed"
        );
      });
  };

  const authIdentityCacheTtlMs = Math.max(0, Number(process.env.GATEWAY_AUTH_IDENTITY_CACHE_TTL_MS ?? 300_000));
  const profileCacheTtlMs = Math.max(0, Number(process.env.GATEWAY_PROFILE_CACHE_TTL_MS ?? 300_000));
  const authBindingCache = new Map<string, { value: ResolvedGatewayAuthBinding; expiresAt: number }>();
  const profileCache = new Map<string, { value: StoredPlayerProfile | undefined; expiresAt: number }>();
  const cachedReconcileGatewayAuthBinding = async (
    identity: Parameters<typeof reconcileGatewayAuthBinding>[0]
  ): Promise<ResolvedGatewayAuthBinding> => {
    if (!identity.authUid || authIdentityCacheTtlMs <= 0) {
      return reconcileGatewayAuthBinding(identity, authBindingStore);
    }
    const now = Date.now();
    const cached = authBindingCache.get(identity.authUid);
    if (cached && cached.expiresAt > now) return cached.value;
    const fresh = await reconcileGatewayAuthBinding(identity, authBindingStore);
    authBindingCache.set(identity.authUid, { value: fresh, expiresAt: now + authIdentityCacheTtlMs });
    return fresh;
  };
  const cachedProfileGet = async (playerId: string): Promise<StoredPlayerProfile | undefined> => {
    if (profileCacheTtlMs <= 0) return profileStore.get(playerId);
    const now = Date.now();
    const cached = profileCache.get(playerId);
    if (cached && cached.expiresAt > now) return cached.value ? { ...cached.value } : undefined;
    const fresh = await profileStore.get(playerId);
    profileCache.set(playerId, { value: fresh ? { ...fresh } : undefined, expiresAt: now + profileCacheTtlMs });
    return fresh;
  };
  const invalidateProfileCache = (playerId: string): void => {
    profileCache.delete(playerId);
  };
  const resolveHttpBearerIdentity = async (authorizationHeader: string | undefined): Promise<ResolvedGatewayAuthBinding | undefined> => {
    const token = authorizationHeader?.startsWith("Bearer ") ? authorizationHeader.slice("Bearer ".length).trim() : "";
    if (!token) return undefined;
    const resolved = resolveGatewayAuthIdentity(token, {
      allowDirectPlayerIdToken: Boolean(options.defaultHumanPlayerId),
      ...(options.defaultHumanPlayerId ? { defaultHumanPlayerId: options.defaultHumanPlayerId } : {}),
      ...(legacySnapshotBootstrap ? { authIdentities: legacySnapshotBootstrap.authIdentities } : {})
    });
    if (!resolved) return undefined;
    return cachedReconcileGatewayAuthBinding(resolved);
  };
  const activeRallyAnchorForOwner = async (ownerPlayerId: string): Promise<RallyAnchor | undefined> => {
    const snapshot = await simulationClient.subscribePlayer(
      ownerPlayerId,
      JSON.stringify({ mode: "bootstrap-only", emitBootstrapEvent: false, trigger: "gateway_rally_auth_anchor" })
    );
    return rallyAnchorFromTiles(ownerPlayerId, snapshot.tiles);
  };
  const rallySeasonIsActive = async (): Promise<boolean> => {
    try {
      return (await simulationClient.getCurrentSeasonSummary()).status === "active";
    } catch {
      return false;
    }
  };

  const simulationRpcRetryAttempts = Math.max(
    1,
    options.simulationRpcRetryAttempts ?? Number(process.env.GATEWAY_SIMULATION_RPC_RETRY_ATTEMPTS ?? 3)
  );
  const simulationRpcRetryBaseDelayMs = Math.max(50, Number(process.env.GATEWAY_SIMULATION_RPC_RETRY_BASE_DELAY_MS ?? 250));
  const simulationRpcRetryMaxDelayMs = Math.max(simulationRpcRetryBaseDelayMs, Number(process.env.GATEWAY_SIMULATION_RPC_RETRY_MAX_DELAY_MS ?? 2_000));
  const retrySimulationRpc = async <T>(
    label: string,
    operation: () => Promise<T>,
    timeoutMs: number,
    onAttemptFailed?: (error: unknown, attempt: number) => void
  ): Promise<T> => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= simulationRpcRetryAttempts; attempt += 1) {
      try {
        return await withTimeout(operation(), timeoutMs, label);
      } catch (error) {
        lastError = error;
        if (attempt >= simulationRpcRetryAttempts) break;
        onAttemptFailed?.(error, attempt);
        const backoffMs = Math.min(simulationRpcRetryMaxDelayMs, simulationRpcRetryBaseDelayMs * 2 ** (attempt - 1));
        await sleep(backoffMs);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  };

  const liveSubscriptionNamespace = await (async (): Promise<string> => {
    const namespaceClient = simulationClient as typeof simulationClient & { getSubscriptionNamespace?: () => Promise<string> };
    if (typeof namespaceClient.getSubscriptionNamespace !== "function") {
      throw new Error("simulation client GetSubscriptionNamespace RPC is unavailable");
    }
    return retryStartup("gateway getSubscriptionNamespace", () => namespaceClient.getSubscriptionNamespace!(), {
      onAttemptFailed: (error, attempt, delayMs) => {
        console.warn(
          `[gateway] getSubscriptionNamespace attempt ${attempt} failed; retrying in ${delayMs}ms:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    });
  })();
  const playerSubscriptions = createPlayerSubscriptions<import("ws").WebSocket, Awaited<ReturnType<typeof simulationClient.subscribePlayer>>>({
    subscribePlayer: (playerId, subscriptionKey) =>
      simulationClient.subscribePlayer(
        playerId,
        JSON.stringify({ emitBootstrapEvent: false, trigger: "gateway_live_subscribe", ...(subscriptionKey ? { subscriptionKey } : {}) })
      ),
    unsubscribePlayer: (playerId, subscriptionKey) => simulationClient.unsubscribePlayer(playerId, subscriptionKey),
    subscriptionNamespace: liveSubscriptionNamespace
  });
  const mergeTileDetailIntoSnapshot = (
    snapshot: PlayerSubscriptionSnapshot,
    freshTiles: PlayerSubscriptionSnapshot["tiles"],
    upkeepLastTick: NonNullable<PlayerSubscriptionSnapshot["player"]>["upkeepLastTick"] | undefined
  ): PlayerSubscriptionSnapshot => {
    if (freshTiles.length === 0 && !upkeepLastTick) return snapshot;
    const tileIndex = new Map<string, number>();
    snapshot.tiles.forEach((tile, idx) => tileIndex.set(`${tile.x},${tile.y}`, idx));
    const nextTiles = [...snapshot.tiles];
    let appended = false;
    for (const fresh of freshTiles) {
      const key = `${fresh.x},${fresh.y}`;
      const idx = tileIndex.get(key);
      if (typeof idx === "number") {
        nextTiles[idx] = { ...nextTiles[idx], ...fresh } as typeof nextTiles[number];
      } else {
        nextTiles.push(fresh);
        tileIndex.set(key, nextTiles.length - 1);
        appended = true;
      }
    }
    if (appended) nextTiles.sort((left, right) => (left.x - right.x) || (left.y - right.y));
    const nextPlayer =
      upkeepLastTick && snapshot.player
        ? { ...snapshot.player, upkeepLastTick }
        : snapshot.player;
    return {
      ...snapshot,
      ...(nextPlayer ? { player: nextPlayer } : {}),
      tiles: nextTiles
    };
  };
  const tileDetailFetchByKey = new Map<string, Promise<PlayerSubscriptionSnapshot | undefined>>();
  const fetchTileDetailFromSim = async (
    playerId: string,
    x: number,
    y: number,
    fullVisibility: boolean
  ): Promise<PlayerSubscriptionSnapshot | undefined> => {
    const fetchKey = `${playerId}:${x}:${y}:${fullVisibility ? "full" : "visible"}`;
    const existing = tileDetailFetchByKey.get(fetchKey);
    if (existing) return existing;
    const fetchRpc = simulationClient.fetchTileDetail;
    if (typeof fetchRpc !== "function") {
      return undefined;
    }
    const fetchPromise = retrySimulationRpc(
      "gateway tile detail fetch",
      () => fetchRpc(playerId, x, y, fullVisibility),
      simulationSubscribeTimeoutMs,
      (error, attempt) => {
        recordGatewayEvent("warn", "gateway_tile_detail_fetch_retry", {
          playerId,
          x,
          y,
          fullVisibility,
          attempt,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    )
      .then((result) => {
        let updatedSnapshot: PlayerSubscriptionSnapshot | undefined;
        playerSubscriptions.updateSnapshot(playerId, (snapshot) => {
          const merged = mergeTileDetailIntoSnapshot(snapshot, result.tiles, result.upkeepLastTick);
          updatedSnapshot = merged;
          return merged;
        });
        syncGatewaySnapshotMetricsFromCache(playerId);
        recordGatewayEvent("info", "gateway_tile_detail_fetch_ready", {
          playerId,
          x,
          y,
          fullVisibility,
          tileCount: result.tiles.length
        });
        return updatedSnapshot;
      })
      .finally(() => {
        tileDetailFetchByKey.delete(fetchKey);
      });
    tileDetailFetchByKey.set(fetchKey, fetchPromise);
    return fetchPromise;
  };
  const profileOverrides = createPlayerProfileOverrides();
  const seedPlayers = createSeedPlayers(simulationSeedProfile);
  const seedWorld = createSeedWorld(simulationSeedProfile);
  const seasonalAiPlayerIds = simulationSeedProfile === "default" ? seasonalDefaultAiPlayerIds() : [];
  const seededAiPlayerIds = new Set([
    ...[...seedPlayers.values()]
      .filter((player) => player.isAi)
      .map((player) => player.id),
    ...seasonalAiPlayerIds
  ]);
  const initialSocialPlayerNamesById = new Map<string, string>();
  if (legacySnapshotBootstrap) {
    for (const profile of legacySnapshotBootstrap.playerProfiles.values()) {
      initialSocialPlayerNamesById.set(profile.id, profile.name ?? profile.id);
    }
  } else {
    for (const player of seedPlayers.values()) {
      initialSocialPlayerNamesById.set(player.id, initialSocialNameForSeedPlayer(player.id, player.name));
    }
    for (const playerId of seasonalAiPlayerIds) {
      initialSocialPlayerNamesById.set(playerId, seasonalPlayerNameForId(playerId));
    }
  }
  const initialSocialPlayers = [...initialSocialPlayerNamesById].map(([id, name]) => ({ id, name }));
  const socialState = createSocialState({
    ...(options.now ? { now: options.now } : {}),
    players: initialSocialPlayers
  });
  const fallbackTileDeltasByCommandId = new Map<
    string,
    Array<{ x: number; y: number; ownerId?: string; ownershipState?: string }>
  >();
  // Tracks commandIds whose per-player TILE_DELTA_BATCH side effects (persistence,
  // global-status broadcast scheduling) have already been triggered, so the N
  // per-player events emitted by the simulation for one command only fire those
  // side effects once. Bounded by periodic cleanup since the simulation never
  // resurrects a commandId.
  const persistedTileDeltaCommandIds = new Set<string>();
  const persistedTileDeltaCommandIdsMaxEntries = 10_000;
  const fullVisibilityReplacementPayloadCache = createFullVisibilityReplacementPayloadCache({
    jsonSafeTileDeltaBatch,
    jsonByteSize
  });
  const sessionsBySocket = new WeakMap<import("ws").WebSocket, SocketSession>();
  const gatewaySnapshotByPlayerId = new Map<string, PlayerSubscriptionSnapshot>();
  type GatewaySnapshotCacheSummary = {
    entryCount: number;
    totalBytes: number;
    topEntries: PlayerSubscriptionSnapshotCacheSummary["topEntries"];
  };
  let lastGatewaySnapshotCacheSummary: GatewaySnapshotCacheSummary = {
    entryCount: 0,
    totalBytes: 0,
    topEntries: []
  };
  const refreshGatewaySnapshotCacheMetrics = (): GatewaySnapshotCacheSummary => {
    const cacheSummary = summarizePlayerSubscriptionSnapshotCache(gatewaySnapshotByPlayerId.entries());
    gatewayMetrics.setGatewaySnapshotCache({ entries: cacheSummary.entryCount, bytes: cacheSummary.totalSnapshotJsonBytes });
    lastGatewaySnapshotCacheSummary = {
      entryCount: cacheSummary.entryCount,
      totalBytes: cacheSummary.totalSnapshotJsonBytes,
      topEntries: cacheSummary.topEntries
    };
    return lastGatewaySnapshotCacheSummary;
  };
  const syncGatewaySnapshotMetricsFromCache = (playerId: string): void => {
    // Only mutate the per-player map here (cheap). The expensive
    // summarize-everything pass runs once per second on the metrics tick
    // (see gatewayMetricsTimer below) — keeping it on per-event paths
    // (TILE_DELTA_BATCH, player-message fan-out) caused gateway OOMs by
    // re-JSON.stringify-ing every cached snapshot on every event.
    const snapshot = playerSubscriptions.snapshotForPlayer(playerId);
    if (!snapshot) {
      gatewaySnapshotByPlayerId.delete(playerId);
      return;
    }
    gatewaySnapshotByPlayerId.set(playerId, snapshot);
  };
  const recordGatewaySnapshotDiagnostics = (
    playerId: string,
    snapshot: PlayerSubscriptionSnapshot,
    options: { trigger: string; fullVisibility: boolean; socketCount: number; payloadJsonBytes: number }
  ) => {
    const measure = measurePlayerSubscriptionSnapshot(snapshot);
    gatewaySnapshotByPlayerId.set(playerId, snapshot);
    // Read the latest summary (refreshed once per second on the metrics tick)
    // instead of recomputing here. With N simultaneous fog refreshes (e.g. a
    // satellite reveal wave) inline-summarizing would be O(N²) work in a
    // burst. Up to 1s staleness is fine for diagnostics.
    const cacheSummary = lastGatewaySnapshotCacheSummary;
    const memory = process.memoryUsage();
    const rssMb = memory.rss / (1024 * 1024);
    const heapUsedMb = memory.heapUsed / (1024 * 1024);
    gatewayMetrics.observeGatewaySnapshotBuild({
      trigger: options.trigger,
      playerId,
      fullVisibility: options.fullVisibility ? 1 : 0,
      tileCount: measure.tileCount,
      snapshotJsonBytes: measure.snapshotJsonBytes,
      tilesJsonBytes: measure.tilesJsonBytes,
      worldStatusJsonBytes: measure.worldStatusJsonBytes,
      cacheEntries: cacheSummary.entryCount,
      cacheBytes: cacheSummary.totalBytes,
      socketCount: options.socketCount,
      rssMb,
      heapUsedMb
    });
    recordGatewayEvent("info", "gateway_snapshot_diagnostics", {
      trigger: options.trigger,
      playerId,
      fullVisibility: options.fullVisibility,
      tileCount: measure.tileCount,
      snapshotJsonBytes: measure.snapshotJsonBytes,
      tilesJsonBytes: measure.tilesJsonBytes,
      worldStatusJsonBytes: measure.worldStatusJsonBytes,
      payloadJsonBytes: options.payloadJsonBytes,
      cacheEntries: cacheSummary.entryCount,
      cacheBytes: cacheSummary.totalBytes,
      cacheTopPlayers: cacheSummary.topEntries,
      socketCount: options.socketCount,
      rssMb,
      heapUsedMb
    });
  };
  const recordCommandSocketDelivery = (
    event: "gateway_command_payload_sent" | "gateway_command_payload_queued",
    socket: import("ws").WebSocket,
    payload: unknown
  ): void => {
    const commandId = readPayloadCommandId(payload);
    if (!commandId) return;
    const payloadType = readPayloadType(payload);
    const session = sessionsBySocket.get(socket);
    const target = readPayloadTarget(payload);
    recordGatewayEvent("info", event, {
      commandId,
      ...(payloadType ? { payloadType } : {}),
      ...(session?.playerId ? { playerId: session.playerId } : {}),
      ...(session ? { channel: session.channel, initSent: session.initSent } : {}),
      ...(target ? { targetX: target.x, targetY: target.y } : {})
    });
  };
  const ignoredLegacyMessageTypes = new Set<string>(
    supportedClientMessageTypes.filter(
      (messageType) =>
        messageType !== "ATTACK" &&
        messageType !== "EXPAND" &&
        messageType !== "SETTLE" &&
        messageType !== "BUILD_FORT" &&
        messageType !== "BUILD_OBSERVATORY" &&
        messageType !== "BUILD_SIEGE_OUTPOST" &&
        messageType !== "BUILD_ECONOMIC_STRUCTURE" &&
        messageType !== "CANCEL_FORT_BUILD" &&
        messageType !== "CANCEL_STRUCTURE_BUILD" &&
        messageType !== "REMOVE_STRUCTURE" &&
        messageType !== "CANCEL_SIEGE_OUTPOST_BUILD" &&
        messageType !== "CANCEL_CAPTURE" &&
        messageType !== "UNCAPTURE_TILE" &&
        messageType !== "COLLECT_TILE" &&
        messageType !== "COLLECT_VISIBLE" &&
        messageType !== "CHOOSE_TECH" &&
        messageType !== "CHOOSE_DOMAIN" &&
        messageType !== "OVERLOAD_SYNTHESIZER" &&
        messageType !== "SET_CONVERTER_STRUCTURE_ENABLED" &&
        messageType !== "REVEAL_EMPIRE" &&
        messageType !== "REVEAL_EMPIRE_STATS" &&
        messageType !== "CAST_AETHER_BRIDGE" &&
        messageType !== "CAST_AETHER_WALL" &&
        messageType !== "SIPHON_TILE" &&
        messageType !== "PURGE_SIPHON" &&
        messageType !== "CREATE_MOUNTAIN" &&
        messageType !== "REMOVE_MOUNTAIN" &&
        messageType !== "AIRPORT_BOMBARD" &&
        messageType !== "COLLECT_SHARD"
    )
  );

  registerGatewayHttpRoutes(app, {
    startupStartedAt,
    simulationAddress: options.simulationAddress ?? "127.0.0.1:50051",
    simulationSeedProfile,
    health: () => ({
      ok: simulationHealth.connected,
      simulation: {
        connected: simulationHealth.connected,
        ...(typeof simulationHealth.lastReadyAt === "number" ? { lastReadyAt: simulationHealth.lastReadyAt } : {}),
        ...(simulationHealth.lastError ? { lastError: simulationHealth.lastError } : {})
      }
    }),
    ...(options.snapshotDir ? { snapshotDir: options.snapshotDir } : {}),
    ...(legacySnapshotBootstrap ? { runtimeIdentity: legacySnapshotBootstrap.runtimeIdentity } : {}),
    supportedMessageTypes: [...supportedClientMessageTypes],
    recentEvents: () => [...recentGatewayEvents],
    attackDebug: buildAttackDebug,
    attackTraces: buildAttackTraces,
    metrics: () => gatewayMetrics.renderPrometheus(),
    getCurrentSeasonSummary: async () =>
      hydrateCurrentSeasonSummaryDisplayNames(await simulationClient.getCurrentSeasonSummary(), profileStore),
    getCurrentSeasonStatus: () => simulationClient.getCurrentSeasonSummary().then((s) => s.status),
    listSeasonArchives: async () =>
      hydrateSeasonArchiveDisplayNames(await simulationClient.listSeasonArchives(), profileStore),
    startNextSeason: (force?: boolean) => simulationClient.startNextSeason(force),
    ...(options.playOrigin ? { playOrigin: options.playOrigin } : {}),
    authenticateBearer: resolveHttpBearerIdentity,
    rallyLinkStore,
    preparePlayer: (playerId: string) => simulationClient.preparePlayer(playerId),
    subscribePlayer: (playerId: string) =>
      simulationClient.subscribePlayer(
        playerId,
        JSON.stringify({ mode: "bootstrap-only", emitBootstrapEvent: false, trigger: "gateway_rally_link" })
      ),
    ...(options.adminApiToken ? { adminApiToken: options.adminApiToken } : {})
  });

  const queueOrSendSessionPayload = (socket: import("ws").WebSocket, payload: unknown): void => {
    const session = sessionsBySocket.get(socket);
    if (!session || session.initSent) {
      sendJson(socket, payload);
      recordCommandSocketDelivery("gateway_command_payload_sent", socket, payload);
      return;
    }
    session.pendingPayloads.push(payload);
    recordCommandSocketDelivery("gateway_command_payload_queued", socket, payload);
  };

  const fanoutPlayerPayloads = (payloadsByPlayerId: Map<string, unknown[]>): void => {
    for (const [playerId, payloads] of payloadsByPlayerId) {
      const sockets = [...playerSubscriptions.socketsForPlayer(playerId)];
      if (sockets.length === 0) continue;
      for (const payload of payloads) {
        const broadcast = sockets.length > 1 ? preSerializeBroadcast(payload) : payload;
        for (const targetSocket of sockets) {
          queueOrSendSessionPayload(targetSocket, broadcast);
        }
      }
    }
  };

  const maybeAutoRespondToSeededAiTruce = async (request: SocialTruceRequest | undefined): Promise<void> => {
    if (!request || !seededAiPlayerIds.has(request.toPlayerId)) return;
    const decisionSnapshot = playerSubscriptions.snapshotForPlayer(request.fromPlayerId);
    const targetDecisionSnapshot = playerSubscriptions.snapshotForPlayer(request.toPlayerId);
    const economyStrained = seededAiEconomyStrained(targetDecisionSnapshot?.player ?? seedPlayers.get(request.toPlayerId));
    const seedDecisionSnapshot = playerSubscriptionSnapshotFromSeedWorld(seedWorld, request.fromPlayerId);
    const liveSnapshotHasTargetTiles = Boolean(decisionSnapshot?.tiles.some((tile) => tile.ownerId === request.toPlayerId));
    const liveDecision = decisionSnapshot ? seededAiTruceDecisionFromSnapshot(decisionSnapshot, request, economyStrained) : "reject";
    const seedDecision = seededAiTruceDecisionFromSnapshot(seedDecisionSnapshot, request, economyStrained);
    const decision = liveSnapshotHasTargetTiles ? liveDecision : seedDecision;
    if (!decisionSnapshot) {
      recordGatewayEvent("warn", "gateway_ai_truce_snapshot_failed", {
        aiPlayerId: request.toPlayerId,
        fromPlayerId: request.fromPlayerId,
        error: "requester snapshot unavailable"
      });
    }

    const aiName = request.toName ?? request.toPlayerId;
    const response =
      decision === "accept"
        ? socialState.acceptTruce(request.toPlayerId, request.id)
        : socialState.rejectTruce(request.toPlayerId, request.id, {
            [request.fromPlayerId]: `${aiName} declined your truce offer.`,
            [request.toPlayerId]: `You declined ${request.fromName ?? request.fromPlayerId}'s truce offer.`
          });
    if (!response.ok) {
      recordGatewayEvent("warn", "gateway_ai_truce_response_failed", {
        aiPlayerId: request.toPlayerId,
        fromPlayerId: request.fromPlayerId,
        decision,
        code: response.code,
        message: response.message
      });
      fanoutPlayerPayloads(socialState.syncPlayers([request.fromPlayerId, request.toPlayerId]).payloadsByPlayerId);
      return;
    }
    recordGatewayEvent("info", "gateway_ai_truce_response", {
      aiPlayerId: request.toPlayerId,
      fromPlayerId: request.fromPlayerId,
      decision,
      durationHours: request.durationHours
    });
    fanoutPlayerPayloads(response.payloadsByPlayerId);
  };
  const refreshPlayerFogSnapshot = async (
    playerId: string,
    fogDisabled: boolean,
    options?: { includeFogUpdate?: boolean; reason?: string; commandId?: string }
  ): Promise<void> => {
    recordGatewayEvent("info", "gateway_fog_refresh_started", {
      playerId,
      fogDisabled,
      includeFogUpdate: options?.includeFogUpdate === true,
      ...(options?.reason ? { reason: options.reason } : {}),
      ...(options?.commandId ? { commandId: options.commandId } : {})
    });
    try {
      const snapshot = await withTimeout(
        simulationClient.subscribePlayer(
          playerId,
          JSON.stringify({
            fullVisibility: fogDisabled,
            emitBootstrapEvent: false,
            trigger: fogDisabled ? "gateway_fog_refresh" : "gateway_fog_restore"
          })
        ),
        simulationSubscribeTimeoutMs,
        fogDisabled ? "gateway fog resubscribe" : "gateway fog restore resubscribe"
      );
      playerSubscriptions.seedSnapshot(playerId, snapshot);
      const { payload: replacementSnapshot, payloadJsonBytes: replacementSnapshotJsonBytes } =
        fullVisibilityReplacementPayloadCache.get(snapshot);
      const targetSockets = [...playerSubscriptions.socketsForPlayer(playerId)];
      recordGatewaySnapshotDiagnostics(playerId, snapshot, {
        trigger: fogDisabled ? "gateway_fog_refresh" : "gateway_fog_restore",
        fullVisibility: fogDisabled,
        socketCount: targetSockets.length,
        payloadJsonBytes: replacementSnapshotJsonBytes
      });
      recordGatewayEvent("info", "gateway_fog_refresh_snapshot_ready", {
        playerId,
        fogDisabled,
        tileCount: snapshot.tiles.length,
        socketCount: targetSockets.length,
        ...(options?.reason ? { reason: options.reason } : {}),
        ...(options?.commandId ? { commandId: options.commandId } : {})
      });
      const replacementBroadcast =
        targetSockets.length > 1 ? preSerializeBroadcast(replacementSnapshot) : replacementSnapshot;
      for (const targetSocket of targetSockets) {
        const targetSession = sessionsBySocket.get(targetSocket);
        if (!targetSession) continue;
        targetSession.fogDisabled = fogDisabled;
        if (options?.includeFogUpdate === true) {
          queueOrSendSessionPayload(targetSocket, { type: "FOG_UPDATE", fogDisabled });
        }
        queueOrSendSessionPayload(targetSocket, replacementBroadcast);
      }
      recordGatewayEvent("info", "gateway_fog_refresh_sent", {
        playerId,
        fogDisabled,
        socketCount: targetSockets.length,
        includeFogUpdate: options?.includeFogUpdate === true,
        ...(options?.reason ? { reason: options.reason } : {}),
        ...(options?.commandId ? { commandId: options.commandId } : {})
      });
    } catch (error) {
      recordGatewayEvent("error", "gateway_fog_refresh_failed", {
        playerId,
        fogDisabled,
        includeFogUpdate: options?.includeFogUpdate === true,
        ...(options?.reason ? { reason: options.reason } : {}),
        ...(options?.commandId ? { commandId: options.commandId } : {}),
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  };

  let simulationEventChain = Promise.resolve();
  let simulationEventChainPending = 0;
  const processSimulationEvent = async (event: SimulationClientEvent): Promise<void> => {
      markSimulationReady();
      if (!event.commandId.startsWith("bootstrap:")) {
        recordGatewayEvent("info", "gateway_simulation_event_received", {
          commandId: event.commandId,
          playerId: event.playerId,
          eventType: event.eventType,
          ...("actionType" in event && typeof event.actionType === "string" ? { actionType: event.actionType } : {}),
          ...("targetX" in event && typeof event.targetX === "number" ? { targetX: event.targetX } : {}),
          ...("targetY" in event && typeof event.targetY === "number" ? { targetY: event.targetY } : {}),
          ...("attackerWon" in event && typeof event.attackerWon === "boolean" ? { attackerWon: event.attackerWon } : {}),
          ...("tileDeltas" in event && Array.isArray(event.tileDeltas) ? { tileDeltaCount: event.tileDeltas.length } : {})
        });
      }
      const submittedAt = pendingInputToStateByCommandId.get(event.commandId);
      if (typeof submittedAt === "number") {
        gatewayMetrics.observeGatewayInputToStateUpdateLatencyMs(Date.now() - submittedAt);
        pendingInputToStateByCommandId.delete(event.commandId);
      }
      if (event.eventType === "PLAYER_MESSAGE" && event.messageType === "ATTACK_ALERT") {
        const attackAlert = readAttackAlert(event.payload);
        if (attackAlert) {
          sendGameplayEmailAlert("attack", event.playerId, () =>
            emailAlerts.sendAttackAlert({
              defenderPlayerId: event.playerId,
              attackerName: attackAlert.attackerName,
              x: attackAlert.x,
              y: attackAlert.y
            })
          );
        }
      }
      const sockets = playerSubscriptions.socketsForPlayer(event.playerId);
      if (sockets.size === 0) {
        if (!event.commandId.startsWith("bootstrap:")) {
          recordGatewayEvent("warn", "gateway_simulation_event_no_subscribers", {
            commandId: event.commandId,
            playerId: event.playerId,
            eventType: event.eventType
          });
        }
        return;
      }
      if (event.eventType === "PLAYER_MESSAGE") {
        try {
          await withTimeout(
            hydrateVisibleLiveProfileOverrides(event.payload, profileStore, profileOverrides),
            liveProfileHydrationTimeoutMs,
            "hydrate live player profile overrides"
          );
        } catch (error) {
          app.log.warn(
            { err: error, commandId: event.commandId, playerId: event.playerId, messageType: event.messageType },
            "failed to hydrate live player profile overrides; forwarding original player message"
          );
        }
        const recoveredPayload = recoverLivePlayerMessage(event.payload, profileOverrides);
        for (const targetSocket of sockets) {
          const session = sessionsBySocket.get(targetSocket);
          if (!session?.playerId) continue;
          playerSubscriptions.updateSnapshot(session.playerId, (snapshot) => applyPlayerMessageToSnapshot(snapshot, recoveredPayload));
          syncGatewaySnapshotMetricsFromCache(session.playerId);
        }
        event.payload = recoveredPayload;
      }
      if (event.eventType === "TECH_UPDATE" || event.eventType === "DOMAIN_UPDATE") {
        playerSubscriptions.updateSnapshot(event.playerId, (snapshot) =>
          applyPlayerMessageToSnapshot(snapshot, { type: event.eventType, ...event.payload })
        );
        syncGatewaySnapshotMetricsFromCache(event.playerId);
      }
      // TILE_DELTA_BATCH: the simulation now emits one event per subscribed
      // player with their visibility-filtered tileDeltas, so this branch runs
      // per-player. Persistence is keyed off commandId and must fire exactly
      // once per command — dedup across the N per-player events that share a
      // commandId.
      if (event.eventType === "TILE_DELTA_BATCH") {
        const tileDeltas = event.tileDeltas.length > 0 ? event.tileDeltas : (fallbackTileDeltasByCommandId.get(event.commandId) ?? []);
        if (!persistedTileDeltaCommandIds.has(event.commandId)) {
          persistedTileDeltaCommandIds.add(event.commandId);
          if (persistedTileDeltaCommandIds.size > persistedTileDeltaCommandIdsMaxEntries) {
            const entriesToDrop = persistedTileDeltaCommandIds.size - Math.floor(persistedTileDeltaCommandIdsMaxEntries / 2);
            let dropped = 0;
            for (const id of persistedTileDeltaCommandIds) {
              if (dropped >= entriesToDrop) break;
              persistedTileDeltaCommandIds.delete(id);
              dropped += 1;
            }
          }
          fallbackTileDeltasByCommandId.delete(event.commandId);
          void commandStore.get(event.commandId).then((command) => {
            if (!command) return;
            if (command.type === "ATTACK" || command.type === "EXPAND") return;
            void commandStore.markResolved(event.commandId, Date.now()).catch((error) =>
              app.log.error({ err: error, commandId: event.commandId }, "failed to persist resolved non-frontier command")
            );
          });
        }
        const playerId = event.playerId;
        // sockets === playerSubscriptions.socketsForPlayer(playerId) (assigned at line 899),
        // so every entry already belongs to this player; no need to re-filter.
        const playerSockets = sockets;
        const hasFogDisabledSession = [...playerSubscriptions.socketsForPlayer(playerId)].some(
          (playerSocket) => sessionsBySocket.get(playerSocket)?.fogDisabled === true
        );
        if (hasFogDisabledSession) {
          recordGatewayEvent("info", "gateway_fog_refresh_from_live_delta", {
            playerId,
            commandId: event.commandId,
            tileDeltaCount: tileDeltas.length,
            socketCount: playerSockets.size
          });
          await refreshPlayerFogSnapshot(playerId, true, { reason: "live-delta", commandId: event.commandId });
          return;
        }
        playerSubscriptions.updateSnapshot(playerId, (snapshot) => applyTileDeltasToSnapshot(snapshot, tileDeltas));
        syncGatewaySnapshotMetricsFromCache(playerId);
        const tileDeltaBroadcast = preSerializeBroadcast({
          type: "TILE_DELTA_BATCH",
          commandId: event.commandId,
          tiles: jsonSafeTileDeltaBatch(tileDeltas)
        });
        for (const targetSocket of selectSocketsForTileDeltaBatchByPlayer(playerSockets, (candidate) => sessionsBySocket.get(candidate))) {
          queueOrSendSessionPayload(targetSocket, tileDeltaBroadcast);
        }
        return;
      }
      for (const socket of selectSocketsForEvent(sockets, event.eventType, (candidate) => sessionsBySocket.get(candidate))) {
        if (event.eventType === "COMMAND_ACCEPTED") {
          void commandStore
            .markAccepted(event.commandId, Date.now())
            .catch((error) => app.log.error({ err: error, commandId: event.commandId }, "failed to persist accepted command"));
          queueOrSendSessionPayload(socket, {
            type: "ACTION_ACCEPTED",
            commandId: event.commandId,
            actionType: event.actionType,
            origin: { x: event.originX, y: event.originY },
            target: { x: event.targetX, y: event.targetY },
            resolvesAt: event.resolvesAt
          });
          if (event.actionType !== "EXPAND") {
            queueOrSendSessionPayload(socket, {
              type: "COMBAT_START",
              commandId: event.commandId,
              origin: { x: event.originX, y: event.originY },
              target: { x: event.targetX, y: event.targetY },
              resolvesAt: event.resolvesAt,
              ...(event.combatResult ? { result: event.combatResult } : {})
            });
          }
          continue;
        }
        if (event.eventType === "COMMAND_REJECTED") {
          // Per-player event: only the submitting player's sockets should see
          // the ERROR. selectSocketsForEvent returns all open sockets across
          // all players; without this filter, every connected human receives
          // a console.error for every AI command rejection (and AI workers
          // reject frequently — stale targets, intent latches, cooldowns).
          if (sessionsBySocket.get(socket)?.playerId !== event.playerId) continue;
          void commandStore
            .markRejected(event.commandId, Date.now(), event.code, event.message)
            .catch((error) => app.log.error({ err: error, commandId: event.commandId }, "failed to persist rejected command"));
          queueOrSendSessionPayload(socket, {
            type: "ERROR",
            commandId: event.commandId,
            code: event.code,
            message: event.message
          });
          continue;
        }
        if (event.eventType === "COMBAT_CANCELLED") {
          void commandStore
            .markResolved(event.commandId, Date.now())
            .catch((error) => app.log.error({ err: error, commandId: event.commandId }, "failed to persist cancelled command"));
          for (const cancelledCommandId of event.cancelledCommandIds ?? []) {
            if (cancelledCommandId === event.commandId) continue;
            void commandStore
              .markResolved(cancelledCommandId, Date.now())
              .catch((error) =>
                app.log.error({ err: error, commandId: cancelledCommandId }, "failed to persist cancelled frontier command")
              );
          }
          queueOrSendSessionPayload(socket, {
            type: "COMBAT_CANCELLED",
            commandId: event.commandId,
            count: event.count
          });
          continue;
        }
        if (event.eventType === "COLLECT_RESULT") {
          void commandStore
            .markResolved(event.commandId, Date.now())
            .catch((error) => app.log.error({ err: error, commandId: event.commandId }, "failed to persist collect result"));
          queueOrSendSessionPayload(socket, {
            type: "COLLECT_RESULT",
            mode: event.mode,
            ...(typeof event.x === "number" ? { x: event.x } : {}),
            ...(typeof event.y === "number" ? { y: event.y } : {}),
            tiles: event.tiles,
            gold: event.gold,
            strategic: event.strategic
          });
          continue;
        }
        if (event.eventType === "TECH_UPDATE") {
          void commandStore
            .markResolved(event.commandId, Date.now())
            .catch((error) => app.log.error({ err: error, commandId: event.commandId }, "failed to persist tech update"));
          queueOrSendSessionPayload(socket, {
            type: "TECH_UPDATE",
            ...event.payload
          });
          continue;
        }
        if (event.eventType === "DOMAIN_UPDATE") {
          void commandStore
            .markResolved(event.commandId, Date.now())
            .catch((error) => app.log.error({ err: error, commandId: event.commandId }, "failed to persist domain update"));
          queueOrSendSessionPayload(socket, {
            type: "DOMAIN_UPDATE",
            ...event.payload
          });
          continue;
        }
        if (event.eventType === "PLAYER_MESSAGE") {
          if (event.messageType === "SOCIAL_STATE_SYNCED") {
            continue;
          }
          // ATTACK_ALERT is an acceptance-time side-event addressed to the
          // defender; it shares the attacker's commandId so it lives in the
          // same replay bucket, but it must NOT close the attacker's
          // recovery slot — only the real COMBAT_RESOLVED should do that.
          if (event.messageType !== "ATTACK_ALERT") {
            void commandStore
              .markResolved(event.commandId, Date.now())
              .catch((error) => app.log.error({ err: error, commandId: event.commandId }, "failed to persist player message"));
          }
          queueOrSendSessionPayload(socket, event.payload);
          continue;
        }
        if (event.attackerWon) {
          fallbackTileDeltasByCommandId.set(event.commandId, [
            {
              x: event.targetX,
              y: event.targetY,
              ownerId: event.playerId,
              ownershipState: "FRONTIER"
            }
          ]);
        } else {
          fallbackTileDeltasByCommandId.delete(event.commandId);
        }
        void commandStore
          .markResolved(event.commandId, Date.now())
          .catch((error) => app.log.error({ err: error, commandId: event.commandId }, "failed to persist resolved command"));
        if (event.actionType === "EXPAND" && event.attackerWon) {
          queueOrSendSessionPayload(socket, {
            type: "FRONTIER_RESULT",
            commandId: event.commandId,
            actionType: event.actionType,
            origin: { x: event.originX, y: event.originY },
            target: { x: event.targetX, y: event.targetY }
          });
          continue;
        }
      }
    };
  const eventStreamReconnectBaseMs = Math.max(250, Number(process.env.GATEWAY_SIMULATION_EVENT_STREAM_RECONNECT_BASE_MS ?? 1_000));
  const eventStreamReconnectMaxMs = Math.max(eventStreamReconnectBaseMs, Number(process.env.GATEWAY_SIMULATION_EVENT_STREAM_RECONNECT_MAX_MS ?? 30_000));
  let eventStreamReconnectAttempt = 0;
  let eventStreamReconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let eventStreamCancel: (() => void) | undefined;
  let eventStreamShuttingDown = false;
  const connectEventStream = (): void => {
    if (eventStreamShuttingDown) return;
    eventStreamCancel = simulationClient.streamEvents(
      (event: SimulationClientEvent) => {
        const enqueuedAt = slowGatewaySimEventWarnMs > 0 ? Date.now() : 0;
        const chainDepthAtEnqueue = simulationEventChainPending;
        simulationEventChainPending += 1;
        simulationEventChain = simulationEventChain
          .then(async () => {
            if (slowGatewaySimEventWarnMs <= 0) {
              await processSimulationEvent(event);
              return;
            }
            const startedAt = Date.now();
            const waitMs = startedAt - enqueuedAt;
            try {
              await processSimulationEvent(event);
            } finally {
              const runMs = Date.now() - startedAt;
              if (runMs >= slowGatewaySimEventWarnMs || waitMs >= slowGatewaySimEventWarnMs) {
                recordGatewayEvent("warn", "gateway_sim_event_handler_slow", {
                  commandId: event.commandId,
                  playerId: event.playerId,
                  eventType: event.eventType,
                  runMs,
                  waitMs,
                  chainDepthAtEnqueue,
                  ...("tileDeltas" in event && Array.isArray(event.tileDeltas) ? { tileDeltaCount: event.tileDeltas.length } : {})
                });
              }
            }
          })
          .catch((error) => {
            app.log.error({ err: error, commandId: event.commandId, playerId: event.playerId, eventType: event.eventType }, "simulation event processing failed");
          })
          .finally(() => {
            simulationEventChainPending -= 1;
          });
      },
      {
        onConnect() {
          eventStreamReconnectAttempt = 0;
          markSimulationEventStreamConnected();
        },
        onDisconnect(error) {
          markSimulationEventStreamDisconnected(error ?? new Error("simulation event stream disconnected"));
          recordGatewayEvent("warn", "simulation_event_stream_disconnected", {
            message: error instanceof Error ? error.message : String(error),
            reconnectAttempt: eventStreamReconnectAttempt + 1
          });
          app.log.warn({ err: error }, "simulation event stream disconnected; retrying");
          if (eventStreamShuttingDown) return;
          if (eventStreamReconnectTimer !== undefined) return;
          eventStreamReconnectAttempt += 1;
          const delayMs = Math.min(eventStreamReconnectMaxMs, eventStreamReconnectBaseMs * 2 ** Math.min(5, eventStreamReconnectAttempt - 1));
          eventStreamReconnectTimer = setTimeout(() => {
            eventStreamReconnectTimer = undefined;
            connectEventStream();
          }, delayMs);
        },
        onUnknownEvent(eventType) {
          recordGatewayEvent("warn", "simulation_event_stream_unknown_type", { eventType });
          app.log.warn({ eventType }, "dropped simulation event with unrecognized event_type");
        }
      }
    );
  };
  connectEventStream();
  const stopSimulationStream = (): void => {
    eventStreamShuttingDown = true;
    if (eventStreamReconnectTimer) {
      clearTimeout(eventStreamReconnectTimer);
      eventStreamReconnectTimer = undefined;
    }
    eventStreamCancel?.();
    eventStreamCancel = undefined;
  };
  void refreshSimulationHealth();
  simulationHealthTimer = setInterval(() => {
    void refreshSimulationHealth();
  }, 2_000);

  const databaseKeepAliveIntervalMs = Math.max(60_000, Number(process.env.GATEWAY_DATABASE_KEEPALIVE_MS ?? 6 * 60 * 60 * 1000));
  const pingDatabaseKeepAlive = (): void => {
    void commandStore
      .nextClientSeqForPlayer("__supabase_keepalive__")
      .then(() => {
        recordGatewayEvent("info", "gateway_database_keepalive_ok", {});
      })
      .catch((error: unknown) => {
        recordGatewayEvent("warn", "gateway_database_keepalive_failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      });
  };
  pingDatabaseKeepAlive();
  const databaseKeepAliveTimer = setInterval(pingDatabaseKeepAlive, databaseKeepAliveIntervalMs);
  if (typeof databaseKeepAliveTimer.unref === "function") databaseKeepAliveTimer.unref();
  gatewayEventLoopTimer = setInterval(() => {
    const now = Date.now();
    const lagMs = Math.max(0, now - expectedEventLoopTickAt);
    gatewayEventLoopWindowMaxMs = Math.max(gatewayEventLoopWindowMaxMs, lagMs);
    gatewayMetrics.observeGatewayEventLoopDelayMs(lagMs);
    expectedEventLoopTickAt = now + 100;
  }, 100);
  gatewayMetricsTimer = setInterval(() => {
    gatewayMetrics.setGatewayEventLoopMaxMs(gatewayEventLoopWindowMaxMs);
    gatewayEventLoopWindowMaxMs = 0;
    gatewayMetrics.setGatewayWsSessions(playerSubscriptions.allSockets().size);
    gatewayMetrics.setGatewayBackendConnected(simulationHealth.connected);
    gatewayMetrics.setGatewayCpuPercent(sampleCpuPercent());
    const memory = process.memoryUsage();
    gatewayMetrics.setGatewayMemoryUsageMb({
      rssMb: memory.rss / (1024 * 1024),
      heapUsedMb: memory.heapUsed / (1024 * 1024),
      heapTotalMb: memory.heapTotal / (1024 * 1024)
    });
    if (pendingGcDurationsMs.length > 0) {
      for (const durationMs of pendingGcDurationsMs.splice(0)) {
        gatewayMetrics.observeGatewayGcPauseMs(durationMs);
      }
    }
    const staleBeforeMs = Date.now() - 120_000;
    for (const [commandId, submittedAt] of pendingInputToStateByCommandId.entries()) {
      if (submittedAt < staleBeforeMs) pendingInputToStateByCommandId.delete(commandId);
    }
    refreshGatewaySnapshotCacheMetrics();
    const sample = gatewayMetrics.snapshot();
    app.log.info(
      {
        gateway_event_loop_max_ms: sample.gatewayEventLoopMaxMs,
        gateway_event_loop_delay_ms: sample.gatewayEventLoopDelayMs,
        gateway_ws_sessions: sample.gatewayWsSessions,
        gateway_backend_connected: sample.gatewayBackendConnected,
        gateway_cpu_percent: sample.gatewayCpuPercent,
        gateway_rss_mb: sample.gatewayRssMb,
        gateway_heap_used_mb: sample.gatewayHeapUsedMb,
        gateway_heap_total_mb: sample.gatewayHeapTotalMb,
        gateway_gc_pause_ms: sample.gatewayGcPauseMs,
        gateway_input_to_state_update_latency_ms: sample.gatewayInputToStateUpdateLatencyMs,
        gateway_command_submit_latency_ms: sample.gatewayCommandSubmitLatencyMs,
        gateway_sim_rpc_latency_ms: sample.gatewaySimRpcLatencyMs,
        gateway_snapshot_tile_count: sample.gatewaySnapshotTileCount,
        gateway_snapshot_json_bytes: sample.gatewaySnapshotJsonBytes,
        gateway_snapshot_tiles_json_bytes: sample.gatewaySnapshotTilesJsonBytes,
        gateway_snapshot_cache_entries: sample.gatewaySnapshotCacheEntries,
        gateway_snapshot_cache_bytes: sample.gatewaySnapshotCacheBytes,
        gateway_snapshot_recent: sample.gatewaySnapshotRecent
      },
      "gateway metrics sample"
    );
  }, 1_000);

  app.addHook("onClose", async () => {
    if (simulationHealthTimer) clearInterval(simulationHealthTimer);
    if (gatewayMetricsTimer) clearInterval(gatewayMetricsTimer);
    if (gatewayEventLoopTimer) clearInterval(gatewayEventLoopTimer);
    clearInterval(databaseKeepAliveTimer);
    gcObserver?.disconnect();
    stopSimulationStream();
  });

  app.register(async (instance) => {
    instance.get("/ws", { websocket: true }, (socket, request) => {
      const requestUrl = new URL(request.raw.url ?? "/ws", "http://localhost");
      const channel = requestUrl.searchParams.get("channel") === "bulk" ? "bulk" : "control";
      const session: SocketSession = {
        sessionId: crypto.randomUUID(),
        nextClientSeq: 1,
        initSent: channel === "bulk",
        pendingPayloads: [],
        channel,
        canToggleFog: false,
        fogDisabled: false
      };
      sessionsBySocket.set(socket, session);

      socket.on("message", async (buffer) => {
        try {
          let parsedJson: unknown;
          try {
            parsedJson = JSON.parse(buffer.toString());
          } catch {
            sendJson(socket, { type: "ERROR", code: "BAD_JSON", message: "invalid JSON payload" });
            return;
          }
          const parsed = ClientMessageSchema.safeParse(parsedJson);
          if (!parsed.success) {
            sendJson(socket, { type: "ERROR", code: "BAD_MSG", message: parsed.error.message });
            return;
          }

          const message = parsed.data;
          if (message.type === "AUTH") {
            recordGatewayEvent("info", "gateway_auth", { channel });
            const authTrace = slowLoginAlerter.begin(channel);
            if (!simulationHealth.connected) {
              authTrace.startStep("ensure_simulation_ready");
              await ensureSimulationReadyForAuth();
              authTrace.endStep("ensure_simulation_ready", simulationHealth.connected);
              if (!simulationHealth.connected) {
                sendJson(socket, {
                  type: "ERROR",
                  code: "SERVER_STARTING",
                  message: "Realtime simulation is temporarily unavailable. Retry shortly."
                });
                authTrace.complete("rejected", "SERVER_STARTING");
                return;
              }
            }
            const resolvedPlayerIdentity = resolveGatewayAuthIdentity(message.token, {
              allowDirectPlayerIdToken: Boolean(options.defaultHumanPlayerId),
              ...(options.defaultHumanPlayerId ? { defaultHumanPlayerId: options.defaultHumanPlayerId } : {}),
              ...(legacySnapshotBootstrap ? { authIdentities: legacySnapshotBootstrap.authIdentities } : {})
            });
            if (!resolvedPlayerIdentity) {
              recordGatewayEvent("warn", "gateway_auth_rejected_unmapped_token", {
                channel
              });
              sendJson(socket, {
                type: "ERROR",
                code: "AUTH_FAIL",
                message: "Authentication token is not recognized by the rewrite gateway."
              });
              authTrace.complete("rejected", "AUTH_FAIL");
              return;
            }
            let playerIdentity = { ...resolvedPlayerIdentity };
            authTrace.setPlayerId(playerIdentity.playerId);
            if (resolvedPlayerIdentity.authUid) {
              authTrace.startStep("reconcile_auth_binding");
              try {
                const reconciledIdentity = await cachedReconcileGatewayAuthBinding(resolvedPlayerIdentity);
                playerIdentity = { ...reconciledIdentity };
                if (reconciledIdentity.playerId !== resolvedPlayerIdentity.playerId) {
                  recordGatewayEvent("warn", "gateway_auth_binding_override", {
                    channel,
                    authUid: resolvedPlayerIdentity.authUid,
                    requestedPlayerId: resolvedPlayerIdentity.playerId,
                    boundPlayerId: reconciledIdentity.playerId,
                    bindingSource: reconciledIdentity.bindingSource
                  });
                } else {
                  recordGatewayEvent("info", "gateway_auth_binding_confirmed", {
                    channel,
                    authUid: resolvedPlayerIdentity.authUid,
                    playerId: reconciledIdentity.playerId,
                    bindingSource: reconciledIdentity.bindingSource
                  });
                }
              } catch (error) {
                recordGatewayEvent("error", "gateway_auth_binding_failed", {
                  channel,
                  authUid: resolvedPlayerIdentity.authUid,
                  error: error instanceof Error ? error.message : String(error)
                });
              } finally {
                authTrace.endStep("reconcile_auth_binding");
              }
            }
            authTrace.setPlayerId(playerIdentity.playerId);
            session.playerId = playerIdentity.playerId;
            session.canToggleFog = canToggleFogForEmail(playerIdentity.authEmail, options.fogAdminEmail);
            authTrace.startStep("profile_get");
            const persistedProfile = await cachedProfileGet(playerIdentity.playerId);
            authTrace.endStep("profile_get");
            if (persistedProfile) {
              profileOverrides.upsert(playerIdentity.playerId, {
                ...(persistedProfile.name ? { name: persistedProfile.name } : {}),
                ...(persistedProfile.tileColor ? { tileColor: persistedProfile.tileColor } : {}),
                ...(typeof persistedProfile.profileComplete === "boolean"
                  ? { profileComplete: persistedProfile.profileComplete }
                  : {})
              });
            }
            socialState.registerPlayer(
              playerIdentity.playerId,
              persistedProfile?.name ?? playerIdentity.playerName
            );
            let rallyAnchor: { x: number; y: number; island?: string } | undefined;
            let acceptedRallyCode: string | undefined;
            if (message.rallyCode) {
              const rallyReservation = await reserveRallyLinkForAuth(message.rallyCode, channel, {
                rallyLinkStore,
                activeOwnerAnchor: activeRallyAnchorForOwner,
                seasonIsActive: rallySeasonIsActive
              });
              if (rallyReservation.accepted) {
                acceptedRallyCode = rallyReservation.code;
                rallyAnchor = rallyReservation.anchor;
              }
              recordGatewayEvent(rallyReservation.accepted ? "info" : channel === "control" ? "warn" : "info", "gateway_auth_rally_link", {
                playerId: playerIdentity.playerId,
                channel,
                rallyCode: message.rallyCode,
                accepted: rallyReservation.accepted
              });
            }
            const prepareStartedAt = Date.now();
            authTrace.startStep("prepare_player");
            try {
              recordGatewayEvent("info", "gateway_auth_prepare_started", {
                playerId: playerIdentity.playerId,
                channel
              });
              const prepareResult = await retrySimulationRpc(
                "gateway prepare player",
                () => simulationClient.preparePlayer(playerIdentity.playerId, rallyAnchor),
                simulationPrepareTimeoutMs,
                (error, attempt) => {
                  recordGatewayEvent("warn", "gateway_auth_prepare_retry", {
                    playerId: playerIdentity.playerId,
                    channel,
                    attempt,
                    error: error instanceof Error ? error.message : String(error)
                  });
                }
              );
              if (acceptedRallyCode && !prepareResult.spawned) {
                await rallyLinkStore.releaseUse(acceptedRallyCode);
                acceptedRallyCode = undefined;
              }
              const prepareDurationMs = Date.now() - prepareStartedAt;
              recordGatewayEvent(
                prepareResult.spawned || prepareDurationMs >= 250 ? "warn" : "info",
                "gateway_auth_prepare_ready",
                {
                  playerId: playerIdentity.playerId,
                  channel,
                  prepareDurationMs,
                  spawned: prepareResult.spawned
                }
              );
              markSimulationReady();
              authTrace.endStep("prepare_player");
            } catch (error) {
              recordGatewayEvent("error", "gateway_auth_prepare_failed", {
                playerId: playerIdentity.playerId,
                channel,
                prepareDurationMs: Date.now() - prepareStartedAt,
                error: error instanceof Error ? error.message : String(error)
              });
              sendJson(socket, {
                type: "ERROR",
                code: "SERVER_STARTING",
                message: "Realtime simulation is temporarily unavailable. Retry shortly."
              });
              if (acceptedRallyCode) await rallyLinkStore.releaseUse(acceptedRallyCode);
              authTrace.endStep("prepare_player", false);
              authTrace.complete("rejected", "prepare_failed");
              return;
            }
            let bootstrapInitialState;
            authTrace.startStep("bootstrap_subscribe");
            try {
              bootstrapInitialState = await retrySimulationRpc(
                "gateway bootstrap player",
                () => simulationClient.subscribePlayer(
                  playerIdentity.playerId,
                  JSON.stringify({ mode: "bootstrap-only", emitBootstrapEvent: false, trigger: "gateway_auth_bootstrap" })
                ),
                simulationSubscribeTimeoutMs,
                (error, attempt) => {
                  recordGatewayEvent("warn", "gateway_auth_bootstrap_retry", {
                    playerId: playerIdentity.playerId,
                    channel,
                    attempt,
                    error: error instanceof Error ? error.message : String(error)
                  });
                }
              );
              markSimulationReady();
              authTrace.endStep("bootstrap_subscribe");
              if (bootstrapInitialState) {
                recordGatewayEvent("info", "gateway_auth_bootstrap_ready", {
                  playerId: playerIdentity.playerId,
                  channel,
                  authoritativeTileCount: bootstrapInitialState.tiles.length,
                  hasPlayerPayload: Boolean(bootstrapInitialState.player),
                  worldStatusPresent: Boolean(bootstrapInitialState.worldStatus)
                });
              }
            } catch (error) {
              recordGatewayEvent("error", "gateway_auth_bootstrap_failed", {
                playerId: playerIdentity.playerId,
                channel,
                error: error instanceof Error ? error.message : String(error)
              });
              sendJson(socket, {
                type: "ERROR",
                code: "SERVER_STARTING",
                message: "Realtime simulation is temporarily unavailable. Retry shortly."
              });
              authTrace.endStep("bootstrap_subscribe", false);
              authTrace.complete("rejected", "bootstrap_failed");
              return;
            }
            playerSubscriptions.attachSocket(playerIdentity.playerId, socket);
            if (bootstrapInitialState) {
              playerSubscriptions.seedSnapshot(playerIdentity.playerId, bootstrapInitialState);
              recordGatewaySnapshotDiagnostics(playerIdentity.playerId, bootstrapInitialState, {
                trigger: "gateway_auth_bootstrap",
                fullVisibility: false,
                socketCount: 1,
                payloadJsonBytes: 0
              });
            }
            authTrace.startStep("live_subscribe");
            try {
              await retrySimulationRpc(
                "gateway live subscribe player",
                () => playerSubscriptions.ensureSubscribed(playerIdentity.playerId),
                simulationSubscribeTimeoutMs,
                (error, attempt) => {
                  recordGatewayEvent("warn", "gateway_auth_subscribe_retry", {
                    playerId: playerIdentity.playerId,
                    channel,
                    attempt,
                    error: error instanceof Error ? error.message : String(error)
                  });
                }
              );
              markSimulationReady();
              authTrace.endStep("live_subscribe");
            } catch (error) {
              recordGatewayEvent("error", "gateway_auth_subscribe_failed", {
                playerId: playerIdentity.playerId,
                channel,
                error: error instanceof Error ? error.message : String(error)
              });
              await playerSubscriptions.removeSocket(playerIdentity.playerId, socket).catch((removeError) => {
                app.log.error({ err: removeError, playerId: playerIdentity.playerId }, "failed to rollback player subscription after auth subscribe failure");
              });
              sendJson(socket, {
                type: "ERROR",
                code: "SERVER_STARTING",
                message: "Realtime simulation is temporarily unavailable. Retry shortly."
              });
              authTrace.endStep("live_subscribe", false);
              authTrace.complete("rejected", "live_subscribe_failed");
              return;
            }
            const initialState = resolveInitialState({
              playerId: playerIdentity.playerId,
              authoritativeSnapshot: bootstrapInitialState,
              cachedSnapshot: playerSubscriptions.snapshotForPlayer(playerIdentity.playerId),
              simulationSeedProfile,
              allowCachedSnapshotFallback: allowNonAuthoritativeInitialState,
              allowSeedFallback: allowNonAuthoritativeInitialState
            });
            authTrace.startStep("hydrate_leaderboard_profiles");
            await hydrateVisibleLeaderboardProfileOverrides(initialState, profileStore, profileOverrides);
            authTrace.endStep("hydrate_leaderboard_profiles");
            if (session.channel === "control") {
              authTrace.startStep("build_init");
              const initMessage = await buildInitMessage(
                playerIdentity,
                commandStore,
                initialState,
                simulationSeedProfile,
                legacySnapshotBootstrap,
                profileOverrides,
                socialState,
                session.canToggleFog
              );
              session.nextClientSeq = initMessage.recovery.nextClientSeq;
              session.initSent = true;
              recordGatewayEvent(
                initMessage.initialState?.tiles?.length ? "info" : "warn",
                "gateway_init_sent",
                {
                  playerId: playerIdentity.playerId,
                  channel,
                  initialTileCount: initMessage.initialState?.tiles?.length ?? 0,
                  initJsonBytes: jsonByteSize(initMessage),
                  playerPayloadPresent: Boolean(initMessage.player),
                  seasonId: initMessage.runtimeIdentity.seasonId,
                  runtimeFingerprint: initMessage.runtimeIdentity.fingerprint,
                  snapshotLabel: initMessage.runtimeIdentity.snapshotLabel ?? "",
                  simulationConnected: simulationHealth.connected,
                  simulationLastError: simulationHealth.lastError ?? ""
                }
              );
              authTrace.endStep("build_init");
              sendJson(socket, initMessage);
              for (const payload of session.pendingPayloads) {
                sendJson(socket, payload);
                recordCommandSocketDelivery("gateway_command_payload_sent", socket, payload);
              }
              session.pendingPayloads = [];
              authTrace.complete("init_sent");
            } else {
              authTrace.complete("init_sent", "non_control_channel");
            }
            return;
          }

          if (!session.playerId) {
            sendJson(socket, { type: "ERROR", code: "NO_AUTH", message: "auth first" });
            return;
          }

          if (message.type === "ATTACK_PREVIEW") {
            sendJson(socket, attackPreviewResult(session.playerId, playerSubscriptions.snapshotForPlayer(session.playerId)?.tiles, message));
            return;
          }

          if (message.type === "REQUEST_TILE_DETAIL") {
            const playerId = session.playerId;
            const cachedSnapshot = playerSubscriptions.snapshotForPlayer(playerId);
            const cachedTileDetail = buildSnapshotTileDetail(cachedSnapshot, playerId, message.x, message.y);
            if (cachedTileDetail) {
              sendJson(socket, {
                type: "TILE_DELTA",
                updates: [cachedTileDetail]
              });
            }
            if (simulationHealth.connected) {
              void fetchTileDetailFromSim(playerId, message.x, message.y, session.fogDisabled)
                .then((snapshot) => {
                  if (!snapshot) return;
                  const freshTileDetail = buildSnapshotTileDetail(snapshot, playerId, message.x, message.y);
                  if (freshTileDetail) {
                    sendJson(socket, {
                      type: "TILE_DELTA",
                      updates: [freshTileDetail]
                    });
                  }
                })
                .catch((error) => {
                  recordGatewayEvent("warn", "gateway_tile_detail_fetch_failed", {
                    playerId,
                    x: message.x,
                    y: message.y,
                    error: error instanceof Error ? error.message : String(error)
                  });
                  if (!cachedTileDetail) {
                    sendJson(socket, {
                      type: "ERROR",
                      code: "TILE_DETAIL_UNAVAILABLE",
                      message: "Tile detail is temporarily unavailable."
                    });
                  }
                });
            } else if (!cachedTileDetail) {
              sendJson(socket, {
                type: "ERROR",
                code: "SERVER_STARTING",
                message: "Realtime simulation is temporarily unavailable. Retry shortly."
              });
            }
            return;
          }

          if (message.type === "SET_FOG_DISABLED") {
            recordGatewayEvent("info", "gateway_fog_toggle_received", {
              playerId: session.playerId,
              channel: session.channel,
              requestedFogDisabled: message.disabled === true,
              canToggleFog: session.canToggleFog,
              currentFogDisabled: session.fogDisabled
            });
            if (!session.canToggleFog) {
              recordGatewayEvent("warn", "gateway_fog_toggle_forbidden", {
                playerId: session.playerId,
                channel: session.channel,
                requestedFogDisabled: message.disabled === true
              });
              sendJson(socket, { type: "ERROR", code: "FORBIDDEN", message: "fog toggle unavailable" });
              return;
            }
            const fogDisabled = message.disabled === true;
            await refreshPlayerFogSnapshot(session.playerId, fogDisabled, {
              includeFogUpdate: true,
              reason: "fog_toggle",
              commandId: `fog:${session.playerId}:${Date.now()}`
            });
            return;
          }

          if (message.type === "SET_TILE_COLOR") {
            const storedProfile = await profileStore.setTileColor(session.playerId, message.color);
            invalidateProfileCache(session.playerId);
            const override = profileOverrides.upsert(session.playerId, {
              ...(storedProfile.name ? { name: storedProfile.name } : {}),
              ...(storedProfile.tileColor ? { tileColor: storedProfile.tileColor } : {}),
              ...(typeof storedProfile.profileComplete === "boolean"
                ? { profileComplete: storedProfile.profileComplete }
                : {})
            });
            const payload = {
              type: "PLAYER_STYLE",
              playerId: session.playerId,
              ...(override.name ? { name: override.name } : {}),
              tileColor: message.color
            };
            for (const targetSocket of playerSubscriptions.allSockets()) queueOrSendSessionPayload(targetSocket, payload);
            for (const targetSocket of playerSubscriptions.socketsForPlayer(session.playerId)) {
              queueOrSendSessionPayload(targetSocket, {
                type: "PLAYER_UPDATE",
                tileColor: message.color,
                canToggleFog: session.canToggleFog
              });
            }
            return;
          }

          if (message.type === "SET_PROFILE") {
            const storedProfile = await profileStore.setProfile(session.playerId, message.displayName, message.color);
            invalidateProfileCache(session.playerId);
            const override = profileOverrides.upsert(session.playerId, {
              ...(storedProfile.name ? { name: storedProfile.name } : {}),
              ...(storedProfile.tileColor ? { tileColor: storedProfile.tileColor } : {}),
              ...(typeof storedProfile.profileComplete === "boolean"
                ? { profileComplete: storedProfile.profileComplete }
                : {})
            });
            socialState.renamePlayer(session.playerId, override.name ?? message.displayName);
            const stylePayload = {
              type: "PLAYER_STYLE",
              playerId: session.playerId,
              name: override.name ?? message.displayName,
              tileColor: override.tileColor ?? message.color
            };
            for (const targetSocket of playerSubscriptions.allSockets()) queueOrSendSessionPayload(targetSocket, stylePayload);
            for (const targetSocket of playerSubscriptions.socketsForPlayer(session.playerId)) {
              queueOrSendSessionPayload(targetSocket, {
                type: "PLAYER_UPDATE",
                name: override.name,
                tileColor: override.tileColor,
                profileNeedsSetup: false,
                canToggleFog: session.canToggleFog
              });
            }
            return;
          }

          if (message.type === "ALLIANCE_REQUEST") {
            const result = socialState.requestAlliance(session.playerId, message.targetPlayerName);
            if (!result.ok) {
              sendJson(socket, { type: "ERROR", code: result.code, message: result.message });
              return;
            }
            const alert = readIncomingAllianceRequestAlert(result.payloadsByPlayerId);
            if (alert) {
              sendGameplayEmailAlert("alliance_request", alert.recipientPlayerId, () =>
                emailAlerts.sendAllianceRequestAlert({
                  recipientPlayerId: alert.recipientPlayerId,
                  senderName: alert.senderName
                })
              );
            }
            fanoutPlayerPayloads(result.payloadsByPlayerId);
            return;
          }

          if (message.type === "ALLIANCE_ACCEPT") {
            const result = socialState.acceptAlliance(session.playerId, message.requestId);
            if (!result.ok) {
              sendJson(socket, { type: "ERROR", code: result.code, message: result.message });
              return;
            }
            const allyPlayerId = result.notifyPlayerIds.find((playerId) => playerId !== session.playerId);
            if (allyPlayerId) void syncAllianceToSimulation({ playerId: session.playerId, targetPlayerId: allyPlayerId, allied: true });
            fanoutPlayerPayloads(result.payloadsByPlayerId);
            return;
          }

          if (message.type === "ALLIANCE_REJECT") {
            const result = socialState.rejectAlliance(session.playerId, message.requestId);
            if (!result.ok) {
              sendJson(socket, { type: "ERROR", code: result.code, message: result.message });
              return;
            }
            fanoutPlayerPayloads(result.payloadsByPlayerId);
            return;
          }

          if (message.type === "ALLIANCE_CANCEL") {
            const result = socialState.cancelAlliance(session.playerId, message.requestId);
            if (!result.ok) {
              sendJson(socket, { type: "ERROR", code: result.code, message: result.message });
              return;
            }
            fanoutPlayerPayloads(result.payloadsByPlayerId);
            return;
          }

          if (message.type === "ALLIANCE_BREAK") {
            const result = socialState.breakAlliance(session.playerId, message.targetPlayerId);
            if (!result.ok) {
              sendJson(socket, { type: "ERROR", code: result.code, message: result.message });
              return;
            }
            void syncAllianceToSimulation({ playerId: session.playerId, targetPlayerId: message.targetPlayerId, allied: false });
            fanoutPlayerPayloads(result.payloadsByPlayerId);
            return;
          }

          if (message.type === "TRUCE_REQUEST") {
            const result = socialState.requestTruce(session.playerId, message.targetPlayerName, message.durationHours);
            if (!result.ok) {
              sendJson(socket, { type: "ERROR", code: result.code, message: result.message });
              return;
            }
            const alert = readIncomingTruceRequestAlert(result.payloadsByPlayerId);
            if (alert) {
              sendGameplayEmailAlert("truce_request", alert.recipientPlayerId, () =>
                emailAlerts.sendTruceRequestAlert({
                  recipientPlayerId: alert.recipientPlayerId,
                  senderName: alert.senderName,
                  durationHours: alert.durationHours
                })
              );
            }
            fanoutPlayerPayloads(result.payloadsByPlayerId);
            await maybeAutoRespondToSeededAiTruce(extractTruceRequestFromPayloads(result.payloadsByPlayerId, session.playerId));
            return;
          }

          if (message.type === "TRUCE_ACCEPT") {
            const result = socialState.acceptTruce(session.playerId, message.requestId);
            if (!result.ok) {
              sendJson(socket, { type: "ERROR", code: result.code, message: result.message });
              return;
            }
            fanoutPlayerPayloads(result.payloadsByPlayerId);
            return;
          }

          if (message.type === "TRUCE_REJECT") {
            const result = socialState.rejectTruce(session.playerId, message.requestId);
            if (!result.ok) {
              sendJson(socket, { type: "ERROR", code: result.code, message: result.message });
              return;
            }
            fanoutPlayerPayloads(result.payloadsByPlayerId);
            return;
          }

          if (message.type === "TRUCE_CANCEL") {
            const result = socialState.cancelTruce(session.playerId, message.requestId);
            if (!result.ok) {
              sendJson(socket, { type: "ERROR", code: result.code, message: result.message });
              return;
            }
            fanoutPlayerPayloads(result.payloadsByPlayerId);
            return;
          }

          if (message.type === "TRUCE_BREAK") {
            const result = socialState.breakTruce(session.playerId, message.targetPlayerId);
            if (!result.ok) {
              sendJson(socket, { type: "ERROR", code: result.code, message: result.message });
              return;
            }
            fanoutPlayerPayloads(result.payloadsByPlayerId);
            return;
          }

          if (ignoredLegacyMessageTypes.has(message.type)) {
            recordGatewayEvent("info", "gateway_ignored_legacy_message", { type: message.type });
            // The rewrite gateway currently pushes a full initial snapshot plus deltas,
            // so legacy preview/detail/chunk messages are safe to ignore during cutover.
            return;
          }

          if (
            message.type !== "ATTACK" &&
            message.type !== "EXPAND" &&
            message.type !== "SETTLE" &&
            message.type !== "BUILD_FORT" &&
            message.type !== "BUILD_OBSERVATORY" &&
            message.type !== "BUILD_SIEGE_OUTPOST" &&
            message.type !== "BUILD_ECONOMIC_STRUCTURE" &&
            message.type !== "CANCEL_FORT_BUILD" &&
            message.type !== "CANCEL_STRUCTURE_BUILD" &&
            message.type !== "REMOVE_STRUCTURE" &&
            message.type !== "CANCEL_SIEGE_OUTPOST_BUILD" &&
            message.type !== "CANCEL_CAPTURE" &&
            message.type !== "UNCAPTURE_TILE" &&
            message.type !== "COLLECT_TILE" &&
            message.type !== "COLLECT_VISIBLE" &&
            message.type !== "CHOOSE_TECH" &&
            message.type !== "CHOOSE_DOMAIN" &&
            message.type !== "OVERLOAD_SYNTHESIZER" &&
            message.type !== "SET_CONVERTER_STRUCTURE_ENABLED" &&
            message.type !== "REVEAL_EMPIRE" &&
            message.type !== "REVEAL_EMPIRE_STATS" &&
            message.type !== "CAST_AETHER_BRIDGE" &&
            message.type !== "CAST_AETHER_WALL" &&
            message.type !== "SIPHON_TILE" &&
            message.type !== "PURGE_SIPHON" &&
            message.type !== "CREATE_MOUNTAIN" &&
            message.type !== "REMOVE_MOUNTAIN" &&
            message.type !== "AIRPORT_BOMBARD" &&
            message.type !== "COLLECT_SHARD"
          ) {
            sendJson(socket, {
              type: "ERROR",
              code: "UNSUPPORTED",
              message: `${message.type} not yet migrated to gateway`
            });
            return;
          }

          if (!simulationHealth.connected) {
            recordGatewayEvent("warn", "simulation_command_rejected_unavailable", {
              messageType: message.type,
              simulationLastError: simulationHealth.lastError ?? ""
            });
            sendJson(socket, {
              type: "ERROR",
              code: "SERVER_STARTING",
              message: "Realtime simulation is temporarily unavailable. Retry shortly."
            });
            return;
          }

          const authedSession = {
            sessionId: session.sessionId,
            playerId: session.playerId,
            nextClientSeq: session.nextClientSeq
          };
          const submitDeps = {
            createCommandId: options.createCommandId ?? (() => crypto.randomUUID()),
            now: options.now ?? (() => Date.now()),
            commandStore,
            onCommandSubmitted: (command: { commandId: string }) => {
              pendingInputToStateByCommandId.set(command.commandId, Date.now());
            },
            onCommandSubmitFailed: (commandId: string) => {
              pendingInputToStateByCommandId.delete(commandId);
            },
            submitCommand: async (command: Parameters<typeof simulationClient.submitCommand>[0]) => {
              const rpcStartedAt = Date.now();
              try {
                await withTimeout(
                  simulationClient.submitCommand(command),
                  simulationSubmitTimeoutMs,
                  "gateway submit command"
                );
                markSimulationReady();
              } catch (error) {
                markSimulationUnavailable(error);
                recordGatewayEvent("warn", "simulation_submit_failed", {
                  commandId: command.commandId,
                  playerId: command.playerId,
                  error: error instanceof Error ? error.message : String(error)
                });
                throw error;
              } finally {
                const rpcDurationMs = Date.now() - rpcStartedAt;
                gatewayMetrics.observeGatewaySimRpcLatencyMs(rpcDurationMs);
                if (rpcDurationMs >= slowGatewayRpcWarnMs) {
                  recordGatewayEvent("warn", "simulation_submit_rpc_slow", {
                    commandId: command.commandId,
                    playerId: command.playerId,
                    durationMs: rpcDurationMs,
                    timeoutMs: simulationSubmitTimeoutMs,
                    simulationConnected: simulationHealth.connected,
                    simulationLastError: simulationHealth.lastError ?? ""
                  });
                }
              }
            },
            sendJson: (payload: unknown) => sendJson(socket, payload)
          };
          const trackSubmitLatency = async (submit: () => Promise<void>): Promise<void> => {
            const submitStartedAt = Date.now();
            try {
              await submit();
            } finally {
              const submitDurationMs = Date.now() - submitStartedAt;
              gatewayMetrics.observeGatewayCommandSubmitLatencyMs(submitDurationMs);
              if (submitDurationMs >= slowGatewaySubmitWarnMs) {
                recordGatewayEvent("warn", "gateway_command_submit_slow", {
                  messageType: message.type,
                  playerId: session.playerId,
                  durationMs: submitDurationMs,
                  timeoutMs: simulationSubmitTimeoutMs,
                  simulationConnected: simulationHealth.connected,
                  simulationLastError: simulationHealth.lastError ?? ""
                });
              }
            }
          };
          if (message.type === "SETTLE") {
            const metadata = optionalCommandMetadata(message);
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "SETTLE",
                  payload: {
                    x: message.x,
                    y: message.y
                  },
                  ...metadata
                },
                submitDeps
              )
            );
          } else if (message.type === "BUILD_FORT") {
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "BUILD_FORT",
                  payload: {
                    x: message.x,
                    y: message.y
                  }
                },
                submitDeps
              )
            );
          } else if (message.type === "BUILD_OBSERVATORY") {
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "BUILD_OBSERVATORY",
                  payload: {
                    x: message.x,
                    y: message.y
                  }
                },
                submitDeps
              )
            );
          } else if (message.type === "BUILD_SIEGE_OUTPOST") {
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "BUILD_SIEGE_OUTPOST",
                  payload: {
                    x: message.x,
                    y: message.y
                  }
                },
                submitDeps
              )
            );
          } else if (message.type === "BUILD_ECONOMIC_STRUCTURE") {
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "BUILD_ECONOMIC_STRUCTURE",
                  payload: {
                    x: message.x,
                    y: message.y,
                    structureType: message.structureType
                  }
                },
                submitDeps
              )
            );
          } else if (message.type === "CANCEL_FORT_BUILD") {
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "CANCEL_FORT_BUILD",
                  payload: {
                    x: message.x,
                    y: message.y
                  }
                },
                submitDeps
              )
            );
          } else if (message.type === "CANCEL_STRUCTURE_BUILD") {
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "CANCEL_STRUCTURE_BUILD",
                  payload: {
                    x: message.x,
                    y: message.y
                  }
                },
                submitDeps
              )
            );
          } else if (message.type === "REMOVE_STRUCTURE") {
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "REMOVE_STRUCTURE",
                  payload: {
                    x: message.x,
                    y: message.y
                  }
                },
                submitDeps
              )
            );
          } else if (message.type === "CANCEL_SIEGE_OUTPOST_BUILD") {
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "CANCEL_SIEGE_OUTPOST_BUILD",
                  payload: {
                    x: message.x,
                    y: message.y
                  }
                },
                submitDeps
              )
            );
          } else if (message.type === "COLLECT_VISIBLE") {
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "COLLECT_VISIBLE",
                  payload: {}
                },
                submitDeps
              )
            );
          } else if (message.type === "COLLECT_TILE") {
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "COLLECT_TILE",
                  payload: {
                    x: message.x,
                    y: message.y
                  }
                },
                submitDeps
              )
            );
          } else if (message.type === "UNCAPTURE_TILE") {
            const metadata = optionalCommandMetadata(message);
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "UNCAPTURE_TILE",
                  payload: {
                    x: message.x,
                    y: message.y
                  },
                  ...metadata
                },
                submitDeps
              )
            );
          } else if (message.type === "CHOOSE_TECH") {
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "CHOOSE_TECH",
                  payload: {
                    techId: message.techId
                  }
                },
                submitDeps
              )
            );
          } else if (message.type === "CHOOSE_DOMAIN") {
            const trickleResource = (message as { chosenTrickleResource?: unknown }).chosenTrickleResource;
            const validTrickle =
              trickleResource === "IRON" || trickleResource === "SUPPLY" || trickleResource === "CRYSTAL"
                ? trickleResource
                : undefined;
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "CHOOSE_DOMAIN",
                  payload: {
                    domainId: message.domainId,
                    ...(validTrickle ? { chosenTrickleResource: validTrickle } : {})
                  }
                },
                submitDeps
              )
            );
          } else if (message.type === "CANCEL_CAPTURE") {
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "CANCEL_CAPTURE",
                  payload: {}
                },
                submitDeps
              )
            );
          } else if (message.type === "OVERLOAD_SYNTHESIZER") {
            const metadata = optionalCommandMetadata(message);
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "OVERLOAD_SYNTHESIZER",
                  payload: {
                    x: message.x,
                    y: message.y
                  },
                  ...metadata
                },
                submitDeps
              )
            );
          } else if (message.type === "SET_CONVERTER_STRUCTURE_ENABLED") {
            const metadata = optionalCommandMetadata(message);
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "SET_CONVERTER_STRUCTURE_ENABLED",
                  payload: {
                    x: message.x,
                    y: message.y,
                    enabled: message.enabled
                  },
                  ...metadata
                },
                submitDeps
              )
            );
          } else if (message.type === "REVEAL_EMPIRE") {
            const metadata = optionalCommandMetadata(message);
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "REVEAL_EMPIRE",
                  payload: {
                    targetPlayerId: message.targetPlayerId
                  },
                  ...metadata
                },
                submitDeps
              )
            );
          } else if (message.type === "REVEAL_EMPIRE_STATS") {
            const metadata = optionalCommandMetadata(message);
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "REVEAL_EMPIRE_STATS",
                  payload: {
                    targetPlayerId: message.targetPlayerId
                  },
                  ...metadata
                },
                submitDeps
              )
            );
          } else if (message.type === "CAST_AETHER_BRIDGE") {
            const metadata = optionalCommandMetadata(message);
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "CAST_AETHER_BRIDGE",
                  payload: {
                    x: message.x,
                    y: message.y
                  },
                  ...metadata
                },
                submitDeps
              )
            );
          } else if (message.type === "CAST_AETHER_WALL") {
            const metadata = optionalCommandMetadata(message);
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "CAST_AETHER_WALL",
                  payload: {
                    x: message.x,
                    y: message.y,
                    direction: message.direction,
                    length: message.length
                  },
                  ...metadata
                },
                submitDeps
              )
            );
          } else if (message.type === "SIPHON_TILE") {
            const metadata = optionalCommandMetadata(message);
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "SIPHON_TILE",
                  payload: {
                    x: message.x,
                    y: message.y
                  },
                  ...metadata
                },
                submitDeps
              )
            );
          } else if (message.type === "PURGE_SIPHON") {
            const metadata = optionalCommandMetadata(message);
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "PURGE_SIPHON",
                  payload: {
                    x: message.x,
                    y: message.y
                  },
                  ...metadata
                },
                submitDeps
              )
            );
          } else if (message.type === "CREATE_MOUNTAIN") {
            const metadata = optionalCommandMetadata(message);
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "CREATE_MOUNTAIN",
                  payload: {
                    x: message.x,
                    y: message.y
                  },
                  ...metadata
                },
                submitDeps
              )
            );
          } else if (message.type === "REMOVE_MOUNTAIN") {
            const metadata = optionalCommandMetadata(message);
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "REMOVE_MOUNTAIN",
                  payload: {
                    x: message.x,
                    y: message.y
                  },
                  ...metadata
                },
                submitDeps
              )
            );
          } else if (message.type === "AIRPORT_BOMBARD") {
            const metadata = optionalCommandMetadata(message);
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "AIRPORT_BOMBARD",
                  payload: {
                    fromX: message.fromX,
                    fromY: message.fromY,
                    toX: message.toX,
                    toY: message.toY
                  },
                  ...metadata
                },
                submitDeps
              )
            );
          } else if (message.type === "COLLECT_SHARD") {
            const metadata = optionalCommandMetadata(message);
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "COLLECT_SHARD",
                  payload: {
                    x: message.x,
                    y: message.y
                  },
                  ...metadata
                },
                submitDeps
              )
            );
          } else {
            const metadata = optionalCommandMetadata(message);
            await trackSubmitLatency(() =>
              submitFrontierCommand(
                authedSession,
                {
                  type: message.type,
                  fromX: message.fromX,
                  fromY: message.fromY,
                  toX: message.toX,
                  toY: message.toY,
                  ...metadata
                },
                submitDeps
              )
            );
          }
          session.nextClientSeq = authedSession.nextClientSeq;
        } catch (error) {
          recordGatewayEvent("error", "gateway_websocket_message_failed", {
            message: error instanceof Error ? error.message : String(error)
          });
          app.log.error({ err: error }, "gateway websocket message handling failed");
          sendJson(socket, { type: "ERROR", code: "GATEWAY_INTERNAL_ERROR", message: "gateway failed to handle message" });
        }
      });

      socket.on("close", () => {
        if (!session.playerId) return;
        void playerSubscriptions.removeSocket(session.playerId, socket)
          .then(() => {
            syncGatewaySnapshotMetricsFromCache(session.playerId!);
          })
          .catch((error) => {
            app.log.error({ err: error, playerId: session.playerId }, "failed to unsubscribe player");
          });
      });
    });
  });

  const host = options.host ?? "127.0.0.1";
  const requestedPort = options.port ?? 3101;

  return {
    app,
    async start(): Promise<{ host: string; port: number; address: string; wsUrl: string }> {
      await app.listen({ host, port: requestedPort });
      const addressInfo = app.server.address();
      const resolvedPort =
        typeof addressInfo === "object" && addressInfo && "port" in addressInfo ? Number(addressInfo.port) : requestedPort;
      return {
        host,
        port: resolvedPort,
        address: `http://${host}:${resolvedPort}`,
        wsUrl: `ws://${host}:${resolvedPort}/ws`
      };
    },
    async close(): Promise<void> {
      await app.close();
    }
  };
};
