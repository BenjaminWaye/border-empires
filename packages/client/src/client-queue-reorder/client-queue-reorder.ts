// Development/waypoint/action-queue cancel and move-to-front helpers,
// extracted out of client-queue-logic.ts (over the file-line cap) — these
// are a cohesive "reorder/cancel an already-queued entry" concern, distinct
// from that file's own frontier-action dispatch logic. Re-exported from
// client-queue-logic.ts so existing imports of these names don't need to
// change (see that file's own re-export block for the same pattern applied
// to client-attack-preview-logic.ts).
import {
  devQueueCancelWirePayload,
  devQueueMoveToFrontWirePayload,
  persistDevelopmentQueueForPlayer,
  persistSkippedAutoSettlementTileKeysForPlayer,
  queuedSettlementOrderForTile
} from "../client-development-queue/client-development-queue.js";
import {
  persistWaypointQueueForPlayer,
  syncWaypointQueueToServer,
  waypointCancelWirePayload
} from "../client-waypoint-planner/client-waypoint-persistence.js";
import type { ClientState } from "../client-state/client-state.js";

type QueuedDevelopmentAction = ClientState["developmentQueue"][number];
type FeedFn = (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;

export const queuedDevelopmentEntryForTile = (state: ClientState, tileKey: string): QueuedDevelopmentAction | undefined =>
  state.developmentQueue.find((entry) => entry.tileKey === tileKey);

export const queuedSettlementIndexForTile = (state: ClientState, tileKey: string): number =>
  queuedSettlementOrderForTile(state.developmentQueue, tileKey);

export const queuedEntryIndexForTile = (state: ClientState, tileKey: string): number =>
  state.developmentQueue.findIndex((entry) => entry.tileKey === tileKey);

export const queuedBuildEntryForTile = (state: ClientState, tileKey: string): Extract<QueuedDevelopmentAction, { kind: "BUILD" }> | undefined => {
  const entry = state.developmentQueue.find((queued) => queued.tileKey === tileKey && queued.kind === "BUILD");
  return entry && entry.kind === "BUILD" ? entry : undefined;
};

export const cancelQueuedSettlement = (
  state: ClientState,
  tileKey: string,
  deps: { pushFeed: FeedFn; renderHud: () => void; sendGameMessage?: (payload: unknown) => boolean }
): boolean => {
  const nextQueue = state.developmentQueue.filter((entry) => !(entry.kind === "SETTLE" && entry.tileKey === tileKey));
  if (nextQueue.length === state.developmentQueue.length) return false;
  state.developmentQueue = nextQueue;
  state.autoSettlementQueueVisibleUntilByTile.delete(tileKey);
  if (state.autoSettlementQueue.some((entry) => `${entry.x},${entry.y}` === tileKey)) {
    state.skippedAutoSettlementTileKeys.add(tileKey);
    persistSkippedAutoSettlementTileKeysForPlayer(state.me, state.skippedAutoSettlementTileKeys);
  }
  persistDevelopmentQueueForPlayer(state.me, state.developmentQueue);
  deps.sendGameMessage?.(devQueueCancelWirePayload(tileKey));
  deps.pushFeed(`Queued settlement at ${tileKey} cancelled.`, "combat", "info");
  deps.renderHud();
  return true;
};

export const cancelQueuedBuild = (
  state: ClientState,
  tileKey: string,
  deps: { pushFeed: FeedFn; renderHud: () => void; sendGameMessage?: (payload: unknown) => boolean }
): boolean => {
  const entry = queuedBuildEntryForTile(state, tileKey);
  if (!entry) return false;
  const nextQueue = state.developmentQueue.filter((queued) => queued !== entry);
  state.developmentQueue = nextQueue;
  persistDevelopmentQueueForPlayer(state.me, state.developmentQueue);
  deps.sendGameMessage?.(devQueueCancelWirePayload(tileKey));
  deps.pushFeed(`${entry.label} cancelled.`, "combat", "info");
  deps.renderHud();
  return true;
};

export const moveQueuedEntryToFront = (
  state: ClientState,
  tileKey: string,
  deps: { pushFeed: FeedFn; renderHud: () => void; sendGameMessage?: (payload: unknown) => boolean }
): boolean => {
  const entry = state.developmentQueue.find((queued) => queued.tileKey === tileKey);
  if (!entry) return false;
  const index = state.developmentQueue.indexOf(entry);
  if (index <= 0) return false;
  const nextQueue = state.developmentQueue.filter((queued) => queued !== entry);
  nextQueue.unshift(entry);
  state.developmentQueue = nextQueue;
  persistDevelopmentQueueForPlayer(state.me, state.developmentQueue);
  deps.sendGameMessage?.(devQueueMoveToFrontWirePayload(tileKey));
  deps.pushFeed(`${entry.label} moved to the front of the queue.`, "combat", "info");
  deps.renderHud();
  return true;
};

export const waypointIndexForTile = (state: ClientState, x: number, y: number): number =>
  state.waypoint.findIndex((entry) => entry.target.x === x && entry.target.y === y);

export const cancelQueuedWaypointEntry = (
  state: ClientState,
  x: number,
  y: number,
  deps: { pushFeed: FeedFn; renderHud: () => void; sendGameMessage?: (payload: unknown) => boolean }
): boolean => {
  const index = waypointIndexForTile(state, x, y);
  if (index < 0) return false;
  state.waypoint.splice(index, 1);
  persistWaypointQueueForPlayer(state.me, state.waypoint);
  deps.sendGameMessage?.(waypointCancelWirePayload({ x, y }));
  deps.pushFeed(`Waypoint at (${x}, ${y}) cancelled.`, "info", "info");
  deps.renderHud();
  return true;
};

export const moveWaypointToFront = (
  state: ClientState,
  x: number,
  y: number,
  deps: { pushFeed: FeedFn; renderHud: () => void; sendGameMessage?: (payload: unknown) => boolean }
): boolean => {
  const index = waypointIndexForTile(state, x, y);
  if (index <= 0) return false;
  const [entry] = state.waypoint.splice(index, 1);
  if (!entry) return false;
  // The entry being promoted may have been active before (and accumulated
  // lastEnqueuedKey/consecutiveRetries anti-thrash bookkeeping) and the
  // previously-active entry is about to go dormant. Reset both, mirroring
  // restorePersistedWaypointQueueForPlayer's rationale: losing a tick of
  // anti-thrash tolerance across an activity gap is harmless, but carrying
  // a stale retry count forward can cause a premature "Waypoint halted"
  // once this entry (or the demoted one) becomes active again.
  const demoted = state.waypoint[0];
  if (demoted) {
    delete demoted.lastEnqueuedKey;
    demoted.consecutiveRetries = 0;
  }
  delete entry.lastEnqueuedKey;
  entry.consecutiveRetries = 0;
  state.waypoint.unshift(entry);
  persistWaypointQueueForPlayer(state.me, state.waypoint);
  syncWaypointQueueToServer(state, deps.sendGameMessage); // no MOVE_TO_FRONT command server-side; resync order instead
  deps.pushFeed(`Waypoint to (${x}, ${y}) moved to the front of the queue.`, "info", "info");
  deps.renderHud();
  return true;
};

export const actionQueueIndexForTile = (state: ClientState, x: number, y: number): number =>
  state.actionQueue.findIndex((entry) => entry.x === x && entry.y === y);

export const cancelQueuedExpandEntry = (
  state: ClientState,
  x: number,
  y: number,
  deps: { keyFor: (x: number, y: number) => string; pushFeed: FeedFn; renderHud: () => void }
): boolean => {
  const index = actionQueueIndexForTile(state, x, y);
  if (index < 0) return false;
  const [entry] = state.actionQueue.splice(index, 1);
  if (!entry) return false;
  const targetKey = deps.keyFor(x, y);
  state.queuedTargetKeys.delete(targetKey);
  // If this hop was auto-enqueued by the active waypoint, clear its
  // lastEnqueuedKey/retry bookkeeping so the next top-up cleanly re-plans
  // instead of miscounting the cancellation as a stalled retry.
  const activeWaypoint = state.waypoint[0];
  if (entry.fromWaypoint && activeWaypoint?.lastEnqueuedKey === targetKey) {
    delete activeWaypoint.lastEnqueuedKey;
    activeWaypoint.consecutiveRetries = 0;
  }
  deps.pushFeed(`Queued frontier action at (${x}, ${y}) cancelled.`, "combat", "info");
  deps.renderHud();
  return true;
};

export const moveActionQueueEntryToFront = (
  state: ClientState,
  x: number,
  y: number,
  deps: { pushFeed: FeedFn; renderHud: () => void }
): boolean => {
  const index = actionQueueIndexForTile(state, x, y);
  if (index <= 0) return false;
  const [entry] = state.actionQueue.splice(index, 1);
  if (!entry) return false;
  state.actionQueue.unshift(entry);
  deps.pushFeed(`Queued frontier action at (${x}, ${y}) moved to the front of the queue.`, "combat", "info");
  deps.renderHud();
  return true;
};
