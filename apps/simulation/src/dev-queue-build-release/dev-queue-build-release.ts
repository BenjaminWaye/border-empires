import type { DomainPlayer } from "@border-empires/game-domain";

import { devQueueCancel, devQueueEntryForTileKey } from "../runtime-dev-queue.js";
import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";

/**
 * A queued build an online client sends itself. The client mirrors the entry
 * to the server (DEV_QUEUE_ENQUEUE, which holds its manpower), then dispatches
 * BUILD_STRUCTURE and follows it with DEV_QUEUE_CANCEL. Without this, the
 * build charged its full cost while the entry still held the same amount, and
 * the cancel's refund is clamped to the cap: a player over the cap (landing
 * reserve, Waystation grant) lost the hold outright, so a 150-manpower
 * Manufactory cost 300.
 *
 * Hands the hold back unclamped (the build charges straight after) and drops
 * the entry, so the build pays exactly once. A drain-dispatched build already
 * removed its entry (tryDrainDevQueue), so this is a no-op for it. Same
 * contract as releaseQueuedSettleReservation for garrisons.
 */
export const releaseQueuedBuildReservation = (
  summary: Pick<PlayerRuntimeSummary, "devQueue">,
  player: Pick<DomainPlayer, "manpower">,
  tileKey: string,
  structureType: string
): void => {
  const entry = devQueueEntryForTileKey(summary.devQueue, tileKey);
  // Only the entry this build is: a different queued structure on the tile keeps its place and its hold.
  if (entry?.kind !== "BUILD" || entry.structureType !== structureType) return;
  if (entry.reservedManpower) player.manpower = Math.max(0, player.manpower) + entry.reservedManpower;
  summary.devQueue = devQueueCancel(summary.devQueue, tileKey);
};
