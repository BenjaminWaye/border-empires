// GET /hq/galaxy marks Sectors held by AI Houses (§29.1) so the map shows them
// as rival-held, not frontier. Split from galaxy-routes.test.ts (at the line cap).
import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { SeasonArchiveRow } from "@border-empires/sim-protocol";

import { registerGalaxyRoutes } from "./galaxy-routes.js";
import { InMemoryGalaxyPlanetStore } from "../galaxy-planet-store/galaxy-planet-store.js";
import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";

const won = (seasonId: string, playerId: string, playerName: string): SeasonArchiveRow => ({
  seasonId,
  seasonSequence: Number(seasonId.slice(-1)),
  endedAt: 1_000,
  updatedAt: 1_000,
  winner: { playerId, playerName, crownedAt: 1_000, objectiveId: "TOWN_CONTROL", objectiveName: "Town Control" },
  mostTerritory: [],
  mostPoints: [],
  longestSurvivalMs: [],
  replayEvents: []
});

describe("GET /hq/galaxy AI Houses", () => {
  it("names the AI House holding an AI-won Sector, and nothing for a player's", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    const app = Fastify();
    registerGalaxyRoutes(app, {
      listSeasonArchives: async () => [won("season-1", "ai-3", "ai-3"), won("season-2", "player-1", "Nauticus")],
      authenticateBearer: async () => undefined,
      galaxyPlanetStore: new InMemoryGalaxyPlanetStore(),
      authBindingStore
    });
    const response = await app.inject({ method: "GET", url: "/hq/galaxy" });
    const planets = (response.json() as { planets: { seasonId: string; aiHouse?: string }[] }).planets;
    expect(planets.find((p) => p.seasonId === "season-1")?.aiHouse).toBe("Milo");
    expect(planets.find((p) => p.seasonId === "season-2")).not.toHaveProperty("aiHouse");
  });
});
