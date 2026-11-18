import { describe, expect, it } from "vitest";
import { handleGetPlayerTradeHoldings, playerTradeHoldingsForRuntime } from "./player-trade-holdings.js";

// The deal screen's other side for an offline player: coin and spare supply
// without a full SubscribePlayer snapshot.
const agreement = (id: string, expiresAt: number) => ({ id, proposerId: "p2", targetId: "p3", proposerGives: { FOOD: 1 }, targetGives: {}, startedAt: 0, expiresAt, fulfilled: true });
const ctx = {
  players: new Map([["p2", { points: 120.5 }]]),
  supplyStateForPlayer: (id: string) => (id === "p2" ? { resourceTradeHoldings: { FOOD: 3 }, resourceTradeAgreements: [agreement("a", 2_000), agreement("b", 500)] } : {}),
  now: () => 1_000
};

describe("GetPlayerTradeHoldings", () => {
  it("reads a player's coin, spare supply and active agreements (expired ones not counted)", () => {
    expect(playerTradeHoldingsForRuntime(ctx, "p2")).toEqual({ gold: 120.5, resourceTradeHoldings: { FOOD: 3 }, activeSupplyAgreements: 1 });
  });
  it("is undefined for an unknown player", () => {
    expect(playerTradeHoldingsForRuntime(ctx, "nobody")).toBeUndefined();
  });
  it("answers found:false or the holdings over gRPC", () => {
    const runtime = { getPlayerTradeHoldings: (id: string) => playerTradeHoldingsForRuntime(ctx, id) };
    const responses: unknown[] = [];
    handleGetPlayerTradeHoldings(runtime, { request: { player_id: "nobody" } }, (_error, response) => responses.push(response));
    handleGetPlayerTradeHoldings(runtime, { request: { player_id: "p2" } }, (_error, response) => responses.push(response));
    expect(responses).toEqual([
      { ok: true, found: false },
      { ok: true, found: true, gold: 120.5, resource_trade_holdings_json: JSON.stringify({ FOOD: 3 }), active_supply_agreements: 1 }
    ]);
  });
  it("reports a lookup that throws as a gRPC error instead of escaping the handler", () => {
    const runtime = { getPlayerTradeHoldings: () => { throw new Error("boom"); } };
    const errors: Array<Error | null> = [];
    handleGetPlayerTradeHoldings(runtime, { request: { player_id: "p2" } }, (error) => errors.push(error));
    expect(errors.map(error => error?.message)).toEqual(["boom"]);
  });
});
