import type { DomainTileState } from "@border-empires/game-domain";
import { FORT_PERIMETER_BY_VARIANT, WORLD_HEIGHT, WORLD_WIDTH, type FortVariant } from "@border-empires/shared";
import { devQueueEnqueue } from "../runtime-dev-queue.js";
import { tryDrainDevQueue, type RuntimeDevQueueCommandContext } from "../runtime-dev-queue-command-handlers.js";

export type FortPerimeterGarrisonContext = RuntimeDevQueueCommandContext & {
  tiles: ReadonlyMap<string, DomainTileState>;
  /** True while a SETTLE or fight already holds the tile. */
  isTileBlocked: (tileKey: string) => boolean;
  isPlayerTileInReach: (playerId: string, x: number, y: number) => boolean;
};

/**
 * Fort perimeter (fort-perimeter.ts): when a fort-family structure finishes
 * building, every one of the owner's FRONTIER land tiles inside its perimeter
 * is queued for a normal Garrison, so the perimeter bonus (which only ever
 * defends SETTLED ground) actually covers the ring. Each garrison is an
 * ordinary server-origin dev-queue SETTLE: it pays the usual garrison cost,
 * holds that manpower while queued (or waits for a refill when the pool is
 * short, like any queued garrison), and drains as development slots free up.
 * Returns the tile keys it queued.
 */
export const queueFortPerimeterGarrisons = (
  context: FortPerimeterGarrisonContext,
  ownerId: string,
  fortX: number,
  fortY: number,
  variant: FortVariant
): string[] => {
  const radius = FORT_PERIMETER_BY_VARIANT[variant].radius;
  const summary = context.summaryForPlayer(ownerId);
  const queued: string[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const x = (((fortX + dx) % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
      const y = (((fortY + dy) % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
      const tileKey = `${x},${y}`;
      const tile = context.tiles.get(tileKey);
      if (!tile || tile.ownerId !== ownerId || tile.ownershipState !== "FRONTIER" || tile.terrain !== "LAND") continue;
      if (tile.frontierDecayKind === "ENCIRCLEMENT" || context.isTileBlocked(tileKey)) continue;
      if (!(tile.town || tile.dockId) && !context.isPlayerTileInReach(ownerId, x, y)) continue;
      if (summary.devQueue.some((entry) => entry.tileKey === tileKey)) continue;
      const reservation = context.estimateSettleReservation(ownerId);
      // Anything but a manpower shortfall (which waits for a refill) means a garrison can't be queued now.
      if (!reservation.ok && reservation.code !== "INSUFFICIENT_MANPOWER") break;
      const reservedManpower = reservation.ok ? reservation.manpowerCost : undefined;
      const { queue, accepted } = devQueueEnqueue(
        summary.devQueue,
        { x, y, tileKey, kind: "SETTLE", origin: "server", ...(reservedManpower ? { reservedManpower } : { awaitingManpower: true as const }) },
        context.now()
      );
      if (!accepted) break; // queue full
      if (reservedManpower) context.applyManpowerReservation(ownerId, reservedManpower);
      summary.devQueue = queue;
      queued.push(tileKey);
    }
  }
  if (queued.length === 0) return queued;
  context.emitPlayerStateUpdate({ commandId: `fort-perimeter-garrison:${fortX},${fortY}`, playerId: ownerId });
  // tryDrainDevQueue dispatches one entry per call; keep going while it makes progress.
  for (let i = 0; i < queued.length; i += 1) {
    const before = summary.devQueue.length;
    tryDrainDevQueue(context, ownerId);
    if (context.summaryForPlayer(ownerId).devQueue.length >= before) break;
  }
  return queued;
};
