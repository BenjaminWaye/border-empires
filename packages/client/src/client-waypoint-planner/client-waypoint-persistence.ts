import { DEV_QUEUE_SERVER_CAP } from "@border-empires/shared";
import { planWaypoint } from "./client-waypoint-planner.js";
import type { ClientState, ClientWaypoint } from "../client-state/client-state.js";

// Client-side sessionStorage persistence for the waypoint/expand queue,
// mirroring client-development-queue.ts's pattern for developmentQueue:
// survives a page refresh or reconnect on the same tab, but is not a
// server-side durable queue (that's a separate, larger follow-up). Reuses
// DEV_QUEUE_SERVER_CAP as the client-side bound so both queues share one
// number until a real server cap is designed.
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
 */
export const restorePersistedWaypointQueueForPlayer = (
  playerId: string,
  deps: {
    state: Pick<ClientState, "me" | "tiles" | "dockPairs" | "allies" | "activeTruces">;
    keyFor: (x: number, y: number) => string;
  }
): ClientWaypoint[] => {
  if (!playerId) return [];
  const raw = readSessionStorage(WAYPOINT_QUEUE_SESSION_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { playerId?: unknown; queue?: unknown };
    if (parsed.playerId !== playerId || !Array.isArray(parsed.queue)) {
      removeSessionStorage(WAYPOINT_QUEUE_SESSION_KEY);
      return [];
    }
    const restored: ClientWaypoint[] = [];
    for (const raw of parsed.queue) {
      const entry = parsePersistedWaypointEntry(raw);
      if (!entry) continue;
      const tile = deps.state.tiles.get(deps.keyFor(entry.target.x, entry.target.y));
      if (tile && tile.ownerId === playerId) continue; // already reached while offline
      restored.push({
        target: entry.target,
        plan: planWaypoint(entry.target, { state: deps.state, keyFor: deps.keyFor }),
        ...(entry.trackBarbarian ? { trackBarbarian: true } : {})
      });
      if (restored.length >= WAYPOINT_QUEUE_CLIENT_CAP) break;
    }
    persistWaypointQueueForPlayer(playerId, restored);
    return restored;
  } catch {
    removeSessionStorage(WAYPOINT_QUEUE_SESSION_KEY);
    return [];
  }
};
