// Gateway SQLite runs on the event-loop thread. A long busy_timeout blocks
// every WebSocket and health check, so retry lock contention asynchronously.
export const GATEWAY_SQLITE_BUSY_TIMEOUT_MS = 100;
const MAX_RETRY_ELAPSED_MS = 8_000;

const isSqliteBusy = (error: unknown): boolean => {
  const errcode = (error as { errcode?: number } | undefined)?.errcode;
  return typeof errcode === "number" && (errcode & 0xff) === 5;
};

export const withGatewaySqliteRetry = async <T>(operation: () => T): Promise<T> => {
  const deadline = Date.now() + MAX_RETRY_ELAPSED_MS;
  let delayMs = 25;
  while (true) {
    try {
      return operation();
    } catch (error) {
      if (!isSqliteBusy(error) || Date.now() >= deadline) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.min(delayMs * 2, 400);
    }
  }
};
