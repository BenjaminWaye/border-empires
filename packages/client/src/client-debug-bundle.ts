import type { ClientState } from "./client-state.js";
import { snapshotClientDebugEvents } from "./client-debug.js";

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
>;

type JsonFetchResult =
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

const withTimeout = async (url: string): Promise<JsonFetchResult> => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), DEBUG_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "omit",
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    const body = await response.json().catch(() => undefined);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: typeof (body as { message?: unknown } | undefined)?.message === "string" ? (body as { message: string }).message : `HTTP ${response.status}`
      };
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
  developmentQueueLength: state.developmentQueue.length
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

export const buildClientDebugBundle = async (args: {
  state: DebugBundleState;
  wsUrl: string;
}): Promise<Record<string, unknown>> => {
  const serverOrigin = serverHttpOriginFromWsUrl(args.wsUrl);
  const clientEvents = snapshotClientDebugEvents(300);
  const [health, debugBundle] = await Promise.all([
    withTimeout(`${serverOrigin}/health`),
    withTimeout(`${serverOrigin}/admin/runtime/debug-bundle`)
  ]);
  return {
    generatedAt: new Date().toISOString(),
    pageUrl: browserLocationHref(),
    userAgent: browserUserAgent(),
    wsUrl: args.wsUrl,
    serverOrigin,
    clientState: stateSnapshot(args.state),
    clientEvents,
    attackDebug: {
      client: attackDebugClientEvents(clientEvents),
      server:
        debugBundle.ok && typeof debugBundle.body === "object" && debugBundle.body !== null
          ? {
              timeline: (debugBundle.body as { attackDebug?: unknown }).attackDebug,
              traces: (debugBundle.body as { attackTraces?: unknown }).attackTraces
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
