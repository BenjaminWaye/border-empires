import { afterEach, describe, expect, it } from "vitest";

import { createRealtimeGatewayApp } from "./gateway-app.js";
import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";

process.env.GATEWAY_MIN_BOOTSTRAP_INTERVAL_MS = "0";
process.env.GATEWAY_MAX_CONCURRENT_BOOTSTRAPS = "999";

type TestWebSocket = {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: "open" | "message" | "close", listener: (event?: { data: string }) => void, options?: { once?: boolean }): void;
};

const WebSocketCtor = (globalThis as typeof globalThis & { WebSocket?: new (url: string) => TestWebSocket }).WebSocket;

const withTimeout = async <T>(label: string, task: Promise<T>, timeoutMs = 2_000): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const openSocket = async (url: string): Promise<TestWebSocket> => {
  if (!WebSocketCtor) throw new Error("global WebSocket is unavailable in this runtime");
  const socket = new WebSocketCtor(url);
  await withTimeout("socket open", new Promise<void>((resolve) => socket.addEventListener("open", () => resolve(), { once: true })));
  return socket;
};

const waitFor = async (label: string, predicate: () => boolean, timeoutMs = 2_000): Promise<void> => {
  let intervalId: ReturnType<typeof setInterval> | undefined;
  try {
    await withTimeout(
      label,
      new Promise<void>((resolve) => {
        intervalId = setInterval(() => {
          if (!predicate()) return;
          if (intervalId) clearInterval(intervalId);
          resolve();
        }, 10);
      }),
      timeoutMs
    );
  } finally {
    if (intervalId) clearInterval(intervalId);
  }
};

const connectedStream = (_listener?: unknown, options?: { onConnect?: () => void }) => {
  options?.onConnect?.();
  return () => undefined;
};

describe("gateway abandoned login (zombie socket)", () => {
  const openApps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (openApps.length > 0) await openApps.pop()?.close();
  });

  it("does not attach a socket that closed during the bootstrap subscribe", async () => {
    let subscribeCalled = false;
    let sawCloseCommand = false;
    let resolveBootstrap: ((snapshot: { playerId: string; tiles: [] }) => void) | undefined;
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      defaultHumanPlayerId: "player-1",
      commandStore: new InMemoryGatewayCommandStore(),
      simulationSubscribeTimeoutMs: 5_000,
      simulationClient: {
        preparePlayer: async () => ({ playerId: "player-1", spawned: false }),
        // The gateway's close handler submits an UNWATCH_MUSTER command once it
        // observes the disconnect — our signal that the server-side socket is
        // now CLOSED, so it is safe to resolve the (still in-flight) bootstrap.
        submitCommand: async (command: { type: string }) => {
          if (command.type === "UNWATCH_MUSTER") sawCloseCommand = true;
        },
        subscribePlayer: () => {
          subscribeCalled = true;
          return new Promise<{ playerId: string; tiles: [] }>((resolve) => {
            resolveBootstrap = () => resolve({ playerId: "player-1", tiles: [] });
          });
        },
        unsubscribePlayer: async () => undefined,
        getSubscriptionNamespace: async () => "1",
        ping: async () => undefined,
        streamEvents: connectedStream
      }
    });
    const started = await app.start();
    openApps.push(app);

    const socket = await openSocket(started.wsUrl);
    socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    await waitFor("bootstrap subscribe called", () => subscribeCalled);

    // Client gives up mid-bootstrap; wait until the server processes the close.
    socket.close();
    await waitFor("server observed close", () => sawCloseCommand);

    // Now the bootstrap resolves — the guard must abort instead of attaching.
    resolveBootstrap?.();

    // Assert via the /metrics endpoint (renderPrometheus) that the abort fired.
    const abandonedCount = async (): Promise<number> => {
      const text = await (await fetch(`${started.address}/metrics`)).text();
      const match = text.match(/gateway_login_abandoned_before_attach_total (\d+)/);
      return match ? Number(match[1]) : 0;
    };
    let count = 0;
    for (let i = 0; i < 50 && count < 1; i += 1) {
      count = await abandonedCount();
      if (count < 1) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(count).toBe(1);
  });
});
