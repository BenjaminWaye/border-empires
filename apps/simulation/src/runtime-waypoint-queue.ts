// Server-durable waypoint/expand-queue array ops. Storage-only for now:
// the server holds the target list (so it survives a disconnect/reconnect
// instead of living only in client sessionStorage), but does not yet walk
// the route itself while the player is offline -- see the plan doc's
// scope-boundary note (server-side auto-drain of EXPAND/ATTACK steps is a
// separate follow-up once frontier-command completion timing is verified
// safe to hook the same way dev-queue's settle/build completion is).
import { DEV_QUEUE_SERVER_CAP } from "@border-empires/shared";
import type { ServerWaypointQueueEntry } from "./player-runtime-summary.js";

export type WaypointEnqueuePayload = { x: number; y: number; trackBarbarian?: boolean };
export type WaypointTargetPayload = { x: number; y: number };

export const parseWaypointEnqueuePayload = (payloadJson: string): WaypointEnqueuePayload | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return {
      x: parsed.x,
      y: parsed.y,
      ...(typeof parsed.trackBarbarian === "boolean" ? { trackBarbarian: parsed.trackBarbarian } : {})
    };
  } catch {
    return null;
  }
};

export const parseWaypointTargetPayload = (payloadJson: string): WaypointTargetPayload | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
};

const sameTarget = (a: { x: number; y: number }, b: { x: number; y: number }): boolean => a.x === b.x && a.y === b.y;

export const waypointQueueEnqueue = (
  queue: ServerWaypointQueueEntry[],
  entry: WaypointEnqueuePayload,
  queuedAt: number
): { queue: ServerWaypointQueueEntry[]; accepted: boolean } => {
  if (queue.some((e) => sameTarget(e.target, entry))) return { queue, accepted: false };
  if (queue.length >= DEV_QUEUE_SERVER_CAP) return { queue, accepted: false };
  const next: ServerWaypointQueueEntry = {
    target: { x: entry.x, y: entry.y },
    queuedAt,
    ...(entry.trackBarbarian ? { trackBarbarian: true } : {})
  };
  return { queue: [...queue, next], accepted: true };
};

export const waypointQueueCancel = (queue: ServerWaypointQueueEntry[], target: WaypointTargetPayload): ServerWaypointQueueEntry[] =>
  queue.filter((entry) => !sameTarget(entry.target, target));
