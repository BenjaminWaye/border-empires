import { describe, expect, it } from "vitest";
import { applyServerReachUpdate, clearServerReach, resolveMyReach, type ReachAuthoritativeState } from "./client-reach-authoritative.js";

const stateWith = (overrides: Partial<ReachAuthoritativeState> = {}): ReachAuthoritativeState => ({
  me: "me",
  tiles: new Map(),
  serverReach: undefined,
  serverReachRevision: 0,
  ...overrides
});

describe("authoritative reach on the client", () => {
  it("applies a REACH_UPDATE and exposes it as the reach set", () => {
    const state = stateWith();
    expect(applyServerReachUpdate(state, { tileKeys: ["1,1", "1,2"], revision: 1 })).toBe(true);
    expect(resolveMyReach(state)).toEqual(new Set(["1,1", "1,2"]));
  });

  it("falls back to the local approximation before the first message", () => {
    // No anchors in an empty tile map, so the fallback is empty -- the point
    // is that it does not throw and does not report a bogus reach.
    expect(resolveMyReach(stateWith())).toEqual(new Set());
  });

  it("prefers an empty server set over the local approximation", () => {
    // An empty authoritative border is a real answer ("you reach nothing"),
    // not a missing one -- it must not silently fall back to the guess.
    const state = stateWith();
    applyServerReachUpdate(state, { tileKeys: [], revision: 1 });
    expect(state.serverReach).toEqual(new Set());
    expect(resolveMyReach(state)).toEqual(new Set());
  });

  it("drops a stale, out-of-order revision", () => {
    const state = stateWith();
    applyServerReachUpdate(state, { tileKeys: ["1,1", "2,2"], revision: 7 });
    expect(applyServerReachUpdate(state, { tileKeys: ["9,9"], revision: 6 })).toBe(false);
    expect(resolveMyReach(state)).toEqual(new Set(["1,1", "2,2"]));
  });

  it("accepts revision 1 as a fresh sequence after a reconnect", () => {
    // The simulation restarts revisions at 1 per player; the client's counter
    // can be higher from before a reconnect the simulation never saw.
    const state = stateWith();
    applyServerReachUpdate(state, { tileKeys: ["1,1"], revision: 9 });
    expect(applyServerReachUpdate(state, { tileKeys: ["5,5"], revision: 1 })).toBe(true);
    expect(resolveMyReach(state)).toEqual(new Set(["5,5"]));
  });

  it("ignores a malformed payload", () => {
    const state = stateWith();
    expect(applyServerReachUpdate(state, {})).toBe(false);
    expect(applyServerReachUpdate(state, { tileKeys: "nope" })).toBe(false);
    expect(state.serverReach).toBeUndefined();
  });

  it("rejects a missing or invalid revision instead of defaulting it", () => {
    // A default of 0 used to skip the staleness check outright (0 is never
    // > 1) and reset serverReachRevision to 0, silently disabling ordering
    // protection for every later update too.
    const state = stateWith();
    expect(applyServerReachUpdate(state, { tileKeys: ["1,1"] })).toBe(false);
    expect(applyServerReachUpdate(state, { tileKeys: ["1,1"], revision: "1" })).toBe(false);
    expect(applyServerReachUpdate(state, { tileKeys: ["1,1"], revision: 0 })).toBe(false);
    expect(applyServerReachUpdate(state, { tileKeys: ["1,1"], revision: -1 })).toBe(false);
    expect(applyServerReachUpdate(state, { tileKeys: ["1,1"], revision: Number.NaN })).toBe(false);
    expect(state.serverReach).toBeUndefined();
    expect(state.serverReachRevision).toBe(0);
  });

  it("does not let an invalid revision reset protection for a later stale one", () => {
    const state = stateWith();
    applyServerReachUpdate(state, { tileKeys: ["1,1"], revision: 5 });
    applyServerReachUpdate(state, { tileKeys: ["9,9"] }); // malformed, must not touch serverReachRevision
    expect(applyServerReachUpdate(state, { tileKeys: ["2,2"], revision: 3 })).toBe(false);
    expect(resolveMyReach(state)).toEqual(new Set(["1,1"]));
  });

  it("skips non-string entries rather than poisoning the set", () => {
    const state = stateWith();
    applyServerReachUpdate(state, { tileKeys: ["1,1", 42, null, "2,2"], revision: 1 });
    expect(resolveMyReach(state)).toEqual(new Set(["1,1", "2,2"]));
  });

  it("clearServerReach reverts to the local approximation", () => {
    const state = stateWith();
    applyServerReachUpdate(state, { tileKeys: ["1,1"], revision: 3 });
    clearServerReach(state);
    expect(state.serverReach).toBeUndefined();
    expect(state.serverReachRevision).toBe(0);
    expect(resolveMyReach(state)).toEqual(new Set());
  });
});
