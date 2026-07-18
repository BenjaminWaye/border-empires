import { COMBAT_LOCK_MS, isChosenTrickleResource } from "@border-empires/shared";
import { applyImperialWardActivatedMessage } from "../client-imperial-ward/client-imperial-ward.js";
import { formatGoldAmount } from "../client-constants.js";
import type { ClientState } from "../client-state/client-state.js";
import { clearServerDeployingSession, setServerDeployingSession } from "../client-server-deploying-session/client-server-deploying-session.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import type { RevealEmpireStatsView, SurveySweepPingKind } from "../client-types.js";
import {
  applyGatewayRecoveryNextClientSeq,
  bindQueuedFrontierCommandIdentity,
  matchesCurrentFrontierCommand
} from "../client-frontier-command/client-frontier-command.js";
import { clearFrontierStatusAlert } from "../client-frontier-status/client-frontier-status.js";
import { applyGatewayInitialState, applyGatewayTileDeltaBatch, normalizeGatewayTileUpdate, refreshAllGatewayDerivedTownSummaries, refreshGatewayDerivedTownSummariesAroundTile } from "../client-gateway-sync/client-gateway-sync.js";
import { applyCommonTileFields } from "../client-tile-merge/client-tile-merge.js";
import { logSurveySweepReceived } from "../survey-sweep-debug-log/survey-sweep-debug-log.js";
import { revealEmpireStatsFeedText } from "../client-empire-intel/client-empire-intel.js";
import { applyRespawnNoticeToState, normalizeRespawnNotice } from "../client-respawn-notice/client-respawn-notice.js";
import { applyTechUpdateToState } from "../client-tech-update-state/client-tech-update-state.js";
import { attackSyncLog, debugTileLog, debugTileTimeline, fogRevealLog, recordClientDebugEvent, tileMatchesDebugKey, tileSyncDebugEnabled, verboseTileDebugEnabled } from "../client-debug/client-debug.js";
import { clearSettlementProgressByKey as clearSettlementProgressByKeyFromModule, queueDevelopmentAction as queueDevelopmentActionFromModule, resetAttackPreviewState } from "../client-queue-logic/client-queue-logic.js";
import { applyAutoSettlementQueueFromServer, restorePersistedDevelopmentQueueForPlayer } from "../client-development-queue/client-development-queue.js";
import {
  notifyActiveAllianceBreaksOnInit,
  notifyIncomingAllianceRequest,
  notifyIncomingDiplomacyRequestsOnInit,
  notifyIncomingTruceRequest,
  notifyRecentAllianceBreaksOnInit
} from "../client-diplomacy-notifications.js";
import { createAuthReconnectScheduler } from "../client-auth-reconnect/client-auth-reconnect.js";
import { effectiveFogDisabled } from "../client-map-reveal/client-map-reveal.js";
import { notificationCategoryForServerError, serverStartingBusyMessages } from "../client-persistent-alerts/client-persistent-alerts.js";
import { registerShardRainPingsFromAlert } from "../client-shard-rain-pings/client-shard-rain-pings.js";
import { tileHasTownIdentity } from "../client-town-identity.js";
import { maybeShowRuinsPrompt } from "../client-ruins-prompt.js";
import { handleTileDeltaBatchMessage } from "../client-tile-delta-batch-handler/client-tile-delta-batch-handler.js";
import { applyPlayerStyleMessage } from "../client-player-style-message/client-player-style-message.js";
import { applyInitMessage } from "../client-network-init-message/client-network-init-message.js";

type NetworkDeps = Record<string, any> & {
  state: ClientState;
  ws: RealtimeSocket;
  wsUrl: string;
  firebaseAuth?: any;
};

const revealStatsNumberKeys = [
  "revealedAt",
  "tiles",
  "settledTiles",
  "frontierTiles",
  "controlledTowns",
  "incomePerMinute",
  "techCount",
  "gold",
  "manpower",
  "manpowerCap"
] as const;
const revealStatsResourceKeys = ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object");

const isSurveySweepPingKind = (value: unknown): value is SurveySweepPingKind =>
  value === "resource" || value === "town";

const surveySweepPingsFromPayload = (value: unknown): Array<{ x: number; y: number; kind: SurveySweepPingKind }> => {
  if (!Array.isArray(value)) return [];
  const out: Array<{ x: number; y: number; kind: SurveySweepPingKind }> = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    if (typeof entry.x !== "number" || typeof entry.y !== "number" || !isSurveySweepPingKind(entry.kind)) continue;
    out.push({ x: entry.x, y: entry.y, kind: entry.kind });
  }
  return out;
};

const isRevealEmpireStatsView = (value: unknown): value is RevealEmpireStatsView => {
  if (!isRecord(value)) return false;
  if (typeof value.playerId !== "string" || typeof value.playerName !== "string") return false;
  for (const key of revealStatsNumberKeys) {
    if (typeof value[key] !== "number") return false;
  }
  if (!isRecord(value.strategicResources)) return false;
  for (const key of revealStatsResourceKeys) {
    if (typeof value.strategicResources[key] !== "number") return false;
  }
  return true;
};

export const bindClientNetwork = (deps: NetworkDeps): void => {
  const {
    state,
    ws,
    wsUrl,
    firebaseAuth,
    keyFor,
    renderHud,
    setAuthStatus,
    syncAuthOverlay,
    authenticateSocket,
    pushFeed,
    pushFeedEntry,
    clearOptimisticTileState,
    requestViewRefresh,
    applyPendingSettlementsFromServer,
    mergeIncomingTileDetail,
    mergeServerTileWithOptimisticState,
    maybeAnnounceShardSite,
    markDockDiscovered,
    centerOnOwnedTile,
    authProfileNameEl,
    authProfileColorEl,
    defensibilityPctFromTE,
    clearPendingCollectVisibleDelta,
    seedProfileSetupFields,
    resetStrategicReplayState,
    setWorldSeed,
    clearRenderCaches,
    buildMiniMapBase,
    shardAlertKeyForPayload,
    showShardAlert,
    combatResolutionAlert,
    wasPredictedCombatAlreadyShown,
    showCaptureAlert,
    requestSettlement,
    dropQueuedTargetKeyIfAbsent,
    processActionQueue,
    clearSettlementProgressForTile,
    terrainAt,
    requestAttackPreviewForTarget,
    openSingleTileActionMenu,
    isTileOwnedByAlly,
    hideShardAlert,
    explainActionFailure,
    notifyInsufficientGoldForFrontierAction,
    clearSettlementProgressByKey,
    showCollectVisibleCooldownAlert,
    formatCooldownShort,
    reconcileActionQueue,
    revertOptimisticVisibleCollectDelta,
    revertOptimisticTileCollectDelta,
    clearPendingCollectTileDelta,
    playerNameForOwner,
    applyOptimisticTileState
  } = deps;
  let emptyServerErrorWarned = false;
  type ShardRainNoticeLike = { phase?: string | undefined; startsAt?: number | undefined; expiresAt?: number | undefined; siteCount?: number | undefined; sites?: { x: number; y: number }[] | undefined };
  const applyShardRainNotice = (notice: ShardRainNoticeLike | undefined): void => {
    if (notice?.phase === "upcoming" && typeof notice.startsAt === "number") {
      showShardAlert({ key: shardAlertKeyForPayload("upcoming", notice.startsAt), phase: "upcoming", startsAt: notice.startsAt });
      return;
    }
    if (notice?.phase === "started" && typeof notice.startsAt === "number" && typeof notice.expiresAt === "number") {
      const startedAlert = {
        key: shardAlertKeyForPayload("started", notice.startsAt),
        phase: "started" as const,
        startsAt: notice.startsAt,
        expiresAt: notice.expiresAt,
        siteCount: Number(notice.siteCount ?? 0),
        ...(notice.sites ? { sites: notice.sites } : {})
      };
      showShardAlert(startedAlert);
      registerShardRainPingsFromAlert(state, startedAlert);
    }
  };
  // Used for the WELCOME/INIT bootstrap notice, which is always populated
  // (see computeShardRainWelcomeNotice) so the persistent Sharding-panel
  // countdown has something to show on first paint — even when the next
  // rain is many hours away. Unlike applyShardRainNotice (used for live
  // push events), this must never pop the one-time toast alert for an
  // "upcoming" rain on every login; the toast should only fire once a rain
  // is actually live, or via the live near-term warning push.
  const applyShardRainNoticeQuiet = (notice: ShardRainNoticeLike | undefined): void => {
    if (notice?.phase === "started") {
      applyShardRainNotice(notice);
      return;
    }
    if (notice?.phase === "upcoming" && typeof notice.startsAt === "number") {
      state.shardRainStatus = { key: shardAlertKeyForPayload("upcoming", notice.startsAt), phase: "upcoming", startsAt: notice.startsAt };
    }
  };
  const logTileSync = (event: string, payload: Record<string, unknown>): void => {
    if (!tileSyncDebugEnabled()) return;
    console.info(`[tile-sync] ${event}`, payload);
  };
  const frontierQueueDebug = (event: string, payload: Record<string, unknown> = {}): void => {
    const activeFrontierContext =
      state.actionInFlight || state.actionQueue.length > 0 || state.queuedTargetKeys.size > 0 || Boolean(state.actionTargetKey);
    if (!activeFrontierContext && payload.force !== true) return;
    const currentActionKey = state.actionCurrent ? keyFor(state.actionCurrent.x, state.actionCurrent.y) : "";
    const currentAction = state.actionCurrent
      ? {
          x: state.actionCurrent.x,
          y: state.actionCurrent.y,
          actionType: state.actionCurrent.actionType,
          commandId: state.actionCurrent.commandId,
          clientSeq: state.actionCurrent.clientSeq,
          retries: state.actionCurrent.retries
        }
      : undefined;
    const captureTarget = state.capture ? { x: state.capture.target.x, y: state.capture.target.y, resolvesAt: state.capture.resolvesAt } : undefined;
    const queuedActions = state.actionQueue.map((entry) => ({
      x: entry.x,
      y: entry.y,
      retries: entry.retries ?? 0
    }));
    console.info("[frontier-queue-debug]", event, {
      actionInFlight: state.actionInFlight,
      actionTargetKey: state.actionTargetKey,
      actionAcceptedAck: state.actionAcceptedAck,
      combatStartAck: state.combatStartAck,
      actionStartedAt: state.actionStartedAt,
      currentActionKey,
      currentFrontierSyncWaitUntil: currentActionKey ? state.frontierSyncWaitUntilByTarget.get(currentActionKey) ?? 0 : 0,
      currentFrontierLateAckUntil: currentActionKey ? state.frontierLateAckUntilByTarget.get(currentActionKey) ?? 0 : 0,
      currentAction,
      queuedTargetKeys: [...state.queuedTargetKeys],
      queuedActions,
      captureTarget,
      ...payload
    });
  };
  const logIncomingTechPayload = (
    source: "INIT" | "PLAYER_UPDATE" | "TECH_UPDATE",
    payload: {
      techIds?: unknown;
      techChoices?: unknown;
      nextChoices?: unknown;
      techCatalog?: unknown;
      currentResearch?: unknown;
      techRootId?: unknown;
      availableTechPicks?: unknown;
    }
  ): void => {
    const techIds = Array.isArray(payload.techIds) ? [...payload.techIds] : undefined;
    const techChoicesSource = Array.isArray(payload.techChoices)
      ? payload.techChoices
      : Array.isArray(payload.nextChoices)
        ? payload.nextChoices
        : undefined;
    const techChoices = Array.isArray(techChoicesSource) ? [...techChoicesSource] : undefined;
    const techCatalog = Array.isArray(payload.techCatalog)
      ? payload.techCatalog.map((entry) => {
          if (!entry || typeof entry !== "object") return entry;
          const tech = entry as {
            id?: unknown;
            name?: unknown;
            tier?: unknown;
            rootId?: unknown;
            requires?: unknown;
            prereqIds?: unknown;
            requirements?: { canResearch?: unknown } | undefined;
          };
          return {
            id: tech.id,
            name: tech.name,
            tier: tech.tier,
            rootId: tech.rootId,
            requires: tech.requires,
            prereqIds: Array.isArray(tech.prereqIds) ? [...tech.prereqIds] : tech.prereqIds,
            canResearch: tech.requirements?.canResearch
          };
        })
      : undefined;
    console.info(`[tech] ${source} payload`, {
      hasTechIds: Array.isArray(payload.techIds),
      hasTechChoices: Array.isArray(payload.techChoices) || Array.isArray(payload.nextChoices),
      hasTechCatalog: Array.isArray(payload.techCatalog),
      techIdsCount: techIds?.length ?? 0,
      techChoicesCount: techChoices?.length ?? 0,
      techCatalogCount: techCatalog?.length ?? 0,
      techIds,
      techChoices,
      techCatalog,
      techRootId: payload.techRootId,
      currentResearch: payload.currentResearch,
      availableTechPicks: payload.availableTechPicks
    });
  };
  const shouldResetFrontierActionStateForError =
    typeof deps.shouldResetFrontierActionStateForError === "function"
      ? deps.shouldResetFrontierActionStateForError
      : (errorCode: string): boolean => {
          if (!errorCode) return true;
          switch (errorCode) {
            case "SETTLE_INVALID":
            case "FORT_BUILD_INVALID":
            case "OBSERVATORY_BUILD_INVALID":
            case "SIEGE_OUTPOST_BUILD_INVALID":
            case "ECONOMIC_STRUCTURE_BUILD_INVALID":
            case "STRUCTURE_CANCEL_INVALID":
            case "TOWN_UNFED":
              return false;
            default:
              return true;
          }
        };
  const appendFeedEntry =
    typeof pushFeedEntry === "function"
      ? pushFeedEntry
      : (entry: { text: string; type?: string; severity?: string }) =>
          pushFeed(entry.text, (entry.type as any) ?? "info", (entry.severity as any) ?? "info");

  const applyIncomingRespawnNotice = (value: unknown): void => {
    const notice = normalizeRespawnNotice(value);
    applyRespawnNoticeToState(state, notice, appendFeedEntry);
  };

  const maybeRequestTileDetail = (tile: any): void => {
    if (typeof deps.requestTileDetailIfNeeded !== "function") return;
    if (!tile || tile.fogged || tile.detailLevel === "full") return;
    const ownedByMe = tile.ownerId === state.me;
    // Unowned resource/dock tiles carry no server-side economy data — the
    // snapshot already has everything visible. Self-stamp to avoid a round-trip.
    if (
      !ownedByMe &&
      (tile.resource || tile.dockId) &&
      !tileHasTownIdentity(tile) &&
      !tile.fort &&
      !tile.observatory &&
      !tile.siegeOutpost &&
      !tile.economicStructure
    ) {
      // Stamp tileDetailReceivedAt so the 60s gate in requestTileDetailIfNeeded
      // suppresses the round-trip. We deliberately do NOT write detailLevel:"full"
      // into state.tiles — if this tile later changes ownership or gets a
      // structure built on it, the gate naturally expires and a real request fires.
      state.tileDetailReceivedAt.set(keyFor(tile.x, tile.y), Date.now());
      return;
    }
    if (
      ownedByMe ||
      tile.resource ||
      tile.dockId ||
      tileHasTownIdentity(tile) ||
      tile.fort ||
      tile.observatory ||
      tile.siegeOutpost ||
      tile.economicStructure
    ) {
      deps.requestTileDetailIfNeeded(tile);
    }
  };

  const logDebugTileState = (scope: string, tile: any, extra?: Record<string, unknown>): void => {
    if (!tile || !tileMatchesDebugKey(tile.x, tile.y, 1, { fallbackTile: state.selected })) return;
    debugTileLog(scope, {
      x: tile.x,
      y: tile.y,
      detailLevel: tile.detailLevel,
      ownerId: tile.ownerId,
      ownershipState: tile.ownershipState,
      resource: tile.resource,
      economicStructure: tile.economicStructure
        ? {
            type: tile.economicStructure.type,
            status: tile.economicStructure.status
          }
        : undefined,
      town: tile.town
        ? {
            hasMarket: tile.town.hasMarket,
            hasGranary: tile.town.hasGranary,
            hasBank: tile.town.hasBank,
            populationTier: tile.town.populationTier
          }
        : undefined,
      ...(extra ?? {})
    });
  };

  const logFrontierTimeline = (
    scope: string,
    x: number,
    y: number,
    args: {
      before?: any;
      incoming?: any;
      after?: any;
      extra?: Record<string, unknown>;
      throttleKey?: string;
      minIntervalMs?: number;
    }
  ): void => {
    const timelineArgs = {
      x,
      y,
      before: args.before,
      incoming: args.incoming,
      after: args.after,
      state,
      keyFor,
      ...(args.extra ? { extra: args.extra } : {}),
      ...(args.throttleKey ? { throttleKey: args.throttleKey } : {}),
      ...(typeof args.minIntervalMs === "number" ? { minIntervalMs: args.minIntervalMs } : {})
    };
    debugTileTimeline(scope, timelineArgs);
  };

  let reconnectReloadTimer: number | undefined;
  let deferredBootstrapRefreshTimer: number | undefined;
  const authProgressIntervalMs = 5000;
  const authProgressIntervalId =
    typeof globalThis.setInterval === "function"
      ? globalThis.setInterval(() => {
          if (!state.authBusy || state.authSessionReady || state.authBusyStartedAt <= 0) return;
          const elapsedMs = Date.now() - state.authBusyStartedAt;
          const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
          const retryInSec = state.authRetryNextAt > 0 ? Math.max(0, Math.ceil((state.authRetryNextAt - Date.now()) / 1000)) : 0;
          const payload = {
            elapsedSec,
            connection: state.connection,
            title: state.authBusyTitle,
            detail: state.authBusyDetail,
            authRetrying: state.authRetrying,
            authRetryAttempt: state.authRetryAttempt,
            retryInSec,
            wsReadyState: ws.readyState
          };
          recordClientDebugEvent("info", "auth-progress", "waiting", payload);
          console.info("[auth-progress] waiting", payload);
        }, authProgressIntervalMs)
      : undefined;

  const setAuthBusy = (busy: boolean): void => {
    state.authBusy = busy;
    state.authBusyStartedAt = busy ? (state.authBusyStartedAt || Date.now()) : 0;
  };
  let lastBackendUnavailableAlertAt = 0;

  const clearSettlementProgressSafely = (tileKey: string): void => {
    if (!tileKey) return;
    if (typeof clearSettlementProgressByKey === "function") {
      clearSettlementProgressByKey(tileKey);
      return;
    }
    clearSettlementProgressByKeyFromModule(state, tileKey, { clearOptimisticTileState: (key) => clearOptimisticTileState(key, true) });
  };

  const clearOptimisticTileStateSafely = (tileKey: string, revert = false): void => {
    if (!tileKey || typeof clearOptimisticTileState !== "function") return;
    clearOptimisticTileState(tileKey, revert);
  };

  const showCaptureAlertSafely = (
    title: string,
    detail: string,
    tone: "info" | "success" | "warn" | "error",
    manpowerLoss?: number
  ): void => {
    if (typeof showCaptureAlert !== "function") return;
    showCaptureAlert(title, detail, tone, manpowerLoss);
  };

  const pushFeedSafely = (
    message: string,
    type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech",
    severity?: "info" | "success" | "warn" | "error"
  ): void => {
    if (typeof pushFeed !== "function") return;
    pushFeed(message, type, severity);
  };

  const applySettlementRepairDiagnostic = (msg: Record<string, unknown>): void => {
    const diagnostic = (msg.settlementRepairDiagnostic as { key?: unknown; detail?: unknown } | undefined) ?? undefined;
    const diagnosticKey = typeof diagnostic?.key === "string" ? diagnostic.key : "";
    const diagnosticDetail = typeof diagnostic?.detail === "string" ? diagnostic.detail : "";
    if (!diagnosticKey || !diagnosticDetail) {
      state.settlementRepairDiagnosticKey = "";
      return;
    }
    if (state.settlementRepairDiagnosticKey === diagnosticKey) return;
    state.settlementRepairDiagnosticKey = diagnosticKey;
    showCaptureAlertSafely("Settlement Missing", diagnosticDetail, "error");
    pushFeedSafely(diagnosticDetail, "error", "error");
  };

  const explainActionFailureSafely = (
    code: string,
    message: string,
    opts?: {
      cooldownRemainingMs?: number;
      formatCooldownShort?: (ms: number) => string;
    }
  ): string =>
    typeof explainActionFailure === "function" ? explainActionFailure(code, message, opts) : message || "Action failed";

  const requestViewRefreshSafely = (radius?: number, force?: boolean): void => {
    if (typeof requestViewRefresh !== "function") return;
    requestViewRefresh(radius, force);
  };

  const syncDesiredFogDisabled = (): void => {
    if (!state.authSessionReady) return;
    if (!state.mapRevealEligible) return;
    if (!state.serverSupportedMessageTypes.has("REQUEST_REVEAL_MAP")) return;
    if (state.fogDisabled === state.mapRevealEnabled) return;
    fogRevealLog("sync-send", {
      disabled: state.mapRevealEnabled,
      authSessionReady: state.authSessionReady,
      eligible: state.mapRevealEligible,
      fogDisabled: state.fogDisabled
    });
    ws.send(JSON.stringify(state.mapRevealEnabled ? { type: "REQUEST_REVEAL_MAP" } : { type: "SET_FOG_DISABLED", disabled: false }));
  };

  const shouldShowBackendUnavailableAlert = (): boolean => {
    const now = Date.now();
    if (now - lastBackendUnavailableAlertAt < 2_000) return false;
    lastBackendUnavailableAlertAt = now;
    return true;
  };

  const lateFrontierAckPending = (tileKey: string): boolean => (state.frontierLateAckUntilByTarget.get(tileKey) ?? 0) > Date.now();

  const clearLateFrontierAck = (tileKey: string): void => {
    if (!tileKey) return;
    state.frontierLateAckUntilByTarget.delete(tileKey);
  };

  const currentActionCanResolveFromFrontierOwnership = (targetKey: string): boolean => {
    if (!state.actionInFlight || !state.actionCurrent || keyFor(state.actionCurrent.x, state.actionCurrent.y) !== targetKey) return false;
    return state.actionCurrent.actionType === "EXPAND";
  };

  const currentActionCanResolveFromPostCombatTileSync = (targetKey: string): boolean => {
    if (!state.actionInFlight || !state.actionCurrent || keyFor(state.actionCurrent.x, state.actionCurrent.y) !== targetKey) return false;
    if (!state.combatStartAck) return false;
    if (state.actionCurrent.actionType !== "ATTACK") return false;
    if (!state.capture || keyFor(state.capture.target.x, state.capture.target.y) !== targetKey) return false;
    return Date.now() >= state.capture.resolvesAt;
  };

  const rebindLateFrontierAck = (
    target: { x: number; y: number },
    source: "ACTION_ACCEPTED" | "COMBAT_START",
    actionType?: "EXPAND" | "ATTACK"
  ): void => {
    const targetKey = keyFor(target.x, target.y);
    const lateAckUntil = state.frontierLateAckUntilByTarget.get(targetKey) ?? 0;
    if (!lateFrontierAckPending(targetKey)) return;
    state.actionInFlight = true;
    state.actionTargetKey = targetKey;
    if (!state.actionCurrent || keyFor(state.actionCurrent.x, state.actionCurrent.y) !== targetKey) {
      state.actionCurrent = { x: target.x, y: target.y, retries: 0, ...(actionType ? { actionType } : {}) };
    } else if (actionType) {
      state.actionCurrent.actionType = actionType;
    }
    if (!state.actionStartedAt) state.actionStartedAt = Date.now();
    clearLateFrontierAck(targetKey);
    attackSyncLog("late-frontier-ack-rebound", {
      source,
      target,
      targetKey,
      lateAckWaitRemainingMs: Math.max(0, lateAckUntil - Date.now())
    });
  };

  const applyAcceptedExpandOptimisticState = (target: { x: number; y: number }): void => {
    if (typeof applyOptimisticTileState !== "function") return;
    const targetKey = keyFor(target.x, target.y);
    const existing = state.tiles.get(targetKey);
    if (existing?.ownerId === state.me && (existing.ownershipState === "FRONTIER" || existing.ownershipState === "SETTLED")) return;
    applyOptimisticTileState(target.x, target.y, (tile: { ownerId?: string; ownershipState?: string; fogged?: boolean; optimisticPending?: string }) => {
      tile.ownerId = state.me;
      tile.ownershipState = "FRONTIER";
      tile.fogged = false;
      tile.optimisticPending = "expand";
    });
  };

  const reconcileActionQueueSafely = (): void => {
    if (typeof reconcileActionQueue !== "function") return;
    reconcileActionQueue();
  };

  const processActionQueueSafely = (): void => {
    if (typeof processActionQueue !== "function") return;
    processActionQueue();
  };

  const resolveFrontierCapture = (source: "FRONTIER_RESULT" | "TILE_DELTA" | "TILE_DELTA_BATCH"): void => {
    const resolvedCurrentKey = state.actionCurrent ? keyFor(state.actionCurrent.x, state.actionCurrent.y) : "";
    const resolvedTargetKey = state.actionTargetKey;
    state.capture = undefined;
    if (state.pendingCombatReveal?.targetKey === state.actionTargetKey) state.pendingCombatReveal = undefined;
    state.actionInFlight = false;
    state.actionAcceptedAck = false;
    state.combatStartAck = false;
    state.actionAcceptTimeoutHandledAt = 0;
    state.actionStartedAt = 0;
    if (resolvedTargetKey) {
      dropQueuedTargetKeyIfAbsent(resolvedTargetKey);
      state.queuedTargetKeys.delete(resolvedTargetKey);
      state.actionQueue = state.actionQueue.filter((entry) => keyFor(entry.x, entry.y) !== resolvedTargetKey);
    }
    if (resolvedTargetKey) clearOptimisticTileState(resolvedTargetKey);
    if (resolvedCurrentKey) {
      dropQueuedTargetKeyIfAbsent(resolvedCurrentKey);
      state.queuedTargetKeys.delete(resolvedCurrentKey);
      state.actionQueue = state.actionQueue.filter((entry) => keyFor(entry.x, entry.y) !== resolvedCurrentKey);
    }
    if (resolvedCurrentKey) clearOptimisticTileState(resolvedCurrentKey);
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
    frontierQueueDebug(
      source === "FRONTIER_RESULT"
        ? "frontier_result_resolved_frontier_capture"
        : source === "TILE_DELTA_BATCH"
          ? "tile_delta_batch_resolved_frontier_capture"
          : "tile_delta_resolved_frontier_capture",
      { resolvedCurrentKey, source }
    );
    processActionQueueSafely();
  };

  const resumeQueuedFrontierActionsAfter = (delayMs: number): void => {
    const boundedDelayMs = Math.max(0, Math.min(delayMs, 15_000));
    globalThis.setTimeout(() => {
      if (state.actionInFlight || state.capture) return;
      processActionQueueSafely();
      renderHud();
    }, boundedDelayMs);
  };

  const busyDevelopmentSlotCountFromError = (errorMessage: string): number | undefined => {
    const match = /all (\d+) development slots are busy/.exec(errorMessage);
    if (!match) return undefined;
    const count = Number(match[1]);
    return Number.isFinite(count) && count > 0 ? count : undefined;
  };

  const syncBusyDevelopmentSlotStateFromError = (errorMessage: string): void => {
    const busyCount = busyDevelopmentSlotCountFromError(errorMessage);
    if (typeof busyCount !== "number") return;
    state.developmentProcessLimit = Math.max(state.developmentProcessLimit, busyCount);
    state.activeDevelopmentProcessCount = Math.max(state.activeDevelopmentProcessCount ?? 0, busyCount);
  };

  const alreadyQueuedBusyDevelopmentAction = (errorCode: string, errorTileKey: string): boolean => {
    if (!errorTileKey) return false;
    const queuedKind =
      errorCode === "SETTLE_INVALID"
        ? "SETTLE"
        : errorCode.endsWith("_BUILD_INVALID") || errorCode === "STRUCTURE_REMOVE_INVALID"
          ? "BUILD"
          : undefined;
    if (!queuedKind) return false;
    return state.developmentQueue.some((entry) => entry.tileKey === errorTileKey && entry.kind === queuedKind);
  };

  const canRecoverBusySettlementWithoutAttempt = (errorTileKey: string): boolean =>
    Boolean(errorTileKey) &&
    (state.latestSettleTargetKey === errorTileKey || state.settleProgressByTile.has(errorTileKey) || state.queuedDevelopmentDispatchPending);

  const maybeRecoverBusyDevelopmentAttempt = (errorCode: string, errorMessage: string, errorTileKey: string): boolean => {
    if (!errorMessage.includes("development slots are busy")) return false;
    if (errorCode !== "SETTLE_INVALID" && !errorCode.endsWith("_BUILD_INVALID") && errorCode !== "STRUCTURE_REMOVE_INVALID") return false;
    syncBusyDevelopmentSlotStateFromError(errorMessage);
    if (alreadyQueuedBusyDevelopmentAction(errorCode, errorTileKey)) return true;
    const attempt = state.lastDevelopmentAttempt;
    const tile = state.tiles.get(errorTileKey);
    if (!attempt || attempt.tileKey !== errorTileKey) {
      if (
        errorCode !== "SETTLE_INVALID" ||
        !canRecoverBusySettlementWithoutAttempt(errorTileKey) ||
        !tile ||
        tile.ownerId !== state.me ||
        tile.ownershipState !== "FRONTIER"
      ) {
        return false;
      }
      clearOptimisticTileState(errorTileKey, true);
      clearSettlementProgressSafely(errorTileKey);
      state.queuedDevelopmentDispatchPending = false;
      return queueDevelopmentActionFromModule(
        state,
        { kind: "SETTLE", x: tile.x, y: tile.y, tileKey: errorTileKey, label: `Settlement at (${tile.x}, ${tile.y})` },
        {
          pushFeed: typeof pushFeed === "function" ? pushFeed : () => {},
          renderHud: typeof renderHud === "function" ? renderHud : () => {}
        }
      );
    }
    const matchesOptimisticState =
      attempt.kind === "SETTLE"
        ? state.settleProgressByTile.has(errorTileKey)
        : tile?.optimisticPending === (attempt.payload.type === "REMOVE_STRUCTURE" ? "structure_remove" : "structure_build");
    if (!matchesOptimisticState) return false;
    clearOptimisticTileState(errorTileKey, true);
    if (attempt.kind === "SETTLE") clearSettlementProgressSafely(errorTileKey);
    state.queuedDevelopmentDispatchPending = false;
    state.lastDevelopmentAttempt = undefined;
    return queueDevelopmentActionFromModule(state, attempt, {
      pushFeed: typeof pushFeed === "function" ? pushFeed : () => {},
      renderHud: typeof renderHud === "function" ? renderHud : () => {}
    });
  };

  const maybeRecoverTransientSettlementAttempt = (errorCode: string, errorMessage: string, errorTileKey: string): boolean => {
    if (errorCode !== "SETTLE_INVALID" || !errorTileKey) return false;
    const attempt = state.lastDevelopmentAttempt;
    if (!attempt || attempt.kind !== "SETTLE" || attempt.tileKey !== errorTileKey) return false;
    const transientOwnershipFailure =
      errorMessage === "tile must be owned" &&
      ((state.actionInFlight && state.actionTargetKey === errorTileKey) ||
        (state.capture && keyFor(state.capture.target.x, state.capture.target.y) === errorTileKey));
    if (!transientOwnershipFailure && errorMessage !== "tile is locked in combat" && errorMessage !== "tile already settling") return false;
    clearOptimisticTileStateSafely(errorTileKey, true);
    clearSettlementProgressSafely(errorTileKey);
    state.queuedDevelopmentDispatchPending = false;
    state.lastDevelopmentAttempt = undefined;
    return queueDevelopmentActionFromModule(state, attempt, {
      pushFeed: typeof pushFeed === "function" ? pushFeed : () => {},
      renderHud: typeof renderHud === "function" ? renderHud : () => {}
    });
  };

  const clearQueuedDevelopmentDispatchPending = (): void => {
    state.queuedDevelopmentDispatchPending = false;
  };

  const clearReconnectReloadTimer = (): void => {
    if (reconnectReloadTimer !== undefined) {
      window.clearTimeout(reconnectReloadTimer);
      reconnectReloadTimer = undefined;
    }
  };

  const clearDeferredBootstrapRefreshTimer = (): void => {
    if (deferredBootstrapRefreshTimer !== undefined) {
      window.clearTimeout(deferredBootstrapRefreshTimer);
      deferredBootstrapRefreshTimer = undefined;
    }
  };

  if (typeof window !== "undefined" && typeof window.addEventListener === "function" && authProgressIntervalId !== undefined) {
    window.addEventListener(
      "beforeunload",
      () => {
        globalThis.clearInterval(authProgressIntervalId);
      },
      { once: true }
    );
  }

  const authReconnect = createAuthReconnectScheduler({ state, ws, firebaseAuth, setAuthBusy, setAuthStatus, syncAuthOverlay, renderHud, authenticateSocket });
  const clearAuthReconnectTimer = (): void => authReconnect.clear();
  const resetAuthReconnectAttempt = (): void => authReconnect.resetAttempt();
  const scheduleAuthReconnect = (message: string, forceRefresh = false): void => authReconnect.schedule(message, forceRefresh);

  const scheduleReconnectReload = (): void => {
    if (!state.hasEverInitialized) return;
    if (reconnectReloadTimer !== undefined) return;
    reconnectReloadTimer = window.setTimeout(() => {
      reconnectReloadTimer = undefined;
      if (state.connection === "initialized" || state.connection === "connected") return;
      window.location.reload();
    }, 4000);
  };

  const applyLoginPhase = (title: string, detail: string): void => {
    setAuthBusy(true);
    state.authBusyTitle = title;
    state.authBusyDetail = detail;
    recordClientDebugEvent("info", "auth-progress", "phase", { title, detail, wsReadyState: ws.readyState, connection: state.connection });
    console.info("[auth-progress] phase", { title, detail, wsReadyState: ws.readyState, connection: state.connection });
    setAuthStatus(detail);
    syncAuthOverlay();
  };

  const applyCombatOutcomeMessage = (msg: Record<string, unknown>, opts?: { predicted?: boolean }): void => {
    const target = msg.target as { x: number; y: number } | undefined;
    const targetBefore = (() => (target ? state.tiles.get(keyFor(target.x, target.y)) : undefined))();
    const originBefore = (() => {
      const origin = msg.origin as { x: number; y: number } | undefined;
      return origin ? state.tiles.get(keyFor(origin.x, origin.y)) : undefined;
    })();
    const changes =
      (msg.changes as Array<{
        x: number;
        y: number;
        ownerId?: string;
        ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
        breachShockUntil?: number;
        frontierDecayAt?: number | null;
        frontierDecayKind?: "NATURAL" | "ENCIRCLEMENT" | null;
      }>) ??
      [];
    const resolvedCaptureTargetKey = state.capture ? keyFor(state.capture.target.x, state.capture.target.y) : "";
    for (const change of changes) {
      const tileKey = keyFor(change.x, change.y);
      state.incomingAttacksByTile.delete(tileKey);
      const existing = state.tiles.get(tileKey);
      const incoming: any = {
        ...(existing ?? { x: change.x, y: change.y, terrain: terrainAt(change.x, change.y), fogged: false }),
        x: change.x,
        y: change.y,
        fogged: false
      };
      if (change.ownerId) incoming.ownerId = change.ownerId;
      else delete incoming.ownerId;
      if (change.ownershipState) incoming.ownershipState = change.ownershipState;
      else if (!change.ownerId) delete incoming.ownershipState;
      if (typeof change.breachShockUntil === "number") incoming.breachShockUntil = change.breachShockUntil;
      else if ("breachShockUntil" in change && !change.breachShockUntil) delete incoming.breachShockUntil;
      if (typeof change.frontierDecayAt === "number") incoming.frontierDecayAt = change.frontierDecayAt;
      else if ("frontierDecayAt" in change && !change.frontierDecayAt) delete incoming.frontierDecayAt;
      if (change.frontierDecayKind === "NATURAL" || change.frontierDecayKind === "ENCIRCLEMENT") incoming.frontierDecayKind = change.frontierDecayKind;
      else if ("frontierDecayKind" in change && !change.frontierDecayKind) delete incoming.frontierDecayKind;
      const merged = mergeServerTileWithOptimisticState(incoming);
      if (!merged.optimisticPending) clearOptimisticTileState(tileKey);
      state.tiles.set(tileKey, merged); state.tilesRevision += 1;
      if (merged.ownerId === state.me && (merged.ownershipState === "FRONTIER" || merged.ownershipState === "SETTLED")) {
        state.frontierSyncWaitUntilByTarget.delete(tileKey);
        clearLateFrontierAck(tileKey);
        state.actionQueue = state.actionQueue.filter((entry) => keyFor(entry.x, entry.y) !== tileKey);
        state.queuedTargetKeys.delete(tileKey);
      }
    }
    const resultAlert = combatResolutionAlert(msg, {
      targetTileBefore: targetBefore,
      originTileBefore: originBefore
    });
    const resultTargetKey = target ? keyFor(target.x, target.y) : "";
    const predictedAlreadyShown = Boolean(
      (state.pendingCombatReveal &&
        state.pendingCombatReveal.targetKey === resultTargetKey &&
        state.pendingCombatReveal.revealed &&
        state.pendingCombatReveal.title === resultAlert.title &&
        state.pendingCombatReveal.detail === resultAlert.detail) ||
        (resultTargetKey && wasPredictedCombatAlreadyShown(state.revealedPredictedCombatByKey, resultTargetKey, resultAlert.title, resultAlert.detail))
    );
    // Silent waypoint EXPAND on neutral: state.capture.silent is set
    // and the result is a "Territory Claimed" success. Skip both the
    // feed entry and the captureAlert popup. Anything else (attack
    // results, settle results, the lost-territory tone) still surfaces.
    const silentExpandSuccess = Boolean(state.capture?.silent && msg.attackType === "EXPAND" && resultAlert.tone === "success");
    if (!predictedAlreadyShown && !silentExpandSuccess) {
      appendFeedEntry({
        title: resultAlert.title,
        text: resultAlert.detail,
        type: "combat",
        severity: resultAlert.tone === "success" ? "success" : "warn",
        at: Date.now(),
        ...(typeof resultAlert.focusX === "number" && typeof resultAlert.focusY === "number"
          ? { focusX: resultAlert.focusX, focusY: resultAlert.focusY, actionLabel: resultAlert.actionLabel ?? "Center" }
          : {})
      });
      showCaptureAlert(resultAlert.title, resultAlert.detail, resultAlert.tone, resultAlert.manpowerLoss);
    }
    if (resultTargetKey) {
      if (opts?.predicted) state.revealedPredictedCombatByKey.set(resultTargetKey, { title: resultAlert.title, detail: resultAlert.detail });
      else state.revealedPredictedCombatByKey.delete(resultTargetKey);
    }
    if (state.pendingCombatReveal && state.pendingCombatReveal.targetKey === resultTargetKey) state.pendingCombatReveal = undefined;
    const resolvedCurrentKey = state.actionCurrent ? keyFor(state.actionCurrent.x, state.actionCurrent.y) : "";
    const targetKey = resolvedCaptureTargetKey || state.actionTargetKey;
    let handedOffToSettle = false;
    if (targetKey && state.autoSettleTargets.has(targetKey)) {
      const settledTile = state.tiles.get(targetKey);
      if (settledTile && settledTile.ownerId === state.me && settledTile.ownershipState === "FRONTIER") {
        if (requestSettlement(settledTile.x, settledTile.y)) {
          handedOffToSettle = true;
          pushFeed(`Auto-settle started at (${settledTile.x}, ${settledTile.y}).`, "combat", "info");
        }
      }
      state.autoSettleTargets.delete(targetKey);
    }
    state.capture = undefined;
    if (!handedOffToSettle) {
      state.actionInFlight = false;
      state.actionAcceptedAck = false;
      state.combatStartAck = false;
      state.actionAcceptTimeoutHandledAt = 0;
      state.actionStartedAt = 0;
      if (targetKey) dropQueuedTargetKeyIfAbsent(targetKey);
      if (resolvedCurrentKey) dropQueuedTargetKeyIfAbsent(resolvedCurrentKey);
      let startedNext = false;
      if (msg.attackType === "ATTACK" && state.actionQueue.length > 0) {
        resumeQueuedFrontierActionsAfter(COMBAT_LOCK_MS);
      } else {
        startedNext = processActionQueue();
      }
      if (!startedNext) {
        state.actionTargetKey = "";
        state.actionCurrent = undefined;
      }
    }
    for (const change of changes) {
      if (change.ownerId === state.me && change.ownershipState === "SETTLED") {
        clearSettlementProgressForTile(change.x, change.y);
      }
    }
    resetAttackPreviewState(state);
    renderHud();
  };

  const applyChunkTiles = (tiles: any[]): void => {
    const firstChunkArriving = state.firstChunkAt === 0;
    state.chunkFullCount += 1;
    if (state.firstChunkAt === 0) state.firstChunkAt = Date.now();
    let sawOwnedTile = false;
    let resolvedQueuedFrontierCapture = false;
    let detailRequests = 0;
    for (const tile of tiles) {
      const tileKey = keyFor(tile.x, tile.y);
      const existing = state.tiles.get(tileKey);
      const normalizedTile =
        "ownerId" in tile
          ? tile
          : {
              ...tile,
              ownerId: undefined,
              ownershipState: undefined,
              capital: undefined
            };
      const mergedTile = mergeServerTileWithOptimisticState(mergeIncomingTileDetail(existing, normalizedTile));
      state.tiles.set(keyFor(mergedTile.x, mergedTile.y), mergedTile);
      logFrontierTimeline("frontier-chunk-apply", mergedTile.x, mergedTile.y, {
        before: existing,
        incoming: normalizedTile,
        after: mergedTile,
        extra: {
          source: "CHUNK",
          existingEconomicStructure: existing?.economicStructure?.type
        }
      });
      logDebugTileState("chunk-merge", mergedTile, {
        source: "CHUNK",
        existingEconomicStructure: existing?.economicStructure?.type
      });
      if (
        existing?.ownerId !== mergedTile.ownerId ||
        existing?.ownershipState !== mergedTile.ownershipState ||
        tileKey === state.actionTargetKey ||
        state.settleProgressByTile.has(tileKey)
      ) {
        logTileSync("chunk_tile_applied", {
          tileKey,
          existingOwnerId: existing?.ownerId,
          existingOwnershipState: existing?.ownershipState,
          incomingOwnerId: normalizedTile.ownerId,
          incomingOwnershipState: normalizedTile.ownershipState,
          resolvedOwnerId: mergedTile.ownerId,
          resolvedOwnershipState: mergedTile.ownershipState,
          optimisticPending: mergedTile.optimisticPending
        });
      }
      if (mergedTile.ownerId === state.me && (mergedTile.ownershipState === "FRONTIER" || mergedTile.ownershipState === "SETTLED")) {
        state.frontierSyncWaitUntilByTarget.delete(tileKey);
        clearLateFrontierAck(tileKey);
        state.actionQueue = state.actionQueue.filter((entry) => keyFor(entry.x, entry.y) !== tileKey);
        state.queuedTargetKeys.delete(tileKey);
        resolvedQueuedFrontierCapture = true;
        logFrontierTimeline("frontier-queue-resolved-by-chunk", mergedTile.x, mergedTile.y, {
          before: existing,
          after: mergedTile,
          extra: {
            source: "CHUNK"
          }
        });
      }
      maybeAnnounceShardSite(existing, mergedTile);
      if (!mergedTile.optimisticPending) clearOptimisticTileState(keyFor(mergedTile.x, mergedTile.y));
      markDockDiscovered(mergedTile);
      state.discoveredTiles.add(keyFor(mergedTile.x, mergedTile.y));
      if (mergedTile.ownerId === state.me) sawOwnedTile = true;
        if (detailRequests < 4) {
          const tileKey = keyFor(mergedTile.x, mergedTile.y);
          const before = state.tileDetailRequestedAt.get(tileKey) ?? 0;
          maybeRequestTileDetail(mergedTile);
          const after = state.tileDetailRequestedAt.get(tileKey) ?? 0;
          if (after > before) detailRequests += 1;
        }
      }
    if (sawOwnedTile) state.hasOwnedTileInCache = true;
    else if (!state.hasOwnedTileInCache) centerOnOwnedTile();
    if (resolvedQueuedFrontierCapture && !state.actionInFlight && !state.capture && state.actionQueue.length > 0) {
      processActionQueue();
    }
    if (
      firstChunkArriving &&
      !effectiveFogDisabled(state) &&
      state.lastSubRadius < 2 &&
      !state.actionInFlight &&
      !state.capture &&
      state.actionQueue.length === 0
    ) {
      clearDeferredBootstrapRefreshTimer();
      deferredBootstrapRefreshTimer = window.setTimeout(() => {
        deferredBootstrapRefreshTimer = undefined;
        if (ws.readyState !== ws.OPEN || !state.authSessionReady) return;
        if (state.actionInFlight || state.capture || state.actionQueue.length > 0) return;
        requestViewRefresh(2, true);
      }, 400);
    }
    renderHud();
  };

  ws.addEventListener("open", () => {
    attackSyncLog("ws-open", {
      readyState: ws.readyState,
      authReady: state.authReady,
      authSessionReady: state.authSessionReady
    });
    state.connection = "connected";
    if (!state.mapLoadStartedAt) state.mapLoadStartedAt = Date.now();
    clearReconnectReloadTimer();
    clearAuthReconnectTimer();
    resetAuthReconnectAttempt();
    if (state.authReady && !state.authSessionReady) {
      applyLoginPhase("Securing session", `Realtime connection open. Sending Google session for ${state.authUserLabel || "your empire"}...`);
    }
    renderHud();
    void authenticateSocket();
  });

  ws.addEventListener("close", () => {
    clearDeferredBootstrapRefreshTimer();
    const currentActionKey = state.actionCurrent ? keyFor(state.actionCurrent.x, state.actionCurrent.y) : "";
    attackSyncLog("ws-close", {
      currentActionKey,
      currentAction: state.actionCurrent,
      actionStartedAt: state.actionStartedAt,
      actionAcceptedAck: state.actionAcceptedAck,
      combatStartAck: state.combatStartAck,
      capture: state.capture
        ? {
            target: state.capture.target,
            resolvesAt: state.capture.resolvesAt
          }
        : undefined
    });
    state.connection = "disconnected";
    state.actionInFlight = false;
    state.actionAcceptedAck = false;
    state.combatStartAck = false;
    state.actionAcceptTimeoutHandledAt = 0;
    state.actionStartedAt = 0;
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
    state.lastChunkSnapshotGeneration = 0;
    state.pendingShardCollect = undefined;
    if (currentActionKey) clearOptimisticTileState(currentActionKey, true);
    pushFeed("Connection lost. Retrying...", "error", "warn");
    if (state.authReady && !state.authSessionReady) {
      applyLoginPhase("Connection interrupted", `The realtime connection to ${wsUrl} closed before sign-in finished. Reload the game to reconnect.`);
      state.authRetrying = false;
      state.authRetryAttempt = 0;
    }
    clearAuthReconnectTimer();
    scheduleReconnectReload();
    renderHud();
  });

  ws.addEventListener("error", () => {
    const currentActionKey = state.actionCurrent ? keyFor(state.actionCurrent.x, state.actionCurrent.y) : "";
    attackSyncLog("ws-error", {
      currentActionKey,
      currentAction: state.actionCurrent,
      actionStartedAt: state.actionStartedAt,
      actionAcceptedAck: state.actionAcceptedAck,
      combatStartAck: state.combatStartAck,
      capture: state.capture
        ? {
            target: state.capture.target,
            resolvesAt: state.capture.resolvesAt
          }
        : undefined
    });
    state.connection = "disconnected";
    state.actionInFlight = false;
    state.actionAcceptedAck = false;
    state.combatStartAck = false;
    state.actionAcceptTimeoutHandledAt = 0;
    state.actionStartedAt = 0;
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
    state.lastChunkSnapshotGeneration = 0;
    state.pendingShardCollect = undefined;
    if (currentActionKey) clearOptimisticTileState(currentActionKey, true);
    pushFeed("Server unreachable. Retrying...", "error", "warn");
    if (state.authReady && !state.authSessionReady) {
      applyLoginPhase(
        "Connection interrupted",
        `The realtime connection to ${wsUrl} failed before sign-in finished. Reload the game to reconnect.`
      );
      state.authRetrying = false;
      state.authRetryAttempt = 0;
    }
    clearAuthReconnectTimer();
    scheduleReconnectReload();
    renderHud();
  });

  const MAX_RECENT_TILE_MESSAGES = 50;
  const recordRecentTileMessage = (msg: Record<string, unknown>, msgType: string): void => {
    if (
      msgType !== "TILE_DELTA" &&
      msgType !== "TILE_DELTA_BATCH" &&
      msgType !== "TILE_SNAPSHOT_REPLACE" &&
      msgType !== "FOG_UPDATE" &&
      msgType !== "FRONTIER_RESULT" &&
      msgType !== "COMBAT_RESULT"
    ) {
      return;
    }
    if (!Array.isArray(state.recentTileMessages)) return;
    const target = msg.target as { x?: number; y?: number } | undefined;
    const tiles = Array.isArray(msg.tiles)
      ? (msg.tiles as Array<unknown>).length
      : Array.isArray(msg.updates)
        ? (msg.updates as Array<unknown>).length
        : undefined;
    state.recentTileMessages.push({
      ts: Date.now(),
      type: msgType,
      ...(typeof target?.x === "number" ? { x: target.x } : {}),
      ...(typeof target?.y === "number" ? { y: target.y } : {}),
      ...(typeof tiles === "number" ? { tileCount: tiles } : {})
    });
    if (state.recentTileMessages.length > MAX_RECENT_TILE_MESSAGES) {
      state.recentTileMessages.splice(0, state.recentTileMessages.length - MAX_RECENT_TILE_MESSAGES);
    }
  };
  let activeRevealMapSnapshotId = "";
  let activeRevealMapChunkCount = 0;
  let activeRevealMapChunksApplied = 0;

  ws.addEventListener("message", (ev) => {
    // This handler used to have zero error containment of its own (the rest
    // of this file relied entirely on each branch happening to be internally
    // guarded, e.g. renderHud()'s try/catch). A throw anywhere here — a
    // browser API restriction on Safari, a malformed payload, anything —
    // used to propagate straight out of the WS message dispatch uncaught.
    // Wrap the whole thing as a blanket safety net; individual branches can
    // still have their own more specific handling on top of this.
    let msg: Record<string, unknown> | undefined;
    try {
    msg = JSON.parse(ev.data as string) as Record<string, unknown>;
    const msgType = typeof msg.type === "string" ? msg.type : "UNKNOWN";
    recordRecentTileMessage(msg, msgType);
    if (
      msgType === "COMMAND_QUEUED" ||
      msgType === "ACTION_ACCEPTED" ||
      msgType === "COMBAT_START" ||
      msgType === "FRONTIER_RESULT" ||
      msgType === "COMBAT_RESULT" ||
      msgType === "TILE_DELTA_BATCH" ||
      msgType === "TILE_DELTA" ||
      msgType === "ERROR"
    ) {
      const msgTarget =
        typeof msg.target === "object" &&
        msg.target !== null &&
        typeof (msg.target as { x?: unknown }).x === "number" &&
        typeof (msg.target as { y?: unknown }).y === "number"
          ? {
              x: (msg.target as { x: number }).x,
              y: (msg.target as { y: number }).y
            }
          : undefined;
      frontierQueueDebug("incoming", {
        type: msgType,
        commandId: typeof msg.commandId === "string" ? msg.commandId : undefined,
        clientSeq: typeof msg.clientSeq === "number" ? msg.clientSeq : undefined,
        code: typeof msg.code === "string" ? msg.code : undefined,
        msgTarget
      });
    }
    const shouldApplyChunkGeneration = (generation: unknown): boolean => {
      if (typeof generation !== "number" || !Number.isFinite(generation)) return true;
      if (generation < state.lastChunkSnapshotGeneration) {
        attackSyncLog("chunk-generation-ignored", {
          incomingGeneration: generation,
          lastChunkSnapshotGeneration: state.lastChunkSnapshotGeneration
        });
        return false;
      }
      if (generation > state.lastChunkSnapshotGeneration) {
        attackSyncLog("chunk-generation-advance", {
          previousGeneration: state.lastChunkSnapshotGeneration,
          nextGeneration: generation
        });
        state.lastChunkSnapshotGeneration = generation;
      }
      return true;
    };
    if (
      msg.type === "ACTION_ACCEPTED" ||
      msg.type === "COMBAT_START" ||
      msg.type === "COMBAT_RESULT" ||
      msg.type === "FRONTIER_RESULT" ||
      msg.type === "ERROR"
    ) {
      const currentTarget = state.actionCurrent ? { x: state.actionCurrent.x, y: state.actionCurrent.y } : undefined;
      attackSyncLog("message", {
        type: msg.type,
        currentTarget,
        currentActionKey: state.actionTargetKey,
        actionAcceptedAck: state.actionAcceptedAck,
        combatStartAck: state.combatStartAck,
        startedAgoMs: state.actionStartedAt ? Date.now() - state.actionStartedAt : undefined,
        msgTarget:
          typeof msg.target === "object" && msg.target !== null && "x" in msg.target && "y" in msg.target
            ? msg.target
            : undefined,
        code: typeof msg.code === "string" ? msg.code : undefined,
        message: typeof msg.message === "string" ? msg.message : undefined
      });
    }
    if (msg.type === "SERVER_DEPLOYING") {
      state.serverDeploying = true;
      setServerDeployingSession();
      return;
    }
    if (msg.type === "LOGIN_PHASE") {
      if (!state.authSessionReady) {
        applyLoginPhase(
          typeof msg.title === "string" ? msg.title : "Connecting your empire...",
          typeof msg.detail === "string" ? msg.detail : "Waiting for the game server to finish preparing your session."
        );
        renderHud();
      }
      return;
    }
    if (msg.type === "LOGIN_QUEUED" || msg.type === "LOGIN_QUEUE_PROGRESS") {
      if (!state.authSessionReady) {
        const position = typeof msg.position === "number" ? msg.position : 1;
        const estimatedWaitMs = typeof msg.estimatedWaitMs === "number" ? msg.estimatedWaitMs : 0;
        const estimatedSec = estimatedWaitMs > 0 ? Math.ceil(estimatedWaitMs / 1000) : null;
        const waitHint = estimatedSec ? ` (~${estimatedSec}s)` : "";
        applyLoginPhase(
          "Login queue",
          `You are #${position} in the login queue${waitHint}. Your session will start automatically when a slot opens.`
        );
        renderHud();
      }
      return;
    }
    if (msg.type === "INIT") {
      applyInitMessage(msg, {
        ...deps,
        setAuthBusy,
        applyShardRainNotice: applyShardRainNoticeQuiet,
        logTileSync,
        logIncomingTechPayload,
        showCaptureAlertSafely,
        applyIncomingRespawnNotice,
        applySettlementRepairDiagnostic,
        syncDesiredFogDisabled,
        clearDeferredBootstrapRefreshTimer,
        clearAuthReconnectTimer,
        resetAuthReconnectAttempt,
        clearQueuedDevelopmentDispatchPending,
        appendFeedEntry
      });
      return;
    }

    if (msg.type === "CHUNK_FULL") {
      if (!shouldApplyChunkGeneration(msg.generation)) return;
      applyChunkTiles(msg.tilesMaskedByFog as any[]);
      return;
    }

    if (msg.type === "CHUNK_BATCH") {
      if (!shouldApplyChunkGeneration(msg.generation)) return;
      const chunks = (msg.chunks as Array<{ cx: number; cy: number; tilesMaskedByFog: any[] }>) ?? [];
      for (const chunk of chunks) applyChunkTiles(chunk.tilesMaskedByFog);
      return;
    }

    if (msg.type === "PLAYER_UPDATE") {
      applySettlementRepairDiagnostic(msg as Record<string, unknown>);
      const prevGold = state.gold;
      const prevDefensibility = state.defensibilityPct;
      const prevStrategic = { ...state.strategicResources };
      state.gold = (msg.gold as number | undefined) ?? (msg.points as number | undefined) ?? state.gold;
      if (typeof msg.name === "string") {
        state.meName = msg.name;
        authProfileNameEl.value = msg.name;
      }
      state.level = (msg.level as number | undefined) ?? state.level;
      state.mods = (msg.mods as typeof state.mods) ?? state.mods;
      state.modBreakdown = (msg.modBreakdown as typeof state.modBreakdown | undefined) ?? state.modBreakdown;
      state.incomePerMinute = (msg.incomePerMinute as number) ?? state.incomePerMinute;
      if (state.incomePerMinute === 0) maybeShowRuinsPrompt();
      state.strategicResources = (msg.strategicResources as typeof state.strategicResources | undefined) ?? state.strategicResources;
      if (msg.storageCap && typeof msg.storageCap === "object") {
        state.storageCap = msg.storageCap as typeof state.storageCap;
      }
      state.strategicProductionPerMinute =
        (msg.strategicProductionPerMinute as typeof state.strategicProductionPerMinute | undefined) ?? state.strategicProductionPerMinute;
      state.economyBreakdown = (msg.economyBreakdown as typeof state.economyBreakdown | undefined) ?? state.economyBreakdown;
      state.manpower = (msg.manpower as number | undefined) ?? state.manpower;
      state.manpowerCap = (msg.manpowerCap as number | undefined) ?? state.manpowerCap;
      state.manpowerRegenPerMinute = (msg.manpowerRegenPerMinute as number | undefined) ?? state.manpowerRegenPerMinute;
      state.logisticsThroughputPerMinute = (msg.logisticsThroughputPerMinute as number | undefined) ?? state.logisticsThroughputPerMinute;
      state.upkeepPerMinute = (msg.upkeepPerMinute as typeof state.upkeepPerMinute | undefined) ?? state.upkeepPerMinute;
      state.upkeepLastTick = (msg.upkeepLastTick as typeof state.upkeepLastTick | undefined) ?? state.upkeepLastTick;
      refreshAllGatewayDerivedTownSummaries({ state, keyFor });
      state.manpowerBreakdown = (msg.manpowerBreakdown as typeof state.manpowerBreakdown | undefined) ?? state.manpowerBreakdown;
      if ("pendingSettlements" in msg) {
        applyPendingSettlementsFromServer(
          msg.pendingSettlements as Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> | undefined
        );
      }
      if ("autoSettlementQueue" in msg) {
        applyAutoSettlementQueueFromServer(
          state,
          msg.autoSettlementQueue as Array<{ x: number; y: number }> | undefined,
          { keyFor }
        );
      }
      state.incomingAllianceRequests = (msg.incomingAllianceRequests as any[] | undefined) ?? state.incomingAllianceRequests;
      state.outgoingAllianceRequests = (msg.outgoingAllianceRequests as any[] | undefined) ?? state.outgoingAllianceRequests;
      clearPendingCollectVisibleDelta();
      if (state.upkeepLastTick.foodCoverage < 0.999 && !state.foodCoverageWarned) {
        pushFeed(
          `Town support underfed: FOOD upkeep coverage ${(state.upkeepLastTick.foodCoverage * 100).toFixed(0)}%. Unfed towns stop producing gold.`,
          "info",
          "warn"
        );
        state.foodCoverageWarned = true;
      } else if (state.upkeepLastTick.foodCoverage >= 0.999 && state.foodCoverageWarned) {
        pushFeed("FOOD upkeep recovered. Town income back to normal.", "info", "success");
        state.foodCoverageWarned = false;
      }
      if (state.gold > prevGold) {
        state.goldAnimUntil = Date.now() + 350;
        state.goldAnimDir = 1;
      } else if (state.gold < prevGold) {
        state.goldAnimUntil = Date.now() + 350;
        state.goldAnimDir = -1;
      } else {
        state.goldAnimDir = 0;
      }
      for (const resource of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD"] as const) {
        const prev = prevStrategic[resource] ?? 0;
        const next = state.strategicResources[resource] ?? 0;
        if (next > prev) {
          state.strategicAnim[resource].until = Date.now() + 350;
          state.strategicAnim[resource].dir = 1;
        } else if (next < prev) {
          state.strategicAnim[resource].until = Date.now() + 350;
          state.strategicAnim[resource].dir = -1;
        } else if (Date.now() >= state.strategicAnim[resource].until) {
          state.strategicAnim[resource].dir = 0;
        }
      }
      state.stamina = msg.stamina as number;
      if (typeof (msg.T as number | undefined) === "number") state.territoryT = msg.T as number;
      if (typeof (msg.E as number | undefined) === "number") state.exposureE = msg.E as number;
      if (typeof (msg.Ts as number | undefined) === "number") state.settledT = msg.Ts as number;
      if (typeof (msg.Es as number | undefined) === "number") state.settledE = msg.Es as number;
      state.defensibilityPct = defensibilityPctFromTE(state.settledT, state.settledE);
      if (state.defensibilityPct > prevDefensibility + 0.05) {
        state.defensibilityAnimUntil = Date.now() + 550;
        state.defensibilityAnimDir = 1;
      } else if (state.defensibilityPct < prevDefensibility - 0.05) {
        state.defensibilityAnimUntil = Date.now() + 550;
        state.defensibilityAnimDir = -1;
      } else if (Date.now() >= state.defensibilityAnimUntil) {
        state.defensibilityAnimDir = 0;
      }
      state.availableTechPicks = (msg.availableTechPicks as number) ?? state.availableTechPicks;
      state.developmentProcessLimit = (msg.developmentProcessLimit as number | undefined) ?? state.developmentProcessLimit;
      if (typeof msg.activeDevelopmentProcessCount === "number") clearQueuedDevelopmentDispatchPending();
      state.activeDevelopmentProcessCount =
        (msg.activeDevelopmentProcessCount as number | undefined) ?? state.activeDevelopmentProcessCount;
      logIncomingTechPayload("PLAYER_UPDATE", {
        techIds: (msg as { techIds?: unknown }).techIds,
        techChoices: msg.techChoices,
        techCatalog: msg.techCatalog,
        currentResearch: msg.currentResearch,
        techRootId: (msg as { techRootId?: unknown }).techRootId,
        availableTechPicks: msg.availableTechPicks
      });
      state.techChoices = (msg.techChoices as string[]) ?? state.techChoices;
      state.techCatalog = (msg.techCatalog as any[]) ?? state.techCatalog;
      state.currentResearch = (msg.currentResearch as typeof state.currentResearch | undefined) ?? undefined;
      if (typeof msg.profileNeedsSetup === "boolean") state.profileSetupRequired = msg.profileNeedsSetup;
      if (typeof msg.canToggleFog === "boolean") state.mapRevealEligible = msg.canToggleFog;
      applyIncomingRespawnNotice((msg as { respawnNotice?: unknown }).respawnNotice);
      state.domainIds = (msg.domainIds as string[]) ?? state.domainIds;
      const techMsgTrickle = (msg as { chosenTrickleResource?: unknown }).chosenTrickleResource;
      if (isChosenTrickleResource(techMsgTrickle)) state.chosenTrickleResource = techMsgTrickle;
      if (typeof (msg as { imperialWardCharges?: unknown }).imperialWardCharges === "number") state.imperialWardCharges = (msg as { imperialWardCharges: number }).imperialWardCharges;
      state.domainChoices = (msg.domainChoices as string[]) ?? state.domainChoices;
      state.domainCatalog = (msg.domainCatalog as any[]) ?? state.domainCatalog;
      if (
        state.pendingDomainUnlockId &&
        (state.domainIds.includes(state.pendingDomainUnlockId) || !state.domainChoices.includes(state.pendingDomainUnlockId))
      ) {
        state.pendingDomainUnlockId = "";
      }
      state.revealCapacity = (msg.revealCapacity as number) ?? state.revealCapacity;
      state.activeRevealTargets = (msg.activeRevealTargets as string[]) ?? state.activeRevealTargets;
      state.abilityCooldowns = (msg.abilityCooldowns as typeof state.abilityCooldowns | undefined) ?? state.abilityCooldowns;
      state.missions = (msg.missions as any[]) ?? state.missions;
      state.leaderboard = (msg.leaderboard as typeof state.leaderboard) ?? state.leaderboard;
      state.seasonVictory = (msg.seasonVictory as any[] | undefined) ?? state.seasonVictory;
      state.seasonWinner = (msg.seasonWinner as any | undefined) ?? state.seasonWinner;
      if (typeof msg.acceptLatencyP95Ms === "number") state.bridgeDebugAcceptLatencyP95Ms = msg.acceptLatencyP95Ms;
      const myTileColor = msg.tileColor as string | undefined;
      if (myTileColor) {
        state.playerColors.set(state.me, myTileColor);
        authProfileColorEl.value = myTileColor;
      }
      if (Array.isArray(msg.suggestedColors)) state.suggestedColors = msg.suggestedColors as string[];
      const myVisualStyle = msg.visualStyle as any;
      if (myVisualStyle) state.playerVisualStyles.set(state.me, myVisualStyle);
      syncAuthOverlay();
      renderHud();
      return;
    }

    if (msg.type === "GLOBAL_STATUS_UPDATE") {
      state.leaderboard = (msg.leaderboard as typeof state.leaderboard) ?? state.leaderboard;
      state.seasonVictory = (msg.seasonVictory as any[] | undefined) ?? state.seasonVictory;
      state.seasonWinner = (msg.seasonWinner as any | undefined) ?? state.seasonWinner;
      if (typeof msg.acceptLatencyP95Ms === "number") state.bridgeDebugAcceptLatencyP95Ms = msg.acceptLatencyP95Ms;
      renderHud();
      return;
    }

    if (msg.type === "COMMAND_QUEUED") {
      bindQueuedFrontierCommandIdentity(state, {
        commandId: msg.commandId,
        clientSeq: msg.clientSeq
      });
      frontierQueueDebug("command_queued_bound", {
        commandId: typeof msg.commandId === "string" ? msg.commandId : undefined,
        clientSeq: typeof msg.clientSeq === "number" ? msg.clientSeq : undefined
      });
      renderHud();
      return;
    }

    if (msg.type === "ACTION_ACCEPTED") {
      if (!matchesCurrentFrontierCommand(state, msg.commandId)) {
        attackSyncLog("action-accepted-ignored-command-mismatch", {
          actionType: msg.actionType,
          commandId: msg.commandId,
          clientSeq: msg.clientSeq,
          currentCommandId: state.actionCurrent?.commandId,
          currentClientSeq: state.actionCurrent?.clientSeq,
          currentAction: state.actionCurrent,
          actionTargetKey: state.actionTargetKey,
          target: msg.target,
          origin: msg.origin
        });
        return;
      }
      clearFrontierStatusAlert(state);
      const target = msg.target as { x: number; y: number };
      const targetKey = keyFor(target.x, target.y);
      attackSyncLog("action-accepted", {
        actionType: msg.actionType,
        commandId: msg.commandId,
        clientSeq: msg.clientSeq,
        target,
        origin: msg.origin,
        resolvesAt: msg.resolvesAt,
        startedAgoMs: state.actionStartedAt ? Date.now() - state.actionStartedAt : undefined,
        currentAction: state.actionCurrent
      });
      rebindLateFrontierAck(target, "ACTION_ACCEPTED", msg.actionType as "EXPAND" | "ATTACK" | undefined);
      if (msg.actionType === "EXPAND") applyAcceptedExpandOptimisticState(target);
      state.actionAcceptedAck = true;
      state.actionAcceptTimeoutHandledAt = 0;
      state.actionInFlight = true;
      // Preserve the silent flag set at dispatch time so the
      // waypoint-driven neutral EXPAND does not pop the big overlay
      // when the server confirms acceptance.
      const wasSilent = Boolean(state.capture?.silent && state.capture.target.x === target.x && state.capture.target.y === target.y);
      const isMusterAdvance = typeof msg.commandId === "string" && msg.commandId.startsWith("territory-auto:muster-advance:");
      state.capture = {
        startAt: state.actionStartedAt || Date.now(),
        resolvesAt: msg.resolvesAt as number,
        target,
        ...(wasSilent || isMusterAdvance ? { silent: true } : {}),
        ...(isMusterAdvance ? { fromMusterAdvance: true } as const : {}),
      };
      state.actionTargetKey = targetKey;
      if (!state.actionCurrent) {
        state.actionCurrent = {
          x: target.x,
          y: target.y,
          retries: 0,
          ...(typeof msg.commandId === "string" && msg.commandId ? { commandId: msg.commandId } : {}),
          ...(msg.actionType === "EXPAND" || msg.actionType === "ATTACK" ? { actionType: msg.actionType } : {}),
        };
      } else if (typeof msg.commandId === "string" && msg.commandId) {
        state.actionCurrent.commandId = msg.commandId;
      }
      frontierQueueDebug("action_accepted_applied", {
        actionType: msg.actionType,
        commandId: typeof msg.commandId === "string" ? msg.commandId : undefined,
        clientSeq: typeof msg.clientSeq === "number" ? msg.clientSeq : undefined,
        target,
        targetKey
      });
      renderHud();
      return;
    }

    if (msg.type === "FRONTIER_RESULT") {
      if (!matchesCurrentFrontierCommand(state, msg.commandId)) {
        attackSyncLog("frontier-result-ignored-command-mismatch", {
          actionType: msg.actionType,
          commandId: msg.commandId,
          clientSeq: msg.clientSeq,
          currentCommandId: state.actionCurrent?.commandId,
          currentClientSeq: state.actionCurrent?.clientSeq,
          currentAction: state.actionCurrent,
          actionTargetKey: state.actionTargetKey,
          target: msg.target,
          origin: msg.origin
        });
        return;
      }
      clearFrontierStatusAlert(state);
      attackSyncLog("frontier-result", {
        actionType: msg.actionType,
        commandId: msg.commandId,
        clientSeq: msg.clientSeq,
        target: msg.target,
        origin: msg.origin,
        startedAgoMs: state.actionStartedAt ? Date.now() - state.actionStartedAt : undefined,
        actionAcceptedAck: state.actionAcceptedAck,
        hadCombatStartAck: state.combatStartAck
      });
      const target = msg.target as { x: number; y: number } | undefined;
      const resultAlert = {
        title: "Territory Claimed",
        detail: target ? `Territory at (${target.x}, ${target.y}) was claimed.` : "Territory was claimed.",
        tone: "success" as const,
        ...(target ? { focusX: target.x, focusY: target.y, actionLabel: "Center" } : {})
      };
      // Waypoint-driven neutral EXPAND: skip both the popup and the
      // feed entry. The user already opted into the chain via Expand
      // Here; per-tile completion noise was the point of the silent
      // flow. Errors still surface via the captureAlert path above.
      const silentSuccess = Boolean(state.capture?.silent);
      if (!silentSuccess) {
        appendFeedEntry({
          title: resultAlert.title,
          text: resultAlert.detail,
          type: "combat",
          severity: "success",
          at: Date.now(),
          ...(typeof resultAlert.focusX === "number" && typeof resultAlert.focusY === "number"
            ? { focusX: resultAlert.focusX, focusY: resultAlert.focusY, actionLabel: resultAlert.actionLabel ?? "Center" }
            : {})
        });
        showCaptureAlert(resultAlert.title, resultAlert.detail, resultAlert.tone, undefined);
      }
      state.capture = undefined;
      frontierQueueDebug("frontier_result_received", {
        actionType: msg.actionType,
        target: msg.target,
        commandId: typeof msg.commandId === "string" ? msg.commandId : undefined,
        clientSeq: typeof msg.clientSeq === "number" ? msg.clientSeq : undefined
      });
      if (msg.actionType === "EXPAND" && target && currentActionCanResolveFromFrontierOwnership(keyFor(target.x, target.y))) {
        resolveFrontierCapture("FRONTIER_RESULT");
      }
      renderHud();
      return;
    }
    if (msg.type === "COMBAT_RESULT") {
      if (!matchesCurrentFrontierCommand(state, msg.commandId)) {
        attackSyncLog("combat-result-ignored-command-mismatch", {
          attackType: msg.attackType,
          commandId: msg.commandId,
          clientSeq: msg.clientSeq,
          currentCommandId: state.actionCurrent?.commandId,
          currentClientSeq: state.actionCurrent?.clientSeq,
          currentAction: state.actionCurrent,
          actionTargetKey: state.actionTargetKey,
          target: msg.target,
          origin: msg.origin
        });
        return;
      }
      clearFrontierStatusAlert(state);
      const resultReceivedAt = Date.now();
      const timing = msg.timing as { acceptedAt?: number; resolvesAt?: number; resultSentAt?: number } | undefined;
      if (
        typeof timing?.acceptedAt === "number" &&
        typeof timing?.resolvesAt === "number" &&
        typeof timing?.resultSentAt === "number"
      ) {
        console.info("[frontier-result-timing]", {
          attackType: msg.attackType,
          target: msg.target,
          acceptedAt: timing.acceptedAt,
          resolvesAt: timing.resolvesAt,
          resultSentAt: timing.resultSentAt,
          resultReceivedAt,
          timerDelayMs: timing.resultSentAt - timing.resolvesAt,
          deliveryDelayMs: resultReceivedAt - timing.resultSentAt,
          totalElapsedMs: resultReceivedAt - timing.acceptedAt
        });
      }
      attackSyncLog("combat-result", {
        attackType: msg.attackType,
        commandId: msg.commandId,
        clientSeq: msg.clientSeq,
        target: msg.target,
        origin: msg.origin,
        attackerWon: msg.attackerWon,
        startedAgoMs: state.actionStartedAt ? resultReceivedAt - state.actionStartedAt : undefined,
        actionAcceptedAck: state.actionAcceptedAck,
        hadCombatStartAck: state.combatStartAck
      });
      const commitOnlyResult =
        !("manpowerDelta" in msg) &&
        !("pillagedGold" in msg) &&
        !("pillagedStrategic" in msg) &&
        !("atkEff" in msg) &&
        !("defEff" in msg) &&
        !("winChance" in msg) &&
        !("pointsDelta" in msg);
      const lockedResult = state.pendingCombatReveal?.result;
      if (commitOnlyResult && lockedResult) applyCombatOutcomeMessage(lockedResult);
      else applyCombatOutcomeMessage(msg as Record<string, unknown>);
      return;
    }
      if (msg.type === "COMBAT_START") {
      if (typeof msg.commandId === "string" && msg.commandId.startsWith("territory-auto:muster-advance:")) {
        if (msg.result) applyCombatOutcomeMessage(msg.result as Record<string, unknown>); return;
      }
      if (!matchesCurrentFrontierCommand(state, msg.commandId)) {
        attackSyncLog("combat-start-ignored-command-mismatch", {
          attackType: (msg.result as { attackType?: string } | undefined)?.attackType,
          commandId: msg.commandId,
          clientSeq: msg.clientSeq,
          currentCommandId: state.actionCurrent?.commandId,
          currentClientSeq: state.actionCurrent?.clientSeq,
          currentAction: state.actionCurrent,
          actionTargetKey: state.actionTargetKey,
          target: msg.target,
          origin: msg.origin
        });
        return;
      }
      clearFrontierStatusAlert(state);
      const target = msg.target as { x: number; y: number };
      const resolvesAt = msg.resolvesAt as number;
      attackSyncLog("combat-start", {
        commandId: msg.commandId,
        clientSeq: msg.clientSeq,
        target,
        origin: msg.origin,
        resolvesAt,
        result: Boolean(msg.result),
        startedAgoMs: state.actionStartedAt ? Date.now() - state.actionStartedAt : undefined,
        currentAction: state.actionCurrent
      });
      const lockedResult = msg.result as { attackType?: string } | undefined;
      rebindLateFrontierAck(
        target,
        "COMBAT_START",
        (lockedResult?.attackType as "EXPAND" | "ATTACK" | undefined) ??
          state.actionCurrent?.actionType
      );
      if (lockedResult?.attackType === "EXPAND") applyAcceptedExpandOptimisticState(target);
      state.actionAcceptedAck = true;
      state.combatStartAck = true;
      state.actionAcceptTimeoutHandledAt = 0;
      const existingCapture =
        state.capture && state.capture.target.x === target.x && state.capture.target.y === target.y ? state.capture : undefined;
      const startAt = existingCapture?.startAt ?? Date.now();
      const resolvesAtForCapture = existingCapture ? Math.min(existingCapture.resolvesAt, resolvesAt) : resolvesAt;
      const preservedSilent = Boolean(existingCapture?.silent);
      const preservedFromMusterAdvance = Boolean(existingCapture?.fromMusterAdvance);
      state.capture = {
        startAt,
        resolvesAt: resolvesAtForCapture,
        target,
        ...(preservedSilent ? { silent: true } : {}),
        ...(preservedFromMusterAdvance ? { fromMusterAdvance: true } as const : {}),
      };
      const lockedCombatResult = msg.result as Record<string, unknown> | undefined;
      if (lockedCombatResult) {
        const predictedAlert = combatResolutionAlert(lockedCombatResult, {
          targetTileBefore: state.tiles.get(keyFor(target.x, target.y)),
          originTileBefore: (() => {
            const origin = lockedCombatResult.origin as { x: number; y: number } | undefined;
            return origin ? state.tiles.get(keyFor(origin.x, origin.y)) : undefined;
          })()
        });
        state.pendingCombatReveal = {
          targetKey: keyFor(target.x, target.y),
          title: predictedAlert.title,
          detail: predictedAlert.detail,
          tone: predictedAlert.tone,
          ...(typeof predictedAlert.manpowerLoss === "number" ? { manpowerLoss: predictedAlert.manpowerLoss } : {}),
          result: lockedCombatResult,
          revealed: false
        };
      } else if (state.pendingCombatReveal?.targetKey === keyFor(target.x, target.y)) {
        state.pendingCombatReveal = undefined;
      }
      state.actionInFlight = true;
      if (!state.actionStartedAt) state.actionStartedAt = startAt;
      state.actionTargetKey = keyFor(target.x, target.y);
      frontierQueueDebug("combat_start_applied", {
        commandId: typeof msg.commandId === "string" ? msg.commandId : undefined,
        clientSeq: typeof msg.clientSeq === "number" ? msg.clientSeq : undefined,
        target,
        resolvesAt,
        result: lockedCombatResult
      });
      renderHud();
      return;
    }

    if (msg.type === "ATTACK_ALERT") {
      const attackerName = (msg.attackerName as string | undefined) || (msg.attackerId as string | undefined) || "Unknown attacker";
      const x = Number(msg.x ?? -1);
      const y = Number(msg.y ?? -1);
      const resolvesAt = Number(msg.resolvesAt ?? Date.now() + 3000);
      const fromX = typeof msg.fromX === "number" ? Number(msg.fromX) : undefined;
      const fromY = typeof msg.fromY === "number" ? Number(msg.fromY) : undefined;
      if (x >= 0 && y >= 0) {
        state.incomingAttacksByTile.set(keyFor(x, y), { attackerName, resolvesAt });
      }
      state.unreadAttackAlerts += 1;
      appendFeedEntry({
        text: `Under attack: ${attackerName} is striking (${x}, ${y})${fromX !== undefined && fromY !== undefined ? ` from (${fromX}, ${fromY})` : ""}.`,
        type: "combat",
        severity: "error",
        at: Date.now(),
        focusX: x,
        focusY: y,
        actionLabel: "Center"
      });
      renderHud();
      return;
    }

    if (msg.type === "AIRPORT_BOMBARD_RESULT") {
      const targetableTiles = Number(msg.targetableTiles ?? 0);
      const hitTiles = Number(msg.hitTiles ?? 0);
      const missedTiles = Number(msg.missedTiles ?? 0);
      const x = Number(msg.x ?? -1);
      const y = Number(msg.y ?? -1);
      const rawTiles = Array.isArray(msg.tiles) ? (msg.tiles as Array<Record<string, unknown>>) : [];
      const tiles = rawTiles
        .map((t) => ({
          dx: Number(t.dx ?? 0),
          dy: Number(t.dy ?? 0),
          outcome: t.outcome === "hit" ? ("hit" as const) : ("miss" as const)
        }))
        .filter((t) => Number.isFinite(t.dx) && Number.isFinite(t.dy));
      if (x >= 0 && y >= 0 && tiles.length > 0) {
        state.bombardFxQueue.push({ x, y, queuedAt: Date.now(), tiles });
      }
      if (targetableTiles === 0) {
        pushFeedSafely("Bombardment found no enemy tiles in range.", "combat", "warn");
      } else if (missedTiles === 0) {
        pushFeedSafely(`Bombardment hit all ${hitTiles} target tile${hitTiles === 1 ? "" : "s"}.`, "combat", "success");
      } else {
        pushFeedSafely(
          `Bombardment hit ${hitTiles}/${targetableTiles} tiles — ${missedTiles} missed (forts reduce hit chance).`,
          "combat",
          hitTiles > 0 ? "warn" : "error"
        );
      }
      renderHud();
      return;
    }

    if (msg.type === "COMBAT_CANCELLED") {
      const cancelledCurrentKey = state.actionCurrent ? keyFor(state.actionCurrent.x, state.actionCurrent.y) : "";
      clearFrontierStatusAlert(state);
      state.capture = undefined;
      if (state.pendingCombatReveal?.targetKey === cancelledCurrentKey) state.pendingCombatReveal = undefined;
      state.actionInFlight = false;
      state.actionAcceptedAck = false;
      state.combatStartAck = false;
      state.actionAcceptTimeoutHandledAt = 0;
      state.actionStartedAt = 0;
      state.actionTargetKey = "";
      state.actionCurrent = undefined;
      clearLateFrontierAck(cancelledCurrentKey);
      if (cancelledCurrentKey) state.queuedTargetKeys.delete(cancelledCurrentKey);
      if (cancelledCurrentKey) clearOptimisticTileState(cancelledCurrentKey, true);
      state.autoSettleTargets.clear();
      pushFeed(`Capture cancelled (${(msg.count as number | undefined) ?? 1})`, "combat", "warn");
      renderHud();
      return;
    }

    if (msg.type === "FOG_UPDATE") {
      fogRevealLog("fog-update", {
        fogDisabled: msg.fogDisabled === true,
        authSessionReady: state.authSessionReady,
        eligible: state.mapRevealEligible
      });
      state.fogDisabled = Boolean(msg.fogDisabled);
      pushFeed(`Fog of war ${state.fogDisabled ? "disabled" : "enabled"}.`, "info", "info");
      requestViewRefresh(2, true);
      renderHud();
      return;
    }

    if (msg.type === "REVEAL_MAP_BEGIN") {
      activeRevealMapSnapshotId = typeof msg.snapshotId === "string" ? msg.snapshotId : "";
      activeRevealMapChunkCount = typeof msg.chunkCount === "number" ? msg.chunkCount : 0;
      activeRevealMapChunksApplied = 0;
      state.fogDisabled = true;
      pushFeed("Full-map reveal started.", "info", "info");
      renderHud();
      return;
    }

    if (msg.type === "REVEAL_MAP_CHUNK") {
      if (typeof msg.snapshotId === "string" && msg.snapshotId !== activeRevealMapSnapshotId) return;
      const tileUpdates =
        msg.tiles as Array<{ x: number; y: number; ownerId?: string; ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN" }> | undefined;
      applyGatewayTileDeltaBatch(
        {
          state,
          keyFor,
          mergeIncomingTileDetail,
          mergeServerTileWithOptimisticState
        },
        tileUpdates
      );
      activeRevealMapChunksApplied += 1;
      state.firstChunkAt = Date.now();
      state.chunkFullCount = Math.max(state.chunkFullCount, activeRevealMapChunksApplied);
      state.hasOwnedTileInCache = true;
      if (activeRevealMapChunksApplied % 8 === 0 || activeRevealMapChunksApplied === activeRevealMapChunkCount) {
        requestViewRefresh(2, true);
      }
      return;
    }

    if (msg.type === "REVEAL_MAP_END") {
      if (typeof msg.snapshotId === "string" && msg.snapshotId !== activeRevealMapSnapshotId) return;
      requestViewRefresh(2, true);
      pushFeed("Full-map reveal loaded.", "info", "info");
      renderHud();
      return;
    }

    if (msg.type === "TILE_SNAPSHOT_REPLACE") {
      const tileUpdates =
        msg.tiles as Array<{ x: number; y: number; ownerId?: string; ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN" }> | undefined;
      const appliedTileCount = applyGatewayInitialState(
        {
          state,
          keyFor,
          mergeIncomingTileDetail,
          mergeServerTileWithOptimisticState
        },
        tileUpdates ? { tiles: tileUpdates } : undefined
      );
      fogRevealLog("tile-snapshot-replace", {
        tileCount: Array.isArray(tileUpdates) ? tileUpdates.length : 0,
        appliedTileCount,
        fogDisabled: state.fogDisabled,
        eligible: state.mapRevealEligible
      });
      if (appliedTileCount > 0) {
        state.firstChunkAt = Date.now();
        state.chunkFullCount = Math.max(state.chunkFullCount, 1);
        state.hasOwnedTileInCache = [...state.tiles.values()].some((tile) => tile.ownerId === state.me);
      }
      requestViewRefresh(2, true);
      renderHud();
      return;
    }

    if (msg.type === "TILE_DELTA_BATCH") {
      handleTileDeltaBatchMessage(msg, {
        state,
        keyFor,
        mergeIncomingTileDetail,
        mergeServerTileWithOptimisticState,
        clearRenderCaches,
        buildMiniMapBase,
        frontierQueueDebug,
        clearLateFrontierAck,
        currentActionCanResolveFromFrontierOwnership,
        currentActionCanResolveFromPostCombatTileSync,
        resolveFrontierCapture,
        openSingleTileActionMenu,
        renderHud,
        requestViewRefresh
      });
      return;
    }

    if (msg.type === "TILE_DELTA") {
      const updates = (msg.updates as any[]) ?? [];
      const deltaTouchesFrontierQueue = updates.some((update) => {
        const updateKey = keyFor(update.x, update.y);
        if (updateKey === state.actionTargetKey) return true;
        if (state.queuedTargetKeys.has(updateKey)) return true;
        return state.actionQueue.some((entry) => keyFor(entry.x, entry.y) === updateKey);
      });
      if (deltaTouchesFrontierQueue) {
        frontierQueueDebug("tile_delta_matches_frontier_target", {
          updates: updates.map((update) => ({
            key: keyFor(update.x, update.y),
            ownerId: update.ownerId,
            ownershipState: update.ownershipState
          }))
        });
      }
      let resolvedQueuedFrontierCapture = false;
      let detailRequests = 0;
      for (const update of updates) {
        const gatewayNormalizedUpdate =
          ("townJson" in update ||
            "townType" in update ||
            "townName" in update ||
            "townPopulationTier" in update ||
            "fortJson" in update ||
            "observatoryJson" in update ||
            "siegeOutpostJson" in update ||
            "economicStructureJson" in update ||
            "sabotageJson" in update ||
            "shardSiteJson" in update ||
            "musterJson" in update ||
            "dockId" in update)
            ? normalizeGatewayTileUpdate(update, {
                existing: state.tiles.get(keyFor(update.x, update.y)),
                tiles: state.tiles,
                keyFor,
                foodCoverage: state.upkeepLastTick.foodCoverage
              })
            : {};
        // Do NOT inject ownerId/ownershipState/capital: undefined when the
        // server's update omits them. Omission means "unchanged" (sparse
        // delta semantics) -- the server now always includes these fields
        // when they actually change (see #774/#777/#779). Treating omission
        // as an implicit clear was a workaround for stale barbarian
        // ownership that instead wiped correct ownership on any tile whose
        // update happened to omit these fields, e.g. a REQUEST_TILE_DETAIL
        // response built from an incomplete server-side cache entry.
        const normalizedUpdate = { ...update };
        Object.assign(normalizedUpdate, gatewayNormalizedUpdate);
        const updateKey = keyFor(update.x, update.y);
        state.incomingAttacksByTile.delete(updateKey);
        state.pendingCollectVisibleKeys.delete(keyFor(update.x, update.y));
        const existing = state.tiles.get(keyFor(update.x, update.y));
        const previousTerrain = existing?.terrain;
        const previousLandBiome = existing?.landBiome;
        const previousRegionType = existing?.regionType;
        const merged: any = existing
          ? { ...existing, x: normalizedUpdate.x, y: normalizedUpdate.y }
          : { x: normalizedUpdate.x, y: normalizedUpdate.y, terrain: normalizedUpdate.terrain ?? "LAND" };
        const terrainChanged = "terrain" in normalizedUpdate;
        if (normalizedUpdate.terrain) merged.terrain = normalizedUpdate.terrain;
        if ("detailLevel" in normalizedUpdate) merged.detailLevel = normalizedUpdate.detailLevel;
        if (normalizedUpdate.fogged !== undefined) merged.fogged = normalizedUpdate.fogged;
        const clearRuntimeLandContext = merged.terrain !== "LAND" || normalizedUpdate.fogged === true;
        if (clearRuntimeLandContext) {
          delete merged.landBiome;
          delete merged.regionType;
        } else if (terrainChanged) {
          if (!("landBiome" in normalizedUpdate)) delete merged.landBiome;
          if (!("regionType" in normalizedUpdate)) delete merged.regionType;
        }
        // resource/dockId stay inline: unlike the gateway path, this handler
        // only ever SETS these fields on a defined value -- it has no
        // delete-on-falsy branch, so it must not be routed through the
        // shared helper (which does delete on falsy).
        if (normalizedUpdate.resource !== undefined) merged.resource = normalizedUpdate.resource;
        // capital/breachShockUntil/clusterId/clusterType/dock are TILE_DELTA-only
        // fields -- the gateway path has no equivalent handling for them.
        if ("capital" in normalizedUpdate) {
          if (normalizedUpdate.capital) merged.capital = normalizedUpdate.capital;
          else delete merged.capital;
        }
        if ("breachShockUntil" in normalizedUpdate) {
          if (typeof normalizedUpdate.breachShockUntil === "number") merged.breachShockUntil = normalizedUpdate.breachShockUntil;
          else delete merged.breachShockUntil;
        }
        if (normalizedUpdate.clusterId !== undefined) merged.clusterId = normalizedUpdate.clusterId;
        if (normalizedUpdate.clusterType !== undefined) merged.clusterType = normalizedUpdate.clusterType;
        if (normalizedUpdate.landBiome !== undefined) merged.landBiome = normalizedUpdate.landBiome;
        if (normalizedUpdate.regionType !== undefined) merged.regionType = normalizedUpdate.regionType;
        if (normalizedUpdate.dockId !== undefined) merged.dockId = normalizedUpdate.dockId;
        if ("dock" in normalizedUpdate) {
          if (normalizedUpdate.dock) merged.dock = normalizedUpdate.dock;
          else delete merged.dock;
        }
        applyCommonTileFields(existing, merged, normalizedUpdate, { me: state.me });
        if (tileMatchesDebugKey(normalizedUpdate.x, normalizedUpdate.y, 0, { fallbackTile: state.selected }) && verboseTileDebugEnabled()) {
          debugTileLog("tile-delta-fort-field", {
            x: normalizedUpdate.x,
            y: normalizedUpdate.y,
            detailLevel: normalizedUpdate.detailLevel ?? existing?.detailLevel ?? null,
            hasFortField: "fort" in normalizedUpdate,
            incomingFort: "fort" in normalizedUpdate ? normalizedUpdate.fort ?? null : "__omitted__",
            existingFort: existing?.fort
              ? {
                  ownerId: existing.fort.ownerId,
                  status: existing.fort.status,
                  disabledUntil: existing.fort.disabledUntil ?? null,
                  completesAt: existing.fort.completesAt ?? null
                }
              : null,
            mergedFort: merged.fort
              ? {
                  ownerId: merged.fort.ownerId,
                  status: merged.fort.status,
                  disabledUntil: merged.fort.disabledUntil ?? null,
                  completesAt: merged.fort.completesAt ?? null
                }
              : null
          });
        }
        const resolved = mergeServerTileWithOptimisticState(mergeIncomingTileDetail(existing, merged));
        state.tiles.set(updateKey, resolved); state.tilesRevision += 1;
        if (previousTerrain !== resolved.terrain || previousLandBiome !== resolved.landBiome || previousRegionType !== resolved.regionType) {
          clearRenderCaches();
          buildMiniMapBase();
        }
        refreshGatewayDerivedTownSummariesAroundTile({ state, keyFor }, resolved.x, resolved.y);
        logFrontierTimeline("frontier-delta-apply", resolved.x, resolved.y, {
          before: existing,
          incoming: normalizedUpdate,
          after: resolved,
          extra: {
            source: "TILE_DELTA",
            updateHasEconomicStructure: "economicStructure" in normalizedUpdate
          }
        });
        logDebugTileState("tile-delta", resolved, {
          source: "TILE_DELTA",
          updateHasEconomicStructure: "economicStructure" in normalizedUpdate,
          updateEconomicStructure: normalizedUpdate.economicStructure?.type,
          existingEconomicStructure: existing?.economicStructure?.type
        });
        if (
          existing?.ownerId !== resolved.ownerId ||
          existing?.ownershipState !== resolved.ownershipState ||
          updateKey === state.actionTargetKey ||
          state.settleProgressByTile.has(updateKey)
        ) {
          logTileSync("tile_delta_applied", {
            tileKey: updateKey,
            existingOwnerId: existing?.ownerId,
            existingOwnershipState: existing?.ownershipState,
            updateOwnerId: "ownerId" in normalizedUpdate ? normalizedUpdate.ownerId ?? null : "__omitted__",
            updateOwnershipState: "ownershipState" in normalizedUpdate ? normalizedUpdate.ownershipState ?? null : "__omitted__",
            resolvedOwnerId: resolved.ownerId,
            resolvedOwnershipState: resolved.ownershipState,
            optimisticPending: resolved.optimisticPending
          });
        }
        if (resolved.ownerId === state.me && (resolved.ownershipState === "FRONTIER" || resolved.ownershipState === "SETTLED")) {
          state.frontierSyncWaitUntilByTarget.delete(updateKey);
          clearLateFrontierAck(updateKey);
          state.actionQueue = state.actionQueue.filter((entry) => keyFor(entry.x, entry.y) !== updateKey);
          state.queuedTargetKeys.delete(updateKey);
          logFrontierTimeline("frontier-queue-resolved-by-delta", resolved.x, resolved.y, {
            before: existing,
            after: resolved,
            extra: {
              source: "TILE_DELTA"
            }
          });
        }
        maybeAnnounceShardSite(existing, resolved);
        if (!resolved.optimisticPending) clearOptimisticTileState(updateKey);
        markDockDiscovered(resolved);
        state.discoveredTiles.add(updateKey);
        // Stamp receivedAt whenever a full-detail tile lands so the action-flow
        // sender's 60s freshness check and in-flight dedupe can short-circuit
        // duplicate REQUEST_TILE_DETAIL on rapid re-clicks of the same tile.
        if (resolved.detailLevel === "full") {
          state.tileDetailReceivedAt.set(updateKey, Date.now());
        }
        if (detailRequests < 4) {
          const before = state.tileDetailRequestedAt.get(updateKey) ?? 0;
          maybeRequestTileDetail(resolved);
          const after = state.tileDetailRequestedAt.get(updateKey) ?? 0;
          if (after > before) detailRequests += 1;
        }
        if (
          deps.settlementProgressForTile(update.x, update.y) &&
          (resolved.ownerId !== state.me || (resolved.ownershipState !== "FRONTIER" && resolved.ownershipState !== "SETTLED"))
        ) {
          clearSettlementProgressForTile(update.x, update.y);
        } else if (resolved.ownerId === state.me && resolved.ownershipState === "SETTLED") {
          clearSettlementProgressForTile(update.x, update.y);
        }
        if (
          !resolvedQueuedFrontierCapture &&
          updateKey === state.actionTargetKey &&
          ((currentActionCanResolveFromFrontierOwnership(updateKey) &&
            resolved.ownerId === state.me &&
            resolved.ownershipState === "FRONTIER") ||
            currentActionCanResolveFromPostCombatTileSync(updateKey))
        ) {
          resolvedQueuedFrontierCapture = true;
        }
      }
      if (resolvedQueuedFrontierCapture) {
        resolveFrontierCapture("TILE_DELTA");
        renderHud();
      }
      return;
    }

    if (msg.type === "TECH_UPDATE") {
      logIncomingTechPayload("TECH_UPDATE", {
        techIds: msg.techIds,
        nextChoices: msg.nextChoices,
        techCatalog: msg.techCatalog,
        currentResearch: msg.currentResearch,
        techRootId: msg.techRootId,
        availableTechPicks: msg.availableTechPicks
      });
      console.info("[tech] TECH_UPDATE received", {
        status: msg.status,
        techRootId: msg.techRootId,
        ownedTechs: (msg.techIds as string[])?.length ?? 0,
        nextChoices: (msg.nextChoices as string[])?.length ?? 0,
        techCatalogCount: (msg.techCatalog as any[] | undefined)?.length ?? 0
      });
      applyTechUpdateToState(state, {
        status: msg.status as "started" | "completed" | undefined,
        techRootId: msg.techRootId as string | undefined,
        currentResearch: (msg.currentResearch as typeof state.currentResearch | undefined) ?? undefined,
        techIds: (msg.techIds as string[]) ?? [],
        nextChoices: (msg.nextChoices as string[]) ?? [],
        availableTechPicks: (msg.availableTechPicks as number) ?? state.availableTechPicks,
        developmentProcessLimit: (msg.developmentProcessLimit as number | undefined) ?? state.developmentProcessLimit,
        activeDevelopmentProcessCount:
          (msg.activeDevelopmentProcessCount as number | undefined) ?? state.activeDevelopmentProcessCount,
        mods: (msg.mods as typeof state.mods) ?? state.mods,
        modBreakdown: (msg.modBreakdown as typeof state.modBreakdown | undefined) ?? state.modBreakdown,
        incomePerMinute: (msg.incomePerMinute as number) ?? state.incomePerMinute,
        missions: (msg.missions as any[]) ?? state.missions,
        techCatalog: (msg.techCatalog as any[]) ?? state.techCatalog,
        domainIds: (msg.domainIds as string[]) ?? state.domainIds,
        domainChoices: (msg.domainChoices as string[]) ?? state.domainChoices,
        domainCatalog: (msg.domainCatalog as any[]) ?? state.domainCatalog,
        revealCapacity: (msg.revealCapacity as number) ?? state.revealCapacity,
        activeRevealTargets: (msg.activeRevealTargets as string[]) ?? state.activeRevealTargets,
        gold: typeof msg.gold === "number" ? msg.gold : undefined,
        strategicResources: (msg.strategicResources as typeof state.strategicResources | undefined) ?? undefined
      }, pushFeed);
      if (typeof msg.activeDevelopmentProcessCount === "number") clearQueuedDevelopmentDispatchPending();
      renderHud();
      return;
    }

    if (msg.type === "DOMAIN_UPDATE") {
      state.pendingDomainUnlockId = "";
      state.developmentProcessLimit = (msg.developmentProcessLimit as number | undefined) ?? state.developmentProcessLimit;
      if (typeof msg.activeDevelopmentProcessCount === "number") clearQueuedDevelopmentDispatchPending();
      state.activeDevelopmentProcessCount =
        (msg.activeDevelopmentProcessCount as number | undefined) ?? state.activeDevelopmentProcessCount;
      state.domainIds = (msg.domainIds as string[]) ?? state.domainIds;
      const domainUpdateTrickle = (msg as { chosenTrickleResource?: unknown }).chosenTrickleResource;
      if (isChosenTrickleResource(domainUpdateTrickle)) state.chosenTrickleResource = domainUpdateTrickle;
      state.domainChoices = (msg.domainChoices as string[]) ?? state.domainChoices;
      state.domainCatalog = (msg.domainCatalog as any[]) ?? state.domainCatalog;
      state.revealCapacity = (msg.revealCapacity as number) ?? state.revealCapacity;
      state.activeRevealTargets = (msg.activeRevealTargets as string[]) ?? state.activeRevealTargets;
      state.mods = (msg.mods as typeof state.mods) ?? state.mods;
      state.modBreakdown = (msg.modBreakdown as typeof state.modBreakdown | undefined) ?? state.modBreakdown;
      state.incomePerMinute = (msg.incomePerMinute as number) ?? state.incomePerMinute;
      state.missions = (msg.missions as any[]) ?? state.missions;
      if (typeof msg.gold === "number") state.gold = msg.gold;
      if (msg.strategicResources && typeof msg.strategicResources === "object") {
        state.strategicResources = {
          ...state.strategicResources,
          ...(msg.strategicResources as Partial<typeof state.strategicResources>)
        };
      }
      pushFeed(`Domain chosen: ${state.domainIds[state.domainIds.length - 1] ?? "unknown"}`, "tech", "success");
      renderHud();
      return;
    }

    if (msg.type === "REVEAL_EMPIRE_UPDATE") {
      state.activeRevealTargets = (msg.activeTargets as string[]) ?? state.activeRevealTargets;
      state.revealCapacity = (msg.revealCapacity as number) ?? state.revealCapacity;
      renderHud();
      return;
    }

    if (msg.type === "REVEAL_EMPIRE_STATS_RESULT") {
      const stats = isRevealEmpireStatsView(msg.stats) ? msg.stats : undefined;
      if (stats) {
        state.revealedEmpireStatsByPlayer.set(stats.playerId, stats);
        state.activeRevealEmpireStatsPopup = stats;
        pushFeed(revealEmpireStatsFeedText(stats), "combat", "success");
      }
      renderHud();
      return;
    }

    if (msg.type === "SURVEY_SWEEP_RESULT") {
      const nowMs = Date.now();
      const pings = surveySweepPingsFromPayload(msg.pings);
      state.surveySweepPings.push(...pings.map((ping) => ({ ...ping, createdAt: nowMs, expiresAt: nowMs + 12_000 })));
      logSurveySweepReceived(msg.pings, pings, state.surveySweepPings.length);
      const resourceCount = pings.filter((ping) => ping.kind === "resource").length;
      const townCount = pings.filter((ping) => ping.kind === "town").length;
      pushFeed(`Survey Sweep found ${resourceCount} resource ${resourceCount === 1 ? "site" : "sites"} and ${townCount} ${townCount === 1 ? "town" : "towns"} outside current vision.`, "info", "success");
      renderHud();
      return;
    }

    if (msg.type === "ALLIANCE_REQUEST_INCOMING") {
      const request = (msg.request as any) ?? undefined;
      if (request && !state.incomingAllianceRequests.some((existing: any) => existing.id === request.id)) {
        const fromName = msg.fromName as string | undefined;
        if (fromName) request.fromName = fromName;
        state.incomingAllianceRequests.push(request);
      }
      notifyIncomingAllianceRequest(state, request, { pushFeed, showCaptureAlert: showCaptureAlertSafely });
      renderHud();
      return;
    }

    if (msg.type === "ALLIANCE_REQUESTED") {
      const request = msg.request as any;
      if (request && !state.outgoingAllianceRequests.some((existing: any) => existing.id === request.id)) {
        state.outgoingAllianceRequests.push(request);
      }
      const targetName =
        (msg.targetName as string | undefined) ??
        request?.toName ??
        (request ? playerNameForOwner(request.toPlayerId) : undefined);
      pushFeed(`Alliance request sent${targetName ? ` to ${targetName}` : ""}`, "alliance", "success");
      renderHud();
      return;
    }

    if (msg.type === "ALLIANCE_UPDATE") {
      state.allies = (msg.allies as string[]) ?? [];
      state.activeAllianceBreaks = (msg.activeAllianceBreaks as any[] | undefined) ?? state.activeAllianceBreaks;
      state.recentAllianceBreaks = (msg.recentAllianceBreaks as any[] | undefined) ?? state.recentAllianceBreaks;
      state.incomingAllianceRequests = (msg.incomingAllianceRequests as any[] | undefined) ?? state.incomingAllianceRequests;
      state.outgoingAllianceRequests = (msg.outgoingAllianceRequests as any[] | undefined) ?? state.outgoingAllianceRequests;
      const announcement = msg.announcement as string | undefined;
      if (announcement) {
        const normalizedAnnouncement = announcement.toLocaleLowerCase();
        const fullyBroken = normalizedAnnouncement.includes("now broken");
        pushFeed(announcement, "alliance", fullyBroken ? "warn" : "info");
        showCaptureAlertSafely(fullyBroken ? "Alliance broken" : "Alliance break notice", announcement, fullyBroken ? "warn" : "info");
      }
      pushFeed(`Alliances updated (${state.allies.length})`, "alliance", "info");
      renderHud();
      return;
    }

    if (msg.type === "TRUCE_REQUEST_INCOMING") {
      const request = (msg.request as any) ?? undefined;
      if (request) {
        const fromName = msg.fromName as string | undefined;
        if (fromName) request.fromName = fromName;
        state.incomingTruceRequests = [...state.incomingTruceRequests.filter((entry: any) => entry.id !== request.id), request];
      }
      notifyIncomingTruceRequest(state, request, { pushFeed, showCaptureAlert: showCaptureAlertSafely });
      renderHud();
      return;
    }

    if (msg.type === "TRUCE_REQUESTED") {
      const request = msg.request as any;
      const targetName = (msg.targetName as string | undefined) ?? request?.toName ?? (request ? playerNameForOwner(request.toPlayerId) : undefined);
      pushFeed(`Truce offered${targetName ? ` to ${targetName}` : ""}.`, "alliance", "success");
      renderHud();
      return;
    }

    if (msg.type === "TRUCE_UPDATE") {
      state.activeTruces = (msg.activeTruces as any[]) ?? state.activeTruces;
      state.incomingTruceRequests = (msg.incomingTruceRequests as any[]) ?? state.incomingTruceRequests;
      state.outgoingTruceRequests = (msg.outgoingTruceRequests as any[]) ?? state.outgoingTruceRequests;
      const announcement = msg.announcement as string | undefined;
      if (announcement) {
        const normalizedAnnouncement = announcement.toLocaleLowerCase();
        const declined = normalizedAnnouncement.includes("declined");
        const broken = normalizedAnnouncement.includes("broke the truce");
        const tone = declined || broken ? "warn" : "success";
        pushFeed(announcement, "alliance", tone);
        showCaptureAlertSafely(declined ? "Truce declined" : broken ? "Truce broken" : "Truce accepted", announcement, tone);
      }
      renderHud();
      return;
    }

    if (msg.type === "AETHER_BRIDGE_UPDATE") {
      state.activeAetherBridges = (msg.bridges as any[]) ?? state.activeAetherBridges;
      renderHud();
      return;
    }

    if (msg.type === "AETHER_WALL_UPDATE") {
      state.activeAetherWalls = (msg.walls as any[]) ?? state.activeAetherWalls;
      renderHud();
      return;
    }

    if (msg.type === "STRATEGIC_REPLAY_EVENT") {
      const event = (msg.event as any) ?? undefined;
      if (event) {
        state.strategicReplayEvents.push(event);
        if (!state.replayActive) resetStrategicReplayState();
        else if (!state.replayPlaying && state.replayIndex >= Math.max(0, state.strategicReplayEvents.length - 2)) {
          resetStrategicReplayState();
        }
      }
      renderHud();
      return;
    }

    if (msg.type === "SEASON_VICTORY_UPDATE") {
      state.seasonVictory = (msg.objectives as any[]) ?? state.seasonVictory;
      state.seasonWinner = (msg.seasonWinner as any | undefined) ?? state.seasonWinner;
      const announcement = msg.announcement as string | undefined;
      if (announcement) pushFeed(announcement, "info", "warn");
      renderHud();
      return;
    }

    if (msg.type === "SEASON_WINNER_CROWNED") {
      state.seasonWinner = (msg.winner as any | undefined) ?? state.seasonWinner;
      state.seasonVictory = (msg.objectives as any[] | undefined) ?? state.seasonVictory;
      state.leaderboard = (msg.leaderboard as typeof state.leaderboard | undefined) ?? state.leaderboard;
      if (state.seasonWinner) {
        pushFeed(`${state.seasonWinner.playerName} was crowned season winner via ${state.seasonWinner.objectiveName}.`, "info", "warn");
        state.activePanel = "leaderboard";
      }
      renderHud();
      return;
    }

    if (msg.type === "ERROR") {
      // Defense-in-depth against upstream labeling bugs (see #233 / the
      // TILE_YIELD_ANCHOR_UPDATED fallthrough). Every legitimate rejection
      // emitter sets a non-empty code, so an ERROR with both code and
      // message empty is by construction a proto3-default leak from an
      // event the gateway mis-tagged. Drop it, but log the first occurrence
      // per session at warn level so a fresh upstream bug isn't silent.
      const rawCode = typeof msg.code === "string" ? msg.code : "";
      const rawMessage = typeof msg.message === "string" ? msg.message : "";
      if (rawCode.length === 0 && rawMessage.length === 0) {
        if (!emptyServerErrorWarned) {
          emptyServerErrorWarned = true;
          console.warn("[server-error] dropping empty ERROR (likely upstream labeling bug)", { msg });
        }
        return;
      }
      if ((msg.code as string | undefined)?.startsWith("COLLECT")) {
        state.pendingCollectVisibleKeys.clear();
        revertOptimisticVisibleCollectDelta();
        const collectTileKey = typeof msg.x === "number" && typeof msg.y === "number" ? keyFor(Number(msg.x), Number(msg.y)) : "";
        if (collectTileKey) revertOptimisticTileCollectDelta(collectTileKey);
        const pending = state.pendingShardCollect;
        if (pending && msg.code === "COLLECT_NOT_OWNED") {
          const tile = state.tiles.get(pending.tileKey);
          if (tile) state.tiles.set(pending.tileKey, { ...tile, shardSite: pending.shardSite });
          renderHud();
        }
        state.pendingShardCollect = undefined;
      }
      const failedTargetKey = state.actionTargetKey;
      const failedTargetTile = failedTargetKey ? state.tiles.get(failedTargetKey) : undefined;
      const errorCode = String(msg.code ?? "");
      const errorMessage = String(msg.message ?? "unknown failure");
      if (errorCode.startsWith("TECH_") && state.pendingTechUnlockId) {
        state.pendingTechUnlockId = "";
        state.currentResearch = undefined;
      }
      if (errorCode.startsWith("DOMAIN_") && state.pendingDomainUnlockId) {
        state.pendingDomainUnlockId = "";
      }
      if (errorCode === "COLOR_TAKEN" || errorCode === "COLOR_INVALID") {
        authProfileColorEl.value = state.playerColors.get(state.me) ?? authProfileColorEl.value;
        const suggestion = typeof (msg as any).suggestion === "string" ? (msg as any).suggestion : undefined;
        setAuthStatus(
          `${errorMessage}${suggestion ? ` Try: ${suggestion}` : ""}`,
          "error"
        );
        syncAuthOverlay();
        return;
      }
      const errorTileKey = typeof msg.x === "number" && typeof msg.y === "number" ? keyFor(Number(msg.x), Number(msg.y)) : state.latestSettleTargetKey;
      const backendUnavailableError = errorCode === "SIMULATION_UNAVAILABLE" || errorCode === "SERVER_STARTING";
      const serverErrorContext = {
        code: msg.code,
        message: msg.message,
        playerGold: state.gold,
        playerStrategicResources: { ...state.strategicResources },
        actionInFlight: state.actionInFlight,
        actionTargetKey: failedTargetKey,
        actionTargetTile: failedTargetTile
          ? {
              x: failedTargetTile.x,
              y: failedTargetTile.y,
              ownerId: failedTargetTile.ownerId,
              ownershipState: failedTargetTile.ownershipState,
              optimisticPending: failedTargetTile.optimisticPending,
              detailLevel: failedTargetTile.detailLevel
            }
          : undefined,
        actionCurrent: state.actionCurrent,
        queuedActions: state.actionQueue.length,
        selected: state.selected,
        hover: state.hover
      };
      const failedCurrentKey = state.actionCurrent ? keyFor(state.actionCurrent.x, state.actionCurrent.y) : "";
      const rollbackBackendUnavailableOptimisticState = (): Set<string> => {
        const targetKeys = new Set<string>();
        if (errorTileKey) targetKeys.add(errorTileKey);
        if (failedTargetKey) targetKeys.add(failedTargetKey);
        if (failedCurrentKey) targetKeys.add(failedCurrentKey);
        if (state.latestSettleTargetKey) targetKeys.add(state.latestSettleTargetKey);
        if (state.lastDevelopmentAttempt?.tileKey) targetKeys.add(state.lastDevelopmentAttempt.tileKey);
        for (const tileKey of targetKeys) {
          clearOptimisticTileStateSafely(tileKey, true);
          clearSettlementProgressSafely(tileKey);
          state.queuedTargetKeys.delete(tileKey);
          dropQueuedTargetKeyIfAbsent(tileKey);
          state.autoSettleTargets.delete(tileKey);
        }
        if (backendUnavailableError) {
          state.capture = undefined;
          state.actionInFlight = false;
          state.actionAcceptedAck = false;
          state.combatStartAck = false;
          state.actionAcceptTimeoutHandledAt = 0;
          state.actionStartedAt = 0;
          state.actionTargetKey = "";
          state.actionCurrent = undefined;
          state.queuedDevelopmentDispatchPending = false;
          if (state.lastDevelopmentAttempt && targetKeys.has(state.lastDevelopmentAttempt.tileKey)) state.lastDevelopmentAttempt = undefined;
          state.actionQueue = state.actionQueue.filter((entry) => !targetKeys.has(keyFor(entry.x, entry.y)));
        }
        return targetKeys;
      };
      const duplicateAcceptedFrontierCooldown =
        errorCode === "ATTACK_COOLDOWN" &&
        state.actionAcceptedAck &&
        Boolean(failedTargetKey) &&
        (!state.actionCurrent || keyFor(state.actionCurrent.x, state.actionCurrent.y) === failedTargetKey);
      if (duplicateAcceptedFrontierCooldown) {
        const cooldownRemainingMs =
          typeof msg.cooldownRemainingMs === "number" && Number.isFinite(msg.cooldownRemainingMs)
            ? Math.max(0, msg.cooldownRemainingMs)
            : COMBAT_LOCK_MS;
        state.frontierSyncWaitUntilByTarget.set(failedTargetKey, Date.now() + cooldownRemainingMs);
        attackSyncLog("duplicate-accepted-cooldown-ignored", {
          targetKey: failedTargetKey,
          cooldownRemainingMs,
          combatStartAck: state.combatStartAck,
          capture: state.capture
            ? {
                target: state.capture.target,
                resolvesAt: state.capture.resolvesAt
              }
            : undefined
        });
        requestViewRefreshSafely(1, true);
        renderHud();
        return;
      }
      if (errorMessage.includes("development slots are busy")) {
        logTileSync("development_slot_busy_error", {
          code: errorCode,
          message: errorMessage,
          errorTileKey,
          activeDevelopmentProcessCount: state.activeDevelopmentProcessCount,
          developmentProcessLimit: state.developmentProcessLimit,
          developmentQueueLength: state.developmentQueue.length,
          queuedDevelopmentDispatchPending: state.queuedDevelopmentDispatchPending,
          lastDevelopmentAttempt: state.lastDevelopmentAttempt ?? null,
          settleProgressKeys: [...state.settleProgressByTile.keys()]
        });
      }
      if (typeof msg.x === "number" && typeof msg.y === "number") {
        logFrontierTimeline("frontier-error", Number(msg.x), Number(msg.y), {
          before: state.tiles.get(errorTileKey),
          after: state.tiles.get(errorTileKey),
          extra: {
            code: errorCode,
            message: errorMessage
          }
        });
      }
      if (maybeRecoverBusyDevelopmentAttempt(errorCode, errorMessage, errorTileKey)) return;
      const failureExplanationOptions = {
        ...(typeof msg.cooldownRemainingMs === "number" ? { cooldownRemainingMs: msg.cooldownRemainingMs } : {}),
        formatCooldownShort
      };
      const actionFailureExplanation = explainActionFailureSafely(errorCode, errorMessage, failureExplanationOptions);
      const notificationCategory = notificationCategoryForServerError(errorCode);
      const isDiplomacyError = errorCode.startsWith("TRUCE_") || errorCode.startsWith("ALLIANCE_");
      recordClientDebugEvent("error", "server-error", "message", serverErrorContext);
      console.error("[server-error]", serverErrorContext);
      let backendUnavailableRollbackKeys = new Set<string>();
      if (backendUnavailableError) {
        backendUnavailableRollbackKeys = rollbackBackendUnavailableOptimisticState();
        frontierQueueDebug("backend_unavailable_roll_back", {
          code: errorCode,
          message: errorMessage,
          rolledBackKeys: [...backendUnavailableRollbackKeys]
        });
        if (backendUnavailableRollbackKeys.size > 0 && shouldShowBackendUnavailableAlert()) {
          showCaptureAlertSafely(
            "Simulation unavailable",
            `${actionFailureExplanation}. Local action progress was rolled back. Please retry in a few seconds.`,
            "error"
          );
        }
      }
      if (errorCode === "AUTH_FAIL" || errorCode === "NO_AUTH" || errorCode === "AUTH_UNAVAILABLE" || errorCode === "SERVER_STARTING" || errorCode === "SERVER_BUSY") {
        state.authSessionReady = false;
        if ((errorCode === "AUTH_UNAVAILABLE" || errorCode === "SERVER_STARTING" || errorCode === "SERVER_BUSY") && firebaseAuth?.currentUser) {
          state.connection = ws.readyState === ws.OPEN ? "connected" : "disconnected";
          state.mapLoadStartedAt = Date.now();
          state.firstChunkAt = 0;
          state.chunkFullCount = 0;
          state.authBusyTitle = "Securing session";
          state.authBusyDetail =
            errorCode === "SERVER_STARTING"
              ? serverStartingBusyMessages(msg.backlogDegraded === true).detail
              : "Google account connected, but the authentication service did not answer in time. Retrying...";
          scheduleAuthReconnect(
            errorCode === "SERVER_STARTING"
              ? serverStartingBusyMessages(msg.backlogDegraded === true).retryStatus
              : "Google account connected. Waiting for the game server to finish authorizing..."
          );
          return;
        }
        if (errorCode === "AUTH_FAIL" && firebaseAuth?.currentUser && !state.authRetrying) {
          setAuthBusy(true);
          state.authRetrying = true;
          state.authBusyTitle = "Securing session";
          state.authBusyDetail = "Refreshing your Firebase session after a server auth failure.";
          setAuthStatus("Refreshing Firebase session...");
          syncAuthOverlay();
          void authenticateSocket(true)
            .catch(() => {
              setAuthBusy(false);
              state.authRetrying = false;
              state.authBusyTitle = "";
              state.authBusyDetail = "";
              setAuthStatus(errorMessage, "error");
              syncAuthOverlay();
            });
          renderHud();
          return;
        }
        setAuthBusy(false);
        state.authRetrying = false;
        state.authBusyTitle = "";
        state.authBusyDetail = "";
        setAuthStatus(errorMessage, "error");
        syncAuthOverlay();
      }
      const isStructureActionError =
        // Generic BUILD_INVALID is emitted for town-attached structure failures
        // (e.g. "town already has granary", "needs an open support tile"). Without
        // it here, the user's stale view of the tile is never reconciled and they
        // keep being told the action is invalid for an "empty" tile that already
        // has the structure server-side.
        errorCode === "BUILD_INVALID" ||
        errorCode === "FORT_BUILD_INVALID" ||
        errorCode === "OBSERVATORY_BUILD_INVALID" ||
        errorCode === "SIEGE_OUTPOST_BUILD_INVALID" ||
        errorCode === "ECONOMIC_STRUCTURE_BUILD_INVALID" ||
        errorCode === "STRUCTURE_REMOVE_INVALID" ||
        errorCode === "STRUCTURE_CANCEL_INVALID";
      if (maybeRecoverTransientSettlementAttempt(errorCode, errorMessage, errorTileKey)) return;
      if (errorCode === "INSUFFICIENT_GOLD") {
        if (errorMessage === "insufficient gold for frontier claim" || errorMessage === "insufficient gold for attack") {
          notifyInsufficientGoldForFrontierAction(errorMessage === "insufficient gold for frontier claim" ? "claim" : "attack");
        } else {
          // Roll back the optimistic build/settle attempt so the tile menu doesn't
          // keep showing a phantom under-construction structure on a gold rejection
          // (INSUFFICIENT_GOLD does not match isStructureActionError below, so the
          // generic rollback branch never runs for it).
          const attempt = state.lastDevelopmentAttempt;
          if (attempt?.tileKey) {
            clearOptimisticTileStateSafely(attempt.tileKey, true);
            if (attempt.kind === "SETTLE") clearSettlementProgressSafely(attempt.tileKey);
            state.lastDevelopmentAttempt = undefined;
          }
          state.queuedDevelopmentDispatchPending = false;
          const goldDetail = `${errorMessage.charAt(0).toUpperCase()}${errorMessage.slice(1)}. You have ${formatGoldAmount(state.gold)} gold.`;
          showCaptureAlertSafely("Insufficient gold", goldDetail, "warn");
        }
      } else if (errorCode === "SETTLE_INVALID") {
        clearOptimisticTileStateSafely(errorTileKey, true);
        clearSettlementProgressSafely(errorTileKey);
        state.queuedDevelopmentDispatchPending = false;
        showCaptureAlertSafely("Action failed", errorMessage, "warn");
        if (state.lastDevelopmentAttempt?.tileKey === errorTileKey) state.lastDevelopmentAttempt = undefined;
      } else if (isStructureActionError && errorTileKey) {
        clearOptimisticTileStateSafely(errorTileKey, true);
        state.queuedDevelopmentDispatchPending = false;
        // Force a fresh tile-snapshot fetch from the server so the user's
        // stale local view (e.g. tile shown empty when the server already
        // has the structure recorded) gets reconciled. Without this the
        // player keeps re-trying the same blocked build forever.
        requestViewRefreshSafely(1, true);
        showCaptureAlertSafely(errorCode === "STRUCTURE_REMOVE_INVALID" ? "Removal failed" : "Construction failed", errorMessage, "warn");
        if (state.lastDevelopmentAttempt?.tileKey === errorTileKey) state.lastDevelopmentAttempt = undefined;
      } else if (errorCode === "TOWN_UNFED") {
        const townUnfedDetail = `${errorMessage.replace(/[.。]\s*$/, "")}. Check the warning badge on the affected town.`;
        showCaptureAlertSafely("Town unfed", townUnfedDetail, "warn");
      } else if (errorCode === "EXPAND_TARGET_OWNED" && failedTargetKey) {
        showCaptureAlertSafely(
          "Frontier sync mismatch",
          "Server says that tile is already owned. Download the debug log from this popup and refresh nearby tiles to resync.",
          "warn"
        );
      } else if (
        errorCode === "NOT_ADJACENT" ||
        errorCode === "ATTACK_TARGET_INVALID" ||
        errorCode === "ATTACK_COOLDOWN" ||
        errorCode === "LOCKED" ||
        errorCode === "ALLY_TARGET" ||
        errorCode === "SHIELDED" ||
        errorCode === "BARRIER" ||
        errorCode === "ORIGIN_CUT_OFF"
      ) {
        showCaptureAlertSafely("Action blocked", actionFailureExplanation, "warn");
      } else if (errorCode === "NOT_OWNER") {
        showCaptureAlertSafely("Action blocked", actionFailureExplanation, "warn");
      } else if (errorCode === "DOCK_COOLDOWN" || errorCode === "INSUFFICIENT_MANPOWER") {
        showCaptureAlertSafely("Action blocked", actionFailureExplanation, "warn");
      } else if (isDiplomacyError) {
        showCaptureAlertSafely("Diplomacy failed", actionFailureExplanation, "warn");
      } else if (errorCode.startsWith("DOMAIN_")) {
        showCaptureAlertSafely("Domain pick failed", actionFailureExplanation, "warn");
      } else if (errorCode.startsWith("TECH_")) {
        showCaptureAlertSafely("Research failed", actionFailureExplanation, "warn");
      } else if (notificationCategory === "action_feedback" && !errorCode.startsWith("COLLECT")) {
        showCaptureAlertSafely("Action failed", actionFailureExplanation, "warn");
      }
      if (errorCode === "COLLECT_EMPTY") {
        pushFeedSafely(`Nothing to collect on this tile yet: ${errorMessage}.`, "info", "warn");
      } else if (errorCode === "COLLECT_COOLDOWN") {
        if (state.collectVisibleCooldownUntil <= Date.now()) state.collectVisibleCooldownUntil = Date.now() + deps.COLLECT_VISIBLE_COOLDOWN_MS;
        showCollectVisibleCooldownAlert();
        pushFeedSafely(`Collect visible cooling down for ${formatCooldownShort(state.collectVisibleCooldownUntil - Date.now())}.`, "info", "warn");
      } else if (notificationCategory === "persistent_alert") {
        // Persistent world issues stay on the map until fixed; the feed remains history-only.
      } else {
        if (notificationCategory === "history") pushFeedSafely(actionFailureExplanation, "info", "warn");
      }
      const frontierActionError =
        errorCode === "ACTION_INVALID" ||
        errorCode === "ATTACK_TARGET_INVALID" ||
        errorCode === "NOT_ADJACENT" ||
        errorCode === "NOT_OWNER" ||
        errorCode === "ATTACK_COOLDOWN" ||
        errorCode === "DOCK_COOLDOWN" ||
        errorCode === "INSUFFICIENT_MANPOWER" ||
        errorCode === "EXPAND_TARGET_OWNED" ||
        errorCode === "LOCKED";
      const shouldResetFrontierAction = shouldResetFrontierActionStateForError(errorCode);
      if (shouldResetFrontierAction) {
        if (failedTargetKey) {
          const failedTile = state.tiles.get(failedTargetKey);
          if (failedTile) {
            logFrontierTimeline("frontier-reset-after-error", failedTile.x, failedTile.y, {
              before: failedTile,
              after: failedTile,
              extra: {
                code: errorCode,
                message: errorMessage,
                failedCurrentKey
              }
            });
          }
        }
        state.capture = undefined;
        if (state.pendingCombatReveal?.targetKey === failedCurrentKey) state.pendingCombatReveal = undefined;
        state.actionInFlight = false;
        state.actionAcceptedAck = false;
        state.combatStartAck = false;
        state.actionAcceptTimeoutHandledAt = 0;
        state.actionStartedAt = 0;
        state.actionTargetKey = "";
        state.actionCurrent = undefined;
        clearLateFrontierAck(failedCurrentKey);
        clearLateFrontierAck(failedTargetKey);
        if (errorCode === "ATTACK_COOLDOWN" || errorCode === "DOCK_COOLDOWN") {
          const cooldownBackoffMs =
            typeof msg.cooldownRemainingMs === "number" && Number.isFinite(msg.cooldownRemainingMs)
              ? Math.max(0, msg.cooldownRemainingMs)
              : COMBAT_LOCK_MS;
          if (failedCurrentKey) state.frontierSyncWaitUntilByTarget.set(failedCurrentKey, Date.now() + cooldownBackoffMs);
          if (failedTargetKey) state.frontierSyncWaitUntilByTarget.set(failedTargetKey, Date.now() + cooldownBackoffMs);
        }
        if (errorCode === "LOCKED") {
          if (failedCurrentKey) state.frontierSyncWaitUntilByTarget.set(failedCurrentKey, Date.now() + 12_000);
          if (failedTargetKey) state.frontierSyncWaitUntilByTarget.set(failedTargetKey, Date.now() + 12_000);
        }
        if (failedCurrentKey) dropQueuedTargetKeyIfAbsent(failedCurrentKey);
        if (failedCurrentKey) clearOptimisticTileStateSafely(failedCurrentKey, true);
        if (failedTargetKey) clearOptimisticTileStateSafely(failedTargetKey, true);
        if (failedTargetKey) state.autoSettleTargets.delete(failedTargetKey);
      } else if (failedTargetKey) {
        clearOptimisticTileStateSafely(failedTargetKey, true);
      }
      state.attackPreviewPendingKey = "";
      state.attackPreviewPendingRequestId = "";
      state.attackPreviewPendingStartedAt = 0;
      state.attackPreviewLatestRequestIdByKey.clear();
      if (frontierActionError || !shouldResetFrontierAction) {
        state.lastSubAt = 0;
        requestViewRefreshSafely(2, true);
      }
      reconcileActionQueueSafely();
      if (errorCode === "ATTACK_COOLDOWN" || errorCode === "DOCK_COOLDOWN") {
        const cooldownBackoffMs =
          typeof msg.cooldownRemainingMs === "number" && Number.isFinite(msg.cooldownRemainingMs)
            ? Math.max(0, msg.cooldownRemainingMs)
            : COMBAT_LOCK_MS;
        resumeQueuedFrontierActionsAfter(cooldownBackoffMs);
      } else {
        processActionQueueSafely();
      }
      renderHud();
      return;
    }

    if (msg.type === "ATTACK_PREVIEW_RESULT") {
      const from = msg.from as { x: number; y: number };
      const to = msg.to as { x: number; y: number };
      const requestId = msg.requestId as string | undefined;
      const previewKeyForMsg = `${keyFor(from.x, from.y)}->${keyFor(to.x, to.y)}`;
      if (requestId) {
        const latestForKey = state.attackPreviewLatestRequestIdByKey.get(previewKeyForMsg);
        if (latestForKey && latestForKey !== requestId) return;
      }
      const preview: {
        fromKey: string;
        toKey: string;
        valid: boolean;
        reason?: string;
        winChance?: number;
        atkEff?: number;
        defEff?: number;
        defenseEffPct?: number;
        receivedAt: number;
      } = {
        fromKey: keyFor(from.x, from.y),
        toKey: keyFor(to.x, to.y),
        valid: Boolean(msg.valid),
        receivedAt: Date.now()
      };
      const reason = msg.reason as string | undefined;
      const winChance = msg.winChance as number | undefined;
      const atkEff = msg.atkEff as number | undefined;
      const defEff = msg.defEff as number | undefined;
      const defMult = msg.defMult as number | undefined;
      if (reason) preview.reason = reason;
      if (typeof winChance === "number") preview.winChance = winChance;
      if (typeof atkEff === "number") preview.atkEff = atkEff;
      if (typeof defEff === "number") preview.defEff = defEff;
      if (typeof defMult === "number") preview.defenseEffPct = Math.max(0, Math.min(100, defMult * 100));
      state.attackPreview = preview;
      const acceptedPreviewKey = `${preview.fromKey}->${preview.toKey}`;
      state.attackPreviewCacheByKey.set(acceptedPreviewKey, preview);
      state.attackPreviewLatestRequestIdByKey.delete(acceptedPreviewKey);
      if (state.attackPreviewPendingKey === acceptedPreviewKey) {
        state.attackPreviewPendingKey = "";
        state.attackPreviewPendingRequestId = "";
        state.attackPreviewPendingStartedAt = 0;
      }
      if (state.tileActionMenu.visible && state.tileActionMenu.mode === "single" && state.tileActionMenu.currentTileKey) {
        const selectedTile = state.tiles.get(state.tileActionMenu.currentTileKey);
        if (selectedTile && selectedTile.ownerId && selectedTile.ownerId !== state.me && !isTileOwnedByAlly(selectedTile)) {
          openSingleTileActionMenu(selectedTile, state.tileActionMenu.x, state.tileActionMenu.y, { requestAttackPreview: false });
        }
      }
      renderHud();
      return;
    }

    if (msg.type === "PLAYER_STYLE") {
      applyPlayerStyleMessage(msg, { state, authProfileNameEl, authProfileColorEl, syncAuthOverlay, renderHud });
      return;
    }

    if (msg.type === "COLLECT_RESULT") {
      state.pendingCollectVisibleKeys.clear();
      state.pendingShardCollect = undefined;
      if ((msg.mode as string | undefined) === "visible") clearPendingCollectVisibleDelta();
      if ((msg.mode as string | undefined) === "tile" && typeof msg.x === "number" && typeof msg.y === "number") {
        clearPendingCollectTileDelta(keyFor(Number(msg.x), Number(msg.y)));
      }
      const gold = Number(msg.gold ?? 0);
      const strategic = (msg.strategic as Record<string, number> | undefined) ?? {};
      const strategicParts = Object.entries(strategic)
        .filter(([, value]) => Number(value) > 0)
        .map(([resource, value]) => `${Number(value).toFixed(1)} ${resource}`);
      const bits: string[] = [];
      if (gold > 0) bits.push(`${gold.toFixed(1)} gold`);
      bits.push(...strategicParts);
      pushFeed(bits.length > 0 ? `Collected ${bits.join(", ")}.` : "No collectable yield.", "info", bits.length > 0 ? "success" : "warn");
      renderHud();
      return;
    }

    if (msg.type === "SEASON_ROLLOVER" || msg.type === "WORLD_REGENERATED") {
      clearDeferredBootstrapRefreshTimer();
      const season = msg.season as { worldSeed?: number; mapStyle?: "continents" | "islands" } | undefined;
      if (typeof season?.worldSeed === "number") {
        setWorldSeed(season.worldSeed, season.mapStyle);
        clearRenderCaches();
        buildMiniMapBase();
      }
      if (msg.type === "SEASON_ROLLOVER") {
        state.seasonWinner = undefined;
        state.seasonVictory = [];
        // Reset the season-end screen so it shows again when the next season ends.
        state.seasonEndDismissed = false;
        state.seasonEndStarting = false;
      }
      state.pendingShardCollect = undefined;
      state.tiles.clear();
      state.mapLoadStartedAt = Date.now();
      state.firstChunkAt = 0;
      state.chunkFullCount = 0;
      state.lastChunkSnapshotGeneration = 0;
      state.hasOwnedTileInCache = false;
      state.dockRouteCache.clear();
      pushFeed(
        msg.type === "SEASON_ROLLOVER" ? "Season rolled over. World and progression reset." : "World regenerated by admin. Fresh map loaded.",
        "info",
        "warn"
      );
      requestViewRefresh(1, true);
      renderHud();
      return;
    }

    if (msg.type === "SHARD_RAIN_EVENT") {
      if (
        (msg.phase as string | undefined) === "started" &&
        typeof (msg.startsAt as number | undefined) === "number" &&
        typeof (msg.expiresAt as number | undefined) === "number"
      ) {
        state.shardRainFxUntil = Date.now() + 8_000;
      }
      applyShardRainNotice({
        phase: msg.phase as string | undefined,
        startsAt: msg.startsAt as number | undefined,
        expiresAt: msg.expiresAt as number | undefined,
        siteCount: msg.siteCount as number | undefined,
        sites: Array.isArray(msg.sites) ? (msg.sites as { x: number; y: number }[]) : undefined
      });
      renderHud();
    }
    if (msg.type === "IMPERIAL_WARD_ACTIVATED") {
      applyImperialWardActivatedMessage(state, msg);
      renderHud();
    }
    } catch (error) {
      console.error("[client-network] unhandled message processing error", error, { msgType: msg?.type });
    }
  });
};
