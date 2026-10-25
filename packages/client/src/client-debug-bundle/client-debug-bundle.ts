import type { ClientState } from "../client-state/client-state.js";
import { snapshotClientDebugEvents, snapshotClientDebugIncidents } from "../client-debug/client-debug.js";
import { rendererFailureSnapshot, webGLProbe } from "../client-webgl-probe/client-webgl-probe.js";
import { resolveTileBudget } from "../client-map-3d-tile-budget/client-map-3d-tile-budget.js";
import { buildCommandTimings } from "../client-sync-diagnostics/client-command-timings.js";
import { diagnosticAuthorization } from "../client-sync-diagnostics/client-server-diagnostics.js";
import { snapshotDisconnectHistory } from "../client-connection-diagnostics/client-connection-diagnostics.js";
import { snapshotSyncDiagnostics } from "../client-sync-diagnostics/client-sync-diagnostics.js";
import { snapshotPerformanceMetrics } from "../client-performance-metrics/client-performance-metrics.js";
import { MIN_ZOOM } from "../client-constants.js";

type DebugBundleState = Pick<
  ClientState,
  | "me"
  | "meName"
  | "connection"
  | "authSessionReady"
  | "selected"
  | "hover"
  | "capture"
  | "captureAlert"
  | "actionInFlight"
  | "actionCurrent"
  | "actionTargetKey"
  | "actionStartedAt"
  | "actionAcceptedAck"
  | "combatStartAck"
  | "pendingCombatReveal"
  | "queuedTargetKeys"
  | "developmentQueue"
  | "bridgeDebugMode"
  | "bridgeDebugBootstrap"
  | "bridgeDebugWsUrl"
  | "bridgeDebugSeasonId"
  | "bridgeDebugRuntimeFingerprint"
  | "bridgeDebugSnapshotLabel"
  | "bridgeDebugInitialTileCount"
  | "bridgeDebugSupportedMessageCount"
> & Partial<Pick<ClientState, "bridgeDebugServerBuildSha">>;

export type JsonFetchResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status?: number; error: string };

type ClientDebugEvent = ReturnType<typeof snapshotClientDebugEvents>[number];

const DEBUG_FETCH_TIMEOUT_MS = 4_000;
const browserLocationHref = (): string =>
  typeof window !== "undefined" && typeof window.location?.href === "string" ? window.location.href : "";

const browserUserAgent = (): string =>
  typeof navigator !== "undefined" && typeof navigator.userAgent === "string" ? navigator.userAgent : "";

export const serverHttpOriginFromWsUrl = (wsUrl: string): string => {
  const url = new URL(wsUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.search = "";
  if (url.pathname === "/ws" || url.pathname === "/ws/") {
    url.pathname = "/";
  } else if (url.pathname.endsWith("/ws")) {
    url.pathname = url.pathname.slice(0, -3) || "/";
  }
  return url.origin;
};

export const withTimeout = async (url: string, authorization?: string): Promise<JsonFetchResult> => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), DEBUG_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "omit",
      signal: controller.signal,
      headers: { Accept: "application/json", ...(authorization ? { Authorization: authorization } : {}) }
    });
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const message = typeof body === "object" && body !== null
        ? ("message" in body && typeof body.message === "string" ? body.message
          : "error" in body && typeof body.error === "string" ? body.error : undefined)
        : undefined;
      return { ok: false, status: response.status, error: message ?? `HTTP ${response.status}` };
    }
    return { ok: true, status: response.status, body };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    globalThis.clearTimeout(timeout);
  }
};

export const fetchPlayerServerDiagnostics = async (serverOrigin: string): Promise<JsonFetchResult> => {
  // Bound token acquisition as well as HTTP. A broken auth refresh must not
  // prevent the player downloading the client-side evidence.
  let timer: ReturnType<typeof setTimeout> | undefined;
  let authTimedOut = false;
  try {
    const authorization = await Promise.race([
      diagnosticAuthorization(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { authTimedOut = true; reject(new Error("auth timeout")); }, DEBUG_FETCH_TIMEOUT_MS);
      })
    ]);
    if (!authorization) return { ok: false, error: "No signed-in user; server diagnostics unavailable" };
    const result = await withTimeout(`${serverOrigin}/api/player/sync-diagnostics`, authorization);
    if (!result.ok) return result;
    const body = result.body;
    if (typeof body !== "object" || body === null || !("ok" in body) || body.ok !== true ||
      !("playerId" in body) || typeof body.playerId !== "string" ||
      !("recentServerEvents" in body) || !Array.isArray(body.recentServerEvents)) {
      return { ok: false, status: result.status, error: "Server diagnostics returned an unexpected response" };
    }
    return result;
  } catch {
    return { ok: false, error: authTimedOut ? "Diagnostic authentication timed out after 4 seconds" : "Unable to authenticate server diagnostics" };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

const stateSnapshot = (state: DebugBundleState): Record<string, unknown> => ({
  me: state.me,
  meName: state.meName,
  connection: state.connection,
  authSessionReady: state.authSessionReady,
  selected: state.selected,
  hover: state.hover,
  capture: state.capture,
  captureAlert: state.captureAlert,
  actionInFlight: state.actionInFlight,
  actionCurrent: state.actionCurrent,
  actionTargetKey: state.actionTargetKey,
  actionStartedAt: state.actionStartedAt,
  actionAcceptedAck: state.actionAcceptedAck,
  combatStartAck: state.combatStartAck,
  pendingCombatReveal: state.pendingCombatReveal,
  queuedTargetKeys: Array.from(state.queuedTargetKeys),
  developmentQueueLength: state.developmentQueue.length,
  bridgeDebugMode: state.bridgeDebugMode,
  bridgeDebugBootstrap: state.bridgeDebugBootstrap,
  bridgeDebugWsUrl: state.bridgeDebugWsUrl,
  bridgeDebugSeasonId: state.bridgeDebugSeasonId,
  bridgeDebugRuntimeFingerprint: state.bridgeDebugRuntimeFingerprint,
  bridgeDebugServerBuildSha: state.bridgeDebugServerBuildSha,
  bridgeDebugSnapshotLabel: state.bridgeDebugSnapshotLabel,
  bridgeDebugInitialTileCount: state.bridgeDebugInitialTileCount,
  bridgeDebugSupportedMessageCount: state.bridgeDebugSupportedMessageCount
});

const attackDebugClientEvents = (events: ClientDebugEvent[]) => {
  const attackSync = events.filter((event) => event.scope === "attack-sync");
  const serverErrors = events.filter((event) => event.scope === "server-error");
  const timeouts = attackSync.filter(
    (event) =>
      event.event === "action-accept-timeout" ||
      event.event === "combat-start-timeout" ||
      event.event === "combat-result-timeout"
  );
  return {
    attackSync: attackSync.slice(-160),
    serverErrors: serverErrors.slice(-80),
    timeouts: timeouts.slice(-80)
  };
};

const readServerEvents = (body: unknown): Array<{ at: number; event: string; payload: Record<string, unknown> }> => {
  if (typeof body !== "object" || body === null || !("recentServerEvents" in body) || !Array.isArray(body.recentServerEvents)) return [];
  return body.recentServerEvents.filter((event): event is { at: number; event: string; payload: Record<string, unknown> } =>
    typeof event === "object" && event !== null && typeof event.at === "number" &&
    typeof event.event === "string" && typeof event.payload === "object" && event.payload !== null);
};

export const buildClientDebugBundle = async (args: {
  state: DebugBundleState;
  wsUrl: string;
}): Promise<Record<string, unknown>> => {
  const serverOrigin = serverHttpOriginFromWsUrl(args.wsUrl);
  const capturedAt = new Date().toISOString();
  const clientEvents = snapshotClientDebugEvents();
  const incidents = snapshotClientDebugIncidents();
  const clientState = structuredClone(stateSnapshot(args.state));
  const syncDiagnostics = snapshotSyncDiagnostics();
  const [health, debugBundle] = await Promise.all([
    withTimeout(`${serverOrigin}/health`),
    fetchPlayerServerDiagnostics(serverOrigin)
  ]);
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    capturedAt,
    clientBuildSha: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "",
    syncDiagnostics,
    performanceMetrics: snapshotPerformanceMetrics(),
    incidents,
    commandTimings: buildCommandTimings(
      [...incidents.windows.flatMap((incident) => incident.events), ...clientEvents].sort((a, b) => a.at - b.at),
      debugBundle.ok ? readServerEvents(debugBundle.body) : []
    ),
    disconnectHistory: snapshotDisconnectHistory(),
    pageUrl: browserLocationHref(),
    userAgent: browserUserAgent(),
    wsUrl: args.wsUrl,
    serverOrigin,
    clientState,
    // The whole point of the probe on a device we can't reproduce on: this is
    // what tells us whether 3D failed for lack of webgl2, a refused context, a
    // lost context, or something else entirely.
    renderer: {
      webgl: webGLProbe(),
      tileBudget: resolveTileBudget(MIN_ZOOM),
      failure: rendererFailureSnapshot()
    },
    clientEvents,
    attackDebug: {
      client: attackDebugClientEvents(clientEvents),
      server:
        debugBundle.ok && typeof debugBundle.body === "object" && debugBundle.body !== null
          ? {
              timeline: readServerEvents(debugBundle.body)
            }
          : undefined
    },
    serverHealth: health,
    serverBundle: debugBundle
  };
};

export const downloadClientDebugBundle = async (args: {
  state: DebugBundleState;
  wsUrl: string;
}): Promise<void> => {
  const bundle = await buildClientDebugBundle(args);
  const blob = new Blob([`${JSON.stringify(bundle, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `border-empires-debug-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
};
