import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { SeasonArchiveRow } from "@border-empires/sim-protocol";

import { registerGalaxyExplorationRoutes } from "./galaxy-exploration-routes.js";
import { InMemoryGalaxyExplorationStore } from "../galaxy-exploration-store/galaxy-exploration-store.js";
import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GatewayResolvedIdentity } from "../auth-identity/auth-identity.js";

const wonArchive = (overrides: Partial<SeasonArchiveRow> = {}): SeasonArchiveRow => ({
  seasonId: "season-1",
  seasonSequence: 1,
  endedAt: 1_000,
  updatedAt: 1_000,
  winner: { playerId: "player-1", playerName: "Nauticus", crownedAt: 1_000, objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance" },
  mostTerritory: [],
  mostPoints: [],
  longestSurvivalMs: [],
  replayEvents: [],
  ...overrides
});

const identities: Record<string, GatewayResolvedIdentity> = {
  "player-1": { playerId: "player-1", playerName: "Nauticus", authUid: "uid-1" }
};

const buildApp = (options: { archives: SeasonArchiveRow[]; galaxyExplorationStore?: InMemoryGalaxyExplorationStore; authBindingStore?: InMemoryGatewayAuthBindingStore }) => {
  const app = Fastify();
  registerGalaxyExplorationRoutes(app, {
    listSeasonArchives: async () => options.archives,
    authenticateBearer: async (auth) => {
      const token = auth?.replace(/^Bearer /, "");
      return token ? identities[token] : undefined;
    },
    authBindingStore: options.authBindingStore ?? new InMemoryGatewayAuthBindingStore(),
    galaxyExplorationStore: options.galaxyExplorationStore ?? new InMemoryGalaxyExplorationStore()
  });
  return app;
};

describe("GET /hq/galaxy/exploration", () => {
  it("401s with no bearer identity", async () => {
    const app = buildApp({ archives: [] });
    const response = await app.inject({ method: "GET", url: "/hq/galaxy/exploration" });
    expect(response.statusCode).toBe(401);
  });

  it("returns an empty list with no surveys", async () => {
    const app = buildApp({ archives: [] });
    const response = await app.inject({ method: "GET", url: "/hq/galaxy/exploration", headers: { authorization: "Bearer player-1" } });
    expect(response.statusCode).toBe(200);
    expect(response.json().systems).toEqual([]);
  });

  it("returns a Surveyed snapshot for a scouted, non-owned territory", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    const galaxyExplorationStore = new InMemoryGalaxyExplorationStore();
    await galaxyExplorationStore.recordSurvey({ authUid: "uid-1", seasonId: "season-2", stability: 40, garrison: 60, surveyedAt: 5_000 });

    const app = buildApp({ archives: [], galaxyExplorationStore, authBindingStore });
    const response = await app.inject({ method: "GET", url: "/hq/galaxy/exploration", headers: { authorization: "Bearer player-1" } });

    expect(response.json().systems).toEqual([{ seasonId: "season-2", state: "SURVEYED", stability: 40, garrison: 60, surveyedAt: 5_000 }]);
  });

  it("excludes a survey of a territory the caller currently owns -- that's always fully known, not a separate charting fact", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    const galaxyExplorationStore = new InMemoryGalaxyExplorationStore();
    await galaxyExplorationStore.recordSurvey({ authUid: "uid-1", seasonId: "season-1", stability: 40, garrison: 60, surveyedAt: 5_000 });

    const app = buildApp({ archives: [wonArchive()], galaxyExplorationStore, authBindingStore });
    const response = await app.inject({ method: "GET", url: "/hq/galaxy/exploration", headers: { authorization: "Bearer player-1" } });

    expect(response.json().systems).toEqual([]);
  });
});
