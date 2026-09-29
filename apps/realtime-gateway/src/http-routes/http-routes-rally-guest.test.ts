import { describe, expect, it } from "vitest";
import Fastify from "fastify";

import { registerGatewayHttpRoutes } from "./http-routes.js";
import { InMemoryRallyLinkStore } from "../rally-link-store/rally-link-store.js";

describe("gateway http routes rally guest status", () => {
  it("passes the caller's guest status to preparePlayer when creating a rally link", async () => {
    const app = Fastify();
    const rallyLinkStore = new InMemoryRallyLinkStore();
    const prepareCalls: Array<{ playerId: string; isGuest?: boolean }> = [];
    registerGatewayHttpRoutes(app, {
      startupStartedAt: 1_000,
      simulationAddress: "127.0.0.1:50051",
      simulationSeedProfile: "default",
      health: () => ({ ok: true, simulation: { connected: true } }),
      supportedMessageTypes: ["ATTACK"],
      recentEvents: () => [],
      attackDebug: () => ({ controlPath: [], hotPath: [], slowOrWarn: [] }),
      attackTraces: () => [],
      metrics: () => "",
      getCurrentSeasonStatus: async () => "active",
      listSeasonArchives: async () => [],
      getAdminPlayers: async () => [],
      startNextSeason: async () => ({ seasonId: "season-2" }),
      playOrigin: "https://play.example.test",
      rallyLinkStore,
      authenticateBearer: async () => ({ playerId: "guest-owner-1", playerName: "Guest Owner", isGuest: true }),
      preparePlayer: async (playerId, options) => {
        prepareCalls.push({ playerId, isGuest: options.isGuest });
        return { playerId, spawned: false };
      },
      subscribePlayer: async () => ({
        player: { name: "Guest Owner" },
        tiles: [{ x: 5, y: 6, ownerId: "guest-owner-1", ownershipState: "SETTLED", townType: "FARMING" }]
      })
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/rally/links",
      headers: { authorization: "Bearer token" },
      payload: { maxUses: 2, ttlHours: 24 }
    });
    expect(createResponse.statusCode).toBe(200);
    expect(prepareCalls).toEqual([{ playerId: "guest-owner-1", isGuest: true }]);
    await app.close();
  });
});
