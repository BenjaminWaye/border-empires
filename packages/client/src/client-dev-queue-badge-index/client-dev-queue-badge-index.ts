import { devQueueTierForIndex, devQueueTierRelativeIndex } from "@border-empires/shared";

type DevQueueEntryLike = { kind: string; tileKey: string };

export type DevQueueBadgeIndex = {
  settleQueueIndex: Map<string, number>;
  queuedBuildIndex: Map<string, number>;
  settleQueueEntryState: Map<string, "queued" | "planned">;
  queuedBuildEntryState: Map<string, "queued" | "planned">;
};

/** 1-indexed, tier-relative corner-badge ordinal + queued/planned state per tile, keyed off position in the flat developmentQueue array. */
export const devQueueBadgeIndex = (developmentQueue: readonly DevQueueEntryLike[]): DevQueueBadgeIndex => {
  const settleQueueIndex = new Map<string, number>();
  const queuedBuildIndex = new Map<string, number>();
  const settleQueueEntryState = new Map<string, "queued" | "planned">();
  const queuedBuildEntryState = new Map<string, "queued" | "planned">();
  for (let i = 0; i < developmentQueue.length; i += 1) {
    const entry = developmentQueue[i];
    if (!entry) continue;
    const tier = devQueueTierForIndex(i);
    const tierOrdinal = devQueueTierRelativeIndex(i) + 1;
    if (entry.kind === "SETTLE") {
      settleQueueIndex.set(entry.tileKey, tierOrdinal);
      settleQueueEntryState.set(entry.tileKey, tier);
    }
    if (entry.kind === "BUILD") {
      queuedBuildIndex.set(entry.tileKey, tierOrdinal);
      queuedBuildEntryState.set(entry.tileKey, tier);
    }
  }
  return { settleQueueIndex, queuedBuildIndex, settleQueueEntryState, queuedBuildEntryState };
};
