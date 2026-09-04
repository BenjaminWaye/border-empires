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
// output (see the caps' inline comments). raw/cap is clamped to [0, 100], so
// an outlier day beyond the cap still ranks at the top rather than blowing
// past every other event's scale -- the point is comparability, not a
// literal percentage.
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

/** Scales `raw` against `cap` onto a comparable 0-100 significance value. */
export const normalizeSignificance = (raw: number, cap: number): number =>
  Math.max(0, Math.min(100, Math.round((raw / cap) * 100)));
