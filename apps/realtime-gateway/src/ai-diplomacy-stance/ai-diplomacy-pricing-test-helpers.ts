// Shared fixtures for the AI diplomacy pricing tests (split out of
// ai-diplomacy-pricing.test.ts to keep each test file under the line cap).
import type { DiplomacyMemoryView } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";
import { computeAiOpinion } from "./ai-diplomacy-opinion.js";
import { aiDiplomacyPricing, goodwillIncomePerHour } from "./ai-diplomacy-pricing.js";
import type { AiDiplomacyStanceKind } from "./ai-diplomacy-stance.js";
import type { AiTemperament } from "./ai-diplomacy-temperament.js";
import type { AiRetaliationReadiness } from "./ai-retaliation-readiness.js";

export const NOW = 100 * 60 * 60_000;
export const HOUR = 60 * 60_000;
export const memory = (overrides: Partial<DiplomacyMemoryView> = {}): DiplomacyMemoryView => ({
  tilesTakenFromAi: 0,
  tilesTakenByAi: 0,
  battles: 0,
  truceDeals: 0,
  goodwillCoin: 0,
  lastPlayerAttackAt: undefined,
  lastCombatAt: undefined,
  aiAlreadyPaidThisWar: false,
  ...overrides
});

/** Attacked the AI 12h ago (outside the 6h war window): neighbours pay the 12h neighbour price, and it is Annoyed (x1.5). */
export const foughtLately = (): DiplomacyMemoryView => memory({ lastCombatAt: NOW - 12 * HOUR, lastPlayerAttackAt: NOW - 12 * HOUR });

export const price = (options: {
  stanceKind?: AiDiplomacyStanceKind;
  memory?: DiplomacyMemoryView;
  bordersTouch?: boolean;
  aiIncome?: number;
  aiGold?: number;
  brokeTruce?: boolean;
  breaksWithOthers?: number;
  brokeAlliance?: boolean;
  /** Pass undefined explicitly for "sizes unknown". */
  aiWouldLeadAlliance?: boolean | undefined;
  giftToPleased?: number;
  retaliation?: AiRetaliationReadiness;
  temperament?: AiTemperament;
  /** How many times stronger the AI is than the requester. */
  aiToRequesterStrength?: number;
  aiCanOpenFront?: boolean;
  /** The requester holds unfortified towns or resources near the AI's border. */
  requesterLandWorthTaking?: boolean;
}) => {
  const stanceKind = options.stanceKind ?? "WARY";
  const mem = options.memory ?? memory();
  const bordersTouch = options.bordersTouch ?? true;
  const aiIncome = options.aiIncome ?? 1;
  const opinion = computeAiOpinion({
    stanceKind,
    memory: mem,
    requesterBrokeTruceWithAi: options.brokeTruce ?? false,
    requesterTruceBreaksWithOthers: options.breaksWithOthers ?? 0,
    requesterBrokeAllianceWithAi: options.brokeAlliance ?? false,
    bordersTouch,
    incomePerHour: goodwillIncomePerHour(aiIncome),
    ...(options.temperament ? { temperament: options.temperament } : {}),
    now: NOW
  });
  return {
    opinion,
    ...aiDiplomacyPricing({
      aiName: "Milo",
      stanceKind,
      opinion,
      memory: mem,
      bordersTouch,
      aiIncomePerMinute: aiIncome,
      aiHoldings: { gold: options.aiGold ?? 0 },
      requesterBrokeTruceWithAi: options.brokeTruce ?? false,
      aiWouldLeadAlliance: "aiWouldLeadAlliance" in options ? options.aiWouldLeadAlliance : true,
      ...(options.giftToPleased !== undefined ? { giftToPleased: options.giftToPleased } : {}),
      ...(options.aiCanOpenFront !== undefined ? { aiCanOpenFront: options.aiCanOpenFront } : {}),
      ...(options.retaliation ? { retaliation: options.retaliation } : {}),
      ...(options.temperament ? { temperament: options.temperament } : {}),
      ...(options.aiToRequesterStrength !== undefined ? { aiToRequesterStrength: options.aiToRequesterStrength } : {}),
      ...(options.requesterLandWorthTaking !== undefined ? { requesterLandWorthTaking: options.requesterLandWorthTaking } : {}),
      now: NOW
    })
  };
};

