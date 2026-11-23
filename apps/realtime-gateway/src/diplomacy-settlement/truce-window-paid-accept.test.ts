// Review regression (PR #2936): a new truce runs from its offer, so a paid
// accept must not record a truce whose window has closed. The free path was
// guarded; paid accepts skipped the check while their settlement lock was held.
import { describe, expect, it, vi } from "vitest";

import { buildGatewaySocialState } from "../gateway-app/build-social-state-sink.js";
import { InMemoryGatewaySocialStore } from "../social-store/social-store.js";
import { createDiplomacyOfferAcceptance } from "./diplomacy-offer-acceptance.js";
import type { DiplomacySettlementInput, DiplomacySettlementResult } from "./diplomacy-settlement.js";

const HOUR = 3_600_000;
const players = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
const terms = { give: { gold: 7 }, ask: { gold: 0 } };

describe("paid truce accepts and the offer's window", () => {
  it("refuses a paid offer whose window closed before anything is paid, even with a stale stored expiry", async () => {
    const store = new InMemoryGatewaySocialStore();
    store.saveTruceRequest({ id: "old", fromPlayerId: "a", toPlayerId: "b", durationHours: 12, createdAt: 0, expiresAt: 7 * 24 * HOUR, terms });
    const social = buildGatewaySocialState(store, store.loadSnapshot(), players, () => 13 * HOUR);
    const settle = vi.fn(async (input: DiplomacySettlementInput): Promise<DiplomacySettlementResult> => ({ ok: true, settlementId: input.commandId }));
    const accept = createDiplomacyOfferAcceptance({ socialState: social, settlement: { settle }, recordGatewayEvent: () => undefined });
    expect(await accept.acceptTruce("b", "old")).toMatchObject({ ok: false, code: "TRUCE_REQUEST_INVALID" });
    expect(settle).not.toHaveBeenCalled();
    expect(social.snapshotForPlayer("a").activeTruces).toEqual([]);
  });

  it("refunds a paid accept whose window closes while the payment settles", async () => {
    const store = new InMemoryGatewaySocialStore();
    let clock = 1_000;
    const social = buildGatewaySocialState(store, store.loadSnapshot(), players, () => clock);
    social.requestTruce("a", "B", 12, { terms });
    const id = social.snapshotForPlayer("b").incomingTruceRequests[0]!.id;
    clock += 12 * HOUR - 1_000;
    const settle = vi.fn(async (input: DiplomacySettlementInput): Promise<DiplomacySettlementResult> => {
      if (!input.refund) clock += 5_000;
      return { ok: true, settlementId: input.commandId };
    });
    const accept = createDiplomacyOfferAcceptance({ socialState: social, settlement: { settle }, recordGatewayEvent: () => undefined });
    expect((await accept.acceptTruce("b", id)).ok).toBe(false);
    expect(settle).toHaveBeenLastCalledWith(expect.objectContaining({ refund: true }));
    expect(social.snapshotForPlayer("a").activeTruces).toEqual([]);
  });

  it("logs the hours a late-accepted truce actually runs", () => {
    const store = new InMemoryGatewaySocialStore();
    let clock = 0;
    const social = buildGatewaySocialState(store, store.loadSnapshot(), players, () => clock);
    social.requestTruce("a", "B", 24);
    const id = social.snapshotForPlayer("b").incomingTruceRequests[0]!.id;
    clock = 18 * HOUR;
    expect(social.acceptTruce("b", id).ok).toBe(true);
    const started = store.loadSnapshot().diplomacyHistory?.find((row) => row.event === "TRUCE_STARTED");
    expect(started).toMatchObject({ durationHours: 6, endsAt: 24 * HOUR });
  });
});
