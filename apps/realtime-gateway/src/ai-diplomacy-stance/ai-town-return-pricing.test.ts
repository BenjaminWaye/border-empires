import { describe, expect, it, vi } from "vitest";
import { evaluateAiOffer, type ReturnableTown } from "@border-empires/shared";

import { offerDiplomacyGift } from "../diplomacy-gift/diplomacy-gift-message.js";
import { createTownGiftValue } from "../diplomacy-gift/town-gift-value.js";
import { parseReturnableTowns } from "../sim-client/sim-client-trade-holdings.js";
import { computeAiOpinion } from "./ai-diplomacy-opinion.js";
import { aiDiplomacyPricing, goodwillIncomePerHour } from "./ai-diplomacy-pricing.js";
import { HOUR, memory, NOW } from "./ai-diplomacy-pricing-test-helpers.js";
import { AI_TEMPERAMENTS } from "./ai-diplomacy-temperament.js";
import { aiTownReturnValue } from "./ai-town-return-value.js";
import type { AiWarOutlook } from "./ai-war-outlook.js";
import { answerDiplomacyStanceQuery } from "./diplomacy-stance-query.js";

// "Return a town": an AI values getting its own town back, and a returned
// town buys the truce it otherwise refuses while it can still retake land.
const oak: ReturnableTown = { x: 4, y: 4, toPlayerId: "ai-1", tier: "TOWN", goldPerMinute: 1, capturedAt: NOW - HOUR };
const elsewhere: ReturnableTown = { ...oak, x: 9, toPlayerId: "ai-2" };
// At war (fought an hour ago), the player's last attack outside the 30 min window.
const atWar = memory({ lastCombatAt: NOW - HOUR, lastPlayerAttackAt: NOW - 2 * HOUR });

const price = (options: { outlook?: AiWarOutlook; towns?: ReturnableTown[]; brokeTruce?: boolean } = {}) => {
  const opinion = computeAiOpinion({
    stanceKind: "WARY", memory: atWar, requesterBrokeTruceWithAi: options.brokeTruce ?? false, requesterTruceBreaksWithOthers: 0,
    requesterBrokeAllianceWithAi: false, bordersTouch: true, incomePerHour: goodwillIncomePerHour(1), now: NOW
  });
  return aiDiplomacyPricing({
    aiName: "Milo", stanceKind: "WARY", opinion, memory: atWar, bordersTouch: true, aiIncomePerMinute: 1, aiHoldings: { gold: 0 },
    requesterBrokeTruceWithAi: options.brokeTruce ?? false, aiWouldLeadAlliance: true, aiPlayerId: "ai-1",
    ...(options.outlook ? { outlook: options.outlook } : {}), ...(options.towns ? { returnableTowns: options.towns } : {}), now: NOW
  });
};

describe("AI valuation of a returned town", () => {
  it("is a day of the town's income plus its size and one tile of reparations in the AI's income", () => {
    // 1 coin/min x 24h + (4h for a TOWN + 1h reparations) x 1 coin/min.
    expect(aiTownReturnValue(oak, 1, AI_TEMPERAMENTS.MEASURED, 1)).toBe(1_440 + 300);
    expect(aiTownReturnValue(oak, 1, AI_TEMPERAMENTS.VENGEFUL, 1)).toBe(1_440 + 450);
  });

  it("prices only its own towns, and counts them toward a truce", () => {
    const { pricing } = price({ towns: [oak, elsewhere] });
    expect(pricing.townValues).toEqual([{ x: 4, y: 4, value: 1_740 }]);
    const required = pricing.required.truce12!;
    expect(evaluateAiOffer(pricing, "truce", 12, { give: { gold: Math.max(0, required - 1_740), towns: [{ x: 4, y: 4 }] }, ask: { gold: 0 } })).toEqual({ accepts: true });
  });
});

describe("a returned town lifts the retake refusal", () => {
  it("refuses a truce while it can retake its land, but names a price for its town back", () => {
    const result = price({ outlook: { kind: "RETAKE_NOW" }, towns: [oak] });
    expect(result.truceRefusal).toContain("It would make peace for the town you took back.");
    expect(result.pricing.required.truce12).toBeNull();
    expect(result.pricing.townReturn?.truce12).toBeGreaterThan(0);
    expect(evaluateAiOffer(result.pricing, "truce", 12, { give: { gold: 500 }, ask: { gold: 0 } })).toEqual({ accepts: false, reason: "refuses" });
    const topUp = Math.max(0, result.pricing.townReturn!.truce12! - 1_740);
    expect(evaluateAiOffer(result.pricing, "truce", 12, { give: { gold: topUp, towns: [{ x: 4, y: 4 }] }, ask: { gold: 0 } })).toEqual({ accepts: true });
  });

  it("has nothing to offer without a town of its own, and a betrayed AI won't deal at all", () => {
    expect(price({ outlook: { kind: "RETAKE_NOW" }, towns: [elsewhere] }).pricing.townReturn).toBeUndefined();
    expect(price({ outlook: { kind: "RETAKE_NOW" } }).pricing.townReturn).toBeUndefined();
  });
});

describe("returnable towns over the wire", () => {
  it("parses the simulation's list, dropping malformed entries", () => {
    expect(parseReturnableTowns(JSON.stringify([oak, { x: "bad" }]))).toEqual([oak]);
    expect(parseReturnableTowns("not json")).toEqual([]);
  });

  it("lists in the stance reply only the towns taken from that target", async () => {
    const reply = await answerDiplomacyStanceQuery({
      resolvePlayerByName: (name) => (name === "Konrad" ? { id: "ai-1", name: "Konrad" } : undefined),
      isAutoRespondingAi: () => false,
      fetchAiSnapshot: async () => undefined,
      requesterSnapshot: async () => undefined,
      diplomacyContext: () => { throw new Error("not used"); },
      returnableTowns: async () => [oak, elsewhere]
    }, "p1", "Konrad");
    expect(reply.returnableTowns).toEqual([oak]);
  });

  it("gives a town back as a gift, valued as goodwill before it moves", async () => {
    const settle = vi.fn(async () => ({ ok: true as const }));
    const recordPayment = vi.fn();
    const result = await offerDiplomacyGift({
      resolvePlayerByName: () => undefined, resolvePlayerById: () => ({ id: "ai-1", name: "Elin" }), isAutoRespondingAi: () => true,
      settle, recordPayment, recordGatewayEvent: vi.fn(), giftsInFlight: new Set(),
      townGiftValue: createTownGiftValue({ returnableTownsOf: async () => [oak], aiIncomePerMinute: async () => 1 })
    }, "me", { targetPlayerName: "Elin", targetPlayerId: "ai-1", gift: { gold: 0, towns: [{ x: 4, y: 4 }] } }, { isGuest: false });
    expect(settle).toHaveBeenCalledWith({ proposerId: "me", targetId: "ai-1", terms: { give: { gold: 0, towns: [{ x: 4, y: 4 }] }, ask: { gold: 0 } } });
    expect(recordPayment).toHaveBeenCalledWith("ai-1", "me", 1_740);
    expect(result.message).toBe("You gave Elin the return of the town at (4, 4) as a gift.");
  });
});

describe("reading returnable towns for AI replies", () => {
  it("lists none, and records it, when the simulation is slow or fails", async () => {
    const { createReturnableTownsRead } = await import("./returnable-towns-read.js");
    const recordGatewayEvent = vi.fn();
    const slow = createReturnableTownsRead({ getPlayerTradeHoldings: () => new Promise(() => undefined), recordGatewayEvent, timeoutMs: 10 });
    expect(await slow("p1")).toEqual([]);
    const failing = createReturnableTownsRead({ getPlayerTradeHoldings: async () => { throw new Error("down"); }, recordGatewayEvent });
    expect(await failing("p1")).toEqual([]);
    expect(recordGatewayEvent.mock.calls.map((call) => call[2])).toEqual([{ playerId: "p1", reason: "timeout" }, { playerId: "p1", reason: "error" }]);
    const ok = createReturnableTownsRead({ getPlayerTradeHoldings: async () => ({ gold: 0, activeSupplyAgreements: 0, returnableTowns: [oak] }), recordGatewayEvent });
    expect(await ok("p1")).toEqual([oak]);
  });
});
