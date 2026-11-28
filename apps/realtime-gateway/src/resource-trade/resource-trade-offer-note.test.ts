import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { OFFER_NOTE_REFUSED_MESSAGE, type ClientMessage } from "@border-empires/shared";
import { createSocialState } from "../social-state/social-state.js";
import { createResourceTradeService, type ResourceTradeServiceDeps } from "./resource-trade-service.js";

// First-15 round 1 owner decision: a resource trade offer can carry a short note for its recipient.
const terms = { give: { gold: 0, resources: { LUXURY_BIOTA: 1 } }, ask: { gold: 2 } };
const setup = () => {
  const social = createSocialState({ now: () => 1, players: [{ id: "a", name: "A" }, { id: "b", name: "B" }] });
  const send = vi.fn();
  const deps: ResourceTradeServiceDeps = {
    social, settlement: { settle: vi.fn(async () => ({ ok: true as const })), cancel: vi.fn(async () => ({ ok: true as const })) }, now: () => 1,
    isAutoRespondingAi: () => false, aiHoldings: async () => undefined, send, fanout: vi.fn(), record: () => undefined
  };
  return { social, send, service: createResourceTradeService(deps), socket: {} as WebSocket };
};
const requestWith = (note: string): ClientMessage => ({ type: "RESOURCE_TRADE_REQUEST", targetPlayerName: "B", targetPlayerId: "b", terms, note });

describe("resource trade offer notes", () => {
  it("stores the cleaned note on the offer both sides are sent", async () => {
    const f = setup();
    await f.service.handle(requestWith("  Biota for coin?\n<script>"), "a", f.socket, false);
    expect(f.social.resourceTradeOffers.rows(1)[0]?.note).toBe("Biota for coin? script");
  });

  it("refuses an abusive note without making the offer", async () => {
    const f = setup();
    await f.service.handle(requestWith("pay up b1tch"), "a", f.socket, false);
    expect(f.social.resourceTradeOffers.rows(1)).toEqual([]);
    expect(f.send).toHaveBeenCalledWith(f.socket, expect.objectContaining({ type: "ERROR", message: OFFER_NOTE_REFUSED_MESSAGE }));
  });
});
