// Outpost/Stipend tier surfacing on GET /hq/galaxy/me and GET /hq/galaxy --
// split out of galaxy-routes.test.ts, which is already at the repo's
// 500-line file cap (same reasoning as galaxy-routes-by-player.test.ts's
// own split, see its header comment).
import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";

import { registerGalaxyRoutes } from "./galaxy-routes.js";
import { InMemoryGalaxyPlanetStore } from "../galaxy-planet-store/galaxy-planet-store.js";
import { InMemoryGalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GatewayResolvedIdentity } from "../auth-identity/auth-identity.js";

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

const buildApp = (options: {
  archives: SeasonArchiveRow[];
  identityForToken?: (token: string | undefined) => GatewayResolvedIdentity | undefined;
  galaxyPlanetStore?: InMemoryGalaxyPlanetStore;
  galaxyEconomyStore?: InMemoryGalaxyEconomyStore;
  authBindingStore?: InMemoryGatewayAuthBindingStore;
  currentSeasonSummary?: Partial<CurrentSeasonSummary> & Pick<CurrentSeasonSummary, "seasonId" | "seasonSequence" | "status">;
}) => {
  const app = Fastify();
  registerGalaxyRoutes(app, {
    listSeasonArchives: async () => options.archives,
    ...(options.currentSeasonSummary
      ? { getCurrentSeasonSummary: async () => options.currentSeasonSummary as CurrentSeasonSummary }
      : {}),
    authenticateBearer: async (authorizationHeader) =>
      options.identityForToken?.(authorizationHeader) ?? undefined,
    galaxyPlanetStore: options.galaxyPlanetStore ?? new InMemoryGalaxyPlanetStore(),
    ...(options.galaxyEconomyStore ? { galaxyEconomyStore: options.galaxyEconomyStore } : {}),
    authBindingStore: options.authBindingStore ?? new InMemoryGatewayAuthBindingStore()
  });
  return app;
};

describe("galaxy routes — Outposts/Stipends", () => {
  it("surfaces an Outpost record for the owning account in /me, and as public territory in /hq/galaxy", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    await authBindingStore.bindIdentity({ uid: "uid-2", playerId: "player-2" });
    const runnerUpIdentity: GatewayResolvedIdentity = { playerId: "player-2", playerName: "Runner Up", authUid: "uid-2" };
    const app = buildApp({
      archives: [
        wonArchive({
          galaxyTiers: [{ playerId: "player-2", playerName: "Runner Up", tier: "OUTPOST", specialization: "EXTRACTION" }]
        })
      ],
      identityForToken: (auth) => (auth === "Bearer runner-token" ? runnerUpIdentity : undefined),
      authBindingStore
    });

    const meResponse = await app.inject({
      method: "GET",
      url: "/hq/galaxy/me",
      headers: { authorization: "Bearer runner-token" }
    });
    expect(meResponse.json().outposts).toEqual([
      {
        seasonId: "season-1",
        seasonSequence: 1,
        sectorNumber: 1,
        campaign: { kind: "FRONTIER" },
        tier: "OUTPOST",
        specialization: "EXTRACTION",
        awardedAt: 1_000,
        holderName: "Runner Up"
      }
    ]);
    expect(meResponse.json().stipends).toEqual([]);

    const publicResponse = await app.inject({ method: "GET", url: "/hq/galaxy" });
    expect(publicResponse.json().outposts).toEqual([
      {
        seasonId: "season-1",
        seasonSequence: 1,
        sectorNumber: 1,
        campaign: { kind: "FRONTIER" },
        tier: "OUTPOST",
        specialization: "EXTRACTION",
        awardedAt: 1_000,
        holderName: "Runner Up"
      }
    ]);
  });

  it("surfaces a Stipend record for the owning account in /me only (not the public listing)", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    await authBindingStore.bindIdentity({ uid: "uid-3", playerId: "player-3" });
    const bystanderIdentity: GatewayResolvedIdentity = { playerId: "player-3", playerName: "Bystander", authUid: "uid-3" };
    const app = buildApp({
      archives: [
        wonArchive({
          galaxyTiers: [{ playerId: "player-3", playerName: "Bystander", tier: "STIPEND", influence: 9, production: 36 }]
        })
      ],
      identityForToken: (auth) => (auth === "Bearer bystander-token" ? bystanderIdentity : undefined),
      authBindingStore
    });

    const meResponse = await app.inject({
      method: "GET",
      url: "/hq/galaxy/me",
      headers: { authorization: "Bearer bystander-token" }
    });
    expect(meResponse.json().stipends).toEqual([
      {
        seasonId: "season-1",
        seasonSequence: 1,
        sectorNumber: 1,
        campaign: { kind: "FRONTIER" },
        tier: "STIPEND",
        awardedAt: 1_000,
        influence: 9,
        production: 36
      }
    ]);
    expect(meResponse.json().outposts).toEqual([]);

    const publicResponse = await app.inject({ method: "GET", url: "/hq/galaxy" });
    expect(publicResponse.json().outposts).toEqual([]);
  });

  it("does not leak another account's Outpost/Stipend records into /me", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    await authBindingStore.bindIdentity({ uid: "uid-2", playerId: "player-2" });
    const winnerIdentity: GatewayResolvedIdentity = { playerId: "player-1", playerName: "Nauticus", authUid: "uid-1" };
    const app = buildApp({
      archives: [
        wonArchive({
          galaxyTiers: [{ playerId: "player-2", playerName: "Runner Up", tier: "OUTPOST", specialization: "EXTRACTION" }]
        })
      ],
      identityForToken: (auth) => (auth === "Bearer good-token" ? winnerIdentity : undefined),
      authBindingStore
    });

    const meResponse = await app.inject({
      method: "GET",
      url: "/hq/galaxy/me",
      headers: { authorization: "Bearer good-token" }
    });
    expect(meResponse.json().outposts).toEqual([]);
    expect(meResponse.json().stipends).toEqual([]);
  });

  it("labels a Stipend earned in a Defense Campaign season as a Contestation of its target's Sector, not a fresh Frontier claim", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    await authBindingStore.bindIdentity({ uid: "uid-3", playerId: "player-3" });
    const bystanderIdentity: GatewayResolvedIdentity = { playerId: "player-3", playerName: "Bystander", authUid: "uid-3" };
    const app = buildApp({
      archives: [
        wonArchive(),
        wonArchive({
          seasonId: "season-dc",
          seasonSequence: 5,
          defenseCampaignTargetSeasonId: "season-1",
          galaxyTiers: [{ playerId: "player-3", playerName: "Bystander", tier: "STIPEND", influence: 2, production: 3 }]
        })
      ],
      identityForToken: (auth) => (auth === "Bearer bystander-token" ? bystanderIdentity : undefined),
      authBindingStore
    });

    const meResponse = await app.inject({
      method: "GET",
      url: "/hq/galaxy/me",
      headers: { authorization: "Bearer bystander-token" }
    });
    expect(meResponse.json().stipends).toEqual([
      {
        seasonId: "season-dc",
        seasonSequence: 5,
        sectorNumber: 1,
        campaign: { kind: "CONTESTATION", ordinal: 1 },
        tier: "STIPEND",
        awardedAt: 1_000,
        influence: 2,
        production: 3
      }
    ]);
  });
});
