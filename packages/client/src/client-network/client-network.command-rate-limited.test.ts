import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { pacedSocketSend } from "../client-command-pacer/client-command-pacer.js";
import { explainActionFailureFromServer } from "../client-player-actions.js";
import { FakeWebSocket, createState, bindWithDeps } from "./client-network.error-regression.test-helpers.js";

class SendingSocket extends FakeWebSocket {
  readonly sent: string[] = [];
  send(data: string): void { this.sent.push(data); }
}

afterEach(() => { vi.useRealTimers(); });

const rateLimited = (rejected: unknown) =>
  ({ data: JSON.stringify({ type: "ERROR", code: "COMMAND_RATE_LIMITED", message: "command rate limit", retryAfterMs: 200, rejected }) });

// Regression: Garrison Many on 33 tiles tripped the gateway's command rate
// limit and the raw "Error COMMAND_RATE_LIMITED: command rate limit" was shown
// as an "Action failed" popup. A throttle is our pacing problem, not the player's.
describe("COMMAND_RATE_LIMITED from the gateway", () => {
  it("shows nothing and re-sends the rejected enqueue (which carries no commandId)", () => {
    vi.useFakeTimers();
    const state = Object.assign(createInitialState(), createState());
    const ws = new SendingSocket();
    const showCaptureAlert = vi.fn();
    const { pushFeed } = bindWithDeps(state, ws, { showCaptureAlert });
    const enqueue = { type: "DEV_QUEUE_ENQUEUE", kind: "SETTLE", x: 3, y: 4 };
    pacedSocketSend(ws, enqueue, () => true);
    expect(ws.sent).toHaveLength(1);
    ws.emit("message", rateLimited(enqueue));
    expect(showCaptureAlert).not.toHaveBeenCalled();
    expect(pushFeed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(ws.sent.map((raw) => JSON.parse(raw))).toEqual([enqueue, enqueue]);
  });

  it("words it for players, never as the raw code, if the same command keeps being refused", () => {
    expect(explainActionFailureFromServer("COMMAND_RATE_LIMITED", "command rate limit")).not.toMatch(/COMMAND_RATE_LIMITED|rate limit/);
  });
});
