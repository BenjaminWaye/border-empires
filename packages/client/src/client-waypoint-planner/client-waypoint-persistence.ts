import {
  COMBAT_LOCK_MS,
  DEV_QUEUE_SERVER_CAP,
  EXPAND_MANPOWER_COST,
  FRONTIER_CLAIM_COST,
  FRONTIER_CLAIM_MS,
  WAYPOINT_MAX_WIRE_STEPS,
  requiredMusterForTarget,
  wireStepsForPlan,
  type WaypointPlan,
  type WaypointStep,
  type WaypointWireStep
} from "@border-empires/shared";
import { planWaypoint } from "./client-waypoint-planner.js";
import { authoritativeIsInReach } from "../client-reach-authoritative/client-reach-authoritative.js";
import { attackSyncLog } from "../client-debug/client-debug.js";
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

/**
 * Reconstruct a WaypointPlan from the server's remaining wire steps (from
 * `cursor` on) instead of re-running planWaypoint -- see plan §6: on
 * reconnect the client adopts the server entry's remaining steps as its
 * local plan so topUpFromWaypoint resumes exactly where the server left
 * off, rather than blind re-planning against tiles that may not have
 * arrived yet. Cost fields aren't carried over the wire (WaypointWireStep is
 * deliberately narrow -- see waypoint-planner-types.ts), so they're
 * recomputed the same way planWaypoint itself derives them per step.
 */
const planFromServerSteps = (
  entry: ServerWaypointQueueWireEntry,
  deps: { state: Pick<ClientState, "tiles">; keyFor: (x: number, y: number) => string }
): WaypointPlan | undefined => {
  const allSteps = entry.steps;
  if (!allSteps || allSteps.length === 0) return undefined;
  const cursor = Math.max(0, entry.cursor ?? 0);
  const remaining = allSteps.slice(cursor);
  if (remaining.length === 0) return undefined;
  let totalGold = 0;
  let totalManpower = 0;
  let totalDurationMs = 0;
  let expandCount = 0;
  let attackCount = 0;
  const steps: WaypointStep[] = remaining.map((wireStep) => {
    const targetTile = deps.state.tiles.get(deps.keyFor(wireStep.target.x, wireStep.target.y));
    const manpowerCost = wireStep.action === "ATTACK" ? requiredMusterForTarget(targetTile) : EXPAND_MANPOWER_COST;
    const durationMs = wireStep.action === "ATTACK" ? COMBAT_LOCK_MS : FRONTIER_CLAIM_MS;
    totalGold += FRONTIER_CLAIM_COST;
    totalManpower += manpowerCost;
    totalDurationMs += durationMs;
    if (wireStep.action === "ATTACK") attackCount += 1;
    else expandCount += 1;
    return {
      origin: { ...wireStep.origin },
      target: { ...wireStep.target },
      action: wireStep.action,
      durationMs,
      goldCost: FRONTIER_CLAIM_COST,
      manpowerCost,
      manpowerMin: manpowerCost,
      throughFog: Boolean(targetTile?.fogged),
      viaDock: false
    };
  });
  return {
    target: { x: entry.x, y: entry.y },
    steps,
    totalGold,
    totalManpower,
    totalDurationMs,
    expandCount,
    attackCount,
    reachable: true
  };
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

export type ServerWaypointQueueWireEntry = {
  x: number;
  y: number;
  trackBarbarian?: boolean;
  queuedAt: number;
  planId?: string;
  plannedAt?: number;
  steps?: WaypointWireStep[];
  cursor?: number;
  stalled?: boolean;
};

// Wire payloads for the server-durable waypoint-queue tail (see
// apps/simulation/src/runtime-waypoint-queue.ts / runtime-waypoint-drain/).
// There's no MOVE_TO_FRONT command for this queue (unlike dev-queue) --
// reordering is done via a full cancel-all + re-enqueue-in-order resync
// instead, see syncWaypointQueueToServer.
//
// steps/planId/plannedAt carry the client's full planWaypoint() route (see
// docs/waypoint-client-planning-plan.md §1) so the server can replay it
// verbatim while this client is offline instead of guessing a single-leg
// route. Bounded at WAYPOINT_MAX_WIRE_STEPS -- an over-cap plan is sent
// target-only (steps omitted) rather than dropped outright, degrading
// gracefully to today's single-leg server drain for that one waypoint
// rather than having the whole enqueue rejected.
export const waypointEnqueueWirePayload = (
  target: { x: number; y: number },
  trackBarbarian?: boolean,
  plan?: { planId?: string; plannedAt?: number; steps: WaypointWireStep[] }
): Record<string, unknown> => ({
  type: "WAYPOINT_ENQUEUE",
  x: target.x,
  y: target.y,
  ...(trackBarbarian ? { trackBarbarian: true } : {}),
  ...(plan && plan.planId ? { planId: plan.planId } : {}),
  ...(plan && plan.plannedAt !== undefined ? { plannedAt: plan.plannedAt } : {}),
  ...(plan && plan.steps.length > 0 && plan.steps.length <= WAYPOINT_MAX_WIRE_STEPS ? { steps: plan.steps } : {})
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
    sendGameMessage(
      waypointEnqueueWirePayload(waypoint.target, waypoint.trackBarbarian, {
        ...(waypoint.planId ? { planId: waypoint.planId } : {}),
        ...(waypoint.plannedAt !== undefined ? { plannedAt: waypoint.plannedAt } : {}),
        steps: waypoint.plan.reachable ? wireStepsForPlan(waypoint.plan.steps ?? []) : []
      })
    );
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
    state: Pick<ClientState, "me" | "tiles" | "dockPairs" | "allies" | "activeTruces" | "serverReach" | "serverReachRevision">;
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
  // Diagnostic only (see restorePersistedWaypointQueueForPlayer's own doc
  // comment above): a waypoint that a player placed and never cancelled has
  // twice now come back empty on reconnect with no error and no trace, and
  // a live SQLite check on staging showed the server's own durable command
  // log never received a WAYPOINT_CANCEL for it -- so the loss, if real, is
  // happening somewhere in this restore, not server-side. Every branch below
  // that can produce an empty or shrunk result now logs why, so the next
  // occurrence is provable directly from the recentDebugEvents in a
  // diagnostics bundle instead of requiring another manual DB inspection.
  const serverCount = serverWaypointQueue?.length ?? 0;
  if (serverCount === 0 && sessionEntries.length === 0) {
    attackSyncLog("waypoint-restore-empty", { playerId, serverProvided: serverWaypointQueue !== undefined });
    return [];
  }

  const serverTargetKeys = new Set((serverWaypointQueue ?? []).map((entry) => sessionKeyFor(entry.x, entry.y)));
  type OrderedEntry = PersistedWaypointEntry & { serverEntry?: ServerWaypointQueueWireEntry };
  const orderedEntries: OrderedEntry[] = [
    ...(serverWaypointQueue ?? []).map((entry) => ({
      target: { x: entry.x, y: entry.y },
      ...(entry.trackBarbarian ? { trackBarbarian: true } : {}),
      serverEntry: entry
    })),
    ...sessionEntries.filter((entry) => !serverTargetKeys.has(sessionKeyFor(entry.target.x, entry.target.y)))
  ];

  const isInReach = authoritativeIsInReach(deps.state, deps.keyFor);
  const restored: ClientWaypoint[] = [];
  const alreadyOwnedTargets: Array<{ x: number; y: number }> = [];
  for (const entry of orderedEntries) {
    const tile = deps.state.tiles.get(deps.keyFor(entry.target.x, entry.target.y));
    if (tile && tile.ownerId === playerId) { alreadyOwnedTargets.push(entry.target); continue; } // already reached while offline
    // Adopt the server's remaining steps (from `cursor` on) as the local
    // plan when it's a recognizable, non-stalled plan -- resumes exactly
    // where the server left off instead of re-planning blind (plan §6).
    // Falls back to a fresh planWaypoint() run for a stalled entry, a
    // legacy target-only entry, or a session-only (not server-known) one.
    const serverEntry = entry.serverEntry;
    const resumedPlan = serverEntry && !serverEntry.stalled ? planFromServerSteps(serverEntry, deps) : undefined;
    restored.push({
      target: entry.target,
      plan: resumedPlan ?? planWaypoint(entry.target, { state: deps.state, keyFor: deps.keyFor, isInReach }),
      ...(entry.trackBarbarian ? { trackBarbarian: true } : {}),
      ...(serverEntry?.planId ? { planId: serverEntry.planId } : {}),
      ...(serverEntry?.plannedAt !== undefined ? { plannedAt: serverEntry.plannedAt } : {})
    });
    if (restored.length >= WAYPOINT_QUEUE_CLIENT_CAP) break;
  }
  if (restored.length !== orderedEntries.length) {
    attackSyncLog("waypoint-restore-filtered", {
      playerId,
      serverCount,
      sessionCount: sessionEntries.length,
      orderedCount: orderedEntries.length,
      restoredCount: restored.length,
      alreadyOwnedTargets
    });
  }
  persistWaypointQueueForPlayer(playerId, restored);
  return restored;
};
