import type { ArrowGesturePoint } from "./client-map-input-arrow-gesture.js";
import type { ClientState } from "./client-state/client-state.js";
import type { FeedSeverity, FeedType } from "./client-types.js";

// Workstream F1 (docs/replenishment-update-plan.md): THIS SLICE's confirm
// seam only. The confirm-sheet UI and the SET_MUSTER send it will trigger
// are the NEXT slice's job -- deliberately not built here. This module is
// the single hook that slice will call into (or replace the body of):
// right now it just logs and stashes the {origin, target} pair on state so
// something can be pointed at it later.

export type ArrowGestureConfirmDeps = {
  pushFeed: (msg: string, type?: FeedType, severity?: FeedSeverity) => void;
};

/**
 * Called once per confirmed arrow-drag gesture (releaseArrowGesture's
 * "confirm" result). Does NOT send SET_MUSTER and does NOT open any UI --
 * see module comment.
 */
export const handleArrowGestureConfirm = (
  state: Pick<ClientState, "pendingArrowGestureConfirm">,
  origin: ArrowGesturePoint,
  target: ArrowGesturePoint,
  deps: ArrowGestureConfirmDeps
): void => {
  state.pendingArrowGestureConfirm = { origin, target };
  // eslint-disable-next-line no-console
  console.log("[F1 arrow-gesture] confirmed", { origin, target });
  deps.pushFeed(`Arrow gesture: (${origin.x}, ${origin.y}) -> (${target.x}, ${target.y})`, "combat", "info");
};
