import { showArrowGestureConfirmSheet } from "./client-arrow-gesture-confirm-sheet.js";
import type { ArrowGesturePoint } from "./client-map-input-arrow-gesture.js";
import type { ClientState } from "./client-state/client-state.js";
import type { FeedSeverity, FeedType } from "./client-types.js";

// Workstream F1 (docs/replenishment-update-plan.md): the confirm seam for a
// released arrow-drag gesture. Was a placeholder (log + stash on state)
// through F1's DOM-wiring slice; now stashes the pending {origin, target}
// pair on state (still read by client-arrow-gesture-confirm-sheet.ts's
// dismiss path) and opens the real confirm sheet, which is what actually
// sends SET_MUSTER on "Go" -- see that module.

export type ArrowGestureConfirmDeps = {
  pushFeed: (msg: string, type?: FeedType, severity?: FeedSeverity) => void;
  sendGameMessage: (payload: unknown) => boolean;
  renderHud: () => void;
  keyFor: (x: number, y: number) => string;
};

/**
 * Called once per confirmed arrow-drag gesture (releaseArrowGesture's
 * "confirm" result). Opens the confirm sheet; the sheet itself sends
 * SET_MUSTER and clears state.pendingArrowGestureConfirm on "Go" or cancel.
 */
export const handleArrowGestureConfirm = (
  state: Pick<ClientState, "tiles" | "manpowerCap" | "pendingArrowGestureConfirm">,
  origin: ArrowGesturePoint,
  target: ArrowGesturePoint,
  deps: ArrowGestureConfirmDeps
): void => {
  state.pendingArrowGestureConfirm = { origin, target };
  deps.pushFeed(`Arrow gesture: (${origin.x}, ${origin.y}) -> (${target.x}, ${target.y})`, "combat", "info");
  showArrowGestureConfirmSheet(state, origin, target, deps.keyFor, {
    sendGameMessage: deps.sendGameMessage,
    renderHud: deps.renderHud
  });
};
