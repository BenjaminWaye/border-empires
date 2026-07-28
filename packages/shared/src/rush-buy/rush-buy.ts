// docs/manpower-economy-rewrite-plan.md §6.3: pay gold to cover a
// manpower-cost action's shortfall, not the full cost. Extended (per user
// direction, not written up in the plan doc) to an already-in-progress
// settle/build: price scales with the fraction of time still remaining, so
// finishing something nearly done is cheap and finishing something just
// started costs close to the full rush price. At remainingMs === totalMs
// (a build/settle that just started) this reduces exactly to §6.3's anchor
// table: Settle (20 manpower) -> 10 gold, Farmstead (80) -> 40 gold,
// Bank/Fort (300) -> 150 gold.
export const RUSH_BUY_GOLD_PER_MANPOWER = 0.5;

/**
 * Gold cost to instantly finish an in-progress manpower-costing action.
 * `remainingMs`/`totalMs` describe how far through its timer the action is;
 * `manpowerCost` is the action's full manpower price. Clamped to [0, totalMs]
 * so a stale/negative remaining value can never produce a negative or
 * over-100% price. Returns 0 once there's no time left to rush.
 */
export const rushBuyPriceGold = (remainingMs: number, totalMs: number, manpowerCost: number): number => {
  if (!(totalMs > 0) || !(manpowerCost > 0)) return 0;
  const clampedRemainingMs = Math.max(0, Math.min(totalMs, remainingMs));
  if (clampedRemainingMs <= 0) return 0;
  const remainingFraction = clampedRemainingMs / totalMs;
  return Math.max(1, Math.ceil(remainingFraction * manpowerCost * RUSH_BUY_GOLD_PER_MANPOWER));
};
