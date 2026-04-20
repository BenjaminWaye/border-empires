import { afterEach, describe, expect, it } from "vitest";

import { createRealtimeGatewayApp } from "./gateway-app.js";
import { InMemoryGatewayCommandStore } from "./command-store.js";
import { createSimulationService } from "../../simulation/src/simulation-service.js";

const silentLog = {
  info: () => undefined,
  error: () => undefined
};

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

describe("rewrite social integration", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const next = cleanup.pop();
      if (next) await next();
    }
  });

  it("bootstraps and updates alliance/truce state over the rewrite gateway", async () => {
    const simulation = await createSimulationService({ host: "127.0.0.1", port: 0, log: silentLog });
    cleanup.push(() => simulation.close());
    const simulationAddress = await simulation.start();

    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationAddress: simulationAddress.address,
      commandStore: new InMemoryGatewayCommandStore()
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const first = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(first.socket));
    const second = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(second.socket));

    first.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    const firstInit = await first.nextJsonMessage("first init");
    expect(firstInit).toEqual(expect.objectContaining({ type: "INIT" }));
    expect((firstInit.player as { allies?: string[] }).allies).toEqual([]);

    second.socket.send(JSON.stringify({ type: "AUTH", token: "player-2" }));
    const secondInit = await second.nextJsonMessage("second init");
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
