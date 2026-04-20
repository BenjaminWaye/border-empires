import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "./command-store.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { InMemorySimulationCommandStore } from "../../simulation/src/command-store.js";
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

const nextNonBootstrapMessage = async (
  socket: BufferedSocket,
  label: string
): Promise<Record<string, unknown>> => {
  for (;;) {
    const message = await socket.nextJsonMessage(label);
    if (message.type === "TILE_DELTA_BATCH" && typeof message.commandId === "string" && message.commandId.startsWith("bootstrap:")) {
      continue;
    }
    return message;
  }
};

const nextCommandMessage = async (
  socket: BufferedSocket,
  label: string,
  commandId: string,
  type?: string
): Promise<Record<string, unknown>> => {
  for (;;) {
    const message = await nextNonBootstrapMessage(socket, label);
    if (message.commandId !== commandId) {
      continue;
    }
    if (typeof type === "string" && message.type !== type) {
      continue;
    }
    return message;
  }
};

const nextTypedMessage = async (
  socket: BufferedSocket,
  label: string,
  type: string
): Promise<Record<string, unknown>> => {
  for (;;) {
    const message = await nextNonBootstrapMessage(socket, label);
    if (message.type === type) return message;
  }
};

const nextMatchingMessage = async (
  socket: BufferedSocket,
  label: string,
  predicate: (message: Record<string, unknown>) => boolean
): Promise<Record<string, unknown>> => {
  for (;;) {
    const message = await nextNonBootstrapMessage(socket, label);
    if (predicate(message)) return message;
  }
};

const waitUntil = async (predicate: () => boolean | Promise<boolean>, timeoutMs = 1_000): Promise<void> => {
  const startedAt = Date.now();
  while (!(await predicate())) {
    if (Date.now() - startedAt > timeoutMs) throw new Error("timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe("rewrite stack integration", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const next = cleanup.pop();
      if (next) await next();
    }
  });

  it("rehydrates a pending accepted frontier command after reconnect and then delivers the final result", async () => {
    const scheduledResolutions: Array<{ delayMs: number; task: () => void }> = [];
    const simulation = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      log: silentLog,
      runtimeOptions: {
        now: () => 1_000,
        scheduleAfter: (delayMs, task) => {
          scheduledResolutions.push({ delayMs, task });
        }
      }
    });
    cleanup.push(() => simulation.close());
    const simulationAddress = await simulation.start();

    const gatewayCommandStore = new InMemoryGatewayCommandStore();
    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationAddress: simulationAddress.address,
      commandStore: gatewayCommandStore,
      now: () => 1_000
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const firstSocket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(firstSocket.socket));
    firstSocket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    expect((await nextNonBootstrapMessage(firstSocket, "first init")).type).toBe("INIT");
    firstSocket.socket.send(JSON.stringify({ type: "SUBSCRIBE_CHUNKS", cx: 0, cy: 0, radius: 2 }));

    firstSocket.socket.send(
      JSON.stringify({
        type: "ATTACK",
        fromX: 10,
        fromY: 10,
        toX: 10,
        toY: 11,
        commandId: "cmd-1",
        clientSeq: 1
      })
    );

    expect(await nextNonBootstrapMessage(firstSocket, "queued")).toEqual({
      type: "COMMAND_QUEUED",
      commandId: "cmd-1",
      clientSeq: 1
    });
    expect(await nextNonBootstrapMessage(firstSocket, "accepted")).toEqual(
      expect.objectContaining({
        type: "ACTION_ACCEPTED",
        commandId: "cmd-1",
        actionType: "ATTACK"
      })
    );
    expect(await nextNonBootstrapMessage(firstSocket, "combat start")).toEqual(
      expect.objectContaining({
        type: "COMBAT_START",
        commandId: "cmd-1"
      })
    );

    expect(scheduledResolutions).toHaveLength(1);
    expect(scheduledResolutions[0]?.delayMs).toBe(3_000);

    await waitUntil(async () => (await gatewayCommandStore.get("cmd-1"))?.status === "ACCEPTED");

    await closeSocket(firstSocket.socket);

    const secondSocket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(secondSocket.socket));
    secondSocket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    const reconnectInit = await nextNonBootstrapMessage(secondSocket, "reconnect init");
    expect(reconnectInit).toEqual(
      expect.objectContaining({
        type: "INIT",
        initialState: expect.objectContaining({
          tiles: expect.arrayContaining([
            expect.objectContaining({ x: 10, y: 10, ownerId: "player-1" })
          ])
        }),
        recovery: {
          nextClientSeq: 2,
          pendingCommands: [
            {
              commandId: "cmd-1",
              clientSeq: 1,
              type: "ATTACK",
              status: "ACCEPTED",
              queuedAt: expect.any(Number),
              acceptedAt: expect.any(Number),
              payload: {
                fromX: 10,
                fromY: 10,
                toX: 10,
                toY: 11
              }
            }
          ]
        }
      })
    );

    scheduledResolutions[0]?.task();

    const resolutionMessages = [
      await nextNonBootstrapMessage(secondSocket, "resolution first"),
      await nextNonBootstrapMessage(secondSocket, "resolution second")
    ];
    const messageTypes = resolutionMessages.map((message) => message.type).sort();
    expect(messageTypes).toEqual(["COMBAT_RESULT", "TILE_DELTA_BATCH"]);
    expect(resolutionMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "COMBAT_RESULT",
          commandId: "cmd-1",
          attackerWon: true
        }),
        expect.objectContaining({
          type: "TILE_DELTA_BATCH",
          commandId: "cmd-1",
          tiles: expect.arrayContaining([
            expect.objectContaining({
              x: 10,
              y: 11,
              ownerId: "player-1",
              ownershipState: "FRONTIER"
            })
          ])
        })
      ])
    );
  });

  it("sends INIT only on the control channel and ignores attack preview probes", async () => {
    const simulation = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      log: silentLog
    });
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

    const controlSocket = await openSocket(`${gatewayAddress.wsUrl}?channel=control`);
    const bulkSocket = await openSocket(`${gatewayAddress.wsUrl}?channel=bulk`);
    cleanup.push(() => closeSocket(controlSocket.socket));
    cleanup.push(() => closeSocket(bulkSocket.socket));

    controlSocket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    bulkSocket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));

    const controlInit = await nextNonBootstrapMessage(controlSocket, "control init");
    expect(controlInit).toEqual(expect.objectContaining({ type: "INIT" }));

    await expect(
      withTimeout(
        "bulk should not receive init",
        new Promise<Record<string, unknown>>((resolve) => {
          bulkSocket.socket.addEventListener("message", (event) => resolve(JSON.parse(event.data) as Record<string, unknown>), { once: true });
        }),
        150
      )
    ).rejects.toThrow(/timed out/);

    controlSocket.socket.send(JSON.stringify({ type: "ATTACK_PREVIEW", fromX: 10, fromY: 10, toX: 10, toY: 11 }));
    await expect(nextNonBootstrapMessage(controlSocket, "preview result")).resolves.toEqual(
      expect.objectContaining({
        type: "ATTACK_PREVIEW_RESULT",
        valid: true,
        from: expect.objectContaining({ x: 10, y: 10 }),
        to: expect.objectContaining({ x: 10, y: 11 })
      })
    );
  });

  it("handles alliance and truce flows through the rewrite gateway", async () => {
    const simulation = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      log: silentLog
    });
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

    const playerOne = await openSocket(gatewayAddress.wsUrl);
    const playerTwo = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(playerOne.socket));
    cleanup.push(() => closeSocket(playerTwo.socket));

    playerOne.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    playerTwo.socket.send(JSON.stringify({ type: "AUTH", token: "player-2" }));

    expect(await nextNonBootstrapMessage(playerOne, "player one init")).toEqual(expect.objectContaining({ type: "INIT" }));
    expect(await nextNonBootstrapMessage(playerTwo, "player two init")).toEqual(expect.objectContaining({ type: "INIT" }));

    playerOne.socket.send(JSON.stringify({ type: "ALLIANCE_REQUEST", targetPlayerName: "player-2" }));

    expect(await nextNonBootstrapMessage(playerOne, "alliance update one")).toEqual(
      expect.objectContaining({
        type: "ALLIANCE_UPDATE",
        allies: [],
        outgoingAllianceRequests: [expect.objectContaining({ toPlayerId: "player-2" })]
      })
    );
    expect(await nextNonBootstrapMessage(playerTwo, "alliance update two")).toEqual(
      expect.objectContaining({
        type: "ALLIANCE_UPDATE",
        allies: [],
        incomingAllianceRequests: [expect.objectContaining({ fromPlayerId: "player-1" })]
      })
    );
    const allianceOutgoing = await nextTypedMessage(playerOne, "alliance requested", "ALLIANCE_REQUESTED");
    const allianceIncoming = await nextTypedMessage(playerTwo, "alliance incoming", "ALLIANCE_REQUEST_INCOMING");
    expect(allianceOutgoing).toEqual(expect.objectContaining({ type: "ALLIANCE_REQUESTED" }));
    expect(allianceIncoming).toEqual(expect.objectContaining({ type: "ALLIANCE_REQUEST_INCOMING" }));

    const requestId =
      typeof allianceIncoming.request === "object" && allianceIncoming.request && "id" in allianceIncoming.request
        ? String((allianceIncoming.request as { id: string }).id)
        : "";
    expect(requestId).not.toBe("");

    playerTwo.socket.send(JSON.stringify({ type: "ALLIANCE_ACCEPT", requestId }));

    const allianceUpdateOne = await nextNonBootstrapMessage(playerOne, "alliance update one");
    const allianceUpdateTwo = await nextNonBootstrapMessage(playerTwo, "alliance update two");
    expect(allianceUpdateOne).toEqual(
      expect.objectContaining({
        type: "ALLIANCE_UPDATE",
        allies: ["player-2"]
      })
    );
    expect(allianceUpdateTwo).toEqual(
      expect.objectContaining({
        type: "ALLIANCE_UPDATE",
        allies: ["player-1"]
      })
    );

    playerOne.socket.send(JSON.stringify({ type: "TRUCE_REQUEST", targetPlayerName: "player-2", durationHours: 12 }));

    expect(
      await nextMatchingMessage(
        playerOne,
        "truce update one",
        (message) =>
          message.type === "TRUCE_UPDATE" &&
          Array.isArray(message.outgoingTruceRequests) &&
          message.outgoingTruceRequests.length > 0
      )
    ).toEqual(
      expect.objectContaining({
        type: "TRUCE_UPDATE",
        outgoingTruceRequests: [expect.objectContaining({ toPlayerId: "player-2", durationHours: 12 })]
      })
    );
    expect(
      await nextMatchingMessage(
        playerTwo,
        "truce update two",
        (message) =>
          message.type === "TRUCE_UPDATE" &&
          Array.isArray(message.incomingTruceRequests) &&
          message.incomingTruceRequests.length > 0
      )
    ).toEqual(
      expect.objectContaining({
        type: "TRUCE_UPDATE",
        incomingTruceRequests: [expect.objectContaining({ fromPlayerId: "player-1", durationHours: 12 })]
      })
    );
    const truceOutgoing = await nextTypedMessage(playerOne, "truce requested", "TRUCE_REQUESTED");
    const truceIncoming = await nextTypedMessage(playerTwo, "truce incoming", "TRUCE_REQUEST_INCOMING");
    expect(truceOutgoing).toEqual(expect.objectContaining({ type: "TRUCE_REQUESTED" }));
    expect(truceIncoming).toEqual(expect.objectContaining({ type: "TRUCE_REQUEST_INCOMING" }));

    const truceRequestId =
      typeof truceIncoming.request === "object" && truceIncoming.request && "id" in truceIncoming.request
        ? String((truceIncoming.request as { id: string }).id)
        : "";
    expect(truceRequestId).not.toBe("");

    playerTwo.socket.send(JSON.stringify({ type: "TRUCE_ACCEPT", requestId: truceRequestId }));

    const truceUpdateOne = await nextMatchingMessage(
      playerOne,
      "truce accept update one",
      (message) => message.type === "TRUCE_UPDATE" && Array.isArray(message.activeTruces) && message.activeTruces.length > 0
    );
    const truceUpdateTwo = await nextMatchingMessage(
      playerTwo,
      "truce accept update two",
      (message) => message.type === "TRUCE_UPDATE" && Array.isArray(message.activeTruces) && message.activeTruces.length > 0
    );
    expect(truceUpdateOne).toEqual(
      expect.objectContaining({
        type: "TRUCE_UPDATE",
        activeTruces: [expect.objectContaining({ otherPlayerId: "player-2" })]
      })
    );
    expect(truceUpdateTwo).toEqual(
      expect.objectContaining({
        type: "TRUCE_UPDATE",
        activeTruces: [expect.objectContaining({ otherPlayerId: "player-1" })]
      })
    );
  });

  it("accepts a human frontier attack quickly on the 10-ai stress seed while AI and system autopilots are producing durable commands", async () => {
    const simulationCommandStore = new InMemorySimulationCommandStore();
    const simulation = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      seedProfile: "stress-10ai",
      enableAiAutopilot: true,
      aiTickMs: 10,
      enableSystemAutopilot: true,
      systemTickMs: 10,
      commandStore: simulationCommandStore,
      log: silentLog,
      runtimeOptions: {
        now: () => Date.now(),
        backgroundBatchSize: 1
      }
    });
    cleanup.push(() => simulation.close());
    const simulationAddress = await simulation.start();
    expect(simulation.runtime.exportState().tiles.length).toBeGreaterThanOrEqual(2_050);

    await waitUntil(async () => {
      const commands = await simulationCommandStore.loadAllCommands();
      return commands.some((command) => command.sessionId.startsWith("ai-runtime:")) &&
        commands.some((command) => command.sessionId.startsWith("system-runtime:"));
    }, 2_000);

    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationAddress: simulationAddress.address,
      commandStore: new InMemoryGatewayCommandStore()
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const socket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(socket.socket));
    socket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    const init = await nextNonBootstrapMessage(socket, "stress init");
    expect(init.type).toBe("INIT");

    const startedAt = Date.now();
    socket.socket.send(
      JSON.stringify({
        type: "ATTACK",
        fromX: 4,
        fromY: 4,
        toX: 5,
        toY: 4,
        commandId: "stress-cmd-1",
        clientSeq: 1
      })
    );

    expect(await nextNonBootstrapMessage(socket, "stress queued")).toEqual({
      type: "COMMAND_QUEUED",
      commandId: "stress-cmd-1",
      clientSeq: 1
    });
    const accepted = await nextNonBootstrapMessage(socket, "stress accepted");
    const acceptedDelayMs = Date.now() - startedAt;

    expect(accepted).toEqual(
      expect.objectContaining({
        type: "ACTION_ACCEPTED",
        commandId: "stress-cmd-1",
        actionType: "ATTACK",
        target: { x: 5, y: 4 }
      })
    );
    expect(acceptedDelayMs).toBeLessThan(250);
  });

  it("keeps human action acceptance under timeout budget on the 40-ai stress seed", async () => {
    const simulationCommandStore = new InMemorySimulationCommandStore();
    const simulation = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      seedProfile: "stress-40ai",
      enableAiAutopilot: true,
      aiTickMs: 10,
      enableSystemAutopilot: true,
      systemTickMs: 10,
      commandStore: simulationCommandStore,
      log: silentLog,
      runtimeOptions: {
        now: () => Date.now(),
        backgroundBatchSize: 1
      }
    });
    cleanup.push(() => simulation.close());
    const simulationAddress = await simulation.start();
    expect(simulation.runtime.exportState().tiles.length).toBeGreaterThanOrEqual(8_000);

    await waitUntil(async () => {
      const commands = await simulationCommandStore.loadAllCommands();
      return commands.some((command) => command.sessionId.startsWith("ai-runtime:")) &&
        commands.some((command) => command.sessionId.startsWith("system-runtime:"));
    }, 2_500);

    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationAddress: simulationAddress.address,
      commandStore: new InMemoryGatewayCommandStore()
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const socket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(socket.socket));
    socket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    expect((await nextNonBootstrapMessage(socket, "stress-40 init")).type).toBe("INIT");

    const startedAt = Date.now();
    socket.socket.send(
      JSON.stringify({
        type: "ATTACK",
        fromX: 4,
        fromY: 4,
        toX: 5,
        toY: 4,
        commandId: "stress-40-cmd-1",
        clientSeq: 1
      })
    );

    expect(await nextNonBootstrapMessage(socket, "stress-40 queued")).toEqual({
      type: "COMMAND_QUEUED",
      commandId: "stress-40-cmd-1",
      clientSeq: 1
    });
    const accepted = await nextNonBootstrapMessage(socket, "stress-40 accepted");
    const acceptedDelayMs = Date.now() - startedAt;

    expect(accepted).toEqual(
      expect.objectContaining({
        type: "ACTION_ACCEPTED",
        commandId: "stress-40-cmd-1",
        actionType: "ATTACK",
        target: { x: 5, y: 4 }
      })
    );
    expect(acceptedDelayMs).toBeLessThan(500);
  });

  it("broadcasts non-bootstrap tile delta batches to other subscribed players", async () => {
    const scheduledResolutions: Array<{ delayMs: number; task: () => void }> = [];
    const simulation = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      log: silentLog,
      runtimeOptions: {
        now: () => 1_000,
        scheduleAfter: (delayMs, task) => {
          scheduledResolutions.push({ delayMs, task });
        }
      }
    });
    cleanup.push(() => simulation.close());
    const simulationAddress = await simulation.start();

    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationAddress: simulationAddress.address,
      commandStore: new InMemoryGatewayCommandStore(),
      defaultHumanPlayerId: "player-1"
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const attackerSocket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(attackerSocket.socket));
    attackerSocket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    expect((await nextNonBootstrapMessage(attackerSocket, "attacker init")).type).toBe("INIT");

    const observerSocket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(observerSocket.socket));
    observerSocket.socket.send(JSON.stringify({ type: "AUTH", token: "player-2" }));
    expect((await nextNonBootstrapMessage(observerSocket, "observer init")).type).toBe("INIT");

    attackerSocket.socket.send(
      JSON.stringify({
        type: "ATTACK",
        fromX: 10,
        fromY: 10,
        toX: 10,
        toY: 11,
        commandId: "broadcast-cmd-1",
        clientSeq: 1
      })
    );

    await nextNonBootstrapMessage(attackerSocket, "queued");
    await nextNonBootstrapMessage(attackerSocket, "accepted");
    await nextNonBootstrapMessage(attackerSocket, "combat-start");

    expect(scheduledResolutions).toHaveLength(1);
    scheduledResolutions[0]?.task();

    const observerMessage = await nextNonBootstrapMessage(observerSocket, "observer delta");
    expect(observerMessage).toEqual(
      expect.objectContaining({
        type: "TILE_DELTA_BATCH",
        commandId: "broadcast-cmd-1",
        tiles: expect.arrayContaining([expect.objectContaining({ x: 10, y: 11, ownerId: "player-1" })])
      })
    );
  });

  it("supports settlement commands through the rewrite gateway", async () => {
    const scheduledSettles: Array<{ delayMs: number; task: () => void }> = [];
    const gatewayCommandStore = new InMemoryGatewayCommandStore();
    const simulation = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      log: silentLog,
      runtimeOptions: {
        now: () => 1_000,
        scheduleAfter: (delayMs, task) => {
          scheduledSettles.push({ delayMs, task });
        }
      }
    });
    cleanup.push(() => simulation.close());
    const simulationAddress = await simulation.start();

    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationAddress: simulationAddress.address,
      commandStore: gatewayCommandStore,
      defaultHumanPlayerId: "player-1"
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const socket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(socket.socket));
    socket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    expect((await nextNonBootstrapMessage(socket, "settle init")).type).toBe("INIT");

    socket.socket.send(
      JSON.stringify({
        type: "SETTLE",
        x: 10,
        y: 10,
        commandId: "settle-cmd-1",
        clientSeq: 1
      })
    );

    const settleQueued = await nextNonBootstrapMessage(socket, "settle queued");
    expect(settleQueued).toEqual(
      expect.objectContaining({
        type: "COMMAND_QUEUED",
        commandId: expect.any(String),
        clientSeq: 1
      })
    );
    const settleCommandId = String(settleQueued.commandId);

    await waitUntil(() => scheduledSettles.length === 1);
    scheduledSettles[0]?.task();

    const settleResult = await nextNonBootstrapMessage(socket, "settle delta");
    expect(settleResult).toEqual(
      expect.objectContaining({
        type: "TILE_DELTA_BATCH",
        commandId: settleCommandId,
        tiles: expect.arrayContaining([
          expect.objectContaining({
            x: 10,
            y: 10,
            ownerId: "player-1",
            ownershipState: "SETTLED"
          })
        ])
      })
    );

    await waitUntil(async () => (await gatewayCommandStore.get(settleCommandId))?.status === "RESOLVED");
  });

  it("returns detailed owned town data through the rewrite tile-detail path", async () => {
    const gatewayCommandStore = new InMemoryGatewayCommandStore();
    const simulation = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      log: silentLog,
      runtimeOptions: {
        now: () => 1_000
      }
    });
    cleanup.push(() => simulation.close());
    const simulationAddress = await simulation.start();

    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationAddress: simulationAddress.address,
      commandStore: gatewayCommandStore,
      defaultHumanPlayerId: "player-1"
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const socket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(socket.socket));
    socket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    const init = await nextNonBootstrapMessage(socket, "tile detail init");
    expect(init).toEqual(expect.objectContaining({ type: "INIT" }));

    socket.socket.send(JSON.stringify({ type: "REQUEST_TILE_DETAIL", x: 10, y: 10 }));
    const detail = await nextNonBootstrapMessage(socket, "tile detail result");
    expect(detail).toEqual(
      expect.objectContaining({
        type: "TILE_DELTA",
        updates: expect.arrayContaining([
          expect.objectContaining({
            x: 10,
            y: 10,
            detailLevel: "full",
            townJson: expect.any(String)
          })
        ])
      })
    );
  });

  it("supports siege outpost build commands through the rewrite gateway", async () => {
    const scheduledBuilds: Array<{ delayMs: number; task: () => void }> = [];
    const gatewayCommandStore = new InMemoryGatewayCommandStore();
    const simulation = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      log: silentLog,
      runtimeOptions: {
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            {
              id: "player-1",
              isAi: false,
              points: 5_000,
              manpower: 10_000,
              techIds: new Set<string>(["leatherworking"]),
              domainIds: new Set<string>(),
              mods: { attack: 1, defense: 1, income: 1, vision: 1 },
              techRootId: "rewrite-local",
              allies: new Set<string>(),
              strategicResources: { SUPPLY: 100 }
            }
          ]
        ]),
        scheduleAfter: (delayMs, task) => {
          scheduledBuilds.push({ delayMs, task });
        }
      }
    });
    cleanup.push(() => simulation.close());
    const simulationAddress = await simulation.start();

    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationAddress: simulationAddress.address,
      commandStore: gatewayCommandStore,
      defaultHumanPlayerId: "player-1"
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const socket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(socket.socket));
    socket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    expect((await nextNonBootstrapMessage(socket, "siege init")).type).toBe("INIT");

    socket.socket.send(
      JSON.stringify({
        type: "BUILD_SIEGE_OUTPOST",
        x: 10,
        y: 10,
        commandId: "siege-cmd-1",
        clientSeq: 1
      })
    );

    const queued = await nextNonBootstrapMessage(socket, "siege queued");
    expect(queued).toEqual(
      expect.objectContaining({
        type: "COMMAND_QUEUED",
        commandId: expect.any(String),
        clientSeq: 1
      })
    );
    const commandId = String(queued.commandId);

    await waitUntil(() => scheduledBuilds.length === 1);
    scheduledBuilds[0]?.task();

    await nextCommandMessage(socket, "siege delta", commandId, "TILE_DELTA_BATCH");
    const exportedSiegeTile = simulation.runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10);
    expect(exportedSiegeTile?.siegeOutpostJson).toContain("\"status\":\"active\"");

    const completedDelta = await nextCommandMessage(socket, "siege complete delta", commandId, "TILE_DELTA_BATCH");
    expect(completedDelta).toEqual(
      expect.objectContaining({
        type: "TILE_DELTA_BATCH",
        commandId,
        tiles: expect.arrayContaining([expect.objectContaining({ x: 10, y: 10 })])
      })
    );

    await waitUntil(async () => (await gatewayCommandStore.get(commandId))?.status === "RESOLVED");
  });

  it("supports observatory build commands through the rewrite gateway", async () => {
    const scheduledBuilds: Array<{ delayMs: number; task: () => void }> = [];
    const gatewayCommandStore = new InMemoryGatewayCommandStore();
    const simulation = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      log: silentLog,
      runtimeOptions: {
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            {
              id: "player-1",
              isAi: false,
              points: 10_000,
              manpower: 10_000,
              techIds: new Set<string>(["cartography"]),
              domainIds: new Set<string>(),
              mods: { attack: 1, defense: 1, income: 1, vision: 1 },
              techRootId: "rewrite-local",
              allies: new Set<string>(),
              strategicResources: { CRYSTAL: 100 }
            }
          ]
        ]),
        scheduleAfter: (delayMs, task) => {
          scheduledBuilds.push({ delayMs, task });
        }
      }
    });
    cleanup.push(() => simulation.close());
    const simulationAddress = await simulation.start();

    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationAddress: simulationAddress.address,
      commandStore: gatewayCommandStore,
      defaultHumanPlayerId: "player-1"
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const socket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(socket.socket));
    socket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    expect((await nextNonBootstrapMessage(socket, "observatory init")).type).toBe("INIT");

    socket.socket.send(
      JSON.stringify({
        type: "SETTLE",
        x: 10,
        y: 10,
        commandId: "observatory-settle-cmd-1",
        clientSeq: 1
      })
    );

    const settleQueued = await nextNonBootstrapMessage(socket, "observatory settle queued");
    expect(settleQueued).toEqual(
      expect.objectContaining({
        type: "COMMAND_QUEUED",
        commandId: expect.any(String),
        clientSeq: 1
      })
    );
    const settleCommandId = String(settleQueued.commandId);

    await waitUntil(() => scheduledBuilds.length === 1);
    scheduledBuilds[0]?.task();
    await nextCommandMessage(socket, "observatory settle delta", settleCommandId, "TILE_DELTA_BATCH");

    socket.socket.send(
      JSON.stringify({
        type: "BUILD_OBSERVATORY",
        x: 10,
        y: 10,
        commandId: "observatory-cmd-1",
        clientSeq: 2
      })
    );

    const queued = await nextNonBootstrapMessage(socket, "observatory queued");
    expect(queued).toEqual(
      expect.objectContaining({
        type: "COMMAND_QUEUED",
        commandId: expect.any(String),
        clientSeq: 2
      })
    );
    const commandId = String(queued.commandId);

    await waitUntil(() => scheduledBuilds.length === 2);
    scheduledBuilds[1]?.task();

    await nextCommandMessage(socket, "observatory delta", commandId, "TILE_DELTA_BATCH");
    const exportedTile = simulation.runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10);
    expect(exportedTile?.observatoryJson).toContain("\"status\":\"active\"");

    const completedDelta = await nextCommandMessage(socket, "observatory complete delta", commandId, "TILE_DELTA_BATCH");
    expect(completedDelta).toEqual(
      expect.objectContaining({
        type: "TILE_DELTA_BATCH",
        commandId,
        tiles: expect.arrayContaining([expect.objectContaining({ x: 10, y: 10 })])
      })
    );

    await waitUntil(async () => (await gatewayCommandStore.get(commandId))?.status === "RESOLVED");
  });

  it("supports economic structure build commands through the rewrite gateway", async () => {
    const scheduledBuilds: Array<{ delayMs: number; task: () => void }> = [];
    const gatewayCommandStore = new InMemoryGatewayCommandStore();
    const simulation = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      log: silentLog,
      runtimeOptions: {
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            {
              id: "player-1",
              isAi: false,
              points: 10_000,
              manpower: 10_000,
              techIds: new Set<string>(["industrial-extraction"]),
              domainIds: new Set<string>(),
              mods: { attack: 1, defense: 1, income: 1, vision: 1 },
              techRootId: "rewrite-local",
              allies: new Set<string>(),
              strategicResources: {}
            }
          ]
        ]),
        scheduleAfter: (delayMs, task) => {
          scheduledBuilds.push({ delayMs, task });
        }
      }
    });
    cleanup.push(() => simulation.close());
    const simulationAddress = await simulation.start();

    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationAddress: simulationAddress.address,
      commandStore: gatewayCommandStore,
      defaultHumanPlayerId: "player-1"
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const socket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(socket.socket));
    socket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    expect((await nextNonBootstrapMessage(socket, "market init")).type).toBe("INIT");

    socket.socket.send(
      JSON.stringify({
        type: "SETTLE",
        x: 10,
        y: 10,
        commandId: "foundry-settle-cmd-1",
        clientSeq: 1
      })
    );

    const settleQueued = await nextNonBootstrapMessage(socket, "foundry settle queued");
    expect(settleQueued).toEqual(
      expect.objectContaining({
        type: "COMMAND_QUEUED",
        commandId: expect.any(String),
        clientSeq: 1
      })
    );
    const settleCommandId = String(settleQueued.commandId);

    await waitUntil(() => scheduledBuilds.length === 1);
    scheduledBuilds[0]?.task();
    await nextCommandMessage(socket, "foundry settle delta", settleCommandId, "TILE_DELTA_BATCH");

    socket.socket.send(
      JSON.stringify({
        type: "BUILD_ECONOMIC_STRUCTURE",
        x: 10,
        y: 10,
        structureType: "FOUNDRY",
        commandId: "foundry-cmd-1",
        clientSeq: 2
      })
    );

    const queued = await nextNonBootstrapMessage(socket, "foundry queued");
    expect(queued).toEqual(
      expect.objectContaining({
        type: "COMMAND_QUEUED",
        commandId: expect.any(String),
        clientSeq: 2
      })
    );
    const commandId = String(queued.commandId);

    await waitUntil(() => scheduledBuilds.length === 2);
    scheduledBuilds[1]?.task();

    await nextCommandMessage(socket, "foundry delta", commandId, "TILE_DELTA_BATCH");
    const exportedEconomicTile = simulation.runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10);
    expect(exportedEconomicTile?.economicStructureJson).toContain("\"type\":\"FOUNDRY\"");
    expect(exportedEconomicTile?.economicStructureJson).toContain("\"status\":\"active\"");

    const completedDelta = await nextCommandMessage(socket, "foundry complete delta", commandId, "TILE_DELTA_BATCH");
    expect(completedDelta).toEqual(
      expect.objectContaining({
        type: "TILE_DELTA_BATCH",
        commandId,
        tiles: expect.arrayContaining([expect.objectContaining({ x: 10, y: 10 })])
      })
    );

    await waitUntil(async () => (await gatewayCommandStore.get(commandId))?.status === "RESOLVED");
  });

  it("supports removing an active fort through the rewrite gateway and clears the fort tile delta", async () => {
    const scheduledActions: Array<{ delayMs: number; task: () => void }> = [];
    const gatewayCommandStore = new InMemoryGatewayCommandStore();
    const simulation = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      log: silentLog,
      runtimeOptions: {
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            {
              id: "player-1",
              isAi: false,
              points: 5_000,
              manpower: 10_000,
              techIds: new Set<string>(["masonry"]),
              domainIds: new Set<string>(),
              mods: { attack: 1, defense: 1, income: 1, vision: 1 },
              techRootId: "rewrite-local",
              allies: new Set<string>(),
              strategicResources: { IRON: 100 }
            }
          ]
        ]),
        scheduleAfter: (delayMs, task) => {
          scheduledActions.push({ delayMs, task });
        }
      }
    });
    cleanup.push(() => simulation.close());
    const simulationAddress = await simulation.start();

    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationAddress: simulationAddress.address,
      commandStore: gatewayCommandStore,
      defaultHumanPlayerId: "player-1"
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const socket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(socket.socket));
    socket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    expect((await nextNonBootstrapMessage(socket, "remove fort init")).type).toBe("INIT");

    socket.socket.send(
      JSON.stringify({
        type: "SETTLE",
        x: 10,
        y: 10,
        commandId: "fort-settle-cmd-1",
        clientSeq: 1
      })
    );

    const settleQueued = await nextNonBootstrapMessage(socket, "fort settle queued");
    const settleCommandId = String(settleQueued.commandId);
    await waitUntil(() => scheduledActions.length >= 1);
    scheduledActions[0]?.task();
    await nextCommandMessage(socket, "fort settle delta", settleCommandId, "TILE_DELTA_BATCH");

    socket.socket.send(
      JSON.stringify({
        type: "BUILD_FORT",
        x: 10,
        y: 10,
        commandId: "fort-build-cmd-1",
        clientSeq: 2
      })
    );

    const buildQueued = await nextNonBootstrapMessage(socket, "fort queued");
    const buildCommandId = String(buildQueued.commandId);
    await waitUntil(() => scheduledActions.length >= 2);
    scheduledActions[1]?.task();
    await nextCommandMessage(socket, "fort built delta", buildCommandId, "TILE_DELTA_BATCH");

    const builtTile = simulation.runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10);
    expect(builtTile?.fortJson).toContain("\"status\":\"active\"");

    socket.socket.send(
      JSON.stringify({
        type: "REMOVE_STRUCTURE",
        x: 10,
        y: 10,
        commandId: "fort-remove-cmd-1",
        clientSeq: 3
      })
    );

    const removeQueued = await nextNonBootstrapMessage(socket, "remove fort queued");
    const removeCommandId = String(removeQueued.commandId);

    const removingDelta = await nextCommandMessage(socket, "remove fort removing", removeCommandId, "TILE_DELTA_BATCH");
    expect(removingDelta).toEqual(
      expect.objectContaining({
        type: "TILE_DELTA_BATCH",
        commandId: removeCommandId,
        tiles: expect.arrayContaining([expect.objectContaining({ x: 10, y: 10, fortJson: expect.any(String) })])
      })
    );
    await waitUntil(() => scheduledActions.length >= 3);

    scheduledActions[2]?.task();

    const removedDelta = await nextCommandMessage(socket, "remove fort removed", removeCommandId, "TILE_DELTA_BATCH");
    expect(removedDelta).toEqual(
      expect.objectContaining({
        type: "TILE_DELTA_BATCH",
        commandId: removeCommandId,
        tiles: expect.arrayContaining([expect.objectContaining({ x: 10, y: 10, fortJson: "" })])
      })
    );

  const removedTile = simulation.runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10);
  expect(removedTile?.fortJson).toBeUndefined();
  await waitUntil(async () => (await gatewayCommandStore.get(removeCommandId))?.status === "RESOLVED");
  });

});
