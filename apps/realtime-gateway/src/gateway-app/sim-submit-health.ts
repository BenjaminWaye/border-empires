import { TimeoutError } from "../promise-timeout.js";

/**
 * Mutable state for submit-timeout consecutive-failure tracking.
 * Exposed as a plain object so the gateway can hold one instance and
 * pass it into shouldMarkUnavailableOnSubmitError / recordSubmitSuccess.
 */
export type SimSubmitHealthState = {
  consecutiveSubmitTimeouts: number;
};

export const createSimSubmitHealthState = (): SimSubmitHealthState => ({
  consecutiveSubmitTimeouts: 0
});

/**
 * Pure decision function: given an error thrown from a submitCommand call,
 * mutates `state` and returns whether the sim should be marked unavailable.
 *
 * Timeout errors are tolerated up to `threshold - 1` consecutive occurrences
 * (mirrors the ping-failure threshold pattern).  A real channel error always
 * flips immediately.  On timeout, also returns whether the flip happened so
 * callers can emit the right counter.
 *
 * Returns:
 *   - markUnavailable: true  → caller must call markSimulationUnavailable
 *   - tolerated: true        → it was a timeout but below threshold (emit tolerated counter)
 */
export const shouldMarkUnavailableOnSubmitError = (
  error: unknown,
  state: SimSubmitHealthState,
  options: {
    threshold: number;
    hasEverBeenReady: boolean;
  }
): { markUnavailable: boolean; tolerated: boolean } => {
  if (error instanceof TimeoutError) {
    state.consecutiveSubmitTimeouts += 1;
    const shouldFlip =
      state.consecutiveSubmitTimeouts >= options.threshold && options.hasEverBeenReady;
    if (shouldFlip) {
      return { markUnavailable: true, tolerated: false };
    }
    return { markUnavailable: false, tolerated: true };
  }
  // Non-timeout: real channel error — flip immediately, reset timeout counter.
  state.consecutiveSubmitTimeouts = 0;
  return { markUnavailable: true, tolerated: false };
};

/**
 * Call on a successful submit to reset the consecutive-timeout counter.
 */
export const recordSubmitSuccess = (state: SimSubmitHealthState): void => {
  state.consecutiveSubmitTimeouts = 0;
};
