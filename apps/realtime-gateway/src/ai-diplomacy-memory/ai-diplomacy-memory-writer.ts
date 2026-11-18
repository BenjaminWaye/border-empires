// Coalesces AI diplomacy memory changes (ai-diplomacy-memory.ts) into batched
// social-store writes. Memory changes on every COMBAT_RESOLVED, which arrive in
// bursts (fronts, group attacks) and mostly hit the same few pairs again, so
// instead of one synchronous SQLite upsert per combat on the gateway's event
// loop, the latest state of each changed pair is held for a short delay and
// written in one transaction. A crash loses at most that delay of memory;
// a graceful shutdown calls `flush`. Pending entries are bounded by the
// memory's own pair cap (one per pair).

import { diplomacyMemoryPairKey, type StoredDiplomacyMemoryPair } from "./ai-diplomacy-memory-record.js";
import type { DiplomacyMemorySink } from "./ai-diplomacy-memory.js";

/** Long enough to fold a burst of fights into one write, short enough that a crash loses little. */
export const DIPLOMACY_MEMORY_WRITE_DELAY_MS = 2_000;

export type DiplomacyMemoryRemoval = { aiPlayerId: string; playerId: string };

/** The store side: upserts and deletes applied together (one transaction in SQLite). */
export type DiplomacyMemoryStoreWrite = (upserts: StoredDiplomacyMemoryPair[], removals: DiplomacyMemoryRemoval[]) => void;

/** AI diplomacy memory in the social store: the pairs restored at boot, and where changes are written. */
export type DiplomacyMemoryPersistence = { initial: readonly StoredDiplomacyMemoryPair[]; write: DiplomacyMemoryStoreWrite };

export type DiplomacyMemoryWriter = {
  sink: DiplomacyMemorySink;
  /** Writes everything pending now (shutdown, tests). */
  flush: () => void;
  /** Drops pending writes (a new season: the store has just been cleared). */
  discard: () => void;
  pendingCount: () => number;
};

export const createDiplomacyMemoryWriter = (deps: {
  write: DiplomacyMemoryStoreWrite;
  delayMs?: number;
  setTimer?: (task: () => void, delayMs: number) => { clear: () => void };
  onError?: (error: unknown, pairs: number) => void;
}): DiplomacyMemoryWriter => {
  const delayMs = deps.delayMs ?? DIPLOMACY_MEMORY_WRITE_DELAY_MS;
  const setTimer =
    deps.setTimer ??
    ((task: () => void, ms: number) => {
      const handle = setTimeout(task, ms);
      handle.unref?.();
      return { clear: () => clearTimeout(handle) };
    });
  // Latest state per pair: a stored pair to upsert, or a removal.
  let pending = new Map<string, StoredDiplomacyMemoryPair | DiplomacyMemoryRemoval>();
  let timer: { clear: () => void } | undefined;

  const flush = (): void => {
    timer?.clear();
    timer = undefined;
    if (pending.size === 0) return;
    const batch = pending;
    pending = new Map();
    const upserts: StoredDiplomacyMemoryPair[] = [];
    const removals: DiplomacyMemoryRemoval[] = [];
    for (const entry of batch.values()) {
      if ("touchedAt" in entry) upserts.push(entry);
      else removals.push(entry);
    }
    try {
      deps.write(upserts, removals);
    } catch (error) {
      // Keep the batch for the next try, unless the pair changed again since.
      for (const [key, entry] of batch) if (!pending.has(key)) pending.set(key, entry);
      deps.onError?.(error, batch.size);
      schedule();
    }
  };
  const schedule = (): void => {
    if (!timer) timer = setTimer(flush, delayMs);
  };
  const queue = (key: string, entry: StoredDiplomacyMemoryPair | DiplomacyMemoryRemoval): void => {
    pending.delete(key);
    pending.set(key, entry);
    schedule();
  };

  return {
    sink: {
      save: (pair) => queue(diplomacyMemoryPairKey(pair.aiPlayerId, pair.playerId), pair),
      remove: (aiPlayerId, playerId) => queue(diplomacyMemoryPairKey(aiPlayerId, playerId), { aiPlayerId, playerId })
    },
    flush,
    discard: () => {
      timer?.clear();
      timer = undefined;
      pending.clear();
    },
    pendingCount: () => pending.size
  };
};
