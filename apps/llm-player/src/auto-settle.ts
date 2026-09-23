// Mirrors the real browser client's "Auto-settle" mechanic
// (packages/client/src/client-development-queue/client-development-queue.ts's
// applyAutoSettlementQueueFromServer): the server computes a queue of
// FRONTIER tiles worth settling (towns, docks, resources, town-ring tiles
// within reach -- see apps/simulation/src/runtime-auto-settle-eligibility)
// and ships it as player.autoSettlementQueue on every INIT/PLAYER_UPDATE. A
// human player never manually settles these; their client just fires
// ordinary SETTLE commands for them, budget-gated by manpower (SETTLE_COST
// in gold is 0 -- see packages/shared/src/config.ts). Without this, the bot
// would need to spend its one LLM-decided action per turn manually settling
// tiles a real player gets for free, starving it of turns for actual
// strategic decisions (expand/attack/beacon/pan).
import { SETTLE_MANPOWER_COST } from "@border-empires/shared";
import { tileKey, type GameInitState } from "./game-socket.js";
import type { TileIndex } from "./viewport.js";

export type AutoSettlementQueueEntry = GameInitState["autoSettlementQueue"][number];

// Takes queue entries front-to-back (the server's own ordering) while a
// local manpower budget lasts, skipping any entry that's stale by the time
// we look (no longer owned, or no longer FRONTIER -- already settled or
// lost) -- same shape as the real client's local budget tracking, so a
// single drain never queues more than the player can currently afford.
//
// pendingTileKeys excludes a tile we already fired a SETTLE for in an
// earlier turn that hasn't resolved yet (SETTLE_DURATION_MS is 60s
// server-side -- apps/simulation/src/runtime-settlement-rules.ts -- which can
// span several turns at the bot's default turn interval). The tile still
// reads as FRONTIER in the meantime since no delta marks "settle in
// progress" client-side, so without this it would get re-selected and
// re-sent every turn until it resolves. The real client's equivalent guard
// is its own settleProgressByTile/pendingSettlementTileKeys tracking
// (client-development-queue.ts's applyAutoSettlementQueueFromServer); the
// server itself treats a duplicate SETTLE as a safe no-op, so this isn't a
// correctness fix, just avoiding wasted round-trips and budget crowding out
// a genuinely new tile in the same drain.
export const selectAutoSettlementTargets = (
  queue: readonly AutoSettlementQueueEntry[],
  index: TileIndex,
  playerId: string,
  manpower: number,
  pendingTileKeys: ReadonlySet<string> = new Set()
): AutoSettlementQueueEntry[] => {
  const targets: AutoSettlementQueueEntry[] = [];
  let budget = manpower;
  for (const entry of queue) {
    if (budget < SETTLE_MANPOWER_COST) break;
    const key = tileKey(entry.x, entry.y);
    if (pendingTileKeys.has(key)) continue;
    const tile = index.get(key);
    if (!tile || tile.ownerId !== playerId || tile.ownershipState !== "FRONTIER") continue;
    targets.push(entry);
    budget -= SETTLE_MANPOWER_COST;
  }
  return targets;
};
