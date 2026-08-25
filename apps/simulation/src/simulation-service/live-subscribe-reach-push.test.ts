import { describe, expect, it } from "vitest";

import { createReachUpdateState, flushReachUpdates, markReachDirty, markReachForResend } from "../runtime-reach-update/runtime-reach-update.js";
import { registerLiveSubscribeAndPushReach } from "./live-subscribe-reach-push.js";

const noopLog = { error: () => {} };

describe("registerLiveSubscribeAndPushReach", () => {
  it("registers the subscription before pushing reach, so the socket is attached", () => {
    const order: string[] = [];

    registerLiveSubscribeAndPushReach(
      { subscribe: () => order.push("subscribe") },
      { resendReachForPlayer: () => order.push("reach") },
      "player-1",
      "key-1",
      noopLog
    );

    expect(order).toEqual(["subscribe", "reach"]);
  });

  it("passes the subscription key through to the registry", () => {
    const seen: Array<[string, string | undefined]> = [];

    registerLiveSubscribeAndPushReach(
      { subscribe: (playerId, key) => seen.push([playerId, key]) },
      { resendReachForPlayer: () => {} },
      "player-1",
      "key-1",
      noopLog
    );

    expect(seen).toEqual([["player-1", "key-1"]]);
  });

  it("keeps the subscription alive when the reach push throws", () => {
    const errors: Array<Record<string, unknown>> = [];
    let subscribed = false;

    expect(() =>
      registerLiveSubscribeAndPushReach(
        { subscribe: () => { subscribed = true; } },
        { resendReachForPlayer: () => { throw new Error("boom"); } },
        "player-1",
        undefined,
        { error: (payload) => errors.push(payload) }
      )
    ).not.toThrow();

    expect(subscribed).toBe(true);
    expect(errors).toHaveLength(1);
  });

  /**
   * The regression this module exists for: a reach anchor completing while the
   * player is disconnected advances `lastEmittedSignatureByPlayer` to the new
   * border as it emits to nobody. The change-filtered flush will then never
   * re-send it, so unless the live subscribe forces a resend the reconnecting
   * client never learns its border grew.
   */
  it("delivers a border that changed while the player was disconnected", () => {
    const state = createReachUpdateState();
    let border = ["1,1"];
    const emitted: Array<Record<string, unknown>> = [];
    const context = {
      reachTileKeysForPlayer: () => [...border],
      emitPlayerMessage: (_command: { commandId: string; playerId: string }, payload: Record<string, unknown>) => {
        emitted.push(payload);
      }
    };

    // Player online: border pushed and acknowledged by the client.
    markReachDirty(state, "player-1");
    flushReachUpdates(state, context, "cmd-online");
    expect(emitted).toHaveLength(1);

    // Player disconnects. A Relay Beacon completes on the build timer and the
    // resulting flush emits into the void — no socket is attached.
    emitted.length = 0;
    border = ["1,1", "1,2", "2,1"];
    markReachDirty(state, "player-1");
    flushReachUpdates(state, context, "cmd-offline-beacon");
    expect(emitted).toHaveLength(1); // emitted, but nothing was listening
    emitted.length = 0;

    // Player reconnects. A plain change-filtered flush cannot recover it: the
    // signature already matches the expanded border.
    markReachDirty(state, "player-1");
    flushReachUpdates(state, context, "cmd-reconnect-plain");
    expect(emitted).toHaveLength(0);

    // The live-subscribe push forces it through.
    registerLiveSubscribeAndPushReach(
      { subscribe: () => {} },
      { resendReachForPlayer: (playerId) => {
        markReachForResend(state, playerId);
        flushReachUpdates(state, context, "cmd-live-subscribe");
      } },
      "player-1",
      "key-1",
      noopLog
    );

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.tileKeys).toEqual(["1,1", "1,2", "2,1"]);
  });
});
