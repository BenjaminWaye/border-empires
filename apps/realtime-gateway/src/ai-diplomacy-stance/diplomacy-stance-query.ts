// DIPLOMACY_STANCE_REQUEST: the trade screen asks how a target feels about
// the requester before any offer is sent. For a seeded AI the answer carries
// its stance and prices, so the client can preview "would they accept?" as
// the player edits the terms; for a human target there is nothing to
// predict. Read-only: no offer is created.
import type { AiDiplomacyPricing } from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { evaluateAiDiplomacy, type AiDiplomacyContext } from "./ai-diplomacy-evaluation.js";
import type { AiAttitude, AiOpinionModifier } from "./ai-diplomacy-opinion.js";
import type { AiDiplomacyStanceKind } from "./ai-diplomacy-stance.js";

export type DiplomacyStancePayload =
  | { type: "DIPLOMACY_STANCE"; targetPlayerName: string; found: false }
  | { type: "DIPLOMACY_STANCE"; targetPlayerName: string; found: true; targetPlayerId: string; ai: false }
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
      war?: { atWar: boolean; aiWinning: boolean; aiLosing: boolean };
      truceRefusal?: string;
      allianceRefusal?: string;
      pricing?: AiDiplomacyPricing;
    };

export type DiplomacyStanceQueryDeps = {
  resolvePlayerByName: (playerName: string) => { id: string; name: string } | undefined;
  isAutoRespondingAi: (playerId: string) => boolean;
  fetchAiSnapshot: (playerId: string) => Promise<PlayerSubscriptionSnapshot | undefined>;
  requesterSnapshot: (playerId: string) => Promise<PlayerSubscriptionSnapshot | undefined>;
  diplomacyContext: (requesterId: string, aiPlayerId: string) => AiDiplomacyContext;
};

export const answerDiplomacyStanceQuery = async (
  deps: DiplomacyStanceQueryDeps,
  requesterId: string,
  targetPlayerName: string
): Promise<DiplomacyStancePayload> => {
  const target = deps.resolvePlayerByName(targetPlayerName);
  if (!target || target.id === requesterId) return { type: "DIPLOMACY_STANCE", targetPlayerName, found: false };
  const base = { type: "DIPLOMACY_STANCE" as const, targetPlayerName: target.name, found: true as const, targetPlayerId: target.id };
  if (!deps.isAutoRespondingAi(target.id)) return { ...base, ai: false };
  const [aiSnapshot, requesterSnapshot] = await Promise.all([
    deps.fetchAiSnapshot(target.id),
    deps.requesterSnapshot(requesterId).catch(() => undefined)
  ]);
  const evaluation = evaluateAiDiplomacy({
    aiPlayerId: target.id,
    aiName: target.name,
    aiSnapshot,
    requesterId,
    requesterSnapshot,
    ...deps.diplomacyContext(requesterId, target.id)
  });
  if (!evaluation) return { ...base, ai: true };
  return {
    ...base,
    ai: true,
    stance: { kind: evaluation.stance.kind, reason: evaluation.reason },
    attitude: { level: evaluation.opinion.attitude, score: evaluation.opinion.score, modifiers: evaluation.opinion.modifiers },
    war: { atWar: evaluation.opinion.war.atWar, aiWinning: evaluation.opinion.war.aiWinning, aiLosing: evaluation.opinion.war.aiLosing },
    ...(evaluation.truceRefusal ? { truceRefusal: evaluation.truceRefusal } : {}),
    ...(evaluation.allianceRefusal ? { allianceRefusal: evaluation.allianceRefusal } : {}),
    pricing: evaluation.pricing
  };
};
