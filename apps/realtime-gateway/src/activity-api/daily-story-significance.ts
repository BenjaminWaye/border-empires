// A shared 0-100 significance scale for every buildDailyStory event type
// (daily-story.ts, player-growth.ts), so events measuring genuinely different
// things -- tiles, flips, gold/day, manpower cap points, manpower spent --
// can be ranked against each other meaningfully.
//
// Before this, `significance` was each builder's raw magnitude (tilesLost,
// tileFlips24h, perDay gold, manpowerCapDelta, ...) compared directly via a
// single `.sort((a, b) => b.significance - a.significance)`. That silently
// favoured whichever metric happens to live on the largest natural scale: a
// routine 600-manpower-cap tick (MANPOWER_SURGE, scale in the hundreds-to-
// thousands) would always outrank a 121-tile barbarian land grab
// (FASTEST_EXPANSION, scale in the tens-to-low-hundreds), regardless of which
// was actually the more interesting thing that happened that day.
//
// Each cap below is a "roughly what a genuinely big day looks like" reference
// point for that metric, calibrated against real prod GET /api/activity
// output (see the caps' inline comments): raw/cap*100 lands near 100 on a
// typical big day for that metric, so different metrics land in the same
// ballpark. It is NOT a hard ceiling -- an outlier day is deliberately
// allowed to score past 100 rather than being clamped down to tie with every
// other event that also hit the cap. A first version of this clamped to 100,
// and on a real prod day where several metrics simultaneously blew past
// their calibration (a 226-tile defeat vs. a 150 cap, 4,424 manpower spent
// vs. a 1,000 cap, ...) every one of them tied at the ceiling, so which
// three "won" the tie came down to array-construction order rather than
// which was actually biggest -- the digest read as much shorter and less
// differentiated than the day's real spread of activity. `significance` is
// only ever compared within one day's events (never displayed, never
// compared across days), so there is no meaningful "max" to clamp to.
export const SIGNIFICANCE_SCALE = {
  /** BIGGEST_DEFEAT (tilesLost), FASTEST_EXPANSION (net24h). Observed range 5-130. */
  tileCount: 150,
  /** OPEN_WAR (tileFlips24h), FIERCEST_FIGHTING (flips24h). Observed range 5-95. */
  flipCount: 100,
  /** BLOODIEST_BATTLE -- a single attack's manpowerLoss. Observed range 8-61. */
  singleBattleManpower: 300,
  /**
   * FIERCEST_ATTACKER (manpowerSpent), TOUGHEST_TARGET (manpowerSpentAgainst)
   * -- summed across every attack against/by one player in 24h, so naturally
   * larger-scale than a single battle.
   */
  aggregateManpower: 1000,
  /** ECONOMY_BOOM -- gold/day gained. Observed range 5-300. */
  goldPerDay: 300,
  /** MANPOWER_SURGE -- manpower cap points gained. Observed range 300-4800. */
  manpowerCapDelta: 5000
} as const;

/** Fixed significance for events with no natural magnitude to scale from. */
export const FIXED_SIGNIFICANCE = {
  /** Rare and narratively large, but a routine tie/truce shouldn't always beat a huge tile/manpower swing. */
  allianceFormed: 70,
  allianceBroken: 80,
  /** A standing, not news -- should rarely outrank an actual event of the day. */
  strongestEmpire: 5
} as const;

/**
 * Scales `raw` against `cap` onto a comparable significance value, ~100 on a
 * "big day" for that metric. Not clamped above 100 -- see the doc comment on
 * SIGNIFICANCE_SCALE above for why an outlier day must be allowed to score
 * higher rather than tying every other event that also hit the ceiling.
 */
export const normalizeSignificance = (raw: number, cap: number): number =>
  Math.max(0, Math.round((raw / cap) * 100));
