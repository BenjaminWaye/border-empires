/**
 * Which cells each live vision contribution actually added, so removing it
 * subtracts exactly those cells (visibility-coverage-raster.ts).
 *
 * A footprint's cells depend on terrain: mountains and forest occlude it
 * (vision-footprint-table.ts). Recomputing the footprint on removal used to
 * subtract a different set of cells whenever a mountain was raised or removed,
 * or forest cleared, in range between the add and the remove: some cells were
 * never released (a tile stayed visible for good) and others were released
 * twice (a tile dropped out of view while still seen). Every coverage edge
 * consumer inherited that drift: fog deltas, explored-tile memory, and the
 * Planetary Defense camp awake counts.
 *
 * Holds a reference to the footprint table's own memoized offset array, so an
 * entry costs one map slot, not a copy of its cells. Bounded by the live
 * contributions: every entry is removed by the matching removal, and the
 * coverage maps already hold more (one entry per visible cell per viewer,
 * versus one per vision source here). `size()` is the gauge.
 */
export type FootprintOffsets = ReadonlyArray<readonly [number, number]>;

type LedgerEntry = { offsets: FootprintOffsets; count: number };

export class VisibilityFootprintLedger {
  // viewerId -> contribution key -> the distinct offset arrays it was added with
  // (more than one only if terrain changed between two adds of the same source).
  private readonly byViewer = new Map<string, Map<string, LedgerEntry[]>>();
  private entryCount = 0;

  static keyFor(x: number, y: number, radius: number, ignoreForest: boolean): string {
    return `${x},${y},${radius},${ignoreForest ? 1 : 0}`;
  }

  record(viewerId: string, key: string, offsets: FootprintOffsets): void {
    let byKey = this.byViewer.get(viewerId);
    if (!byKey) {
      byKey = new Map();
      this.byViewer.set(viewerId, byKey);
    }
    const entries = byKey.get(key);
    const same = entries?.find((entry) => entry.offsets === offsets);
    if (same) {
      same.count += 1;
      return;
    }
    if (entries) entries.push({ offsets, count: 1 });
    else byKey.set(key, [{ offsets, count: 1 }]);
    this.entryCount += 1;
  }

  /** The offsets one earlier add of this contribution used (most recent first), or undefined if none is recorded. */
  take(viewerId: string, key: string): FootprintOffsets | undefined {
    const byKey = this.byViewer.get(viewerId);
    const entries = byKey?.get(key);
    const entry = entries?.[entries.length - 1];
    if (!byKey || !entries || !entry) return undefined;
    entry.count -= 1;
    if (entry.count <= 0) {
      entries.pop();
      this.entryCount -= 1;
      if (entries.length === 0) byKey.delete(key);
      if (byKey.size === 0) this.byViewer.delete(viewerId);
    }
    return entry.offsets;
  }

  size(): number {
    return this.entryCount;
  }
}
