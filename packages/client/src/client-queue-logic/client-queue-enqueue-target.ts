import type { ClientState } from "../client-state/client-state.js";

// Split out of client-queue-logic.ts (over the repo's 500-line growth cap),
// which re-exports it so existing importers are unchanged.

export const enqueueTarget = (
  state: ClientState,
  x: number,
  y: number,
  keyFor: (x: number, y: number) => string,
  options: { fromWaypoint?: boolean } = {}
): boolean => {
  const targetKey = keyFor(x, y);
  const frontierSyncWaitUntil = state.frontierSyncWaitUntilByTarget.get(targetKey) ?? 0;
  if (frontierSyncWaitUntil > Date.now()) return false;
  if (state.queuedTargetKeys.has(targetKey)) {
    const stillQueued = state.actionQueue.some((entry) => keyFor(entry.x, entry.y) === targetKey);
    const currentlyExecuting = state.actionInFlight && state.actionTargetKey === targetKey;
    if (!stillQueued && !currentlyExecuting) state.queuedTargetKeys.delete(targetKey);
  }
  if (state.queuedTargetKeys.has(targetKey)) return false;
  const entry: { x: number; y: number; retries: number; fromWaypoint?: boolean } = { x, y, retries: 0 };
  if (options.fromWaypoint) entry.fromWaypoint = true;
  state.actionQueue.push(entry);
  state.queuedTargetKeys.add(targetKey);
  return true;
};
