// One AI's full read on one requester: its stance, what it charges, and
// what the requester can actually pay. Shared by the offer auto-responder
// and the trade screen's stance query so both see the same numbers.
import type { AiDiplomacyPricing, DiplomacyGoods } from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { aiDiplomacyPricing } from "./ai-diplomacy-pricing.js";
import { computeAiDiplomacyStance, type AiDiplomacyStance } from "./ai-diplomacy-stance.js";
import { buildAiDiplomacyStanceInput } from "./ai-diplomacy-stance-input.js";

export type AiDiplomacyEvaluation = {
  stance: AiDiplomacyStance;
  pricing: AiDiplomacyPricing;
  requesterHoldings: DiplomacyGoods;
};

const holdingsOf = (snapshot: PlayerSubscriptionSnapshot | undefined): DiplomacyGoods => ({
  gold: Math.max(0, Math.floor(snapshot?.player?.gold ?? 0)),
  shard: Math.max(0, Math.floor(snapshot?.player?.strategicResources?.SHARD ?? 0))
});

/** undefined when the AI snapshot is missing: nothing to judge, so callers decline rather than guess. */
export const evaluateAiDiplomacy = (input: {
  aiPlayerId: string;
  aiName: string;
  aiSnapshot: PlayerSubscriptionSnapshot | undefined;
  requesterId: string;
  requesterSnapshot: PlayerSubscriptionSnapshot | undefined;
  requesterBrokeTruceWithAi: boolean;
}): AiDiplomacyEvaluation | undefined => {
  const stanceInput = buildAiDiplomacyStanceInput(input);
  if (!stanceInput || !input.aiSnapshot?.player) return undefined;
  const stance = computeAiDiplomacyStance(stanceInput);
  return {
    stance,
    pricing: aiDiplomacyPricing({
      stanceKind: stance.kind,
      acceptsAllianceFree: stance.acceptsAlliance,
      incomePerMinute: input.aiSnapshot.player.incomePerMinute,
      aiHoldings: holdingsOf(input.aiSnapshot)
    }),
    requesterHoldings: holdingsOf(input.requesterSnapshot)
  };
};
