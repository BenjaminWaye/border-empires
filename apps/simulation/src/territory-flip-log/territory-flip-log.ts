// Rolling in-memory log of tile-ownership changes, captured from
// runtime-lock-resolution.ts every time a tile flips owner (EXPAND onto
// neutral land, ATTACK capture, or an overreached EXPAND's origin falling
// back to its previous owner). Feeds the /api/activity aggregations
// (computeWars, computeTerritoryMomentum, computeBiggestSwing24h,
// computeFrontlineHotspots) in ../territory-flip-log/territory-flip-log-aggregations.ts.
//
// Bounding (see docs/agents/state-and-persistence-discipline.md): this is a
// pure activity feed, not reconstructable world state, so it does NOT belong
// in checkpoints/snapshots and is rebuilt empty on restart (acceptable --
// the aggregations only ever look at a trailing 24h window anyway, and a
// restart naturally means "no history yet" rather than corrupted history).
//
// Two independent bounds:
//   1. Rolling 24h prune -- entries older than TERRITORY_FLIP_WINDOW_MS are
//      dropped, since nothing downstream reads past that window.
//   2. A hard entry-count cap (TERRITORY_FLIP_LOG_MAX_ENTRIES = 50,000) as a
//      safety valve independent of the time prune: at a sustained rate far
//      beyond anything the game produces today (~35 flips/minute for 24h
//      straight) the time-based prune alone would still let the log grow
//      unbounded before the next prune pass catches up. 50,000 entries is
//      roughly a full day of an implausibly hot free-for-all (every player
//      flipping a tile every few seconds, round the clock) while staying
//      trivially cheap in memory (each entry is a handful of primitives,
//      well under 1KB even boxed) -- comfortably above real traffic, but a
//      concrete ceiling rather than "however big the game gets".
//
// No flip-flop collapsing in v1 (e.g. A->B->A on the same tile within
// minutes is logged as two separate flips) -- deliberately deferred; see
// docs/agents/territory-flip-log-and-activity-api.md.
export const TERRITORY_FLIP_WINDOW_MS = 24 * 60 * 60_000;
export const TERRITORY_FLIP_LOG_MAX_ENTRIES = 50_000;

export type TerritoryFlip = {
  tileId: string;
  x: number;
  y: number;
  fromOwner: string | undefined;
  toOwner: string | undefined;
  at: number;
};

export type TerritoryFlipLogGauge = {
  entryCount: number;
  oldestAt: number | undefined;
  newestAt: number | undefined;
  capHits: number;
};

export type TerritoryFlipLog = {
  record: (flip: TerritoryFlip) => void;
  prune: (now: number) => void;
  entries: () => readonly TerritoryFlip[];
  gauge: () => TerritoryFlipLogGauge;
  /**
   * Reseeds the log from persisted entries on boot (see
   * activity-log-persistence.ts). Only meaningful on an empty log -- it
   * replaces rather than merges, so a stray second call cannot duplicate
   * history -- and drops anything already outside the 24h window.
   */
  restore: (entries: readonly TerritoryFlip[], now: number) => void;
};

export const createTerritoryFlipLog = (options: { now?: () => number } = {}): TerritoryFlipLog => {
  const now = options.now ?? (() => Date.now());
  let flips: TerritoryFlip[] = [];
  let capHits = 0;

  const prune = (at: number): void => {
    const cutoff = at - TERRITORY_FLIP_WINDOW_MS;
    if (flips.length > 0 && flips[0]!.at >= cutoff) return;
    flips = flips.filter((flip) => flip.at >= cutoff);
  };

  const record = (flip: TerritoryFlip): void => {
    prune(now());
    flips.push(flip);
    if (flips.length > TERRITORY_FLIP_LOG_MAX_ENTRIES) {
      capHits += 1;
      // Drop the oldest entries first -- the array is append-ordered by
      // `at` (record() is only ever called with the current time), so the
      // front of the array is the oldest.
      flips = flips.slice(flips.length - TERRITORY_FLIP_LOG_MAX_ENTRIES);
    }
  };

  const restore = (entries: readonly TerritoryFlip[], at: number): void => {
    const cutoff = at - TERRITORY_FLIP_WINDOW_MS;
    flips = entries
      .filter((flip) => flip.at >= cutoff)
      .sort((left, right) => left.at - right.at)
      .slice(-TERRITORY_FLIP_LOG_MAX_ENTRIES);
  };

  return {
    record,
    prune,
    restore,
    entries: () => flips,
    gauge: (): TerritoryFlipLogGauge => ({
      entryCount: flips.length,
      oldestAt: flips[0]?.at,
      newestAt: flips[flips.length - 1]?.at,
      capHits
    })
  };
};
