import { describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

import { createRevealMapRequestHandler, type RevealMapRequestDependencies, type RevealRequestSession } from "./reveal-map-request.js";

const openSocket = (): WebSocket => {
  const socket = new WebSocket(null, undefined, {});
  Object.defineProperty(socket, "readyState", { value: WebSocket.OPEN, configurable: true });
  return socket;
};

const setup = (streamResult: () => Promise<void>, overrides: Partial<RevealMapRequestDependencies> = {}) => {
  const sent: unknown[] = [];
  const stream = vi.fn((_socket: WebSocket, _playerId: string, _stillWanted: () => boolean) => streamResult());
  const deps: RevealMapRequestDependencies = {
    streamer: { stream, isStreaming: () => false },
    activeStreamCount: () => 0,
    maxConcurrentStreams: 24,
    cooldownMs: 5_000,
    lastRequestMsByPlayerId: new Map(),
    now: () => 100_000,
    bumpFogIntent: vi.fn(),
    syncSpectating: vi.fn(),
    foggedReplacement: () => ({ type: "TILE_SNAPSHOT_REPLACE", tiles: [{ x: 1, y: 1 }] }),
    sendJson: (_socket, payload) => { sent.push(payload); },
    record: vi.fn(),
    ...overrides
  };
  const session: RevealRequestSession = { playerId: "admin", channel: "bulk", canToggleFog: true, fogDisabled: false };
  return { handle: createRevealMapRequestHandler(deps), deps, session, sent, stream };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("reveal map request", () => {
  it("marks the socket revealed and starts its stream", async () => {
    const { handle, session, stream } = setup(async () => undefined);
    handle(openSocket(), session);
    expect(session.fogDisabled).toBe(true);
    expect(stream).toHaveBeenCalledTimes(1);
    expect(stream.mock.calls[0]![2]()).toBe(true);
  });

  // While fogDisabled is set the socket gets no fogged deltas, so a failed
  // reveal must hand it a fresh fogged view, not leave it stale and flagged.
  it("puts the socket back on its fogged view when the reveal fails", async () => {
    const { handle, deps, session, sent } = setup(() => Promise.reject(new Error("simulation timed out")));
    handle(openSocket(), session);
    await settle();
    expect(session.fogDisabled).toBe(false);
    expect(deps.syncSpectating).toHaveBeenCalledWith("admin");
    expect(sent).toEqual([
      { type: "ERROR", code: "REVEAL_MAP_UNAVAILABLE", message: "Full-map reveal is temporarily unavailable." },
      { type: "FOG_UPDATE", fogDisabled: false },
      { type: "TILE_SNAPSHOT_REPLACE", tiles: [{ x: 1, y: 1 }] }
    ]);
  });

  it("leaves the socket to a fog restore that superseded a failed reveal", async () => {
    let fail!: (error: Error) => void;
    const { handle, deps, session, sent } = setup(() => new Promise((_resolve, reject) => { fail = reject; }));
    handle(openSocket(), session);
    session.fogDisabled = false; // SET_FOG_DISABLED false arrived meanwhile
    fail(new Error("simulation timed out"));
    await settle();
    expect(deps.syncSpectating).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it("refuses a second reveal on a socket that is still streaming", () => {
    const { handle, session, sent, stream } = setup(async () => undefined, { streamer: { stream: vi.fn(), isStreaming: () => true } });
    handle(openSocket(), session);
    expect(sent).toEqual([{ type: "ERROR", code: "REVEAL_MAP_BUSY", message: "reveal capacity exceeded" }]);
    expect(session.fogDisabled).toBe(false);
    expect(stream).not.toHaveBeenCalled();
  });

  it("refuses non-admins and requests inside the cooldown", () => {
    const forbidden = setup(async () => undefined);
    forbidden.session.canToggleFog = false;
    forbidden.handle(openSocket(), forbidden.session);
    expect(forbidden.sent).toEqual([{ type: "ERROR", code: "FORBIDDEN", message: "reveal map unavailable" }]);

    const throttled = setup(async () => undefined, { lastRequestMsByPlayerId: new Map([["admin", 99_000]]) });
    throttled.handle(openSocket(), throttled.session);
    expect(throttled.sent).toEqual([{ type: "ERROR", code: "REVEAL_MAP_THROTTLED", message: "reveal request rate limit" }]);
    expect(throttled.session.fogDisabled).toBe(false);
  });
});
