import { describe, expect, it } from "vitest";
import { applyRivalReachUpdate, clearRivalReach, resolveRivalReach, type RivalReachAuthoritativeState } from "./client-rival-reach-authoritative.js";

const stateWith = (overrides: Partial<RivalReachAuthoritativeState> = {}): RivalReachAuthoritativeState => ({
  rivalReach: new Map(),
  rivalReachRevisionByOwner: new Map(),
  rivalReachGlobalRevision: 0,
  ...overrides
});

describe("authoritative rival reach on the client", () => {
  it("applies a RIVAL_REACH_UPDATE and exposes it per owner", () => {
    const state = stateWith();
    expect(applyRivalReachUpdate(state, { ownerId: "rival", tileKeys: ["1,1", "1,2"], revision: 1 })).toBe(true);
    expect(resolveRivalReach(state, "rival")).toEqual(new Set(["1,1", "1,2"]));
  });

  it("is undefined for an owner the server hasn't pushed anything for yet — falls back to the local guess at the call site", () => {
    const state = stateWith();
    applyRivalReachUpdate(state, { ownerId: "rival-a", tileKeys: ["1,1"], revision: 1 });
    expect(resolveRivalReach(state, "rival-b")).toBeUndefined();
  });

  it("tracks revisions independently per owner — a stale revision for one owner does not affect another", () => {
    const state = stateWith();
    applyRivalReachUpdate(state, { ownerId: "rival-a", tileKeys: ["1,1"], revision: 7 });
    applyRivalReachUpdate(state, { ownerId: "rival-b", tileKeys: ["9,9"], revision: 1 });
    expect(resolveRivalReach(state, "rival-a")).toEqual(new Set(["1,1"]));
    expect(resolveRivalReach(state, "rival-b")).toEqual(new Set(["9,9"]));
  });

  it("drops a stale, out-of-order revision for the same owner", () => {
    const state = stateWith();
    applyRivalReachUpdate(state, { ownerId: "rival", tileKeys: ["1,1", "2,2"], revision: 7 });
    expect(applyRivalReachUpdate(state, { ownerId: "rival", tileKeys: ["9,9"], revision: 6 })).toBe(false);
    expect(resolveRivalReach(state, "rival")).toEqual(new Set(["1,1", "2,2"]));
  });

  it("accepts revision 1 even after a higher revision (reconnect announces a fresh sequence)", () => {
    const state = stateWith();
    applyRivalReachUpdate(state, { ownerId: "rival", tileKeys: ["1,1"], revision: 5 });
    expect(applyRivalReachUpdate(state, { ownerId: "rival", tileKeys: ["9,9"], revision: 1 })).toBe(true);
    expect(resolveRivalReach(state, "rival")).toEqual(new Set(["9,9"]));
  });

  it("rejects a missing or invalid revision without corrupting state", () => {
    const state = stateWith();
    expect(applyRivalReachUpdate(state, { ownerId: "rival", tileKeys: ["1,1"] })).toBe(false);
    expect(applyRivalReachUpdate(state, { ownerId: "rival", tileKeys: ["1,1"], revision: 0 })).toBe(false);
    expect(resolveRivalReach(state, "rival")).toBeUndefined();
  });

  it("rejects a missing or non-string ownerId", () => {
    const state = stateWith();
    expect(applyRivalReachUpdate(state, { tileKeys: ["1,1"], revision: 1 })).toBe(false);
    expect(applyRivalReachUpdate(state, { ownerId: 42, tileKeys: ["1,1"], revision: 1 })).toBe(false);
  });

  it("bumps rivalReachGlobalRevision on every accepted update, across owners — the 3D render cache-key tripwire", () => {
    const state = stateWith();
    applyRivalReachUpdate(state, { ownerId: "rival-a", tileKeys: ["1,1"], revision: 1 });
    applyRivalReachUpdate(state, { ownerId: "rival-b", tileKeys: ["2,2"], revision: 1 });
    expect(state.rivalReachGlobalRevision).toBe(2);
  });

  it("does not bump rivalReachGlobalRevision when an update is rejected", () => {
    const state = stateWith();
    applyRivalReachUpdate(state, { ownerId: "rival", tileKeys: ["1,1"], revision: 5 });
    applyRivalReachUpdate(state, { ownerId: "rival", tileKeys: ["9,9"], revision: 4 }); // stale, rejected
    expect(state.rivalReachGlobalRevision).toBe(1);
  });

  it("clearRivalReach drops every owner", () => {
    const state = stateWith();
    applyRivalReachUpdate(state, { ownerId: "rival-a", tileKeys: ["1,1"], revision: 1 });
    applyRivalReachUpdate(state, { ownerId: "rival-b", tileKeys: ["2,2"], revision: 1 });
    clearRivalReach(state);
    expect(resolveRivalReach(state, "rival-a")).toBeUndefined();
    expect(resolveRivalReach(state, "rival-b")).toBeUndefined();
  });
});
