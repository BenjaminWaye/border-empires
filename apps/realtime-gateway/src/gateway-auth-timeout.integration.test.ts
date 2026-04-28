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
  const envBackup = {
    wakeAttempts: process.env.GATEWAY_SIMULATION_WAKE_MAX_ATTEMPTS,
    wakeTotalTimeout: process.env.GATEWAY_SIMULATION_WAKE_TOTAL_TIMEOUT_MS,
    wakeBaseDelay: process.env.GATEWAY_SIMULATION_WAKE_BASE_DELAY_MS,
    wakeMaxDelay: process.env.GATEWAY_SIMULATION_WAKE_MAX_DELAY_MS
  };

  afterEach(async () => {
    while (openApps.length > 0) {
      await openApps.pop()?.close();
    }
    if (typeof envBackup.wakeAttempts === "string") process.env.GATEWAY_SIMULATION_WAKE_MAX_ATTEMPTS = envBackup.wakeAttempts;
    else delete process.env.GATEWAY_SIMULATION_WAKE_MAX_ATTEMPTS;
    if (typeof envBackup.wakeTotalTimeout === "string") process.env.GATEWAY_SIMULATION_WAKE_TOTAL_TIMEOUT_MS = envBackup.wakeTotalTimeout;
    else delete process.env.GATEWAY_SIMULATION_WAKE_TOTAL_TIMEOUT_MS;
    if (typeof envBackup.wakeBaseDelay === "string") process.env.GATEWAY_SIMULATION_WAKE_BASE_DELAY_MS = envBackup.wakeBaseDelay;
    else delete process.env.GATEWAY_SIMULATION_WAKE_BASE_DELAY_MS;
    if (typeof envBackup.wakeMaxDelay === "string") process.env.GATEWAY_SIMULATION_WAKE_MAX_DELAY_MS = envBackup.wakeMaxDelay;
    else delete process.env.GATEWAY_SIMULATION_WAKE_MAX_DELAY_MS;
  });

  it("fails AUTH quickly when simulation subscribe hangs", async () => {
    process.env.GATEWAY_SIMULATION_WAKE_MAX_ATTEMPTS = "1";
    process.env.GATEWAY_SIMULATION_WAKE_TOTAL_TIMEOUT_MS = "1000";
    process.env.GATEWAY_SIMULATION_WAKE_BASE_DELAY_MS = "100";
    process.env.GATEWAY_SIMULATION_WAKE_MAX_DELAY_MS = "100";
    let subscribeCalled = false;
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      commandStore: new InMemoryGatewayCommandStore(),
      simulationSubscribeTimeoutMs: 1_000,
      simulationClient: {
        preparePlayer: async () => ({ playerId: "player-1", spawned: false }),
        submitCommand: async () => undefined,
        subscribePlayer: () => {
          subscribeCalled = true;
          return new Promise(() => {
            // Intentionally unresolved to simulate a dead simulation connection.
          });
        },
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
    expect(subscribeCalled).toBe(false);

    socket.close();
  });

  it("fails AUTH quickly when simulation prepare hangs", async () => {
    let subscribeCalled = false;
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      commandStore: new InMemoryGatewayCommandStore(),
      simulationPrepareTimeoutMs: 1_000,
      simulationClient: {
        preparePlayer: () =>
          new Promise(() => {
            // Intentionally unresolved to simulate a dead prepare RPC.
          }),
        submitCommand: async () => undefined,
        subscribePlayer: async () => {
          subscribeCalled = true;
          return {
            playerId: "player-1",
            tiles: []
          };
        },
        unsubscribePlayer: async () => undefined,
        ping: async () => undefined,
        streamEvents: () => () => undefined
      }
    });
    const started = await app.start();
    openApps.push(app);
    const socket = await openSocket(started.wsUrl);
    const errorMessage = withTimeout(
      "prepare timeout error",
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
    expect(subscribeCalled).toBe(false);

    socket.close();
  });

  it("keeps retrying health during auth until simulation becomes ready", async () => {
    let pingAttempts = 0;
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      commandStore: new InMemoryGatewayCommandStore(),
      simulationSubscribeTimeoutMs: 1_500,
      simulationClient: {
        preparePlayer: async () => ({ playerId: "player-1", spawned: false }),
        submitCommand: async () => undefined,
        subscribePlayer: async () => ({
          playerId: "player-1",
          tiles: []
        }),
        unsubscribePlayer: async () => undefined,
        ping: async () => {
          pingAttempts += 1;
          if (pingAttempts < 3) throw new Error("still starting");
        },
        streamEvents: () => () => undefined
      }
    });
    const started = await app.start();
    openApps.push(app);
    const socket = await openSocket(started.wsUrl);
    const firstMessage = withTimeout(
      "auth init after retries",
      new Promise<Record<string, unknown>>((resolve) => {
        socket.addEventListener(
          "message",
          (event) => {
            resolve(JSON.parse(event.data) as Record<string, unknown>);
          },
          { once: true }
        );
      }),
      3_000
    );

    socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));

    await expect(firstMessage).resolves.toMatchObject({
      type: "INIT"
    });
    expect(pingAttempts).toBeGreaterThanOrEqual(2);

    socket.close();
  });

  it("prepares a player before subscribing during auth, and repeat auth stays safe", async () => {
    const prepareCalls: string[] = [];
    const bootstrapCalls: string[] = [];
    const callOrder: string[] = [];
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      commandStore: new InMemoryGatewayCommandStore(),
      simulationClient: {
        preparePlayer: async (playerId) => {
          callOrder.push(`prepare:${playerId}`);
          prepareCalls.push(playerId);
          return { playerId, spawned: prepareCalls.length === 1 };
        },
        submitCommand: async () => undefined,
        subscribePlayer: async (playerId, subscriptionJson = "{}") => {
          const parsed = JSON.parse(subscriptionJson) as { mode?: string };
          if (parsed.mode === "bootstrap-only") {
            callOrder.push(`bootstrap:${playerId}`);
            bootstrapCalls.push(playerId);
          }
          return {
            playerId,
            tiles: [{ x: 10, y: 10, ownerId: playerId, ownershipState: "SETTLED" }]
          };
        },
        unsubscribePlayer: async () => undefined,
        ping: async () => undefined,
        streamEvents: () => () => undefined
      }
    });
    const started = await app.start();
    openApps.push(app);

    const firstSocket = await openSocket(started.wsUrl);
    firstSocket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    await expect(
      withTimeout(
        "first init",
        new Promise<Record<string, unknown>>((resolve) => {
          firstSocket.addEventListener("message", (event) => resolve(JSON.parse(event.data) as Record<string, unknown>), {
            once: true
          });
        }),
        2_000
      )
    ).resolves.toMatchObject({ type: "INIT" });

    const secondSocket = await openSocket(started.wsUrl);
    secondSocket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    await expect(
      withTimeout(
        "second init",
        new Promise<Record<string, unknown>>((resolve) => {
          secondSocket.addEventListener("message", (event) => resolve(JSON.parse(event.data) as Record<string, unknown>), {
            once: true
          });
        }),
        2_000
      )
    ).resolves.toMatchObject({ type: "INIT" });
    firstSocket.close();
    secondSocket.close();

    expect(prepareCalls).toEqual(["player-1", "player-1"]);
    expect(bootstrapCalls).toEqual(["player-1", "player-1"]);
    expect(callOrder).toEqual(["prepare:player-1", "bootstrap:player-1", "prepare:player-1", "bootstrap:player-1"]);
  });

  it("sends INIT from the bootstrap snapshot and suppresses duplicate bootstrap tile batches", async () => {
    let subscribeCallCount = 0;
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      commandStore: new InMemoryGatewayCommandStore(),
      simulationSubscribeTimeoutMs: 1_000,
      simulationClient: {
        preparePlayer: async (playerId) => ({ playerId, spawned: false }),
        submitCommand: async () => undefined,
        subscribePlayer: async (playerId, subscriptionJson = "{}") => {
          subscribeCallCount += 1;
          const parsed = JSON.parse(subscriptionJson) as { mode?: string };
          expect(parsed.mode).toBe("bootstrap-only");
          return {
            playerId,
            tiles: [{ x: 10, y: 10, ownerId: playerId, ownershipState: "SETTLED" }]
          };
        },
        unsubscribePlayer: async () => undefined,
        ping: async () => undefined,
        streamEvents: () => () => undefined
      }
    });
    const started = await app.start();
    openApps.push(app);

    const socket = await openSocket(started.wsUrl);
    socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));

    await expect(
      withTimeout(
        "bootstrap init",
        new Promise<Record<string, unknown>>((resolve) => {
          socket.addEventListener("message", (event) => resolve(JSON.parse(event.data) as Record<string, unknown>), { once: true });
        }),
        1_500
      )
    ).resolves.toMatchObject({
      type: "INIT",
      player: expect.objectContaining({ id: "player-1" }),
      initialState: expect.objectContaining({
        tiles: [expect.objectContaining({ x: 10, y: 10, ownerId: "player-1", ownershipState: "SETTLED" })]
      })
    });
    expect(subscribeCallCount).toBe(1);

    await expect(
      withTimeout(
        "unexpected bootstrap tile batch",
        new Promise<Record<string, unknown>>((resolve) => {
          socket.addEventListener("message", (event) => resolve(JSON.parse(event.data) as Record<string, unknown>), { once: true });
        }),
        150
      )
    ).rejects.toThrow(/timed out/);

    socket.close();
  });
});
