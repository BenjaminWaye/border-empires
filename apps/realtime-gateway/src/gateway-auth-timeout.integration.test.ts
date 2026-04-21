import { afterEach, describe, expect, it } from "vitest";

import { createRealtimeGatewayApp } from "./gateway-app.js";
import { InMemoryGatewayCommandStore } from "./command-store.js";

type TestWebSocket = {
  readonly readyState: number;
  readonly CLOSED: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: "open", listener: () => void, options?: { once?: boolean }): void;
  addEventListener(type: "message", listener: (event: { data: string }) => void, options?: { once?: boolean }): void;
  addEventListener(type: "close", listener: () => void, options?: { once?: boolean }): void;
};

const WebSocketCtor = (globalThis as typeof globalThis & { WebSocket?: new (url: string) => TestWebSocket }).WebSocket;

const withTimeout = async <T>(label: string, task: Promise<T>, timeoutMs = 1_500): Promise<T> => {
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
  await withTimeout(
    `socket open (${url})`,
    new Promise<void>((resolve) => {
      socket.addEventListener("open", () => resolve(), { once: true });
    })
  );
  return socket;
};

describe("gateway auth timeout", () => {
  const openApps: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    while (openApps.length > 0) {
      await openApps.pop()?.close();
    }
  });

  it("fails AUTH quickly when simulation subscribe hangs", async () => {
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      commandStore: new InMemoryGatewayCommandStore(),
      simulationSubscribeTimeoutMs: 1_000,
      simulationClient: {
        submitCommand: async () => undefined,
        subscribePlayer: () =>
          new Promise(() => {
            // Intentionally unresolved to simulate a dead simulation connection.
          }),
        unsubscribePlayer: async () => undefined,
        ping: async () => {
          throw new Error("simulation unavailable");
        },
        streamEvents: () => () => undefined
      }
    });
    const started = await app.start();
    openApps.push(app);
    const socket = await openSocket(started.wsUrl);
    const errorMessage = withTimeout(
      "auth timeout error",
      new Promise<Record<string, unknown>>((resolve) => {
        socket.addEventListener(
          "message",
          (event) => {
            resolve(JSON.parse(event.data) as Record<string, unknown>);
          },
          { once: true }
        );
      }),
      2_000
    );

    socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));

    await expect(errorMessage).resolves.toEqual({
      type: "ERROR",
      code: "SERVER_STARTING",
      message: "Realtime simulation is temporarily unavailable. Retry shortly."
    });

    socket.close();
  });
});
