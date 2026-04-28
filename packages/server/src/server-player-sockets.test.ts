import { describe, expect, it, vi } from "vitest";
import { broadcastBulk, bulkSocketForPlayer, sendBulkToPlayer, sendControlToPlayer, type PlayerSocketLike } from "./server-player-sockets.js";

const fakeSocket = (): PlayerSocketLike & { send: ReturnType<typeof vi.fn> } => ({
  OPEN: 1,
  readyState: 1,
  send: vi.fn()
});

describe("server-player-sockets", () => {
  it("prefers the bulk socket for bulk traffic and falls back to control", () => {
    const control = fakeSocket();
    const bulk = fakeSocket();
    const controlSockets = new Map<string, PlayerSocketLike>([["p1", control]]);
    const bulkSockets = new Map<string, PlayerSocketLike>([["p1", bulk]]);

    expect(bulkSocketForPlayer(controlSockets, bulkSockets, "p1")).toBe(bulk);

    sendBulkToPlayer(controlSockets, bulkSockets, "p1", "bulk-message");
    expect(bulk.send).toHaveBeenCalledWith("bulk-message");
    expect(control.send).not.toHaveBeenCalled();

    bulkSockets.clear();
    sendBulkToPlayer(controlSockets, bulkSockets, "p1", "fallback-message");
    expect(control.send).toHaveBeenCalledWith("fallback-message");
  });

  it("sends control traffic only on the control socket", () => {
    const control = fakeSocket();
    const bulk = fakeSocket();
    const controlSockets = new Map<string, PlayerSocketLike>([["p1", control]]);
    const bulkSockets = new Map<string, PlayerSocketLike>([["p1", bulk]]);

    sendControlToPlayer(controlSockets, "p1", "control-message");

    expect(control.send).toHaveBeenCalledWith("control-message");
    expect(bulk.send).not.toHaveBeenCalled();
  });

  it("broadcasts bulk payloads without double-sending shared sockets", () => {
    const shared = fakeSocket();
    const controlOnly = fakeSocket();
    const bulkOnly = fakeSocket();
    const controlSockets = new Map<string, PlayerSocketLike>([
      ["shared", shared],
      ["control-only", controlOnly]
    ]);
    const bulkSockets = new Map<string, PlayerSocketLike>([
      ["shared", shared],
      ["bulk-only", bulkOnly]
    ]);

    broadcastBulk(controlSockets, bulkSockets, "payload");

    expect(shared.send).toHaveBeenCalledTimes(1);
    expect(bulkOnly.send).toHaveBeenCalledTimes(1);
    expect(controlOnly.send).toHaveBeenCalledTimes(1);
  });
});
