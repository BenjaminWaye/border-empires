// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResourceSupplyAgreementStatus } from "@border-empires/shared";

import { closeDiplomacyTradeScreen, openDiplomacyTradeScreen } from "./client-diplomacy-trade.js";
import { RESOURCE_END_ARMED_LABEL, RESOURCE_END_CONFIRM_MIN_MS, RESOURCE_END_CONFIRM_RESET_MS } from "./client-resource-end-confirm.js";

// Deals with a term are binding and show no End supply button; only an open-ended agreement saved before terms can be ended.
const agreement: ResourceSupplyAgreementStatus = {
  id: "diplomacy-settle:resource-trade:offer-1", proposerId: "ai-1", targetId: "me",
  proposerGives: { FOOD: 1 }, targetGives: {}, startedAt: Date.now(), fulfilled: true
};

const openWithAgreement = () => {
  const send = vi.fn().mockReturnValue(true);
  let gold = 100;
  openDiplomacyTradeScreen(
    { targetName: "Milo", targetPlayerId: "ai-1", kind: "trade", durationHours: 12 },
    { send, ownHoldings: () => ({ gold }), activeSupply: () => ({ ownId: "me", agreements: [agreement] }) }
  );
  const end = () => document.querySelector<HTMLButtonElement>("[data-resource-end]")!;
  const endCalls = () => send.mock.calls.filter(([payload]) => (payload as { type: string }).type === "RESOURCE_TRADE_END");
  return { end, endCalls, earn: () => { gold += 1; } };
};

describe("ending a resource supply", () => {
  afterEach(() => {
    closeDiplomacyTradeScreen();
    vi.useRealTimers();
  });

  // Regression: accepting re-renders the offer as "End supply" in the same spot, so a
  // double-tap on "Accept trade" ended the paid-for supply at once.
  it("ignores a double-tap and needs a separate confirming tap", () => {
    vi.useFakeTimers();
    const { end, endCalls } = openWithAgreement();
    end().click();
    end().click();
    expect(endCalls()).toHaveLength(0);
    expect(end().textContent).toBe(RESOURCE_END_ARMED_LABEL);
    vi.advanceTimersByTime(RESOURCE_END_CONFIRM_MIN_MS);
    end().click();
    expect(endCalls()).toEqual([[{ type: "RESOURCE_TRADE_END", agreementId: agreement.id }, expect.any(String)]]);
  });

  // The screen rebuilds its cards each second while coin ticks in; that must not disarm End.
  it("stays armed across the screen's re-renders", () => {
    vi.useFakeTimers();
    const { end, endCalls, earn } = openWithAgreement();
    const first = end();
    first.click();
    earn();
    vi.advanceTimersByTime(1_000);
    expect(end()).not.toBe(first);
    expect(end().textContent).toBe(RESOURCE_END_ARMED_LABEL);
    end().click();
    expect(endCalls()).toHaveLength(1);
  });

  it("disarms when the confirming tap never comes", () => {
    vi.useFakeTimers();
    const { end, endCalls } = openWithAgreement();
    end().click();
    vi.advanceTimersByTime(RESOURCE_END_CONFIRM_RESET_MS);
    expect(end().textContent).toBe("End supply");
    end().click();
    expect(endCalls()).toHaveLength(0);
  });
});
