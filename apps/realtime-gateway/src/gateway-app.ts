import crypto from "node:crypto";

import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { buildFrontierCombatPreview } from "@border-empires/shared";
import { ClientMessageSchema } from "@border-empires/shared";

import { resolveGatewayAuthIdentity } from "./auth-identity.js";
import type { GatewayCommandStore } from "./command-store.js";
import { createGatewayCommandStore } from "./command-store-factory.js";
import { submitDurableCommand, submitFrontierCommand, type GatewaySocketSession } from "./frontier-submit.js";
import { registerGatewayHttpRoutes } from "./http-routes.js";
import { createGatewayMetrics } from "./metrics.js";
import { createPlayerSubscriptions } from "./player-subscriptions.js";
import { createPlayerProfileOverrides } from "./player-profile-overrides.js";
import { withTimeout } from "./promise-timeout.js";
import { resolveInitialState } from "./initial-state.js";
import { buildInitMessage } from "./reconnect-recovery.js";
import { type SimulationSeedProfile } from "./seed-fallback.js";
import { createSimulationClient, type SimulationClientEvent } from "./sim-client.js";
import { createSocialState } from "./social-state.js";
import { applyPlayerMessageToSnapshot, applyTileDeltasToSnapshot } from "./subscription-snapshot-sync.js";
import { supportedClientMessageTypes } from "./supported-client-messages.js";
import { buildSnapshotTileDetail } from "./tile-detail-snapshot.js";
import { loadLegacySnapshotBootstrap } from "../../simulation/src/legacy-snapshot-bootstrap.js";
import { isFrontierAdjacent } from "../../simulation/src/frontier-adjacency.js";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

type SocketSession = Omit<GatewaySocketSession, "playerId"> & {
  playerId?: string;
  initSent: boolean;
  pendingPayloads: unknown[];
  channel: "control" | "bulk";
};

type SimulationClient = ReturnType<typeof createSimulationClient>;

type RealtimeGatewayAppOptions = {
  host?: string;
  port?: number;
  logger?: boolean;
  simulationAddress?: string;
  simulationClient?: SimulationClient;
  commandStore?: GatewayCommandStore;
  databaseUrl?: string;
  applySchema?: boolean;
  defaultHumanPlayerId?: string;
  simulationSeedProfile?: SimulationSeedProfile;
  snapshotDir?: string;
  createCommandId?: () => string;
  now?: () => number;
  simulationSubscribeTimeoutMs?: number;
};

const sendJson = (socket: import("ws").WebSocket, payload: unknown): void => {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
};

const jsonSafeTileDeltaBatch = (
  tileDeltas: Array<NonNullable<Extract<SimulationClientEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"]>[number]>
): Array<Record<string, unknown>> =>
  tileDeltas.map((tileDelta) => ({
    ...tileDelta,
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

type PreviewTile = {
  x: number;
  y: number;
  terrain?: string | undefined;
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  dockId?: string | undefined;
  townType?: string | undefined;
};

const tileAt = (tiles: PreviewTile[], x: number, y: number): PreviewTile | undefined =>
  tiles.find((tile) => tile.x === x && tile.y === y);

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
  const origin = tileAt(tiles, from.x, from.y);
  const target = tileAt(tiles, to.x, to.y);
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
  const preview = buildFrontierCombatPreview(target);
  return {
    type: "ATTACK_PREVIEW_RESULT",
    from,
    to,
    valid: true,
    winChance: preview.winChance,
    breakthroughWinChance: preview.breakthroughWinChance,
    atkEff: preview.atkEff,
    defEff: preview.defEff,
    defMult: preview.defMult
  };
};

export const createRealtimeGatewayApp = async (options: RealtimeGatewayAppOptions = {}) => {
  const app = Fastify({ logger: options.logger ?? true });
  await app.register(websocket);
  const startupStartedAt = Date.now();
  const allowSeedFallback = process.env.GATEWAY_ALLOW_SEED_FALLBACK !== "0";
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
  };

  const simulationClient =
    options.simulationClient ?? createSimulationClient(options.simulationAddress ?? "127.0.0.1:50051");
  const simulationSubscribeTimeoutMs = options.simulationSubscribeTimeoutMs ?? 3_000;
  const simulationPingTimeoutMs = Math.max(1_500, Number(process.env.GATEWAY_SIMULATION_PING_TIMEOUT_MS ?? 20_000));
  const simulationHealthFailureThreshold = Math.max(
    1,
    Number(process.env.GATEWAY_SIMULATION_HEALTH_FAILURE_THRESHOLD ?? 3)
  );
  const simulationHealth = {
    connected: false,
    lastReadyAt: undefined as number | undefined,
    lastError: undefined as string | undefined
  };
  let simulationConsecutiveHealthFailures = 0;
  let simulationHealthRefreshInFlight = false;
  const gatewayMetrics = createGatewayMetrics();
  let gatewayMetricsTimer: ReturnType<typeof setInterval> | undefined;
  let gatewayEventLoopTimer: ReturnType<typeof setInterval> | undefined;
  let gatewayEventLoopWindowMaxMs = 0;
  let expectedEventLoopTickAt = Date.now() + 100;
  let simulationHealthTimer: ReturnType<typeof setInterval> | undefined;
  const markSimulationReady = (): void => {
    simulationHealth.connected = true;
    simulationHealth.lastReadyAt = Date.now();
    simulationHealth.lastError = undefined;
    simulationConsecutiveHealthFailures = 0;
  };
  const markSimulationUnavailable = (error: unknown): void => {
    simulationHealth.connected = false;
    simulationHealth.lastError = error instanceof Error ? error.message : String(error);
  };
  const refreshSimulationHealth = async (): Promise<void> => {
    if (simulationHealthRefreshInFlight) return;
    simulationHealthRefreshInFlight = true;
    // Test doubles and lightweight local adapters may omit ping; treat them as ready.
    try {
      if (typeof simulationClient.ping !== "function") {
        markSimulationReady();
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
  const commandStoreFactoryOptions = {
    ...(options.databaseUrl ? { databaseUrl: options.databaseUrl } : {}),
    ...(typeof options.applySchema === "boolean" ? { applySchema: options.applySchema } : {})
  };
  const commandStore =
    options.commandStore ??
    (await createGatewayCommandStore(commandStoreFactoryOptions));
  const playerSubscriptions = createPlayerSubscriptions<import("ws").WebSocket, Awaited<ReturnType<typeof simulationClient.subscribePlayer>>>({
    subscribePlayer: (playerId) => simulationClient.subscribePlayer(playerId),
    unsubscribePlayer: (playerId) => simulationClient.unsubscribePlayer(playerId)
  });
  const profileOverrides = createPlayerProfileOverrides();
  const socialState = createSocialState({
    ...(options.now ? { now: options.now } : {}),
    ...(legacySnapshotBootstrap
      ? {
          players: [...legacySnapshotBootstrap.playerProfiles.values()].map((profile) => ({
            id: profile.id,
            name: profile.name
          }))
        }
      : {})
  });
  const fallbackTileDeltasByCommandId = new Map<
    string,
    Array<{ x: number; y: number; ownerId?: string; ownershipState?: string }>
  >();
  const sessionsBySocket = new WeakMap<import("ws").WebSocket, SocketSession>();
  const ignoredLegacyMessageTypes = new Set<string>(
    supportedClientMessageTypes.filter(
      (messageType) =>
        messageType !== "ATTACK" &&
        messageType !== "EXPAND" &&
        messageType !== "BREAKTHROUGH_ATTACK" &&
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
    metrics: () => gatewayMetrics.renderPrometheus()
  });

  const socketsForEvent = (
    sockets: ReadonlySet<import("ws").WebSocket>,
    eventType: SimulationClientEvent["eventType"]
  ): import("ws").WebSocket[] => {
    const controlSockets: import("ws").WebSocket[] = [];
    const bulkSockets: import("ws").WebSocket[] = [];
    for (const socket of sockets) {
      const session = sessionsBySocket.get(socket);
      if (!session) continue;
      if (session.channel === "bulk") bulkSockets.push(socket);
      else controlSockets.push(socket);
    }
    if (eventType === "TILE_DELTA_BATCH") return bulkSockets.length > 0 ? bulkSockets : controlSockets;
    return controlSockets.length > 0 ? controlSockets : bulkSockets;
  };

  const socketsForTileDeltaBatchByPlayer = (
    sockets: ReadonlySet<import("ws").WebSocket>
  ): import("ws").WebSocket[] => {
    const socketsByPlayerId = new Map<
      string,
      { control: import("ws").WebSocket[]; bulk: import("ws").WebSocket[] }
    >();
    for (const socket of sockets) {
      const session = sessionsBySocket.get(socket);
      if (!session?.playerId) continue;
      const grouped = socketsByPlayerId.get(session.playerId) ?? { control: [], bulk: [] };
      if (session.channel === "bulk") grouped.bulk.push(socket);
      else grouped.control.push(socket);
      socketsByPlayerId.set(session.playerId, grouped);
    }
    const selected: import("ws").WebSocket[] = [];
    for (const grouped of socketsByPlayerId.values()) {
      selected.push(...(grouped.bulk.length > 0 ? grouped.bulk : grouped.control));
    }
    return selected;
  };

  const queueOrSendSessionPayload = (socket: import("ws").WebSocket, payload: unknown): void => {
    const session = sessionsBySocket.get(socket);
    if (!session || session.initSent) {
      sendJson(socket, payload);
      return;
    }
    session.pendingPayloads.push(payload);
  };

  const fanoutPlayerPayloads = (payloadsByPlayerId: Map<string, unknown[]>): void => {
    for (const [playerId, payloads] of payloadsByPlayerId) {
      for (const payload of payloads) {
        for (const targetSocket of playerSubscriptions.socketsForPlayer(playerId)) {
          queueOrSendSessionPayload(targetSocket, payload);
        }
      }
    }
  };

  const stopSimulationStream = simulationClient.streamEvents(
    (event: SimulationClientEvent) => {
      markSimulationReady();
      const sockets =
        event.eventType === "TILE_DELTA_BATCH" && !event.commandId.startsWith("bootstrap:")
          ? playerSubscriptions.allSockets()
          : playerSubscriptions.socketsForPlayer(event.playerId);
      if (sockets.size === 0) return;
      if (event.eventType === "PLAYER_MESSAGE") {
        for (const targetSocket of sockets) {
          const session = sessionsBySocket.get(targetSocket);
          if (!session?.playerId) continue;
          playerSubscriptions.updateSnapshot(session.playerId, (snapshot) => applyPlayerMessageToSnapshot(snapshot, event.payload));
        }
      }
      // TILE_DELTA_BATCH: snapshot updates and persistence must run exactly once
      // per event (not once per socket), so handle them before the per-socket fan-out loop.
      if (event.eventType === "TILE_DELTA_BATCH") {
        const tileDeltas = event.tileDeltas.length > 0 ? event.tileDeltas : (fallbackTileDeltasByCommandId.get(event.commandId) ?? []);
        fallbackTileDeltasByCommandId.delete(event.commandId);
        // Update cached snapshot for every subscriber (all sockets, all channels) — once.
        for (const targetSocket of sockets) {
          const session = sessionsBySocket.get(targetSocket);
          if (!session?.playerId) continue;
          playerSubscriptions.updateSnapshot(session.playerId, (snapshot) => applyTileDeltasToSnapshot(snapshot, tileDeltas));
        }
        // Persist command resolution exactly once, not once per socket.
        void commandStore.get(event.commandId).then((command) => {
          if (!command) return;
          if (command.type === "ATTACK" || command.type === "EXPAND" || command.type === "BREAKTHROUGH_ATTACK") return;
          void commandStore.markResolved(event.commandId, Date.now()).catch((error) =>
            app.log.error({ err: error, commandId: event.commandId }, "failed to persist resolved non-frontier command")
          );
        });
        // Fan out the TILE_DELTA_BATCH message to the preferred channel (bulk > control).
        const tileDeltaPayload = {
          type: "TILE_DELTA_BATCH",
          commandId: event.commandId,
          tiles: jsonSafeTileDeltaBatch(tileDeltas)
        };
        for (const targetSocket of socketsForTileDeltaBatchByPlayer(sockets)) {
          queueOrSendSessionPayload(targetSocket, tileDeltaPayload);
        }
        return;
      }
      for (const socket of socketsForEvent(sockets, event.eventType)) {
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
              resolvesAt: event.resolvesAt
            });
          }
          continue;
        }
        if (event.eventType === "COMMAND_REJECTED") {
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
          void commandStore
            .markResolved(event.commandId, Date.now())
            .catch((error) => app.log.error({ err: error, commandId: event.commandId }, "failed to persist player message"));
          queueOrSendSessionPayload(socket, event.payload);
          continue;
        }
        fallbackTileDeltasByCommandId.set(event.commandId, [
          {
            x: event.targetX,
            y: event.targetY,
            ownerId: event.playerId,
            ownershipState: "FRONTIER"
          }
        ]);
        void commandStore
          .markResolved(event.commandId, Date.now())
          .catch((error) => app.log.error({ err: error, commandId: event.commandId }, "failed to persist resolved command"));
        if (event.actionType === "EXPAND") {
          queueOrSendSessionPayload(socket, {
            type: "FRONTIER_RESULT",
            commandId: event.commandId,
            actionType: event.actionType,
            origin: { x: event.originX, y: event.originY },
            target: { x: event.targetX, y: event.targetY }
          });
          continue;
        }
        queueOrSendSessionPayload(socket, {
          type: "COMBAT_RESULT",
          commandId: event.commandId,
          attackType: event.actionType,
          attackerWon: event.attackerWon,
          origin: { x: event.originX, y: event.originY },
          target: { x: event.targetX, y: event.targetY },
          ...(typeof event.pillagedGold === "number" ? { pillagedGold: event.pillagedGold } : {}),
          ...(event.pillagedStrategic ? { pillagedStrategic: event.pillagedStrategic } : {}),
          changes: event.attackerWon
            ? [{ x: event.targetX, y: event.targetY, ownerId: event.playerId, ownershipState: "FRONTIER" }]
            : []
        });
      }
    },
    {
      onDisconnect(error) {
        markSimulationUnavailable(error ?? new Error("simulation event stream disconnected"));
        recordGatewayEvent("warn", "simulation_event_stream_disconnected", {
          message: error instanceof Error ? error.message : String(error)
        });
        app.log.warn({ err: error }, "simulation event stream disconnected; retrying");
      }
    }
  );
  void refreshSimulationHealth();
  simulationHealthTimer = setInterval(() => {
    void refreshSimulationHealth();
  }, 2_000);
  gatewayEventLoopTimer = setInterval(() => {
    const now = Date.now();
    const lagMs = Math.max(0, now - expectedEventLoopTickAt);
    gatewayEventLoopWindowMaxMs = Math.max(gatewayEventLoopWindowMaxMs, lagMs);
    expectedEventLoopTickAt = now + 100;
  }, 100);
  gatewayMetricsTimer = setInterval(() => {
    gatewayMetrics.setGatewayEventLoopMaxMs(gatewayEventLoopWindowMaxMs);
    gatewayEventLoopWindowMaxMs = 0;
    gatewayMetrics.setGatewayWsSessions(playerSubscriptions.allSockets().size);
    gatewayMetrics.setGatewayBackendConnected(simulationHealth.connected);
    const sample = gatewayMetrics.snapshot();
    app.log.info(
      {
        gateway_event_loop_max_ms: sample.gatewayEventLoopMaxMs,
        gateway_ws_sessions: sample.gatewayWsSessions,
        gateway_backend_connected: sample.gatewayBackendConnected,
        gateway_command_submit_latency_ms: sample.gatewayCommandSubmitLatencyMs,
        gateway_sim_rpc_latency_ms: sample.gatewaySimRpcLatencyMs
      },
      "gateway metrics sample"
    );
  }, 1_000);

  app.addHook("onClose", async () => {
    if (simulationHealthTimer) clearInterval(simulationHealthTimer);
    if (gatewayMetricsTimer) clearInterval(gatewayMetricsTimer);
    if (gatewayEventLoopTimer) clearInterval(gatewayEventLoopTimer);
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
        channel
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
            if (!simulationHealth.connected) {
              await refreshSimulationHealth();
            }
            const playerIdentity = resolveGatewayAuthIdentity(message.token, {
              ...(options.defaultHumanPlayerId ? { defaultHumanPlayerId: options.defaultHumanPlayerId } : {}),
              ...(legacySnapshotBootstrap ? { authIdentities: legacySnapshotBootstrap.authIdentities } : {})
            });
            session.playerId = playerIdentity.playerId;
            socialState.registerPlayer(playerIdentity.playerId, playerIdentity.playerName);
            let subscribedInitialState;
            try {
              subscribedInitialState = await withTimeout(
                playerSubscriptions.addSocket(playerIdentity.playerId, socket),
                simulationSubscribeTimeoutMs,
                "gateway subscribe player"
              );
              markSimulationReady();
              if (subscribedInitialState) {
                recordGatewayEvent("info", "gateway_auth_subscribe_ready", {
                  playerId: playerIdentity.playerId,
                  channel,
                  authoritativeTileCount: subscribedInitialState.tiles.length,
                  hasPlayerPayload: Boolean(subscribedInitialState.player),
                  worldStatusPresent: Boolean(subscribedInitialState.worldStatus)
                });
              }
            } catch (error) {
              markSimulationUnavailable(error);
              recordGatewayEvent("error", "gateway_auth_subscribe_failed", {
                playerId: playerIdentity.playerId,
                error: error instanceof Error ? error.message : String(error)
              });
              sendJson(socket, {
                type: "ERROR",
                code: "SERVER_STARTING",
                message: "Realtime simulation is temporarily unavailable. Retry shortly."
              });
              return;
            }
            const initialState = resolveInitialState({
              playerId: playerIdentity.playerId,
              authoritativeSnapshot: subscribedInitialState,
              cachedSnapshot: playerSubscriptions.snapshotForPlayer(playerIdentity.playerId),
              simulationSeedProfile,
              allowSeedFallback
            });
            if (session.channel === "control") {
              const initMessage = await buildInitMessage(
                playerIdentity,
                commandStore,
                initialState,
                simulationSeedProfile,
                legacySnapshotBootstrap,
                profileOverrides,
                socialState
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
                  playerPayloadPresent: Boolean(initMessage.player),
                  seasonId: initMessage.runtimeIdentity.seasonId,
                  runtimeFingerprint: initMessage.runtimeIdentity.fingerprint,
                  snapshotLabel: initMessage.runtimeIdentity.snapshotLabel ?? "",
                  simulationConnected: simulationHealth.connected,
                  simulationLastError: simulationHealth.lastError ?? ""
                }
              );
              sendJson(socket, initMessage);
              for (const payload of session.pendingPayloads) sendJson(socket, payload);
              session.pendingPayloads = [];
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
            const snapshot = playerSubscriptions.snapshotForPlayer(session.playerId);
            const tileDetail = buildSnapshotTileDetail(snapshot, session.playerId, message.x, message.y);
            if (tileDetail) {
              sendJson(socket, {
                type: "TILE_DELTA",
                updates: [tileDetail]
              });
            }
            return;
          }

          if (message.type === "SET_TILE_COLOR") {
            const override = profileOverrides.setTileColor(session.playerId, message.color);
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
                tileColor: message.color
              });
            }
            return;
          }

          if (message.type === "SET_PROFILE") {
            const override = profileOverrides.setProfile(session.playerId, message.displayName, message.color);
            socialState.renamePlayer(session.playerId, message.displayName);
            const stylePayload = {
              type: "PLAYER_STYLE",
              playerId: session.playerId,
              name: message.displayName,
              tileColor: message.color
            };
            for (const targetSocket of playerSubscriptions.allSockets()) queueOrSendSessionPayload(targetSocket, stylePayload);
            for (const targetSocket of playerSubscriptions.socketsForPlayer(session.playerId)) {
              queueOrSendSessionPayload(targetSocket, {
                type: "PLAYER_UPDATE",
                name: override.name,
                tileColor: override.tileColor,
                profileNeedsSetup: false
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
            fanoutPlayerPayloads(result.payloadsByPlayerId);
            return;
          }

          if (message.type === "ALLIANCE_ACCEPT") {
            const result = socialState.acceptAlliance(session.playerId, message.requestId);
            if (!result.ok) {
              sendJson(socket, { type: "ERROR", code: result.code, message: result.message });
              return;
            }
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
            fanoutPlayerPayloads(result.payloadsByPlayerId);
            return;
          }

          if (message.type === "TRUCE_REQUEST") {
            const result = socialState.requestTruce(session.playerId, message.targetPlayerName, message.durationHours);
            if (!result.ok) {
              sendJson(socket, { type: "ERROR", code: result.code, message: result.message });
              return;
            }
            fanoutPlayerPayloads(result.payloadsByPlayerId);
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
            message.type !== "BREAKTHROUGH_ATTACK" &&
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

          const authedSession = {
            sessionId: session.sessionId,
            playerId: session.playerId,
            nextClientSeq: session.nextClientSeq
          };
          const submitDeps = {
            createCommandId: options.createCommandId ?? (() => crypto.randomUUID()),
            now: options.now ?? (() => Date.now()),
            commandStore,
            submitCommand: async (command: Parameters<typeof simulationClient.submitCommand>[0]) => {
              const rpcStartedAt = Date.now();
              try {
                await simulationClient.submitCommand(command);
              } finally {
                gatewayMetrics.observeGatewaySimRpcLatencyMs(Date.now() - rpcStartedAt);
              }
            },
            sendJson: (payload: unknown) => sendJson(socket, payload)
          };
          const trackSubmitLatency = async (submit: () => Promise<void>): Promise<void> => {
            const submitStartedAt = Date.now();
            try {
              await submit();
            } finally {
              gatewayMetrics.observeGatewayCommandSubmitLatencyMs(Date.now() - submitStartedAt);
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
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "CHOOSE_DOMAIN",
                  payload: {
                    domainId: message.domainId
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
        void playerSubscriptions.removeSocket(session.playerId, socket).catch((error) => {
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
