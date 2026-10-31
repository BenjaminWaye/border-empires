// §29 politics constants: grievances, Writs, Court Favor and lent Fighters.
// First-pass numbers, kept in one place for a balance pass.
const DAY_MS = 24 * 60 * 60 * 1000;
export const CYCLE_MS = 7 * DAY_MS;

// Grievances (§29.2). One open at a time, public, and it costs Influence to
// declare so it is a commitment rather than a free tag on every raid.
export const GRIEVANCE_COST_INFLUENCE = 5;
export const GRIEVANCE_DURATION_MS = 2 * CYCLE_MS;
export const GRIEVANCE_RENOWN_PER_HIT = 3;
// Declared and never pressed: the grievance lapses and costs Renown.
export const GRIEVANCE_LAPSE_RENOWN = 2;
// A raid that gets through under a grievance takes this much Influence from
// the target (never more than they hold) and gives it to the attacker.
export const GRIEVANCE_PLUNDER_INFLUENCE = 3;

// Writs (§21.3). Offered at most once per Cycle per Duke, rarely, and more often
// as the Court weakens and for Dukes in the top half of Domain Weight.
export const WRIT_BASE_CHANCE_PERCENT = 10;
export const WRIT_WEAKNESS_CHANCE_PERCENT = 30;
export const WRIT_TOP_HALF_BONUS_PERCENT = 10;
export const WRIT_OFFER_MS = 3 * DAY_MS;
export const WRIT_COURT_STRENGTH_GAIN = 3;

// The Blind Eye (§21.6).
export const BLIND_EYE_LEAD_RATIO = 1.5;
export const BLIND_EYE_SUSTAIN_MS = CYCLE_MS;
export const BLIND_EYE_DRAIN_PER_CYCLE = 4;
export const BLIND_EYE_RENOWN_MULTIPLIER = 2;

// Lend Fleet to the Court (§21.6).
export const LEND_DURATION_MS = CYCLE_MS;
export const LEND_INFLUENCE_STIPEND = 4;
// One at a time: holding Favor costs a Fighter for as long as the lead lasts.
export const MAX_LENT_FIGHTERS = 1;
