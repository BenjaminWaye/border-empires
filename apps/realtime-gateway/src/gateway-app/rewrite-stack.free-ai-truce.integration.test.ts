import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import type { SimulationClientMethods } from "../sim-client/sim-client.js";
import { InMemoryGatewaySocialStore } from "../social-store/social-store.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { closeSocket, nextMatchingMessage, nextNonBootstrapMessage, openSocket } from "./rewrite-stack-test-helpers.js";

const HOUR = 3_600_000;
const simulationClient: Pick<SimulationClientMethods,
  "preparePlayer" | "submitCommand" | "subscribePlayer" | "unsubscribePlayer" | "getSubscriptionNamespace" | "ping" | "streamEvents"
> = {
  preparePlayer: async playerId => ({ playerId, spawned: false }),
  submitCommand: async () => undefined,
  subscribePlayer: async playerId => ({
    playerId,
    player: {
      id: playerId, gold: 0, manpower: 900, manpowerCap: 1000, incomePerMinute: 100,
      strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
      strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
      developmentProcessLimit: 3, activeDevelopmentProcessCount: 0, pendingSettlements: [], techIds: [], domainIds: []
    },
    tiles: [{ x: 0, y: 0, ownerId: "ai-1" }, { x: 1, y: 0, ownerId: "player-1" }]
  }),
  unsubscribePlayer: async () => undefined,
  getSubscriptionNamespace: async () => "free-ai-truce-login-regression",
  ping: async () => undefined,
  streamEvents: (_listener, options) => { options?.onConnect?.(); return () => undefined; }
};

describe("restored free AI truce offers", () => {
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanup.length) await cleanup.pop()?.();
  });

  it("accepts an offer shown at login even when the recovered AI would now charge for peace", async () => {
    const socialStore = new InMemoryGatewaySocialStore();
    socialStore.upsertPlayer("ai-1", "Alden");
    socialStore.upsertPlayer("player-1", "Human");
    socialStore.saveTruceRequest({
      id: "offline-peace", fromPlayerId: "ai-1", toPlayerId: "player-1", durationHours: 12,
      createdAt: Date.now() - 20 * HOUR, expiresAt: Date.now() + HOUR
    });
    socialStore.saveTruceRequest({
      id: "expired-peace", fromPlayerId: "ai-2", toPlayerId: "player-1", durationHours: 12,
      createdAt: Date.now() - 20 * HOUR, expiresAt: Date.now() - HOUR
    });
    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1", port: 0, logger: false,
      commandStore: new InMemoryGatewayCommandStore(), socialStore,
      simulationSeedProfile: "stress-10ai", defaultHumanPlayerId: "player-1", simulationClient
    });
    cleanup.push(() => gateway.close());
    const address = await gateway.start();
    const player = await openSocket(address.wsUrl);
    cleanup.push(() => closeSocket(player.socket));
    player.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    const init = await nextNonBootstrapMessage(player, "login with standing peace offer");
    expect(init).toMatchObject({ type: "INIT", truceRequests: [expect.objectContaining({ id: "offline-peace" })] });

    player.socket.send(JSON.stringify({ type: "TRUCE_ACCEPT", requestId: "offline-peace" }));
    const response = await nextMatchingMessage(player, "accepted free AI peace", message =>
      message.type === "ERROR" || (message.type === "TRUCE_UPDATE" && Array.isArray(message.activeTruces) && message.activeTruces.length > 0)
    );
    expect(response).toMatchObject({
      type: "TRUCE_UPDATE", incomingTruceRequests: [], activeTruces: [expect.objectContaining({ otherPlayerId: "ai-1" })]
    });
    expect(socialStore.loadSnapshot().truceRequests).toEqual([]);
    expect(socialStore.loadSnapshot().activeTruces).toHaveLength(1);
  }, 20_000);
});
