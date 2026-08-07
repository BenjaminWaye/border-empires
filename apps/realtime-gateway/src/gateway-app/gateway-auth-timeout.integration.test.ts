import { afterEach, describe, expect, it } from "vitest";

import { createRealtimeGatewayApp } from "./gateway-app.js";
import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";

process.env.GATEWAY_MIN_BOOTSTRAP_INTERVAL_MS = "0";
process.env.GATEWAY_MAX_CONCURRENT_BOOTSTRAPS = "999";

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

// LOGIN_PHASE is progress-only noise sent throughout the AUTH handler and can
// arrive at almost any point between AUTH and INIT/ERROR — skip it so a
// single-message wait doesn't accidentally grab a heartbeat instead of the
// real reply.
const nextRealMessage = async (
  socket: TestWebSocket,
  label: string,
  timeoutMs?: number
): Promise<Record<string, unknown>> => {
  for (;;) {
    const message = await withTimeout(
      label,
      new Promise<Record<string, unknown>>((resolve) => {
        socket.addEventListener("message", (event) => resolve(JSON.parse(event.data) as Record<string, unknown>), {
          once: true
        });
      }),
      timeoutMs
    );
    if (message.type !== "LOGIN_PHASE") return message;
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

const connectedStream = (_listener?: unknown, options?: { onConnect?: () => void; onDisconnect?: (error: Error | null) => void }) => {
  options?.onConnect?.();
  return () => undefined;
};

const waitFor = async (label: string, predicate: () => boolean, timeoutMs = 1_500): Promise<void> => {
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
      defaultHumanPlayerId: "player-1",
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
        getSubscriptionNamespace: async () => "1",
        ping: async () => {
          throw new Error("simulation unavailable");
        },
        streamEvents: connectedStream
      }
    });
    const started = await app.start();
    openApps.push(app);
    const socket = await openSocket(started.wsUrl);
    const errorMessage = nextRealMessage(socket, "auth timeout error", 2_000);

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
      defaultHumanPlayerId: "player-1",
      commandStore: new InMemoryGatewayCommandStore(),
      simulationPrepareTimeoutMs: 1_000,
      simulationRpcRetryAttempts: 1,
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
        getSubscriptionNamespace: async () => "1",
        ping: async () => undefined,
        streamEvents: connectedStream
      }
    });
    const started = await app.start();
    openApps.push(app);
    const socket = await openSocket(started.wsUrl);
    const errorMessage = nextRealMessage(socket, "prepare timeout error", 2_000);

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
      defaultHumanPlayerId: "player-1",
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
        getSubscriptionNamespace: async () => "1",
        ping: async () => {
          pingAttempts += 1;
          if (pingAttempts < 3) throw new Error("still starting");
        },
        streamEvents: connectedStream
      }
    });
    const started = await app.start();
    openApps.push(app);
    const socket = await openSocket(started.wsUrl);
    const firstMessage = nextRealMessage(socket, "auth init after retries", 3_000);

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
    const liveSubscribeCalls: string[] = [];
    const callOrder: string[] = [];
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      defaultHumanPlayerId: "player-1",
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
          } else {
            callOrder.push(`live-subscribe:${playerId}`);
            liveSubscribeCalls.push(playerId);
            expect(parsed.emitBootstrapEvent).toBe(false);
          }
          return {
            playerId,
            tiles: [{ x: 10, y: 10, ownerId: playerId, ownershipState: "SETTLED" }]
          };
        },
        unsubscribePlayer: async () => undefined,
        getSubscriptionNamespace: async () => "1",
        ping: async () => undefined,
        streamEvents: connectedStream
      }
    });
    const started = await app.start();
    openApps.push(app);

    const firstSocket = await openSocket(started.wsUrl);
    firstSocket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    await expect(nextRealMessage(firstSocket, "first init", 2_000)).resolves.toMatchObject({ type: "INIT" });

    const secondSocket = await openSocket(started.wsUrl);
    secondSocket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    await expect(nextRealMessage(secondSocket, "second init", 2_000)).resolves.toMatchObject({ type: "INIT" });
    firstSocket.close();
    secondSocket.close();

    expect(prepareCalls).toEqual(["player-1", "player-1"]);
    expect(bootstrapCalls).toEqual(["player-1", "player-1"]);
    expect(liveSubscribeCalls).toEqual(["player-1"]);
    expect(callOrder).toEqual(["prepare:player-1", "bootstrap:player-1", "live-subscribe:player-1", "prepare:player-1", "bootstrap:player-1"]);
  });

  it("keeps one net rally use when control and bulk authenticate with the same invite", async () => {
    const prepareCallsByPlayer = new Map<string, number>();
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      defaultHumanPlayerId: "owner-1",
      commandStore: new InMemoryGatewayCommandStore(),
      simulationClient: {
        preparePlayer: async (playerId, rallyAnchor) => {
          const count = (prepareCallsByPlayer.get(playerId) ?? 0) + 1;
          prepareCallsByPlayer.set(playerId, count);
          if (playerId === "friend-1") {
            if (count === 1) expect(rallyAnchor).toEqual({ x: 12, y: 34, island: "tile:12,34" });
            else expect(rallyAnchor).toBeUndefined();
            return { playerId, spawned: count === 1 };
          }
          return { playerId, spawned: false };
        },
        submitCommand: async () => undefined,
        subscribePlayer: async (playerId) => ({
          playerId,
          tiles:
            playerId === "owner-1"
              ? [{ x: 12, y: 34, ownerId: "owner-1", ownershipState: "SETTLED" }]
              : [{ x: 40, y: 41, ownerId: "friend-1", ownershipState: "SETTLED" }]
        }),
        unsubscribePlayer: async () => undefined,
        getSubscriptionNamespace: async () => "1",
        ping: async () => undefined,
        getCurrentSeasonSummary: async () => ({
          season: "season-1",
          seasonId: "season-1",
          seasonSequence: 1,
          status: "active",
          startedAt: 1_000,
          worldSeed: 42,
          rulesetId: "seasonal-default",
          leaderboard: { overall: [], byTiles: [], byIncome: [], byTechs: [] },
          overall: [],
          byTiles: [],
          byIncome: [],
          byTechs: [],
          seasonVictory: [],
          onlinePlayers: 0,
          totalPlayers: 0,
          townCount: 0,
          updatedAt: 1_100
        }),
        listSeasonArchives: async () => [],
        startNextSeason: async () => ({ seasonId: "season-2" }),
        streamEvents: connectedStream
      }
    });
    const started = await app.start();
    openApps.push(app);

    const createResponse = await fetch(`${started.address}/rally/links`, {
      method: "POST",
      headers: { Authorization: "Bearer owner-1", "Content-Type": "application/json" },
      body: JSON.stringify({ maxUses: 2 })
    });
    expect(createResponse.status).toBe(200);
    const created = (await createResponse.json()) as { code: string };

    const controlSocket = await openSocket(`${started.wsUrl}?channel=control`);
    const bulkSocket = await openSocket(`${started.wsUrl}?channel=bulk`);
    controlSocket.send(JSON.stringify({ type: "AUTH", token: "friend-1", rallyCode: created.code }));
    await expect(nextRealMessage(controlSocket, "control rally init", 2_000)).resolves.toMatchObject({ type: "INIT" });

    bulkSocket.send(JSON.stringify({ type: "AUTH", token: "friend-1", rallyCode: created.code }));
    await waitFor("bulk rally auth", () => prepareCallsByPlayer.get("friend-1") === 2, 2_000);

    const publicResponse = await fetch(`${started.address}/rally/links/${created.code}`);
    expect(publicResponse.status).toBe(200);
    await expect(publicResponse.json()).resolves.toEqual(expect.objectContaining({ usesRemaining: 1 }));
    expect(prepareCallsByPlayer.get("friend-1")).toBe(2);

    controlSocket.close();
    bulkSocket.close();
  });

  it("sends INIT from the bootstrap snapshot and suppresses duplicate bootstrap tile batches", async () => {
    let bootstrapSubscribeCallCount = 0;
    let liveSubscribeCallCount = 0;
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      defaultHumanPlayerId: "player-1",
      commandStore: new InMemoryGatewayCommandStore(),
      simulationSubscribeTimeoutMs: 1_000,
      simulationClient: {
        preparePlayer: async (playerId) => ({ playerId, spawned: false }),
        submitCommand: async () => undefined,
        subscribePlayer: async (playerId, subscriptionJson = "{}") => {
          const parsed = JSON.parse(subscriptionJson) as { mode?: string };
          if (parsed.mode === "bootstrap-only") {
            bootstrapSubscribeCallCount += 1;
          } else {
            liveSubscribeCallCount += 1;
            expect(parsed.emitBootstrapEvent).toBe(false);
          }
          return {
            playerId,
            tiles: [{ x: 10, y: 10, ownerId: playerId, ownershipState: "SETTLED" }]
          };
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

    await expect(nextRealMessage(socket, "bootstrap init", 1_500)).resolves.toMatchObject({
      type: "INIT",
      player: expect.objectContaining({ id: "player-1" }),
      initialState: expect.objectContaining({
        tiles: [expect.objectContaining({ x: 10, y: 10, ownerId: "player-1", ownershipState: "SETTLED" })]
      })
    });
    expect(bootstrapSubscribeCallCount).toBe(1);
    expect(liveSubscribeCallCount).toBe(1);

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

  it("rolls back the attached socket when live subscribe fails after bootstrap", async () => {
    let unsubscribeCalls = 0;
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      defaultHumanPlayerId: "player-1",
      commandStore: new InMemoryGatewayCommandStore(),
      simulationSubscribeTimeoutMs: 1_000,
      simulationRpcRetryAttempts: 1,
      simulationClient: {
        preparePlayer: async (playerId) => ({ playerId, spawned: false }),
        submitCommand: async () => undefined,
        subscribePlayer: async (playerId, subscriptionJson = "{}") => {
          const parsed = JSON.parse(subscriptionJson) as { mode?: string };
          if (parsed.mode === "bootstrap-only") {
            return {
              playerId,
              tiles: [{ x: 10, y: 10, ownerId: playerId, ownershipState: "SETTLED" }]
            };
          }
          return await new Promise(() => {
            // Intentionally unresolved to force the live subscribe timeout path.
          });
        },
        unsubscribePlayer: async () => {
          unsubscribeCalls += 1;
        },
        getSubscriptionNamespace: async () => "1",
        ping: async () => undefined,
        streamEvents: connectedStream
      }
    });
    const started = await app.start();
    openApps.push(app);

    const socket = await openSocket(started.wsUrl);
    const firstMessage = withTimeout(
      "live subscribe rollback error",
      new Promise<Record<string, unknown>>((resolve) => {
        socket.addEventListener("message", (event) => { const message = JSON.parse(event.data) as Record<string, unknown>; if (message.type === "ERROR") resolve(message); });
      }),
      2_000
    );

    socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));

    await expect(firstMessage).resolves.toEqual({
      type: "ERROR",
      code: "SERVER_STARTING",
      message: "Realtime simulation is temporarily unavailable. Retry shortly."
    });
    expect(unsubscribeCalls).toBe(1);

    socket.close();
  });

  it("logs a gateway_auth_step_slow warning for a slow-but-successful live subscribe", async () => {
    // Regression guard: the live_subscribe step (the SubscribePlayer RPC that
    // triggers the sim's per-player visible-state export) previously had NO
    // slow-step warning, unlike every sibling auth step (resolve_initial_state,
    // build_init_message, ...). A real incident reproducing exactly this shape
    // (25-29s live_subscribe stall, login still succeeds) left no server-side
    // log trail once the short-lived Fly log buffer rolled past it.
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      defaultHumanPlayerId: "player-1",
      commandStore: new InMemoryGatewayCommandStore(),
      // Well below the default 100ms slow-step threshold triggers this warning.
      simulationClient: {
        preparePlayer: async () => ({ playerId: "player-1", spawned: false }),
        submitCommand: async () => undefined,
        subscribePlayer: async (playerId) => {
          await new Promise((resolve) => setTimeout(resolve, 150));
          return { playerId, tiles: [{ x: 1, y: 1, ownerId: playerId, ownershipState: "SETTLED" }] };
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
    const initMessage = nextRealMessage(socket, "auth init after slow subscribe", 3_000);

    socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));

    await expect(initMessage).resolves.toMatchObject({ type: "INIT" });

    // The event is recorded synchronously right when live_subscribe resolves
    // (before INIT_MESSAGE), so it should already be present by the time INIT
    // arrives client-side — this loop is a small safety margin against timing
    // flakiness rather than a real wait for async work to complete.
    const debugBundleUrl = `http://${started.host}:${started.port}/admin/runtime/debug-bundle`;
    let slowStepEvent: Record<string, unknown> | undefined;
    for (let attempt = 0; attempt < 20 && !slowStepEvent; attempt += 1) {
      const response = await fetch(debugBundleUrl);
      const body = (await response.json()) as { recentServerEvents: Array<Record<string, unknown>> };
      slowStepEvent = body.recentServerEvents.find(
        (event) => event.event === "gateway_auth_step_slow" && (event.payload as Record<string, unknown>)?.step === "live_subscribe"
      );
      if (!slowStepEvent) await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(slowStepEvent).toMatchObject({
      level: "warn",
      event: "gateway_auth_step_slow",
      payload: {
        step: "live_subscribe",
        playerId: "player-1",
        tileCount: 1
      }
    });
    expect((slowStepEvent?.payload as Record<string, unknown>).durationMs as number).toBeGreaterThanOrEqual(100);

    socket.close();
  });
});
