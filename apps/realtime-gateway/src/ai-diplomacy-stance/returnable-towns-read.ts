// Towns a player could hand back in a deal (the "return a town" term), read
// from the simulation's GetPlayerTradeHoldings for the AI's pricing and the
// trade screen. AI replies must never wait on it: a read slower than
// RETURNABLE_TOWNS_READ_MS, or one that fails, lists no towns (the AI then
// simply doesn't count any) and is recorded, so a stalled read is visible.
// Memoized per player for a few seconds; the map holds only players asked
// about within one TTL window.
import type { ReturnableTown } from "@border-empires/shared";

import { memoizeWithTtl } from "../seeded-ai-diplomacy-responder/seeded-ai-diplomacy-responder.js";
import type { PlayerTradeHoldingsResult } from "../sim-client/sim-client-trade-holdings.js";

export const RETURNABLE_TOWNS_READ_MS = 400;
export const RETURNABLE_TOWNS_TTL_MS = 3_000;

export const createReturnableTownsRead = (deps: {
  getPlayerTradeHoldings: (playerId: string) => Promise<PlayerTradeHoldingsResult | undefined>;
  recordGatewayEvent: (level: "info" | "warn" | "error", event: string, payload?: Record<string, unknown>) => void;
  timeoutMs?: number;
}): ((playerId: string) => Promise<readonly ReturnableTown[]>) =>
  memoizeWithTtl((playerId) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const skipped = (reason: string): ReturnableTown[] => {
      deps.recordGatewayEvent("warn", "gateway_returnable_towns_skipped", { playerId, reason });
      return [];
    };
    const timeout = new Promise<ReturnableTown[]>((resolve) => {
      timer = setTimeout(() => resolve(skipped("timeout")), deps.timeoutMs ?? RETURNABLE_TOWNS_READ_MS);
    });
    const read = Promise.resolve()
      .then(() => deps.getPlayerTradeHoldings(playerId))
      .then((held) => held?.returnableTowns ?? [], () => skipped("error"));
    return Promise.race([read, timeout]).finally(() => clearTimeout(timer));
  }, RETURNABLE_TOWNS_TTL_MS);
