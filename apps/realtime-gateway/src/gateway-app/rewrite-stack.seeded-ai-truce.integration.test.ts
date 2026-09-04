import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { createSimulationService } from "../../../simulation/src/simulation-service/simulation-service.js";
import { closeSocket, nextMatchingMessage, nextNonBootstrapMessage, nextTypedMessage, openSocket, silentLog } from "./rewrite-stack-test-helpers.js";

// Seeded-AI truce integration tests, split out of rewrite-stack.integration.test.ts
// (which is at the 500-line file cap) since these are a cohesive group
// covering one behavior: the AI truce auto-responder in
// seeded-ai-truce-responder.ts, which is manpower-only -- see that file for
// the decision logic these tests exercise end-to-end.
describe("rewrite stack integration: seeded AI truce responses", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const next = cleanup.pop();
      if (next) await next();
    }
  });

  it("resolves seasonal default AI display names for truce offers", async () => {
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
      commandStore: new InMemoryGatewayCommandStore(),
      defaultHumanPlayerId: "player-1"
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const playerOne = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(playerOne.socket));

    playerOne.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    expect(await nextNonBootstrapMessage(playerOne, "player one init")).toEqual(expect.objectContaining({ type: "INIT" }));

    playerOne.socket.send(JSON.stringify({ type: "TRUCE_REQUEST", targetPlayerName: "AI 4", durationHours: 12 }));

    expect(
      await nextMatchingMessage(
        playerOne,
        "seasonal ai truce pending",
        (message) =>
          message.type === "TRUCE_UPDATE" &&
          Array.isArray(message.outgoingTruceRequests) &&
          message.outgoingTruceRequests.some((request) => {
            return Boolean(
              request &&
                typeof request === "object" &&
                "toPlayerId" in request &&
                (request as { toPlayerId?: unknown }).toPlayerId === "ai-4"
            );
          })
      )
    ).toEqual(
      expect.objectContaining({
        type: "TRUCE_UPDATE",
        outgoingTruceRequests: [expect.objectContaining({ toPlayerId: "ai-4", toName: "AI 4", durationHours: 12 })]
      })
    );
    expect(await nextTypedMessage(playerOne, "seasonal ai truce requested", "TRUCE_REQUESTED")).toEqual(
      expect.objectContaining({
        type: "TRUCE_REQUESTED",
        targetName: "AI 4"
      })
    );
    expect(
      await nextMatchingMessage(
        playerOne,
        "seasonal ai truce declined",
        (message) => message.type === "TRUCE_UPDATE" && message.announcement === "AI 4 declined your truce offer."
      )
    ).toEqual(
      expect.objectContaining({
        type: "TRUCE_UPDATE",
        outgoingTruceRequests: [],
        announcement: "AI 4 declined your truce offer."
      })
    );
  });

  it("lets seeded AI players accept longer truce offers once their manpower runs low, before they have a live socket", async () => {
    // The AI truce decision is manpower-only (see seeded-ai-truce-responder.ts):
    // it fetches the target's live manpower straight from the simulation
    // via a mocked subscribePlayer here, rather than relying on a real
    // battle to deplete it.
    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      commandStore: new InMemoryGatewayCommandStore(),
      simulationSeedProfile: "stress-10ai",
      defaultHumanPlayerId: "player-1",
      simulationClient: {
        preparePlayer: async (playerId) => ({ playerId, spawned: false }),
        submitCommand: async () => undefined,
        subscribePlayer: async (playerId) => ({
          playerId,
          player: {
            id: playerId,
            gold: 0,
            manpower: playerId === "ai-1" ? 100 : 10_000,
            manpowerCap: playerId === "ai-1" ? 1_000 : 10_000,
            incomePerMinute: 0,
            strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
            strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
            developmentProcessLimit: 3,
            activeDevelopmentProcessCount: 0,
            pendingSettlements: [],
            techIds: [],
            domainIds: []
          },
          tiles: []
        }),
        unsubscribePlayer: async () => undefined,
        getSubscriptionNamespace: async () => "seeded-ai-truce-low-manpower-test",
        ping: async () => undefined,
        streamEvents: (_listener, options) => {
          options?.onConnect?.();
          return () => undefined;
        }
      }
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const playerOne = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(playerOne.socket));

    playerOne.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    expect(await nextNonBootstrapMessage(playerOne, "player one init")).toEqual(expect.objectContaining({ type: "INIT" }));

    playerOne.socket.send(JSON.stringify({ type: "TRUCE_REQUEST", targetPlayerName: "AI 1", durationHours: 24 }));

    expect(
      await nextMatchingMessage(
        playerOne,
        "ai truce update",
        (message) =>
          message.type === "TRUCE_UPDATE" &&
          Array.isArray(message.outgoingTruceRequests) &&
          message.outgoingTruceRequests.length > 0
      )
    ).toEqual(
      expect.objectContaining({
        type: "TRUCE_UPDATE",
        outgoingTruceRequests: [expect.objectContaining({ toPlayerId: "ai-1", toName: "AI 1", durationHours: 24 })]
      })
    );
    expect(await nextTypedMessage(playerOne, "ai truce requested", "TRUCE_REQUESTED")).toEqual(
      expect.objectContaining({
        type: "TRUCE_REQUESTED",
        targetName: "AI 1"
      })
    );
    expect(
      await nextMatchingMessage(
        playerOne,
        "ai truce accepted",
        (message) => message.type === "TRUCE_UPDATE" && Array.isArray(message.activeTruces) && message.activeTruces.length > 0
      )
    ).toEqual(
      expect.objectContaining({
        type: "TRUCE_UPDATE",
        activeTruces: [expect.objectContaining({ otherPlayerId: "ai-1", otherPlayerName: "AI 1" })],
        announcement: "AI 1 and Nauticus agreed to a 24h truce."
      })
    );
  });

  it("lets unpressured seeded AI players decline truce offers before they have a live socket", async () => {
    const simulation = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      seedProfile: "stress-10ai",
      log: silentLog
    });
    cleanup.push(() => simulation.close());
    const simulationAddress = await simulation.start();

    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationAddress: simulationAddress.address,
      commandStore: new InMemoryGatewayCommandStore(),
      simulationSeedProfile: "stress-10ai",
      defaultHumanPlayerId: "player-1"
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const playerOne = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(playerOne.socket));

    playerOne.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    expect(await nextNonBootstrapMessage(playerOne, "player one init")).toEqual(expect.objectContaining({ type: "INIT" }));

    playerOne.socket.send(JSON.stringify({ type: "TRUCE_REQUEST", targetPlayerName: "AI 2", durationHours: 12 }));

    expect(
      await nextMatchingMessage(
        playerOne,
        "ai truce pending",
        (message) =>
          message.type === "TRUCE_UPDATE" &&
          Array.isArray(message.outgoingTruceRequests) &&
          message.outgoingTruceRequests.some((request) => {
            return Boolean(
              request &&
                typeof request === "object" &&
                "toPlayerId" in request &&
                (request as { toPlayerId?: unknown }).toPlayerId === "ai-2"
            );
          })
      )
    ).toEqual(
      expect.objectContaining({
        type: "TRUCE_UPDATE",
        outgoingTruceRequests: [expect.objectContaining({ toPlayerId: "ai-2", toName: "AI 2", durationHours: 12 })]
      })
    );
    expect(await nextTypedMessage(playerOne, "ai truce requested", "TRUCE_REQUESTED")).toEqual(
      expect.objectContaining({
        type: "TRUCE_REQUESTED",
        targetName: "AI 2"
      })
    );
    expect(
      await nextMatchingMessage(
        playerOne,
        "ai truce declined",
        (message) => message.type === "TRUCE_UPDATE" && message.announcement === "AI 2 declined your truce offer."
      )
    ).toEqual(
      expect.objectContaining({
        type: "TRUCE_UPDATE",
        outgoingTruceRequests: [],
        announcement: "AI 2 declined your truce offer."
      })
    );
  });
});
