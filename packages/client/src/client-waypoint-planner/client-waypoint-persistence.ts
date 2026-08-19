import { DEV_QUEUE_SERVER_CAP } from "@border-empires/shared";
import { planWaypoint } from "./client-waypoint-planner.js";
import { localReachIsInReach } from "../client-reach-overlay/client-reach-overlay.js";
import type { ClientState, ClientWaypoint } from "../client-state/client-state.js";

// Client-side sessionStorage persistence for the waypoint/expand queue,
// mirroring client-development-queue.ts's pattern for developmentQueue:
// survives a page refresh or reconnect on the same tab. The target list
// itself is now also mirrored to the server (see waypointEnqueueWirePayload/
// syncWaypointQueueToServer below and runtime-waypoint-queue.ts), so it
// survives logout/reconnect and a fresh login on a different tab/device too
// -- only the actual auto-walking of the route while offline remains
// client-driven (see the plan doc's scope-boundary note). Reuses
// DEV_QUEUE_SERVER_CAP as the client-side bound so both queues share one
// number, matching the server's own WAYPOINT_ENQUEUE cap.
export const WAYPOINT_QUEUE_CLIENT_CAP = DEV_QUEUE_SERVER_CAP;

const WAYPOINT_QUEUE_SESSION_KEY = "border-empires-waypoint-queue-v1";

type PersistedWaypointEntry = {
  target: { x: number; y: number };
  trackBarbarian?: boolean;
};

const readSessionStorage = (key: string): string | null => {
  try {
    return globalThis.sessionStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const writeSessionStorage = (key: string, value: string): void => {
  try {
    globalThis.sessionStorage?.setItem(key, value);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

const removeSessionStorage = (key: string): void => {
  try {
    globalThis.sessionStorage?.removeItem(key);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const parsePersistedWaypointEntry = (value: unknown): PersistedWaypointEntry | undefined => {
  if (!isRecord(value) || !isRecord(value.target)) return undefined;
  const { x, y } = value.target;
  if (typeof x !== "number" || typeof y !== "number") return undefined;
  return {
    target: { x, y },
    ...(typeof value.trackBarbarian === "boolean" ? { trackBarbarian: value.trackBarbarian } : {})
  };
};

export type ServerWaypointQueueWireEntry = { x: number; y: number; trackBarbarian?: boolean; queuedAt: number };

// Wire payloads for the server-durable waypoint-queue tail (see
// apps/simulation/src/runtime-waypoint-queue.ts). There's no MOVE_TO_FRONT
// command for this queue (unlike dev-queue) -- reordering is done via a full
// cancel-all + re-enqueue-in-order resync instead, see
// syncWaypointQueueToServer.
export const waypointEnqueueWirePayload = (target: { x: number; y: number }, trackBarbarian?: boolean): Record<string, unknown> => ({
  type: "WAYPOINT_ENQUEUE",
  x: target.x,
  y: target.y,
  ...(trackBarbarian ? { trackBarbarian: true } : {})
});

export const waypointCancelWirePayload = (target: { x: number; y: number }): Record<string, unknown> => ({
  type: "WAYPOINT_CANCEL",
  x: target.x,
  y: target.y
});

export const waypointCancelAllWirePayload = (): Record<string, unknown> => ({ type: "WAYPOINT_CANCEL_ALL" });

/**
 * Re-sync the full server-durable waypoint queue to match state.waypoint's
 * current order: cancel everything server-side, then re-enqueue each target
 * in order (capped at WAYPOINT_QUEUE_CLIENT_CAP, matching the server's own
 * cap). Called after any add/cancel/reorder of state.waypoint so the server
 * mirror never drifts from what the client actually has queued. A few extra
 * messages per mutation is a non-issue -- these are infrequent, human-paced
 * actions, not a per-tick hot path.
 */
export const syncWaypointQueueToServer = (
  state: Pick<ClientState, "waypoint">,
  sendGameMessage: ((payload: unknown) => boolean) | undefined
): void => {
  if (!sendGameMessage) return;
  sendGameMessage(waypointCancelAllWirePayload());
  for (const waypoint of state.waypoint.slice(0, WAYPOINT_QUEUE_CLIENT_CAP)) {
    sendGameMessage(waypointEnqueueWirePayload(waypoint.target, waypoint.trackBarbarian));
  }
};

export const persistWaypointQueueForPlayer = (playerId: string, queue: readonly ClientWaypoint[]): void => {
  if (!playerId || queue.length === 0) {
    removeSessionStorage(WAYPOINT_QUEUE_SESSION_KEY);
    return;
  }
  const entries: PersistedWaypointEntry[] = queue.map((w) => ({
    target: w.target,
    ...(w.trackBarbarian ? { trackBarbarian: true } : {})
  }));
  writeSessionStorage(WAYPOINT_QUEUE_SESSION_KEY, JSON.stringify({ playerId, queue: entries }));
};

/**
 * Restore the waypoint queue on login/reconnect. Skips any target already
 * owned by the player (reached while the tab was closed) and recomputes
 * each plan fresh via planWaypoint rather than trying to serialize stale
 * path/step data -- lastEnqueuedKey/consecutiveRetries intentionally reset,
 * since losing a tick of anti-thrash tolerance on reconnect is harmless.
 *
 * serverWaypointQueue (from the login snapshot / PLAYER_UPDATE, see
 * runtime-waypoint-queue.ts) is authoritative for ordering/presence: it kept
 * existing while this client was offline or on a different tab/device, so it
 * takes priority over -- and is merged ahead of -- sessionStorage, which only
 * covers a same-tab refresh.
 */
export const restorePersistedWaypointQueueForPlayer = (
  playerId: string,
  deps: {
    state: Pick<ClientState, "me" | "tiles" | "dockPairs" | "allies" | "activeTruces">;
    keyFor: (x: number, y: number) => string;
  },
  serverWaypointQueue?: readonly ServerWaypointQueueWireEntry[]
): ClientWaypoint[] => {
  if (!playerId) return [];
  const sessionKeyFor = (x: number, y: number): string => `${x},${y}`;
  const sessionEntries: PersistedWaypointEntry[] = [];
  const raw = readSessionStorage(WAYPOINT_QUEUE_SESSION_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { playerId?: unknown; queue?: unknown };
      if (parsed.playerId === playerId && Array.isArray(parsed.queue)) {
        for (const rawEntry of parsed.queue) {
          const entry = parsePersistedWaypointEntry(rawEntry);
          if (entry) sessionEntries.push(entry);
        }
      } else {
        removeSessionStorage(WAYPOINT_QUEUE_SESSION_KEY);
      }
    } catch {
      removeSessionStorage(WAYPOINT_QUEUE_SESSION_KEY);
    }
  }
  if (!serverWaypointQueue?.length && sessionEntries.length === 0) return [];

  const serverTargetKeys = new Set((serverWaypointQueue ?? []).map((entry) => sessionKeyFor(entry.x, entry.y)));
  const orderedEntries: PersistedWaypointEntry[] = [
    ...(serverWaypointQueue ?? []).map((entry) => ({
      target: { x: entry.x, y: entry.y },
      ...(entry.trackBarbarian ? { trackBarbarian: true } : {})
    })),
    ...sessionEntries.filter((entry) => !serverTargetKeys.has(sessionKeyFor(entry.target.x, entry.target.y)))
  ];

  const isInReach = localReachIsInReach(deps.state.tiles, deps.state.me, deps.keyFor);
  const restored: ClientWaypoint[] = [];
  for (const entry of orderedEntries) {
    const tile = deps.state.tiles.get(deps.keyFor(entry.target.x, entry.target.y));
    if (tile && tile.ownerId === playerId) continue; // already reached while offline
    restored.push({
      target: entry.target,
      plan: planWaypoint(entry.target, { state: deps.state, keyFor: deps.keyFor, isInReach }),
      ...(entry.trackBarbarian ? { trackBarbarian: true } : {})
    });
    if (restored.length >= WAYPOINT_QUEUE_CLIENT_CAP) break;
  }
  persistWaypointQueueForPlayer(playerId, restored);
  return restored;
};
