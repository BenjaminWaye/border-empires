import { SEASON_ROLLOVER_CLOSE_REASON } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import { attackSyncLog, recordClientDebugEvent } from "../client-debug/client-debug.js";
import { recordSocketDisconnect } from "../client-connection-diagnostics/client-connection-diagnostics.js";
import { createInPlaceReconnectScheduler } from "../client-inplace-reconnect/client-inplace-reconnect.js";

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
  pushFeed: (message: string, type: "error", severity: "warn") => void;
  applyLoginPhase: (title: string, detail: string) => void;
  authenticateSocket: () => Promise<void>;
  renderHud: () => void;
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
    deps.clearAuthInFlight?.();
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
    if (actionKey) deps.clearOptimisticTileState(actionKey, true);
    deps.pushFeed(feedMessage, "error", "warn");
    if (state.authReady && !state.authSessionReady) {
      deps.applyLoginPhase("Connection interrupted", interruptedDetail);
      state.authRetrying = false;
      state.authRetryAttempt = 0;
    }
    deps.clearAuthReconnectTimer();
    reconnect.schedule();
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
      event.reason === SEASON_ROLLOVER_CLOSE_REASON ? "A new season has started. Loading it..." : "Connection lost. Retrying...",
      state.hasEverInitialized ? "Reconnecting automatically..." : `The realtime connection to ${deps.wsUrl} closed before sign-in finished. Reload the game to reconnect.`
    );
  });

  ws.addEventListener("error", () => {
    const actionKey = currentActionKey();
    recordSocketDisconnect("error", { connectionUptimeMs: connectionUptimeMs(), debugPayload: debugDisconnectPayload(actionKey) });
    handleSocketTornDown(
      actionKey,
      "Server unreachable. Retrying...",
      state.hasEverInitialized ? "Reconnecting automatically..." : `The realtime connection to ${deps.wsUrl} failed before sign-in finished. Reload the game to reconnect.`
    );
  });

  return { recovered: reconnect.resetAttempt, noteProgress: reconnect.watchForRecovery };
};
