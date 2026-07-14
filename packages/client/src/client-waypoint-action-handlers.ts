import { planWaypoint } from "./client-waypoint-planner/client-waypoint-planner.js";
import { showVisibleActionWarning } from "./client-visible-action-warning.js";
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
  },
  feedPrefix?: string
): boolean => {
  const { state, selected, keyFor, pushFeed, hideTileActionMenu, showCaptureAlert, processActionQueue, renderHud } = params;
  const plan: WaypointPlan = planWaypoint({ x: selected.x, y: selected.y }, { state, keyFor });
  if (!plan.reachable) {
    showVisibleActionWarning({ pushFeed, showCaptureAlert }, "Action blocked", "No expansion path to that tile.");
    hideTileActionMenu();
    renderHud();
    return true;
  }
  const selectedTile = state.tiles.get(keyFor(selected.x, selected.y));
  state.waypoint = {
    target: { x: selected.x, y: selected.y },
    plan,
    trackBarbarian: selectedTile?.ownerId === "barbarian-1"
  };
  const summary = plan.attackCount > 0
    ? `${plan.expandCount} expand + ${plan.attackCount} attack`
    : `${plan.expandCount} expand`;
  pushFeed(`${feedPrefix ?? ""}Waypoint set at (${selected.x}, ${selected.y}) — ${summary}.`, "info", "info");
  hideTileActionMenu();
  processActionQueue();
  renderHud();
  return true;
};

export const handleWaypointAction = (deps: WaypointHandlerDeps): boolean => {
  const { state, selected, actionId, keyFor, pushFeed, renderHud, hideTileActionMenu, showCaptureAlert, processActionQueue } = deps;

  if (actionId === "cancel_waypoint") {
    if (state.waypoint) {
      const target = state.waypoint.target;
      state.waypoint = undefined;
      pushFeed(`Waypoint at (${target.x}, ${target.y}) cancelled.`, "info", "info");
    }
    hideTileActionMenu();
    renderHud();
    return true;
  }

  if (actionId === "clear_waypoint_and_expand_here" && selected) {
    const oldTarget = state.waypoint?.target;
    state.waypoint = undefined;
    const feedPrefix = oldTarget ? `(cleared waypoint at (${oldTarget.x}, ${oldTarget.y})) ` : "";
    return setWaypointForSelected({ state, selected, keyFor, pushFeed, hideTileActionMenu, showCaptureAlert, processActionQueue, renderHud }, feedPrefix);
  }

  if (actionId === "expand_here" && selected) {
    return setWaypointForSelected({ state, selected, keyFor, pushFeed, hideTileActionMenu, showCaptureAlert, processActionQueue, renderHud });
  }

  return false;
};
