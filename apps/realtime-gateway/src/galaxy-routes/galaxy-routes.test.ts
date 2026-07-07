import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";

import { registerGalaxyRoutes } from "./galaxy-routes.js";
import { InMemoryGalaxyPlanetStore } from "../galaxy-planet-store/galaxy-planet-store.js";
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
    objectiveId: "conquest",
    objectiveName: "Conquest"
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
    authBindingStore: options.authBindingStore ?? new InMemoryGatewayAuthBindingStore()
  });
  return app;
};

const winnerIdentity: GatewayResolvedIdentity = {
  playerId: "player-1",
  playerName: "Nauticus",
  authUid: "uid-1"
};

describe("galaxy routes", () => {
  it("GET /hq/galaxy/me returns the season the caller won, unnamed", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    const app = buildApp({
      archives: [wonArchive()],
      identityForToken: (auth) => (auth === "Bearer good-token" ? winnerIdentity : undefined),
      authBindingStore
    });

    const response = await app.inject({
      method: "GET",
      url: "/hq/galaxy/me",
      headers: { authorization: "Bearer good-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      planets: [
        {
          seasonId: "season-1",
          seasonSequence: 1,
          objectiveName: "Conquest",
          crownedAt: 1_000,
          planetName: null,
          named: false
        }
      ]
    });
  });

  it("GET /hq/galaxy/me returns 401 without a bearer token", async () => {
    const app = buildApp({ archives: [wonArchive()] });
    const response = await app.inject({ method: "GET", url: "/hq/galaxy/me" });
    expect(response.statusCode).toBe(401);
  });

  it("christens a planet, then rejects a second christening with 409", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    const app = buildApp({
      archives: [wonArchive()],
      identityForToken: (auth) => (auth === "Bearer good-token" ? winnerIdentity : undefined),
      authBindingStore
    });

    const first = await app.inject({
      method: "POST",
      url: "/hq/galaxy/planets/season-1/name",
      headers: { authorization: "Bearer good-token" },
      payload: { planetName: "Aethelgard" }
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({
      ok: true,
      planet: { seasonId: "season-1", ownerAuthUid: "uid-1", planetName: "Aethelgard", namedAt: expect.any(Number) }
    });

    const second = await app.inject({
      method: "POST",
      url: "/hq/galaxy/planets/season-1/name",
      headers: { authorization: "Bearer good-token" },
      payload: { planetName: "New Terra" }
    });
    expect(second.statusCode).toBe(409);
  });

  it("rejects christening by a non-winner with 403", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    await authBindingStore.bindIdentity({ uid: "uid-2", playerId: "player-2" });
    const impostorIdentity: GatewayResolvedIdentity = { playerId: "player-2", playerName: "Impostor", authUid: "uid-2" };
    const app = buildApp({
      archives: [wonArchive()],
      identityForToken: (auth) => (auth === "Bearer impostor-token" ? impostorIdentity : undefined),
      authBindingStore
    });

    const response = await app.inject({
      method: "POST",
      url: "/hq/galaxy/planets/season-1/name",
      headers: { authorization: "Bearer impostor-token" },
      payload: { planetName: "Aethelgard" }
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects a profane planet name with 400", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    const app = buildApp({
      archives: [wonArchive()],
      identityForToken: (auth) => (auth === "Bearer good-token" ? winnerIdentity : undefined),
      authBindingStore
    });

    const response = await app.inject({
      method: "POST",
      url: "/hq/galaxy/planets/season-1/name",
      headers: { authorization: "Bearer good-token" },
      payload: { planetName: "shitworld" }
    });
    expect(response.statusCode).toBe(400);
  });

  it("omits an AI-won season (no auth binding) from /me and shows it unclaimed in the public list", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    const app = buildApp({
      archives: [wonArchive({ seasonId: "season-ai", winner: { playerId: "ai-player-1", playerName: "Barbarian King", crownedAt: 1_000, objectiveId: "conquest", objectiveName: "Conquest" } })],
      identityForToken: (auth) => (auth === "Bearer good-token" ? winnerIdentity : undefined),
      authBindingStore
    });

    const meResponse = await app.inject({
      method: "GET",
      url: "/hq/galaxy/me",
      headers: { authorization: "Bearer good-token" }
    });
    expect(meResponse.json()).toEqual({ planets: [] });

    const publicResponse = await app.inject({ method: "GET", url: "/hq/galaxy" });
    expect(publicResponse.json()).toEqual({
      planets: [
        {
          seasonId: "season-ai",
          seasonSequence: 1,
          objectiveName: "Conquest",
          crownedAt: 1_000,
          claimed: false,
          planetName: null
        }
      ]
    });
  });

  it("shows a crowned-but-not-yet-archived season (still on the season-end screen) in /me", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    const app = buildApp({
      archives: [],
      identityForToken: (auth) => (auth === "Bearer good-token" ? winnerIdentity : undefined),
      authBindingStore,
      currentSeasonSummary: {
        seasonId: "season-pending",
        seasonSequence: 2,
        status: "ended",
        seasonWinner: {
          playerId: "player-1",
          playerName: "Nauticus",
          crownedAt: 2_000,
          objectiveId: "conquest",
          objectiveName: "Conquest"
        }
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/hq/galaxy/me",
      headers: { authorization: "Bearer good-token" }
    });

    expect(response.json()).toEqual({
      planets: [
        {
          seasonId: "season-pending",
          seasonSequence: 2,
          objectiveName: "Conquest",
          crownedAt: 2_000,
          planetName: null,
          named: false
        }
      ]
    });
  });

  it("allows christening a crowned-but-not-yet-archived season, and stops surfacing it as pending once it is archived", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    const currentSeasonSummary = {
      seasonId: "season-pending",
      seasonSequence: 2,
      status: "ended" as const,
      seasonWinner: {
        playerId: "player-1",
        playerName: "Nauticus",
        crownedAt: 2_000,
        objectiveId: "conquest",
        objectiveName: "Conquest"
      }
    };
    const app = buildApp({
      archives: [],
      identityForToken: (auth) => (auth === "Bearer good-token" ? winnerIdentity : undefined),
      authBindingStore,
      currentSeasonSummary
    });

    const christen = await app.inject({
      method: "POST",
      url: "/hq/galaxy/planets/season-pending/name",
      headers: { authorization: "Bearer good-token" },
      payload: { planetName: "Aethelgard" }
    });
    expect(christen.statusCode).toBe(200);
  });

  it("does not double-count a season once it has been archived, even if the current summary still reports it", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    const app = buildApp({
      archives: [wonArchive({ seasonId: "season-1" })],
      identityForToken: (auth) => (auth === "Bearer good-token" ? winnerIdentity : undefined),
      authBindingStore,
      currentSeasonSummary: {
        seasonId: "season-1",
        seasonSequence: 1,
        status: "ended",
        seasonWinner: {
          playerId: "player-1",
          playerName: "Nauticus",
          crownedAt: 1_000,
          objectiveId: "conquest",
          objectiveName: "Conquest"
        }
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/hq/galaxy/me",
      headers: { authorization: "Bearer good-token" }
    });
    expect(response.json().planets).toHaveLength(1);
  });
});
