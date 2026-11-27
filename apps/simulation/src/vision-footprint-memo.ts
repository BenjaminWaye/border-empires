/**
 * Bounded memo behind VisionFootprintTable (vision-footprint-table.ts).
 *
 * The table memoizes one footprint per (tile, effective radius, ignoreForest).
 * Without a bound it never forgot an entry: every tile that was ever a vision
 * source kept its footprint for the rest of the season, and every vision
 * radius a tile was ever seen at (radius grows with technology, observatories
 * and captures) added another. The 2026-11-28 heap snapshots
 * (docs/load-results/sim-heap-growth-2026-11-28.md) showed it growing from
 * 3 MB to 21 MB over 25 game hours with no sign of levelling off.
 *
 * Two generations, each at most `generationSize` entries. New entries go into
 * the young generation; a hit in the old one is promoted. When the young
 * generation fills, the old one is dropped and the young one becomes old. So
 * at most 2 x generationSize entries are held, and anything touched in the
 * last generation survives. A miss just recomputes the footprint, which is
 * deterministic for unchanged terrain. Rollovers are counted
 * (state-and-persistence-discipline.md: counter on every cap).
 */
export type VisionFootprintMemoStats = {
  entries: number;
  bytes: number;
  rollovers: number;
  evictedEntries: number;
};

// A footprint is stored as interleaved (dx, dy) pairs. null = "no occluder
// in range, use the shared plain square for this radius".
export type PackedFootprint = Int16Array | null;

export class VisionFootprintMemo {
  private young = new Map<number, PackedFootprint>();
  private old = new Map<number, PackedFootprint>();
  private rollovers = 0;
  private evictedEntries = 0;

  constructor(
    private readonly generationSize: number,
    private readonly onRollover?: (stats: VisionFootprintMemoStats) => void
  ) {}

  get(key: number): PackedFootprint | undefined {
    const young = this.young.get(key);
    if (young !== undefined) return young;
    const old = this.old.get(key);
    if (old === undefined) return undefined;
    this.old.delete(key);
    this.set(key, old);
    return old;
  }

  set(key: number, value: PackedFootprint): void {
    if (this.young.size >= this.generationSize && !this.young.has(key)) {
      this.evictedEntries += this.old.size;
      this.rollovers += 1;
      this.old = this.young;
      this.young = new Map();
      this.onRollover?.(this.stats());
    }
    this.young.set(key, value);
  }

  clear(): void {
    this.young.clear();
    this.old.clear();
  }

  stats(): VisionFootprintMemoStats {
    let bytes = 0;
    for (const map of [this.young, this.old]) {
      for (const value of map.values()) bytes += value?.byteLength ?? 0;
    }
    return { entries: this.young.size + this.old.size, bytes, rollovers: this.rollovers, evictedEntries: this.evictedEntries };
  }
}

export const packOffsets = (offsets: ReadonlyArray<readonly [number, number]>): Int16Array => {
  const packed = new Int16Array(offsets.length * 2);
  for (let i = 0; i < offsets.length; i += 1) {
    const [dx, dy] = offsets[i]!;
    packed[i * 2] = dx;
    packed[i * 2 + 1] = dy;
  }
  return packed;
};

export const unpackOffsets = (packed: Int16Array): Array<[number, number]> => {
  const offsets: Array<[number, number]> = [];
  for (let i = 0; i < packed.length; i += 2) offsets.push([packed[i]!, packed[i + 1]!]);
  return offsets;
};
