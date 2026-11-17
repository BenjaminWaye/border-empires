import { describe, expect, it } from "vitest";
import { getPlayerTradeHoldingsRpcCall, type ProtoPlayerTradeHoldingsAck } from "./sim-client-trade-holdings.js";

const rpcAnswering = (response: ProtoPlayerTradeHoldingsAck) =>
  (_request: { player_id: string }, callback: (error: Error | null, response: ProtoPlayerTradeHoldingsAck) => void) => callback(null, response);

describe("getPlayerTradeHoldingsRpcCall", () => {
  it("parses coin and spare supply", async () => {
    await expect(getPlayerTradeHoldingsRpcCall(rpcAnswering({ ok: true, found: true, gold: 42, resource_trade_holdings_json: "{\"FOOD\":3}" }), "p2"))
      .resolves.toEqual({ gold: 42, resourceTradeHoldings: { FOOD: 3 } });
  });
  it("is undefined for an unknown player", async () => {
    await expect(getPlayerTradeHoldingsRpcCall(rpcAnswering({ ok: true, found: false }), "p2")).resolves.toBeUndefined();
  });
  it("drops a malformed supply map but keeps the coin", async () => {
    await expect(getPlayerTradeHoldingsRpcCall(rpcAnswering({ ok: true, found: true, gold: 5, resource_trade_holdings_json: "{\"FOOD\":-1}" }), "p2"))
      .resolves.toEqual({ gold: 5 });
  });
  it("rejects when the RPC is missing", async () => {
    await expect(getPlayerTradeHoldingsRpcCall(undefined, "p2")).rejects.toThrow("GetPlayerTradeHoldings RPC is unavailable");
  });
});
