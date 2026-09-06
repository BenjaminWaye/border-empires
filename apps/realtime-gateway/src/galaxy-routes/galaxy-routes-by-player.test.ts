// GET /hq/galaxy/by-player/:playerId -- the public, unauthenticated route the
// player profile page (client-player-profile.ts) uses to show any player's
// galactic holdings. Split into its own file rather than added to
// galaxy-routes.test.ts, which is already at the repo's 500-line file cap.
import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { SeasonArchiveRow } from "@border-empires/sim-protocol";

import { registerGalaxyRoutes } from "./galaxy-routes.js";
import { InMemoryGalaxyPlanetStore } from "../galaxy-planet-store/galaxy-planet-store.js";
import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";

const wonArchive = (overrides: Partial<SeasonArchiveRow> = {}): SeasonArchiveRow => ({
  seasonId: "season-1",
  seasonSequence: 1,
  endedAt: 1_000,
  updatedAt: 1_000,
  winner: {
    playerId: "player-1",
    playerName: "Nauticus",
    crownedAt: 1_000,
    objectiveId: "DIPLOMATIC_DOMINANCE",
    objectiveName: "Diplomatic Dominance"
  },
  mostTerritory: [],
  mostPoints: [],
  longestSurvivalMs: [],
  replayEvents: [],
  ...overrides
});

const buildApp = (options: { archives: SeasonArchiveRow[]; authBindingStore?: InMemoryGatewayAuthBindingStore }) => {
  const app = Fastify();
  registerGalaxyRoutes(app, {
    listSeasonArchives: async () => options.archives,
    authenticateBearer: async () => undefined,
    galaxyPlanetStore: new InMemoryGalaxyPlanetStore(),
    authBindingStore: options.authBindingStore ?? new InMemoryGatewayAuthBindingStore()
  });
  return app;
};

describe("GET /hq/galaxy/by-player/:playerId", () => {
  it("surfaces that player's Planet publicly, unauthenticated", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    const app = buildApp({ archives: [wonArchive()], authBindingStore });

    const response = await app.inject({ method: "GET", url: "/hq/galaxy/by-player/player-1" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      planets: [
        {
          seasonId: "season-1",
          seasonSequence: 1,
          tier: "PLANET",
          objectiveName: "Diplomatic Dominance",
          specialization: "CAPITAL",
          crownedAt: 1_000,
          claimed: false,
          planetName: null
        }
      ],
      outposts: [],
      trophyCase: [{ objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance", count: 1 }]
    });
  });

  it("surfaces that player's Outpost", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    await authBindingStore.bindIdentity({ uid: "uid-2", playerId: "player-2" });
    const app = buildApp({
      archives: [
        wonArchive({
          galaxyTiers: [{ playerId: "player-2", playerName: "Runner Up", tier: "OUTPOST", specialization: "EXTRACTION" }]
        })
      ],
      authBindingStore
    });

    const response = await app.inject({ method: "GET", url: "/hq/galaxy/by-player/player-2" });

    expect(response.json()).toEqual({
      planets: [],
      outposts: [
        { seasonId: "season-1", seasonSequence: 1, tier: "OUTPOST", specialization: "EXTRACTION", awardedAt: 1_000, holderName: "Runner Up" }
      ],
      trophyCase: []
    });
  });

  it("returns empty lists for a player with no auth binding (e.g. an AI)", async () => {
    const app = buildApp({ archives: [wonArchive()] });
    const response = await app.inject({ method: "GET", url: "/hq/galaxy/by-player/player-1" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ planets: [], outposts: [], trophyCase: [] });
  });

  it("does not leak another player's Planet", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    await authBindingStore.bindIdentity({ uid: "uid-2", playerId: "player-2" });
    const app = buildApp({ archives: [wonArchive()], authBindingStore });

    const response = await app.inject({ method: "GET", url: "/hq/galaxy/by-player/player-2" });
    expect(response.json()).toEqual({ planets: [], outposts: [], trophyCase: [] });
  });

  it("counts multiple wins of the same victory condition across seasons, and keeps counting a win even after the Planet transfers away via a Defense Campaign", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    await authBindingStore.bindIdentity({ uid: "uid-2", playerId: "player-2" });
    const app = buildApp({
      archives: [
        wonArchive({ seasonId: "season-1", seasonSequence: 1 }),
        wonArchive({
          seasonId: "season-2",
          seasonSequence: 2,
          winner: { playerId: "player-1", playerName: "Nauticus", crownedAt: 2_000, objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance" }
        }),
        // A Defense Campaign season that re-won season-1's territory for player-2 --
        // player-1's original win still counts toward the trophy case.
        wonArchive({
          seasonId: "season-3",
          seasonSequence: 3,
          defenseCampaignTargetSeasonId: "season-1",
          winner: { playerId: "player-2", playerName: "Runner Up", crownedAt: 3_000, objectiveId: "TOWN_CONTROL", objectiveName: "Town Control" }
        })
      ],
      authBindingStore
    });

    const response = await app.inject({ method: "GET", url: "/hq/galaxy/by-player/player-1" });
    expect(response.json().trophyCase).toEqual([
      { objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance", count: 2 }
    ]);
  });

  it("counts different victory conditions as separate trophy-case entries, most-won first", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    const app = buildApp({
      archives: [
        wonArchive({ seasonId: "season-1", seasonSequence: 1 }),
        wonArchive({
          seasonId: "season-2",
          seasonSequence: 2,
          winner: { playerId: "player-1", playerName: "Nauticus", crownedAt: 2_000, objectiveId: "TOWN_CONTROL", objectiveName: "Town Control" }
        }),
        wonArchive({
          seasonId: "season-3",
          seasonSequence: 3,
          winner: { playerId: "player-1", playerName: "Nauticus", crownedAt: 3_000, objectiveId: "TOWN_CONTROL", objectiveName: "Town Control" }
        })
      ],
      authBindingStore
    });

    const response = await app.inject({ method: "GET", url: "/hq/galaxy/by-player/player-1" });
    expect(response.json().trophyCase).toEqual([
      { objectiveId: "TOWN_CONTROL", objectiveName: "Town Control", count: 2 },
      { objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance", count: 1 }
    ]);
  });
});
