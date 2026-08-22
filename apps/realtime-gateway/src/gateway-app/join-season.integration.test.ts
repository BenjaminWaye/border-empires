import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
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

// Login now only calls preparePlayer (never auto-joins). JOIN_SEASON is the
// only path that should call simulationClient.joinSeason. This covers both
// halves: login does not trigger joinSeason, and JOIN_SEASON does.
describe("JOIN_SEASON dispatcher", () => {
  const openApps: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    while (openApps.length > 0) {
      await openApps.pop()?.close();
    }
  });

  it("does not call joinSeason during login, and calls it on JOIN_SEASON", async () => {
    let joinSeasonCalls = 0;
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      defaultHumanPlayerId: "player-1",
      commandStore: new InMemoryGatewayCommandStore(),
      simulationClient: {
        preparePlayer: async () => ({ playerId: "player-1", spawned: false, joined: false }),
        joinSeason: async () => {
          joinSeasonCalls += 1;
          return { playerId: "player-1", spawned: true, joined: true };
        },
        submitCommand: async () => undefined,
        subscribePlayer: async () => ({ playerId: "player-1", tiles: [] }),
        unsubscribePlayer: async () => undefined,
        getSubscriptionNamespace: async () => "1",
        ping: async () => undefined,
        streamEvents: (_listener, options) => {
          options?.onConnect?.();
          return () => undefined;
        }
      }
    });
    const started = await app.start();
    openApps.push(app);

    const socket = await openSocket(started.wsUrl);
    socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    await expect(waitForMessage(socket, "init", (message) => message.type === "INIT")).resolves.toMatchObject({
      type: "INIT",
      needsSeasonJoin: true
    });
    expect(joinSeasonCalls).toBe(0);

    socket.send(JSON.stringify({ type: "JOIN_SEASON" }));
    await expect(
      waitForMessage(socket, "join season ack", (message) => message.type === "JOIN_SEASON_ACK")
    ).resolves.toMatchObject({ type: "JOIN_SEASON_ACK", spawned: true });
    expect(joinSeasonCalls).toBe(1);

    socket.close();
  });

  it("falls back to preparePlayer for JOIN_SEASON when the client has no joinSeason RPC", async () => {
    let preparePlayerCalls = 0;
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      defaultHumanPlayerId: "player-1",
      commandStore: new InMemoryGatewayCommandStore(),
      simulationClient: {
        preparePlayer: async () => {
          preparePlayerCalls += 1;
          return { playerId: "player-1", spawned: preparePlayerCalls > 1, joined: preparePlayerCalls > 1 };
        },
        submitCommand: async () => undefined,
        subscribePlayer: async () => ({ playerId: "player-1", tiles: [] }),
        unsubscribePlayer: async () => undefined,
        getSubscriptionNamespace: async () => "1",
        ping: async () => undefined,
        streamEvents: (_listener, options) => {
          options?.onConnect?.();
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

    socket.send(JSON.stringify({ type: "JOIN_SEASON" }));
    await expect(
      waitForMessage(socket, "join season ack", (message) => message.type === "JOIN_SEASON_ACK")
    ).resolves.toMatchObject({ type: "JOIN_SEASON_ACK", spawned: true });
    expect(preparePlayerCalls).toBe(2);

    socket.close();
  });
});
