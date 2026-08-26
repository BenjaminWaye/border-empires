// Server-durable dev-queue array ops. Pure data in, pure data out -- mirrors
// packages/shared/src/dev-queue/dev-queue.ts's cap/ordering semantics for the
// "queued" (server-confirmed) tier, but works directly on the flat
// ServerDevQueueEntry[] kept in PlayerRuntimeSummary.devQueue rather than the
// two-tier DevQueueState (the "planned" tier stays entirely client-side --
// the server only ever sees the top DEV_QUEUE_SERVER_CAP items).
import { DEV_QUEUE_SERVER_CAP } from "@border-empires/shared";
import type { ServerDevQueueEntry } from "./player-runtime-summary.js";

export type DevQueueEnqueuePayload = {
  x: number;
  y: number;
  tileKey: string;
  kind: ServerDevQueueEntry["kind"];
  structureType?: string;
  reservedManpower?: number;
  reservedSlotRequirements?: ServerDevQueueEntry["reservedSlotRequirements"];
};
export type DevQueueTileKeyPayload = { tileKey: string };

export const parseDevQueueEnqueuePayload = (payloadJson: string): DevQueueEnqueuePayload | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    if (typeof parsed.tileKey !== "string" || !parsed.tileKey) return null;
    if (parsed.kind !== "SETTLE" && parsed.kind !== "BUILD") return null;
    if (parsed.kind === "BUILD" && typeof parsed.structureType !== "string") return null;
    return {
      x: parsed.x,
      y: parsed.y,
      tileKey: parsed.tileKey,
      kind: parsed.kind,
      ...(typeof parsed.structureType === "string" ? { structureType: parsed.structureType } : {})
    };
  } catch {
    return null;
  }
};

export const parseDevQueueTileKeyPayload = (payloadJson: string): DevQueueTileKeyPayload | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.tileKey !== "string" || !parsed.tileKey) return null;
    return { tileKey: parsed.tileKey };
  } catch {
    return null;
  }
};

/** Appends to the tail, capped at DEV_QUEUE_SERVER_CAP, de-duped by tileKey. */
export const devQueueEnqueue = (
  queue: ServerDevQueueEntry[],
  entry: DevQueueEnqueuePayload,
  queuedAt: number
): { queue: ServerDevQueueEntry[]; accepted: boolean } => {
  if (queue.some((e) => e.tileKey === entry.tileKey)) return { queue, accepted: false };
  if (queue.length >= DEV_QUEUE_SERVER_CAP) return { queue, accepted: false };
  const next: ServerDevQueueEntry = {
    tileKey: entry.tileKey,
    x: entry.x,
    y: entry.y,
    kind: entry.kind,
    queuedAt,
    ...(entry.structureType ? { structureType: entry.structureType } : {}),
    ...(entry.reservedManpower ? { reservedManpower: entry.reservedManpower } : {}),
    ...(entry.reservedSlotRequirements ? { reservedSlotRequirements: entry.reservedSlotRequirements } : {})
  };
  return { queue: [...queue, next], accepted: true };
};

export const devQueueCancel = (queue: ServerDevQueueEntry[], tileKey: string): ServerDevQueueEntry[] =>
  queue.filter((entry) => entry.tileKey !== tileKey);

/** Looks up an entry without removing it -- used to read its reservation before cancel/drain removes it from the array. */
export const devQueueEntryForTileKey = (queue: ServerDevQueueEntry[], tileKey: string): ServerDevQueueEntry | undefined =>
  queue.find((entry) => entry.tileKey === tileKey);

export const devQueueMoveToFront = (queue: ServerDevQueueEntry[], tileKey: string): ServerDevQueueEntry[] => {
  const index = queue.findIndex((entry) => entry.tileKey === tileKey);
  if (index <= 0) return queue;
  const entry = queue[index]!;
  return [entry, ...queue.slice(0, index), ...queue.slice(index + 1)];
};
