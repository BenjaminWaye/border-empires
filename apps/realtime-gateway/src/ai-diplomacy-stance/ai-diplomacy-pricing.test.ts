import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import type { DiplomacyMemoryView } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";
import { computeAiOpinion } from "./ai-diplomacy-opinion.js";
import { aiDiplomacyPricing } from "./ai-diplomacy-pricing.js";
import type { AiDiplomacyStanceKind } from "./ai-diplomacy-stance.js";
import { answerDiplomacyStanceQuery } from "./diplomacy-stance-query.js";

const NOW = 100 * 60 * 60_000;
const HOUR = 60 * 60_000;
const memory = (overrides: Partial<DiplomacyMemoryView> = {}): DiplomacyMemoryView => ({
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

const price = (options: {
  stanceKind?: AiDiplomacyStanceKind;
  memory?: DiplomacyMemoryView;
  bordersTouch?: boolean;
  aiIncome?: number;
  requesterIncome?: number;
  aiGold?: number;
  brokeTruce?: boolean;
  breaksWithOthers?: number;
  aiWouldLeadAlliance?: boolean;
}) => {
  const stanceKind = options.stanceKind ?? "WARY";
  const mem = options.memory ?? memory();
  const bordersTouch = options.bordersTouch ?? true;
  const aiIncome = options.aiIncome ?? 1;
  const requesterIncome = options.requesterIncome ?? 1;
  const opinion = computeAiOpinion({
    stanceKind,
    memory: mem,
    requesterBrokeTruceWithAi: options.brokeTruce ?? false,
    requesterTruceBreaksWithOthers: options.breaksWithOthers ?? 0,
    bordersTouch,
    incomePerHour: Math.max(1, aiIncome, requesterIncome) * 60,
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
      requesterIncomePerMinute: requesterIncome,
      aiHoldings: { gold: options.aiGold ?? 0, shard: 0 },
      requesterBrokeTruceWithAi: options.brokeTruce ?? false,
      aiWouldLeadAlliance: options.aiWouldLeadAlliance ?? true,
      now: NOW
    })
  };
};

describe("AI truce pricing", () => {
  it("charges nothing between empires whose borders don't meet and who aren't fighting", () => {
    expect(price({ bordersTouch: false }).pricing.required.truce12).toBe(0);
  });

  it("charges neighbours at peace 12h of income, 1.5x for a 24h truce", () => {
    expect(price({}).pricing.required).toEqual(expect.objectContaining({ truce12: 12 * 60, truce24: 18 * 60 }));
  });

  // A rich player can't buy peace cheaply from a poor AI.
  it("prices in the richer empire's income", () => {
    expect(price({ aiIncome: 1, requesterIncome: 10 }).pricing.required.truce12).toBe(12 * 60 * 10);
  });

  it("charges more at war, most when the AI is winning, plus reparations and a repeat-buyer surcharge", () => {
    const atWar = memory({ lastCombatAt: NOW - HOUR, lastPlayerAttackAt: NOW - 2 * HOUR });
    // At war (24h), Annoyed by the attack and border friction (x1.5).
    expect(price({ memory: atWar }).pricing.required.truce12).toBe(24 * 1.5 * 60);
    // Winning (48h base), Annoyed (x1.5).
    const winning = memory({ lastCombatAt: NOW - HOUR, lastPlayerAttackAt: NOW - 2 * HOUR, tilesTakenByAi: 3 });
    expect(price({ memory: winning }).pricing.required.truce12).toBe(Math.round(48 * 1.5 * 60));
    const repeat = memory({ tilesTakenFromAi: 2, truceDeals: 1, lastPlayerAttackAt: NOW - 30 * HOUR });
    // Annoyed by the 2 lost tiles (x1.5), plus 2h reparations, then x1.5 for one recent truce.
    expect(price({ memory: repeat }).pricing.required.truce12).toBe((12 * 1.5 + 2) * 1.5 * 60);
  });

  // Civ's "too soon after declaring war": no grabbing land and buying peace to keep it.
  it("refuses peace talks right after the player attacks", () => {
    const result = price({ memory: memory({ lastPlayerAttackAt: NOW - 5 * 60_000, lastCombatAt: NOW - 5 * 60_000 }) });
    expect(result.pricing.required.truce12).toBeNull();
    expect(result.truceRefusal).toBe("You attacked Milo 5 min ago. They won't talk peace yet.");
  });

  it("refuses when furious", () => {
    const result = price({ brokeTruce: true });
    expect(result.opinion.attitude).toBe("FURIOUS");
    expect(result.pricing.required.truce12).toBeNull();
  });

  // The loser pays, but only in a real war, once per war, and capped.
  it("lets an AI losing a war pay for peace, once, capped by its income and coin", () => {
    const losing = memory({ lastCombatAt: NOW - HOUR, lastPlayerAttackAt: NOW - HOUR, tilesTakenFromAi: 4 });
    expect(price({ memory: losing, aiIncome: 2, aiGold: 400 }).pricing.required.truce12).toBe(-100);
    expect(price({ memory: losing, aiIncome: 2, aiGold: 100_000 }).pricing.required.truce12).toBe(-(6 * 60 * 2));
    expect(price({ memory: { ...losing, aiAlreadyPaidThisWar: true }, aiGold: 100_000 }).pricing.required.truce12).toBe(0);
  });

  it("never pays a stronger empire for peace when they aren't actually fighting", () => {
    expect(price({ stanceKind: "OUTMATCHED", aiGold: 100_000 }).pricing.required.truce12).toBeGreaterThanOrEqual(0);
  });

  it("takes peace for free when desperate, but still wants reparations", () => {
    expect(price({ stanceKind: "SEEKING_PEACE" }).pricing.required.truce12).toBe(0);
    expect(price({ stanceKind: "SEEKING_PEACE", memory: memory({ tilesTakenFromAi: 3 }) }).pricing.required.truce12).toBe(3 * 60);
  });
});

describe("AI alliance pricing", () => {
  it("needs at least Pleased, and the AI never pays", () => {
    expect(price({}).allianceRefusal).toBe("Milo doesn't think well enough of you for an alliance.");
    // Borders apart (+5) and fear (+10): Pleased, 24h of income.
    const pleased = price({ stanceKind: "OUTMATCHED", bordersTouch: false });
    expect(pleased.opinion.attitude).toBe("PLEASED");
    expect(pleased.pricing.required.alliance).toBe(24 * 60);
    const friendly = price({ stanceKind: "OUTMATCHED", bordersTouch: false, memory: memory({ goodwillCoin: 600 }) });
    expect(friendly.opinion.attitude).toBe("FRIENDLY");
    expect(friendly.pricing.required.alliance).toBe(0);
  });

  it("refuses after recent fighting or a broken truce, whatever the attitude", () => {
    const goodwill = memory({ goodwillCoin: 100_000 });
    expect(price({ stanceKind: "OUTMATCHED", bordersTouch: false, memory: { ...goodwill, lastCombatAt: NOW - 2 * HOUR } }).pricing.required.alliance).toBeNull();
    expect(price({ stanceKind: "OUTMATCHED", bordersTouch: false, memory: goodwill, brokeTruce: true }).allianceRefusal).toBe(
      "Milo will never ally with someone who broke a truce with them."
    );
  });

  // Diplomatic Dominance goes to a bloc's largest member, so the AI only joins blocs it would lead.
  it("refuses an alliance it wouldn't lead, however friendly", () => {
    const result = price({ stanceKind: "OUTMATCHED", bordersTouch: false, memory: memory({ goodwillCoin: 600 }), aiWouldLeadAlliance: false });
    expect(result.opinion.attitude).toBe("FRIENDLY");
    expect(result.pricing.required.alliance).toBeNull();
    expect(result.allianceRefusal).toBe("Milo won't join an alliance it wouldn't lead: your alliance is too large.");
  });

  // Goodwill is capped: coin alone can't buy friendship.
  it("caps goodwill from payments", () => {
    const rich = price({ memory: memory({ goodwillCoin: 10_000_000 }) });
    expect(rich.opinion.modifiers).toContainEqual({ label: "Payments you've made us", value: 25 });
  });
});

describe("AI attitude modifiers", () => {
  it("lists what drives the attitude", () => {
    const { opinion } = price({ breaksWithOthers: 2, memory: memory({ tilesTakenFromAi: 5 }) });
    expect(opinion.modifiers).toEqual([
      { label: "You have broken truces with others", value: -20 },
      { label: "You took 5 of our tiles", value: -20 },
      { label: "Our borders are contested", value: -10 }
    ]);
    expect(opinion.attitude).toBe("FURIOUS");
  });
});

describe("answerDiplomacyStanceQuery", () => {
  const aiSnapshot = {
    playerId: "ai-1",
    tiles: [],
    player: { manpower: 800, manpowerCap: 1000, gold: 40, incomePerMinute: 2, strategicResources: { SHARD: 1 } }
  } as unknown as PlayerSubscriptionSnapshot;
  const deps = {
    resolvePlayerByName: (name: string) => (name === "Milo" ? { id: "ai-1", name: "Milo" } : name === "Valka" ? { id: "p2", name: "Valka" } : undefined),
    isAutoRespondingAi: (id: string) => id === "ai-1",
    fetchAiSnapshot: async () => aiSnapshot,
    requesterSnapshot: async () => undefined,
    diplomacyContext: () => ({ requesterBrokeTruceWithAi: false, requesterTruceBreaksWithOthers: 0, memory: memory(), now: NOW, alliesOf: () => [] })
  };

  it("returns an AI's stance, attitude with modifiers, and prices", async () => {
    expect(await answerDiplomacyStanceQuery(deps, "p1", "Milo")).toEqual({
      type: "DIPLOMACY_STANCE",
      targetPlayerName: "Milo",
      found: true,
      targetPlayerId: "ai-1",
      ai: true,
      stance: { kind: "INDIFFERENT", reason: "Milo has no quarrel with you: your borders don't meet." },
      attitude: { level: "CAUTIOUS", score: 5, modifiers: [{ label: "Our borders don't meet", value: 5 }] },
      war: { atWar: false, aiWinning: false, aiLosing: false },
      allianceRefusal: "Milo doesn't think well enough of you for an alliance.",
      pricing: { required: { truce12: 0, truce24: 0, alliance: null }, shardCoinValue: 25, aiHoldings: { gold: 40, shard: 1 } }
    });
  });

  it("has nothing to predict for humans, unknown names, or yourself", async () => {
    expect(await answerDiplomacyStanceQuery(deps, "p1", "Valka")).toEqual(expect.objectContaining({ found: true, ai: false }));
    expect(await answerDiplomacyStanceQuery(deps, "p1", "Nobody")).toEqual(expect.objectContaining({ found: false }));
    expect(await answerDiplomacyStanceQuery(deps, "ai-1", "Milo")).toEqual(expect.objectContaining({ found: false }));
  });

  it("answers without a stance when the AI can't be read", async () => {
    const result = await answerDiplomacyStanceQuery({ ...deps, fetchAiSnapshot: async () => undefined }, "p1", "Milo");
    expect(result).toEqual(expect.objectContaining({ found: true, ai: true }));
    expect(result).not.toHaveProperty("stance");
  });
});
