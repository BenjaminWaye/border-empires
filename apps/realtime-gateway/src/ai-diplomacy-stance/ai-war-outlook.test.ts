import { describe, expect, it } from "vitest";

import type { DiplomacyMemoryView } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";
import { computeAiOpinion } from "./ai-diplomacy-opinion.js";
import { aiDiplomacyPricing } from "./ai-diplomacy-pricing.js";
import { aiWarOutlook, type AiWarOutlook } from "./ai-war-outlook.js";

const MIN = 60_000;
const HOUR = 60 * MIN;
// An AI with its army spent (50 of 1000) facing a rival with 600 ready.
const spent = { manpower: 50, manpowerCap: 1000, musterManpower: 0 };
const rival = { fightingStrength: 600, manpowerCap: 1000 };
const outlook = (overrides: Partial<Parameters<typeof aiWarOutlook>[0]> = {}) =>
  aiWarOutlook({ atWar: true, ai: { ...spent, nextRefillInMs: 3 * HOUR, nextRefillManpower: 700 }, rival, recentTilesLost: 5, recentTilesTaken: 0, ...overrides });

describe("aiWarOutlook", () => {
  it("sues for peace when losing ground fast with no reload in reach", () => {
    // 5 tiles in the last hour and a half is ~3.5 an hour: ~7 more by the 2h horizon.
    expect(outlook()).toEqual({ kind: "SUE_FOR_PEACE", projectedLoss: 7 });
  });

  it("holds out when its reload lands soon and out-muscles the rival", () => {
    expect(outlook({ ai: { ...spent, nextRefillInMs: 20 * MIN, nextRefillManpower: 700 } })).toEqual({ kind: "HOLD_FOR_REFILL", refillInMs: 20 * MIN });
  });

  it("counts the rival's reload when it lands first", () => {
    const ai = { ...spent, nextRefillInMs: 20 * MIN, nextRefillManpower: 700 };
    expect(outlook({ ai, rival: { ...rival, nextRefillInMs: 10 * MIN, nextRefillManpower: 400 } }).kind).toBe("SUE_FOR_PEACE");
    expect(outlook({ ai, rival: { ...rival, nextRefillInMs: 30 * MIN, nextRefillManpower: 400 } }).kind).toBe("HOLD_FOR_REFILL");
  });

  it("doesn't count a reload too small to fight back with", () => {
    expect(outlook({ ai: { ...spent, nextRefillInMs: 20 * MIN, nextRefillManpower: 100 } }).kind).toBe("SUE_FOR_PEACE");
  });

  // HOLD used to fire for any AI with a reload due, spent or not, so a level war read as "expects to win its land back"
  // and the tally's "lost 2+ more tiles" no longer counted as losing.
  it("only holds out for a reload when it is spent now", () => {
    const fit = { manpower: 600, manpowerCap: 1000, musterManpower: 0, nextRefillInMs: 90 * MIN, nextRefillManpower: 400 };
    expect(outlook({ ai: fit, rival: { fightingStrength: 550, manpowerCap: 1000 }, recentTilesLost: 2.5 }).kind).toBe("STEADY");
    // A fading count left over from hours ago is no recent loss.
    expect(outlook({ ai: { ...spent, nextRefillInMs: 20 * MIN, nextRefillManpower: 700 }, recentTilesLost: 0.6 }).kind).toBe("STEADY");
  });

  // "Truce ends, take 3 tiles, get paid" could repeat every 12h and drain the AI.
  it("doesn't sue the same rival again within a day of paying it", () => {
    const now = 100 * HOUR;
    expect(outlook({ paidForPeaceAt: now - 23 * HOUR, now }).kind).toBe("STEADY");
    expect(outlook({ paidForPeaceAt: now - 25 * HOUR, now }).kind).toBe("SUE_FOR_PEACE");
  });

  it("stays steady when not losing ground lately, losing it slowly, or still able to hold", () => {
    expect(outlook({ recentTilesLost: 2, recentTilesTaken: 2 }).kind).toBe("STEADY");
    expect(outlook({ recentTilesLost: 2 }).kind).toBe("STEADY");
    expect(outlook({ ai: { ...spent, manpower: 700 } }).kind).toBe("STEADY");
    expect(outlook({ atWar: false }).kind).toBe("STEADY");
  });
});

// A losing AI never paid for peace with someone who had just attacked it, so the player overrunning it was never paid.
describe("an AI suing for peace", () => {
  const NOW = 100 * HOUR;
  const memory: DiplomacyMemoryView = {
    tilesTakenFromAi: 5, tilesTakenByAi: 0, recentTilesTakenFromAi: 5, recentTilesTakenByAi: 0, battles: 5, truceDeals: 0, goodwillCoin: 0,
    lastPlayerAttackAt: NOW - 5 * MIN, lastCombatAt: NOW - 5 * MIN, aiAlreadyPaidThisWar: false
  };
  const priced = (warOutlook: AiWarOutlook) => {
    const opinion = computeAiOpinion({ stanceKind: "SEEKING_PEACE", memory, requesterBrokeTruceWithAi: false, requesterTruceBreaksWithOthers: 0,
      requesterBrokeAllianceWithAi: false, bordersTouch: true, incomePerHour: 60, outlook: warOutlook, now: NOW });
    return aiDiplomacyPricing({ aiName: "Milo", stanceKind: "SEEKING_PEACE", opinion, memory, bordersTouch: true, aiIncomePerMinute: 1,
      aiHoldings: { gold: 10_000 }, requesterBrokeTruceWithAi: false, aiWouldLeadAlliance: true,
      retaliation: { readiness: 0.05, ready: false, boxedIn: false }, outlook: warOutlook, now: NOW });
  };

  it("pays right after being attacked, for the land it expects to lose", () => {
    // 7 tiles projected at an hour of income (60 coin) each.
    expect(priced({ kind: "SUE_FOR_PEACE", projectedLoss: 7 }).pricing.required.truce12).toBe(-420);
    // Steady, the attacker pays reparations instead.
    expect(priced({ kind: "STEADY" }).pricing.required.truce12).toBeGreaterThan(0);
  });

  it("pays at least the usual 6h and at most 12h of income", () => {
    expect(priced({ kind: "SUE_FOR_PEACE", projectedLoss: 1 }).pricing.required.truce12).toBe(-360);
    expect(priced({ kind: "SUE_FOR_PEACE", projectedLoss: 40 }).pricing.required.truce12).toBe(-720);
  });

  it("isn't losing while it expects its reload to win the land back", () => {
    const hold = computeAiOpinion({ stanceKind: "SEEKING_PEACE", memory, requesterBrokeTruceWithAi: false, requesterTruceBreaksWithOthers: 0,
      requesterBrokeAllianceWithAi: false, bordersTouch: true, incomePerHour: 60, outlook: { kind: "HOLD_FOR_REFILL", refillInMs: 20 * MIN }, now: NOW });
    expect(hold.war.aiLosing).toBe(false);
  });
});
