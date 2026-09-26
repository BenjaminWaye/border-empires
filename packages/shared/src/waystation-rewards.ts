// Waystation GOLD / MANPOWER reward tuning, split out of config.ts (at the
// repo's 500-line cap). See apps/simulation/src/runtime-waystation-activation.ts
// for how these are rolled and granted.

export type WaystationGoldTier = "SMALL" | "MEDIUM" | "LARGE";

// Flat tiers (Civ VI tribal-village style): a big reward early in the season,
// when a town earns ~10 gold/day and techs cost 10-100, and a small one late,
// when techs cost 400+. Also the fallback when a TECH roll finds no unowned
// tier-1 tech left. Weights are relative, not percentages.
export const WAYSTATION_GOLD_TIERS: readonly { tier: WaystationGoldTier; amount: number; weight: number }[] = [
  { tier: "SMALL", amount: 25, weight: 50 },
  { tier: "MEDIUM", amount: 50, weight: 35 },
  { tier: "LARGE", amount: 100, weight: 15 }
];

// Granted on top of the player's current manpower and allowed to overflow the
// manpower cap (regen pauses until spending brings it back under the cap).
export const WAYSTATION_MANPOWER_GRANT = 1_000;
