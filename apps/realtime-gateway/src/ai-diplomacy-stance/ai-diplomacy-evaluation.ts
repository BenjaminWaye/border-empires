// One AI's full read on one requester: its strength stance, its attitude
// (with the modifiers behind it), the war between them, what it charges, and
// what the requester can actually pay. Shared by the offer auto-responder
// and the trade screen's stance query so both see the same numbers.
import type { AiDiplomacyPricing, DiplomacyGoods } from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import type { DiplomacyMemoryView } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";
import { aiWouldLeadAlliance, tileLookupFor, type AllyLookup, type TileLookup } from "./ai-alliance-bloc.js";
import { computeAiOpinion, type AiOpinion } from "./ai-diplomacy-opinion.js";
import { aiDiplomacyPricing } from "./ai-diplomacy-pricing.js";
import { computeAiDiplomacyStance, type AiDiplomacyStance } from "./ai-diplomacy-stance.js";
import { buildAiDiplomacyStanceInput } from "./ai-diplomacy-stance-input.js";

export type AiDiplomacyEvaluation = {
  stance: AiDiplomacyStance;
  opinion: AiOpinion;
  pricing: AiDiplomacyPricing;
  /** The one-line reason the AI gives, before any offer-specific refusal. */
  reason: string;
  truceRefusal?: string;
  allianceRefusal?: string;
  requesterHoldings: DiplomacyGoods;
};

/** What the gateway knows about the pair beyond the snapshots: grudges and memory. */
export type AiDiplomacyContext = {
  requesterBrokeTruceWithAi: boolean;
  requesterTruceBreaksWithOthers: number;
  memory: DiplomacyMemoryView;
  now: number;
  /** Current alliances, for the Diplomatic Dominance "who leads the bloc" check. */
  alliesOf: AllyLookup;
};

/** Tile counts from the AI's own leaderboard view, or undefined when it can't vouch for the AI's size. */
export const tileLookupFromSnapshot = (snapshot: PlayerSubscriptionSnapshot | undefined, aiPlayerId: string): TileLookup | undefined => {
  const leaderboard = snapshot?.worldStatus?.leaderboard;
  return tileLookupFor([...(leaderboard?.overall ?? []), ...(leaderboard?.selfOverall ? [leaderboard.selfOverall] : [])], aiPlayerId);
};

const holdingsOf = (snapshot: PlayerSubscriptionSnapshot | undefined): DiplomacyGoods => ({
  gold: Math.max(0, Math.floor(snapshot?.player?.gold ?? 0)),
  shard: Math.max(0, Math.floor(snapshot?.player?.strategicResources?.SHARD ?? 0))
});

const warReason = (aiName: string, opinion: AiOpinion, fallback: string): string => {
  if (opinion.war.aiLosing) return `${aiName} is losing the war against you and wants it over.`;
  if (opinion.war.aiWinning) return `${aiName} feels they're winning this war.`;
  if (opinion.war.atWar) return `${aiName} is at war with you.`;
  return fallback;
};

const aiLeads = (input: { aiPlayerId: string; requesterId: string; aiSnapshot: PlayerSubscriptionSnapshot | undefined; alliesOf: AllyLookup }): boolean | undefined => {
  const tilesOf = tileLookupFromSnapshot(input.aiSnapshot, input.aiPlayerId);
  return tilesOf ? aiWouldLeadAlliance(input.aiPlayerId, input.requesterId, input.alliesOf, tilesOf) : undefined;
};

/** undefined when the AI snapshot is missing: nothing to judge, so callers decline rather than guess. */
export const evaluateAiDiplomacy = (input: {
  aiPlayerId: string;
  aiName: string;
  aiSnapshot: PlayerSubscriptionSnapshot | undefined;
  requesterId: string;
  requesterSnapshot: PlayerSubscriptionSnapshot | undefined;
} & AiDiplomacyContext): AiDiplomacyEvaluation | undefined => {
  const stanceInput = buildAiDiplomacyStanceInput(input);
  const aiPlayer = input.aiSnapshot?.player;
  if (!stanceInput || !aiPlayer) return undefined;
  const stance = computeAiDiplomacyStance(stanceInput);
  const aiIncome = aiPlayer.incomePerMinute;
  const requesterIncome = input.requesterSnapshot?.player?.incomePerMinute ?? 0;
  const opinion = computeAiOpinion({
    stanceKind: stance.kind,
    memory: input.memory,
    requesterBrokeTruceWithAi: input.requesterBrokeTruceWithAi,
    requesterTruceBreaksWithOthers: input.requesterTruceBreaksWithOthers,
    bordersTouch: stanceInput.bordersTouch,
    incomePerHour: Math.max(1, aiIncome, requesterIncome) * 60,
    now: input.now
  });
  const priced = aiDiplomacyPricing({
    aiName: input.aiName,
    stanceKind: stance.kind,
    opinion,
    memory: input.memory,
    bordersTouch: stanceInput.bordersTouch,
    aiIncomePerMinute: aiIncome,
    requesterIncomePerMinute: requesterIncome,
    aiHoldings: holdingsOf(input.aiSnapshot),
    requesterBrokeTruceWithAi: input.requesterBrokeTruceWithAi,
    aiWouldLeadAlliance: aiLeads(input),
    now: input.now
  });
  return {
    stance,
    opinion,
    pricing: priced.pricing,
    reason: warReason(input.aiName, opinion, stance.reason),
    ...(priced.truceRefusal ? { truceRefusal: priced.truceRefusal } : {}),
    ...(priced.allianceRefusal ? { allianceRefusal: priced.allianceRefusal } : {}),
    requesterHoldings: holdingsOf(input.requesterSnapshot)
  };
};
