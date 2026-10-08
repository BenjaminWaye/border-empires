import type { ClientState } from "../client-state/client-state.js";
import type { AfcJoinDropState } from "../client-afc-join-drop/client-afc-join-drop-state.js";
import { isMapUnobstructed, type MapUnobstructedState } from "../client-map-unobstructed/client-map-unobstructed.js";

// Holds back the new-player corner UI -- the discovery-tip toast ("First Town
// Discovered!") and the "New empire checklist" bubble -- while a dialog
// (changelog, tutorial, Activity dashboard, ...) covers the map, and while
// the join-time AFC drop is still pending or playing. A new player then
// gets: tutorial -> AFC lands -> tips/checklist, instead of the toast and
// the force-opened checklist painting over the tutorial and the landing.

export type OnboardingUiGateState = MapUnobstructedState & Pick<ClientState, "afcJoinDrop">;

/** True while the join drop has an AFC armed (waiting for the map to clear) or is animating it. */
export const isAfcJoinDropPending = (drop: Pick<AfcJoinDropState, "phase">): boolean =>
  drop.phase === "waiting" || drop.phase === "playing";

export const isOnboardingUiDeferred = (state: OnboardingUiGateState): boolean =>
  !isMapUnobstructed(state) || isAfcJoinDropPending(state.afcJoinDrop);

/**
 * Per-frame edge detector: calls `onChange` once each time the deferral
 * flips, so the corner UI is shown the moment the drop finishes (or the
 * tutorial closes) instead of waiting for the next tile-delta batch, and
 * hidden again if a dialog reopens over it.
 */
export const createOnboardingUiGateTicker = (): ((state: OnboardingUiGateState, onChange: (deferred: boolean) => void) => void) => {
  let lastDeferred: boolean | null = null;
  return (state, onChange) => {
    const deferred = isOnboardingUiDeferred(state);
    if (deferred === lastDeferred) return;
    const isFirstTick = lastDeferred === null;
    lastDeferred = deferred;
    if (!isFirstTick) onChange(deferred);
  };
};
