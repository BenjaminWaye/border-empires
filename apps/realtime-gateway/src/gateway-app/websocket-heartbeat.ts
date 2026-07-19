import type { WebSocket } from "ws";

/**
 * Server-initiated ws-level ping/pong keep-alive.
 *
 * Root cause this addresses: players were reporting frequent disconnects,
 * many with close code 1005/1006 (no close frame at all) — the signature of
 * an idle connection getting silently dropped by a proxy/load-balancer, or a
 * genuinely dead TCP connection (phone backgrounded, laptop slept, wifi
 * handoff) that the OS/network stack never told either side about. Without
 * any traffic, both sides can sit "connected" for a long time believing the
 * socket is alive when it's actually gone.
 *
 * This pings every tracked socket on a fixed interval. Browsers (and the
 * `ws` server on the other end) respond to ws-level ping frames with a pong
 * automatically at the protocol layer — no client code change is needed. If
 * a socket didn't pong back since the last ping, it's treated as dead and
 * terminated, which frees resources faster than waiting on a TCP timeout and
 * immediately triggers the existing close-handling pipeline (metrics,
 * logging, Slack alert) for that socket. As a side effect, the periodic
 * traffic itself also keeps genuinely-idle-but-alive connections from being
 * silently reaped by intermediary proxies with their own idle timeouts.
 */

export type WebSocketHeartbeat = {
  /** Register a newly-accepted socket to be pinged on the interval. */
  registerSocket: (socket: WebSocket) => void;
  /** Clears the interval. Call on server shutdown. */
  stop: () => void;
};

export type WebSocketHeartbeatOptions = {
  intervalMs?: number;
  onTerminatedForMissedPong?: (socket: WebSocket) => void;
};

const DEFAULT_INTERVAL_MS = 30_000;

export const createWebSocketHeartbeat = (options: WebSocketHeartbeatOptions = {}): WebSocketHeartbeat => {
  const intervalMs = Math.max(1_000, options.intervalMs ?? DEFAULT_INTERVAL_MS);
  // Bounded by construction: sockets are added on connect and removed on
  // their own "close" event, so this never outlives the connections it
  // tracks (see docs/agents/state-and-persistence-discipline.md).
  const isAlive = new WeakMap<WebSocket, boolean>();
  const trackedSockets = new Set<WebSocket>();

  const timer = setInterval(() => {
    for (const socket of trackedSockets) {
      if (isAlive.get(socket) === false) {
        options.onTerminatedForMissedPong?.(socket);
        socket.terminate();
        continue;
      }
      isAlive.set(socket, false);
      try {
        socket.ping();
      } catch {
        // Socket is already closing/closed; the "close" listener below will
        // remove it from trackedSockets shortly.
      }
    }
  }, intervalMs);
  timer.unref?.();

  return {
    registerSocket(socket: WebSocket): void {
      isAlive.set(socket, true);
      trackedSockets.add(socket);
      socket.on("pong", () => isAlive.set(socket, true));
      socket.once("close", () => trackedSockets.delete(socket));
    },
    stop(): void {
      clearInterval(timer);
      trackedSockets.clear();
    }
  };
};
