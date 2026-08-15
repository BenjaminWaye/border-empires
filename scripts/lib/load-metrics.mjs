// Metrics scraping, summary statistics, and cliff detection for the
// concurrent load harness. Extracted from rewrite-concurrent-load.mjs
// (500-line source budget, see AGENTS.md); pure except for fetchMetrics.

export function parseConcurrencyLevels(raw) {
  const levels = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(`CONCURRENCY_LEVELS must be positive integers, got "${trimmed}"`);
    }
    levels.push(n);
  }
  if (levels.length === 0) throw new Error("CONCURRENCY_LEVELS must not be empty");
  return levels;
}

export function computeCliffLevel(levelRecords, thresholds) {
  for (const record of levelRecords) {
    if (record.initFailures > 0) return record.level;
    if (typeof record.acceptedP99Ms === "number" && record.acceptedP99Ms >= thresholds.acceptedP99Ms) return record.level;
    if (typeof record.gatewayEventLoopMaxMs === "number" && record.gatewayEventLoopMaxMs >= thresholds.gatewayEventLoopMaxMs) return record.level;
    if (typeof record.simEventLoopMaxMs === "number" && record.simEventLoopMaxMs >= thresholds.simEventLoopMaxMs) return record.level;
    if (
      typeof thresholds.simWriterQueueDepthMaxDepth === "number" &&
      typeof record.simWriterQueueDepthMaxDepth === "number" &&
      record.simWriterQueueDepthMaxDepth >= thresholds.simWriterQueueDepthMaxDepth
    ) {
      return record.level;
    }
    // Per-action-type SLA (e.g. "1s max, for every action type, at all
    // times") — checked independently of the pooled acceptedP99Ms above so a
    // regression isolated to one action type (say, SETTLE alone going slow)
    // can't hide behind the other types' healthy numbers in the pooled stat.
    if (typeof thresholds.acceptedMaxMsByType === "number" && record.byActionType) {
      for (const stats of Object.values(record.byActionType)) {
        if (typeof stats.maxMs === "number" && stats.maxMs >= thresholds.acceptedMaxMsByType) return record.level;
      }
    }
  }
  return null;
}

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
    const value = Number(parts[1]);
    if (!Number.isFinite(value)) continue;
    metrics[parts[0]] = value;
  }
  return metrics;
};

export const fetchMetrics = async (url) => {
  const response = await fetch(url, { headers: { accept: "text/plain" } });
  if (!response.ok) throw new Error(`failed to fetch ${url}: ${response.status}`);
  return parsePrometheus(await response.text());
};
