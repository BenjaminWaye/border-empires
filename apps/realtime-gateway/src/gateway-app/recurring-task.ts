// Runs `run` once immediately, then again every `intervalMs`, unref'd so it
// never keeps the process alive on its own.
export const startRecurringTask = (run: () => void, intervalMs: number): { stop: () => void } => {
  run();
  const timer = setInterval(run, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  return { stop: () => clearInterval(timer) };
};
