import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import type { DiplomacyTerms } from "@border-empires/shared";
import { createSocialState } from "../social-state/social-state.js";
import type { DiplomacySettlementResult } from "../diplomacy-settlement/diplomacy-settlement.js";
import { createResourceTradeService } from "./resource-trade-service.js";

// Playtest 2026-11-16: an offer was made, then accepting it failed with "The
// deal fell through: Too many active resource agreements." The limit is now
// checked when the offer is made and again before a fresh accept, naming
// whose limit is reached.
const terms: DiplomacyTerms = { give: { gold: 0, resources: { LUXURY_BIOTA: 1 } }, ask: { gold: 2 } };
function setup(counts: Record<string, number>) {
  const social = createSocialState({ now: () => 1, players: [{ id: "a", name: "Alden" }, { id: "b", name: "Beejac" }] });
  const settle = vi.fn(async (): Promise<DiplomacySettlementResult> => ({ ok: true }));
  const send = vi.fn(), socket = {} as WebSocket;
  const service = createResourceTradeService({ social, settlement: { settle, cancel: vi.fn() }, now: () => 1,
    isAutoRespondingAi: () => false, aiHoldings: async () => undefined, send, fanout: vi.fn(), record: () => undefined,
    supplyAgreementCount: async id => counts[id] });
  return { social, settle, send, socket, service };
}
describe("supply agreement limit on resource trades", () => {
  it("refuses an offer when the recipient is full, naming them", async () => {
    const f = setup({ a: 3, b: 16 });
    await expect(f.service.request("a", "b", terms)).resolves.toEqual({ ok: false, message: "Beejac already has 16/16 active supply agreements and can't take on another." });
    expect(f.social.resourceTradeOffers.rows(1)).toEqual([]);
  });
  it("tells the sender when their own limit is reached", async () => {
    const f = setup({ a: 16, b: 0 });
    await expect(f.service.request("a", "b", terms)).resolves.toEqual({ ok: false, message: "You already have 16/16 active supply agreements. End one to make room." });
  });
  it("refuses a fresh accept once the accepting House filled up, without paying", async () => {
    const counts: Record<string, number> = { a: 0, b: 0 };
    const f = setup(counts);
    const made = await f.service.request("a", "b", terms);
    expect(made.ok).toBe(true);
    counts.b = 16;
    await f.service.handle({ type: "RESOURCE_TRADE_ACCEPT", offerId: made.ok ? made.offerId : "" }, "b", f.socket, false);
    expect(f.settle).not.toHaveBeenCalled();
    expect(f.send).toHaveBeenCalledWith(f.socket, { type: "ERROR", code: "RESOURCE_TRADE_FAILED", message: "You already have 16/16 active supply agreements. End one to make room." });
    expect(f.social.resourceTradeOffers.rows(1)).toHaveLength(1);
  });
  it("leaves the simulation to decide when the count is unknown", async () => {
    const f = setup({});
    expect((await f.service.request("a", "b", terms)).ok).toBe(true);
  });
});
