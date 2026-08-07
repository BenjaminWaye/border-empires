// Pure/side-effect-light helpers extracted from rewrite-load-harness.mjs so
// they can be unit tested without executing the harness's top-level soak
// orchestration (which spawns child processes and runs for real wall-clock
// minutes).

export const quantile = (values, q) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[index] ?? null;
};

export const parsePrometheus = (text) => {
  const metrics = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const key = parts[0];
    const value = Number(parts[1]);
    if (!Number.isFinite(value)) continue;
    metrics[key] = value;
  }
  return metrics;
};

/**
 * Runs `readSample` and pushes its result onto `samples`, but never throws:
 * a failure (e.g. the simulation or gateway process died and its metrics
 * port stopped responding) is recorded onto `errors` instead.
 *
 * This matters most for the *final* post-soak metrics collection: if that
 * call is left unguarded and the target process died at any point during
 * the (up to 30-minute) soak, an unhandled rejection kills the whole
 * harness process before it writes docs/load-results/<date>.json — losing
 * every batch and sample collected during the run, not just the last one.
 */
export const safeCollectMetricsSample = async (readSample, samples, errors, label) => {
  try {
    samples.push(await readSample());
    return true;
  } catch (error) {
    errors.push({
      at: Date.now(),
      message: `${label}: ${error instanceof Error ? error.message.slice(0, 400) : String(error).slice(0, 400)}`
    });
    return false;
  }
};
