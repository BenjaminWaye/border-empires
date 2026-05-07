const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export type StartupRetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onAttemptFailed?: (error: unknown, attempt: number, delayMs: number) => void;
};

export const retryStartup = async <T>(
  label: string,
  operation: () => Promise<T>,
  options: StartupRetryOptions = {}
): Promise<T> => {
  const attempts = Math.max(1, options.attempts ?? 8);
  const baseDelayMs = Math.max(50, options.baseDelayMs ?? 500);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 10_000);

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.min(5, attempt - 1));
      options.onAttemptFailed?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }
  if (lastError instanceof Error) {
    lastError.message = `${label} failed after ${attempts} attempts: ${lastError.message}`;
    throw lastError;
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${String(lastError)}`);
};
