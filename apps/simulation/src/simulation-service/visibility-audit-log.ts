import type { VisibilityAuditSample } from "../runtime/runtime.js";

// The runtime's onVisibilityAudit sink, split out of simulation-service.ts
// (over the file-line cap). Unattributed visibility (no coverage reason --
// a likely leak) is always logged as a warn; attributed samples only when
// SIMULATION_VISIBILITY_AUDIT=1. Each player+tile pair logs at most once per
// SIMULATION_VISIBILITY_AUDIT_DEDUP_MS (default 30s). For a one-off "why can
// this player see that tile?" use /debug/tile-visibility instead
// (runtime/runtime-tile-visibility-debug.ts).
export type VisibilityAuditLogger = (level: "info" | "warn", message: string, payload: Record<string, unknown>) => void;

const DEDUP_MAX_ENTRIES = 10_000;

export const createVisibilityAuditHandler = (
  emitLog: VisibilityAuditLogger,
  env: NodeJS.ProcessEnv = process.env
): ((sample: VisibilityAuditSample) => void) => {
  const attributedEnabled = env.SIMULATION_VISIBILITY_AUDIT === "1";
  const dedupMs = Math.max(1000, Number(env.SIMULATION_VISIBILITY_AUDIT_DEDUP_MS ?? 30_000));
  const dedup = new Map<string, number>();
  return (sample) => {
    const isUnattributed = sample.reasons.length === 0;
    if (!isUnattributed && !attributedEnabled) return;
    const dedupKey = `${sample.playerId}:${sample.tileKey}`;
    const at = Date.now();
    const last = dedup.get(dedupKey);
    if (last !== undefined && at - last < dedupMs) return;
    dedup.set(dedupKey, at);
    if (dedup.size > DEDUP_MAX_ENTRIES) {
      const cutoff = at - dedupMs * 5;
      for (const [key, ts] of dedup) {
        if (ts < cutoff) dedup.delete(key);
      }
    }
    emitLog(isUnattributed ? "warn" : "info", "simulation visibility audit", {
      event: isUnattributed ? "sim_visibility_unattributed" : "sim_visibility_attributed",
      playerId: sample.playerId,
      tileKey: sample.tileKey,
      x: sample.x,
      y: sample.y,
      ownerId: sample.ownerId,
      reasons: sample.reasons,
      redacted: sample.redacted
    });
  };
};
