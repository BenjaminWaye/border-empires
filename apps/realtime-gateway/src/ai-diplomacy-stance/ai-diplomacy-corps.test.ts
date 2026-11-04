import { describe, expect, it } from "vitest";
import type { DiplomacyMemoryView } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";
import { computeAiOpinion } from "./ai-diplomacy-opinion.js";
import { aiDiplomacyPricing } from "./ai-diplomacy-pricing.js";

const memory: DiplomacyMemoryView = { tilesTakenFromAi: 0, tilesTakenByAi: 0, battles: 0, truceDeals: 0, goodwillCoin: 0, lastPlayerAttackAt: undefined, lastCombatAt: undefined, aiAlreadyPaidThisWar: false };
const opinionWith = (diplomaticCorpsBonus?: number) => computeAiOpinion({ stanceKind: "WARY", memory, requesterBrokeTruceWithAi: false, requesterTruceBreaksWithOthers: 0,
  requesterBrokeAllianceWithAi: false, bordersTouch: true, incomePerHour: 60, now: 1, ...(diplomaticCorpsBonus !== undefined ? { diplomaticCorpsBonus } : {}) });

describe("Diplomatic Corps (AFC Chancery II) in AI diplomacy", () => {
  it("adds a named +15 opinion modifier", () => {
    const corps = opinionWith(15);
    expect(corps.score - opinionWith().score).toBe(15);
    expect(corps.modifiers).toContainEqual({ label: "Your diplomatic corps", value: 15 });
  });

  it("halves what the requester pays for a truce, but not what a losing AI pays for peace", () => {
    const opinion = opinionWith();
    const priced = (requesterTruceCostMult?: number) => aiDiplomacyPricing({ aiName: "Milo", stanceKind: "WARY", opinion, memory, bordersTouch: true, aiIncomePerMinute: 1, requesterIncomePerMinute: 1,
      aiHoldings: { gold: 0, shard: 0 }, requesterBrokeTruceWithAi: false, aiWouldLeadAlliance: true, now: 1, ...(requesterTruceCostMult !== undefined ? { requesterTruceCostMult } : {}) }).pricing.required;
    expect(priced(0.5).truce12).toBe(Math.round(priced().truce12! / 2));
    expect(priced(0.5).truce24).toBe(Math.round(priced().truce24! / 2));
  });
});
