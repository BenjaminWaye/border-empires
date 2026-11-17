import { describe, expect, it } from "vitest";
import { handleGetPlayerTradeHoldings, playerTradeHoldingsForRuntime } from "./player-trade-holdings.js";

// The deal screen's other side for an offline player: coin and spare supply
// without a full SubscribePlayer snapshot.
const ctx = {
  players: new Map([["p2", { points: 120.5 }]]),
  supplyStateForPlayer: (id: string) => (id === "p2" ? { resourceTradeHoldings: { FOOD: 3 } } : {})
};

describe("GetPlayerTradeHoldings", () => {
  it("reads a player's coin and spare supply", () => {
    expect(playerTradeHoldingsForRuntime(ctx, "p2")).toEqual({ gold: 120.5, resourceTradeHoldings: { FOOD: 3 } });
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
      { ok: true, found: true, gold: 120.5, resource_trade_holdings_json: JSON.stringify({ FOOD: 3 }) }
    ]);
  });
});
