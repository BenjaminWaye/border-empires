/** Cosmetic resolution category, broadcast only once the outcome is public.
 * Exact odds and strength never travel with this field. Missing/invalid odds
 * use the ordinary exchange rather than inventing an underdog story. */
export type BattlePresentation = "decisive" | "contested" | "last-stand" | "comeback";

export const battlePresentationFor = (winChance: number | undefined, attackerWon: boolean): BattlePresentation => {
  if (winChance === undefined || !Number.isFinite(winChance) || winChance < 0 || winChance > 1) return "contested";
  const winnerChance = attackerWon ? winChance : 1 - winChance;
  if (winnerChance > 0 && winnerChance <= 0.15 + Number.EPSILON) return "comeback";
  if (!attackerWon && winChance > 0 && winChance <= 0.15) return "last-stand";
  return winnerChance >= 0.75 ? "decisive" : "contested";
};

export const isBattlePresentation = (value: unknown): value is BattlePresentation =>
  value === "decisive" || value === "contested" || value === "last-stand" || value === "comeback";

/** Keep skirmish and old-server timing unchanged when the field is absent. */
export const battleClashMs = (presentation: BattlePresentation | undefined): number => {
  switch (presentation) {
    case "decisive": return 1000;
    case "contested": return 2100;
    case "last-stand": return 2800;
    case "comeback": return 4200;
    default: return 1300;
  }
};
