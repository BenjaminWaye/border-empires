import { tileHasPendingStructureWork } from "./client-structure-state.js";

export type QueuedDevelopmentActionLike =
  | { kind: "SETTLE"; tileKey: string; label?: string; optimisticKind?: string }
  | { kind: "BUILD"; tileKey: string; label?: string; optimisticKind?: string };

export type DevelopmentOwnedTileLike = {
  ownerId?: string;
  fort?: { status?: string };
  observatory?: { status?: string };
  siegeOutpost?: { status?: string };
  economicStructure?: { status?: string };
};

export const queuedSettlementOrderForTile = (
  queue: readonly QueuedDevelopmentActionLike[],
  tileKey: string
): number =>
  queue.reduce((order, entry, index) => {
    if (order !== -1) return order;
    return entry.kind === "SETTLE" && entry.tileKey === tileKey ? index : -1;
  }, -1);

export const hasQueuedSettlementForTile = (
  queue: readonly QueuedDevelopmentActionLike[],
  tileKey: string
): boolean => queuedSettlementOrderForTile(queue, tileKey) !== -1;

export const queuedBuildOrderForTile = (
  queue: readonly QueuedDevelopmentActionLike[],
  tileKey: string
): number =>
  queue.reduce((order, entry, index) => {
    if (order !== -1) return order;
    return entry.kind === "BUILD" && entry.tileKey === tileKey ? index : -1;
  }, -1);

export const hasQueuedBuildForTile = (
  queue: readonly QueuedDevelopmentActionLike[],
  tileKey: string
): boolean => queuedBuildOrderForTile(queue, tileKey) !== -1;

export const busyDevelopmentProcessCount = (
  tiles: Iterable<DevelopmentOwnedTileLike>,
  ownerId: string,
  pendingSettlementCount: number
): number => {
  let busy = pendingSettlementCount;
  for (const tile of tiles) {
    if (tile.ownerId !== ownerId) continue;
    if (tileHasPendingStructureWork(tile)) busy += 1;
  }
  return busy;
};
