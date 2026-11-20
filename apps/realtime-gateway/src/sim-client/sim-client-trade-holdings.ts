import { ResourceSupplyOfferSchema, ReturnableTownSchema, type DiplomacyGoods, type ReturnableTown } from "@border-empires/shared";

// GetPlayerTradeHoldings: a player's coin, spare supply and active supply
// agreement count, for the deal screen's other side. Asked for every human
// target, online or not (see diplomacy-stance-query.ts). Extracted from
// sim-client.ts, which is over the 500-line file budget.
// See apps/simulation/src/player-trade-holdings/player-trade-holdings.ts.
export type ProtoPlayerTradeHoldingsAck = {
  ok: boolean;
  found?: boolean;
  gold?: number;
  resource_trade_holdings_json?: string;
  resourceTradeHoldingsJson?: string;
  active_supply_agreements?: number;
  activeSupplyAgreements?: number;
  returnable_towns_json?: string;
  returnableTownsJson?: string;
};
export type GetPlayerTradeHoldingsRpc = (
  request: { player_id: string },
  options: { deadline: number },
  callback: (error: Error | null, response: ProtoPlayerTradeHoldingsAck) => void
) => void;

/**
 * Matches the stance reply's own wait (HUMAN_TRADE_STATE_TIMEOUT_MS), so a call
 * the gateway stopped waiting for is cancelled instead of queueing behind a
 * stalled simulation.
 */
export const TRADE_HOLDINGS_RPC_DEADLINE_MS = 1_500;

export type PlayerTradeHoldingsResult = {
  gold: number;
  resourceTradeHoldings?: DiplomacyGoods["resources"];
  activeSupplyAgreements: number;
  /** Towns this player could hand back in a deal (simulation returnable-towns.ts). */
  returnableTowns?: ReturnableTown[];
};

/** Malformed entries are dropped one by one: one bad town never hides the others. */
export const parseReturnableTowns = (json: string | undefined): ReturnableTown[] => {
  if (!json) return [];
  try {
    const raw: unknown = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((entry) => {
      const parsed = ReturnableTownSchema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    });
  } catch {
    return [];
  }
};

const parseHoldings = (json: string | undefined): DiplomacyGoods["resources"] | undefined => {
  if (!json) return undefined;
  try {
    const parsed = ResourceSupplyOfferSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

const finiteOrZero = (value: number | undefined): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

export const getPlayerTradeHoldingsRpcCall = (
  rpc: GetPlayerTradeHoldingsRpc | undefined,
  playerId: string,
  now: () => number = Date.now
): Promise<PlayerTradeHoldingsResult | undefined> =>
  new Promise((resolve, reject) => {
    if (!rpc) {
      reject(new Error("simulation client GetPlayerTradeHoldings RPC is unavailable"));
      return;
    }
    rpc({ player_id: playerId }, { deadline: now() + TRADE_HOLDINGS_RPC_DEADLINE_MS }, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      if (!response.found) {
        resolve(undefined);
        return;
      }
      const resourceTradeHoldings = parseHoldings(response.resource_trade_holdings_json ?? response.resourceTradeHoldingsJson);
      const returnableTowns = parseReturnableTowns(response.returnable_towns_json ?? response.returnableTownsJson);
      resolve({
        gold: finiteOrZero(response.gold),
        ...(resourceTradeHoldings ? { resourceTradeHoldings } : {}),
        activeSupplyAgreements: finiteOrZero(response.active_supply_agreements ?? response.activeSupplyAgreements),
        ...(returnableTowns.length > 0 ? { returnableTowns } : {})
      });
    });
  });
