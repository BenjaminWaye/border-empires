// How a seeded AI feels about one specific player, and therefore whether it
// takes a truce or alliance offer from them. Pure: every input is read off
// the AI's and requester's subscription snapshots (see
// ai-diplomacy-stance-input.ts) plus the gateway's own truce-break records.
//
// Replaces the old manpower-only rule (accept iff free manpower <= 20% of
// cap), which read the AI's *free* pool only. Muster flags drain that pool
// into the flag (runtime-muster-tick.ts), so an AI massing an attack looked
// exhausted and accepted almost every truce. Mustered manpower now counts as
// the AI's own fighting strength.

export type AiDiplomacyStanceKind = "DISTRUSTFUL" | "SEEKING_PEACE" | "OUTMATCHED" | "WINNING" | "INDIFFERENT" | "WARY";

export type AiDiplomacyStanceInput = {
  aiName: string;
  ai: {
    manpower: number;
    manpowerCap: number;
    /** Manpower sitting in the AI's muster flags -- still the AI's to fight with. */
    musterManpower: number;
    /** Leaderboard score; undefined when the snapshot carried no self entry. */
    score: number | undefined;
    foodSlotDeficit?: number;
    foodStock: number;
    /** Production minus upkeep, per minute. */
    foodNetPerMinute: number;
  };
  requester: {
    score: number | undefined;
    manpowerCap: number | undefined;
  };
  /** Any requester-owned tile is adjacent to an AI-owned tile in the AI's view. */
  bordersTouch: boolean;
  /** The requester broke a truce with this AI earlier this season. */
  requesterBrokeTruceWithAi: boolean;
};

export type AiDiplomacyStance = {
  kind: AiDiplomacyStanceKind;
  /** Player-facing sentence, e.g. "Milo fears your strength." */
  reason: string;
  acceptsTruce: boolean;
  acceptsAlliance: boolean;
};

/** Fighting strength (free + mustered manpower) at or below this share of cap reads as exhausted. */
export const EXHAUSTED_MANPOWER_RATIO = 0.2;
/** Food lasting less than this many minutes at the current deficit reads as a food crisis. */
export const FOOD_CRISIS_MINUTES = 10;
/** One side counts as clearly stronger once its strength is this multiple of the other's. */
export const DOMINANCE_RATIO = 1.25;

const strengthOf = (score: number | undefined, manpowerCap: number | undefined): number | undefined => {
  if (score !== undefined && score > 0) return score;
  if (manpowerCap !== undefined && manpowerCap > 0) return manpowerCap;
  return undefined;
};

export const computeAiDiplomacyStance = (input: AiDiplomacyStanceInput): AiDiplomacyStance => {
  const name = input.aiName;
  if (input.requesterBrokeTruceWithAi) {
    return { kind: "DISTRUSTFUL", reason: `${name} doesn't trust you after you broke your truce.`, acceptsTruce: false, acceptsAlliance: false };
  }

  // Compare like with like: score against score when both are known,
  // otherwise manpower cap against manpower cap.
  const bothScored = (input.ai.score ?? 0) > 0 && (input.requester.score ?? 0) > 0;
  const aiStrength = bothScored ? input.ai.score : strengthOf(undefined, input.ai.manpowerCap);
  const requesterStrength = bothScored ? input.requester.score : strengthOf(undefined, input.requester.manpowerCap);
  const requesterRatio = aiStrength && requesterStrength ? requesterStrength / aiStrength : 1;

  const fightingStrength = input.ai.manpower + input.ai.musterManpower;
  const exhausted = input.ai.manpowerCap > 0 && fightingStrength / input.ai.manpowerCap <= EXHAUSTED_MANPOWER_RATIO;
  const starving = input.ai.foodSlotDeficit !== undefined ? input.ai.foodSlotDeficit > 0 :
    input.ai.foodStock <= 0
      ? input.ai.foodNetPerMinute < 0
      : input.ai.foodNetPerMinute < 0 && input.ai.foodStock / -input.ai.foodNetPerMinute < FOOD_CRISIS_MINUTES;
  if (exhausted || starving) {
    return {
      kind: "SEEKING_PEACE",
      reason: exhausted ? `${name} is looking for peace: their armies are spent.` : `${name} is looking for peace: their food is running out.`,
      acceptsTruce: true,
      // A desperate AI only binds itself to someone at least as strong.
      acceptsAlliance: requesterRatio >= 1
    };
  }

  if (requesterRatio >= DOMINANCE_RATIO) {
    return { kind: "OUTMATCHED", reason: `${name} fears your strength.`, acceptsTruce: true, acceptsAlliance: true };
  }
  if (!input.bordersTouch) {
    return {
      kind: "INDIFFERENT",
      reason: `${name} has no quarrel with you: your borders don't meet.`,
      acceptsTruce: true,
      acceptsAlliance: false
    };
  }
  if (requesterRatio <= 1 / DOMINANCE_RATIO) {
    return { kind: "WINNING", reason: `${name} feels they're winning and wants to keep fighting.`, acceptsTruce: false, acceptsAlliance: false };
  }
  return { kind: "WARY", reason: `${name} is wary of you and won't lower their guard on a contested border.`, acceptsTruce: false, acceptsAlliance: false };
};
