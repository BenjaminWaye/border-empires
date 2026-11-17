import { describe, expect, it } from "vitest";
import type { ResourceSupplyAgreementStatus, ResourceTradeOffer } from "@border-empires/shared";
import { explainActionFailureFromServer } from "../client-player-actions.js";
import { offerDockEntries } from "../client-diplomacy-offer-dock/client-diplomacy-offer-dock.js";
import { tradeVerdict, type TradeSelection } from "./client-diplomacy-trade-view.js";
import { resourceOfferCardsHtml } from "./client-resource-offer-cards.js";
import { ownSupplyAgreementCount, supplyAgreementUsageHtml } from "./client-supply-agreement-limit.js";

// Playtest 2026-11-16: accepting a trade failed with "The deal fell through:
// Too many active resource agreements." with no warning that the limit was
// near. The client now shows the count and blocks Accept / Send at 16/16.
const FULL = "You already have 16/16 active supply agreements. End one to make room.";
const agreements = (count: number, expiresAt?: number): ResourceSupplyAgreementStatus[] => Array.from({ length: count }, (_, i) => ({
  id: `deal-${i}`, proposerId: "me", targetId: `p-${i}`, proposerGives: { FOOD: 1 }, targetGives: {}, startedAt: 0, fulfilled: true,
  ...(expiresAt === undefined ? {} : { expiresAt })
}));
const supplyTerms = { give: { gold: 0 }, ask: { gold: 0, resources: { FOOD: 1 } } };

describe("supply agreement limit in the client", () => {
  it("counts only your agreements that have not run out", () => {
    expect(ownSupplyAgreementCount([...agreements(3), ...agreements(2, 50)], "me", 100)).toBe(3);
  });
  it("shows usage, highlighting near and at the limit", () => {
    expect(supplyAgreementUsageHtml(5)).toContain("Supply agreements in use: 5/16<");
    expect(supplyAgreementUsageHtml(14)).toContain('data-tone="warn"');
    expect(supplyAgreementUsageHtml(16)).toContain("Full: end one to make a new deal");
  });
  it("disables Accept on an incoming resource offer with the reason", () => {
    const offer: ResourceTradeOffer = { id: "o1", fromPlayerId: "them", toPlayerId: "me", fromPlayerName: "Beejac", toPlayerName: "Me",
      terms: supplyTerms, createdAt: 0, expiresAt: 1_000, status: "pending" };
    const html = resourceOfferCardsHtml([offer], "me", "them", FULL);
    expect(html).toContain(`Can't accept: ${FULL}`);
    expect(html).toMatch(/data-resource-offer-accept="o1" disabled/);
    expect(resourceOfferCardsHtml([offer], "me", "them")).not.toContain("disabled");
  });
  it("blocks sending a deal with resource supply at the limit", () => {
    const selection: TradeSelection = { kind: "trade", durationHours: 12, terms: { give: { gold: 0, resources: { FOOD: 1 } }, ask: { gold: 5 } } };
    const verdict = tradeVerdict({ targetName: "Beejac", reply: undefined, selection, own: { gold: 0, resources: { FOOD: 5 } }, cooldownRemainingMs: 0, ownSupplyAgreements: 16 });
    expect(verdict).toMatchObject({ tone: "bad", text: FULL, canSend: false });
    // Shown even when also short of goods: more goods wouldn't help.
    expect(tradeVerdict({ targetName: "Beejac", reply: undefined, selection, own: { gold: 0, resources: {} }, cooldownRemainingMs: 0, ownSupplyAgreements: 16 }).text).toBe(FULL);
  });
  // Playtest 2026-11-17: the refusal showed as "Error RESOURCE_TRADE_FAILED: Astrid already has…", and only after Send.
  it("warns before sending supply to a House reported as full, naming them, without blocking", () => {
    const selection: TradeSelection = { kind: "trade", durationHours: 12, terms: { give: { gold: 0, resources: { FOOD: 1 } }, ask: { gold: 5 } } };
    const reply = { found: true as const, targetPlayerName: "Astrid", targetPlayerId: "p2", ai: false as const, supplyAgreementsFull: true as const };
    const verdict = (s: TradeSelection) => tradeVerdict({ targetName: "Astrid", reply, selection: s, own: { gold: 10, resources: { FOOD: 5 } }, cooldownRemainingMs: 0, ownSupplyAgreements: 3 });
    // The flag is from when the screen opened: warn, but let the server decide in case one of theirs ended since.
    expect(verdict(selection)).toMatchObject({ tone: "bad", canSend: true,
      text: "Astrid already has 16/16 active supply agreements and can't take on another. The offer will be refused unless one of theirs ends first." });
    // A deal without resource supply is unaffected.
    expect(verdict({ kind: "truce", durationHours: 12, terms: { give: { gold: 5 }, ask: { gold: 0 } } }).text).not.toContain("16/16");
  });
  it("shows a resource trade refusal without the raw error code", () => {
    expect(explainActionFailureFromServer("RESOURCE_TRADE_FAILED", "Astrid already has 16/16 active supply agreements and can't take on another."))
      .toBe("Astrid already has 16/16 active supply agreements and can't take on another.");
  });
  it("blocks accepting a truce that adds resource supply in the offer dock", () => {
    const truce = { id: "t1", fromPlayerId: "them", toPlayerId: "me", createdAt: 0, expiresAt: 300_000, durationHours: 12 as const, fromName: "Beejac", terms: supplyTerms };
    const state = { me: "me", incomingAllianceRequests: [], incomingTruceRequests: [truce], gold: 100, resourceTradeHoldings: { FOOD: 5 } };
    expect(offerDockEntries({ ...state, resourceTradeAgreements: agreements(16) }, new Map(), new Set(), 0, () => undefined)[0]?.blockedReason).toBe(FULL);
    expect(offerDockEntries({ ...state, resourceTradeAgreements: agreements(15) }, new Map(), new Set(), 0, () => undefined)[0]?.blockedReason).toBeUndefined();
  });
});
