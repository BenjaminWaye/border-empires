// GetPlayerTradeHoldings: a player's coin, spare supply slots and active supply
// agreement count, for the deal screen's other side. The gateway asks this for
// every human target, online or not, so the stance reply's amounts, its "supply
// agreements full" flag and its timing never reveal whether a House is logged
// in. An O(1)-ish lookup: no SubscribePlayer snapshot is built.
import { activeSupplyAgreementCount, type ResourceSupplyPlayerState } from "@border-empires/shared";

export type PlayerTradeHoldings = {
  gold: number;
  resourceTradeHoldings?: ResourceSupplyPlayerState["resourceTradeHoldings"];
  activeSupplyAgreements: number;
};

export type PlayerTradeHoldingsContext = {
  players: ReadonlyMap<string, { points: number }>;
  supplyStateForPlayer: (id: string) => Partial<Pick<ResourceSupplyPlayerState, "resourceTradeHoldings" | "resourceTradeAgreements">>;
  now: () => number;
};

export const playerTradeHoldingsForRuntime = (ctx: PlayerTradeHoldingsContext, playerId: string): PlayerTradeHoldings | undefined => {
  const player = ctx.players.get(playerId);
  if (!player) return undefined;
  const supply = ctx.supplyStateForPlayer(playerId);
  return {
    gold: player.points,
    ...(supply.resourceTradeHoldings ? { resourceTradeHoldings: supply.resourceTradeHoldings } : {}),
    activeSupplyAgreements: activeSupplyAgreementCount(supply.resourceTradeAgreements, playerId, ctx.now())
  };
};

export type ProtoPlayerTradeHoldingsRequest = { player_id: string };
export type ProtoPlayerTradeHoldingsResponse = {
  ok: boolean;
  found: boolean;
  gold?: number;
  resource_trade_holdings_json?: string;
  active_supply_agreements?: number;
};

export const handleGetPlayerTradeHoldings = (
  runtime: { getPlayerTradeHoldings: (playerId: string) => PlayerTradeHoldings | undefined },
  call: { request: ProtoPlayerTradeHoldingsRequest },
  callback: (error: Error | null, response: ProtoPlayerTradeHoldingsResponse) => void
): void => {
  let holdings: PlayerTradeHoldings | undefined;
  try {
    holdings = runtime.getPlayerTradeHoldings(call.request.player_id);
  } catch (error) {
    callback(error instanceof Error ? error : new Error("failed to read trade holdings"), { ok: false, found: false });
    return;
  }
  if (!holdings) {
    callback(null, { ok: true, found: false });
    return;
  }
  callback(null, {
    ok: true,
    found: true,
    gold: holdings.gold,
    ...(holdings.resourceTradeHoldings ? { resource_trade_holdings_json: JSON.stringify(holdings.resourceTradeHoldings) } : {}),
    active_supply_agreements: holdings.activeSupplyAgreements
  });
};
