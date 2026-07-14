// Node's PerformanceEntry for entryType "gc" carries a numeric `kind` bitflag
// (see node:perf_hooks constants.NODE_PERFORMANCE_GC_*). The GC observer in
// simulation-service.ts logged this raw number for gc_pause_detected events,
// making it impossible to tell a cheap scavenge (minor GC) from an expensive
// mark-sweep-compact (major GC) without cross-referencing V8 internals by
// hand during an incident. Decode it into a stable, human-readable label so
// death-forensics and event_loop_blocked correlation can distinguish them.
const GC_KIND_FLAGS: ReadonlyArray<readonly [number, string]> = [
  [1, "scavenge"],
  [2, "mark_sweep_compact"],
  [4, "incremental_marking"],
  [8, "weak_callbacks"],
  [16, "all"]
];

/**
 * Decodes a Node GC PerformanceEntry `kind` bitflag into one or more
 * human-readable labels (joined with "+" when multiple bits are set).
 * Returns "unknown" for an unrecognised or missing value.
 */
export const decodeGcKind = (kind: number | undefined): string => {
  if (typeof kind !== "number" || !Number.isFinite(kind) || kind <= 0) return "unknown";
  const matched = GC_KIND_FLAGS.filter(([flag]) => (kind & flag) === flag).map(([, label]) => label);
  return matched.length > 0 ? matched.join("+") : "unknown";
};
