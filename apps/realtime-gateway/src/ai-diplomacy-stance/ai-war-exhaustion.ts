// Whether a spent army should make an AI ask this particular rival for peace.
//
// The old rule (fighting strength <= 20% of cap -> SEEKING_PEACE) fired for
// most of every 4h refill window, because manpower is paid out in one chunk
// at the window's end (shared manpower-refill.ts). AIs offered and accepted
// 12h truces almost continuously. Exhaustion now only counts when it will
// last, when the rival can actually press the advantage, and when peace with
// this rival doesn't wall off the AI's only way to grow.

/** Fighting strength (free + mustered manpower) at or below this share of cap reads as exhausted. */
export const EXHAUSTED_MANPOWER_RATIO = 0.2;
/** A refill landing within this window counts as "soon": no point signing a 12h truce to wait it out. */
export const REFILL_SOON_MS = 60 * 60 * 1000;

export type WarExhaustionInput = {
  manpower: number;
  manpowerCap: number;
  musterManpower: number;
  /** Time until the AI's next manpower payout; undefined = unknown. */
  nextRefillInMs?: number;
  /** Manpower that payout adds (capped at manpowerCap). */
  nextRefillManpower?: number;
  /**
   * False when nothing but other empires borders the AI: no reachable neutral
   * land and no barbarians next to its territory. undefined = unknown.
   */
  hasOtherExpansion?: boolean;
};

export type RivalStrength = {
  /** Free + mustered manpower; undefined when the rival's snapshot has no player block. */
  fightingStrength?: number;
  manpowerCap?: number | undefined;
};

export type WarExhaustion = "NOT_EXHAUSTED" | "EXHAUSTED" | "REFILL_SOON" | "RIVAL_ALSO_SPENT" | "BOXED_IN";

export const fightingStrengthOf = (ai: Pick<WarExhaustionInput, "manpower" | "musterManpower">): number =>
  ai.manpower + ai.musterManpower;

/** EXHAUSTED means seek peace with this rival; every other value means fight on. */
export const warExhaustion = (ai: WarExhaustionInput, rival: RivalStrength, bordersTouch: boolean): WarExhaustion => {
  if (ai.manpowerCap <= 0) return "NOT_EXHAUSTED";
  const strength = fightingStrengthOf(ai);
  if (strength / ai.manpowerCap > EXHAUSTED_MANPOWER_RATIO) return "NOT_EXHAUSTED";
  if (
    ai.nextRefillInMs !== undefined &&
    ai.nextRefillInMs <= REFILL_SOON_MS &&
    Math.min(ai.manpowerCap, strength + (ai.nextRefillManpower ?? 0)) / ai.manpowerCap > EXHAUSTED_MANPOWER_RATIO
  ) {
    return "REFILL_SOON";
  }
  if (rival.fightingStrength !== undefined) {
    const rivalSpent =
      rival.fightingStrength <= strength ||
      (rival.manpowerCap !== undefined && rival.manpowerCap > 0 && rival.fightingStrength / rival.manpowerCap <= EXHAUSTED_MANPOWER_RATIO);
    if (rivalSpent) return "RIVAL_ALSO_SPENT";
  }
  // Boxed in: this border is the only way the AI can grow, so a 12h truce
  // with the neighbour on it freezes the empire.
  if (bordersTouch && ai.hasOtherExpansion === false) return "BOXED_IN";
  return "EXHAUSTED";
};
