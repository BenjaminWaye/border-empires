import { afterEach, describe, expect, it } from "vitest";

import { anonymizedEmpireNameForId } from "@border-empires/shared";

import { createRealtimeGatewayApp } from "./gateway-app.js";
import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { InMemoryGatewayPlayerProfileStore } from "../player-profile-store/player-profile-store.js";
import type { SimulationClientEvent } from "../sim-client/sim-client.js";

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

type BufferedSocket = {
  socket: TestWebSocket;
  nextJsonMessage: (label: string) => Promise<Record<string, unknown>>;
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

const openSocket = async (url: string): Promise<BufferedSocket> => {
  if (!WebSocketCtor) throw new Error("global WebSocket is unavailable in this runtime");
  const socket = new WebSocketCtor(url);
  const queuedMessages: string[] = [];
  const pendingResolvers: Array<(payload: string) => void> = [];
  socket.addEventListener("message", (event) => {
    const nextResolver = pendingResolvers.shift();
    if (nextResolver) {
      nextResolver(event.data);
      return;
    }
    queuedMessages.push(event.data);
  });
  await withTimeout(
    `socket open (${url})`,
    new Promise<void>((resolve) => {
      socket.addEventListener("open", () => resolve(), { once: true });
    })
  );
  return {
    socket,
    nextJsonMessage: async (label: string) => {
      const queued = queuedMessages.shift();
      if (queued) return JSON.parse(queued) as Record<string, unknown>;
      const payload = await withTimeout(
        `message ${label}`,
        new Promise<string>((resolve) => {
          pendingResolvers.push(resolve);
        })
      );
      return JSON.parse(payload) as Record<string, unknown>;
    }
  };
};

const closeSocket = async (socket: TestWebSocket): Promise<void> => {
  if (socket.readyState === socket.CLOSED) return;
  const closed = withTimeout(
    "socket close",
    new Promise<void>((resolve) => {
      socket.addEventListener("close", () => resolve(), { once: true });
    })
  );
  socket.close();
  await closed;
};

describe("rewrite gateway world-status stream", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const next = cleanup.pop();
      if (next) await next();
    }
  });

  it("pushes GLOBAL_STATUS_UPDATE live and keeps the cached rewrite snapshot in sync for later sockets", async () => {
    let listener: ((event: SimulationClientEvent) => void) | undefined;
    let worldStatus = {
      leaderboard: {
        overall: [
          { id: "ai-1", name: "AI 1", tiles: 1, incomePerMinute: 0.6, techs: 1, score: 10.8, rank: 1 },
          { id: "player-1", name: "Nauticus", tiles: 4, incomePerMinute: 2.4, techs: 0, score: 11.2, rank: 2 }
        ],
        selfOverall: { id: "player-1", name: "Nauticus", tiles: 4, incomePerMinute: 2.4, techs: 0, score: 11.2, rank: 2 },
        byTiles: [
          { id: "player-1", name: "Nauticus", value: 4, rank: 1 },
          { id: "ai-1", name: "AI 1", value: 1, rank: 2 }
        ],
        selfByTiles: { id: "player-1", name: "Nauticus", value: 4, rank: 1 },
        byIncome: [
          { id: "player-1", name: "Nauticus", value: 2.4, rank: 1 },
          { id: "ai-1", name: "AI 1", value: 0.6, rank: 2 }
        ],
        selfByIncome: { id: "player-1", name: "Nauticus", value: 2.4, rank: 1 },
        byTechs: [
          { id: "ai-1", name: "AI 1", value: 1, rank: 1 },
          { id: "player-1", name: "Nauticus", value: 0, rank: 2 }
        ],
        selfByTechs: { id: "player-1", name: "Nauticus", value: 0, rank: 2 }
      },
      seasonVictory: []
    };
    const simulationClient = {
      preparePlayer: async () => ({ playerId: "player-1", spawned: false }),
      submitCommand: async () => undefined,
      subscribePlayer: async () => ({
        playerId: "player-1",
        player: {
          id: "player-1",
          name: "Nauticus",
          gold: 76,
          manpower: 120,
          manpowerCap: 120,
          incomePerMinute: 2.4,
          strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
          strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
          developmentProcessLimit: 3,
          activeDevelopmentProcessCount: 0,
          pendingSettlements: [],
          techIds: [],
          domainIds: []
        },
        worldStatus,
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" as const }]
      }),
      unsubscribePlayer: async () => undefined,
      getSubscriptionNamespace: async () => "test-namespace",
      streamEvents: (
        nextListener: (event: SimulationClientEvent) => void,
        lifecycle?: { onConnect?: () => void; onDisconnect?: (error?: unknown) => void }
      ) => {
        listener = nextListener;
        lifecycle?.onConnect?.();
        return () => {
          lifecycle?.onDisconnect?.();
          listener = undefined;
        };
      }
    };

    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationClient,
      commandStore: new InMemoryGatewayCommandStore(),
      defaultHumanPlayerId: "player-1"
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const firstSocket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(firstSocket.socket));
    firstSocket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    const firstInit = await firstSocket.nextJsonMessage("first init");
    expect(firstInit.type).toBe("INIT");
    expect((firstInit.leaderboard as { overall: Array<{ id: string; rank: number }> }).overall[0]?.id).toBe("ai-1");

    const nextPayload = {
      eventType: "PLAYER_MESSAGE",
      commandId: "status-1",
      playerId: "player-1",
      messageType: "GLOBAL_STATUS_UPDATE",
      payload: {
        type: "GLOBAL_STATUS_UPDATE",
        leaderboard: {
          overall: [
            { id: "player-1", name: "Nauticus", tiles: 4, incomePerMinute: 2.4, techs: 0, score: 11.2, rank: 1 },
            { id: "ai-1", name: "AI 1", tiles: 1, incomePerMinute: 0.6, techs: 1, score: 10.8, rank: 2 }
          ],
          selfOverall: { id: "player-1", name: "Nauticus", tiles: 4, incomePerMinute: 2.4, techs: 0, score: 11.2, rank: 1 },
          byTiles: [
            { id: "player-1", name: "Nauticus", value: 4, rank: 1 },
            { id: "ai-1", name: "AI 1", value: 1, rank: 2 }
          ],
          selfByTiles: { id: "player-1", name: "Nauticus", value: 4, rank: 1 },
          byIncome: [
            { id: "player-1", name: "Nauticus", value: 2.4, rank: 1 },
            { id: "ai-1", name: "AI 1", value: 0.6, rank: 2 }
          ],
          selfByIncome: { id: "player-1", name: "Nauticus", value: 2.4, rank: 1 },
          byTechs: [
            { id: "ai-1", name: "AI 1", value: 1, rank: 1 },
            { id: "player-1", name: "Nauticus", value: 0, rank: 2 }
          ],
          selfByTechs: { id: "player-1", name: "Nauticus", value: 0, rank: 2 }
        },
        seasonVictory: []
      }
    } satisfies SimulationClientEvent;
    worldStatus = {
      leaderboard: nextPayload.payload.leaderboard,
      seasonVictory: nextPayload.payload.seasonVictory
    };
    listener?.(nextPayload);

    const liveUpdate = await firstSocket.nextJsonMessage("live status update");
    expect(liveUpdate.type).toBe("GLOBAL_STATUS_UPDATE");
    expect(((liveUpdate.leaderboard as { overall: Array<{ id: string; rank: number }> }).overall[0])).toEqual(
      expect.objectContaining({ id: "player-1", rank: 1 })
    );

    const secondSocket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(secondSocket.socket));
    secondSocket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    const secondInit = await secondSocket.nextJsonMessage("second init");
    expect(secondInit.type).toBe("INIT");
    expect((secondInit.leaderboard as { overall: Array<{ id: string; rank: number }> }).overall[0]?.id).toBe("player-1");
  });

  it("keeps recovered human names when a later GLOBAL_STATUS_UPDATE arrives anonymized", async () => {
    let listener: ((event: SimulationClientEvent) => void) | undefined;
    const benjaminId = "qwe9OiQwxGS5LKwcAwG5wzNCd3P3";
    const benjaminFallback = anonymizedEmpireNameForId(benjaminId);
    const profileStore = new InMemoryGatewayPlayerProfileStore();
    await profileStore.setProfile(benjaminId, "Benjamin Waye", "#654321");
    let worldStatus = {
      leaderboard: {
        overall: [{ id: "player-1", name: "Nauticus", tiles: 4, incomePerMinute: 2.4, techs: 0, score: 11.2, rank: 1 }],
        selfOverall: { id: "player-1", name: "Nauticus", tiles: 4, incomePerMinute: 2.4, techs: 0, score: 11.2, rank: 1 },
        byTiles: [{ id: "player-1", name: "Nauticus", value: 4, rank: 1 }],
        selfByTiles: { id: "player-1", name: "Nauticus", value: 4, rank: 1 },
        byIncome: [{ id: "player-1", name: "Nauticus", value: 2.4, rank: 1 }],
        selfByIncome: { id: "player-1", name: "Nauticus", value: 2.4, rank: 1 },
        byTechs: [{ id: "player-1", name: "Nauticus", value: 0, rank: 1 }],
        selfByTechs: { id: "player-1", name: "Nauticus", value: 0, rank: 1 }
      },
      seasonVictory: []
    };
    const simulationClient = {
      preparePlayer: async () => ({ playerId: "player-1", spawned: false }),
      submitCommand: async () => undefined,
      subscribePlayer: async () => ({
        playerId: "player-1",
        player: {
          id: "player-1",
          name: "Nauticus",
          gold: 76,
          manpower: 120,
          manpowerCap: 120,
          incomePerMinute: 2.4,
          strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
          strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
          developmentProcessLimit: 3,
          activeDevelopmentProcessCount: 0,
          pendingSettlements: [],
          techIds: [],
          domainIds: []
        },
        worldStatus,
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" as const }]
      }),
      unsubscribePlayer: async () => undefined,
      getSubscriptionNamespace: async () => "test-namespace",
      streamEvents: (
        nextListener: (event: SimulationClientEvent) => void,
        lifecycle?: { onConnect?: () => void; onDisconnect?: (error?: unknown) => void }
      ) => {
        listener = nextListener;
        lifecycle?.onConnect?.();
        return () => {
          lifecycle?.onDisconnect?.();
          listener = undefined;
        };
      }
    };

    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationClient,
      commandStore: new InMemoryGatewayCommandStore(),
      profileStore,
      defaultHumanPlayerId: "player-1"
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const firstSocket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(firstSocket.socket));
    firstSocket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    const firstInit = await firstSocket.nextJsonMessage("first recovered init");
    expect(firstInit.type).toBe("INIT");
    expect((firstInit.leaderboard as { overall: Array<{ id: string; name: string }> }).overall).toEqual(
      [expect.objectContaining({ id: "player-1", name: "Nauticus" })]
    );

    const nextPayload = {
      eventType: "PLAYER_MESSAGE",
      commandId: "status-2",
      playerId: "player-1",
      messageType: "GLOBAL_STATUS_UPDATE",
      payload: {
        type: "GLOBAL_STATUS_UPDATE",
        leaderboard: {
          overall: [
            { id: "player-1", name: "Nauticus", tiles: 4, incomePerMinute: 2.4, techs: 0, score: 11.2, rank: 1 },
            { id: benjaminId, name: benjaminFallback, tiles: 6, incomePerMinute: 3.5, techs: 0, score: 16.5, rank: 2 }
          ],
          selfOverall: { id: "player-1", name: "Nauticus", tiles: 4, incomePerMinute: 2.4, techs: 0, score: 11.2, rank: 1 },
          byTiles: [
            { id: benjaminId, name: benjaminFallback, value: 6, rank: 1 },
            { id: "player-1", name: "Nauticus", value: 4, rank: 2 }
          ],
          selfByTiles: { id: "player-1", name: "Nauticus", value: 4, rank: 2 },
          byIncome: [
            { id: benjaminId, name: benjaminFallback, value: 3.5, rank: 1 },
            { id: "player-1", name: "Nauticus", value: 2.4, rank: 2 }
          ],
          selfByIncome: { id: "player-1", name: "Nauticus", value: 2.4, rank: 2 },
          byTechs: [
            { id: "player-1", name: "Nauticus", value: 0, rank: 1 },
            { id: benjaminId, name: benjaminFallback, value: 0, rank: 2 }
          ],
          selfByTechs: { id: "player-1", name: "Nauticus", value: 0, rank: 1 }
        },
        seasonVictory: [
          {
            id: "TOWN_CONTROL",
            name: "Town Control",
            description: "Own a dominant share of towns.",
            leaderPlayerId: benjaminId,
            leaderName: benjaminFallback,
            progressLabel: "4/5 towns",
            thresholdLabel: "Need 5 towns",
            holdDurationSeconds: 21600,
            statusLabel: "Pressure building",
            conditionMet: false
          }
        ]
      }
    } satisfies SimulationClientEvent;
    worldStatus = {
      leaderboard: nextPayload.payload.leaderboard,
      seasonVictory: nextPayload.payload.seasonVictory
    };
    listener?.(nextPayload);

    const liveUpdate = await firstSocket.nextJsonMessage("recovered live status update");
    expect(liveUpdate.type).toBe("GLOBAL_STATUS_UPDATE");
    expect((liveUpdate.leaderboard as { overall: Array<{ id: string; name: string }> }).overall).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: benjaminId, name: "Benjamin Waye" })])
    );
    expect((liveUpdate.seasonVictory as Array<{ leaderPlayerId?: string; leaderName: string }>)).toEqual(
      expect.arrayContaining([expect.objectContaining({ leaderPlayerId: benjaminId, leaderName: "Benjamin Waye" })])
    );

    const secondSocket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(secondSocket.socket));
    secondSocket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    const secondInit = await secondSocket.nextJsonMessage("second recovered init");
    expect(secondInit.type).toBe("INIT");
    expect((secondInit.leaderboard as { overall: Array<{ id: string; name: string }> }).overall).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: benjaminId, name: "Benjamin Waye" })])
    );
    expect((secondInit.seasonVictory as Array<{ leaderPlayerId?: string; leaderName: string }>)).toEqual(
      expect.arrayContaining([expect.objectContaining({ leaderPlayerId: benjaminId, leaderName: "Benjamin Waye" })])
    );
  });

  it("still delivers GLOBAL_STATUS_UPDATE when live profile hydration fails", async () => {
    let listener: ((event: SimulationClientEvent) => void) | undefined;
    const benjaminId = "qwe9OiQwxGS5LKwcAwG5wzNCd3P3";
    const benjaminFallback = anonymizedEmpireNameForId(benjaminId);
    let getManyCalls = 0;
    const profileStore = {
      async get() {
        return undefined;
      },
      async getMany(playerIds: Iterable<string>) {
        getManyCalls += 1;
        const ids = [...playerIds];
        if (ids.includes(benjaminId)) throw new Error("profile store offline");
        return [];
      },
      async listAllNamed() {
        return [];
      },
      async setTileColor() {},
      async setProfile() {
        throw new Error("not used in test");
      }
    };
    let worldStatus = {
      leaderboard: {
        overall: [{ id: "player-1", name: "Nauticus", tiles: 4, incomePerMinute: 2.4, techs: 0, score: 11.2, rank: 1 }],
        selfOverall: { id: "player-1", name: "Nauticus", tiles: 4, incomePerMinute: 2.4, techs: 0, score: 11.2, rank: 1 },
        byTiles: [{ id: "player-1", name: "Nauticus", value: 4, rank: 1 }],
        selfByTiles: { id: "player-1", name: "Nauticus", value: 4, rank: 1 },
        byIncome: [{ id: "player-1", name: "Nauticus", value: 2.4, rank: 1 }],
        selfByIncome: { id: "player-1", name: "Nauticus", value: 2.4, rank: 1 },
        byTechs: [{ id: "player-1", name: "Nauticus", value: 0, rank: 1 }],
        selfByTechs: { id: "player-1", name: "Nauticus", value: 0, rank: 1 }
      },
      seasonVictory: []
    };
    const simulationClient = {
      preparePlayer: async () => ({ playerId: "player-1", spawned: false }),
      submitCommand: async () => undefined,
      subscribePlayer: async () => ({
        playerId: "player-1",
        player: {
          id: "player-1",
          name: "Nauticus",
          gold: 76,
          manpower: 120,
          manpowerCap: 120,
          incomePerMinute: 2.4,
          strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
          strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
          developmentProcessLimit: 3,
          activeDevelopmentProcessCount: 0,
          pendingSettlements: [],
          techIds: [],
          domainIds: []
        },
        worldStatus,
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" as const }]
      }),
      unsubscribePlayer: async () => undefined,
      getSubscriptionNamespace: async () => "test-namespace",
      streamEvents: (
        nextListener: (event: SimulationClientEvent) => void,
        lifecycle?: { onConnect?: () => void; onDisconnect?: (error?: unknown) => void }
      ) => {
        listener = nextListener;
        lifecycle?.onConnect?.();
        return () => {
          lifecycle?.onDisconnect?.();
          listener = undefined;
        };
      }
    };

    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationClient,
      commandStore: new InMemoryGatewayCommandStore(),
      profileStore,
      defaultHumanPlayerId: "player-1"
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const socket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(socket.socket));
    socket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    const init = await socket.nextJsonMessage("failure-path init");
    expect(init.type).toBe("INIT");

    const payload = {
      eventType: "PLAYER_MESSAGE",
      commandId: "status-3",
      playerId: "player-1",
      messageType: "GLOBAL_STATUS_UPDATE",
      payload: {
        type: "GLOBAL_STATUS_UPDATE",
        leaderboard: {
          overall: [
            { id: "player-1", name: "Nauticus", tiles: 4, incomePerMinute: 2.4, techs: 0, score: 11.2, rank: 1 },
            { id: benjaminId, name: benjaminFallback, tiles: 6, incomePerMinute: 3.5, techs: 0, score: 16.5, rank: 2 }
          ],
          selfOverall: { id: "player-1", name: "Nauticus", tiles: 4, incomePerMinute: 2.4, techs: 0, score: 11.2, rank: 1 },
          byTiles: [
            { id: benjaminId, name: benjaminFallback, value: 6, rank: 1 },
            { id: "player-1", name: "Nauticus", value: 4, rank: 2 }
          ],
          selfByTiles: { id: "player-1", name: "Nauticus", value: 4, rank: 2 },
          byIncome: [
            { id: benjaminId, name: benjaminFallback, value: 3.5, rank: 1 },
            { id: "player-1", name: "Nauticus", value: 2.4, rank: 2 }
          ],
          selfByIncome: { id: "player-1", name: "Nauticus", value: 2.4, rank: 2 },
          byTechs: [
            { id: "player-1", name: "Nauticus", value: 0, rank: 1 },
            { id: benjaminId, name: benjaminFallback, value: 0, rank: 2 }
          ],
          selfByTechs: { id: "player-1", name: "Nauticus", value: 0, rank: 1 }
        },
        seasonVictory: [
          {
            id: "TOWN_CONTROL",
            name: "Town Control",
            description: "Own a dominant share of towns.",
            leaderPlayerId: benjaminId,
            leaderName: benjaminFallback,
            progressLabel: "4/5 towns",
            thresholdLabel: "Need 5 towns",
            holdDurationSeconds: 21600,
            statusLabel: "Pressure building",
            conditionMet: false
          }
        ]
      }
    } satisfies SimulationClientEvent;
    worldStatus = {
      leaderboard: payload.payload.leaderboard,
      seasonVictory: payload.payload.seasonVictory
    };
    listener?.(payload);

    const liveUpdate = await socket.nextJsonMessage("failure-path live update");
    expect(liveUpdate.type).toBe("GLOBAL_STATUS_UPDATE");
    expect(getManyCalls).toBeGreaterThan(0);
    expect((liveUpdate.leaderboard as { overall: Array<{ id: string; name: string }> }).overall).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: benjaminId, name: benjaminFallback })])
    );
    expect((liveUpdate.seasonVictory as Array<{ leaderPlayerId?: string; leaderName: string }>)).toEqual(
      expect.arrayContaining([expect.objectContaining({ leaderPlayerId: benjaminId, leaderName: benjaminFallback })])
    );
  });

  it("times out slow live profile hydration so later realtime events still fan out", async () => {
    let listener: ((event: SimulationClientEvent) => void) | undefined;
    const benjaminId = "qwe9OiQwxGS5LKwcAwG5wzNCd3P3";
    const benjaminFallback = anonymizedEmpireNameForId(benjaminId);
    const profileStore = {
      async get() {
        return undefined;
      },
      async getMany(playerIds: Iterable<string>) {
        const ids = [...playerIds];
        if (!ids.includes(benjaminId)) return [];
        return await new Promise<never[]>(() => undefined);
      },
      async listAllNamed() {
        return [];
      },
      async setTileColor() {},
      async setProfile() {
        throw new Error("not used in test");
      }
    };
    let worldStatus = {
      leaderboard: {
        overall: [{ id: "player-1", name: "Nauticus", tiles: 4, incomePerMinute: 2.4, techs: 0, score: 11.2, rank: 1 }],
        selfOverall: { id: "player-1", name: "Nauticus", tiles: 4, incomePerMinute: 2.4, techs: 0, score: 11.2, rank: 1 },
        byTiles: [{ id: "player-1", name: "Nauticus", value: 4, rank: 1 }],
        selfByTiles: { id: "player-1", name: "Nauticus", value: 4, rank: 1 },
        byIncome: [{ id: "player-1", name: "Nauticus", value: 2.4, rank: 1 }],
        selfByIncome: { id: "player-1", name: "Nauticus", value: 2.4, rank: 1 },
        byTechs: [{ id: "player-1", name: "Nauticus", value: 0, rank: 1 }],
        selfByTechs: { id: "player-1", name: "Nauticus", value: 0, rank: 1 }
      },
      seasonVictory: []
    };
    const simulationClient = {
      preparePlayer: async () => ({ playerId: "player-1", spawned: false }),
      submitCommand: async () => undefined,
      subscribePlayer: async () => ({
        playerId: "player-1",
        player: {
          id: "player-1",
          name: "Nauticus",
          gold: 76,
          manpower: 120,
          manpowerCap: 120,
          incomePerMinute: 2.4,
          strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
          strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
          developmentProcessLimit: 3,
          activeDevelopmentProcessCount: 0,
          pendingSettlements: [],
          techIds: [],
          domainIds: []
        },
        worldStatus,
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" as const }]
      }),
      unsubscribePlayer: async () => undefined,
      getSubscriptionNamespace: async () => "test-namespace",
      streamEvents: (
        nextListener: (event: SimulationClientEvent) => void,
        lifecycle?: { onConnect?: () => void; onDisconnect?: (error?: unknown) => void }
      ) => {
        listener = nextListener;
        lifecycle?.onConnect?.();
        return () => {
          lifecycle?.onDisconnect?.();
          listener = undefined;
        };
      }
    };

    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationClient,
      commandStore: new InMemoryGatewayCommandStore(),
      profileStore,
      defaultHumanPlayerId: "player-1"
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const socket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(socket.socket));
    socket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    const init = await socket.nextJsonMessage("timeout-path init");
    expect(init.type).toBe("INIT");

    const statusPayload = {
      eventType: "PLAYER_MESSAGE",
      commandId: "status-4",
      playerId: "player-1",
      messageType: "GLOBAL_STATUS_UPDATE",
      payload: {
        type: "GLOBAL_STATUS_UPDATE",
        leaderboard: {
          overall: [
            { id: "player-1", name: "Nauticus", tiles: 4, incomePerMinute: 2.4, techs: 0, score: 11.2, rank: 1 },
            { id: benjaminId, name: benjaminFallback, tiles: 6, incomePerMinute: 3.5, techs: 0, score: 16.5, rank: 2 }
          ],
          selfOverall: { id: "player-1", name: "Nauticus", tiles: 4, incomePerMinute: 2.4, techs: 0, score: 11.2, rank: 1 },
          byTiles: [
            { id: benjaminId, name: benjaminFallback, value: 6, rank: 1 },
            { id: "player-1", name: "Nauticus", value: 4, rank: 2 }
          ],
          selfByTiles: { id: "player-1", name: "Nauticus", value: 4, rank: 2 },
          byIncome: [
            { id: benjaminId, name: benjaminFallback, value: 3.5, rank: 1 },
            { id: "player-1", name: "Nauticus", value: 2.4, rank: 2 }
          ],
          selfByIncome: { id: "player-1", name: "Nauticus", value: 2.4, rank: 2 },
          byTechs: [
            { id: "player-1", name: "Nauticus", value: 0, rank: 1 },
            { id: benjaminId, name: benjaminFallback, value: 0, rank: 2 }
          ],
          selfByTechs: { id: "player-1", name: "Nauticus", value: 0, rank: 1 }
        },
        seasonVictory: []
      }
    } satisfies SimulationClientEvent;
    worldStatus = {
      leaderboard: statusPayload.payload.leaderboard,
      seasonVictory: statusPayload.payload.seasonVictory
    };
    listener?.(statusPayload);
    listener?.({
      eventType: "COMMAND_ACCEPTED",
      commandId: "accept-1",
      playerId: "player-1",
      actionType: "EXPAND",
      originX: 10,
      originY: 10,
      targetX: 10,
      targetY: 11,
      resolvesAt: Date.now() + 1_000
    });

    const startedAt = Date.now();
    const liveUpdate = await socket.nextJsonMessage("timeout-path live update");
    const accepted = await socket.nextJsonMessage("timeout-path accepted");
    const elapsedMs = Date.now() - startedAt;

    expect(liveUpdate.type).toBe("GLOBAL_STATUS_UPDATE");
    expect(accepted).toEqual(expect.objectContaining({ type: "ACTION_ACCEPTED", commandId: "accept-1" }));
    expect(elapsedMs).toBeLessThan(800);
  });
});
