import { planWaypoint } from "./client-waypoint-planner/client-waypoint-planner.js";
import { authoritativeIsInReach } from "./client-reach-authoritative/client-reach-authoritative.js";
import { wireStepsForPlan } from "@border-empires/shared";
import {
  persistWaypointQueueForPlayer,
  waypointCancelAllWirePayload,
  waypointCancelWirePayload,
  waypointEnqueueWirePayload,
  WAYPOINT_QUEUE_CLIENT_CAP
} from "./client-waypoint-planner/client-waypoint-persistence.js";
import { showVisibleActionWarning } from "./client-visible-action-warning.js";
import { announceDiscoveryTip } from "./client-discovery-tips/client-discovery-tip-overlay.js";
import { pushDiscoveryTipFeedEntry } from "./client-alerts/client-alerts.js";
import type { ClientState } from "./client-state/client-state.js";
import type { WaypointPlan } from "./client-waypoint-planner/client-waypoint-planner.js";

type WaypointHandlerDeps = {
  state: ClientState;
  selected: { x: number; y: number } | undefined;
  actionId: string;
  keyFor: (x: number, y: number) => string;
  pushFeed: (message: string, type?: string, severity?: string) => void;
  renderHud: () => void;
  hideTileActionMenu: () => void;
  showCaptureAlert: (title: string, detail: string, tone?: "error" | "success" | "warn", manpowerLoss?: number) => void;
  processActionQueue: () => boolean;
  sendGameMessage?: (payload: unknown) => boolean;
};

const setWaypointForSelected = (
  params: {
    state: ClientState;
    selected: { x: number; y: number };
    keyFor: (x: number, y: number) => string;
    pushFeed: (message: string, type?: string, severity?: string) => void;
    hideTileActionMenu: () => void;
    showCaptureAlert: (title: string, detail: string, tone?: "error" | "success" | "warn") => void;
    processActionQueue: () => boolean;
    renderHud: () => void;
    sendGameMessage?: (payload: unknown) => boolean;
  },
  feedPrefix?: string
): boolean => {
  const { state, selected, keyFor, pushFeed, hideTileActionMenu, showCaptureAlert, processActionQueue, renderHud, sendGameMessage } = params;
  if (state.waypoint.length >= WAYPOINT_QUEUE_CLIENT_CAP) {
    showVisibleActionWarning(
      { pushFeed, showCaptureAlert },
      "Action blocked",
      `Waypoint queue is full (${WAYPOINT_QUEUE_CLIENT_CAP}/${WAYPOINT_QUEUE_CLIENT_CAP}). Cancel something before queuing more.`
    );
    hideTileActionMenu();
    renderHud();
    return true;
  }
  const isInReach = authoritativeIsInReach(state, keyFor);
  const plan: WaypointPlan = planWaypoint({ x: selected.x, y: selected.y }, { state, keyFor, isInReach });
  if (!plan.reachable) {
    showVisibleActionWarning({ pushFeed, showCaptureAlert }, "Action blocked", "No expansion path to that tile.");
    hideTileActionMenu();
    renderHud();
    return true;
  }
  // EXPAND isn't reach-gated server-side -- this waypoint's destination can
  // still land outside the player's reach, it'll just start decaying two
  // minutes after the claim lands unless reach is extended to it. Warn them
  // now, at the moment they queue it, rather than only after the server's
  // tile-delta confirms the decay stamp (client-action-flow.ts's
  // frontierDecayKind handler) -- by then the claim/decay is already
  // underway and the "why" is easy to miss.
  if (!isInReach(selected.x, selected.y) && state.discoveryTipQueue) {
    announceDiscoveryTip(state.discoveryTipQueue, "OUT_OF_REACH_EXPAND", state.authEmail, renderHud, (def) =>
      pushDiscoveryTipFeedEntry(state, def)
    );
  }
  const selectedTile = state.tiles.get(keyFor(selected.x, selected.y));
  const trackBarbarian = selectedTile?.ownerId === "barbarian-1";
  const planId = `plan-${state.me}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const plannedAt = Date.now();
  state.waypoint.push({
    target: { x: selected.x, y: selected.y },
    plan,
    trackBarbarian,
    planId,
    plannedAt
  });
  persistWaypointQueueForPlayer(state.me, state.waypoint);
  sendGameMessage?.(
    waypointEnqueueWirePayload({ x: selected.x, y: selected.y }, trackBarbarian, {
      planId,
      plannedAt,
      steps: wireStepsForPlan(plan.steps)
    })
  );
  const summary = plan.attackCount > 0
    ? `${plan.expandCount} expand + ${plan.attackCount} attack`
    : `${plan.expandCount} expand`;
  const queueLabel = state.waypoint.length > 1 ? ` (${state.waypoint.length} waypoints queued)` : "";
  pushFeed(`${feedPrefix ?? ""}Waypoint set at (${selected.x}, ${selected.y}) — ${summary}.${queueLabel}`, "info", "info");
  hideTileActionMenu();
  processActionQueue();
  renderHud();
  return true;
};

export const handleWaypointAction = (deps: WaypointHandlerDeps): boolean => {
  const { state, selected, actionId, keyFor, pushFeed, renderHud, hideTileActionMenu, showCaptureAlert, processActionQueue, sendGameMessage } = deps;

  if (actionId === "cancel_waypoint") {
    const index = selected ? state.waypoint.findIndex((w) => w.target.x === selected.x && w.target.y === selected.y) : -1;
    if (index >= 0 && selected) {
      state.waypoint.splice(index, 1);
      persistWaypointQueueForPlayer(state.me, state.waypoint);
      sendGameMessage?.(waypointCancelWirePayload(selected));
      pushFeed(`Waypoint at (${selected.x}, ${selected.y}) cancelled.`, "info", "info");
    }
    hideTileActionMenu();
    renderHud();
    return true;
  }

  if (actionId === "clear_waypoint_and_expand_here" && selected) {
    const oldCount = state.waypoint.length;
    const oldTargets = state.waypoint.map((w) => `(${w.target.x}, ${w.target.y})`).join(", ");
    state.waypoint = [];
    persistWaypointQueueForPlayer(state.me, state.waypoint);
    sendGameMessage?.(waypointCancelAllWirePayload());
    const feedPrefix = oldCount > 0 ? `(cleared ${oldCount} waypoint${oldCount > 1 ? "s" : ""}: ${oldTargets}) ` : "";
    return setWaypointForSelected(
      { state, selected, keyFor, pushFeed, hideTileActionMenu, showCaptureAlert, processActionQueue, renderHud, ...(sendGameMessage ? { sendGameMessage } : {}) },
      feedPrefix
    );
  }

  if (actionId === "expand_here" && selected) {
    return setWaypointForSelected({ state, selected, keyFor, pushFeed, hideTileActionMenu, showCaptureAlert, processActionQueue, renderHud, ...(sendGameMessage ? { sendGameMessage } : {}) });
  }

  return false;
};
