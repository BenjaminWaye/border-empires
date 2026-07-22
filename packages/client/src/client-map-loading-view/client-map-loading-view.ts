import { AUTH_BUSY_DIAGNOSTICS_THRESHOLD_MS } from "../client-constants.js";
import type { ClientState } from "../client-state/client-state.js";

export type MapLoadingView = {
  title: string;
  meta: string;
  showRetry: boolean;
  showReload: boolean;
  showDiagnostics: boolean;
  tone: "normal" | "warn";
};

// Elapsed-time thresholds for escalating the connecting/securing-session
// overlay. With suspend off on staging+prod, a warm login completes in <5s,
// so >8s is already abnormal — show a soft hint but keep the tone normal so
// we don't terrify users on a flaky-network blip. After 25s with no auth
// progress, expose explicit recovery actions (retry, reload, diagnostics).
// Decoupled from the server-side watchdog (which fires at 30s) on purpose:
// these are pure UX timings that don't require the server to be dead.
// SOFT_HINT_THRESHOLD_MS is shared with the earlier client-auth-ui.ts busy
// modal (see AUTH_BUSY_DIAGNOSTICS_THRESHOLD_MS in client-constants.ts) so
// the "past 8s is abnormal" judgment call lives in exactly one place.
const SOFT_HINT_THRESHOLD_MS = AUTH_BUSY_DIAGNOSTICS_THRESHOLD_MS;
const ACTION_AFFORDANCE_THRESHOLD_MS = 25_000;

export const buildMapLoadingView = (
  state: Pick<
    ClientState,
    | "connection"
    | "firstChunkAt"
    | "mapLoadStartedAt"
    | "chunkFullCount"
    | "authSessionReady"
    | "authRetrying"
    | "authRetryAttempt"
    | "authRetryNextAt"
    | "authBusyTitle"
    | "authBusyDetail"
    | "serverDeploying"
  >,
  wsUrl: string,
  now: number = Date.now()
): MapLoadingView => {
  const startAt = state.mapLoadStartedAt || now;
  const elapsedMs = Math.max(0, now - startAt);
  const elapsedSeconds = (elapsedMs / 1000).toFixed(1);
  const retryInSeconds = state.authRetryNextAt > now ? Math.ceil((state.authRetryNextAt - now) / 1000) : 0;
  const baseRetryMeta = state.authBusyDetail || "Waiting for the realtime server to become available.";
  const retryMeta =
    state.authRetrying && state.authRetryAttempt > 0 && !/\bAttempt \d+/.test(baseRetryMeta)
      ? `${baseRetryMeta}${
          retryInSeconds > 0 ? ` Attempt ${state.authRetryAttempt} starts in ${retryInSeconds}s.` : ` Attempt ${state.authRetryAttempt} is starting now.`
        }`
      : baseRetryMeta;
  if (state.connection === "disconnected") {
    if (state.serverDeploying) {
      return {
        title: "Server update in progress",
        meta: "Reconnecting automatically — updates usually complete in 1–2 minutes.",
        showRetry: false,
        showReload: false,
        showDiagnostics: false,
        tone: "normal"
      };
    }
    if (state.authRetrying) {
      return {
        title: state.authBusyTitle || "Realtime simulation unavailable",
        meta: retryMeta,
        showRetry: true,
        showReload: true,
        showDiagnostics: true,
        tone: "warn"
      };
    }
    return {
      title: "Disconnected from server",
      meta: "Retrying connection...",
      showRetry: false,
      showReload: false,
      showDiagnostics: false,
      tone: "normal"
    };
  }
  if (state.connection === "connecting") {
    if (state.serverDeploying) {
      return {
        title: "Reconnecting after update...",
        meta: "Waiting for the updated server to come back online.",
        showRetry: false,
        showReload: false,
        showDiagnostics: false,
        tone: "normal"
      };
    }
    return {
      title: "Connecting to server...",
      meta: "Retrying connection...",
      showRetry: false,
      showReload: false,
      showDiagnostics: false,
      tone: "normal"
    };
  }
  if (state.connection === "connected" || (state.connection === "initialized" && state.firstChunkAt === 0)) {
    if (!state.authSessionReady && state.authRetrying) {
      return {
        title: state.authBusyTitle || "Securing session",
        meta: retryMeta,
        showRetry: true,
        showReload: true,
        showDiagnostics: true,
        tone: "warn"
      };
    }
    if (state.connection === "initialized" && state.authSessionReady && state.firstChunkAt === 0 && elapsedMs >= SOFT_HINT_THRESHOLD_MS) {
      return {
        title: "Map sync stalled",
        meta: "Your session initialized, but nearby land has not arrived from the server. Retry now or reload the client.",
        showRetry: true,
        showReload: true,
        showDiagnostics: true,
        tone: "warn"
      };
    }
    // Connected but still waiting on auth/sync. With no explicit error we'd
    // normally show the friendly "Syncing empire..." copy forever; the staging
    // event-loop stalls fall into exactly this gap (no error fires, the auth
    // ACK is just delayed). Escalate after SOFT/ACTION thresholds so the user
    // knows they're not crazy and can recover without waiting 80s+.
    const stuckOnAuth = !state.authSessionReady;
    if (stuckOnAuth && elapsedMs >= ACTION_AFFORDANCE_THRESHOLD_MS) {
      return {
        title: state.authBusyTitle || "Securing session",
        meta: `The server hasn't acknowledged sign-in in ${elapsedSeconds}s. It may be restarting (~90s) — try again or grab diagnostics.`,
        showRetry: true,
        showReload: true,
        showDiagnostics: true,
        tone: "warn"
      };
    }
    if (stuckOnAuth && elapsedMs >= SOFT_HINT_THRESHOLD_MS) {
      return {
        title: state.authBusyTitle || "Securing session",
        meta: `Login is taking longer than usual (${elapsedSeconds}s). Hang on…`,
        showRetry: false,
        showReload: false,
        // Diagnostics only (no retry/reload yet) — a slow-but-not-yet-dead
        // auth wait is exactly the window we most want a bundle from: past
        // SOFT_HINT (8s, abnormal for a warm login) but before
        // ACTION_AFFORDANCE (25s, where retry/reload appear). Waiting until
        // 25s to offer diagnostics meant anything in the 8-25s band (a very
        // common slow-login shape) had no way to grab logs.
        showDiagnostics: true,
        tone: "normal"
      };
    }
    return {
      title: state.authSessionReady ? "Loading nearby land..." : "Syncing empire...",
      meta: state.authSessionReady
        ? `Elapsed ${elapsedSeconds}s · chunks ${state.chunkFullCount}`
        : (state.authBusyDetail || `Connected to ${wsUrl}`),
      showRetry: false,
      showReload: false,
      showDiagnostics: false,
      tone: "normal"
    };
  }
  return {
    title: "Loading world...",
    meta: "Finalizing map render...",
    showRetry: false,
    showReload: false,
    showDiagnostics: false,
    tone: "normal"
  };
};
