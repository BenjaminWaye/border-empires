// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResourceSupplyAgreementStatus } from "@border-empires/shared";

import { closeDiplomacyTradeScreen, openDiplomacyTradeScreen } from "./client-diplomacy-trade.js";
import { RESOURCE_END_CONFIRM_MIN_MS, RESOURCE_END_CONFIRM_RESET_MS } from "./client-resource-end-confirm.js";

const agreement: ResourceSupplyAgreementStatus = {
  id: "diplomacy-settle:resource-trade:offer-1", proposerId: "ai-1", targetId: "me",
  proposerGives: { FOOD: 1 }, targetGives: {}, startedAt: Date.now(), expiresAt: Date.now() + 7 * 86_400_000, fulfilled: true
};

const openWithAgreement = () => {
  const send = vi.fn().mockReturnValue(true);
  openDiplomacyTradeScreen(
    { targetName: "Milo", targetPlayerId: "ai-1", kind: "trade", durationHours: 12 },
    { send, ownHoldings: () => ({ gold: 100 }), activeSupply: () => ({ ownId: "me", agreements: [agreement] }) }
  );
  const end = () => document.querySelector<HTMLButtonElement>("[data-resource-end]")!;
  const endCalls = () => send.mock.calls.filter(([payload]) => (payload as { type: string }).type === "RESOURCE_TRADE_END");
  return { end, endCalls };
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
    expect(end().textContent).toBe("Tap again to end supply");
    vi.advanceTimersByTime(RESOURCE_END_CONFIRM_MIN_MS);
    end().click();
    expect(endCalls()).toEqual([[{ type: "RESOURCE_TRADE_END", agreementId: agreement.id }, expect.any(String)]]);
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
