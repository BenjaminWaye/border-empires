import { PerformanceObserver } from "node:perf_hooks";

import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { buildFrontierCombatPreview, isChosenTrickleResource, scanOutpostMult, type OutpostAuraTileFacts } from "@border-empires/shared";
import { resolveFrontierCombatMultipliers } from "@border-empires/game-domain";
import { ClientMessageSchema } from "@border-empires/shared";

import { preSerializeBroadcast, sendJsonToSocket, unwrapPayloadSource } from "../broadcast-payload/broadcast-payload.js";
import { createGatewayStringifier } from "../gateway-stringifier/gateway-stringifier.js";
import { createSlowLoginAlerter } from "../slow-login-alert/slow-login-alert.js";
import { createSlackAlerter, type SlackAlerter } from "../slack-alerts/slack-alerts.js";
import { resolveGatewayAuthIdentity } from "../auth-identity/auth-identity.js";
import { reconcileGatewayAuthBinding, type ResolvedGatewayAuthBinding } from "../gateway-auth-binding-resolution/gateway-auth-binding-resolution.js";
import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import { createGatewayAuthBindingStore } from "../auth-binding-store-factory.js";
import type { GatewayCommandStore } from "../command-store/command-store.js";
import { createGatewayCommandStore } from "../command-store-factory/command-store-factory.js";
import {
  createEmailAlertService,
  readAttackAlert,
  readIncomingAllianceRequestAlert,
  readIncomingTruceRequestAlert,
  type EmailAlertConfig,
  type EmailAlertOutcome
} from "../email-alerts/email-alerts.js";
import { submitDurableCommand, submitFrontierCommand, type GatewaySocketSession } from "../frontier-submit/frontier-submit.js";
import { registerGatewayHttpRoutes } from "../http-routes/http-routes.js";
import { createGatewayMetrics } from "../metrics/metrics.js";
import { normalizeHex, isTaken, suggestAlternative, pickSuggestedPalette, assignUniqueColor, RESERVED_COLORS } from "../player-color-allocation/player-color-allocation.js";
import { createPlayerSubscriptions } from "../player-subscriptions/player-subscriptions.js";
import { createPlayerProfileOverrides } from "../player-profile-overrides.js";
import type { GatewayPlayerProfileStore, StoredPlayerProfile } from "../player-profile-store/player-profile-store.js";
import { createGatewayPlayerProfileStore } from "../player-profile-store-factory/player-profile-store-factory.js";
import { reserveRallyLinkForAuth } from "../rally-link-auth.js";
import { rallyAnchorFromTiles } from "../rally-link-anchor.js";
import { createGatewayRallyLinkStore } from "../rally-link-store-factory.js";
import type { RallyAnchor } from "../rally-link-store/rally-link-store.js";
import type { GalaxyPlanetStore } from "../galaxy-planet-store/galaxy-planet-store.js";
import { createGalaxyPlanetStore } from "../galaxy-planet-store-factory/galaxy-planet-store-factory.js";
import { buildGatewayHttpRoutesDeps } from "./build-http-routes-deps.js";
import { TimeoutError, withTimeout } from "../promise-timeout.js";
import {
  createSimSubmitHealthState,
  recordSubmitSuccess,
  shouldMarkUnavailableOnSubmitError
} from "./sim-submit-health.js";
import { retryStartup } from "../startup-retry.js";
import { resolveInitialState } from "../initial-state/initial-state.js";
import { createFullVisibilityReplacementPayloadCache } from "../full-visibility-replacement-payload-cache/full-visibility-replacement-payload-cache.js";
import { createRevealMapChunkCache, type RevealMapPayloadSet } from "../reveal-map-chunk-cache/reveal-map-chunk-cache.js";
import { buildInitMessage } from "../reconnect-recovery/reconnect-recovery.js";
import { type SimulationSeedProfile } from "../seed-fallback.js";
import { createSimulationClient, type SimulationClientEvent } from "../sim-client/sim-client.js";
import { selectSocketsForEvent, selectSocketsForTileDeltaBatchByPlayer } from "../socket-routing/socket-routing.js";
import { createSocialState, type SocialStateSink, type SocialTruceRequest } from "../social-state/social-state.js";
import { createGatewaySocialStore } from "../social-store-factory.js";
import { applyPlayerMessageToSnapshot, applyTileDeltasToSnapshot } from "../subscription-snapshot-sync/subscription-snapshot-sync.js";
import { supportedClientMessageTypes } from "../supported-client-messages/supported-client-messages.js";
import { createRequestTracer } from "../request-tracer.js";
import { buildPendingInputToStateEvents, sweepStalePendingInputToState } from "../pending-input-to-state-events.js";
import { buildSnapshotTileDetail } from "../tile-detail-snapshot/tile-detail-snapshot.js";
import { pushAuthoritativeTileDetail } from "../tile-detail-push/tile-detail-push.js";
import { selfHealTargetFromRejection } from "../tile-detail-self-heal/tile-detail-self-heal.js";
import { hydrateVisibleLiveProfileOverrides, recoverLivePlayerMessage } from "../live-world-status-recovery.js";
import {
  hydrateCurrentSeasonSummaryDisplayNames,
  hydrateSeasonArchiveDisplayNames
} from "../hq-summary-hydration/hq-summary-hydration.js";
import { loadLegacySnapshotBootstrap } from "../../../simulation/src/legacy-snapshot-bootstrap/legacy-snapshot-bootstrap.js";
import { isFrontierAdjacent } from "../../../simulation/src/frontier-adjacency/frontier-adjacency.js";
import { createSeedPlayers, createSeedWorld } from "../../../simulation/src/seed-state/seed-state.js";
import { seasonalPlayerNameForId } from "../../../simulation/src/season-worldgen/season-worldgen.js";
import { jsonByteSize, measurePlayerSubscriptionSnapshot, summarizePlayerSubscriptionSnapshotCache, type CommandEnvelope, type PlayerSubscriptionDock, type PlayerSubscriptionSnapshot, type PlayerSubscriptionSnapshotCacheSummary } from "@border-empires/sim-protocol";

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
  galaxyPlanetStore?: GalaxyPlanetStore;
  socialStore?: import("../social-store/social-store.js").GatewaySocialStore;
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
  // URL for the simulation's loopback metrics server in the combined
  // deployment (e.g. "http://127.0.0.1:50052/metrics"). When present, the
  // gateway proxies it at /admin/runtime/metrics so it's externally reachable.
  simMetricsUrl?: string;
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
    snapshot.tiles.map((tile: PlayerSubscriptionSnapshot["tiles"][number]) => [`${tile.x},${tile.y}`, tile] as const)
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
    ...(typeof tile.frontierDecayAt === "number" ? { frontierDecayAt: tile.frontierDecayAt } : {}),
    ...(tile.frontierDecayKind ? { frontierDecayKind: tile.frontierDecayKind } : {}),
    ...(typeof tile.breachShockUntil === "number" ? { breachShockUntil: tile.breachShockUntil } : {}),
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
    ...("frontierDecayAt" in tileDelta && tileDelta.frontierDecayAt === undefined ? { frontierDecayAt: null } : {}),
    ...("frontierDecayKind" in tileDelta && tileDelta.frontierDecayKind === undefined ? { frontierDecayKind: null } : {}),
    ...("breachShockUntil" in tileDelta && tileDelta.breachShockUntil === undefined ? { breachShockUntil: null } : {}),
    ...("fortJson" in tileDelta && tileDelta.fortJson === undefined ? { fortJson: "" } : {}),
    ...("observatoryJson" in tileDelta && tileDelta.observatoryJson === undefined ? { observatoryJson: "" } : {}),
    ...("siegeOutpostJson" in tileDelta && tileDelta.siegeOutpostJson === undefined ? { siegeOutpostJson: "" } : {}),
    ...("economicStructureJson" in tileDelta && tileDelta.economicStructureJson === undefined
      ? { economicStructureJson: "" }
      : {}),
    ...("sabotageJson" in tileDelta && tileDelta.sabotageJson === undefined ? { sabotageJson: "" } : {}),
    ...("shardSiteJson" in tileDelta && tileDelta.shardSiteJson === undefined ? { shardSiteJson: "" } : {}),
    ...("musterJson" in tileDelta && tileDelta.musterJson === undefined ? { musterJson: "" } : {}),
    ...("ownershipClearOnly" in tileDelta && tileDelta.ownershipClearOnly ? { ownershipClearOnly: true } : {})
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

const previewDockLink = (fromX: number, fromY: number, toX: number, toY: number, docks: PlayerSubscriptionDock[] | undefined): boolean => {
  if (!docks) return false;
  const dockById = new Map(docks.map((d) => [d.dockId, d] as const));
  const dockByTileKey = new Map(docks.map((d) => [d.tileKey, d] as const));
  const fromDock = dockByTileKey.get(`${fromX},${fromY}`);
  if (!fromDock) return false;
  const linkedDockIds = fromDock.connectedDockIds?.length ? fromDock.connectedDockIds : fromDock.pairedDockId ? [fromDock.pairedDockId] : [];
  const toKey = `${toX},${toY}`;
  return linkedDockIds.some((linkedId) => {
    const linked = dockById.get(linkedId);
    return linked?.tileKey === toKey;
  });
};

const attackPreviewResult = (
  playerId: string,
  tiles: PreviewTile[] | undefined,
  docks: PlayerSubscriptionDock[] | undefined,
  message: { fromX: number; fromY: number; toX: number; toY: number; requestId?: string | undefined },
  attackerTechIds?: readonly string[],
  attackerDomainIds?: readonly string[],
  getPlayerTechDomainIds?: (playerId: string) => { techIds: readonly string[]; domainIds: readonly string[] } | undefined
): Record<string, unknown> => {
  const from = { x: message.fromX, y: message.fromY };
  const to = { x: message.toX, y: message.toY };
  const responseBase = { type: "ATTACK_PREVIEW_RESULT", from, to, ...(message.requestId ? { requestId: message.requestId } : {}) };
  if (!tiles) {
    return { ...responseBase, valid: false, reason: "preview unavailable" };
  }
  const tileMap = buildPreviewTileMap(tiles);
  const origin = tileMap.get(previewTileKey(from.x, from.y));
  const target = tileMap.get(previewTileKey(to.x, to.y));
  if (!origin || origin.ownerId !== playerId) {
    return { ...responseBase, valid: false, reason: "origin not owned" };
  }
  if (!target) {
    return { ...responseBase, valid: false, reason: "target not visible" };
  }
  if (!target.ownerId || target.ownerId === playerId) {
    return { ...responseBase, valid: false, reason: "target not hostile" };
  }
  if (!isFrontierAdjacent(from.x, from.y, to.x, to.y) && !previewDockLink(from.x, from.y, to.x, to.y, docks)) {
    return { ...responseBase, valid: false, reason: "target not adjacent" };
  }
  const attackerOutpostMult = scanOutpostMult(playerId, to.x, to.y, (x: number, y: number) => tileMap.get(previewTileKey(x, y)));
  const defenderPlayerData = target.ownerId && getPlayerTechDomainIds ? getPlayerTechDomainIds(target.ownerId) : undefined;
  const techModifiers = attackerTechIds
    ? resolveFrontierCombatMultipliers(
        attackerTechIds,
        attackerDomainIds,
        defenderPlayerData?.techIds,
        defenderPlayerData?.domainIds,
      )
    : undefined;
  const preview = buildFrontierCombatPreview(target, {
    attackerOutpostMult,
    ...(techModifiers ?? {}),
  });
  return {
    ...responseBase,
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
  // Enable WebSocket per-message compression. The bootstrap/full-visibility init
  // payload is ~13MB of tile JSON (202,500 tiles) and highly repetitive (terrain /
  // ownership strings, coordinates) — it compresses ~10x on the wire, so this is
  // the dominant lever for login latency to remote clients (uncompressed 13MB is
  // a multi-second download regardless of how fast the server builds it).
  // Compression runs on the libuv threadpool via zlib, so it does NOT block the
  // gateway event loop. {server,client}NoContextTakeover release the per-connection
  // zlib sliding window after each message to bound memory — important because the
  // combined box runs tight on RAM after the full-visibility OOM (see #694).
  // threshold skips compressing small gameplay deltas where it isn't worth it.
  await app.register(websocket, {
    options: {
      perMessageDeflate: {
        threshold: 1024,
        serverNoContextTakeover: true,
        clientNoContextTakeover: true,
        concurrencyLimit: 10,
        zlibDeflateOptions: { level: 6 }
      }
    }
  });
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
  // Forward-declared so recordGatewayEvent can reference it before the initializer runs;
  // assigned after gatewayMetrics is created. Recorded events guard with a null check.
  let slackAlerter: SlackAlerter | undefined;
  const recordGatewayEvent = (level: "info" | "warn" | "error", event: string, payload: Record<string, unknown> = {}): void => {
    recentGatewayEvents.push({ at: Date.now(), level, event, payload });
    if (recentGatewayEvents.length > 250) recentGatewayEvents.splice(0, recentGatewayEvents.length - 250);
    if (event.startsWith("gateway_fog_")) {
      const logger = level === "error" ? app.log.error.bind(app.log) : level === "warn" ? app.log.warn.bind(app.log) : app.log.info.bind(app.log);
      logger({ event, ...payload }, event);
    }
    // Slow-event Slack alert triggers
    if (slackAlerter && event === "QUEUE_PERSIST_FAILED") {
      const cutoff = Date.now() - 60_000;
      const count = recentGatewayEvents.filter(
        e => e.event === "QUEUE_PERSIST_FAILED" && e.at >= cutoff
      ).length;
      if (count >= 3) {
        slackAlerter.alertQueuePersistFailed(count, 60_000);
      }
    }
    if (slackAlerter && event === "simulation_wake_exhausted") {
      slackAlerter.alertSimulationWakeExhausted(
        (payload.attempts as number) ?? 0,
        (payload.wakeTimeoutMs as number) ?? 0
      );
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
  const simSubmitHealth = createSimSubmitHealthState();
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
  slackAlerter = createSlackAlerter({
    ...(process.env.GATEWAY_SLOW_LOGIN_ALERT_SLACK_WEBHOOK
      ? { webhookUrl: process.env.GATEWAY_SLOW_LOGIN_ALERT_SLACK_WEBHOOK }
      : {}),
    metricsSnapshot: () => gatewayMetrics.snapshot(),
    recentEvents: () => recentGatewayEvents,
    log: { error: (payload, message) => app.log.error(payload, message) },
    appLabel: process.env.GATEWAY_SLOW_LOGIN_ALERT_LABEL ?? "border-empires-combined-staging",
    ...(process.env.GATEWAY_BUILD_SHA ? { buildSha: process.env.GATEWAY_BUILD_SHA } : {})
  });
  const slowGatewaySubmitWarnMs = Math.max(100, Number(process.env.GATEWAY_SLOW_SUBMIT_WARN_MS ?? 1_000));
  const slowGatewayRpcWarnMs = Math.max(100, Number(process.env.GATEWAY_SLOW_RPC_WARN_MS ?? 1_000));
  const slowGatewayAuthStepWarnMs = Math.max(0, Number(process.env.GATEWAY_SLOW_AUTH_STEP_WARN_MS ?? 100));
  // Full submit->reply latency the player actually feels (gateway receipt to seeing the result event).
  const slowGatewayInputToStateWarnMs = Math.max(100, Number(process.env.GATEWAY_SLOW_INPUT_TO_STATE_WARN_MS ?? 1_000));
  const gatewayMetricsLogIntervalMs = Math.max(0, Number(process.env.GATEWAY_METRICS_LOG_INTERVAL_MS ?? 0));
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
  let lastGatewayMetricsLogAt = 0;
  const pendingGcDurationsMs: number[] = [];
  const gatewayBootstrapStringifier = createGatewayStringifier();
  const inlineBootstrapStringifyTileLimit = Math.max(
    0,
    Number(process.env.GATEWAY_INLINE_BOOTSTRAP_STRINGIFY_TILE_LIMIT ?? 512)
  );
  // Phase B bootstrap admission control. Caps concurrent full-snapshot
  // bootstraps and throttles per-player re-bootstrap so a reconnect loop
  // cannot stall the event loop. Purely additive — the happy path is unchanged.
  let bootstrapsInFlight = 0;
  const maxConcurrentBootstraps = Math.max(1, Number(process.env.GATEWAY_MAX_CONCURRENT_BOOTSTRAPS ?? 4));
  const minBootstrapIntervalMs = Math.max(0, Number(process.env.GATEWAY_MIN_BOOTSTRAP_INTERVAL_MS ?? 0));
  const lastBootstrapAtByPlayerId = new Map<string, number>();
  // Login queue: instead of rejecting over-concurrency with SERVER_BUSY, hold
  // the socket open and resume when a bootstrap slot becomes free. The client
  // shows a "You are #N in queue" message while waiting.
  const maxLoginQueueSize = Math.max(0, Number(process.env.GATEWAY_MAX_LOGIN_QUEUE_SIZE ?? 50));
  // Estimated time per bootstrap slot (ms) — used to compute wait-time hints.
  const bootstrapEstimateMs = Math.max(1000, Number(process.env.GATEWAY_BOOTSTRAP_ESTIMATE_MS ?? 6000));
  type LoginQueueEntry = { socket: import("ws").WebSocket; resolve: (granted: boolean) => void; enqueuedAt: number };
  const loginQueue: LoginQueueEntry[] = [];
  const drainLoginQueue = (): void => {
    if (loginQueue.length === 0 || bootstrapsInFlight >= maxConcurrentBootstraps) return;
    const next = loginQueue.shift();
    if (!next) return;
    // Notify remaining waiters of their updated positions.
    loginQueue.forEach((entry, i) => {
      try {
        sendJson(entry.socket, {
          type: "LOGIN_QUEUE_PROGRESS",
          position: i + 1,
          estimatedWaitMs: Math.round(((i + 1) * bootstrapEstimateMs) / maxConcurrentBootstraps)
        });
      } catch { /* socket may already be closed */ }
    });
    next.resolve(true);
  };
  const pendingInputToStateByCommandId = new Map<string, number>();
  const recordGatewayAuthStepTiming = (
    step: string,
    durationMs: number,
    payload: Record<string, unknown> = {}
  ): void => {
    if (slowGatewayAuthStepWarnMs <= 0 || durationMs < slowGatewayAuthStepWarnMs) return;
    recordGatewayEvent("warn", "gateway_auth_step_slow", {
      step,
      durationMs,
      ...payload
    });
  };
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
  const buildAttackDebug = () => {
    const recentEvents = [...recentGatewayEvents];
    const pendingEvents = buildPendingInputToStateEvents(pendingInputToStateByCommandId, simulationHealth);
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
    for (const event of [...recentGatewayEvents, ...buildPendingInputToStateEvents(pendingInputToStateByCommandId, simulationHealth)]) {
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
  let allianceBreakFinalizeTimer: ReturnType<typeof setInterval> | undefined;
  const refreshCombinedSimulationHealth = (): void => {
    simulationHealth.connected = simulationRpcConnected && simulationEventStreamConnected;
    if (simulationHealth.connected) {
      simulationHealth.lastReadyAt = Date.now();
      simulationHealth.lastError = undefined;
      simulationConsecutiveHealthFailures = 0;
    }
  };
  const markSimulationReady = (): void => {
    recordSubmitSuccess(simSubmitHealth);
    simulationRpcConnected = true;
    refreshCombinedSimulationHealth();
  };
  // Shared submit-error handler for both submit paths (social sync + player
  // submit). Routes through the tested sim-submit-health helper so a single
  // transient timeout doesn't flip the sim to "unavailable" (which surfaces
  // SERVER_STARTING to clients) — only N consecutive timeouts do, mirroring
  // the ping-failure threshold. Real channel errors flip immediately.
  const handleSubmitError = (error: unknown, ctx: { commandId: string; playerId: string }): void => {
    const decision = shouldMarkUnavailableOnSubmitError(error, simSubmitHealth, {
      threshold: simulationHealthFailureThreshold,
      hasEverBeenReady: typeof simulationHealth.lastReadyAt === "number"
    });
    if (decision.tolerated) {
      gatewayMetrics.incrementSimulationSubmitTimeoutTolerated();
      recordGatewayEvent("warn", "simulation_submit_timeout_tolerated", {
        commandId: ctx.commandId,
        playerId: ctx.playerId,
        consecutiveTimeouts: simSubmitHealth.consecutiveSubmitTimeouts,
        failureThreshold: simulationHealthFailureThreshold
      });
      return;
    }
    if (decision.markUnavailable) {
      if (error instanceof TimeoutError) {
        gatewayMetrics.incrementSimulationSubmitTimeoutFlipped();
        recordGatewayEvent("warn", "simulation_submit_timeout_flipped", {
          commandId: ctx.commandId,
          playerId: ctx.playerId,
          consecutiveTimeouts: simSubmitHealth.consecutiveSubmitTimeouts,
          failureThreshold: simulationHealthFailureThreshold
        });
      }
      markSimulationUnavailable(error);
    }
  };
  const markSimulationUnavailable = (error: unknown): void => {
    simulationRpcConnected = false;
    simulationHealth.connected = false;
    simulationHealth.lastError = error instanceof Error ? error.message : String(error);
  };
  const syncAllianceToSimulation = async (input: { playerId: string; targetPlayerId: string; allied: boolean }): Promise<boolean> => {
    if (!simulationHealth.connected) {
      recordGatewayEvent("warn", "gateway_social_simulation_sync_skipped", {
        playerId: input.playerId,
        targetPlayerId: input.targetPlayerId,
        allied: input.allied,
        simulationLastError: simulationHealth.lastError ?? ""
      });
      return false;
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
      return true;
    } catch (error) {
      handleSubmitError(error, { commandId: command.commandId, playerId: input.playerId });
      recordGatewayEvent("warn", "gateway_social_simulation_sync_failed", {
        commandId: command.commandId,
        playerId: input.playerId,
        targetPlayerId: input.targetPlayerId,
        allied: input.allied,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
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
    ...(options.sqlitePath ? { sqlitePath: options.sqlitePath } : {}),
    ...(typeof options.applySchema === "boolean" ? { applySchema: options.applySchema } : {}),
    onSqliteBusyRetry: () => gatewayMetrics.incrementGatewaySqliteRetryTotal()
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
  const galaxyPlanetStore =
    options.galaxyPlanetStore ??
    (await createGalaxyPlanetStore(commandStoreFactoryOptions));
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
    snapshot.tiles.forEach((tile: PlayerSubscriptionSnapshot["tiles"][number], idx: number) => tileIndex.set(`${tile.x},${tile.y}`, idx));
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

  // -- Phase 6: AI empire color seeding -----------------------------------
  // Assign each AI a unique colour from BASE_PALETTE and register it in
  // profileOverrides so the taken-set sees it immediately.
  const aiTaken = new Set<string>(RESERVED_COLORS);
  for (const aiId of [...seededAiPlayerIds].sort()) {
    const color = assignUniqueColor(aiId, aiTaken);
    aiTaken.add(color);
    await profileStore.setTileColor(aiId, color);
    profileOverrides.upsert(aiId, { tileColor: color });
  }

  // -- Phase 4: buildTakenColorSet helper ----------------------------------
  const buildTakenColorSet = async (excludePlayerId: string): Promise<Set<string>> => {
    const taken = new Set<string>(RESERVED_COLORS);
    // 1. stored profiles
    for (const profile of await profileStore.listAllNamed()) {
      if (profile.playerId === excludePlayerId) continue;
      const n = normalizeHex(profile.tileColor ?? "");
      if (n) taken.add(n);
    }
    // 2. live overrides (supersede stored for active sessions)
    for (const [pid, override] of profileOverrides.entries()) {
      if (pid === excludePlayerId) continue;
      const n = normalizeHex(override.tileColor ?? "");
      if (n) taken.add(n);
    }
    return taken;
  };

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
  for (const profile of await profileStore.listAllNamed()) {
    if (profile.name && !initialSocialPlayerNamesById.has(profile.playerId)) {
      initialSocialPlayerNamesById.set(profile.playerId, profile.name);
    }
  }
  const initialSocialPlayers = [...initialSocialPlayerNamesById].map(([id, name]) => ({ id, name }));
  const socialStore =
    options.socialStore ?? (await createGatewaySocialStore(commandStoreFactoryOptions));
  const persistedSocialSnapshot = socialStore.loadSnapshot();
  if (options.now) socialStore.pruneExpired(options.now());
  else socialStore.pruneExpired(Date.now());
  const socialStateSink: SocialStateSink = {
    upsertPlayer: (playerId, name) => socialStore.upsertPlayer(playerId, name),
    saveAllianceRequest: (request) => socialStore.saveAllianceRequest(request),
    deleteAllianceRequest: (requestId) => socialStore.deleteAllianceRequest(requestId),
    saveTruceRequest: (request) => socialStore.saveTruceRequest(request),
    deleteTruceRequest: (requestId) => socialStore.deleteTruceRequest(requestId),
    addAlliance: (playerAId, playerBId, createdAt) => socialStore.addAlliance(playerAId, playerBId, createdAt),
    removeAlliance: (playerAId, playerBId) => socialStore.removeAlliance(playerAId, playerBId),
    saveAllianceBreak: (notice) => socialStore.saveAllianceBreak(notice),
    removeAllianceBreak: (playerAId, playerBId) => socialStore.removeAllianceBreak(playerAId, playerBId),
    saveCompletedAllianceBreak: (notice) => socialStore.saveCompletedAllianceBreak(notice),
    removeCompletedAllianceBreak: (playerAId, playerBId) => socialStore.removeCompletedAllianceBreak(playerAId, playerBId),
    saveActiveTruce: (truce) => socialStore.saveActiveTruce(truce),
    removeActiveTruce: (playerAId, playerBId) => socialStore.removeActiveTruce(playerAId, playerBId),
    pruneExpired: (now) => socialStore.pruneExpired(now)
  };
  const socialState = createSocialState({
    ...(options.now ? { now: options.now } : {}),
    players: initialSocialPlayers,
    initial: persistedSocialSnapshot,
    sink: socialStateSink
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
  const revealMapChunkCache = createRevealMapChunkCache({
    jsonSafeTileDeltaBatch
  });
  let revealMapPayloadBuild: Promise<RevealMapPayloadSet> | undefined;
  // Bound how much reveal-map traffic the gateway can stream at once. A reveal wave from many
  // players otherwise produces N parallel chunk streams that all share the event loop with
  // gameplay messages; the cap keeps that fanout predictable.
  const MAX_CONCURRENT_REVEAL_STREAMS = 24;
  const REVEAL_REQUEST_COOLDOWN_MS = 5_000;
  const activeRevealStreamSockets = new Set<import("ws").WebSocket>();
  const lastRevealRequestMsByPlayerId = new Map<string, number>();
  // Fog-disabled sessions need a full-world snapshot resubscribe whenever the
  // world changes, but doing that synchronously inside the per-batch event
  // handler blocks the gateway loop for hundreds of ms × N batches per second
  // (login bootstrap_subscribe got starved for 45s+ in prod on 2026-05-23).
  // Coalesce per-player refreshes: only one in-flight refresh per player, and
  // record a "dirty" bit so the next refresh starts as soon as the previous one
  // resolves if more deltas arrived in the meantime.
  const FOG_LIVE_REFRESH_MIN_INTERVAL_MS = 1_000;
  const fogLiveRefreshInflightByPlayerId = new Map<string, Promise<void>>();
  const fogLiveRefreshPendingByPlayerId = new Map<string, { commandId: string }>();
  const fogLiveRefreshLastStartedAtByPlayerId = new Map<string, number>();
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
        messageType !== "AETHER_LANCE" &&
        messageType !== "CAST_AETHER_BRIDGE" &&
        messageType !== "CAST_AETHER_WALL" &&
        messageType !== "SIPHON_TILE" &&
        messageType !== "PURGE_SIPHON" &&
        messageType !== "CREATE_MOUNTAIN" &&
        messageType !== "REMOVE_MOUNTAIN" &&
        messageType !== "AIRPORT_BOMBARD" &&
        messageType !== "IMPERIAL_EXCHANGE_LEVY" &&
        messageType !== "WORLD_ENGINE_STRIKE" &&
        messageType !== "UPGRADE_TOWN_TIER" &&
        messageType !== "COLLECT_SHARD" &&
        messageType !== "SET_MUSTER" &&
        messageType !== "CLEAR_MUSTER" &&
        messageType !== "WATCH_MUSTER" &&
        messageType !== "UNWATCH_MUSTER"
    )
  );

  registerGatewayHttpRoutes(
    app,
    buildGatewayHttpRoutesDeps({
      startupStartedAt,
      ...(options.simulationAddress ? { simulationAddress: options.simulationAddress } : {}),
      simulationSeedProfile,
      simulationHealth,
      ...(options.snapshotDir ? { snapshotDir: options.snapshotDir } : {}),
      ...(legacySnapshotBootstrap ? { legacySnapshotBootstrap } : {}),
      recentGatewayEvents,
      buildAttackDebug,
      buildAttackTraces,
      gatewayMetrics,
      ...(options.simMetricsUrl ? { simMetricsUrl: options.simMetricsUrl } : {}),
      simulationClient,
      profileStore,
      ...(options.playOrigin ? { playOrigin: options.playOrigin } : {}),
      resolveHttpBearerIdentity,
      rallyLinkStore,
      galaxyPlanetStore,
      authBindingStore,
      ...(options.adminApiToken ? { adminApiToken: options.adminApiToken } : {})
    })
  );

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

  let allianceBreakFinalizerRunning = false;
  const finalizeExpiredAllianceBreaks = async (): Promise<void> => {
    if (allianceBreakFinalizerRunning) return;
    allianceBreakFinalizerRunning = true;
    try {
      const expiredBreaks = socialState.expiredAllianceBreaks();
      if (expiredBreaks.length === 0) return;
      const syncedPairs: Array<[string, string]> = [];
      for (const notice of expiredBreaks) {
        const [playerId, targetPlayerId] = notice.playerIds;
        if (await syncAllianceToSimulation({ playerId, targetPlayerId, allied: false })) {
          syncedPairs.push([playerId, targetPlayerId]);
        }
      }
      if (syncedPairs.length === 0) return;
      const result = socialState.finalizeExpiredAllianceBreaks(syncedPairs);
      if (result.expiredBreaks.length === 0) return;
      fanoutPlayerPayloads(result.payloadsByPlayerId);
    } finally {
      allianceBreakFinalizerRunning = false;
    }
  };

  const maybeAutoRespondToSeededAiTruce = async (request: SocialTruceRequest | undefined): Promise<void> => {
    if (!request || !seededAiPlayerIds.has(request.toPlayerId)) return;
    const decisionSnapshot = playerSubscriptions.snapshotForPlayer(request.fromPlayerId);
    const targetDecisionSnapshot = playerSubscriptions.snapshotForPlayer(request.toPlayerId);
    const economyStrained = seededAiEconomyStrained(targetDecisionSnapshot?.player ?? seedPlayers.get(request.toPlayerId));
    const seedDecisionSnapshot = playerSubscriptionSnapshotFromSeedWorld(seedWorld, request.fromPlayerId);
    const liveSnapshotHasTargetTiles = Boolean(decisionSnapshot?.tiles.some((tile: PlayerSubscriptionSnapshot["tiles"][number]) => tile.ownerId === request.toPlayerId));
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

  const scheduleFogLiveRefresh = (playerId: string, commandId: string): void => {
    // Always record the latest commandId so the next refresh annotates with
    // the most recent trigger rather than the stale one.
    fogLiveRefreshPendingByPlayerId.set(playerId, { commandId });
    if (fogLiveRefreshInflightByPlayerId.has(playerId)) return;
    const runRefresh = async (): Promise<void> => {
      try {
        while (fogLiveRefreshPendingByPlayerId.has(playerId)) {
          const pending = fogLiveRefreshPendingByPlayerId.get(playerId)!;
          fogLiveRefreshPendingByPlayerId.delete(playerId);
          const lastStartedAt = fogLiveRefreshLastStartedAtByPlayerId.get(playerId) ?? 0;
          const sinceLast = Date.now() - lastStartedAt;
          if (sinceLast < FOG_LIVE_REFRESH_MIN_INTERVAL_MS) {
            await sleep(FOG_LIVE_REFRESH_MIN_INTERVAL_MS - sinceLast);
          }
          // Only fire if the player still has at least one fog-disabled socket.
          const stillFogDisabled = [...playerSubscriptions.socketsForPlayer(playerId)].some(
            (playerSocket) => sessionsBySocket.get(playerSocket)?.fogDisabled === true
          );
          if (!stillFogDisabled) continue;
          fogLiveRefreshLastStartedAtByPlayerId.set(playerId, Date.now());
          try {
            await refreshPlayerFogSnapshot(playerId, true, {
              reason: "live-delta-coalesced",
              commandId: pending.commandId
            });
          } catch (error) {
            recordGatewayEvent("warn", "gateway_fog_refresh_skip_failed", {
              playerId,
              commandId: pending.commandId,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      } finally {
        fogLiveRefreshInflightByPlayerId.delete(playerId);
      }
    };
    fogLiveRefreshInflightByPlayerId.set(playerId, runRefresh());
  };

  const revealMapPayloadSet = async (playerId: string): Promise<RevealMapPayloadSet> => {
    const cachedPayloadSet = revealMapChunkCache.current();
    if (cachedPayloadSet) return cachedPayloadSet;
    if (!revealMapPayloadBuild) {
      const buildStartedAt = Date.now();
      revealMapPayloadBuild = (async () => {
        const snapshot = await withTimeout(
          simulationClient.subscribePlayer(
            playerId,
            JSON.stringify({
              mode: "bootstrap-only",
              fullVisibility: true,
              emitBootstrapEvent: false,
              trigger: "gateway_reveal_map"
            })
          ),
          simulationSubscribeTimeoutMs,
          "gateway reveal map snapshot"
        );
        const payloadSet = revealMapChunkCache.getOrCreate(snapshot);
        const buildDurationMs = Date.now() - buildStartedAt;
        gatewayMetrics.observeRevealSnapshotBuildMs(buildDurationMs);
        gatewayMetrics.observeRevealSnapshotBytes(payloadSet.payloadJsonBytes);
        gatewayMetrics.setRevealCacheEntries(1);
        recordGatewayEvent("info", "gateway_reveal_map_snapshot_ready", {
          playerId,
          snapshotId: payloadSet.snapshotId,
          totalTiles: payloadSet.totalTiles,
          chunkCount: payloadSet.chunks.length,
          payloadJsonBytes: payloadSet.payloadJsonBytes,
          buildDurationMs
        });
        return payloadSet;
      })().finally(() => {
        revealMapPayloadBuild = undefined;
      });
    }
    return revealMapPayloadBuild;
  };

  const streamRevealMapToSocket = async (socket: import("ws").WebSocket, playerId: string): Promise<void> => {
    activeRevealStreamSockets.add(socket);
    gatewayMetrics.setRevealActiveStreams(activeRevealStreamSockets.size);
    try {
      const payloadSet = await revealMapPayloadSet(playerId);
      recordGatewayEvent("info", "gateway_reveal_map_stream_started", {
        playerId,
        snapshotId: payloadSet.snapshotId,
        totalTiles: payloadSet.totalTiles,
        chunkCount: payloadSet.chunks.length,
        payloadJsonBytes: payloadSet.payloadJsonBytes,
        activeStreams: activeRevealStreamSockets.size
      });
      queueOrSendSessionPayload(socket, payloadSet.begin);
      for (let chunkIndex = 0; chunkIndex < payloadSet.chunks.length; chunkIndex += 1) {
        while (socket.bufferedAmount > 2_000_000 && socket.readyState === socket.OPEN) {
          await sleep(10);
        }
        if (socket.readyState !== socket.OPEN) return;
        queueOrSendSessionPayload(socket, payloadSet.chunks[chunkIndex]);
        gatewayMetrics.incrementRevealChunksSent(1);
        if (chunkIndex % 4 === 3) await sleep(0);
      }
      if (socket.readyState !== socket.OPEN) return;
      queueOrSendSessionPayload(socket, payloadSet.end);
      recordGatewayEvent("info", "gateway_reveal_map_stream_completed", {
        playerId,
        snapshotId: payloadSet.snapshotId,
        totalTiles: payloadSet.totalTiles,
        chunkCount: payloadSet.chunks.length
      });
    } finally {
      activeRevealStreamSockets.delete(socket);
      gatewayMetrics.setRevealActiveStreams(activeRevealStreamSockets.size);
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
        const inputToStateDurationMs = Date.now() - submittedAt;
        gatewayMetrics.observeGatewayInputToStateUpdateLatencyMs(inputToStateDurationMs);
        pendingInputToStateByCommandId.delete(event.commandId);
        if (inputToStateDurationMs >= slowGatewayInputToStateWarnMs) {
          recordGatewayEvent("warn", "gateway_input_to_state_slow", {
            commandId: event.commandId,
            playerId: event.playerId,
            eventType: event.eventType,
            durationMs: inputToStateDurationMs,
            simulationConnected: simulationHealth.connected,
            simulationLastError: simulationHealth.lastError ?? ""
          });
        }
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
      if (event.playerId === "__broadcast__" && event.eventType === "TILE_DELTA_BATCH") {
        const broadcastPayload = preSerializeBroadcast({
          type: "TILE_DELTA_BATCH",
          commandId: event.commandId,
          tiles: jsonSafeTileDeltaBatch(event.tileDeltas)
        });
        for (const socket of playerSubscriptions.allSockets()) queueOrSendSessionPayload(socket, broadcastPayload);
        return;
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
        revealMapChunkCache.clear();
        gatewayMetrics.setRevealCacheEntries(0);
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
            socketCount: playerSockets.size,
            coalesced: true
          });
          // Do NOT await — a full-world resubscribe inside the per-batch handler
          // blocks the gateway event loop and starves bootstrap_subscribe /
          // live_subscribe for incoming logins. The fog admin's view will lag
          // by at most FOG_LIVE_REFRESH_MIN_INTERVAL_MS.
          scheduleFogLiveRefresh(playerId, event.commandId);
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
          // Self-heal: ATTACK_TARGET_INVALID / EXPAND_TARGET_OWNED rejections
          // mean the client's ownership belief about the target tile was
          // stale. Recover the target coords from the stored command and
          // proactively push a fresh authoritative tile detail so the user
          // doesn't have to manually re-press the tile to clear it (see
          // tile-detail-self-heal.ts for the exact code allowlist). Never let
          // a failure here interfere with the rejection flow above.
          void (async () => {
            try {
              const storedCommand = await commandStore.get(event.commandId);
              if (!storedCommand) return;
              const healTarget = selfHealTargetFromRejection(event.code, storedCommand.payloadJson);
              if (!healTarget) return;
              const healSession = sessionsBySocket.get(socket);
              gatewayMetrics.incrementTileDetailSelfHealTotal();
              recordGatewayEvent("info", "gateway_tile_detail_self_heal", {
                playerId: event.playerId,
                code: event.code,
                x: healTarget.x,
                y: healTarget.y
              });
              pushAuthoritativeTileDetail({
                socket,
                playerId: event.playerId,
                x: healTarget.x,
                y: healTarget.y,
                fogDisabled: healSession?.fogDisabled === true,
                snapshotForPlayer: (id) => playerSubscriptions.snapshotForPlayer(id),
                fetchTileDetailFromSim,
                simulationConnected: simulationHealth.connected,
                sendJson,
                recordGatewayEvent,
                sendErrorsOnMiss: false
              });
            } catch (error) {
              recordGatewayEvent("warn", "gateway_tile_detail_self_heal_failed", {
                playerId: event.playerId,
                commandId: event.commandId,
                code: event.code,
                error: error instanceof Error ? error.message : String(error)
              });
            }
          })();
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
  void finalizeExpiredAllianceBreaks();
  allianceBreakFinalizeTimer = setInterval(() => void finalizeExpiredAllianceBreaks(), 60_000);
  if (typeof allianceBreakFinalizeTimer.unref === "function") allianceBreakFinalizeTimer.unref();

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
    sweepStalePendingInputToState(pendingInputToStateByCommandId, Date.now() - 120_000);
    refreshGatewaySnapshotCacheMetrics();
    const now = Date.now();
    if (gatewayMetricsLogIntervalMs > 0 && now - lastGatewayMetricsLogAt >= gatewayMetricsLogIntervalMs) {
      lastGatewayMetricsLogAt = now;
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
    }
  }, 1_000);

  // Slow-event Slack alert latency poll (every 30s)
  let slackAlertLatencyTimer: ReturnType<typeof setInterval> | undefined;
  let slackAlertMachineRestartFired = false;
  slackAlertLatencyTimer = setInterval(() => {
    if (!slackAlerter) return;
    const snapshot = gatewayMetrics.snapshot();
    // Machine restart detection — fire once on first poll if uptime < 2 min
    if (!slackAlertMachineRestartFired) {
      slackAlertMachineRestartFired = true;
      const uptimeMs = Date.now() - startupStartedAt;
      if (uptimeMs < 120_000) {
        slackAlerter.alertMachineRestart(uptimeMs);
      }
    }
    // Command submit latency p99 check
    const submitP99 = snapshot.gatewayCommandSubmitLatencyMs.p99;
    if (submitP99 > 2500) {
      slackAlerter.alertCommandSubmitLatencyHigh(submitP99);
    }
  }, 30_000);

  app.addHook("onClose", async () => {
    if (simulationHealthTimer) clearInterval(simulationHealthTimer);
    if (allianceBreakFinalizeTimer) clearInterval(allianceBreakFinalizeTimer);
    if (gatewayMetricsTimer) clearInterval(gatewayMetricsTimer);
    if (gatewayEventLoopTimer) clearInterval(gatewayEventLoopTimer);
    if (slackAlertLatencyTimer) clearInterval(slackAlertLatencyTimer);
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
        let messageType: string | undefined;
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
          messageType = message.type;
          if (message.type === "AUTH") {
            recordGatewayEvent("info", "gateway_auth", { channel });
            const loginCorrelationId = crypto.randomUUID();
            const authTrace = slowLoginAlerter.begin(channel, loginCorrelationId);
            const loginTracer = createRequestTracer({
              kind: "login",
              correlationId: loginCorrelationId,
              extra: { channel }
            });
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
            loginTracer.stage("auth_identity_resolved", { playerId: playerIdentity.playerId });
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
            // Always start a new auth with fog ON. Fog admins must explicitly
            // re-toggle SET_FOG_DISABLED each login; the client also clears its
            // persisted reveal preference on Firebase sign-in so it does not
            // auto-resend the toggle.
            session.fogDisabled = false;
            loginTracer.stage("profile_get_start");
            authTrace.startStep("profile_get");
            const persistedProfile = await cachedProfileGet(playerIdentity.playerId);
            authTrace.endStep("profile_get");
            loginTracer.stage("profile_get_end");
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
            loginTracer.stage("prepare_player_start");
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
              loginTracer.stage("prepare_player_end", { spawned: prepareResult.spawned });
            } catch (error) {
              loginTracer.stage("prepare_player_failed", { error: error instanceof Error ? error.message : String(error) });
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
            const bootstrapNowMs = Date.now();
            const lastBootstrapAtMs = lastBootstrapAtByPlayerId.get(playerIdentity.playerId) ?? 0;
            const overConcurrency = bootstrapsInFlight >= maxConcurrentBootstraps;
            const overRate = bootstrapNowMs - lastBootstrapAtMs < minBootstrapIntervalMs;
            if (overRate) {
              recordGatewayEvent("warn", "gateway_bootstrap_admission_rejected", {
                playerId: playerIdentity.playerId,
                channel,
                reason: "rate",
                bootstrapsInFlight,
                maxConcurrentBootstraps
              });
              sendJson(socket, {
                type: "ERROR",
                code: "SERVER_BUSY",
                retryAfterMs: 4000 + Math.floor(Math.random() * 4000),
                message: "Server is busy. Retry shortly."
              });
              authTrace.complete("rejected", "bootstrap_admission");
              return;
            }
            if (overConcurrency) {
              if (loginQueue.length >= maxLoginQueueSize) {
                gatewayMetrics.incrementLoginQueueRejectedTotal();
                recordGatewayEvent("warn", "gateway_bootstrap_admission_rejected", {
                  playerId: playerIdentity.playerId,
                  channel,
                  reason: "queue_full",
                  bootstrapsInFlight,
                  maxConcurrentBootstraps,
                  queueDepth: loginQueue.length
                });
                sendJson(socket, {
                  type: "ERROR",
                  code: "SERVER_BUSY",
                  retryAfterMs: 4000 + Math.floor(Math.random() * 4000),
                  message: "Server is busy. Retry shortly."
                });
                authTrace.complete("rejected", "bootstrap_admission");
                return;
              }
              gatewayMetrics.incrementLoginQueuedTotal();
              const queuePosition = bootstrapsInFlight + loginQueue.length + 1;
              const estimatedWaitMs = Math.round((loginQueue.length + 1) * bootstrapEstimateMs / maxConcurrentBootstraps);
              recordGatewayEvent("info", "gateway_bootstrap_queued", {
                playerId: playerIdentity.playerId,
                channel,
                position: queuePosition,
                queueDepth: loginQueue.length
              });
              sendJson(socket, { type: "LOGIN_QUEUED", position: queuePosition, estimatedWaitMs });
              authTrace.startStep("login_queue_wait");
              const granted = await new Promise<boolean>((resolve) => {
                const entry: LoginQueueEntry = { socket, resolve, enqueuedAt: Date.now() };
                loginQueue.push(entry);
                socket.once("close", () => {
                  const idx = loginQueue.indexOf(entry);
                  if (idx !== -1) {
                    loginQueue.splice(idx, 1);
                    // Notify remaining waiters their position improved.
                    loginQueue.forEach((e, i) => {
                      try {
                        sendJson(e.socket, {
                          type: "LOGIN_QUEUE_PROGRESS",
                          position: i + 1,
                          estimatedWaitMs: Math.round(((i + 1) * bootstrapEstimateMs) / maxConcurrentBootstraps)
                        });
                      } catch { /* socket may already be closed */ }
                    });
                  }
                  resolve(false);
                });
              });
              authTrace.endStep("login_queue_wait", granted);
              if (!granted) {
                authTrace.complete("rejected", "queue_socket_closed");
                return;
              }
            }
            if (lastBootstrapAtByPlayerId.size > 5000) lastBootstrapAtByPlayerId.clear();
            lastBootstrapAtByPlayerId.set(playerIdentity.playerId, bootstrapNowMs);
            bootstrapsInFlight += 1;
            let bootstrapInitialState;
            loginTracer.stage("bootstrap_subscribe_start");
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
              loginTracer.stage("bootstrap_subscribe_end", { tileCount: bootstrapInitialState?.tiles.length ?? 0 });
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
            } finally {
              bootstrapsInFlight -= 1;
              drainLoginQueue();
            }
            playerSubscriptions.attachSocket(playerIdentity.playerId, socket);
            if (bootstrapInitialState) {
              const seedSnapshotStartedAt = Date.now();
              playerSubscriptions.seedSnapshot(playerIdentity.playerId, bootstrapInitialState);
              recordGatewayAuthStepTiming("seed_snapshot", Date.now() - seedSnapshotStartedAt, {
                playerId: playerIdentity.playerId,
                channel,
                tileCount: bootstrapInitialState.tiles.length
              });
              const gatewaySnapshotDiagnosticsStartedAt = Date.now();
              recordGatewaySnapshotDiagnostics(playerIdentity.playerId, bootstrapInitialState, {
                trigger: "gateway_auth_bootstrap",
                fullVisibility: false,
                socketCount: 1,
                payloadJsonBytes: 0
              });
              recordGatewayAuthStepTiming("gateway_snapshot_diagnostics", Date.now() - gatewaySnapshotDiagnosticsStartedAt, {
                playerId: playerIdentity.playerId,
                channel,
                tileCount: bootstrapInitialState.tiles.length
              });
            }
            loginTracer.stage("live_subscribe_start");
            authTrace.startStep("live_subscribe");
            const loginProgressStartedAt = Date.now();
            const loginProgressInterval = setInterval(() => {
              if (socket.readyState !== socket.OPEN) return;
              const elapsedMs = Date.now() - loginProgressStartedAt;
              const { title, detail } = elapsedMs < 3_000
                ? { title: "Syncing empire...", detail: "Connecting your empire to the simulation." }
                : elapsedMs < 8_000
                  ? { title: "Syncing empire...", detail: "Exporting your territory — almost there." }
                  : elapsedMs < 20_000
                    ? { title: "Syncing empire...", detail: `Building snapshot for a large empire (${Math.round(elapsedMs / 1000)}s)…` }
                    : { title: "Syncing empire...", detail: `Large empire detected — hang on (${Math.round(elapsedMs / 1000)}s)…` };
              sendJson(socket, { type: "LOGIN_PHASE", title, detail });
            }, 1_000);
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
              loginTracer.stage("live_subscribe_end");
            } catch (error) {
              loginTracer.stage("live_subscribe_failed", { error: error instanceof Error ? error.message : String(error) });
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
            } finally {
              clearInterval(loginProgressInterval);
            }
            const resolveInitialStateStartedAt = Date.now();
            const initialState = resolveInitialState({
              playerId: playerIdentity.playerId,
              authoritativeSnapshot: bootstrapInitialState,
              cachedSnapshot: playerSubscriptions.snapshotForPlayer(playerIdentity.playerId),
              simulationSeedProfile,
              allowCachedSnapshotFallback: allowNonAuthoritativeInitialState,
              allowSeedFallback: allowNonAuthoritativeInitialState
            });
            recordGatewayAuthStepTiming("resolve_initial_state", Date.now() - resolveInitialStateStartedAt, {
              playerId: playerIdentity.playerId,
              channel,
              tileCount: initialState?.tiles.length ?? 0
            });
            authTrace.startStep("hydrate_leaderboard_profiles");
            await hydrateVisibleLeaderboardProfileOverrides(initialState, profileStore, profileOverrides);
            authTrace.endStep("hydrate_leaderboard_profiles");
            if (session.channel === "control") {
              authTrace.startStep("build_init");
              const buildInitMessageStartedAt = Date.now();
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
              recordGatewayAuthStepTiming("build_init_message", Date.now() - buildInitMessageStartedAt, {
                playerId: playerIdentity.playerId,
                channel,
                tileCount: initMessage.initialState?.tiles?.length ?? 0
              });
              session.nextClientSeq = initMessage.recovery.nextClientSeq;
              // Phase 7: include suggested colour swatches in the init payload
              const buildTakenColorSetStartedAt = Date.now();
              const takenColorSet = await buildTakenColorSet(playerIdentity.playerId);
              recordGatewayAuthStepTiming("build_taken_color_set", Date.now() - buildTakenColorSetStartedAt, {
                playerId: playerIdentity.playerId,
                channel
              });
              (initMessage.player as Record<string, unknown>).suggestedColors = pickSuggestedPalette(6, takenColorSet);
              const initInitialTileCount = initMessage.initialState?.tiles?.length ?? 0;
              authTrace.endStep("build_init");
              // Stringify the ~256KB init message off the main thread so the
              // event loop stays free for gRPC acks and healthz during bootstrap.
              loginTracer.stage("stringify_init_start", { initTileCount: initInitialTileCount });
              authTrace.startStep("stringify_init");
              let initJson: string;
              if (initInitialTileCount <= inlineBootstrapStringifyTileLimit) {
                initJson = JSON.stringify(initMessage);
              } else {
                try {
                  initJson = await gatewayBootstrapStringifier(initMessage);
                } catch (err) {
                  // Worker OOM/crash — respawn is automatic; fall back to inline once.
                  app.log.warn({ err }, "[gateway-stringifier] worker stringify failed, using inline fallback");
                  initJson = JSON.stringify(initMessage);
                }
              }
              authTrace.endStep("stringify_init");
              loginTracer.stage("stringify_init_end", { initJsonBytes: initJson.length });
              if (socket.readyState !== socket.OPEN) {
                // Socket closed while we were stringifying — discard silently.
                authTrace.complete("rejected", "socket_closed_before_init");
                return;
              }
              // initSent must be set only after the init leaves the socket so
              // that payloads arriving during the stringify await stay queued in
              // pendingPayloads rather than racing ahead of the init message.
              loginTracer.stage("send_init_start", { initJsonBytes: initJson.length });
              session.initSent = true;
              recordGatewayEvent(
                initInitialTileCount ? "info" : "warn",
                "gateway_init_sent",
                {
                  playerId: playerIdentity.playerId,
                  channel,
                  initialTileCount: initInitialTileCount,
                  initJsonBytes: initJson.length,
                  playerPayloadPresent: Boolean(initMessage.player),
                  seasonId: initMessage.runtimeIdentity.seasonId,
                  runtimeFingerprint: initMessage.runtimeIdentity.fingerprint,
                  snapshotLabel: initMessage.runtimeIdentity.snapshotLabel ?? "",
                  simulationConnected: simulationHealth.connected,
                  simulationLastError: simulationHealth.lastError ?? ""
                }
              );
              const sendInitStartedAt = Date.now();
              socket.send(initJson);
              recordGatewayAuthStepTiming("send_init", Date.now() - sendInitStartedAt, {
                playerId: playerIdentity.playerId,
                channel,
                initJsonBytes: initJson.length,
                initialTileCount: initInitialTileCount
              });
              const flushPendingStartedAt = Date.now();
              for (const payload of session.pendingPayloads) {
                sendJson(socket, payload);
                recordCommandSocketDelivery("gateway_command_payload_sent", socket, payload);
              }
              recordGatewayAuthStepTiming("flush_pending_payloads", Date.now() - flushPendingStartedAt, {
                playerId: playerIdentity.playerId,
                channel,
                pendingPayloadCount: session.pendingPayloads.length
              });
              session.pendingPayloads = [];
              loginTracer.done({ outcome: "init_sent" });
              authTrace.complete("init_sent");
            } else {
              loginTracer.done({ outcome: "init_sent", channel: "non_control" });
              authTrace.complete("init_sent", "non_control_channel");
            }
            return;
          }

          if (!session.playerId) {
            sendJson(socket, { type: "ERROR", code: "NO_AUTH", message: "auth first" });
            return;
          }

          if (message.type === "ATTACK_PREVIEW") {
            const previewSnapshot = playerSubscriptions.snapshotForPlayer(session.playerId);
            const getPlayerTechDomainIds = (pid: string) => {
              const ps = playerSubscriptions.snapshotForPlayer(pid);
              return ps?.player ? { techIds: ps.player.techIds, domainIds: ps.player.domainIds } : undefined;
            };
            sendJson(socket, attackPreviewResult(
              session.playerId,
              previewSnapshot?.tiles,
              previewSnapshot?.docks,
              message,
              previewSnapshot?.player?.techIds,
              previewSnapshot?.player?.domainIds,
              getPlayerTechDomainIds,
            ));
            return;
          }

          if (message.type === "REQUEST_REVEAL_MAP") {
            if (!session.canToggleFog) {
              recordGatewayEvent("warn", "gateway_reveal_map_forbidden", {
                playerId: session.playerId,
                channel: session.channel
              });
              sendJson(socket, { type: "ERROR", code: "FORBIDDEN", message: "reveal map unavailable" });
              return;
            }
            const now = Date.now();
            const lastRequestedAt = lastRevealRequestMsByPlayerId.get(session.playerId) ?? 0;
            if (now - lastRequestedAt < REVEAL_REQUEST_COOLDOWN_MS) {
              recordGatewayEvent("warn", "gateway_reveal_map_throttled", {
                playerId: session.playerId,
                channel: session.channel,
                cooldownRemainingMs: REVEAL_REQUEST_COOLDOWN_MS - (now - lastRequestedAt)
              });
              sendJson(socket, { type: "ERROR", code: "REVEAL_MAP_THROTTLED", message: "reveal request rate limit" });
              return;
            }
            if (activeRevealStreamSockets.size >= MAX_CONCURRENT_REVEAL_STREAMS) {
              recordGatewayEvent("warn", "gateway_reveal_map_overloaded", {
                playerId: session.playerId,
                channel: session.channel,
                activeStreams: activeRevealStreamSockets.size,
                cap: MAX_CONCURRENT_REVEAL_STREAMS
              });
              sendJson(socket, { type: "ERROR", code: "REVEAL_MAP_BUSY", message: "reveal capacity exceeded" });
              return;
            }
            lastRevealRequestMsByPlayerId.set(session.playerId, now);
            void streamRevealMapToSocket(socket, session.playerId).catch((error) => {
              recordGatewayEvent("error", "gateway_reveal_map_stream_failed", {
                playerId: session.playerId,
                error: error instanceof Error ? error.message : String(error)
              });
              if (socket.readyState === socket.OPEN) {
                sendJson(socket, {
                  type: "ERROR",
                  code: "REVEAL_MAP_UNAVAILABLE",
                  message: "Full-map reveal is temporarily unavailable."
                });
              }
            });
            return;
          }

          if (message.type === "REQUEST_TILE_DETAIL") {
            const playerId = session.playerId;
            pushAuthoritativeTileDetail({
              socket,
              playerId,
              x: message.x,
              y: message.y,
              fogDisabled: session.fogDisabled,
              snapshotForPlayer: (id) => playerSubscriptions.snapshotForPlayer(id),
              fetchTileDetailFromSim,
              simulationConnected: simulationHealth.connected,
              sendJson,
              recordGatewayEvent,
              sendErrorsOnMiss: true
            });
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
            try {
              await refreshPlayerFogSnapshot(session.playerId, fogDisabled, {
                includeFogUpdate: true,
                reason: "fog_toggle",
                commandId: `fog:${session.playerId}:${Date.now()}`
              });
            } catch (error) {
              sendJson(socket, { type: "ERROR", code: "SIMULATION_UNAVAILABLE", message: "fog toggle temporarily unavailable" });
            }
            return;
          }

          if (message.type === "START_NEW_SEASON") {
            if (!session.playerId) {
              sendJson(socket, { type: "ERROR", code: "NO_AUTH", message: "auth first" });
              return;
            }
            recordGatewayEvent("info", "gateway_start_new_season_requested", {
              playerId: session.playerId,
              channel: session.channel
            });
            try {
              // force=false: the sim only rolls over when the current season has
              // already ended, so a player pressing this on the season-end screen
              // cannot reset an active season. The resulting SEASON_ROLLOVER is
              // broadcast to every connected client.
              const result = await simulationClient.startNextSeason(false);
              recordGatewayEvent("info", "gateway_start_new_season_ok", {
                playerId: session.playerId,
                seasonId: result.seasonId
              });
            } catch (error) {
              // Rejects if the season has not ended yet or a rollover is already
              // in flight — both are benign races from clicking the button. The
              // in-flight rollover still broadcasts SEASON_ROLLOVER to everyone.
              recordGatewayEvent("warn", "gateway_start_new_season_rejected", {
                playerId: session.playerId,
                channel: session.channel,
                error: error instanceof Error ? error.message : String(error)
              });
              sendJson(socket, { type: "ERROR", code: "SEASON_NOT_READY", message: "A new season cannot start yet." });
            }
            return;
          }

          if (message.type === "SET_TILE_COLOR") {
            const normalized = normalizeHex(message.color);
            if (!normalized) {
              sendJson(socket, { type: "ERROR", code: "COLOR_INVALID", message: "Color must be a valid hex code (#rrggbb)." });
              return;
            }
            const taken = await buildTakenColorSet(session.playerId);
            if (isTaken(normalized, taken)) {
              const suggestion = suggestAlternative(normalized, taken);
              gatewayMetrics.incrementColorCollisionRejectedTotal();
              sendJson(socket, {
                type: "ERROR",
                code: "COLOR_TAKEN",
                message: "That colour is already taken by another empire.",
                suggestion,
              });
              return;
            }
            const storedProfile = await profileStore.setTileColor(session.playerId, normalized);
            invalidateProfileCache(session.playerId);
            const override = profileOverrides.upsert(session.playerId, {
              ...(storedProfile.name ? { name: storedProfile.name } : {}),
              ...(storedProfile.tileColor ? { tileColor: storedProfile.tileColor } : {}),
              ...(typeof storedProfile.profileComplete === "boolean"
                ? { profileComplete: storedProfile.profileComplete }
                : {})
            });
            taken.add(normalized);
            const suggestedColors = pickSuggestedPalette(6, taken);
            const payload = {
              type: "PLAYER_STYLE",
              playerId: session.playerId,
              ...(override.name ? { name: override.name } : {}),
              tileColor: normalized
            };
            for (const targetSocket of playerSubscriptions.allSockets()) queueOrSendSessionPayload(targetSocket, payload);
            for (const targetSocket of playerSubscriptions.socketsForPlayer(session.playerId)) {
              queueOrSendSessionPayload(targetSocket, {
                type: "PLAYER_UPDATE",
                tileColor: normalized,
                canToggleFog: session.canToggleFog,
                suggestedColors
              });
            }
            return;
          }

          if (message.type === "SET_PROFILE") {
            const normalized = normalizeHex(message.color);
            if (!normalized) {
              sendJson(socket, { type: "ERROR", code: "COLOR_INVALID", message: "Color must be a valid hex code (#rrggbb)." });
              return;
            }
            const taken = await buildTakenColorSet(session.playerId);
            if (isTaken(normalized, taken)) {
              const suggestion = suggestAlternative(normalized, taken);
              gatewayMetrics.incrementColorCollisionRejectedTotal();
              sendJson(socket, {
                type: "ERROR",
                code: "COLOR_TAKEN",
                message: "That colour is already taken by another empire.",
                suggestion,
              });
              return;
            }
            const storedProfile = await profileStore.setProfile(session.playerId, message.displayName, normalized);
            invalidateProfileCache(session.playerId);
            const override = profileOverrides.upsert(session.playerId, {
              ...(storedProfile.name ? { name: storedProfile.name } : {}),
              ...(storedProfile.tileColor ? { tileColor: storedProfile.tileColor } : {}),
              ...(typeof storedProfile.profileComplete === "boolean"
                ? { profileComplete: storedProfile.profileComplete }
                : {})
            });
            socialState.renamePlayer(session.playerId, override.name ?? message.displayName);
            taken.add(normalized);
            const suggestedColors = pickSuggestedPalette(6, taken);
            const stylePayload = {
              type: "PLAYER_STYLE",
              playerId: session.playerId,
              name: override.name ?? message.displayName,
              tileColor: override.tileColor ?? normalized
            };
            for (const targetSocket of playerSubscriptions.allSockets()) queueOrSendSessionPayload(targetSocket, stylePayload);
            for (const targetSocket of playerSubscriptions.socketsForPlayer(session.playerId)) {
              queueOrSendSessionPayload(targetSocket, {
                type: "PLAYER_UPDATE",
                name: override.name,
                tileColor: override.tileColor,
                profileNeedsSetup: false,
                canToggleFog: session.canToggleFog,
                suggestedColors
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
            message.type !== "AETHER_LANCE" &&
            message.type !== "CAST_AETHER_BRIDGE" &&
            message.type !== "CAST_AETHER_WALL" &&
            message.type !== "SIPHON_TILE" &&
            message.type !== "PURGE_SIPHON" &&
            message.type !== "CREATE_MOUNTAIN" &&
            message.type !== "REMOVE_MOUNTAIN" &&
            message.type !== "AIRPORT_BOMBARD" &&
            message.type !== "IMPERIAL_EXCHANGE_LEVY" &&
            message.type !== "WORLD_ENGINE_STRIKE" &&
            message.type !== "AEGIS_LOCK" &&
            message.type !== "ASTRAL_DOCK_LAUNCH" &&
            message.type !== "UPGRADE_TOWN_TIER" &&
            message.type !== "COLLECT_SHARD" &&
            message.type !== "SET_MUSTER" &&
            message.type !== "CLEAR_MUSTER" &&
            message.type !== "WATCH_MUSTER" &&
            message.type !== "UNWATCH_MUSTER"
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

          // Alias — NOT a snapshot. submitDurableCommand increments nextClientSeq
          // synchronously before its first await; using a copy here caused a race
          // where two concurrent WS messages both snapshotted the same seq value,
          // producing a UNIQUE constraint violation on (player_id, client_seq).
          const authedSession = session as GatewaySocketSession;
          // For ATTACK/EXPAND commands we pre-generate the commandId so the
          // expand tracer can use it as a correlationId from the moment the
          // message arrives — before submitDurableCommand assigns it.
          const isFrontierAction = message.type === "ATTACK" || message.type === "EXPAND";
          const preGeneratedCommandId = isFrontierAction
            ? (options.createCommandId ?? (() => crypto.randomUUID()))()
            : undefined;
          const expandTracer = isFrontierAction
            ? createRequestTracer({
                kind: "expand",
                correlationId: preGeneratedCommandId!,
                playerId: session.playerId,
                extra: { actionType: message.type }
              })
            : null;
          const submitDeps = {
            createCommandId: preGeneratedCommandId
              ? () => preGeneratedCommandId
              : (options.createCommandId ?? (() => crypto.randomUUID())),
            now: options.now ?? (() => Date.now()),
            commandStore,
            onCommandSubmitted: (command: { commandId: string }) => {
              pendingInputToStateByCommandId.set(command.commandId, Date.now());
              expandTracer?.stage("gateway_enqueued", { commandId: command.commandId });
            },
            onCommandSubmitFailed: (commandId: string) => {
              pendingInputToStateByCommandId.delete(commandId);
              expandTracer?.stage("gateway_submit_failed", { commandId });
            },
            onError: (phase: string, err: unknown) => {
              if (phase === "persist") {
                recordGatewayEvent("error", "QUEUE_PERSIST_FAILED", {
                  errorName: err instanceof Error ? err.name : undefined,
                  errorCode: (err as { code?: string } | undefined)?.code,
                  message: err instanceof Error ? err.message : String(err),
                  messageType
                });
                app.log.error({ err, phase, messageType }, "gateway persist failed");
              } else {
                recordGatewayEvent("warn", "gateway_submit_secondary_error", {
                  phase,
                  errorName: err instanceof Error ? err.name : undefined,
                  message: err instanceof Error ? err.message : String(err)
                });
                app.log.warn({ err, phase }, "gateway submit secondary error (best-effort path)");
              }
            },
            submitCommand: async (command: Parameters<typeof simulationClient.submitCommand>[0]) => {
              const rpcStartedAt = Date.now();
              expandTracer?.stage("gateway_rpc_start", { commandId: command.commandId });
              try {
                await withTimeout(
                  simulationClient.submitCommand(command),
                  simulationSubmitTimeoutMs,
                  "gateway submit command"
                );
                markSimulationReady();
                expandTracer?.stage("gateway_rpc_end", { commandId: command.commandId });
              } catch (error) {
                expandTracer?.stage("gateway_rpc_timeout_or_error", {
                  commandId: command.commandId,
                  error: error instanceof Error ? error.message : String(error)
                });
                handleSubmitError(error, { commandId: command.commandId, playerId: command.playerId });
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
          } else if (message.type === "SET_MUSTER") {
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "SET_MUSTER",
                  payload: {
                    x: message.x,
                    y: message.y,
                    mode: message.mode,
                    ...(typeof message.targetX === "number" ? { targetX: message.targetX } : {}),
                    ...(typeof message.targetY === "number" ? { targetY: message.targetY } : {})
                  }
                },
                submitDeps
              )
            );
          } else if (message.type === "CLEAR_MUSTER") {
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "CLEAR_MUSTER",
                  payload: {
                    x: message.x,
                    y: message.y
                  }
                },
                submitDeps
              )
            );
          } else if (message.type === "WATCH_MUSTER") {
            // Best-effort subscription — failure must not produce GATEWAY_INTERNAL_ERROR.
            // A timeout or gRPC error here just means the muster panel won't refresh
            // live for this session; the client can re-open the menu to retry.
            try {
              await withTimeout(
                simulationClient.submitCommand({
                  commandId: `watch-muster:${session.sessionId}:${Date.now()}`,
                  sessionId: session.sessionId,
                  playerId: authedSession.playerId,
                  clientSeq: 0,
                  issuedAt: Date.now(),
                  type: "WATCH_MUSTER",
                  payloadJson: JSON.stringify({ x: message.x, y: message.y })
                }),
                simulationSubmitTimeoutMs,
                "gateway watch muster"
              );
            } catch (error) {
              app.log.warn({ err: error }, "gateway watch muster failed (best-effort)");
            }
          } else if (message.type === "UNWATCH_MUSTER") {
            // Best-effort unsubscribe — failure must not produce GATEWAY_INTERNAL_ERROR.
            try {
              await withTimeout(
                simulationClient.submitCommand({
                  commandId: `unwatch-muster:${session.sessionId}:${Date.now()}`,
                  sessionId: session.sessionId,
                  playerId: authedSession.playerId,
                  clientSeq: 0,
                  issuedAt: Date.now(),
                  type: "UNWATCH_MUSTER",
                  payloadJson: "{}"
                }),
                simulationSubmitTimeoutMs,
                "gateway unwatch muster"
              );
            } catch (error) {
              app.log.warn({ err: error }, "gateway unwatch muster failed (best-effort)");
            }
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
            const validTrickle = isChosenTrickleResource(trickleResource) ? trickleResource : undefined;
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
          } else if (message.type === "AETHER_LANCE") {
            const metadata = optionalCommandMetadata(message);
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "AETHER_LANCE",
                  payload: {
                    x: message.x,
                    y: message.y
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
          } else if (message.type === "IMPERIAL_EXCHANGE_LEVY") {
            const metadata = optionalCommandMetadata(message);
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "IMPERIAL_EXCHANGE_LEVY",
                  payload: {
                    fromX: message.fromX,
                    fromY: message.fromY,
                    resource: message.resource
                  },
                  ...metadata
                },
                submitDeps
              )
            );
          } else if (message.type === "WORLD_ENGINE_STRIKE") {
            const metadata = optionalCommandMetadata(message);
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "WORLD_ENGINE_STRIKE",
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
          } else if (message.type === "AEGIS_LOCK") {
            const metadata = optionalCommandMetadata(message);
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "AEGIS_LOCK",
                  payload: {
                    fromX: message.fromX,
                    fromY: message.fromY
                  },
                  ...metadata
                },
                submitDeps
              )
            );
          } else if (message.type === "ASTRAL_DOCK_LAUNCH") {
            const metadata = optionalCommandMetadata(message);
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "ASTRAL_DOCK_LAUNCH",
                  payload: {
                    fromX: message.fromX,
                    fromY: message.fromY
                  },
                  ...metadata
                },
                submitDeps
              )
            );
          } else if (message.type === "UPGRADE_TOWN_TIER") {
            const metadata = optionalCommandMetadata(message);
            await trackSubmitLatency(() =>
              submitDurableCommand(
                authedSession,
                {
                  type: "UPGRADE_TOWN_TIER",
                  payload: {
                    x: message.x,
                    y: message.y
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
                  commandId: preGeneratedCommandId!,
                  ...metadata
                },
                submitDeps
              )
            );
            expandTracer?.done();
          }
        } catch (error) {
          recordGatewayEvent("error", "gateway_websocket_message_failed", {
            messageType,
            errorName: error instanceof Error ? error.name : undefined,
            message: error instanceof Error ? error.message : String(error)
          });
          app.log.error({ err: error, messageType }, "gateway websocket message handling failed");
          sendJson(socket, { type: "ERROR", code: "GATEWAY_INTERNAL_ERROR", message: "gateway failed to handle message" });
        }
      });

      socket.on("close", () => {
        if (!session.playerId) return;
        const closingPlayerId = session.playerId;
        void simulationClient.submitCommand({
          commandId: `unwatch-muster:close:${session.sessionId}:${Date.now()}`,
          sessionId: session.sessionId,
          playerId: closingPlayerId,
          clientSeq: 0,
          issuedAt: Date.now(),
          type: "UNWATCH_MUSTER",
          payloadJson: "{}"
        }).catch(() => { /* best-effort on disconnect */ });
        void playerSubscriptions.removeSocket(closingPlayerId, socket)
          .then(() => {
            syncGatewaySnapshotMetricsFromCache(closingPlayerId);
            // Prune fog-refresh bookkeeping when no fog-disabled session remains
            // for this player — avoids unbounded growth of lastStartedAt across
            // the gateway's lifetime.
            const stillFogDisabled = [...playerSubscriptions.socketsForPlayer(closingPlayerId)].some(
              (playerSocket) => sessionsBySocket.get(playerSocket)?.fogDisabled === true
            );
            if (!stillFogDisabled) {
              fogLiveRefreshLastStartedAtByPlayerId.delete(closingPlayerId);
            }
          })
          .catch((error) => {
            app.log.error({ err: error, playerId: closingPlayerId }, "failed to unsubscribe player");
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
    notifyDeployment(): void {
      const payload = preSerializeBroadcast({ type: "SERVER_DEPLOYING" });
      for (const socket of playerSubscriptions.allSockets()) {
        try { sendJsonToSocket(socket, payload); } catch {}
      }
    },
    async close(): Promise<void> {
      await gatewayBootstrapStringifier.close();
      await app.close();
    }
  };
};
