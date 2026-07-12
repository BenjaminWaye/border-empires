import { startRecurringTask } from "./recurring-task.js";

export type StartDatabaseKeepAliveDeps = {
  nextClientSeqForPlayer: (playerId: string) => Promise<number>;
  recordGatewayEvent: (level: "info" | "warn" | "error", event: string, payload?: Record<string, unknown>) => void;
  intervalMs?: number;
};

// Periodically touches the command store so managed Postgres/SQLite backends
// don't consider the connection idle and reclaim it during quiet periods.
export const startDatabaseKeepAlive = (deps: StartDatabaseKeepAliveDeps): { stop: () => void } => {
  const intervalMs = deps.intervalMs ?? Math.max(60_000, Number(process.env.GATEWAY_DATABASE_KEEPALIVE_MS ?? 6 * 60 * 60 * 1000));
  return startRecurringTask(() => {
    void deps
      .nextClientSeqForPlayer("__supabase_keepalive__")
      .then(() => {
        deps.recordGatewayEvent("info", "gateway_database_keepalive_ok", {});
      })
      .catch((error: unknown) => {
        deps.recordGatewayEvent("warn", "gateway_database_keepalive_failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      });
  }, intervalMs);
};
