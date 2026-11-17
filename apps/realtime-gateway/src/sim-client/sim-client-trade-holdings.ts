import { ResourceSupplyOfferSchema, type DiplomacyGoods } from "@border-empires/shared";

// GetPlayerTradeHoldings: a player's coin and spare supply, for the deal
// screen's other side when that player has no live cached snapshot (offline).
// See apps/simulation/src/player-trade-holdings/player-trade-holdings.ts.
export type ProtoPlayerTradeHoldingsAck = {
  ok: boolean;
  found?: boolean;
  gold?: number;
  resource_trade_holdings_json?: string;
  resourceTradeHoldingsJson?: string;
};
export type GetPlayerTradeHoldingsRpc = (
  request: { player_id: string },
  callback: (error: Error | null, response: ProtoPlayerTradeHoldingsAck) => void
) => void;

/** Holdings in the gateway's wire shape; undefined when the simulation doesn't know the player. */
export type PlayerTradeHoldingsResult = { gold: number; resourceTradeHoldings?: DiplomacyGoods["resources"] };

const parseHoldings = (json: string | undefined): DiplomacyGoods["resources"] | undefined => {
  if (!json) return undefined;
  try {
    const parsed = ResourceSupplyOfferSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

export const getPlayerTradeHoldingsRpcCall = (rpc: GetPlayerTradeHoldingsRpc | undefined, playerId: string): Promise<PlayerTradeHoldingsResult | undefined> =>
  new Promise((resolve, reject) => {
    if (!rpc) {
      reject(new Error("simulation client GetPlayerTradeHoldings RPC is unavailable"));
      return;
    }
    rpc({ player_id: playerId }, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      if (!response.found) {
        resolve(undefined);
        return;
      }
      const resourceTradeHoldings = parseHoldings(response.resource_trade_holdings_json ?? response.resourceTradeHoldingsJson);
      resolve({ gold: Number(response.gold ?? 0), ...(resourceTradeHoldings ? { resourceTradeHoldings } : {}) });
    });
  });
