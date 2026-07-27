// Pure algorithm for the two-tier development action queue:
//
// - "queued"  = server-confirmed, capped, durable (survives logout/restart).
// - "planned" = client-local wishlist, uncapped, not yet confirmed by the
//   server. Entries auto-promote from planned into queued as queued slots
//   free up.
//
// This module is deliberately server/client agnostic (pure data in, pure
// data out) so both apps/simulation and packages/client can share the exact
// same ordering/cap/promotion semantics instead of re-implementing them.

export const DEV_QUEUE_SERVER_CAP = 10;

export type DevQueueEntryKind = "SETTLE" | "BUILD" | "FRONTIER";

export type DevQueueEntry = {
  tileKey: string;
  kind: DevQueueEntryKind;
  queuedAt: number;
};

export type DevQueueState = {
  /** Server-confirmed, capped at DEV_QUEUE_SERVER_CAP, durable. */
  queued: DevQueueEntry[];
  /** Client-local wishlist, uncapped, not yet confirmed by the server. */
  planned: DevQueueEntry[];
};

export const emptyDevQueueState = (): DevQueueState => ({ queued: [], planned: [] });

/**
 * Add a new entry. If there is a free server slot it goes straight into
 * "queued"; otherwise it's appended to the uncapped "planned" list.
 */
export const enqueueOrPlanDevQueueEntry = (state: DevQueueState, entry: DevQueueEntry): DevQueueState => {
  if (state.queued.some((e) => e.tileKey === entry.tileKey) || state.planned.some((e) => e.tileKey === entry.tileKey)) {
    return state;
  }
  if (state.queued.length < DEV_QUEUE_SERVER_CAP) {
    return { queued: [...state.queued, entry], planned: state.planned };
  }
  return { queued: state.queued, planned: [...state.planned, entry] };
};

/**
 * Promote the front of "planned" into "queued" while there is a free slot.
 * Call this whenever a queued entry completes or is cancelled.
 */
export const promoteDevQueueEntries = (state: DevQueueState): DevQueueState => {
  let queued = state.queued;
  let planned = state.planned;
  while (queued.length < DEV_QUEUE_SERVER_CAP && planned.length > 0) {
    const [next, ...rest] = planned;
    if (!next) break;
    queued = [...queued, next];
    planned = rest;
  }
  return { queued, planned };
};

/** Remove an entry (from whichever list it's in) and promote the next planned entry if a slot freed up. */
export const cancelDevQueueEntry = (state: DevQueueState, tileKey: string): DevQueueState => {
  const wasQueued = state.queued.some((e) => e.tileKey === tileKey);
  const next: DevQueueState = {
    queued: state.queued.filter((e) => e.tileKey !== tileKey),
    planned: state.planned.filter((e) => e.tileKey !== tileKey)
  };
  return wasQueued ? promoteDevQueueEntries(next) : next;
};

/**
 * "Jump to front of queue" -- forces an entry into position 1 of the
 * server-confirmed "queued" list, regardless of which list it started in.
 *
 * If the entry was already queued, this just reorders within "queued".
 *
 * If the entry was "planned" and the queue is already full (at
 * DEV_QUEUE_SERVER_CAP), the current last-place queued entry is displaced
 * back to the front of "planned" to make room -- the cap is never exceeded,
 * and nothing is silently dropped. This is a deliberate, visible trade:
 * jumping the line for one tile bumps another tile out of its durable
 * server slot.
 */
export const moveDevQueueEntryToFront = (state: DevQueueState, tileKey: string): DevQueueState => {
  const queuedIndex = state.queued.findIndex((e) => e.tileKey === tileKey);
  if (queuedIndex >= 0) {
    if (queuedIndex === 0) return state;
    const entry = state.queued[queuedIndex];
    if (!entry) return state;
    const queued = [entry, ...state.queued.slice(0, queuedIndex), ...state.queued.slice(queuedIndex + 1)];
    return { queued, planned: state.planned };
  }

  const plannedIndex = state.planned.findIndex((e) => e.tileKey === tileKey);
  if (plannedIndex < 0) return state;
  const entry = state.planned[plannedIndex];
  if (!entry) return state;
  const plannedWithoutEntry = [...state.planned.slice(0, plannedIndex), ...state.planned.slice(plannedIndex + 1)];

  if (state.queued.length < DEV_QUEUE_SERVER_CAP) {
    return { queued: [entry, ...state.queued], planned: plannedWithoutEntry };
  }

  // Queue is full: bump the current last-in-line queued entry back to the
  // front of planned to free a slot, then insert the jumping entry at the
  // front of queued.
  const displaced = state.queued[state.queued.length - 1];
  if (!displaced) return { queued: [entry, ...state.queued.slice(0, -1)], planned: plannedWithoutEntry };
  return {
    queued: [entry, ...state.queued.slice(0, -1)],
    planned: [displaced, ...plannedWithoutEntry]
  };
};

export type DevQueuePosition =
  | { state: "queued"; position: number }
  | { state: "planned"; position: number }
  | undefined;

/** 1-indexed position of a tile within its own list ("queued" or "planned"), for corner-badge/menu display. */
export const devQueuePositionForTile = (state: DevQueueState, tileKey: string): DevQueuePosition => {
  const queuedIndex = state.queued.findIndex((e) => e.tileKey === tileKey);
  if (queuedIndex >= 0) return { state: "queued", position: queuedIndex + 1 };
  const plannedIndex = state.planned.findIndex((e) => e.tileKey === tileKey);
  if (plannedIndex >= 0) return { state: "planned", position: plannedIndex + 1 };
  return undefined;
};
