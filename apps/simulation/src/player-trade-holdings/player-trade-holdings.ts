// GetPlayerTradeHoldings: a player's coin and spare supply slots, for the
// deal screen's other side when that player is offline. The gateway reads an
// online player's from its live subscription cache; for anyone else, this
// replaces a full SubscribePlayer snapshot with an O(1) lookup, so asking
// about an offline player costs no more than asking about an online one.
import type { ResourceSupplyPlayerState } from "@border-empires/shared";

export type PlayerTradeHoldings = { gold: number; resourceTradeHoldings?: ResourceSupplyPlayerState["resourceTradeHoldings"] };

export type PlayerTradeHoldingsContext = {
  players: ReadonlyMap<string, { points: number }>;
  /** Optional to match RuntimeExportContext; absent means no spare supply is known. */
  supplyStateForPlayer?: (id: string) => Partial<Pick<ResourceSupplyPlayerState, "resourceTradeHoldings">>;
};

export const playerTradeHoldingsForRuntime = (ctx: PlayerTradeHoldingsContext, playerId: string): PlayerTradeHoldings | undefined => {
  const player = ctx.players.get(playerId);
  if (!player) return undefined;
  const resourceTradeHoldings = ctx.supplyStateForPlayer?.(playerId).resourceTradeHoldings;
  return { gold: player.points, ...(resourceTradeHoldings ? { resourceTradeHoldings } : {}) };
};

export type ProtoPlayerTradeHoldingsRequest = { player_id: string };
export type ProtoPlayerTradeHoldingsResponse = { ok: boolean; found: boolean; gold?: number; resource_trade_holdings_json?: string };

export const handleGetPlayerTradeHoldings = (
  runtime: { getPlayerTradeHoldings: (playerId: string) => PlayerTradeHoldings | undefined },
  call: { request: ProtoPlayerTradeHoldingsRequest },
  callback: (error: Error | null, response: ProtoPlayerTradeHoldingsResponse) => void
): void => {
  const holdings = runtime.getPlayerTradeHoldings(call.request.player_id);
  if (!holdings) {
    callback(null, { ok: true, found: false });
    return;
  }
  callback(null, {
    ok: true,
    found: true,
    gold: holdings.gold,
    ...(holdings.resourceTradeHoldings ? { resource_trade_holdings_json: JSON.stringify(holdings.resourceTradeHoldings) } : {})
  });
};
