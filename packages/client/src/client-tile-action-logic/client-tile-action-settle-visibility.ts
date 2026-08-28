// Split out of client-tile-action-logic.ts (file-line-cap task): Settle Land /
// Settle Connected are pushed last (bottom of the actions list).
//
// User decision (supersedes the old "hide until established economy" gate):
// Settle Land must show on any owned FRONTIER tile from the start, same as
// "Expand To" + "Build Relay Beacon" already show unconditionally on a
// neutral tile. Requiring a settled town + food tile first hid the action
// during the exact early-game window players expect it to be available.
import { SETTLE_COST, SETTLE_MANPOWER_COST } from "@border-empires/shared";
import { canAffordCost, isForestTile } from "../client-constants.js";
import { hasQueuedSettlementForTile } from "../client-development-queue/client-development-queue.js";
import { settleDurationMsForState, type DevelopmentSlotSummary } from "../client-queue-logic/client-queue-logic.js";
import { authoritativeIsInReach } from "../client-reach-authoritative/client-reach-authoritative.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { tileActionAvailabilityWithDevelopmentSlot, type TileActionLogicDeps } from "./client-tile-action-logic.js";

export const settleActionsForFrontierTile = (
  state: ClientState,
  tile: Tile,
  deps: TileActionLogicDeps,
  slots: DevelopmentSlotSummary,
  queuedSettlement: boolean
): TileActionDef[] => {
  if (tile.ownershipState !== "FRONTIER" || queuedSettlement) return [];
  // Fixed-border reach: SETTLE is still reach-gated server-side even though EXPAND
  // itself is not -- see runtime-structure-command-handlers.ts. On a FRONTIER tile
  // outside reach, show these actions disabled with the reason instead of hiding them.
  const frontierOutOfReach = !authoritativeIsInReach(state, deps.keyFor)(tile.x, tile.y);
  const withReachGate = ([eligible, reason, cost]: [boolean, string, string]): [boolean, string, string] =>
    frontierOutOfReach ? [false, "Outside your reach", cost] : [eligible, reason, cost];

  const out: TileActionDef[] = [
    {
      id: "settle_land",
      label: "Settle Land",
      detail: deps.buildDetailTextForAction("settle_land", tile),
      ...tileActionAvailabilityWithDevelopmentSlot(
        ...withReachGate([
          canAffordCost(state.gold, SETTLE_COST) && state.manpower >= SETTLE_MANPOWER_COST,
          state.manpower < SETTLE_MANPOWER_COST ? `Need ${SETTLE_MANPOWER_COST} manpower` : `Need ${SETTLE_COST} gold`,
          `${SETTLE_COST} gold, ${SETTLE_MANPOWER_COST} manpower • ${Math.round(settleDurationMsForState(state, tile) / 1000)}s${isForestTile(tile.x, tile.y) ? " (Forest)" : ""}`
        ]),
        slots,
        deps
      )
    }
  ];

  const connectedKeys = deps.connectedOwnedFrontierKeysFor(tile);
  const actionableKeys = connectedKeys.filter(
    (k) => !state.settleProgressByTile.has(k) && !hasQueuedSettlementForTile(state.developmentQueue, k)
  );
  if (actionableKeys.length >= 2) {
    const totalCost = SETTLE_COST * actionableKeys.length;
    out.push({
      id: "settle_connected_frontier",
      label: `Settle Connected (${actionableKeys.length})`,
      detail: deps.buildDetailTextForAction("settle_connected_frontier", tile),
      ...tileActionAvailabilityWithDevelopmentSlot(
        ...withReachGate([
          canAffordCost(state.gold, SETTLE_COST) && state.manpower >= SETTLE_MANPOWER_COST,
          state.manpower < SETTLE_MANPOWER_COST ? `Need ${SETTLE_MANPOWER_COST} manpower` : `Need ${SETTLE_COST} gold`,
          `${totalCost} gold, ${SETTLE_MANPOWER_COST * actionableKeys.length} manpower total • fills slots, rest queue`
        ]),
        slots,
        deps
      )
    });
  }
  return out;
};
