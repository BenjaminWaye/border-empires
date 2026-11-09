import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import type { ClientMessage } from "@border-empires/shared";
import { createSocialState } from "../social-state/social-state.js";
import type { DiplomacySettlementResult } from "../diplomacy-settlement/diplomacy-settlement.js";
import { createResourceTradeService } from "./resource-trade-service.js";
import { attackPairFromSimulationEvent } from "./attack-offer-withdrawal.js";

const terms = { give: { gold: 0, resources: { FOOD: 1 } }, ask: { gold: 2 } };
const offer = (to: string): ClientMessage => ({ type: "RESOURCE_TRADE_REQUEST", targetPlayerName: to.toUpperCase(), targetPlayerId: to, terms });

describe("attacks withdraw pending resource offers", () => {
  it("withdraws offers between the pair in both directions and keeps other offers", async () => {
    const social = createSocialState({ now: () => 1, players: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }] });
    const fanout = vi.fn(), socket = {} as WebSocket;
    const service = createResourceTradeService({ social, now: () => 1, isAutoRespondingAi: () => false,
      settlement: { settle: async (): Promise<DiplomacySettlementResult> => ({ ok: true }), cancel: async (): Promise<DiplomacySettlementResult> => ({ ok: true }) },
      aiHoldings: async () => undefined, send: vi.fn(), fanout, record: () => undefined });
    await service.handle(offer("b"), "a", socket, false);
    await service.handle(offer("a"), "b", socket, false);
    await service.handle(offer("c"), "a", socket, false);
    fanout.mockClear();
    expect(service.withdrawOffersBetween("b", "a")).toBe(2);
    expect(social.resourceTradeOffers.rows(1).map(row => [row.fromPlayerId, row.toPlayerId])).toEqual([["a", "c"]]);
    expect(fanout).toHaveBeenCalledOnce();
    expect(service.withdrawOffersBetween("a", "b")).toBe(0);
  });

  it("reads the House pair from an accepted ATTACK and from a resolved combat, never barbarians", () => {
    expect(attackPairFromSimulationEvent({ eventType: "COMMAND_ACCEPTED", actionType: "ATTACK", playerId: "a", combatResult: { defenderOwnerId: "b" } }))
      .toEqual({ attackerId: "a", defenderId: "b" });
    expect(attackPairFromSimulationEvent({ eventType: "COMMAND_ACCEPTED", actionType: "EXPAND", playerId: "a", combatResult: { defenderOwnerId: "b" } })).toBeUndefined();
    expect(attackPairFromSimulationEvent({ eventType: "COMMAND_ACCEPTED", actionType: "ATTACK", playerId: "a", combatResult: { defenderOwnerId: "barbarian-1" } })).toBeUndefined();
    expect(attackPairFromSimulationEvent({ eventType: "COMMAND_ACCEPTED", actionType: "ATTACK", playerId: "barbarian-1", combatResult: { defenderOwnerId: "b" } })).toBeUndefined();
    expect(attackPairFromSimulationEvent({ eventType: "COMBAT_RESOLVED", playerId: "a", combatResult: { defenderOwnerId: "b" } }))
      .toEqual({ attackerId: "a", defenderId: "b" });
  });
});
