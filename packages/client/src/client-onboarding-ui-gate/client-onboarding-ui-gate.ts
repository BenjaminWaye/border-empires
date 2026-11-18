import type { ClientState } from "../client-state/client-state.js";
import type { AfcJoinDropState } from "../client-afc-join-drop/client-afc-join-drop-state.js";
import { isMapUnobstructed, type MapUnobstructedState } from "../client-map-unobstructed/client-map-unobstructed.js";

// Holds back the new-player corner UI -- the discovery-tip toast ("First Town
// Discovered!") and the "New empire checklist" bubble -- while a dialog
// (changelog, Activity dashboard, ...) covers the map, and while
// the join-time AFC drop is still pending or playing. A new player then
// gets: dialogs closed -> AFC lands -> tips/checklist, instead of the toast and
// the force-opened checklist painting over those dialogs and the landing.

export type OnboardingUiGateState = MapUnobstructedState & Pick<ClientState, "afcJoinDrop">;

/** True while the join drop has an AFC armed (waiting for the map to clear) or is animating it. */
export const isAfcJoinDropPending = (drop: Pick<AfcJoinDropState, "phase">): boolean =>
  drop.phase === "waiting" || drop.phase === "playing";

export const isOnboardingUiDeferred = (state: OnboardingUiGateState): boolean =>
  !isMapUnobstructed(state) || isAfcJoinDropPending(state.afcJoinDrop);

/**
 * True while the join drop is about to play or playing: "waiting" counts only
 * once its gate is open (the AFC is on screen, dwelling before the descent).
 * A waiting drop whose AFC is off screen waits for the player to look at it,
 * for up to AFC_JOIN_FALLBACK_REVEAL_MS (5 min).
 */
export const isAfcJoinDropOnScreen = (drop: Pick<AfcJoinDropState, "phase" | "gateOpenSince">): boolean =>
  drop.phase === "playing" || (drop.phase === "waiting" && drop.gateOpenSince > 0);

/**
 * The tutorial guide's deferral: a dialog over the map, or the AFC drop on
 * screen. Unlike isOnboardingUiDeferred it doesn't wait for an off-screen drop.
 * Playtest: on a new account the guide only appeared ~2 minutes in, at step 3
 * (the pan and zoom steps had ticked while it was hidden), because the drop
 * sat in "waiting" with the AFC off screen and held the guide with it. The
 * guide must be up on step 1 the moment the player is on the map.
 */
export const isTutorialGuideDeferred = (state: OnboardingUiGateState): boolean =>
  !isMapUnobstructed(state) || isAfcJoinDropOnScreen(state.afcJoinDrop);

/**
 * Per-frame edge detector: calls `onChange` once each time the deferral
 * flips, so the corner UI is shown the moment the drop finishes (or the
 * dialog closes) instead of waiting for the next tile-delta batch, and
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
