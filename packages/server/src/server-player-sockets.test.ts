import { describe, expect, it, vi } from "vitest";
import {
  broadcastBulk,
  bulkSocketForPlayer,
  detachBulkSocketForPlayer,
  sendBulkToPlayer,
  sendControlToPlayer,
  type PlayerSocketLike
} from "./server-player-sockets.js";

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

  it("falls back to the control socket when the bulk socket is stale", () => {
    const control = fakeSocket();
    const staleBulk = fakeSocket();
    staleBulk.readyState = 3;
    const controlSockets = new Map<string, PlayerSocketLike>([["p1", control]]);
    const bulkSockets = new Map<string, PlayerSocketLike>([["p1", staleBulk]]);

    expect(bulkSocketForPlayer(controlSockets, bulkSockets, "p1")).toBe(control);

    sendBulkToPlayer(controlSockets, bulkSockets, "p1", "fallback-message");
    expect(control.send).toHaveBeenCalledWith("fallback-message");
    expect(staleBulk.send).not.toHaveBeenCalled();
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

  it("broadcasts on the open control socket when a player's bulk socket is stale", () => {
    const control = fakeSocket();
    const staleBulk = fakeSocket();
    staleBulk.readyState = 3;
    const controlSockets = new Map<string, PlayerSocketLike>([["p1", control]]);
    const bulkSockets = new Map<string, PlayerSocketLike>([["p1", staleBulk]]);

    broadcastBulk(controlSockets, bulkSockets, "payload");

    expect(control.send).toHaveBeenCalledTimes(1);
    expect(control.send).toHaveBeenCalledWith("payload");
    expect(staleBulk.send).not.toHaveBeenCalled();
  });

  it("ignores stale bulk socket closes and preserves chunk session state for the live session", () => {
    const control = fakeSocket();
    const liveBulk = fakeSocket();
    const staleBulk = fakeSocket();
    const controlSockets = new Map<string, PlayerSocketLike>([["p1", control]]);
    const bulkSockets = new Map<string, PlayerSocketLike>([["p1", liveBulk]]);

    const staleClose = detachBulkSocketForPlayer(controlSockets, bulkSockets, "p1", staleBulk);
    expect(staleClose).toEqual({
      closedCurrentBulkSocket: false,
      preserveChunkSessionState: true
    });
    expect(bulkSockets.get("p1")).toBe(liveBulk);

    const liveClose = detachBulkSocketForPlayer(controlSockets, bulkSockets, "p1", liveBulk);
    expect(liveClose).toEqual({
      closedCurrentBulkSocket: true,
      preserveChunkSessionState: true
    });
    expect(bulkSockets.has("p1")).toBe(false);
  });
});
