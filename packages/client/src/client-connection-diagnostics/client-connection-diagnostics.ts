import { attackSyncLog, recordClientDebugEvent } from "../client-debug/client-debug.js";
import { storageGet, storageSet } from "../client-state/client-state.js";

// Players have reported frequent reconnects. The in-memory debug event ring
// (client-debug.ts) is lost on a hard reload, and scheduleReconnectReload()
// in client-network.ts does exactly that after ~4s of being disconnected —
// so a purely in-memory log can't show the history that led up to a report.
// This module persists a small bounded history of disconnects to
// localStorage (survives reload/tab-close) so a "why do I keep
// disconnecting?" report can be diagnosed from a downloaded diagnostics
// bundle (see client-diagnostics.ts) without needing to reproduce live.
const DISCONNECT_LOG_STORAGE_KEY = "border-empires-disconnect-log-v1";
const MAX_DISCONNECT_LOG_ENTRIES = 25;

export type SocketDisconnectKind = "close" | "error";

export type DisconnectLogEntry = {
  atMs: number;
  kind: SocketDisconnectKind;
  // WebSocket CloseEvent.code (e.g. 1000 normal, 1001 going-away, 1006 no
  // close frame received — usually a network drop / proxy idle timeout,
  // 1011 server error). "error" events don't carry a close code.
  code?: number | undefined;
  reason?: string | undefined;
  wasClean?: boolean | undefined;
  // How long the socket had been open before this disconnect. Short/repeating
  // values here point at a flapping connection (proxy timeout, bad network)
  // rather than an isolated blip.
  connectionUptimeMs?: number | undefined;
};

const readDisconnectLog = (): DisconnectLogEntry[] => {
  const raw = storageGet(DISCONNECT_LOG_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as DisconnectLogEntry[]) : [];
  } catch {
    return [];
  }
};

const writeDisconnectLog = (entries: DisconnectLogEntry[]): void => {
  storageSet(DISCONNECT_LOG_STORAGE_KEY, JSON.stringify(entries.slice(-MAX_DISCONNECT_LOG_ENTRIES)));
};

export const recordDisconnectHistory = (entry: Omit<DisconnectLogEntry, "atMs">): DisconnectLogEntry[] => {
  const entries = [...readDisconnectLog(), { atMs: Date.now(), ...entry }];
  const trimmed = entries.slice(-MAX_DISCONNECT_LOG_ENTRIES);
  writeDisconnectLog(trimmed);
  return trimmed;
};

export const snapshotDisconnectHistory = (): DisconnectLogEntry[] => readDisconnectLog();

// Summarizes the recent disconnect history for the diagnostics bundle: total
// count, how many were "abnormal" (no clean close), and the shortest gap
// between consecutive disconnects (the strongest signal of a flapping
// connection vs an isolated one-off).
export const summarizeDisconnectHistory = (): {
  totalRecorded: number;
  abnormalCount: number;
  shortestUptimeMs: number | null;
  recent: DisconnectLogEntry[];
} => {
  const entries = readDisconnectLog();
  const abnormalCount = entries.filter(
    (entry) => entry.kind === "error" || entry.wasClean === false || (entry.code !== undefined && entry.code !== 1000 && entry.code !== 1001)
  ).length;
  const uptimes = entries.map((entry) => entry.connectionUptimeMs).filter((value): value is number => typeof value === "number");
  return {
    totalRecorded: entries.length,
    abnormalCount,
    shortestUptimeMs: uptimes.length > 0 ? Math.min(...uptimes) : null,
    recent: entries.slice(-10)
  };
};

// Records a disconnect for both the in-session debug log (client-debug.ts,
// shown in tile-sync-debug console output) and the persisted history above,
// then returns the summary so callers can decide whether to warn the player.
export const recordSocketDisconnect = (
  kind: SocketDisconnectKind,
  details: {
    code?: number | undefined;
    reason?: string | undefined;
    wasClean?: boolean | undefined;
    connectionUptimeMs?: number | undefined;
    debugPayload: Record<string, unknown>;
  }
): void => {
  attackSyncLog(kind === "close" ? "ws-close" : "ws-error", details.debugPayload);
  const entries = recordDisconnectHistory({
    kind,
    code: details.code,
    reason: details.reason,
    wasClean: details.wasClean,
    connectionUptimeMs: details.connectionUptimeMs
  });
  recordClientDebugEvent("info", "connection", "disconnect-history-updated", { totalRecorded: entries.length });
};
