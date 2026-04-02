export type QueuedDevelopmentActionLike =
  | { kind: "SETTLE"; tileKey: string }
  | { kind: "BUILD"; tileKey: string };

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
