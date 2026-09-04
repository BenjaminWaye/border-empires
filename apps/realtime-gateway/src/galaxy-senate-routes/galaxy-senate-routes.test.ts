import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { SeasonArchiveRow } from "@border-empires/sim-protocol";

import { registerGalaxySenateRoutes } from "./galaxy-senate-routes.js";
import { InMemoryGalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import { InMemoryGalaxySenateStore } from "../galaxy-senate-store/galaxy-senate-store.js";
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
  "player-1": { playerId: "player-1", playerName: "Nauticus", authUid: "uid-1" },
  "player-2": { playerId: "player-2", playerName: "Rival", authUid: "uid-2" }
};

const buildApp = (options: { archives: SeasonArchiveRow[]; galaxyEconomyStore?: InMemoryGalaxyEconomyStore; galaxySenateStore?: InMemoryGalaxySenateStore; authBindingStore?: InMemoryGatewayAuthBindingStore }) => {
  const app = Fastify();
  registerGalaxySenateRoutes(app, {
    listSeasonArchives: async () => options.archives,
    authenticateBearer: async (auth) => {
      const token = auth?.replace(/^Bearer /, "");
      return token ? identities[token] : undefined;
    },
    authBindingStore: options.authBindingStore ?? new InMemoryGatewayAuthBindingStore(),
    galaxyEconomyStore: options.galaxyEconomyStore ?? new InMemoryGalaxyEconomyStore(),
    galaxySenateStore: options.galaxySenateStore ?? new InMemoryGalaxySenateStore()
  });
  return app;
};

const bindBoth = async (authBindingStore: InMemoryGatewayAuthBindingStore): Promise<void> => {
  await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
  await authBindingStore.bindIdentity({ uid: "uid-2", playerId: "player-2" });
};

describe("POST /hq/galaxy/senate/propose", () => {
  it("401s with no bearer identity", async () => {
    const app = buildApp({ archives: [] });
    const response = await app.inject({ method: "POST", url: "/hq/galaxy/senate/propose", payload: { type: "EMBARGO", targetSeasonId: "season-1" } });
    expect(response.statusCode).toBe(401);
  });

  it("400s on an invalid type or missing targetSeasonId", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await bindBoth(authBindingStore);
    const app = buildApp({ archives: [wonArchive(), wonArchive({ seasonId: "season-2", winner: { playerId: "player-2", playerName: "Rival", crownedAt: 1000, objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance" } })], authBindingStore });

    const badType = await app.inject({ method: "POST", url: "/hq/galaxy/senate/propose", headers: { authorization: "Bearer player-1" }, payload: { type: "NUKE", targetSeasonId: "season-2" } });
    expect(badType.statusCode).toBe(400);

    const noTarget = await app.inject({ method: "POST", url: "/hq/galaxy/senate/propose", headers: { authorization: "Bearer player-1" }, payload: { type: "EMBARGO" } });
    expect(noTarget.statusCode).toBe(400);
  });

  it("403s a proposer who holds no Planet", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await bindBoth(authBindingStore);
    // Only player-2 has a won season (a Planet); player-1 holds nothing.
    const app = buildApp({
      archives: [wonArchive({ seasonId: "season-2", winner: { playerId: "player-2", playerName: "Rival", crownedAt: 1000, objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance" } })],
      authBindingStore
    });

    const response = await app.inject({ method: "POST", url: "/hq/galaxy/senate/propose", headers: { authorization: "Bearer player-1" }, payload: { type: "EMBARGO", targetSeasonId: "season-2" } });
    expect(response.statusCode).toBe(403);
  });

  it("404s when targetSeasonId isn't a currently held territory", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await bindBoth(authBindingStore);
    const app = buildApp({ archives: [wonArchive()], authBindingStore });

    const response = await app.inject({ method: "POST", url: "/hq/galaxy/senate/propose", headers: { authorization: "Bearer player-1" }, payload: { type: "EMBARGO", targetSeasonId: "does-not-exist" } });
    expect(response.statusCode).toBe(404);
  });

  it("402s when the proposer can't afford the action's Influence cost", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await bindBoth(authBindingStore);
    const archives = [wonArchive(), wonArchive({ seasonId: "season-2", winner: { playerId: "player-2", playerName: "Rival", crownedAt: 1000, objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance" } })];
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    await galaxyEconomyStore.upsertBalance({ authUid: "uid-1", influence: 5, production: 0, lastCycleAt: 0 }); // EMBARGO costs 15
    const app = buildApp({ archives, authBindingStore, galaxyEconomyStore });

    const response = await app.inject({ method: "POST", url: "/hq/galaxy/senate/propose", headers: { authorization: "Bearer player-1" }, payload: { type: "EMBARGO", targetSeasonId: "season-2" } });
    expect(response.statusCode).toBe(402);
  });

  it("succeeds, deducts the Influence cost, and creates a PENDING proposal", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await bindBoth(authBindingStore);
    const archives = [wonArchive(), wonArchive({ seasonId: "season-2", winner: { playerId: "player-2", playerName: "Rival", crownedAt: 1000, objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance" } })];
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    await galaxyEconomyStore.upsertBalance({ authUid: "uid-1", influence: 100, production: 0, lastCycleAt: 0 });
    const app = buildApp({ archives, authBindingStore, galaxyEconomyStore });

    const response = await app.inject({ method: "POST", url: "/hq/galaxy/senate/propose", headers: { authorization: "Bearer player-1" }, payload: { type: "EMBARGO", targetSeasonId: "season-2" } });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.proposal.status).toBe("PENDING");
    expect(body.proposal.targetAuthUid).toBe("uid-2");

    await expect(galaxyEconomyStore.getBalance("uid-1")).resolves.toMatchObject({ influence: 85 }); // 100 - 15
  });

  it("409s when the target is still on cooldown from a recently resolved proposal of the same type", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await bindBoth(authBindingStore);
    const archives = [wonArchive(), wonArchive({ seasonId: "season-2", winner: { playerId: "player-2", playerName: "Rival", crownedAt: 1000, objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance" } })];
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    await galaxyEconomyStore.upsertBalance({ authUid: "uid-1", influence: 100, production: 0, lastCycleAt: 0 });
    const galaxySenateStore = new InMemoryGalaxySenateStore();
    const priorProposal = await galaxySenateStore.createProposal({ type: "EMBARGO", proposerAuthUid: "uid-1", targetAuthUid: "uid-2", createdAt: 0, createdAtCycleIndex: 0 });
    await galaxySenateStore.resolveProposal(priorProposal.id, { status: "FAILED", resolvedAt: Date.now() }); // resolved "now" -- still within EMBARGO's 1-Cycle cooldown

    const app = buildApp({ archives, authBindingStore, galaxyEconomyStore, galaxySenateStore });
    const response = await app.inject({ method: "POST", url: "/hq/galaxy/senate/propose", headers: { authorization: "Bearer player-1" }, payload: { type: "EMBARGO", targetSeasonId: "season-2" } });
    expect(response.statusCode).toBe(409);
  });
});

describe("POST /hq/galaxy/senate/vote", () => {
  it("404s a nonexistent proposal", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await bindBoth(authBindingStore);
    const app = buildApp({ archives: [wonArchive()], authBindingStore });
    const response = await app.inject({ method: "POST", url: "/hq/galaxy/senate/vote", headers: { authorization: "Bearer player-1" }, payload: { proposalId: "nope" } });
    expect(response.statusCode).toBe(404);
  });

  it("casts a vote with the caller's real Dominion weight, and rejects a second vote on the same proposal", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await bindBoth(authBindingStore);
    const archives = [wonArchive(), wonArchive({ seasonId: "season-2", winner: { playerId: "player-2", playerName: "Rival", crownedAt: 1000, objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance" } })];
    const galaxySenateStore = new InMemoryGalaxySenateStore();
    const proposal = await galaxySenateStore.createProposal({ type: "EMBARGO", proposerAuthUid: "uid-2", targetAuthUid: "uid-1", createdAt: 0, createdAtCycleIndex: 0 });
    const app = buildApp({ archives, authBindingStore, galaxySenateStore });

    const first = await app.inject({ method: "POST", url: "/hq/galaxy/senate/vote", headers: { authorization: "Bearer player-1" }, payload: { proposalId: proposal.id } });
    expect(first.statusCode).toBe(200);
    // 1 Planet (10) + 100 Stability / 100 (1) = 11.
    expect(first.json().weight).toBe(11);

    const second = await app.inject({ method: "POST", url: "/hq/galaxy/senate/vote", headers: { authorization: "Bearer player-1" }, payload: { proposalId: proposal.id } });
    expect(second.statusCode).toBe(409);
  });

  it("403s a voter who holds no territory at all", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await bindBoth(authBindingStore);
    // Only player-2 holds anything.
    const archives = [wonArchive({ winner: { playerId: "player-2", playerName: "Rival", crownedAt: 1000, objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance" } })];
    const galaxySenateStore = new InMemoryGalaxySenateStore();
    const proposal = await galaxySenateStore.createProposal({ type: "EMBARGO", proposerAuthUid: "uid-2", targetAuthUid: "uid-2", createdAt: 0, createdAtCycleIndex: 0 });

    const app = buildApp({ archives, authBindingStore, galaxySenateStore });
    const response = await app.inject({ method: "POST", url: "/hq/galaxy/senate/vote", headers: { authorization: "Bearer player-1" }, payload: { proposalId: proposal.id } });
    expect(response.statusCode).toBe(403);
  });
});

describe("GET /hq/galaxy/senate", () => {
  it("lists recent proposals", async () => {
    const galaxySenateStore = new InMemoryGalaxySenateStore();
    await galaxySenateStore.createProposal({ type: "CONTEST", proposerAuthUid: "uid-1", targetAuthUid: "uid-2", targetSeasonId: "season-2", createdAt: 1, createdAtCycleIndex: 0 });
    const app = buildApp({ archives: [], galaxySenateStore });

    const response = await app.inject({ method: "GET", url: "/hq/galaxy/senate" });
    expect(response.statusCode).toBe(200);
    expect(response.json().proposals).toHaveLength(1);
  });
});
