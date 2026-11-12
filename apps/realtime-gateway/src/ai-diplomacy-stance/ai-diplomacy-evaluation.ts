import { afcAdditiveEffect, afcMultiplicativeEffect } from "@border-empires/shared";
// One AI's full read on one requester: its strength stance, its attitude
// (with the modifiers behind it), the war between them, what it charges, and
// what the requester can actually pay. Shared by the offer auto-responder
// and the trade screen's stance query so both see the same numbers.
import { ATTITUDE_MIN_SCORE, giftToReach, giftView, type AiDiplomacyPricing, type AiGiftView, type DiplomacyGoods } from "@border-empires/shared";

import type { DiplomacyMemoryView } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";
import { aiWouldLeadAlliance, tileLookupFor, type AllyLookup, type DominanceSizing, type LeaderboardTiles, type TileLookup } from "./ai-alliance-bloc.js";
import type { AiDiplomacyGrudges } from "./ai-diplomacy-grudges.js";
import { atWarFromMemory, computeAiOpinion, type AiOpinion } from "./ai-diplomacy-opinion.js";
import { aiDiplomacyPricing, goodwillIncomePerHour, TRUCE_COOLDOWN_AFTER_ATTACK_MS } from "./ai-diplomacy-pricing.js";
import { computeAiDiplomacyStance, type AiDiplomacyStance } from "./ai-diplomacy-stance.js";
import { buildAiDiplomacyStanceInput, type AiDiplomacySnapshot } from "./ai-diplomacy-stance-input.js";
import { aiTemperamentForId, type AiTemperament } from "./ai-diplomacy-temperament.js";
import { aiRetaliationReadiness } from "./ai-retaliation-readiness.js";
import { aiWarOutlook, type AiWarOutlook } from "./ai-war-outlook.js";

export type AiDiplomacyEvaluation = {
  stance: AiDiplomacyStance;
  opinion: AiOpinion;
  pricing: AiDiplomacyPricing;
  /** The one-line reason the AI gives, before any offer-specific refusal. */
  reason: string;
  truceRefusal?: string;
  allianceRefusal?: string;
  requesterHoldings: DiplomacyGoods;
  /** What a gift buys: coin per opinion point and the goodwill already paid. */
  gift: AiGiftView;
  temperament: AiTemperament;
  /** The AI's read on the next couple of hours of war (ai-war-outlook.ts). */
  outlook: AiWarOutlook;
};

/** What the gateway knows about the pair beyond the snapshots: grudges and memory. */
export type AiDiplomacyContext = AiDiplomacyGrudges & {
  memory: DiplomacyMemoryView;
  now: number;
  /** Current alliances, for the Diplomatic Dominance "who leads the bloc" check. */
  alliesOf: AllyLookup;
  /**
   * The simulation's season leaderboard: sizes for the bloc check when the AI's
   * snapshot carries none (a live subscribe without world status, the usual case).
   */
  seasonLeaderboard?: LeaderboardTiles;
  /** The victory check's bloc sizing: blocs well short of Dominance don't need the AI to lead. undefined: always strict. */
  dominance?: DominanceSizing;
};

/** Builds the context for one (requester, AI) pair; async when it has to fetch the season leaderboard. */
export type AiDiplomacyContextSource = (requesterId: string, aiPlayerId: string) => AiDiplomacyContext | Promise<AiDiplomacyContext>;

/** Tile counts from the AI's own leaderboard view, or undefined when it can't vouch for the AI's size. */
export const tileLookupFromSnapshot = (snapshot: AiDiplomacySnapshot | undefined, aiPlayerId: string): TileLookup | undefined => {
  const leaderboard = snapshot?.worldStatus?.leaderboard;
  return tileLookupFor([...(leaderboard?.overall ?? []), ...(leaderboard?.selfOverall ? [leaderboard.selfOverall] : [])], aiPlayerId);
};

const holdingsOf = (snapshot: AiDiplomacySnapshot | undefined): DiplomacyGoods => ({
  ...(snapshot?.player?.resourceTradeHoldings ? { resources: snapshot.player.resourceTradeHoldings } : {}),
  gold: Math.max(0, Math.floor(snapshot?.player?.gold ?? 0))
});

const warReason = (aiName: string, opinion: AiOpinion, outlook: AiWarOutlook, fallback: string): string => {
  if (opinion.war.atWar && outlook.kind === "HOLD_FOR_REFILL") {
    const minutes = Math.max(1, Math.ceil(outlook.refillInMs / 60_000));
    return `${aiName} expects to win its land back when its armies reload in ${minutes} min.`;
  }
  if (opinion.war.aiLosing && outlook.kind === "SUE_FOR_PEACE") {
    return `${aiName} is losing ground fast and can't stop you before its armies reload, so it wants the war over.`;
  }
  if (opinion.war.aiLosing) {
    // Say what "losing" rests on: net ground lost to you, or being outmatched while gaining none.
    // From the rounded counts the war tally shows, so the two always agree.
    const netLost = opinion.war.tilesTakenFromAi - opinion.war.tilesTakenByAi;
    return netLost >= 2
      ? `${aiName} has lost ${netLost} more tiles to you than it has taken, and wants the war over.`
      : `${aiName} can't win this war against your strength and wants it over.`;
  }
  if (opinion.war.aiWinning) return `${aiName} feels they're winning this war.`;
  if (opinion.war.atWar) return `${aiName} is at war with you.`;
  return fallback;
};

const aiLeads = (input: {
  aiPlayerId: string;
  requesterId: string;
  aiSnapshot: AiDiplomacySnapshot | undefined;
  alliesOf: AllyLookup;
  seasonLeaderboard?: LeaderboardTiles;
  dominance?: DominanceSizing;
}): boolean | undefined => {
  const tilesOf =
    tileLookupFromSnapshot(input.aiSnapshot, input.aiPlayerId) ??
    (input.seasonLeaderboard ? tileLookupFor(input.seasonLeaderboard, input.aiPlayerId) : undefined);
  return tilesOf ? aiWouldLeadAlliance(input.aiPlayerId, input.requesterId, input.alliesOf, tilesOf, input.dominance) : undefined;
};

/** Time left in the fresh-aggression window after the player's last attack (0 when it has passed). */
const cooldownRemainingMs = (lastPlayerAttackAt: number | undefined, now: number): number =>
  lastPlayerAttackAt === undefined ? 0 : Math.max(0, TRUCE_COOLDOWN_AFTER_ATTACK_MS - (now - lastPlayerAttackAt));

const giftToPleasedField = (coin: number | undefined): { giftToPleased?: number } => (coin === undefined ? {} : { giftToPleased: coin });

/** undefined when the AI snapshot is missing: nothing to judge, so callers decline rather than guess. */
export const evaluateAiDiplomacy = (input: {
  aiPlayerId: string;
  aiName: string;
  aiSnapshot: AiDiplomacySnapshot | undefined;
  requesterId: string;
  requesterSnapshot: AiDiplomacySnapshot | undefined;
} & AiDiplomacyContext): AiDiplomacyEvaluation | undefined => {
  const stanceInput = buildAiDiplomacyStanceInput(input);
  const aiPlayer = input.aiSnapshot?.player;
  if (!stanceInput || !aiPlayer) return undefined;
  const stance = computeAiDiplomacyStance(stanceInput);
  const aiIncome = aiPlayer.incomePerMinute ?? 0;
  const temperament = aiTemperamentForId(input.aiPlayerId);
  // Gifts go further with a lower "hour of income": the trade screen's preview reads the same rate from `gift`.
  const goodwillHourCoin = goodwillIncomePerHour(aiIncome, temperament.giftValue);
  const outlook = aiWarOutlook({
    atWar: atWarFromMemory(input.memory, input.now),
    ai: stanceInput.ai,
    rival: stanceInput.requester,
    recentTilesLost: input.memory.recentTilesTakenFromAi ?? 0,
    recentTilesTaken: input.memory.recentTilesTakenByAi ?? 0
  });
  const opinion = computeAiOpinion({
    stanceKind: stance.kind,
    memory: input.memory,
    requesterBrokeTruceWithAi: input.requesterBrokeTruceWithAi,
    requesterTruceBreaksWithOthers: input.requesterTruceBreaksWithOthers,
    requesterBrokeAllianceWithAi: input.requesterBrokeAllianceWithAi,
    bordersTouch: stanceInput.bordersTouch,
    incomePerHour: goodwillHourCoin,
    diplomaticCorpsBonus: afcAdditiveEffect(input.requesterSnapshot?.player?.domainIds, "aiOpinionBonus"),
    temperament,
    outlook,
    now: input.now
  });
  const gift = giftView(input.memory.goodwillCoin, goodwillHourCoin);
  const priced = aiDiplomacyPricing({
    aiName: input.aiName,
    stanceKind: stance.kind,
    opinion,
    memory: input.memory,
    bordersTouch: stanceInput.bordersTouch,
    aiIncomePerMinute: aiIncome,
    aiHoldings: holdingsOf(input.aiSnapshot),
    requesterBrokeTruceWithAi: input.requesterBrokeTruceWithAi,
    aiWouldLeadAlliance: aiLeads(input),
    ...giftToPleasedField(giftToReach(gift, opinion.score, ATTITUDE_MIN_SCORE.PLEASED)),
    requesterTruceCostMult: afcMultiplicativeEffect(input.requesterSnapshot?.player?.domainIds, "truceCostMult"),
    retaliation: aiRetaliationReadiness(stanceInput.ai, cooldownRemainingMs(input.memory.lastPlayerAttackAt, input.now)),
    temperament,
    outlook,
    now: input.now
  });
  return {
    stance,
    opinion,
    pricing: priced.pricing,
    reason: warReason(input.aiName, opinion, outlook, stance.reason),
    ...(priced.truceRefusal ? { truceRefusal: priced.truceRefusal } : {}),
    ...(priced.allianceRefusal ? { allianceRefusal: priced.allianceRefusal } : {}),
    requesterHoldings: holdingsOf(input.requesterSnapshot),
    gift,
    temperament,
    outlook
  };
};
