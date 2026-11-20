// GetPlayerTradeHoldings: a player's coin, spare supply slots and active supply
// agreement count, for the deal screen's other side. The gateway asks this for
// every human target, online or not, so the stance reply's amounts, its "supply
// agreements full" flag and its timing never reveal whether a House is logged
// in. An O(1)-ish lookup: no SubscribePlayer snapshot is built. It also lists
// the towns the player could hand back in a deal (returnable-towns.ts), a scan
// of the bounded 24h impact log.
import type { DomainTileState } from "@border-empires/game-domain";
import { activeSupplyAgreementCount, type ResourceSupplyPlayerState, type ReturnableTown } from "@border-empires/shared";

import { returnableTownsFor } from "../diplomacy-town-return/returnable-towns.js";
import type { PersonalImpactEvent } from "../personal-impact-log/personal-impact-log.js";
import type { SimulationTileWireDelta } from "../runtime-types.js";

export type PlayerTradeHoldings = {
  gold: number;
  resourceTradeHoldings?: ResourceSupplyPlayerState["resourceTradeHoldings"];
  activeSupplyAgreements: number;
  returnableTowns: ReturnableTown[];
};

export type PlayerTradeHoldingsContext = {
  players: ReadonlyMap<string, { points: number }>;
  supplyStateForPlayer: (id: string) => Partial<Pick<ResourceSupplyPlayerState, "resourceTradeHoldings" | "resourceTradeAgreements">>;
  now: () => number;
  /** Absent: no towns are listed (fixtures without a world). */
  townReturn?: {
    tiles: ReadonlyMap<string, DomainTileState>;
    personalImpactEntries?: () => readonly PersonalImpactEvent[];
    tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  };
};

const returnableTownsOf = (ctx: PlayerTradeHoldingsContext, playerId: string): ReturnableTown[] => {
  const world = ctx.townReturn;
  if (!world?.personalImpactEntries) return [];
  return returnableTownsFor({
    tiles: world.tiles,
    now: ctx.now,
    personalImpactEntries: world.personalImpactEntries,
    townGoldPerMinute: (tile) => world.tileDeltaFromState(tile).yieldRate?.goldPerMinute
  }, playerId);
};

export const playerTradeHoldingsForRuntime = (ctx: PlayerTradeHoldingsContext, playerId: string): PlayerTradeHoldings | undefined => {
  const player = ctx.players.get(playerId);
  if (!player) return undefined;
  const supply = ctx.supplyStateForPlayer(playerId);
  return {
    gold: player.points,
    ...(supply.resourceTradeHoldings ? { resourceTradeHoldings: supply.resourceTradeHoldings } : {}),
    activeSupplyAgreements: activeSupplyAgreementCount(supply.resourceTradeAgreements, playerId, ctx.now()),
    returnableTowns: returnableTownsOf(ctx, playerId)
  };
};

export type ProtoPlayerTradeHoldingsRequest = { player_id: string };
export type ProtoPlayerTradeHoldingsResponse = {
  ok: boolean;
  found: boolean;
  gold?: number;
  resource_trade_holdings_json?: string;
  active_supply_agreements?: number;
  returnable_towns_json?: string;
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
    active_supply_agreements: holdings.activeSupplyAgreements,
    ...(holdings.returnableTowns.length > 0 ? { returnable_towns_json: JSON.stringify(holdings.returnableTowns) } : {})
  });
};
