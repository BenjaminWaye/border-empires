import { SEASON_ROLLOVER_CLOSE_REASON } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { releaseActivityRequestsOnDisconnect } from "../client-activity-dashboard/client-activity-dashboard-network.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import { attackSyncLog, recordClientDebugEvent } from "../client-debug/client-debug.js";
import { recordSocketDisconnect } from "../client-connection-diagnostics/client-connection-diagnostics.js";
import { createInPlaceReconnectScheduler } from "../client-inplace-reconnect/client-inplace-reconnect.js";
import { clearAuthOffline, DEPLOY_WAIT_DETAIL, DEPLOY_WAIT_TITLE, markAuthOffline } from "../client-auth-deploy-wait/client-auth-deploy-wait.js";
import { createDefaultDeployStatusFetcher, createDeployStatusPoller, type DeployStatusPoller } from "../client-deploy-countdown/client-deploy-status-poller.js";

// While the next Sector Contest's world is built the server can be briefly
// unreachable; say so instead of a bare "Server unreachable".
const NEXT_CONTEST_BUILDING_MESSAGE = "Building the next Sector Contest. Reconnecting when it's ready...";

interface SocketLifecycleDeps {
  state: ClientState;
  ws: RealtimeSocket;
  wsUrl: string;
  keyFor: (x: number, y: number) => string;
  clearAuthInFlight?: () => void;
  clearAuthReconnectTimer: () => void;
  resetAuthReconnectAttempt: () => void;
  clearDeferredBootstrapRefreshTimer: () => void;
  clearOptimisticTileState: (key: string, revert: boolean) => void;
  pushFeed: (message: string, type: "error", severity: "info") => void;
  applyLoginPhase: (title: string, detail: string) => void;
  authenticateSocket: () => Promise<void>;
  renderHud: () => void;
  /** Re-renders the login overlay so its deploy countdown ticks. */
  syncAuthOverlay?: () => void;
  /** Test seam; defaults to polling /__deploy_status.json on the page origin. */
  deployStatusPoller?: DeployStatusPoller;
}

interface SocketLifecycle {
  recovered: () => void;
  noteProgress: () => void;
}

/** Owns transport recovery; only an authoritative INIT completes recovery. */
export const bindClientSocketLifecycle = (deps: SocketLifecycleDeps): SocketLifecycle => {
  const { state, ws } = deps;
  let wsOpenedAt = 0;
  const connectionUptimeMs = (): number | undefined => wsOpenedAt > 0 ? Math.max(0, Date.now() - wsOpenedAt) : undefined;
  const currentActionKey = (): string => state.actionCurrent ? deps.keyFor(state.actionCurrent.x, state.actionCurrent.y) : "";
  const debugDisconnectPayload = (actionKey: string): Record<string, unknown> => ({
    currentActionKey: actionKey,
    currentAction: state.actionCurrent,
    actionStartedAt: state.actionStartedAt,
    actionAcceptedAck: state.actionAcceptedAck,
    combatStartAck: state.combatStartAck,
    capture: state.capture ? { target: state.capture.target, resolvesAt: state.capture.resolvesAt } : undefined
  });

  // While offline, a running server deploy turns "Reconnecting…" into a
  // countdown on the login card and the in-game reconnect banner.
  const deployStatus = deps.deployStatusPoller ?? createDeployStatusPoller({
    state,
    fetchStatus: createDefaultDeployStatusFetcher(),
    onChange: () => {
      deps.renderHud();
      deps.syncAuthOverlay?.();
    }
  });

  const reconnect = createInPlaceReconnectScheduler({
    state,
    ws,
    onStalled: () => {
      recordClientDebugEvent("warn", "reconnect", "restoration-stalled", {
        connection: state.connection, wsReadyState: ws.readyState
      });
      ws.close(4000, "reconnect_timeout");
      handleSocketTornDown(currentActionKey(), "Connection stalled. Retrying...", "Restoring your session automatically...");
    }
  });

  const handleSocketTornDown = (actionKey: string, feedMessage: string, interruptedDetail: string): void => {
    // Keep one outage anchor through repeated closes and the post-INIT map
    // resync; only a healthy session starts a new overlay grace window.
    const wasHealthy = state.connection === "initialized" && state.firstChunkAt > 0;
    if (wasHealthy || !state.disconnectedSince) state.disconnectedSince = Date.now();
    markAuthOffline(state);
    deps.clearAuthInFlight?.();
    state.connection = "disconnected";
    releaseActivityRequestsOnDisconnect(state);
    state.actionInFlight = false;
    state.actionAcceptedAck = false;
    state.combatStartAck = false;
    state.actionAcceptTimeoutHandledAt = 0;
    state.actionStartedAt = 0;
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
    state.lastChunkSnapshotGeneration = 0;
    if (actionKey) deps.clearOptimisticTileState(actionKey, true);
    deps.pushFeed(feedMessage, "error", "info"); // the disconnect overlay is the visible UI
    if (state.authReady && !state.authSessionReady) {
      // A first sign-in that loses its socket (usually a deploy restart)
      // waits and reconnects in place instead of asking for a reload.
      deps.applyLoginPhase(state.hasEverInitialized ? "Connection interrupted" : DEPLOY_WAIT_TITLE, interruptedDetail);
      state.authRetrying = false;
      state.authRetryAttempt = 0;
    }
    deps.clearAuthReconnectTimer();
    reconnect.schedule();
    deployStatus.start();
    deps.renderHud();
  };

  ws.addEventListener("open", () => {
    attackSyncLog("ws-open", { readyState: ws.readyState, authReady: state.authReady, authSessionReady: state.authSessionReady });
    wsOpenedAt = Date.now();
    state.connection = "connected";
    // The original page-load time is stale after an in-place reconnect.
    state.mapLoadStartedAt = Date.now();
    reconnect.watchForRecovery();
    deps.clearAuthReconnectTimer();
    deps.resetAuthReconnectAttempt();
    if (state.authReady && !state.authSessionReady) {
      deps.applyLoginPhase("Securing session", `Realtime connection open. Sending Google session for ${state.authUserLabel || "your empire"}...`);
    }
    deps.renderHud();
    void deps.authenticateSocket();
  });

  ws.addEventListener("initprogress", () => reconnect.watchForRecovery());

  ws.addEventListener("close", (event) => {
    deps.clearDeferredBootstrapRefreshTimer();
    const actionKey = currentActionKey();
    recordSocketDisconnect("close", {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
      connectionUptimeMs: connectionUptimeMs(),
      debugPayload: debugDisconnectPayload(actionKey)
    });
    handleSocketTornDown(
      actionKey,
      event.reason === SEASON_ROLLOVER_CLOSE_REASON ? "A new Sector Contest has started. Loading it..." : state.seasonEndStarting ? NEXT_CONTEST_BUILDING_MESSAGE : "Connection lost. Retrying...",
      state.hasEverInitialized ? "Reconnecting automatically..." : DEPLOY_WAIT_DETAIL
    );
  });

  ws.addEventListener("error", () => {
    const actionKey = currentActionKey();
    recordSocketDisconnect("error", { connectionUptimeMs: connectionUptimeMs(), debugPayload: debugDisconnectPayload(actionKey) });
    handleSocketTornDown(
      actionKey,
      state.seasonEndStarting ? NEXT_CONTEST_BUILDING_MESSAGE : "Server unreachable. Retrying...",
      state.hasEverInitialized ? "Reconnecting automatically..." : DEPLOY_WAIT_DETAIL
    );
  });

  const recovered = (): void => {
    clearAuthOffline(state);
    deployStatus.stop();
    reconnect.resetAttempt();
  };

  return { recovered, noteProgress: reconnect.watchForRecovery };
};
