import { afterEach, describe, expect, it } from "vitest";

import { createRealtimeGatewayApp } from "./gateway-app.js";
import { InMemoryGatewayCommandStore } from "./command-store.js";
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
          strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
          strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
          developmentProcessLimit: 3,
          activeDevelopmentProcessCount: 0,
          pendingSettlements: [],
          techIds: [],
          domainIds: []
        },
        worldStatus: {
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
        },
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" as const }]
      }),
      unsubscribePlayer: async () => undefined,
      streamEvents: (nextListener: (event: SimulationClientEvent) => void) => {
        listener = nextListener;
        return () => {
          listener = undefined;
        };
      }
    };

    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationClient,
      commandStore: new InMemoryGatewayCommandStore()
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const firstSocket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(firstSocket.socket));
    firstSocket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    const firstInit = await firstSocket.nextJsonMessage("first init");
    expect(firstInit.type).toBe("INIT");
    expect((firstInit.leaderboard as { overall: Array<{ id: string; rank: number }> }).overall[0]?.id).toBe("ai-1");

    listener?.({
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
    });

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
});
