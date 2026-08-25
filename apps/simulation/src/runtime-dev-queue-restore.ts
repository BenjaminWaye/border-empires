// Dev-queue restore + bulk-refund (§ queued-buildings-mp-reimbursement).
//
// The dev queue holds MP/slot reservations for queued BUILD entries (see
// runtime-dev-queue-build-reservation.ts). Those reservations are deducted
// from player.manpower, which IS persisted through exportState -- so the
// queue entries that owe the matching refund have to survive a restart too,
// or every restart silently burns the reserved manpower of every queued
// build. That mattered little while the queue was a pure intent list; now
// that it holds real resources it's a correctness requirement.
//
// Restoring is deliberately NOT a re-charge: the manpower was already taken
// before the export, so the restored entry carries its reservation forward
// unchanged and simply stays owed.
import type { SlotResource } from "@border-empires/shared";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";

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

export type DevQueueRestoreInput = {
  players?: ReadonlyArray<{ id: string; devQueue?: ReadonlyArray<ExportedDevQueueEntry> }> | undefined;
};

/**
 * Maps live queue entries to their persisted shape. Shared by the snapshot
 * builder (runtime-snapshot-sections.ts -- the one that actually survives a
 * restart) and exportState (runtime-state-export.ts) so the two can never
 * drift into persisting different fields.
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

/**
 * Seeds each player's in-memory devQueue from an exported/persisted state,
 * reservation fields included. Call once at boot, after playerSummaries have
 * been created.
 *
 * Deliberately does NOT truncate to DEV_QUEUE_SERVER_CAP: dropping a
 * restored entry would silently destroy the reservation it still owes back.
 * An over-cap queue drains itself back under the cap (enqueue is what
 * enforces the cap), so preserving is both safe and self-correcting.
 */
export const restoreDevQueuesFromInitialState = (
  initialState: DevQueueRestoreInput | undefined,
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary
): void => {
  for (const player of initialState?.players ?? []) {
    if (!player.devQueue?.length) continue;
    summaryForPlayer(player.id).devQueue = player.devQueue.map((entry) => ({
      tileKey: entry.tileKey,
      x: entry.x,
      y: entry.y,
      kind: entry.kind,
      queuedAt: entry.queuedAt,
      ...(entry.structureType ? { structureType: entry.structureType } : {}),
      ...(entry.reservedManpower ? { reservedManpower: entry.reservedManpower } : {}),
      ...(entry.reservedSlotRequirements?.length
        ? { reservedSlotRequirements: entry.reservedSlotRequirements.map((req) => ({ resource: req.resource, count: req.count })) }
        : {})
    }));
  }
};
