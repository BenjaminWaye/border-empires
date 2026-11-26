// The tutorial guide walks a new player through their first truce with a
// rival House (client tutorial-guide-steps.ts, step GUIDE_TRUCE_STEP_ID).
// While the player is on that step, an AI welcomes them: it waives its truce
// price and sets aside its usual refusals (fury, wanting land back, a fresh
// attack), so the lesson ends in a truce rather than a counter-offer the
// player can't read yet (owner, 2026-11-26). Two limits keep it a one-off
// welcome and not a loophole: never for someone who broke a truce with this
// AI, and never once the pair has made a truce deal. An AI that wants to pay
// for peace (a negative price) still pays.
import type { AiDiplomacyPricingResult } from "./ai-diplomacy-pricing.js";
import type { DiplomacyMemoryView } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";

/** The client guide's "make a truce" step id; the welcome lasts until it is in the player's saved steps. */
export const GUIDE_TRUCE_STEP_ID = "diplomacy-truce-made";

export type GuideProgressView = { guideStatus?: string; guideSteps?: readonly string[] };

/** The player's guide is running and its truce step isn't done yet. */
export const onGuideTruceStep = (profile: GuideProgressView | undefined): boolean =>
  profile?.guideStatus === "active" && !(profile.guideSteps ?? []).includes(GUIDE_TRUCE_STEP_ID);

export const guideTruceWelcomeApplies = (input: {
  requesterOnGuideTruceStep?: boolean;
  requesterBrokeTruceWithAi: boolean;
  memory: Pick<DiplomacyMemoryView, "truceDeals">;
}): boolean => input.requesterOnGuideTruceStep === true && !input.requesterBrokeTruceWithAi && input.memory.truceDeals < 1;

const free = (price: number | null): number => (price !== null && price < 0 ? price : 0);

/** The truce for nothing (or what the AI offered to pay), with no truce refusal. Alliance terms are untouched. */
export const welcomeGuideTruce = (priced: AiDiplomacyPricingResult): AiDiplomacyPricingResult => {
  const { townReturn: _townReturn, ...pricing } = priced.pricing;
  const { truceRefusal: _truceRefusal, ...rest } = priced;
  return {
    ...rest,
    pricing: { ...pricing, required: { ...pricing.required, truce12: free(pricing.required.truce12), truce24: free(pricing.required.truce24) } }
  };
};
