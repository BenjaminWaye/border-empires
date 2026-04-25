import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "./command-store.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import type { SimulationClientEvent } from "./sim-client.js";

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

const withTimeout = async <T>(label: string, task: Promise<T>, timeoutMs = 2_500): Promise<T> => {
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
      socket.addEventListener("message", (event) => {
        const parsed = JSON.parse(event.data) as T;
        if (predicate(parsed)) resolve(parsed);
      });
    }),
    timeoutMs
  );

describe("gateway command delivery debug bundle", () => {
  const openApps: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    while (openApps.length > 0) {
      await openApps.pop()?.close();
    }
  });

  it("records simulation receipt and payload delivery for resolved frontier commands", async () => {
    let emitSimulationEvent: ((event: SimulationClientEvent) => void) | undefined;
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      commandStore: new InMemoryGatewayCommandStore(),
      simulationClient: {
        submitCommand: async () => undefined,
        subscribePlayer: async () => ({
          playerId: "player-1",
          tiles: []
        }),
        unsubscribePlayer: async () => undefined,
        ping: async () => undefined,
        streamEvents: (listener) => {
          emitSimulationEvent = listener;
          return () => undefined;
        }
      }
    });
    const started = await app.start();
    openApps.push(app);

    const socket = await openSocket(started.wsUrl);
    socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    await expect(waitForMessage(socket, "init", (message) => message.type === "INIT")).resolves.toMatchObject({
      type: "INIT"
    });

    emitSimulationEvent?.({
      eventType: "COMMAND_ACCEPTED",
      commandId: "cmd-debug-1",
      playerId: "player-1",
      actionType: "EXPAND",
      originX: 326,
      originY: 191,
      targetX: 326,
      targetY: 192,
      resolvesAt: 10_000
    });
    await expect(waitForMessage(socket, "action accepted", (message) => message.type === "ACTION_ACCEPTED")).resolves.toMatchObject({
      type: "ACTION_ACCEPTED",
      commandId: "cmd-debug-1"
    });

    emitSimulationEvent?.({
      eventType: "COMBAT_RESOLVED",
      commandId: "cmd-debug-1",
      playerId: "player-1",
      actionType: "EXPAND",
      originX: 326,
      originY: 191,
      targetX: 326,
      targetY: 192,
      attackerWon: true
    });
    await expect(waitForMessage(socket, "frontier result", (message) => message.type === "FRONTIER_RESULT")).resolves.toMatchObject({
      type: "FRONTIER_RESULT",
      commandId: "cmd-debug-1"
    });

    const debugResponse = await app.app.inject({ method: "GET", url: "/admin/runtime/debug-bundle" });
    expect(debugResponse.statusCode).toBe(200);
    const debugBundle = debugResponse.json() as {
      recentServerEvents: Array<{ event: string; payload: Record<string, unknown> }>;
    };
    expect(debugBundle.recentServerEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "gateway_simulation_event_received",
          payload: expect.objectContaining({
            commandId: "cmd-debug-1",
            eventType: "COMBAT_RESOLVED",
            actionType: "EXPAND",
            targetX: 326,
            targetY: 192
          })
        }),
        expect.objectContaining({
          event: "gateway_command_payload_sent",
          payload: expect.objectContaining({
            commandId: "cmd-debug-1",
            payloadType: "FRONTIER_RESULT",
            playerId: "player-1",
            channel: "control",
            initSent: true,
            targetX: 326,
            targetY: 192
          })
        })
      ])
    );

    socket.close();
  });
});
