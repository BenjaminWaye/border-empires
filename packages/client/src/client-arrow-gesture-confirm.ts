import { musterMarchDistanceTiles, musterMarchTooFarAdvice } from "@border-empires/shared";
import { showArrowGestureConfirmSheet } from "./client-arrow-gesture-confirm-sheet.js";
import type { ArrowGesturePoint } from "./client-arrow-gesture-confirm-payload.js";
import type { ClientState } from "./client-state/client-state.js";
import type { FeedSeverity, FeedType } from "./client-types.js";

// F-revision (docs/replenishment-update-plan.md, "the hold-drag gesture is
// replaced by click-to-target"): the confirm seam for an armed March-To
// click. Called once a legal target tile has been clicked (not dragged --
// client-muster-march-targeting.ts's handleMusterMarchTargetClick), this
// draws the static arrow (state.arrowGesture, origin/target now fixed --
// client-map-3d-arrow-overlay.ts / the 2D equivalent read it the same way
// they did for the old live drag) and opens the confirm sheet, which is
// what actually sends SET_MUSTER on "Go" -- see that module.

export type ArrowGestureConfirmDeps = {
  pushFeed: (msg: string, type?: FeedType, severity?: FeedSeverity) => void;
  sendGameMessage: (payload: unknown) => boolean;
  renderHud: () => void;
  keyFor: (x: number, y: number) => string;
};

/**
 * Called once per armed March-To target click. Opens the confirm sheet; the
 * sheet itself sends SET_MUSTER and clears state.pendingArrowGestureConfirm
 * / state.arrowGesture on "Go" or cancel.
 */
export const handleArrowGestureConfirm = (
  state: Pick<ClientState, "tiles" | "manpowerCap" | "pendingArrowGestureConfirm" | "arrowGesture" | "me" | "winChancePaint">,
  origin: ArrowGesturePoint,
  target: ArrowGesturePoint,
  deps: ArrowGestureConfirmDeps
): void => {
  // Over the march cap: advise raising a flag closer instead of opening a
  // sheet whose "Go" the server would refuse. Plain advice, not an error.
  const tooFarAdvice = musterMarchTooFarAdvice(musterMarchDistanceTiles(origin.x, origin.y, target.x, target.y));
  if (tooFarAdvice) {
    deps.pushFeed(tooFarAdvice, "combat", "info");
    return;
  }
  state.pendingArrowGestureConfirm = { origin, target };
  state.arrowGesture = { origin, target };
  showArrowGestureConfirmSheet(state, origin, target, deps.keyFor, {
    sendGameMessage: deps.sendGameMessage,
    renderHud: deps.renderHud
  });
};
