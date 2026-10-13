import { recordClientDebugEvent } from "../client-debug/client-debug.js";
import type { ClientState } from "../client-state/client-state.js";
import { isMusterAdvanceCommandId } from "../client-siege-tracking/client-siege-tracking.js";

export type ReportState = Pick<ClientState, "me" | "joinSeasonId" | "tiles">;
export type MusterCombatReport = {
  id: string; flagKey: string; at: number; title: string; detail: string;
  targetX: number; targetY: number; won: boolean; manpowerDelta: number;
  coins: number; read: boolean;
};
export type CombatReportAlert = { title: string; detail: string; tone: "success" | "warn"; manpowerLoss?: number; focusX?: number; focusY?: number; actionLabel?: string };
type Store = { scope: string; reports: MusterCombatReport[]; pending: Map<string, { flagKey: string; at: number }>; evictions: number };
const stores = new WeakMap<ReportState, Store>();
const STORAGE_KEY = "border-empires:muster-combat-reports:v1";
export const MAX_MUSTER_REPORTS = 200;
export const MAX_REPORTS_PER_FLAG = 40;
const MAX_PENDING = 64;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const point = (value: unknown): { x: number; y: number } | undefined => {
  if (!value || typeof value !== "object" || !("x" in value) || !("y" in value)) return undefined;
  return finite(value.x) && finite(value.y) ? { x: value.x, y: value.y } : undefined;
};
const isReport = (value: unknown): value is MusterCombatReport => {
  if (!value || typeof value !== "object") return false;
  return "id" in value && typeof value.id === "string" && value.id.length <= 300 &&
    "flagKey" in value && typeof value.flagKey === "string" && /^\d+,\d+$/.test(value.flagKey) &&
    "title" in value && typeof value.title === "string" && value.title.length <= 200 &&
    "detail" in value && typeof value.detail === "string" && value.detail.length <= 3000 &&
    "at" in value && finite(value.at) && value.at > 0 && value.at <= 8.64e15 && "targetX" in value && finite(value.targetX) &&
    "targetY" in value && finite(value.targetY) && "won" in value && typeof value.won === "boolean" &&
    "manpowerDelta" in value && finite(value.manpowerDelta) && "coins" in value && finite(value.coins) &&
    "read" in value && typeof value.read === "boolean";
};
const bounded = (reports: MusterCombatReport[]): MusterCombatReport[] => {
  const counts = new Map<string, number>();
  const ids = new Set<string>();
  return reports.filter((report) => {
    const count = counts.get(report.flagKey) ?? 0;
    if (ids.has(report.id) || count >= MAX_REPORTS_PER_FLAG) return false;
    counts.set(report.flagKey, count + 1); ids.add(report.id);
    return true;
  }).slice(0, MAX_MUSTER_REPORTS);
};
const storeFor = (state: ReportState): Store => {
  const scope = `${state.me}:${state.joinSeasonId}`;
  const cached = stores.get(state);
  if (cached?.scope === scope) return cached;
  let reports: MusterCombatReport[] = [];
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved && typeof saved === "object" && "scope" in saved && saved.scope === scope && "reports" in saved && Array.isArray(saved.reports)) {
      reports = bounded(saved.reports.slice(0, MAX_MUSTER_REPORTS).filter(isReport));
    }
  } catch { /* Reports still work when browser storage is unavailable. */ }
  const store: Store = { scope, reports, pending: new Map(), evictions: 0 };
  stores.set(state, store);
  return store;
};
const logBuffer = (store: Store): void => recordClientDebugEvent("info", "muster-combat-reports", "buffer", {
  reports: store.reports.length, pending: store.pending.size, evictions: store.evictions
});
const persist = (store: Store): void => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ scope: store.scope, reports: store.reports })); }
  catch { /* Quota/private browsing must never interfere with combat. */ }
};
const prunePending = (store: Store, now: number): void => {
  for (const [id, pending] of store.pending) {
    if (now - pending.at > 180_000) { store.pending.delete(id); store.evictions += 1; }
  }
};
/** Retain the actual flag's coordinates: the attack origin may be a remote foothold. */
export const trackMusterReportStart = (state: ReportState, msg: Record<string, unknown>): void => {
  if (!isMusterAdvanceCommandId(msg.commandId)) return;
  const origin = point(msg.musterOrigin) ?? point(msg.origin);
  if (!origin) return;
  const store = storeFor(state);
  prunePending(store, Date.now());
  store.pending.set(msg.commandId, { flagKey: `${origin.x},${origin.y}`, at: Date.now() });
  while (store.pending.size > MAX_PENDING) {
    const oldest = store.pending.keys().next().value;
    if (oldest === undefined) break;
    store.pending.delete(oldest); store.evictions += 1;
  }
  logBuffer(store);
};
export const musterReportFlagKey = (state: ReportState, msg: Record<string, unknown>): string | undefined => {
  if (!isMusterAdvanceCommandId(msg.commandId)) return undefined;
  const store = storeFor(state);
  prunePending(store, Date.now());
  const tracked = store.pending.get(msg.commandId);
  if (tracked) return tracked.flagKey;
  const origin = point(msg.musterOrigin) ?? point(msg.origin);
  if (!origin) return undefined;
  const key = `${origin.x},${origin.y}`;
  return state.tiles.get(key)?.muster?.ownerId === state.me ? key : undefined;
};
export const recordMusterCombatReport = (state: ReportState, msg: Record<string, unknown>, flagKey: string, alert: CombatReportAlert): void => {
  const target = point(msg.target);
  if (!target || typeof msg.commandId !== "string") return;
  const store = storeFor(state);
  store.pending.delete(msg.commandId);
  if (store.reports.some((report) => report.id === msg.commandId)) return;
  const report: MusterCombatReport = {
    id: msg.commandId, flagKey, at: Date.now(), title: alert.title.slice(0, 200), detail: alert.detail.slice(0, 3000),
    targetX: target.x, targetY: target.y, won: msg.attackerWon === true,
    manpowerDelta: finite(msg.manpowerDelta) ? msg.manpowerDelta : -(alert.manpowerLoss ?? 0),
    coins: finite(msg.pillagedGold) ? Math.max(0, msg.pillagedGold) : 0, read: false
  };
  const incoming = [report, ...store.reports];
  store.reports = bounded(incoming);
  store.evictions += incoming.length - store.reports.length;
  persist(store);
  logBuffer(store);
};
export const musterCombatReports = (state: ReportState, flagKey: string): MusterCombatReport[] =>
  storeFor(state).reports.filter((report) => report.flagKey === flagKey);
export const markMusterReportsRead = (state: ReportState, ids: readonly string[]): void => {
  const store = storeFor(state);
  const visible = new Set(ids);
  for (const report of store.reports) if (visible.has(report.id)) report.read = true;
  persist(store);
};
/** Cheap bounded-buffer diagnostics; no server snapshot contains this browser history. */
export const musterReportDiagnostics = (state: ReportState): { reports: number; pending: number; evictions: number } => {
  const store = storeFor(state);
  return { reports: store.reports.length, pending: store.pending.size, evictions: store.evictions };
};
