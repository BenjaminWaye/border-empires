// Best-effort console logging for SimulationRuntime diagnostics -- extracted
// out of runtime.ts (over the per-file line cap). Never throws: a failing
// diagnostic must not take a game path down with it.
export const runtimeLogInfo = (payload: Record<string, unknown>, message: string): void => {
  try {
    // eslint-disable-next-line no-console
    console.info(message, payload);
  } catch {
    // best-effort log
  }
};

export const runtimeLogError = (payload: Record<string, unknown>, message: string): void => {
  try {
    // eslint-disable-next-line no-console
    console.error(message, payload);
  } catch {
    // best-effort log
  }
};
