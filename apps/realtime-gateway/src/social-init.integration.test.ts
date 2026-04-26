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

const openSocket = async (url: string) => {
  if (!WebSocketCtor) throw new Error("global WebSocket is unavailable in this runtime");
  const socket = new WebSocketCtor(url);
  const queuedMessages: string[] = [];
  const pendingResolvers: Array<(payload: string) => void> = [];
  socket.addEventListener("message", (event) => {
    const nextResolver = pendingResolvers.shift();
    if (nextResolver) nextResolver(event.data);
    else queuedMessages.push(event.data);
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

const nextTypedMessage = async (
  socket: Awaited<ReturnType<typeof openSocket>>,
  label: string,
  type: string
): Promise<Record<string, unknown>> => {
  for (;;) {
    const message = await socket.nextJsonMessage(label);
    if (message.type === type) return message;
  }
};

const nextMatchingMessage = async (
  socket: Awaited<ReturnType<typeof openSocket>>,
  label: string,
  predicate: (message: Record<string, unknown>) => boolean
): Promise<Record<string, unknown>> => {
  for (;;) {
    const message = await socket.nextJsonMessage(label);
    if (predicate(message)) return message;
  }
};

const authenticateUntilInit = async (
  socket: Awaited<ReturnType<typeof openSocket>>,
  token: string
): Promise<Record<string, unknown>> => {
  socket.socket.send(JSON.stringify({ type: "AUTH", token }));
  for (;;) {
    const message = await socket.nextJsonMessage(`auth ${token}`);
    if (message.type === "LOGIN_PHASE") continue;
    if (message.type === "INIT") return message;
    throw new Error(`unexpected auth response for ${token}: ${JSON.stringify(message)}`);
  }
};

describe("rewrite social integration", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const next = cleanup.pop();
      if (next) await next();
    }
  });

  it("bootstraps and updates alliance/truce state over the rewrite gateway", async () => {
    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      commandStore: new InMemoryGatewayCommandStore(),
      simulationClient: {
        submitCommand: async () => undefined,
        preparePlayer: async (playerId) => ({ playerId, spawned: false }),
        subscribePlayer: async (playerId) => ({
          playerId,
          tiles: [],
          player: {
            id: playerId,
            name: playerId,
            gold: 0,
            points: 0,
            level: 0,
            tileColor: "#38b000",
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            modBreakdown: {
              attack: [{ label: "Base", mult: 1 }],
              defense: [{ label: "Base", mult: 1 }],
              income: [{ label: "Base", mult: 1 }],
              vision: [{ label: "Base", mult: 1 }]
            },
            incomePerMinute: 0,
            upkeepPerMinute: { food: 0, iron: 0, supply: 0, crystal: 0, oil: 0, gold: 0 },
            upkeepLastTick: {
              food: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
              iron: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
              supply: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
              crystal: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
              oil: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
              gold: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
              foodCoverage: 1
            },
            strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
            strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
            stamina: 0,
            manpower: 0,
            manpowerCap: 0,
            manpowerRegenPerMinute: 0,
            manpowerBreakdown: { cap: [], regen: [] },
            T: 0,
            E: 0,
            Ts: 0,
            Es: 0,
            allies: [],
            profileNeedsSetup: false,
            availableTechPicks: 0,
            developmentProcessLimit: 0,
            activeDevelopmentProcessCount: 0,
            revealCapacity: 1,
            activeRevealTargets: [],
            abilityCooldowns: {},
            activeTruces: []
          },
          worldStatus: {
            seasonId: "social-test",
            worldSeed: 1,
            runtimeFingerprint: "social-test",
            mapWidth: 1,
            mapHeight: 1,
            playerCount: 2,
            authoritativeTileCount: 0
          }
        }),
        unsubscribePlayer: async () => undefined,
        ping: async () => undefined,
        streamEvents: () => () => undefined
      }
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const first = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(first.socket));
    const second = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(second.socket));

    const firstInit = await authenticateUntilInit(first, "player-1");
    expect(firstInit).toEqual(expect.objectContaining({ type: "INIT" }));
    expect((firstInit.player as { allies?: string[] }).allies).toEqual([]);

    const secondInit = await authenticateUntilInit(second, "player-2");
    expect(secondInit).toEqual(expect.objectContaining({ type: "INIT" }));

    first.socket.send(JSON.stringify({ type: "ALLIANCE_REQUEST", targetPlayerName: "player-2" }));
    expect(await nextTypedMessage(first, "alliance update first", "ALLIANCE_UPDATE")).toEqual(
      expect.objectContaining({ type: "ALLIANCE_UPDATE", outgoingAllianceRequests: expect.any(Array) })
    );
    const incomingRequest = await nextTypedMessage(second, "alliance incoming", "ALLIANCE_REQUEST_INCOMING");
    expect(incomingRequest).toEqual(expect.objectContaining({ type: "ALLIANCE_REQUEST_INCOMING" }));
    const requestId = incomingRequest.request && typeof incomingRequest.request === "object" ? (incomingRequest.request as { id?: string }).id : undefined;
    expect(requestId).toBeTruthy();
    second.socket.send(JSON.stringify({ type: "ALLIANCE_ACCEPT", requestId }));
    expect(await nextTypedMessage(first, "alliance accepted first", "ALLIANCE_UPDATE")).toEqual(
      expect.objectContaining({ type: "ALLIANCE_UPDATE", allies: ["player-2"] })
    );
    expect(await nextTypedMessage(second, "alliance accepted second", "ALLIANCE_UPDATE")).toEqual(
      expect.objectContaining({ type: "ALLIANCE_UPDATE", allies: ["player-1"] })
    );

    first.socket.send(JSON.stringify({ type: "TRUCE_REQUEST", targetPlayerName: "player-2", durationHours: 12 }));
    expect(await nextTypedMessage(first, "truce update first", "TRUCE_UPDATE")).toEqual(
      expect.objectContaining({ type: "TRUCE_UPDATE", outgoingTruceRequests: expect.any(Array) })
    );
    const incomingTruce = await nextTypedMessage(second, "truce incoming", "TRUCE_REQUEST_INCOMING");
    expect(incomingTruce).toEqual(expect.objectContaining({ type: "TRUCE_REQUEST_INCOMING" }));
    const truceRequestId =
      incomingTruce.request && typeof incomingTruce.request === "object" ? (incomingTruce.request as { id?: string }).id : undefined;
    expect(truceRequestId).toBeTruthy();
    second.socket.send(JSON.stringify({ type: "TRUCE_ACCEPT", requestId: truceRequestId }));
    expect(
      await nextMatchingMessage(
        first,
        "truce accepted first",
        (message) => message.type === "TRUCE_UPDATE" && Array.isArray(message.activeTruces) && message.activeTruces.length > 0
      )
    ).toEqual(
      expect.objectContaining({ type: "TRUCE_UPDATE", activeTruces: [expect.objectContaining({ otherPlayerId: "player-2" })] })
    );
    expect(
      await nextMatchingMessage(
        second,
        "truce accepted second",
        (message) => message.type === "TRUCE_UPDATE" && Array.isArray(message.activeTruces) && message.activeTruces.length > 0
      )
    ).toEqual(
      expect.objectContaining({ type: "TRUCE_UPDATE", activeTruces: [expect.objectContaining({ otherPlayerId: "player-1" })] })
    );
  });
});
