import { describe, expect, it } from "vitest";
import { getPlayerTradeHoldingsRpcCall, TRADE_HOLDINGS_RPC_DEADLINE_MS, type ProtoPlayerTradeHoldingsAck } from "./sim-client-trade-holdings.js";

const rpcAnswering = (response: ProtoPlayerTradeHoldingsAck, seen: Array<{ deadline: number }> = []) =>
  (_request: { player_id: string }, options: { deadline: number }, callback: (error: Error | null, response: ProtoPlayerTradeHoldingsAck) => void) => {
    seen.push(options);
    callback(null, response);
  };

describe("getPlayerTradeHoldingsRpcCall", () => {
  it("parses coin, spare supply and the agreement count", async () => {
    const response = { ok: true, found: true, gold: 42, resource_trade_holdings_json: "{\"FOOD\":3}", active_supply_agreements: 16 };
    await expect(getPlayerTradeHoldingsRpcCall(rpcAnswering(response), "p2")).resolves.toEqual({ gold: 42, resourceTradeHoldings: { FOOD: 3 }, activeSupplyAgreements: 16 });
  });
  it("sends a deadline so an abandoned call is cancelled", async () => {
    const seen: Array<{ deadline: number }> = [];
    await getPlayerTradeHoldingsRpcCall(rpcAnswering({ ok: true, found: false }, seen), "p2", () => 5_000);
    expect(seen).toEqual([{ deadline: 5_000 + TRADE_HOLDINGS_RPC_DEADLINE_MS }]);
  });
  it("is undefined for an unknown player", async () => {
    await expect(getPlayerTradeHoldingsRpcCall(rpcAnswering({ ok: true, found: false }), "p2")).resolves.toBeUndefined();
  });
  it("drops a malformed supply map and non-finite numbers", async () => {
    const response = { ok: true, found: true, gold: Number.NaN, resource_trade_holdings_json: "{\"FOOD\":-1}" };
    await expect(getPlayerTradeHoldingsRpcCall(rpcAnswering(response), "p2")).resolves.toEqual({ gold: 0, activeSupplyAgreements: 0 });
  });
  it("rejects when the RPC is missing", async () => {
    await expect(getPlayerTradeHoldingsRpcCall(undefined, "p2")).rejects.toThrow("GetPlayerTradeHoldings RPC is unavailable");
  });
});
