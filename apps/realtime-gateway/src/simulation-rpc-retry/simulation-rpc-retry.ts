import { withTimeout } from "../promise-timeout.js";
import { sleep } from "../gateway-app/gateway-app-helpers.js";

/**
 * Bounded retry-with-backoff for the gateway's per-login simulation RPCs
 * (PreparePlayer, bootstrap/live SubscribePlayer, FetchTileDetail). Extracted
 * from gateway-app.ts unchanged so that file can stay under its line cap.
 */
export type SimulationRpcRetryConfig = {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export type SimulationRpcRetry = <T>(
  label: string,
  operation: () => Promise<T>,
  timeoutMs: number,
  onAttemptFailed?: (error: unknown, attempt: number) => void
) => Promise<T>;

/**
 * Resolves the retry policy from the gateway option (attempts only) and the
 * GATEWAY_SIMULATION_RPC_RETRY_* env vars, clamped to sane minimums.
 */
export const resolveSimulationRpcRetryConfig = (
  configuredAttempts: number | undefined,
  env: NodeJS.ProcessEnv
): SimulationRpcRetryConfig => {
  const attempts = Math.max(1, configuredAttempts ?? Number(env.GATEWAY_SIMULATION_RPC_RETRY_ATTEMPTS ?? 3));
  const baseDelayMs = Math.max(50, Number(env.GATEWAY_SIMULATION_RPC_RETRY_BASE_DELAY_MS ?? 250));
  const maxDelayMs = Math.max(baseDelayMs, Number(env.GATEWAY_SIMULATION_RPC_RETRY_MAX_DELAY_MS ?? 2_000));
  return { attempts, baseDelayMs, maxDelayMs };
};

/**
 * Each attempt is individually time-boxed; `onAttemptFailed` fires for every
 * failed attempt except the last, whose error is rethrown.
 */
export const createSimulationRpcRetry = (config: SimulationRpcRetryConfig): SimulationRpcRetry =>
  async <T>(
    label: string,
    operation: () => Promise<T>,
    timeoutMs: number,
    onAttemptFailed?: (error: unknown, attempt: number) => void
  ): Promise<T> => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= config.attempts; attempt += 1) {
      try {
        return await withTimeout(operation(), timeoutMs, label);
      } catch (error) {
        lastError = error;
        if (attempt >= config.attempts) break;
        onAttemptFailed?.(error, attempt);
        const backoffMs = Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** (attempt - 1));
        await sleep(backoffMs);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  };
