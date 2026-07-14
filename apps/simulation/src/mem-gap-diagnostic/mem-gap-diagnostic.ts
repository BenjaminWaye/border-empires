// The 2026-07-14 staging watchdog_kill death forensics showed rssMb: 531 with
// heapUsedMb: 56 / heapTotalMb: 67 at the last diagnostic snapshot before the
// 30s stall — a ~460MB gap between OS-reported RSS and V8 heap. That gap is
// memory outside the tracked JS heap (native SQLite pages, ArrayBuffers from
// snapshot/tile-delta serialization, ArrayBuffer fragmentation) and is
// invisible to heapUsedMb/heapTotalMb alone. Surface it explicitly so an
// incident can distinguish "V8 heap pressure" from "external memory growth".
export const DEFAULT_RSS_HEAP_GAP_WARN_MB = 300;

export type RssHeapGapMemoryUsage = Pick<NodeJS.MemoryUsage, "rss" | "heapTotal">;

/** Returns the gap in MB between OS-reported RSS and the V8 heap's total reserved size. */
export const computeRssHeapGapMb = (memory: RssHeapGapMemoryUsage): number =>
  Math.max(0, (memory.rss - memory.heapTotal) / (1024 * 1024));

/** True when the RSS/heap gap exceeds the warn threshold (default 300MB). */
export const shouldWarnRssHeapGap = (gapMb: number, warnThresholdMb: number = DEFAULT_RSS_HEAP_GAP_WARN_MB): boolean =>
  warnThresholdMb > 0 && gapMb >= warnThresholdMb;

const DEFAULT_RSS_HEAP_GAP_WARN_COOLDOWN_MS = 60_000;

export type RssHeapGapMonitor = {
  /** Call on every sample; returns the current gap and whether to actually emit a warning this call (cooldown-gated). */
  check(memory: RssHeapGapMemoryUsage): { gapMb: number; shouldWarn: boolean };
};

// A sustained RSS/heap gap (e.g. GC thrash under load) would otherwise re-warn
// on every metricsTicker sample (1Hz), spamming logs and evicting the
// 50-entry lag-diagnostics ring buffer of other, more actionable diagnostics
// within under a minute. Gate re-warning to once per cooldown window.
export const createRssHeapGapMonitor = (
  options: { warnThresholdMb?: number; cooldownMs?: number; now?: () => number } = {}
): RssHeapGapMonitor => {
  const warnThresholdMb = options.warnThresholdMb ?? DEFAULT_RSS_HEAP_GAP_WARN_MB;
  const cooldownMs = Math.max(0, options.cooldownMs ?? DEFAULT_RSS_HEAP_GAP_WARN_COOLDOWN_MS);
  const now = options.now ?? (() => Date.now());
  // -Infinity (not 0) so the first eligible check always warns, even if
  // called at/near process-start when Date.now()/now() is itself small.
  let lastWarnedAtMs = -Infinity;
  return {
    check(memory) {
      const gapMb = computeRssHeapGapMb(memory);
      const nowMs = now();
      const shouldWarn = shouldWarnRssHeapGap(gapMb, warnThresholdMb) && nowMs - lastWarnedAtMs >= cooldownMs;
      if (shouldWarn) lastWarnedAtMs = nowMs;
      return { gapMb, shouldWarn };
    }
  };
};
