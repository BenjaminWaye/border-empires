import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import type { DiplomacyMemoryView } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";
import { computeAiOpinion } from "./ai-diplomacy-opinion.js";
import { aiDiplomacyPricing, goodwillIncomePerHour, MIN_INCOME_PER_MINUTE } from "./ai-diplomacy-pricing.js";
import type { AiDiplomacyStanceKind } from "./ai-diplomacy-stance.js";
import { AI_TEMPERAMENTS, type AiTemperament } from "./ai-diplomacy-temperament.js";
import type { AiRetaliationReadiness } from "./ai-retaliation-readiness.js";
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
  aiGold?: number;
  brokeTruce?: boolean;
  breaksWithOthers?: number;
  brokeAlliance?: boolean;
  /** Pass undefined explicitly for "sizes unknown". */
  aiWouldLeadAlliance?: boolean | undefined;
  giftToPleased?: number;
  retaliation?: AiRetaliationReadiness;
  temperament?: AiTemperament;
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
      ...(options.retaliation ? { retaliation: options.retaliation } : {}),
      ...(options.temperament ? { temperament: options.temperament } : {}),
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

  // Real incomes are a few hundred coin a day: a floor of 1,440 a day priced every neighbour truce at 720+ coin.
  it("prices low incomes on what the AI really earns", () => {
    expect(price({ aiIncome: 0.24 }).pricing.required).toEqual(expect.objectContaining({ truce12: 173, truce24: 259 }));
  });

  it("floors income at 10 coin a day", () => {
    expect(MIN_INCOME_PER_MINUTE * 24 * 60).toBeCloseTo(10);
    expect(price({ aiIncome: 0 }).pricing.required.truce12).toBe(5);
  });

  // A strong economy buys off weak neighbours cheaply: only the AI's own income sets its price.
  it("prices on the AI's own income, however rich the player", () => {
    const smallAi = { aiIncome: 72 / 1440 }; // 72 coin a day
    expect(price(smallAi).pricing.required.truce12).toBe(36);
    expect(price({ aiIncome: 533 / 1440 }).pricing.required.truce12).toBe(267);
    expect(price({ ...smallAi, bordersTouch: false, stanceKind: "OUTMATCHED", memory: memory({ goodwillCoin: 600 }) }).pricing.required.alliance).toBe(0);
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

  // Without a read on the AI's army it falls back to Civ's "too soon after declaring war".
  it("refuses peace talks right after the player attacks when it can't judge its readiness", () => {
    const result = price({ memory: memory({ lastPlayerAttackAt: NOW - 5 * 60_000, lastCombatAt: NOW - 5 * 60_000 }) });
    expect(result.pricing.required.truce12).toBeNull();
    expect(result.truceRefusal).toBe("You attacked Milo 5 min ago. They won't talk peace yet.");
  });

  describe("right after the player attacks", () => {
    const justAttacked = memory({ lastPlayerAttackAt: NOW - 5 * 60_000, lastCombatAt: NOW - 5 * 60_000 });
    const spent: AiRetaliationReadiness = { readiness: 0.1, ready: false, boxedIn: true };
    const readyWithRoom: AiRetaliationReadiness = { readiness: 0.8, ready: true, boxedIn: false };
    const readyBoxedIn: AiRetaliationReadiness = { readiness: 0.8, ready: true, boxedIn: true };

    // Attack, offer a truce, log off: an AI with no counter-attack in hand takes the deal and turns elsewhere.
    it("deals at a fresh-aggression surcharge when it has no army ready to strike back", () => {
      const result = price({ memory: justAttacked, retaliation: spent });
      expect(result.truceRefusal).toBeUndefined();
      // At war (24h) x Annoyed (1.5) x fresh aggression (1.5).
      expect(result.pricing.required.truce12).toBe(Math.round(24 * 1.5 * 1.5 * 60));
    });

    it("deals when its army is ready but it has other land to grow into", () => {
      expect(price({ memory: justAttacked, retaliation: readyWithRoom }).truceRefusal).toBeUndefined();
    });

    it("refuses while it has an army ready and this border is its only way to grow", () => {
      const result = price({ memory: justAttacked, retaliation: readyBoxedIn });
      expect(result.pricing.required.truce12).toBeNull();
      expect(result.truceRefusal).toBe(
        "You attacked Milo 5 min ago and they have an army ready to strike back. They won't talk peace for another 25 min."
      );
    });

    it("refuses while it has an army ready and is winning the war", () => {
      const winning = memory({ lastPlayerAttackAt: NOW - 5 * 60_000, lastCombatAt: NOW - 5 * 60_000, tilesTakenByAi: 6 });
      expect(price({ memory: winning, retaliation: readyWithRoom }).truceRefusal).toContain("army ready to strike back");
    });

    it("never pays the attacker for peace, but asks reparations even when losing", () => {
      const losing = memory({ lastPlayerAttackAt: NOW - 5 * 60_000, lastCombatAt: NOW - 5 * 60_000, tilesTakenFromAi: 4 });
      const result = price({ memory: losing, retaliation: spent, aiGold: 100_000 });
      expect(result.opinion.war.aiLosing).toBe(true);
      expect(result.pricing.required.truce12).toBe(4 * 60);
      expect(result.pricing.required.truce24).toBe(4 * 60 * 1.5);
    });

    it("drops the surcharge once the window has passed", () => {
      const later = memory({ lastPlayerAttackAt: NOW - 31 * 60_000, lastCombatAt: NOW - 31 * 60_000 });
      expect(price({ memory: later, retaliation: readyBoxedIn }).pricing.required.truce12).toBe(24 * 1.5 * 60);
    });
  });

  it("refuses when furious", () => {
    const result = price({ brokeTruce: true });
    expect(result.opinion.attitude).toBe("FURIOUS");
    expect(result.pricing.required.truce12).toBeNull();
  });

  // Regression: taking 10+ tiles made a neighbour Furious, and Furious
  // refused peace, so an AI "losing the war and wanting it over" never
  // talked peace at all.
  it("still talks peace while furious if it is losing the war", () => {
    const losing = memory({ lastCombatAt: NOW - HOUR, lastPlayerAttackAt: NOW - HOUR, tilesTakenFromAi: 15 });
    const result = price({ memory: losing, aiIncome: 2, aiGold: 400 });
    expect(result.opinion.attitude).toBe("FURIOUS");
    expect(result.opinion.war.aiLosing).toBe(true);
    expect(result.truceRefusal).toBeUndefined();
    expect(result.pricing.required.truce12).toBe(-100);
  });

  // Losing doesn't buy back a betrayal: a truce-breaker could otherwise be paid again and again.
  it("still refuses a player who broke a truce with it, even while losing", () => {
    const losing = memory({ lastCombatAt: NOW - HOUR, lastPlayerAttackAt: NOW - HOUR, tilesTakenFromAi: 15 });
    const result = price({ memory: losing, aiIncome: 2, aiGold: 400, brokeTruce: true });
    expect(result.opinion.war.aiLosing).toBe(true);
    expect(result.pricing.required.truce12).toBeNull();
    expect(result.truceRefusal).toBe("Milo is furious with you and won't talk peace.");
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

  // The loser pays only while actually losing: an outmatched AI that is
  // taking tiles (often in a war it started) is winning, and charges for peace.
  it("doesn't pay for peace when outmatched or desperate but gaining ground", () => {
    const aiGaining = memory({ lastCombatAt: NOW - HOUR, tilesTakenByAi: 10 });
    for (const stanceKind of ["OUTMATCHED", "SEEKING_PEACE"] as const) {
      const result = price({ stanceKind, memory: aiGaining, aiGold: 100_000 });
      expect(result.opinion.war).toEqual(expect.objectContaining({ aiLosing: false, aiWinning: true }));
      expect(result.pricing.required.truce12).toBeGreaterThanOrEqual(0);
    }
    // Outmatched and not gaining: still losing, still pays.
    expect(price({ stanceKind: "OUTMATCHED", memory: memory({ lastCombatAt: NOW - HOUR }), aiGold: 100_000 }).pricing.required.truce12).toBeLessThan(0);
  });

  // Fight memory isn't persisted. After a restart the memory is empty, so
  // there is no war to be losing: the AI can't pay again until a new fight,
  // which would end "already paid this war" even without a restart.
  it("doesn't pay for peace from an empty (post-restart) memory", () => {
    for (const stanceKind of ["OUTMATCHED", "SEEKING_PEACE"] as const) {
      expect(price({ stanceKind, memory: memory(), aiGold: 100_000 }).pricing.required.truce12).toBeGreaterThanOrEqual(0);
    }
  });

  it("takes peace for free when desperate, but still wants reparations", () => {
    expect(price({ stanceKind: "SEEKING_PEACE" }).pricing.required.truce12).toBe(0);
    expect(price({ stanceKind: "SEEKING_PEACE", memory: memory({ tilesTakenFromAi: 3 }) }).pricing.required.truce12).toBe(3 * 60);
  });
});

describe("AI alliance pricing", () => {
  // The trade screen's Suggest deal had nothing to offer a Cautious AI: it refused alliances outright.
  it("asks tribute below Pleased when payments can still win the AI over", () => {
    const cautious = price({ giftToPleased: 92 });
    expect(cautious.opinion.attitude).toBe("CAUTIOUS");
    expect(cautious).not.toHaveProperty("allianceRefusal");
    // The coin that lifts it to Pleased, plus its Pleased price (24h of income).
    expect(cautious.pricing.required.alliance).toBe(92 + 24 * 60);
    // Other refusals still hold.
    expect(price({ giftToPleased: 92, memory: memory({ lastCombatAt: NOW - HOUR }) }).pricing.required.alliance).toBeNull();
    expect(price({ giftToPleased: 92, aiWouldLeadAlliance: false }).allianceRefusal).toBe("Milo won't join an alliance this large unless it clearly leads it: it won't help anyone else toward Diplomatic Dominance.");
  });

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

  // Regression: "can't weigh up an alliance right now" hid the real reason (a war) behind a missing leaderboard.
  it("gives the real refusal before saying it can't weigh up bloc sizes", () => {
    const atWar = memory({ lastCombatAt: NOW - HOUR, lastPlayerAttackAt: NOW - HOUR, tilesTakenFromAi: 15 });
    expect(price({ memory: atWar, aiWouldLeadAlliance: undefined }).allianceRefusal).toBe("Milo won't ally with an empire it fought within the last day.");
    expect(price({ aiWouldLeadAlliance: undefined }).allianceRefusal).toBe("Milo doesn't think well enough of you for an alliance.");
    const friendly = { stanceKind: "OUTMATCHED" as const, bordersTouch: false, memory: memory({ goodwillCoin: 600 }), aiWouldLeadAlliance: undefined };
    expect(price(friendly).allianceRefusal).toBe("Milo can't weigh up an alliance right now. Try again shortly.");
  });

  // Diplomatic Dominance goes to a bloc's largest member, so the AI only joins blocs it would lead.
  it("refuses an alliance it wouldn't lead, however friendly", () => {
    const result = price({ stanceKind: "OUTMATCHED", bordersTouch: false, memory: memory({ goodwillCoin: 600 }), aiWouldLeadAlliance: false });
    expect(result.opinion.attitude).toBe("FRIENDLY");
    expect(result.pricing.required.alliance).toBeNull();
    expect(result.allianceRefusal).toBe("Milo won't join an alliance this large unless it clearly leads it: it won't help anyone else toward Diplomatic Dominance.");
  });

  // Goodwill is capped: coin alone can't buy friendship.
  it("caps goodwill from payments", () => {
    const rich = price({ memory: memory({ goodwillCoin: 10_000_000 }) });
    expect(rich.opinion.modifiers).toContainEqual({ label: "Gifts and payments you've made us", value: 25 });
  });
});

describe("AI temperaments", () => {
  const { MERCHANT, WARLIKE, PEACEABLE, VENGEFUL } = AI_TEMPERAMENTS;
  const atWar = (overrides: Partial<DiplomacyMemoryView> = {}): DiplomacyMemoryView =>
    memory({ lastCombatAt: NOW - HOUR, lastPlayerAttackAt: NOW - 2 * HOUR, ...overrides });

  it("leaves a Measured AI's prices alone", () => {
    expect(price({ temperament: AI_TEMPERAMENTS.MEASURED }).pricing.required).toEqual(price({}).pricing.required);
  });

  it("scales only the base truce price, not reparations", () => {
    expect(price({ temperament: MERCHANT }).pricing.required.truce12).toBe(9 * 60);
    const fair = atWar({ tilesTakenFromAi: 1, tilesTakenByAi: 1 });
    const baseline = price({ memory: fair }).pricing.required.truce12!;
    const discount = price({ memory: fair, temperament: MERCHANT }).pricing.required.truce12!;
    expect(discount).toBeGreaterThan(baseline * 0.75);
    expect(discount).toBeLessThan(baseline);
  });

  // -10 for contested borders plus -5 crosses into Annoyed, where prices are 1.5x again.
  it("makes a Warlike neighbour colder and dearer", () => {
    const result = price({ temperament: WARLIKE });
    expect(result.opinion.modifiers).toContainEqual({ label: "Warlike temperament", value: -5 });
    expect(result.opinion.attitude).toBe("ANNOYED");
    expect(result.pricing.required.truce12).toBe(12 * 1.25 * 1.5 * 60);
  });

  it("warms a Peaceable AI enough to ally without tribute when borders don't meet", () => {
    const result = price({ temperament: PEACEABLE, bordersTouch: false });
    expect(result.opinion.attitude).toBe("PLEASED");
    expect(result.allianceRefusal).toBeUndefined();
  });

  it("weighs taken tiles by grudge, in opinion and in reparations", () => {
    const took = memory({ tilesTakenFromAi: 2 });
    const modifier = (temperament?: AiTemperament) =>
      price({ memory: took, ...(temperament ? { temperament } : {}) }).opinion.modifiers.find((entry) => entry.label.startsWith("You took"))?.value;
    expect(modifier()).toBe(-8);
    expect(modifier(VENGEFUL)).toBe(-12);
    expect(modifier(PEACEABLE)).toBe(-6);
    const peacefulBorders = { bordersTouch: false, memory: took };
    expect(price({ ...peacefulBorders, temperament: VENGEFUL }).pricing.required.truce12).toBe(3 * 60);
  });

  it("has a Warlike AI pay half as much to end a war it is losing", () => {
    const losing = atWar({ tilesTakenFromAi: 5 });
    const withCoin = { memory: losing, aiIncome: 100, aiGold: 1000 };
    expect(price(withCoin).pricing.required.truce12).toBe(-250);
    expect(price({ ...withCoin, temperament: WARLIKE }).pricing.required.truce12).toBe(-125);
  });
});

describe("AI attitude modifiers", () => {
  it("lists what drives the attitude", () => {
    const { opinion } = price({ breaksWithOthers: 2, memory: memory({ tilesTakenFromAi: 5 }) });
    expect(opinion.modifiers).toEqual([
      { label: "You recently broke truces with others", value: -20 },
      { label: "You took 5 of our tiles", value: -20 },
      { label: "Our borders are contested", value: -10 }
    ]);
    expect(opinion.attitude).toBe("FURIOUS");
  });

  it("holds a broken alliance against the breaker", () => {
    const { opinion } = price({ brokeAlliance: true, bordersTouch: false });
    expect(opinion.modifiers).toContainEqual({ label: "You broke our alliance", value: -10 });
  });
});

describe("answerDiplomacyStanceQuery", () => {
  const aiSnapshot = {
    playerId: "ai-1",
    tiles: [],
    player: { manpower: 800, manpowerCap: 1000, gold: 40, incomePerMinute: 2, strategicResources: {} },
    worldStatus: { leaderboard: { overall: [{ id: "ai-1", tiles: 100 }] } }
  } as unknown as PlayerSubscriptionSnapshot;
  const deps = {
    resolvePlayerByName: (name: string) => (name === "Milo" ? { id: "ai-1", name: "Milo" } : name === "Valka" ? { id: "p2", name: "Valka" } : undefined),
    isAutoRespondingAi: (id: string) => id === "ai-1",
    fetchAiSnapshot: async () => aiSnapshot,
    requesterSnapshot: async () => undefined,
    diplomacyContext: () => ({ requesterBrokeTruceWithAi: false, requesterTruceBreaksWithOthers: 0, requesterBrokeAllianceWithAi: false, memory: memory(), now: NOW, alliesOf: () => [] })
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
      war: { atWar: false, aiWinning: false, aiLosing: false, tilesTakenFromAi: 0, tilesTakenByAi: 0 },
      pricing: { required: { truce12: 0, truce24: 0, alliance: 92 + 24 * 60 * 2 }, aiHoldings: { gold: 40 } },
      gift: { coinPerPoint: 20, goodwillPoints: 0, maxPoints: 25 },
      temperament: { label: "Measured", traits: "No strong leanings" }
    });
  });

  it("tells the trade screen the AI's temperament and prices gifts by it", async () => {
    const merchant = { ...deps, isAutoRespondingAi: (id: string) => id === "ai-2", resolvePlayerByName: (name: string) => (name === "Sigrid" ? { id: "ai-2", name: "Sigrid" } : undefined) };
    const result = await answerDiplomacyStanceQuery(merchant, "p1", "Sigrid");
    expect(result).toEqual(expect.objectContaining({
      temperament: { label: "Merchant", traits: "Cheaper truces, gifts go further" },
      gift: expect.objectContaining({ coinPerPoint: 20 / 1.5 })
    }));
  });

  // Prices floor at 10 coin a day, which on goodwill's scale would let about 2 coin buy
  // capped goodwill, and so a free Friendly alliance on day one. Gifts keep their own floor.
  // A point is 10 minutes of the AI's own income, never under 2 coin; the player's income doesn't count.
  it("prices goodwill on the AI's own income, at least 2 coin a point", async () => {
    const richPlayer = { ...aiSnapshot, playerId: "p1", player: { ...aiSnapshot.player, incomePerMinute: 50 } } as unknown as PlayerSubscriptionSnapshot;
    const gift = async (incomePerMinute: number) => {
      const ai = { ...aiSnapshot, player: { ...aiSnapshot.player, incomePerMinute } } as unknown as PlayerSubscriptionSnapshot;
      const result = await answerDiplomacyStanceQuery({ ...deps, fetchAiSnapshot: async () => ai, requesterSnapshot: async () => richPlayer }, "p1", "Milo");
      return result.found && result.ai ? result.gift?.coinPerPoint : undefined;
    };
    expect(await gift(0)).toBe(2);
    expect(await gift(0.1)).toBe(2);
    expect(await gift(533 / 1440)).toBeCloseTo(3.7);
  });

  // The old rule priced on whichever empire earned more, so a rich player paid more.
  it("charges a rich player the same as anyone else", async () => {
    const richPlayer = { ...aiSnapshot, playerId: "p1", player: { ...aiSnapshot.player, incomePerMinute: 50 } } as unknown as PlayerSubscriptionSnapshot;
    const pricingFor = async (requesterSnapshot: () => Promise<PlayerSubscriptionSnapshot | undefined>) => {
      const result = await answerDiplomacyStanceQuery({ ...deps, requesterSnapshot }, "p1", "Milo");
      return result.found && result.ai ? result.pricing : undefined;
    };
    const unknown = await pricingFor(async () => undefined);
    expect(unknown?.required.alliance).toBeGreaterThan(0);
    expect(await pricingFor(async () => richPlayer)).toEqual(unknown);
  });

  // A display name can be shared (a human who kept an AI's name): the id the client sends wins.
  it("resolves the target by id when the client sends one", async () => {
    const byId = { ...deps, resolvePlayerById: (id: string) => (id === "ai-1" ? { id: "ai-1", name: "Milo" } : undefined) };
    expect(await answerDiplomacyStanceQuery(byId, "p1", "Valka", "ai-1")).toEqual(expect.objectContaining({ targetPlayerId: "ai-1", ai: true }));
    expect(await answerDiplomacyStanceQuery(byId, "p1", "Valka", "gone")).toEqual(expect.objectContaining({ targetPlayerId: "p2", ai: false }));
  });

  it("has nothing to predict for humans, unknown names, or yourself", async () => {
    expect(await answerDiplomacyStanceQuery(deps, "p1", "Valka")).toEqual(expect.objectContaining({ found: true, ai: false }));
    expect(await answerDiplomacyStanceQuery(deps, "p1", "Nobody")).toEqual(expect.objectContaining({ found: false }));
    expect(await answerDiplomacyStanceQuery(deps, "ai-1", "Milo")).toEqual(expect.objectContaining({ found: false }));
  });

  it("explains a losing war by the ground the AI has lost", async () => {
    const losing = memory({ lastCombatAt: NOW - HOUR, lastPlayerAttackAt: NOW - HOUR, tilesTakenFromAi: 15, tilesTakenByAi: 3 });
    const result = await answerDiplomacyStanceQuery({ ...deps, diplomacyContext: () => ({ ...deps.diplomacyContext(), memory: losing }) }, "p1", "Milo");
    expect(result).toEqual(expect.objectContaining({
      stance: expect.objectContaining({ reason: "Milo has lost 12 more tiles to you than it has taken, and wants the war over." }),
      war: { atWar: true, aiWinning: false, aiLosing: true, tilesTakenFromAi: 15, tilesTakenByAi: 3 }
    }));
  });

  // Counts fade to fractions: the sentence must use the same rounded numbers the war tally shows.
  it("words the losing reason from the same rounded counts as the war tally", async () => {
    const fading = memory({ lastCombatAt: NOW - HOUR, lastPlayerAttackAt: NOW - HOUR, tilesTakenFromAi: 2.5, tilesTakenByAi: 0.4 });
    const result = await answerDiplomacyStanceQuery({ ...deps, diplomacyContext: () => ({ ...deps.diplomacyContext(), memory: fading }) }, "p1", "Milo");
    expect(result).toEqual(expect.objectContaining({
      stance: expect.objectContaining({ reason: "Milo has lost 3 more tiles to you than it has taken, and wants the war over." }),
      war: expect.objectContaining({ tilesTakenFromAi: 3, tilesTakenByAi: 0 })
    }));
  });

  // Regression: live AI snapshots carry no world status, so every AI alliance read "can't weigh up" until
  // the season leaderboard was used for bloc sizes.
  it("sizes the alliance bloc from the season leaderboard when the AI's snapshot has none", async () => {
    const bare = { ...aiSnapshot, worldStatus: undefined } as unknown as PlayerSubscriptionSnapshot;
    const friendly = { ...deps.diplomacyContext(), memory: memory({ goodwillCoin: 100_000 }) };
    const withoutBoard = await answerDiplomacyStanceQuery({ ...deps, fetchAiSnapshot: async () => bare, diplomacyContext: () => friendly }, "p1", "Milo");
    expect(withoutBoard).toEqual(expect.objectContaining({ allianceRefusal: "Milo can't weigh up an alliance right now. Try again shortly." }));
    const withBoard = await answerDiplomacyStanceQuery(
      { ...deps, fetchAiSnapshot: async () => bare, diplomacyContext: async () => ({ ...friendly, seasonLeaderboard: [{ id: "ai-1", tiles: 100 }, { id: "p1", tiles: 40 }] }) },
      "p1",
      "Milo"
    );
    expect(withBoard).not.toHaveProperty("allianceRefusal");
    expect(withBoard).toEqual(expect.objectContaining({ pricing: expect.objectContaining({ required: expect.objectContaining({ alliance: 0 }) }) }));
  });

  it("answers without a stance when the AI can't be read", async () => {
    const result = await answerDiplomacyStanceQuery({ ...deps, fetchAiSnapshot: async () => undefined }, "p1", "Milo");
    expect(result).toEqual(expect.objectContaining({ found: true, ai: true }));
    expect(result).not.toHaveProperty("stance");
  });
});
