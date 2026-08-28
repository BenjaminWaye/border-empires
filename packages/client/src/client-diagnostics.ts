import { snapshotClientDebugEvents } from "./client-debug/client-debug.js";
import { summarizeDisconnectHistory } from "./client-connection-diagnostics/client-connection-diagnostics.js";
import { snapshotPerformanceMetrics, initPerformanceMetrics } from "./client-performance-metrics/client-performance-metrics.js";
import { isTrue3DRendererActive, prefers2DRendererMode, rendererModeExplicitlySet } from "./client-renderer-mode.js";
import { rendererFailureSnapshot, webGLProbe } from "./client-webgl-probe/client-webgl-probe.js";
import { resolveTileBudget } from "./client-map-3d-tile-budget/client-map-3d-tile-budget.js";
import { previousRendererAttempt, previousSessionEndedUncleanly } from "./client-renderer-crash-breadcrumb/client-renderer-crash-breadcrumb.js";
import { MIN_ZOOM } from "./client-constants.js";
import type { ClientState } from "./client-state/client-state.js";

// Snapshot of state useful for triaging a stuck-login report: identity bits
// (anonymised), connection state, elapsed timers, recent network/auth events,
// performance metrics, and a load-time waterfall.
// Excludes auth tokens and any heavy snapshot payloads.
export const buildDiagnosticsBundle = (
  state: Pick<
    ClientState,
    | "connection"
    | "firstChunkAt"
    | "mapLoadStartedAt"
    | "chunkFullCount"
    | "authSessionReady"
    | "authRetrying"
    | "authBusyTitle"
    | "authBusyDetail"
    | "authEmail"
    | "authReady"
    | "authUserLabel"
    | "hasEverInitialized"
    | "activeBackend"
    | "bridgeDebugMode"
    | "bridgeDebugBootstrap"
    | "bridgeDebugWsUrl"
    | "bridgeDebugSeasonId"
    | "bridgeDebugRuntimeFingerprint"
    | "bridgeDebugSnapshotLabel"
    | "bridgeDebugServerBuildSha"
    | "bridgeDebugAcceptLatencyP95Ms"
    | "bridgeDebugInitialTileCount"
    | "bridgeDebugSupportedMessageCount"
    | "fogDisabled"
    | "mapRevealEnabled"
    | "lastSubCx"
    | "lastSubCy"
    | "lastSubRadius"
    | "lastSubAt"
    | "recentTileMessages"
  >,
  wsUrl: string,
  now: number = Date.now()
): Record<string, unknown> => {
  const navStart =
    typeof performance !== "undefined" && performance.timing?.navigationStart
      ? performance.timing.navigationStart
      : now;

  initPerformanceMetrics();

  return {
    incidentId: `diag-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    capturedAtMs: now,
    capturedAtIso: new Date(now).toISOString(),
    location: typeof window !== "undefined"
      ? { href: window.location.href, host: window.location.host, origin: window.location.origin }
      : null,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    wsUrl,
    state: {
      connection: state.connection,
      firstChunkAt: state.firstChunkAt,
      mapLoadStartedAt: state.mapLoadStartedAt,
      mapLoadElapsedMs: state.mapLoadStartedAt > 0 ? Math.max(0, now - state.mapLoadStartedAt) : null,
      chunkFullCount: state.chunkFullCount,
      authReady: state.authReady,
      authSessionReady: state.authSessionReady,
      authRetrying: state.authRetrying,
      authBusyTitle: state.authBusyTitle,
      authBusyDetail: state.authBusyDetail,
      authUserLabel: state.authUserLabel,
      authEmail: state.authEmail ? "***" : "", // redact
      hasEverInitialized: state.hasEverInitialized,
      activeBackend: state.activeBackend,
      bridgeDebugMode: state.bridgeDebugMode,
      bridgeDebugBootstrap: state.bridgeDebugBootstrap,
      bridgeDebugWsUrl: state.bridgeDebugWsUrl || wsUrl,
      bridgeDebugSeasonId: state.bridgeDebugSeasonId,
      bridgeDebugRuntimeFingerprint: state.bridgeDebugRuntimeFingerprint,
      bridgeDebugSnapshotLabel: state.bridgeDebugSnapshotLabel,
      bridgeDebugServerBuildSha: state.bridgeDebugServerBuildSha,
      bridgeDebugAcceptLatencyP95Ms: state.bridgeDebugAcceptLatencyP95Ms,
      bridgeDebugInitialTileCount: state.bridgeDebugInitialTileCount,
      bridgeDebugSupportedMessageCount: state.bridgeDebugSupportedMessageCount,
      renderer: isTrue3DRendererActive() ? "true-3d" : "2d-canvas",
      // Fog/reveal + chunk-subscription state: shows whether a full-map
      // reveal was active (which changes the requested SUBSCRIBE_CHUNKS
      // radius) and when/where the last chunk request actually went out, so
      // a stuck-at-N-known-tiles report can tell "never asked for more"
      // apart from "asked, but nothing came back".
      fogDisabled: state.fogDisabled,
      mapRevealEnabled: state.mapRevealEnabled,
      lastSubCx: state.lastSubCx,
      lastSubCy: state.lastSubCy,
      lastSubRadius: state.lastSubRadius,
      lastSubAt: state.lastSubAt,
      lastSubAgoMs: state.lastSubAt > 0 ? Math.max(0, now - state.lastSubAt) : null
    },
    // Rolling log of the last ~50 tile/chunk-touching WS messages (see
    // recordRecentTileMessage in client-network.ts). This is the direct
    // answer to "did any map data arrive after the first chunk, and when" —
    // more useful than the counters above for a black-map/stuck-load report.
    recentTileMessages: state.recentTileMessages,
    loadWaterfall: {
      capturedElapsedMs: now - navStart,
      mapLoadStartedElapsedMs: state.mapLoadStartedAt > 0 ? state.mapLoadStartedAt - navStart : null,
      firstChunkElapsedMs: state.firstChunkAt > 0 ? state.firstChunkAt - navStart : null,
      chunkFullCount: state.chunkFullCount,
      authSessionReadyElapsedMs: state.authSessionReady && state.firstChunkAt > 0 ? state.firstChunkAt - navStart : null,
      hasEverInitialized: state.hasEverInitialized
    },
    // Everything needed to tell why 3D did or didn't start on a device we
    // can't reproduce on. This bundle is reachable from Settings on a phone,
    // which makes it the one realistic channel for getting GPU/context facts
    // off an iPhone without a Mac and a cable.
    rendererDiagnostics: {
      requested: prefers2DRendererMode ? "2d" : "true-3d",
      active: isTrue3DRendererActive() ? "true-3d" : "2d-canvas",
      explicitlySet: rendererModeExplicitlySet,
      webgl: webGLProbe(),
      tileBudget: resolveTileBudget(MIN_ZOOM),
      failure: rendererFailureSnapshot(),
      // How far the *previous* session's 3D attempt got. This is the only
      // evidence a hard browser crash leaves behind — a killed tab runs no
      // JavaScript, so `failure` above stays empty for one.
      previousAttempt: previousRendererAttempt(),
      // Pre-computed verdict on the field above: true when the previous
      // session's 3D was still sending heartbeats with no matching clean
      // `pagehide`, i.e. it just stopped — the signature of a hard crash
      // (an iOS jetsam kill under memory pressure, most likely) rather than
      // the player simply closing the tab. Saves whoever reads this bundle
      // from re-deriving it from previousAttempt's raw timestamps.
      previousSessionLikelyCrashed: previousSessionEndedUncleanly()
    },
    performanceMetrics: snapshotPerformanceMetrics(),
    recentDebugEvents: snapshotClientDebugEvents(),
    // Persisted across page reloads (see client-connection-diagnostics.ts),
    // so this survives the full-page reload scheduleReconnectReload() does
    // after a prolonged disconnect and can be used to diagnose reports of
    // frequent reconnects.
    disconnectHistory: summarizeDisconnectHistory()
  };
};

export const downloadDiagnosticsBundle = (bundle: Record<string, unknown>): void => {
  if (typeof window === "undefined" || typeof window.URL?.createObjectURL !== "function") return;
  try {
    const json = JSON.stringify(bundle, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const filename = `border-empires-diagnostics-${(bundle.incidentId as string | undefined) ?? "unknown"}.json`;
    const link = window.document.createElement("a");
    link.href = url;
    link.download = filename;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    // Log to console so a developer-tools user can still grab it, then
    // rethrow — callers wrap this in their own try/catch to surface a
    // visible failure (feed message / alert) instead of the click silently
    // doing nothing, which is indistinguishable from the button being
    // broken.
    console.error("[diagnostics] download failed", error);
    console.error("[diagnostics] bundle", bundle);
    throw error;
  }
};
