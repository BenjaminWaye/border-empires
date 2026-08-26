// Dev-queue export mapping (§ queued-buildings-mp-reimbursement).
//
// The dev queue holds MP/slot reservations for queued BUILD entries (see
// runtime-dev-queue-build-reservation.ts). Boot-time restore of the queue
// itself (including these reservation fields) lives in
// createPlayerRuntimeSummaryFromRecovered (player-runtime-summary.ts), which
// spreads each persisted entry verbatim -- reservedManpower/
// reservedSlotRequirements ride along automatically. This module now only
// holds the shared shape/mapping used by exportState (runtime-state-export.ts)
// for reconnect hydration, kept separate so it can't drift from the snapshot
// builder's own field list.
import type { SlotResource } from "@border-empires/shared";

/** Element shape of RuntimeStateExport's per-player `devQueue` (kept structural to avoid importing the whole export type). */
export type ExportedDevQueueEntry = {
  tileKey: string;
  x: number;
  y: number;
  kind: "SETTLE" | "BUILD";
  structureType?: string;
  queuedAt: number;
  reservedManpower?: number;
  reservedSlotRequirements?: ReadonlyArray<{ resource: SlotResource; count: number }>;
};

/**
 * Maps live queue entries to their persisted shape for exportState.
 */
export const toPersistedDevQueueEntries = (
  entries: ReadonlyArray<ExportedDevQueueEntry>
): ExportedDevQueueEntry[] =>
  entries.map((entry) => ({
    tileKey: entry.tileKey,
    x: entry.x,
    y: entry.y,
    kind: entry.kind,
    ...(entry.structureType ? { structureType: entry.structureType } : {}),
    queuedAt: entry.queuedAt,
    ...(entry.reservedManpower ? { reservedManpower: entry.reservedManpower } : {}),
    ...(entry.reservedSlotRequirements?.length
      ? { reservedSlotRequirements: entry.reservedSlotRequirements.map((req) => ({ resource: req.resource, count: req.count })) }
      : {})
  }));
