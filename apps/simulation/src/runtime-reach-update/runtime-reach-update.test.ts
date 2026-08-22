import { describe, expect, it, vi } from "vitest";
import {
  buildReachUpdatePayload,
  createReachUpdateState,
  flushReachUpdates,
  markReachDirty,
  markReachForResend,
  type ReachUpdateContext
} from "./runtime-reach-update.js";

const contextFor = (reachByPlayer: Record<string, string[]>): { context: ReachUpdateContext; emit: ReturnType<typeof vi.fn> } => {
  const emit = vi.fn();
  return {
    emit,
    context: {
      reachTileKeysForPlayer: (playerId) => [...(reachByPlayer[playerId] ?? [])],
      emitPlayerMessage: emit
    }
  };
};

describe("reach update push", () => {
  it("emits the authoritative reach set for a dirty player", () => {
    const state = createReachUpdateState();
    const { context, emit } = contextFor({ "player-1": ["1,1", "1,2"] });
    markReachDirty(state, "player-1");

    expect(flushReachUpdates(state, context, "cmd-1")).toEqual(["player-1"]);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]?.[0]).toEqual({ commandId: "cmd-1", playerId: "player-1" });
    expect(emit.mock.calls[0]?.[1]).toEqual({ type: "REACH_UPDATE", tileKeys: ["1,1", "1,2"], revision: 1 });
  });

  it("does not re-emit when the border is unchanged", () => {
    const state = createReachUpdateState();
    const { context, emit } = contextFor({ "player-1": ["1,1"] });
    markReachDirty(state, "player-1");
    flushReachUpdates(state, context, "cmd-1");

    markReachDirty(state, "player-1");
    expect(flushReachUpdates(state, context, "cmd-2")).toEqual([]);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("re-emits once the border actually changes", () => {
    const reach: Record<string, string[]> = { "player-1": ["1,1"] };
    const state = createReachUpdateState();
    const { context, emit } = contextFor(reach);
    markReachDirty(state, "player-1");
    flushReachUpdates(state, context, "cmd-1");

    reach["player-1"] = ["1,1", "2,2"];
    markReachDirty(state, "player-1");
    flushReachUpdates(state, context, "cmd-2");
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[1]?.[1]).toMatchObject({ tileKeys: ["1,1", "2,2"], revision: 2 });
  });

  it("treats a reordered set as unchanged", () => {
    // reachTileKeysForPlayer walks a Map, so the same border can enumerate in
    // a different order across calls -- that must not look like a change.
    const reach: Record<string, string[]> = { "player-1": ["1,1", "2,2"] };
    const state = createReachUpdateState();
    const { context, emit } = contextFor(reach);
    markReachDirty(state, "player-1");
    flushReachUpdates(state, context, "cmd-1");

    reach["player-1"] = ["2,2", "1,1"];
    markReachDirty(state, "player-1");
    expect(flushReachUpdates(state, context, "cmd-2")).toEqual([]);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("forces a resend for a reconnecting player whose set did not change", () => {
    const state = createReachUpdateState();
    const { context, emit } = contextFor({ "player-1": ["1,1"] });
    markReachDirty(state, "player-1");
    flushReachUpdates(state, context, "cmd-1");

    // A fresh client has never seen this set, so the change filter must not
    // suppress it -- this is the login/reconnect path.
    markReachForResend(state, "player-1");
    expect(flushReachUpdates(state, context, "cmd-2")).toEqual(["player-1"]);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it("never pushes reach for barbarians", () => {
    const state = createReachUpdateState();
    const { context, emit } = contextFor({ "barbarian-1": ["1,1"] });
    markReachDirty(state, "barbarian-1");

    expect(flushReachUpdates(state, context, "cmd-1")).toEqual([]);
    expect(emit).not.toHaveBeenCalled();
  });

  it("emits at most one message per player per flush", () => {
    const state = createReachUpdateState();
    const { context, emit } = contextFor({ "player-1": ["1,1"] });
    // One command can activate several anchors for the same owner.
    markReachDirty(state, "player-1");
    markReachDirty(state, "player-1");
    markReachDirty(state, "player-1");

    flushReachUpdates(state, context, "cmd-1");
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("advances the revision monotonically per player", () => {
    const state = createReachUpdateState();
    const { context } = contextFor({ "player-1": ["1,1"] });
    expect(buildReachUpdatePayload(state, context, "player-1").payload.revision).toBe(1);
    expect(buildReachUpdatePayload(state, context, "player-1").payload.revision).toBe(2);
  });

  it("is a no-op when nothing is dirty", () => {
    const state = createReachUpdateState();
    const { context, emit } = contextFor({ "player-1": ["1,1"] });
    expect(flushReachUpdates(state, context, "cmd-1")).toEqual([]);
    expect(emit).not.toHaveBeenCalled();
  });
});
