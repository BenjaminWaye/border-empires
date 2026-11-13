// Runtime loop's periodic tick (extracted from client-action-flow.ts): once a waypoint target is owned, settle
// it if queued (autoSettleTargets), and garrison the ring around a garrisoned town (client-town-ring-garrison.ts).
import { queuedDevelopmentActionExists } from "../client-development-queue/client-development-queue.js";
import { resolveMyReachCached } from "../client-reach-authoritative/client-reach-authoritative.js";
import type { ClientState } from "../client-state/client-state.js";
import { processTownRingGarrisons } from "../client-town-ring-garrison/client-town-ring-garrison.js";

type SettleOpts = { forceQueue: true; suppressWarnings: true };

export const processAutoSettleTargetsForState = (
  state: ClientState,
  requestSettlement: (x: number, y: number, opts?: SettleOpts) => boolean
): void => {
  const reach = resolveMyReachCached(state);
  const isSettling = (tileKey: string): boolean =>
    state.settleProgressByTile.has(tileKey) || queuedDevelopmentActionExists(state, tileKey, "SETTLE");
  if (state.townRingGarrisons.size > 0) {
    processTownRingGarrisons(state, {
      now: Date.now(),
      reach,
      isSettling,
      requestSettlement: (x, y) => requestSettlement(x, y, { forceQueue: true, suppressWarnings: true })
    });
  }
  for (const targetKey of [...state.autoSettleTargets]) {
    const tile = state.tiles.get(targetKey);
    if (!tile) continue;
    // A settle already dispatched (or waiting in the development queue) for
    // this tile keeps it FRONTIER until the server confirms, and the optimistic
    // marker can be cleared by an intervening tile update. Firing again here
    // sends a second SETTLE and the server rejects it with
    // "tile is already settling" -- drop the auto-settle entry instead, the
    // matching autoBuildTargets entry still runs once the tile lands SETTLED.
    if (isSettling(targetKey)) {
      state.autoSettleTargets.delete(targetKey);
      continue;
    }
    if (tile.ownerId === state.me && tile.ownershipState === "FRONTIER" && !tile.optimisticPending) {
      // The tile can drift out of reach between the click that queued this
      // (e.g. a Relay Beacon chain, or a build queued ahead of ownership
      // landing) and the tick where ownership actually arrives -- the server
      // would reject the SETTLE as OUT_OF_REACH anyway, so drop the queued
      // settle (and any dependent build) instead of sending a doomed command.
      if (!reach.has(targetKey)) {
        state.autoSettleTargets.delete(targetKey);
        state.autoBuildTargets.delete(targetKey);
        continue;
      }
      state.autoSettleTargets.delete(targetKey);
      requestSettlement(tile.x, tile.y);
    }
  }
};
