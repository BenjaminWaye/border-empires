import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "./command-store.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";

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
  await withTimeout(
    `socket open (${url})`,
    new Promise<void>((resolve) => {
      socket.addEventListener("open", () => resolve(), { once: true });
    })
  );
  return socket;
};

const waitForMessage = async <T extends Record<string, unknown>>(
  socket: TestWebSocket,
  label: string,
  predicate: (message: T) => boolean,
  timeoutMs = 2_500
): Promise<T> =>
  withTimeout(
    label,
    new Promise<T>((resolve) => {
      const onMessage = (event: { data: string }) => {
        const parsed = JSON.parse(event.data) as T;
        if (!predicate(parsed)) return;
        resolve(parsed);
      };
      socket.addEventListener("message", onMessage);
    }),
    timeoutMs
  );

describe("gateway command submit timeout handling", () => {
  const openApps: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    while (openApps.length > 0) {
      await openApps.pop()?.close();
    }
  });

  it("returns SIMULATION_UNAVAILABLE when command submit hangs beyond timeout", async () => {
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      commandStore: new InMemoryGatewayCommandStore(),
      simulationSubmitTimeoutMs: 75,
      simulationClient: {
        preparePlayer: async () => ({ playerId: "player-1", spawned: false }),
        submitCommand: async () =>
          await new Promise<void>(() => {
            // Intentionally unresolved to simulate a hung submit RPC.
          }),
        subscribePlayer: async () => ({
          playerId: "player-1",
          tiles: []
        }),
        unsubscribePlayer: async () => undefined,
        ping: async () => undefined,
        streamEvents: () => () => undefined
      }
    });
    const started = await app.start();
    openApps.push(app);

    const socket = await openSocket(started.wsUrl);
    socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    await expect(waitForMessage(socket, "init", (message) => message.type === "INIT")).resolves.toMatchObject({
      type: "INIT"
    });

    socket.send(
      JSON.stringify({
        type: "EXPAND",
        fromX: 324,
        fromY: 186,
        toX: 325,
        toY: 186,
        commandId: "cmd-submit-timeout",
        clientSeq: 1
      })
    );

    await expect(waitForMessage(socket, "queued", (message) => message.type === "COMMAND_QUEUED")).resolves.toMatchObject({
      type: "COMMAND_QUEUED",
      commandId: "cmd-submit-timeout"
    });
    await expect(waitForMessage(socket, "submit-timeout error", (message) => message.type === "ERROR")).resolves.toMatchObject({
      type: "ERROR",
      commandId: "cmd-submit-timeout",
      code: "SIMULATION_UNAVAILABLE",
      message: "command could not be queued in simulation"
    });

    socket.close();
  });
});
