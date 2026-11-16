import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { pacedSocketSend } from "../client-command-pacer/client-command-pacer.js";
import { FakeWebSocket, createState, bindWithDeps } from "./client-network.error-regression.test-helpers.js";

class SendingSocket extends FakeWebSocket {
  readonly sent: string[] = [];
  send(data: string): void { this.sent.push(data); }
}

afterEach(() => { vi.useRealTimers(); });

// Regression: Garrison Many on 33 tiles tripped the gateway's command rate
// limit and the raw "Error COMMAND_RATE_LIMITED: command rate limit" was shown
// as an "Action failed" popup. A throttle is our pacing problem, not the player's.
describe("COMMAND_RATE_LIMITED from the gateway", () => {
  it("shows no popup or feed error and re-sends the rejected command", () => {
    vi.useFakeTimers();
    const state = Object.assign(createInitialState(), createState());
    const ws = new SendingSocket();
    const showCaptureAlert = vi.fn();
    const { pushFeed } = bindWithDeps(state, ws, { showCaptureAlert });
    pacedSocketSend(ws, { type: "SETTLE", x: 3, y: 4, commandId: "cmd-1", clientSeq: 1 }, () => true);
    expect(ws.sent).toHaveLength(1);
    ws.emit("message", { data: JSON.stringify({ type: "ERROR", code: "COMMAND_RATE_LIMITED", message: "command rate limit", retryAfterMs: 200, commandId: "cmd-1" }) });
    expect(showCaptureAlert).not.toHaveBeenCalled();
    expect(pushFeed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(ws.sent).toHaveLength(2);
    expect(JSON.parse(ws.sent[1] ?? "{}")).toMatchObject({ type: "SETTLE", commandId: "cmd-1", clientSeq: 1 });
  });
});
