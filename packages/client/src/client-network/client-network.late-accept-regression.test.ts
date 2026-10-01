import { describe, expect, it } from "vitest";
import { FakeWebSocket, createState, bindWithDeps } from "./client-network.error-regression.test-helpers.js";

// Staging debug log: a slow gateway ACCEPTED a neutral EXPAND ~4.5s after send. The 2s accept
// timeout had already cleared actionCurrent and opened the 12s late-ack window, but the
// requireActionInFlight guard dropped the ack ("action-accepted-ignored-command-mismatch") so
// rebindLateFrontierAck never ran and the player was left on "Expansion sync delayed".
const timedOutExpandState = (lateAckUntil: number | undefined) => {
  const state = createState();
  state.actionInFlight = false;
  state.actionAcceptedAck = false;
  state.combatStartAck = false;
  state.actionStartedAt = 0;
  state.actionTargetKey = "";
  state.actionCurrent = undefined;
  state.capture = undefined;
  if (lateAckUntil !== undefined) state.frontierLateAckUntilByTarget.set("14,136", lateAckUntil);
  return state;
};

const emitAccepted = (ws: FakeWebSocket) =>
  ws.emit("message", {
    data: JSON.stringify({
      type: "ACTION_ACCEPTED",
      actionType: "EXPAND",
      commandId: "3311d8f0-7eef-4295-80fe-a5780b0ccf9f",
      clientSeq: 2,
      target: { x: 14, y: 136 },
      origin: { x: 15, y: 135 },
      resolvesAt: Date.now() + 3_000
    })
  });

describe("late ACTION_ACCEPTED after the accept timeout", () => {
  it("re-adopts the action instead of dropping the ack while the late-ack window is open", () => {
    const state = timedOutExpandState(Date.now() + 8_000);
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);

    emitAccepted(ws);

    expect(state.actionInFlight).toBe(true);
    expect(state.actionAcceptedAck).toBe(true);
    expect(state.actionTargetKey).toBe("14,136");
    expect(state.actionCurrent).toEqual(expect.objectContaining({ x: 14, y: 136, actionType: "EXPAND" }));
    expect(state.frontierLateAckUntilByTarget.has("14,136")).toBe(false);
  });

  it("still ignores an ack for a target that never timed out", () => {
    const state = timedOutExpandState(undefined);
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);

    emitAccepted(ws);

    expect(state.actionInFlight).toBe(false);
    expect(state.actionAcceptedAck).toBe(false);
    expect(state.actionCurrent).toBeUndefined();
  });

  it("still ignores an ack once the late-ack window has expired", () => {
    const state = timedOutExpandState(Date.now() - 1);
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);

    emitAccepted(ws);

    expect(state.actionInFlight).toBe(false);
    expect(state.actionCurrent).toBeUndefined();
  });

  it("does not hijack a newer in-flight action with a stale late ack", () => {
    const state = timedOutExpandState(Date.now() + 8_000);
    state.actionInFlight = true;
    state.actionTargetKey = "20,20";
    state.actionCurrent = { x: 20, y: 20, retries: 0, actionType: "EXPAND", commandId: "newer-command", clientSeq: 3 };
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);

    emitAccepted(ws);

    expect(state.actionCurrent).toEqual(expect.objectContaining({ x: 20, y: 20, commandId: "newer-command" }));
    expect(state.actionAcceptedAck).toBe(false);
  });
});
