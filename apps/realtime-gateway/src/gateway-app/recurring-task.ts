// Runs periodically, optionally once immediately. The timer never keeps
// the process alive on its own.
export const startRecurringTask = (run: () => void, intervalMs: number, options?: { runImmediately?: boolean }): { stop: () => void } => {
  if (options?.runImmediately !== false) run();
  const timer = setInterval(run, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  return { stop: () => clearInterval(timer) };
};
