import { snapshotClientDebugEvents } from "./client-debug/client-debug.js";
import type { ClientState } from "./client-state/client-state.js";

// Snapshot of state useful for triaging a stuck-login report: identity bits
// (anonymised), connection state, elapsed timers, recent network/auth events.
// Excludes auth tokens and any heavy snapshot payloads.
export const buildDiagnosticsBundle = (
  state: Pick<
    ClientState,
    "connection" | "firstChunkAt" | "mapLoadStartedAt" | "chunkFullCount" | "authSessionReady" | "authRetrying" | "authBusyTitle" | "authBusyDetail" | "authEmail" | "authReady" | "authUserLabel" | "hasEverInitialized"
  >,
  wsUrl: string,
  now: number = Date.now()
): Record<string, unknown> => {
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
      hasEverInitialized: state.hasEverInitialized
    },
    recentDebugEvents: snapshotClientDebugEvents()
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
    // Last-resort: log to console so a developer-tools user can still grab it.
    console.error("[diagnostics] download failed", error);
    console.error("[diagnostics] bundle", bundle);
  }
};
