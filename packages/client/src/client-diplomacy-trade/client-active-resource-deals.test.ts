import { describe, expect, it } from "vitest";
import type { ResourceSupplyAgreementStatus } from "@border-empires/shared";
import { activeResourceDealsHtml } from "./client-active-resource-deals.js";

// Review of PR #2933: the trade screen showed a pledge per day, then the active deal showed it per hour.
describe("activeResourceDealsHtml", () => {
  it("shows a coin pledge per day, as the trade screen does", () => {
    const row = { id: "d", proposerId: "me", targetId: "them", proposerCoinPerHour: 2, targetCoinPerHour: 0, proposerGives: {}, targetGives: {}, fulfilled: true, expiresAt: 10_000 } as unknown as ResourceSupplyAgreementStatus;
    const html = activeResourceDealsHtml([row], "me", "them", 0);
    expect(html).toContain("You pay up to 48 Coin/day");
    expect(html).not.toContain("Coin/hour");
  });
});
