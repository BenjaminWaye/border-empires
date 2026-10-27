// Pure view logic for a gift on the diplomacy trade screen: coin/Shards given
// to an AI for goodwill alone. Says what the gift does before it is sent
// ("+20 opinion · Cautious → Pleased"), using the same shared arithmetic the
// gateway's opinion uses (@border-empires/shared diplomacy-gift.ts).
import {
  ATTITUDE_MIN_SCORE,
  attitudeForScore,
  giftOpinionGain,
  giftToReach,
  netValueToAi,
  SHARD_COIN_VALUE,
  type DiplomacyGoods,
  type DiplomacyTerms
} from "@border-empires/shared";

import { ATTITUDE_LABEL, type DiplomacyStanceReply, type TradeSelection, type TradeVerdict } from "./client-diplomacy-trade-view.js";

const SEND_LABEL = "Offer gift";
const FADE_NOTE = "Gifts count for up to +25 and fade over about a day.";

/** The next attitude worth paying for: Pleased (enough for an alliance), then Friendly. */
const nextTargetScore = (score: number): number | undefined =>
  score < ATTITUDE_MIN_SCORE.PLEASED ? ATTITUDE_MIN_SCORE.PLEASED : score < ATTITUDE_MIN_SCORE.FRIENDLY ? ATTITUDE_MIN_SCORE.FRIENDLY : undefined;

export const giftVerdict = (input: { targetName: string; reply: DiplomacyStanceReply | undefined; selection: TradeSelection; own: DiplomacyGoods }): TradeVerdict => {
  const { targetName, reply, own } = input;
  const give = input.selection.terms.give;
  if (give.gold > own.gold || give.shard > own.shard) {
    return { tone: "bad", text: `You only have ${own.gold} coin and ${own.shard} Shards.`, canSend: false, sendLabel: SEND_LABEL };
  }
  if (reply && !reply.found) return { tone: "bad", text: `No empire named ${targetName}.`, canSend: false, sendLabel: SEND_LABEL };
  if (reply?.found && !reply.ai) return { tone: "bad", text: "Only AI empires take gifts.", canSend: false, sendLabel: SEND_LABEL };
  const value = netValueToAi({ give, ask: { gold: 0, shard: 0 } }, reply?.found && reply.ai ? (reply.pricing?.shardCoinValue ?? SHARD_COIN_VALUE) : SHARD_COIN_VALUE);
  if (value <= 0) {
    return { tone: "neutral", text: `Set what you give. A gift raises ${targetName}'s opinion of you. ${FADE_NOTE}`, canSend: false, sendLabel: SEND_LABEL };
  }
  if (!reply?.found || !reply.ai || !reply.gift || !reply.attitude) {
    return { tone: "neutral", text: `${targetName} would welcome the gift. ${FADE_NOTE}`, canSend: Boolean(reply), sendLabel: SEND_LABEL };
  }
  const { gift, attitude } = reply;
  const gain = giftOpinionGain(gift, value);
  if (gain <= 0) {
    const atCap = Math.round(gift.goodwillPoints) >= gift.maxPoints;
    return {
      tone: "bad",
      text: atCap
        ? `${targetName}'s opinion can't be raised further with gifts right now. ${FADE_NOTE}`
        : `Too small to change ${targetName}'s opinion: +1 costs about ${Math.ceil(gift.coinPerPoint)} coin.`,
      canSend: false,
      sendLabel: SEND_LABEL
    };
  }
  const after = attitude.score + gain;
  const from = ATTITUDE_LABEL[attitude.level];
  const to = ATTITUDE_LABEL[attitudeForScore(after)];
  const change = from === to ? `still ${to}` : `${from} → ${to}`;
  const reachesPleased = attitude.score < ATTITUDE_MIN_SCORE.PLEASED && after >= ATTITUDE_MIN_SCORE.PLEASED;
  const target = nextTargetScore(after);
  const more = target === undefined ? undefined : giftToReach({ ...gift, goodwillPoints: Math.min(gift.maxPoints, gift.goodwillPoints + value / gift.coinPerPoint) }, after, target);
  const next = reachesPleased
    ? " Pleased is enough for an alliance."
    : target === ATTITUDE_MIN_SCORE.PLEASED && more !== undefined
      ? ` About ${more} more coin would make them Pleased, enough for an alliance.`
      : "";
  return { tone: "good", text: `${targetName}'s opinion of you: +${gain} (${change}).${next} ${FADE_NOTE}`, canSend: true, sendLabel: SEND_LABEL };
};

/** The least coin that lifts the AI to its next attitude, if the player can afford it and gifts can get there. */
export const suggestedGift = (reply: DiplomacyStanceReply | undefined, own: DiplomacyGoods): DiplomacyTerms | undefined => {
  if (!reply?.found || !reply.ai || !reply.gift || !reply.attitude) return undefined;
  const target = nextTargetScore(reply.attitude.score);
  const coin = target === undefined ? undefined : giftToReach(reply.gift, reply.attitude.score, target);
  if (coin === undefined || coin <= 0 || coin > own.gold) return undefined;
  return { give: { gold: coin, shard: 0 }, ask: { gold: 0, shard: 0 } };
};
