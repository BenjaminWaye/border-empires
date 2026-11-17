// DIPLOMACY_STANCE_REQUEST: the trade screen asks how a target feels about
// the requester before any offer is sent. For a seeded AI the answer carries
// its stance and prices, so the client can preview "would they accept?" as
// the player edits the terms; for a human target there is nothing to
// predict, but the answer carries the human's coin and spare supply so the
// deal screen can show what they could give, as it does for an AI. Read-only:
// no offer is created.
import { supplyAgreementsFull, type AiDiplomacyPricing, type AiGiftView, type DiplomacyGoods } from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { evaluateAiDiplomacy, type AiDiplomacyContextSource } from "./ai-diplomacy-evaluation.js";
import type { AiAttitude, AiOpinionModifier } from "./ai-diplomacy-opinion.js";
import type { AiDiplomacyStanceKind } from "./ai-diplomacy-stance.js";

export type DiplomacyStancePayload = {
  truceLockout?: { until: number; reason: string };
  /** The target is at its supply agreement limit: a deal adding resource supply would be refused. */
  supplyAgreementsFull?: true;
} & (
  | { type: "DIPLOMACY_STANCE"; targetPlayerName: string; found: false }
  | {
      type: "DIPLOMACY_STANCE";
      targetPlayerName: string;
      found: true;
      targetPlayerId: string;
      ai: false;
      /** The human's coin and spare supply, online or not; absent only when the lookup fails or times out. */
      holdings?: DiplomacyGoods;
    }
  | {
      type: "DIPLOMACY_STANCE";
      targetPlayerName: string;
      found: true;
      targetPlayerId: string;
      ai: true;
      /** Absent when the AI couldn't be read right now. */
      stance?: { kind: AiDiplomacyStanceKind; reason: string };
      /** Civ-style attitude with the modifiers behind it, for the trade screen. */
      attitude?: { level: AiAttitude; score: number; modifiers: AiOpinionModifier[] };
      /** tilesTakenFromAi/ByAi: the fading tile counts the AI judges the war by. */
      war?: { atWar: boolean; aiWinning: boolean; aiLosing: boolean; tilesTakenFromAi: number; tilesTakenByAi: number };
      truceRefusal?: string;
      allianceRefusal?: string;
      pricing?: AiDiplomacyPricing;
      /** For the gift preview: coin per opinion point and the goodwill already paid. */
      gift?: AiGiftView;
      /** The AI's fixed personality, for the trade screen. */
      temperament?: { label: string; traits: string };
    }
);

export type DiplomacyStanceQueryDeps = {
  resolvePlayerByName: (playerName: string) => { id: string; name: string } | undefined;
  /** Preferred when the client sends the target's id: a display name can be shared by a human and an AI. */
  resolvePlayerById?: (playerId: string) => { id: string; name: string } | undefined;
  truceLockoutUntil?: (playerId: string) => number;
  isAutoRespondingAi: (playerId: string) => boolean;
  fetchAiSnapshot: (playerId: string) => Promise<PlayerSubscriptionSnapshot | undefined>;
  requesterSnapshot: (playerId: string) => Promise<PlayerSubscriptionSnapshot | undefined>;
  diplomacyContext: AiDiplomacyContextSource;
  /** The target's active supply agreements, when known without fetching an offline House's snapshot. */
  supplyAgreementCount?: (playerId: string) => Promise<number | undefined>;
  /**
   * A human target's tradeable goods, online or offline alike: whether they are
   * present must never reveal whether that House is logged in.
   */
  humanHoldings?: (playerId: string) => Promise<DiplomacyGoods | undefined>;
};

/** A slow simulation lookup only drops the amounts; it never holds up the reply. */
export const HUMAN_HOLDINGS_TIMEOUT_MS = 1_500;

const withinTimeout = <T>(lookup: Promise<T | undefined>, ms: number): Promise<T | undefined> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), ms); });
  return Promise.race([lookup.catch(() => undefined), timeout]).finally(() => clearTimeout(timer));
};

/** Coin (whole) and spare supply slots: what a player could hand over in a deal. */
export const tradeHoldingsOf = (player: { gold: number; resourceTradeHoldings?: DiplomacyGoods["resources"] }): DiplomacyGoods => ({
  gold: Math.max(0, Math.floor(player.gold)),
  ...(player.resourceTradeHoldings ? { resources: player.resourceTradeHoldings } : {})
});

export const answerDiplomacyStanceQuery = async (
  deps: DiplomacyStanceQueryDeps,
  requesterId: string,
  targetPlayerName: string,
  targetPlayerId?: string
): Promise<DiplomacyStancePayload> => {
  const target = (targetPlayerId ? deps.resolvePlayerById?.(targetPlayerId) : undefined) ?? deps.resolvePlayerByName(targetPlayerName);
  if (!target || target.id === requesterId) return { type: "DIPLOMACY_STANCE", targetPlayerName, found: false };
  const requesterLockout = deps.truceLockoutUntil?.(requesterId) ?? 0;
  const targetLockout = deps.truceLockoutUntil?.(target.id) ?? 0;
  const until = Math.max(requesterLockout, targetLockout);
  const reason = requesterLockout >= targetLockout
    ? "You recently broke a truce. You can make and accept new truces 24 hours after breaking it."
    : `${target.name} recently broke a truce and cannot accept a new one yet.`;
  // Started alongside the AI snapshot reads below; a failure only drops the flag.
  const supplyCount = Promise.resolve().then(() => deps.supplyAgreementCount?.(target.id)).catch(() => undefined);
  const fullFlag = (count: number | undefined) => (count !== undefined && supplyAgreementsFull(count) ? { supplyAgreementsFull: true as const } : {});
  const lockout = until > 0 ? { truceLockout: { until, reason } } : {};
  const ids = { type: "DIPLOMACY_STANCE" as const, targetPlayerName: target.name, found: true as const, targetPlayerId: target.id };
  if (!deps.isAutoRespondingAi(target.id)) {
    const lookup = Promise.resolve().then(() => deps.humanHoldings?.(target.id));
    const [count, holdings] = await Promise.all([supplyCount, withinTimeout(lookup, HUMAN_HOLDINGS_TIMEOUT_MS)]);
    return { ...ids, ...lockout, ...fullFlag(count), ai: false, ...(holdings ? { holdings } : {}) };
  }
  const [aiSnapshot, requesterSnapshot, targetSupplyAgreements] = await Promise.all([
    deps.fetchAiSnapshot(target.id),
    deps.requesterSnapshot(requesterId).catch(() => undefined),
    supplyCount
  ]);
  const base = { ...ids, ...lockout, ...fullFlag(targetSupplyAgreements) };
  const evaluation = evaluateAiDiplomacy({
    aiPlayerId: target.id,
    aiName: target.name,
    aiSnapshot,
    requesterId,
    requesterSnapshot,
    ...(await deps.diplomacyContext(requesterId, target.id))
  });
  if (!evaluation) return { ...base, ai: true };
  return {
    ...base,
    ai: true,
    stance: { kind: evaluation.stance.kind, reason: evaluation.reason },
    attitude: { level: evaluation.opinion.attitude, score: evaluation.opinion.score, modifiers: evaluation.opinion.modifiers },
    war: {
      atWar: evaluation.opinion.war.atWar,
      aiWinning: evaluation.opinion.war.aiWinning,
      aiLosing: evaluation.opinion.war.aiLosing,
      tilesTakenFromAi: evaluation.opinion.war.tilesTakenFromAi,
      tilesTakenByAi: evaluation.opinion.war.tilesTakenByAi
    },
    ...(evaluation.truceRefusal ? { truceRefusal: evaluation.truceRefusal } : {}),
    ...(evaluation.allianceRefusal ? { allianceRefusal: evaluation.allianceRefusal } : {}),
    pricing: evaluation.pricing,
    gift: evaluation.gift,
    temperament: { label: evaluation.temperament.label, traits: evaluation.temperament.traits }
  };
};
