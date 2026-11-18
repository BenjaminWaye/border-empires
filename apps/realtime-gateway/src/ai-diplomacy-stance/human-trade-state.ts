// The stance reply's human-target lookup: always the simulation's
// GetPlayerTradeHoldings, never the gateway's live cache, so an online and an
// offline House are answered from the same source in the same time and the
// reply never reveals who is logged in. Memoized per target for a few seconds
// so reopening a deal screen doesn't queue repeat RPCs behind the sim thread
// (the map holds only targets asked about within one TTL window).
import type { PlayerTradeHoldingsResult } from "../sim-client/sim-client-trade-holdings.js";
import { memoizeWithTtl } from "../seeded-ai-diplomacy-responder/seeded-ai-diplomacy-responder.js";
import { tradeHoldingsOf, type HumanTradeState } from "./diplomacy-stance-query.js";

export const HUMAN_TRADE_STATE_TTL_MS = 3_000;

export const createHumanTradeState = (
  getPlayerTradeHoldings: (playerId: string) => Promise<PlayerTradeHoldingsResult | undefined>,
  ttlMs: number = HUMAN_TRADE_STATE_TTL_MS
): ((playerId: string) => Promise<HumanTradeState | undefined>) =>
  memoizeWithTtl(
    (playerId) =>
      getPlayerTradeHoldings(playerId).then((held) =>
        held ? { holdings: tradeHoldingsOf(held), supplyAgreements: held.activeSupplyAgreements } : undefined
      ),
    ttlMs
  );
