export type QueuedDevelopmentActionLike =
  | { kind: "SETTLE"; tileKey: string }
  | { kind: "BUILD"; tileKey: string };

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

export const busyDevelopmentProcessCount = (
  tiles: Iterable<DevelopmentOwnedTileLike>,
  ownerId: string,
  pendingSettlementCount: number
): number => {
  let busy = pendingSettlementCount;
  for (const tile of tiles) {
    if (tile.ownerId !== ownerId) continue;
    if (
      tile.fort?.status === "under_construction" ||
      tile.observatory?.status === "under_construction" ||
      tile.siegeOutpost?.status === "under_construction" ||
      tile.economicStructure?.status === "under_construction" ||
      tile.economicStructure?.status === "removing"
    ) {
      busy += 1;
    }
  }
  return busy;
};
