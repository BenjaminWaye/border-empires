import { describe, expect, it } from "vitest";
import { TimeoutError } from "../promise-timeout.js";
import {
  createSimSubmitHealthState,
  recordSubmitSuccess,
  shouldMarkUnavailableOnSubmitError
} from "./sim-submit-health.js";

describe("shouldMarkUnavailableOnSubmitError", () => {
  const THRESHOLD = 3;

  it("single submit TimeoutError does NOT mark sim unavailable", () => {
    const state = createSimSubmitHealthState();
    const result = shouldMarkUnavailableOnSubmitError(new TimeoutError("gateway submit command", 2500), state, {
      threshold: THRESHOLD,
      hasEverBeenReady: true
    });
    expect(result.markUnavailable).toBe(false);
    expect(result.tolerated).toBe(true);
    expect(state.consecutiveSubmitTimeouts).toBe(1);
  });

  it("below-threshold consecutive TimeoutErrors are all tolerated", () => {
    const state = createSimSubmitHealthState();
    const error = new TimeoutError("gateway submit command", 2500);
    const opts = { threshold: THRESHOLD, hasEverBeenReady: true };
    for (let i = 1; i < THRESHOLD; i++) {
      const result = shouldMarkUnavailableOnSubmitError(error, state, opts);
      expect(result.markUnavailable).toBe(false);
      expect(result.tolerated).toBe(true);
    }
    expect(state.consecutiveSubmitTimeouts).toBe(THRESHOLD - 1);
  });

  it(`${THRESHOLD} consecutive TimeoutErrors flips sim to unavailable`, () => {
    const state = createSimSubmitHealthState();
    const error = new TimeoutError("gateway submit command", 2500);
    const opts = { threshold: THRESHOLD, hasEverBeenReady: true };
    // First threshold-1 are tolerated
    for (let i = 1; i < THRESHOLD; i++) {
      shouldMarkUnavailableOnSubmitError(error, state, opts);
    }
    // Threshold-th occurrence flips
    const result = shouldMarkUnavailableOnSubmitError(error, state, opts);
    expect(result.markUnavailable).toBe(true);
    expect(result.tolerated).toBe(false);
    expect(state.consecutiveSubmitTimeouts).toBe(THRESHOLD);
  });

  it("does NOT flip if sim has never been ready, even after threshold timeouts", () => {
    const state = createSimSubmitHealthState();
    const error = new TimeoutError("gateway submit command", 2500);
    const opts = { threshold: THRESHOLD, hasEverBeenReady: false };
    for (let i = 0; i < THRESHOLD + 2; i++) {
      const result = shouldMarkUnavailableOnSubmitError(error, state, opts);
      expect(result.markUnavailable).toBe(false);
      expect(result.tolerated).toBe(true);
    }
  });

  it("non-timeout error flips immediately on first occurrence", () => {
    const state = createSimSubmitHealthState();
    const error = new Error("UNAVAILABLE: transport closed");
    const result = shouldMarkUnavailableOnSubmitError(error, state, {
      threshold: THRESHOLD,
      hasEverBeenReady: true
    });
    expect(result.markUnavailable).toBe(true);
    expect(result.tolerated).toBe(false);
  });

  it("non-timeout error resets consecutive timeout counter", () => {
    const state = createSimSubmitHealthState();
    const opts = { threshold: THRESHOLD, hasEverBeenReady: true };
    // Accumulate 1 timeout first
    shouldMarkUnavailableOnSubmitError(new TimeoutError("gateway submit command", 2500), state, opts);
    expect(state.consecutiveSubmitTimeouts).toBe(1);
    // Then a real error should reset
    shouldMarkUnavailableOnSubmitError(new Error("channel broken"), state, opts);
    expect(state.consecutiveSubmitTimeouts).toBe(0);
  });

  it("successful submit resets the consecutive-timeout counter", () => {
    const state = createSimSubmitHealthState();
    const opts = { threshold: THRESHOLD, hasEverBeenReady: true };
    shouldMarkUnavailableOnSubmitError(new TimeoutError("gateway submit command", 2500), state, opts);
    shouldMarkUnavailableOnSubmitError(new TimeoutError("gateway submit command", 2500), state, opts);
    expect(state.consecutiveSubmitTimeouts).toBe(2);
    // Success resets counter
    recordSubmitSuccess(state);
    expect(state.consecutiveSubmitTimeouts).toBe(0);
    // Now timeout counter starts fresh — below threshold again
    const result = shouldMarkUnavailableOnSubmitError(
      new TimeoutError("gateway submit command", 2500),
      state,
      opts
    );
    expect(result.markUnavailable).toBe(false);
    expect(state.consecutiveSubmitTimeouts).toBe(1);
  });
});
