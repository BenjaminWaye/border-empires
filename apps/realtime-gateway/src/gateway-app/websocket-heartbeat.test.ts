import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";

import { createWebSocketHeartbeat } from "./websocket-heartbeat.js";

// A minimal fake that behaves enough like a `ws` WebSocket for this module:
// supports on/once("pong"|"close", ...), ping(), and terminate().
class FakeSocket extends EventEmitter {
  pinged = 0;
  terminated = false;
  ping(): void {
    this.pinged += 1;
  }
  terminate(): void {
    this.terminated = true;
    this.emit("close");
  }
  // Simulates the browser/peer automatically responding to a ping with a pong.
  respondToPing(): void {
    this.emit("pong");
  }
}

describe("createWebSocketHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pings every registered socket on the interval", () => {
    const heartbeat = createWebSocketHeartbeat({ intervalMs: 1_000 });
    const socket = new FakeSocket();
    heartbeat.registerSocket(socket as unknown as WebSocket);

    vi.advanceTimersByTime(1_000);
    expect(socket.pinged).toBe(1);

    socket.respondToPing();
    vi.advanceTimersByTime(1_000);
    expect(socket.pinged).toBe(2);

    heartbeat.stop();
  });

  it("terminates a socket that never responds to a ping before the next tick", () => {
    const heartbeat = createWebSocketHeartbeat({ intervalMs: 1_000 });
    const socket = new FakeSocket();
    heartbeat.registerSocket(socket as unknown as WebSocket);

    vi.advanceTimersByTime(1_000); // first ping sent, no pong yet
    expect(socket.terminated).toBe(false);

    vi.advanceTimersByTime(1_000); // still no pong since the first ping
    expect(socket.terminated).toBe(true);

    heartbeat.stop();
  });

  it("does not terminate a socket that keeps responding to pings", () => {
    const heartbeat = createWebSocketHeartbeat({ intervalMs: 1_000 });
    const socket = new FakeSocket();
    heartbeat.registerSocket(socket as unknown as WebSocket);

    for (let i = 0; i < 5; i += 1) {
      vi.advanceTimersByTime(1_000);
      socket.respondToPing();
    }

    expect(socket.terminated).toBe(false);
    heartbeat.stop();
  });

  it("calls onTerminatedForMissedPong when a socket is reaped", () => {
    const onTerminatedForMissedPong = vi.fn();
    const heartbeat = createWebSocketHeartbeat({ intervalMs: 1_000, onTerminatedForMissedPong });
    const socket = new FakeSocket();
    heartbeat.registerSocket(socket as unknown as WebSocket);

    vi.advanceTimersByTime(2_000);

    expect(onTerminatedForMissedPong).toHaveBeenCalledWith(socket);
    heartbeat.stop();
  });

  it("stops tracking a socket once it closes on its own (bounded memory)", () => {
    const heartbeat = createWebSocketHeartbeat({ intervalMs: 1_000 });
    const socket = new FakeSocket();
    heartbeat.registerSocket(socket as unknown as WebSocket);

    socket.emit("close"); // ordinary disconnect, not a heartbeat timeout
    vi.advanceTimersByTime(5_000);

    // No further pings/terminations after the socket announced its own close —
    // proves the tracked-sockets set actually drops the reference instead of
    // growing forever across the process lifetime.
    expect(socket.pinged).toBe(0);
    expect(socket.terminated).toBe(false);
    heartbeat.stop();
  });

  it("does not throw if a socket errors on ping (e.g. already closing)", () => {
    const heartbeat = createWebSocketHeartbeat({ intervalMs: 1_000 });
    const socket = new FakeSocket();
    socket.ping = () => {
      throw new Error("not open");
    };
    heartbeat.registerSocket(socket as unknown as WebSocket);

    expect(() => vi.advanceTimersByTime(1_000)).not.toThrow();
    heartbeat.stop();
  });
});
