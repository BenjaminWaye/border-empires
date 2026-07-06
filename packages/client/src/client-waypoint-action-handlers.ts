import { planWaypoint } from "./client-waypoint-planner/client-waypoint-planner.js";
import { showVisibleActionWarning } from "./client-visible-action-warning.js";
import type { ClientState } from "./client-state/client-state.js";

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
    const plan = planWaypoint({ x: selected.x, y: selected.y }, { state, keyFor });
    if (!plan.reachable) {
      showVisibleActionWarning({ pushFeed, showCaptureAlert }, "Action blocked", "No expansion path to that tile.");
      hideTileActionMenu();
      renderHud();
      return true;
    }
    state.waypoint = { target: { x: selected.x, y: selected.y }, plan };
    const summary = plan.attackCount > 0
      ? `${plan.expandCount} expand + ${plan.attackCount} attack`
      : `${plan.expandCount} expand`;
    const oldInfo = oldTarget ? `(cleared waypoint at (${oldTarget.x}, ${oldTarget.y})) ` : "";
    pushFeed(`${oldInfo}Waypoint set at (${selected.x}, ${selected.y}) — ${summary}.`, "info", "info");
    hideTileActionMenu();
    processActionQueue();
    renderHud();
    return true;
  }

  if (actionId === "expand_here" && selected) {
    const plan = planWaypoint({ x: selected.x, y: selected.y }, { state, keyFor });
    if (!plan.reachable) {
      showVisibleActionWarning({ pushFeed, showCaptureAlert }, "Action blocked", "No expansion path to that tile.");
      hideTileActionMenu();
      renderHud();
      return true;
    }
    state.waypoint = { target: { x: selected.x, y: selected.y }, plan };
    const summary = plan.attackCount > 0
      ? `${plan.expandCount} expand + ${plan.attackCount} attack`
      : `${plan.expandCount} expand`;
    pushFeed(`Waypoint set at (${selected.x}, ${selected.y}) — ${summary}.`, "info", "info");
    hideTileActionMenu();
    processActionQueue();
    renderHud();
    return true;
  }

  return false;
};
