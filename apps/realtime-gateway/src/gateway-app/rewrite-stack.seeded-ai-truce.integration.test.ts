import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { createSimulationService } from "../../../simulation/src/simulation-service/simulation-service.js";
import { closeSocket, nextMatchingMessage, nextNonBootstrapMessage, nextTypedMessage, openSocket, silentLog } from "./rewrite-stack-test-helpers.js";
import type { SimulationClientMethods } from "../sim-client/sim-client.js";

// A sim client whose subscribePlayer serves fixed per-player state, so the
// AI's diplomacy stance can be pinned without staging a real war.
const mockedSimulationClient = (
  namespace: string,
  playerState: (playerId: string) => { manpower: number; manpowerCap: number; tiles?: Array<{ x: number; y: number; ownerId: string }> }
): Pick<SimulationClientMethods, "preparePlayer" | "submitCommand" | "subscribePlayer" | "unsubscribePlayer" | "getSubscriptionNamespace" | "ping" | "streamEvents"> => ({
  preparePlayer: async (playerId) => ({ playerId, spawned: false }),
  submitCommand: async () => undefined,
  subscribePlayer: async (playerId) => {
    const state = playerState(playerId);
    return {
      playerId,
      player: {
        id: playerId,
        gold: 0,
        manpower: state.manpower,
        manpowerCap: state.manpowerCap,
        incomePerMinute: 0,
        strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
        strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
        developmentProcessLimit: 3,
        activeDevelopmentProcessCount: 0,
        pendingSettlements: [],
        techIds: [],
        domainIds: []
      },
      tiles: state.tiles ?? []
    };
  },
  unsubscribePlayer: async () => undefined,
  getSubscriptionNamespace: async () => namespace,
  ping: async () => undefined,
  streamEvents: (_listener, options) => {
    options?.onConnect?.();
    return () => undefined;
  }
});

// Seeded-AI truce integration tests, split out of rewrite-stack.integration.test.ts
// (which is at the 500-line file cap) since these are a cohesive group
// covering one behavior: the AI diplomacy auto-responder in
// seeded-ai-diplomacy-responder.ts, which decides from the AI's stance toward
// the requester (ai-diplomacy-stance.ts) -- see those files for the decision
// logic these tests exercise end-to-end.
describe("rewrite stack integration: seeded AI truce responses", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const next = cleanup.pop();
      if (next) await next();
    }
  });

  // Spins up a real simulation service + gateway app + live sockets, so this
  // is genuinely CPU-bound, not just slow-by-accident -- the default 5000ms
  // vitest timeout has been observed to trip under CI's full `pnpm test`
  // concurrency (every package's suite running at once on a shared-CPU
  // runner), not from any bug here. Widened rather than left default so a
  // busy CI runner doesn't produce a false failure on an otherwise-correct
  // test.
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
    // Whichever way the AI decides on a fresh world, its answer must name it
    // by its resolved display name and give a reason.
    expect(
      await nextMatchingMessage(
        playerOne,
        "seasonal ai truce answered",
        (message) => message.type === "TRUCE_UPDATE" && typeof message.announcement === "string" && message.announcement.startsWith("AI 4 ")
      )
    ).toEqual(
      expect.objectContaining({
        type: "TRUCE_UPDATE",
        outgoingTruceRequests: [],
        announcement: expect.stringMatching(/^AI 4 (accepted your 12h truce|declined your 12h truce offer)\. \S/)
      })
    );
  }, 20_000);

  it("lets seeded AI players accept longer truce offers once their manpower runs low, before they have a live socket", async () => {
    // The AI fetches its live state straight from the simulation (a mocked
    // subscribePlayer here) rather than relying on a real battle to deplete
    // its manpower.
    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      commandStore: new InMemoryGatewayCommandStore(),
      simulationSeedProfile: "stress-10ai",
      defaultHumanPlayerId: "player-1",
      simulationClient: mockedSimulationClient("seeded-ai-truce-low-manpower-test", (playerId) =>
        playerId === "ai-1" ? { manpower: 100, manpowerCap: 1_000 } : { manpower: 10_000, manpowerCap: 10_000 }
      )
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
        announcement: "AI 1 accepted your 24h truce. AI 1 is looking for peace: their armies are spent."
      })
    );
  });

  it("lets an evenly matched neighbouring AI decline with a reason, then blocks an immediate re-offer", async () => {
    const touching = [
      { x: 0, y: 0, ownerId: "ai-2" },
      { x: 1, y: 0, ownerId: "player-1" }
    ];
    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      commandStore: new InMemoryGatewayCommandStore(),
      simulationSeedProfile: "stress-10ai",
      defaultHumanPlayerId: "player-1",
      simulationClient: mockedSimulationClient("seeded-ai-truce-wary-test", () => ({ manpower: 8_000, manpowerCap: 10_000, tiles: touching }))
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
    const declined = "AI 2 declined your 12h truce offer. AI 2 is wary of you and won't lower their guard on a contested border.";
    expect(
      await nextMatchingMessage(playerOne, "ai truce declined", (message) => message.type === "TRUCE_UPDATE" && message.announcement === declined)
    ).toEqual(expect.objectContaining({ type: "TRUCE_UPDATE", outgoingTruceRequests: [], announcement: declined }));

    playerOne.socket.send(JSON.stringify({ type: "TRUCE_REQUEST", targetPlayerName: "AI 2", durationHours: 12 }));
    expect(await nextTypedMessage(playerOne, "ai truce re-offer blocked", "ERROR")).toEqual(
      expect.objectContaining({ type: "ERROR", code: "TRUCE_OFFER_COOLDOWN", message: "You can offer AI 2 a truce again in 30m." })
    );
  }, 20_000);
});
