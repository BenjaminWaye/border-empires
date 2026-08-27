// Server-durable waypoint/expand-queue array ops. See
// docs/waypoint-client-planning-plan.md: the client is the only planner and
// sends its full route (steps[]); the server (runtime-waypoint-drain.ts) is
// a replayer that walks that route one leg at a time while the player is
// offline, rather than guessing single-leg targets itself.
import { DEV_QUEUE_SERVER_CAP, WAYPOINT_MAX_WIRE_STEPS } from "@border-empires/shared";
import type { WaypointAction, WaypointWireStep } from "@border-empires/shared";
import type { ServerWaypointQueueEntry } from "./player-runtime-summary.js";

export type WaypointEnqueuePayload = {
  x: number;
  y: number;
  trackBarbarian?: boolean;
  planId?: string;
  plannedAt?: number;
  steps?: WaypointWireStep[];
};
export type WaypointTargetPayload = { x: number; y: number };

const isWireStepAction = (value: unknown): value is WaypointAction => value === "EXPAND" || value === "ATTACK";

const isWireCoord = (value: unknown): value is { x: number; y: number } =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { x?: unknown }).x === "number" &&
  typeof (value as { y?: unknown }).y === "number";

const parseWireSteps = (value: unknown): WaypointWireStep[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const steps: WaypointWireStep[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) return undefined;
    const step = raw as Record<string, unknown>;
    if (!isWireCoord(step.origin) || !isWireCoord(step.target) || !isWireStepAction(step.action)) return undefined;
    steps.push({
      origin: { x: step.origin.x, y: step.origin.y },
      target: { x: step.target.x, y: step.target.y },
      action: step.action
    });
  }
  return steps;
};

export const parseWaypointEnqueuePayload = (payloadJson: string): WaypointEnqueuePayload | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    const steps = parseWireSteps(parsed.steps);
    // A malformed steps[] (present but not parseable) is treated as a bad
    // command rather than silently downgraded to a target-only enqueue --
    // see WAYPOINT_MAX_WIRE_STEPS enforcement at the handler boundary, which
    // rejects this the same way.
    if (parsed.steps !== undefined && steps === undefined) return null;
    if (steps && steps.length > WAYPOINT_MAX_WIRE_STEPS) return null;
    return {
      x: parsed.x,
      y: parsed.y,
      ...(typeof parsed.trackBarbarian === "boolean" ? { trackBarbarian: parsed.trackBarbarian } : {}),
      ...(typeof parsed.planId === "string" ? { planId: parsed.planId } : {}),
      ...(typeof parsed.plannedAt === "number" ? { plannedAt: parsed.plannedAt } : {}),
      ...(steps ? { steps } : {})
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
  const existingIndex = queue.findIndex((e) => sameTarget(e.target, entry));
  if (existingIndex >= 0) {
    const existing = queue[existingIndex]!;
    // Re-plan/replace: an enqueue for an existing target with a newer
    // plannedAt replaces that entry's steps in place (keeping its queue
    // position and queuedAt) instead of being rejected as a no-op -- see
    // docs/waypoint-client-planning-plan.md §1. Without this the client
    // could never refresh a stale server-side plan short of cancel +
        // re-enqueue, which would briefly drop the entry and race the drain.
    const isNewerPlan =
      typeof entry.plannedAt === "number" && (existing.plannedAt === undefined || entry.plannedAt > existing.plannedAt);
    if (!isNewerPlan) return { queue, accepted: false };
    const replaced: ServerWaypointQueueEntry = {
      target: { x: entry.x, y: entry.y },
      queuedAt: existing.queuedAt,
      ...(entry.trackBarbarian ? { trackBarbarian: true } : {}),
      ...(entry.planId ? { planId: entry.planId } : {}),
      ...(entry.plannedAt !== undefined ? { plannedAt: entry.plannedAt } : {}),
      ...(entry.steps ? { steps: entry.steps, cursor: 0 } : {}),
      stalled: false
    };
    const nextQueue = [...queue];
    nextQueue[existingIndex] = replaced;
    return { queue: nextQueue, accepted: true };
  }
  if (queue.length >= DEV_QUEUE_SERVER_CAP) return { queue, accepted: false };
  const next: ServerWaypointQueueEntry = {
    target: { x: entry.x, y: entry.y },
    queuedAt,
    ...(entry.trackBarbarian ? { trackBarbarian: true } : {}),
    ...(entry.planId ? { planId: entry.planId } : {}),
    ...(entry.plannedAt !== undefined ? { plannedAt: entry.plannedAt } : {}),
    ...(entry.steps ? { steps: entry.steps, cursor: 0 } : {})
  };
  return { queue: [...queue, next], accepted: true };
};

export const waypointQueueCancel = (queue: ServerWaypointQueueEntry[], target: WaypointTargetPayload): ServerWaypointQueueEntry[] =>
  queue.filter((entry) => !sameTarget(entry.target, target));
