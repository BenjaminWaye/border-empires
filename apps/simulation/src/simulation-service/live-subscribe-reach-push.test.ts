import { describe, expect, it } from "vitest";

import { createReachUpdateState, flushReachUpdates, markReachDirty, markReachForResend } from "../runtime-reach-update/runtime-reach-update.js";
import { registerSubscribeAndMaybePushReach } from "./live-subscribe-reach-push.js";

const noopLog = { error: () => {} };
const liveOptions = { trigger: "gateway_live_subscribe", subscriptionKey: "key-1" };

describe("registerSubscribeAndMaybePushReach", () => {
  it("registers the subscription before pushing reach, so the socket is attached", () => {
    const order: string[] = [];

    registerSubscribeAndMaybePushReach(
      { subscribe: () => order.push("subscribe") },
      { resendReachForPlayer: () => order.push("reach") },
      "player-1",
      liveOptions,
      noopLog
    );

    expect(order).toEqual(["subscribe", "reach"]);
  });

  it("passes the subscription key through to the registry", () => {
    const seen: Array<[string, string | undefined]> = [];

    registerSubscribeAndMaybePushReach(
      { subscribe: (playerId, key) => seen.push([playerId, key]) },
      { resendReachForPlayer: () => {} },
      "player-1",
      liveOptions,
      noopLog
    );

    expect(seen).toEqual([["player-1", "key-1"]]);
  });

  it("keeps the subscription alive when the reach push throws", () => {
    const errors: Array<Record<string, unknown>> = [];
    let subscribed = false;

    expect(() =>
      registerSubscribeAndMaybePushReach(
        { subscribe: () => { subscribed = true; } },
        { resendReachForPlayer: () => { throw new Error("boom"); } },
        "player-1",
        { trigger: "gateway_live_subscribe" },
        { error: (payload) => errors.push(payload) }
      )
    ).not.toThrow();

    expect(subscribed).toBe(true);
    expect(errors).toHaveLength(1);
  });

  it("skips both the subscription and the reach push for a bootstrap-only call", () => {
    const calls: string[] = [];

    registerSubscribeAndMaybePushReach(
      { subscribe: () => calls.push("subscribe") },
      { resendReachForPlayer: () => calls.push("reach") },
      "player-1",
      { mode: "bootstrap-only", trigger: "gateway_live_subscribe" },
      noopLog
    );

    expect(calls).toEqual([]);
  });

  /**
   * Regression guard: fog-toggle and reveal-map resubscribes call
   * SubscribePlayer with a non-bootstrap mode too, but without the
   * gateway's connect trigger. They must still register the subscription
   * (that part is the pre-existing behavior this module also owns now) but
   * must NOT force a reach push, or a fog-disabled player acting once a
   * second would get a full unfiltered REACH_UPDATE flood on that cadence.
   */
  it("registers a non-connect subscribe but does not push reach for it", () => {
    const calls: string[] = [];

    registerSubscribeAndMaybePushReach(
      { subscribe: () => calls.push("subscribe") },
      { resendReachForPlayer: () => calls.push("reach") },
      "player-1",
      { trigger: "gateway_fog_refresh", subscriptionKey: "key-2" },
      noopLog
    );

    expect(calls).toEqual(["subscribe"]);
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
    registerSubscribeAndMaybePushReach(
      { subscribe: () => {} },
      { resendReachForPlayer: (playerId) => {
        markReachForResend(state, playerId);
        flushReachUpdates(state, context, "cmd-live-subscribe");
      } },
      "player-1",
      liveOptions,
      noopLog
    );

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.tileKeys).toEqual(["1,1", "1,2", "2,1"]);
  });
});
