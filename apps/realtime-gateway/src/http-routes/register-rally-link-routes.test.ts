import { describe, expect, it } from "vitest";
import Fastify from "fastify";

import { registerGatewayHttpRoutes } from "./http-routes.js";
import { InMemoryRallyLinkStore } from "../rally-link-store/rally-link-store.js";

describe("rally link routes", () => {
  it("mints, reads, lists, and revokes rally links", async () => {
    const app = Fastify();
    const rallyLinkStore = new InMemoryRallyLinkStore();
    let seasonStatus: "active" | "ended" = "active";
    let ownerAnchor = { x: 12, y: 34 };
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
      getCurrentSeasonSummary: async () => ({
        season: "season-1",
        seasonId: "season-1",
        seasonSequence: 1,
        status: seasonStatus,
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
      getCurrentSeasonStatus: async () => seasonStatus,
      listSeasonArchives: async () => [],
      getAdminPlayers: async () => [],
      startNextSeason: async () => ({ seasonId: "season-2" }),
      playOrigin: "https://play.example.test",
      rallyLinkStore,
      authenticateBearer: async () => ({ playerId: "owner-1", playerName: "Owner" }),
      preparePlayer: async () => ({ playerId: "owner-1", spawned: false }),
      subscribePlayer: async () => ({
        player: { name: "Owner" },
        tiles: [{ ...ownerAnchor, ownerId: "owner-1", ownershipState: "SETTLED", townType: "FARMING" }]
      })
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/rally/links",
      headers: { authorization: "Bearer token" },
      payload: { maxUses: 2, ttlHours: 24 }
    });
    expect(createResponse.statusCode).toBe(200);
    const created = createResponse.json();
    expect(created.url).toMatch(/^https:\/\/play\.example\.test\/r\/r_/);
    expect(created.anchor).toEqual({ x: 12, y: 34, island: "tile:12,34" });

    const publicResponse = await app.inject({ method: "GET", url: `/rally/links/${created.code}` });
    expect(publicResponse.statusCode).toBe(200);
    expect(publicResponse.json()).toEqual(expect.objectContaining({ code: created.code, ownerName: "Owner", anchor: { x: 12, y: 34, island: "tile:12,34" } }));

    ownerAnchor = { x: 90, y: 91 };
    const movedOwnerResponse = await app.inject({ method: "GET", url: `/rally/links/${created.code}` });
    expect(movedOwnerResponse.statusCode).toBe(200);
    expect(movedOwnerResponse.json().anchor).toEqual({ x: 12, y: 34, island: "tile:12,34" });

    seasonStatus = "ended";
    const endedSeasonResponse = await app.inject({ method: "GET", url: `/rally/links/${created.code}` });
    expect(endedSeasonResponse.statusCode).toBe(404);
    seasonStatus = "active";

    const mineResponse = await app.inject({ method: "GET", url: "/rally/links/mine", headers: { authorization: "Bearer token" } });
    expect(mineResponse.statusCode).toBe(200);
    expect(mineResponse.json().links).toHaveLength(1);

    const deleteResponse = await app.inject({ method: "DELETE", url: `/rally/links/${created.code}`, headers: { authorization: "Bearer token" } });
    expect(deleteResponse.statusCode).toBe(200);
    const missingResponse = await app.inject({ method: "GET", url: `/rally/links/${created.code}` });
    expect(missingResponse.statusCode).toBe(404);
    await app.close();
  });
});
