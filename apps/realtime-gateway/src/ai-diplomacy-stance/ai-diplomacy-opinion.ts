// An AI's attitude toward one player (Civ IV-style: Furious .. Friendly) as
// a sum of named modifiers, plus whether the two are at war and who is
// winning it (Civ V-style war score). Pure; inputs come from the AI's memory
// (ai-diplomacy-memory.ts), the social store and the strength stance.
import type { DiplomacyMemoryView } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";
import type { AiDiplomacyStanceKind } from "./ai-diplomacy-stance.js";

export type AiAttitude = "FURIOUS" | "ANNOYED" | "CAUTIOUS" | "PLEASED" | "FRIENDLY";
export type AiOpinionModifier = { label: string; value: number };

export type AiWarState = {
  atWar: boolean;
  /** Tiles the AI took from the player minus tiles the player took from it, both fading. */
  balance: number;
  aiWinning: boolean;
  aiLosing: boolean;
};

export type AiOpinion = {
  attitude: AiAttitude;
  score: number;
  modifiers: AiOpinionModifier[];
  war: AiWarState;
};

/** Fighting within this window means the two are still at war. */
export const AT_WAR_WINDOW_MS = 6 * 60 * 60_000;
/** Goodwill points per hour of income paid to the AI, and the cap: payments can't buy friendship outright. */
export const GOODWILL_POINTS_PER_INCOME_HOUR = 6;
export const MAX_GOODWILL_POINTS = 25;

export const attitudeForScore = (score: number): AiAttitude =>
  score <= -40 ? "FURIOUS" : score <= -15 ? "ANNOYED" : score < 10 ? "CAUTIOUS" : score < 25 ? "PLEASED" : "FRIENDLY";

export const ATTITUDE_RANK: Record<AiAttitude, number> = { FURIOUS: 0, ANNOYED: 1, CAUTIOUS: 2, PLEASED: 3, FRIENDLY: 4 };

export const computeAiOpinion = (input: {
  stanceKind: AiDiplomacyStanceKind;
  memory: DiplomacyMemoryView;
  requesterBrokeTruceWithAi: boolean;
  requesterTruceBreaksWithOthers: number;
  bordersTouch: boolean;
  /** Coin per hour that "one hour of income" means for goodwill. */
  incomePerHour: number;
  now: number;
}): AiOpinion => {
  const { memory } = input;
  const modifiers: AiOpinionModifier[] = [];
  const add = (label: string, value: number): void => {
    const rounded = Math.round(value);
    if (rounded !== 0) modifiers.push({ label, value: rounded });
  };

  if (input.requesterBrokeTruceWithAi) add("You broke a truce with us", -60);
  if (input.requesterTruceBreaksWithOthers > 0) add("You have broken truces with others", -Math.min(30, 10 * input.requesterTruceBreaksWithOthers));
  const tilesTaken = Math.round(memory.tilesTakenFromAi);
  if (tilesTaken > 0) add(`You took ${tilesTaken} of our ${tilesTaken === 1 ? "tile" : "tiles"}`, -Math.min(40, 4 * memory.tilesTakenFromAi));
  else if (memory.lastPlayerAttackAt !== undefined && input.now - memory.lastPlayerAttackAt < 24 * 60 * 60_000) add("You attacked us", -10);
  add(input.bordersTouch ? "Our borders are contested" : "Our borders don't meet", input.bordersTouch ? -10 : 5);
  if (input.stanceKind === "OUTMATCHED") add("Fears your strength", 10);
  const goodwillHours = input.incomePerHour > 0 ? memory.goodwillCoin / input.incomePerHour : 0;
  add("Payments you've made us", Math.min(MAX_GOODWILL_POINTS, goodwillHours * GOODWILL_POINTS_PER_INCOME_HOUR));

  const score = modifiers.reduce((sum, modifier) => sum + modifier.value, 0);
  const atWar = memory.lastCombatAt !== undefined && input.now - memory.lastCombatAt < AT_WAR_WINDOW_MS;
  const balance = memory.tilesTakenByAi - memory.tilesTakenFromAi;
  const aiLosing = atWar && (balance <= -2 || input.stanceKind === "SEEKING_PEACE" || input.stanceKind === "OUTMATCHED");
  const aiWinning = atWar && !aiLosing && (balance >= 2 || input.stanceKind === "WINNING");
  return { attitude: attitudeForScore(score), score, modifiers, war: { atWar, balance, aiWinning, aiLosing } };
};
