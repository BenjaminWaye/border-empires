// Throttle for the Integrity drop notice: only drops of INTEGRITY_DROP_MIN_PTS
// or more from the last level shown (or reached), batched for
// INTEGRITY_DROP_BATCH_MS so a run of captures or claims gives one notice, and
// at most one notice per INTEGRITY_DROP_COOLDOWN_MS.

import type { IntegritySnapshot } from "./client-integrity-drop-cause.js";

export const INTEGRITY_DROP_MIN_PTS = 3;
export const INTEGRITY_DROP_BATCH_MS = 5_000;
export const INTEGRITY_DROP_COOLDOWN_MS = 120_000;

export type IntegrityDropTracker = {
  /** The level a drop is measured from: the first fresh value, then each notice or recovery. */
  baseline: IntegritySnapshot | undefined;
  /** When the current, not yet shown, drop was first seen. */
  dropSeenAt: number | undefined;
  lastNoticeAt: number;
};

export const createIntegrityDropTracker = (): IntegrityDropTracker => ({ baseline: undefined, dropSeenAt: undefined, lastNoticeAt: -Infinity });

export type IntegrityDropDecision =
  | { readonly kind: "none" }
  | { readonly kind: "wait"; readonly ms: number }
  | { readonly kind: "notice"; readonly before: IntegritySnapshot; readonly after: IntegritySnapshot };

/** Feed every fresh server value (and re-feed the latest when a "wait" ends). */
export const observeIntegrity = (tracker: IntegrityDropTracker, snapshot: IntegritySnapshot, nowMs: number): IntegrityDropDecision => {
  const baseline = tracker.baseline;
  if (!baseline || snapshot.pct >= baseline.pct) {
    tracker.baseline = snapshot;
    tracker.dropSeenAt = undefined;
    return { kind: "none" };
  }
  if (baseline.pct - snapshot.pct < INTEGRITY_DROP_MIN_PTS) return { kind: "none" };
  tracker.dropSeenAt ??= nowMs;
  const readyAt = Math.max(tracker.dropSeenAt + INTEGRITY_DROP_BATCH_MS, tracker.lastNoticeAt + INTEGRITY_DROP_COOLDOWN_MS);
  if (nowMs < readyAt) return { kind: "wait", ms: readyAt - nowMs };
  tracker.baseline = snapshot;
  tracker.dropSeenAt = undefined;
  tracker.lastNoticeAt = nowMs;
  return { kind: "notice", before: baseline, after: snapshot };
};
