// Progress deltas for the Chronicle's report: how far the player's victory paths moved since their last
// visit ("Maritime Supremacy 31% → 36%", docs/visit-as-a-turn.md §2.1). The server keeps no history of
// path progress, so the previous visit's figures are remembered in this browser, per contest and House.
// A first visit (or a new device) has nothing to compare with and shows no block.

import type { ClientState } from "../client-state/client-state.js";
import { storageGet, storageSet } from "../client-state/client-storage.js";
import type { SeasonVictoryObjectiveView } from "../client-types.js";
import { selfShare } from "./client-hud-v2-ranks.js";

/** The player's own share (0..1) of each victory path at one moment. */
export type ProgressSnapshot = { at: number; paths: Record<string, number> };

/** What is kept in storage: the figures the current visit compares against, and the newest ones seen. */
export type StoredVisitProgress = { key: string; baseline?: ProgressSnapshot | undefined; latest?: ProgressSnapshot | undefined };

export type ProgressDelta = { id: string; name: string; beforePct: number; nowPct: number };

/** Nothing recorded for this long (the app was closed or hidden) ends a visit: the newest remembered figures become the baseline. */
export const VISIT_GAP_MS = 30 * 60_000;
/** The block lists the paths that moved most; more would push the timeline off a phone screen. */
export const PROGRESS_DELTA_CAP = 3;

const STORAGE_KEY = "border-empires-visit-progress-v1";

export const progressSnapshot = (objectives: readonly SeasonVictoryObjectiveView[], me: string, nowMs: number): ProgressSnapshot => {
  const paths: Record<string, number> = {};
  for (const objective of objectives) {
    const share = selfShare(objective, me);
    if (share !== undefined) paths[objective.id] = share;
  }
  return { at: nowMs, paths };
};

/**
 * The stored record as figures are about to be recorded. Another contest or House starts empty. After
 * VISIT_GAP_MS with nothing recorded, the newest remembered figures become what this visit is compared
 * against; within a visit the baseline stays put, so the deltas do not vanish on a second look.
 */
export const rotateVisitProgress = (stored: StoredVisitProgress | undefined, key: string, nowMs: number): StoredVisitProgress => {
  if (!stored || stored.key !== key) return { key };
  if (stored.latest && nowMs - stored.latest.at > VISIT_GAP_MS) return { key, baseline: stored.latest, latest: stored.latest };
  return stored;
};

/** Paths whose whole-percent figure changed since the baseline, biggest move first. */
export const progressDeltas = (baseline: ProgressSnapshot | undefined, objectives: readonly SeasonVictoryObjectiveView[], me: string): ProgressDelta[] => {
  if (!baseline) return [];
  const deltas: ProgressDelta[] = [];
  for (const objective of objectives) {
    const before = baseline.paths[objective.id];
    const now = selfShare(objective, me);
    if (before === undefined || now === undefined) continue;
    const beforePct = Math.round(before * 100);
    const nowPct = Math.round(now * 100);
    if (beforePct !== nowPct) deltas.push({ id: objective.id, name: objective.name, beforePct, nowPct });
  }
  return deltas.sort((a, b) => Math.abs(b.nowPct - b.beforePct) - Math.abs(a.nowPct - a.beforePct)).slice(0, PROGRESS_DELTA_CAP);
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The progress block (one button that opens Ranks), or "" when no path moved. */
export const chronicleProgressHtml = (deltas: readonly ProgressDelta[]): string => {
  if (deltas.length === 0) return "";
  const rows = deltas.map((d) =>
    `<span class="v2c-progress-row"><span>${esc(d.name)}</span><b class="${d.nowPct > d.beforePct ? "v2c-gain" : "v2c-loss"}">${d.beforePct}% → ${d.nowPct}%</b></span>`
  ).join("");
  return `<button type="button" class="v2c-progress" data-hud-v2-open="ranks" title="Open Ranks"><span class="v2c-progress-h">YOUR VICTORY PATHS SINCE YOUR LAST VISIT</span>${rows}</button>`;
};

const isSnapshot = (value: unknown): value is ProgressSnapshot => {
  if (typeof value !== "object" || value === null) return false;
  const { at, paths } = value as { at?: unknown; paths?: unknown };
  return typeof at === "number" && typeof paths === "object" && paths !== null && Object.values(paths).every((share) => typeof share === "number");
};

/** Storage text to a record; anything malformed reads as nothing remembered. */
export const parseStoredVisitProgress = (raw: string | null): StoredVisitProgress | undefined => {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as { key?: unknown; baseline?: unknown; latest?: unknown };
    if (typeof value.key !== "string") return undefined;
    return { key: value.key, ...(isSnapshot(value.baseline) ? { baseline: value.baseline } : {}), ...(isSnapshot(value.latest) ? { latest: value.latest } : {}) };
  } catch {
    return undefined;
  }
};

type ProgressState = Pick<ClientState, "me" | "bridgeDebugSeasonId" | "seasonVictory">;

const visitKey = (state: ProgressState): string | undefined => (state.me && state.bridgeDebugSeasonId ? `${state.bridgeDebugSeasonId}|${state.me}` : undefined);

/** One record per contest and House, so two Houses on one browser do not wipe each other's figures. */
const storageKeyFor = (key: string): string => `${STORAGE_KEY}:${key}`;

/** The figures are re-read this often while the game is on screen. */
export const RECORD_EVERY_MS = 60_000;

let visit: StoredVisitProgress | undefined;
let recordedAt = 0;

/** Test-only: forget the visit held in memory (as a page reload does). */
export const resetVisitProgressForTests = (): void => { visit = undefined; recordedAt = 0; };

/**
 * Called from the HUD's frame loop while the game is on screen, whether or not the Chronicle is open:
 * remembers the current figures about once a minute. A visit ends when nothing was recorded for
 * VISIT_GAP_MS (the app was closed or hidden); the last figures of that visit then become what the next
 * one is compared against. So the block shows what moved while the player was away, not what they
 * moved themselves between two looks at the Chronicle.
 */
export const recordVisitProgress = (state: ProgressState, nowMs: number, visible = true): void => {
  const key = visitKey(state);
  if (!key || !visible) return;
  if (visit?.key === key && nowMs >= recordedAt && nowMs - recordedAt < RECORD_EVERY_MS) return;
  const current = progressSnapshot(state.seasonVictory, state.me, nowMs);
  // The victory race arrives after INIT: an empty snapshot must not overwrite remembered figures.
  if (Object.keys(current.paths).length === 0) return;
  const held = visit?.key === key ? visit : parseStoredVisitProgress(storageGet(storageKeyFor(key)));
  visit = { ...rotateVisitProgress(held, key, nowMs), latest: current };
  recordedAt = nowMs;
  storageSet(storageKeyFor(key), JSON.stringify(visit));
};

/** The deltas to show now: the current figures against the end of the previous visit. */
export const chronicleProgressForState = (state: ProgressState): ProgressDelta[] =>
  visit && visit.key === visitKey(state) ? progressDeltas(visit.baseline, state.seasonVictory, state.me) : [];
