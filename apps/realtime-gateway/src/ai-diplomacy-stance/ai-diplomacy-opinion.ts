// An AI's attitude toward one player (Civ IV-style: Furious .. Friendly) as
// a sum of named modifiers, plus whether the two are at war and who is
// winning it (Civ V-style war score). Pure; inputs come from the AI's memory
// (ai-diplomacy-memory.ts), the social store and the strength stance. The
// goodwill and attitude arithmetic is shared with the trade screen's gift
// preview (@border-empires/shared diplomacy-gift.ts).
import { attitudeForScore, goodwillPointsFor, type AiAttitudeLevel } from "@border-empires/shared";

import type { DiplomacyMemoryView } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";
import type { AiDiplomacyStanceKind } from "./ai-diplomacy-stance.js";

export type AiAttitude = AiAttitudeLevel;
export type AiOpinionModifier = { label: string; value: number };

export type AiWarState = {
  atWar: boolean;
  /** Tiles the AI took from the player minus tiles the player took from it, both fading. */
  balance: number;
  /** The two sides of `balance`, rounded for display: the trade screen's war tally. */
  tilesTakenFromAi: number;
  tilesTakenByAi: number;
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
  add("Gifts and payments you've made us", goodwillPointsFor(memory.goodwillCoin, input.incomePerHour));

  const score = modifiers.reduce((sum, modifier) => sum + modifier.value, 0);
  const atWar = memory.lastCombatAt !== undefined && input.now - memory.lastCombatAt < AT_WAR_WINDOW_MS;
  const balance = memory.tilesTakenByAi - memory.tilesTakenFromAi;
  // Weak or desperate only counts as losing while the AI isn't gaining ground:
  // an AI taking tiles from a stronger empire is winning that war, not paying for peace.
  const aiLosing = atWar && (balance <= -2 || ((input.stanceKind === "SEEKING_PEACE" || input.stanceKind === "OUTMATCHED") && balance <= 0));
  const aiWinning = atWar && !aiLosing && (balance >= 2 || input.stanceKind === "WINNING");
  return {
    attitude: attitudeForScore(score),
    score,
    modifiers,
    war: { atWar, balance, tilesTakenFromAi: Math.round(memory.tilesTakenFromAi), tilesTakenByAi: Math.round(memory.tilesTakenByAi), aiWinning, aiLosing }
  };
};
