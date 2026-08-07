// A constraint violation (e.g. UNIQUE(player_id, client_seq)) is a
// deterministic logic error, not a durability failure: restarting re-runs
// the exact same write and re-throws, crash-looping the process (staging,
// 2026-07-14). Callers should skip the offending command and keep serving
// instead of treating this like a transient/fatal persistence failure — see
// next-client-seq.ts for the actual root-cause fix (seq seeding).
export const isPersistenceConstraintViolation = (error: Error): boolean =>
  error.message.toLowerCase().includes("constraint failed");

type ConstraintViolationMetrics = { incrementSimPersistenceConstraintViolation: () => void };
type RecordLagDiagnostic = (level: "warn" | "error", event: string, payload: Record<string, unknown>) => void;
type ErrorLogger = { error: (payload: Record<string, unknown>, message: string) => void };

/** Records metrics/diagnostics and returns true iff `error` is a deterministic constraint violation the caller should skip. */
export const handlePersistenceConstraintViolation = (
  error: Error,
  metrics: ConstraintViolationMetrics,
  recordLagDiagnostic: RecordLagDiagnostic,
  log: ErrorLogger
): boolean => {
  if (!isPersistenceConstraintViolation(error)) return false;
  metrics.incrementSimPersistenceConstraintViolation();
  recordLagDiagnostic("error", "simulation_persistence_constraint_violation", { error: error.message });
  log.error({ err: error }, "simulation persistence constraint violation (non-fatal, command skipped)");
  return true;
};
