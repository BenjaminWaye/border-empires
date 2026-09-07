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

/**
 * Finds the sample (and its timestamp) where `sample[group][metricKey]` was
 * highest. Result files historically kept only the bare Math.max of a metric
 * across all samples, with no way to tell a single spike from sustained load
 * or when it happened relative to warmup/soak/checkpointing.
 */
export const maxMetricSample = (samples, group, metricKey) =>
  samples.reduce((max, sample) => {
    const value = sample[group]?.[metricKey] ?? 0;
    return !max || value > max.value ? { at: sample.at, value } : max;
  }, null);

/**
 * True when every event-loop-health metric in a scraped sample is under its
 * gate limit -- used both by the warmup gate (before the soak starts) and,
 * conceptually, by the Phase 6 gate check on the full run.
 *
 * Deliberately checks `sim_event_loop_delay_ms{quantile="p99"}` alongside
 * the instant `sim_event_loop_max_ms` gauge, not just the gauge alone: the
 * gauge resets on a short window and can look "stable" within a few seconds
 * of boot, while the p99 quantile is computed over the sim's own rolling
 * ~51s sample window and can keep carrying a one-time cold-start replay
 * spike for tens of seconds after the gauge has already cleared. Gating
 * warmup on the gauge alone let that boot spike still be sitting in the
 * p99 window when the harness started collecting samples, permanently
 * baking a one-time startup cost into the whole run's reported max (see the
 * 2026-09-03/04 nightly gate failures).
 */
export const isEventLoopMetricsStable = (sample, { gatewayEventLoopGateLimitMs, simEventLoopGateLimitMs }) => {
  const gatewayEventLoopMaxMs = sample.gateway["gateway_event_loop_max_ms"] ?? 0;
  const simEventLoopMaxMs = sample.simulation["sim_event_loop_max_ms"] ?? 0;
  const simEventLoopP99Ms = sample.simulation['sim_event_loop_delay_ms{quantile="p99"}'] ?? 0;
  return {
    stable:
      gatewayEventLoopMaxMs < gatewayEventLoopGateLimitMs &&
      simEventLoopMaxMs < simEventLoopGateLimitMs &&
      simEventLoopP99Ms < simEventLoopGateLimitMs,
    gatewayEventLoopMaxMs,
    simEventLoopMaxMs,
    simEventLoopP99Ms
  };
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
