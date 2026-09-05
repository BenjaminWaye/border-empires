import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import type { SeasonArchiveRow } from "@border-empires/sim-protocol";

import { registerGalaxyFleetRoutes } from "./galaxy-fleet-routes.js";
import { InMemoryGalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import { InMemoryGalaxyFleetStore } from "../galaxy-fleet-store/galaxy-fleet-store.js";
import { InMemoryGalaxyBattleLogStore } from "../galaxy-battle-log-store/galaxy-battle-log-store.js";
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

const buildApp = (options: {
  archives: SeasonArchiveRow[];
  galaxyEconomyStore?: InMemoryGalaxyEconomyStore;
  galaxyFleetStore?: InMemoryGalaxyFleetStore;
  galaxyBattleLogStore?: InMemoryGalaxyBattleLogStore;
  authBindingStore?: InMemoryGatewayAuthBindingStore;
  now?: () => number;
}) => {
  const app = Fastify();
  registerGalaxyFleetRoutes(app, {
    listSeasonArchives: async () => options.archives,
    authenticateBearer: async (auth) => {
      const token = auth?.replace(/^Bearer /, "");
      return token ? identities[token] : undefined;
    },
    authBindingStore: options.authBindingStore ?? new InMemoryGatewayAuthBindingStore(),
    galaxyEconomyStore: options.galaxyEconomyStore ?? new InMemoryGalaxyEconomyStore(),
    galaxyFleetStore: options.galaxyFleetStore ?? new InMemoryGalaxyFleetStore(),
    galaxyBattleLogStore: options.galaxyBattleLogStore ?? new InMemoryGalaxyBattleLogStore(),
    ...(options.now ? { now: options.now } : {})
  });
  return app;
};

const bindBoth = async (authBindingStore: InMemoryGatewayAuthBindingStore): Promise<void> => {
  await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
  await authBindingStore.bindIdentity({ uid: "uid-2", playerId: "player-2" });
};

describe("POST /hq/galaxy/fleets/blueprints", () => {
  it("401s with no bearer identity", async () => {
    const app = buildApp({ archives: [] });
    const response = await app.inject({ method: "POST", url: "/hq/galaxy/fleets/blueprints", payload: { name: "x", composition: { RAIDER: 1 }, weaponEmphasis: "KINETIC" } });
    expect(response.statusCode).toBe(401);
  });

  it("400s on an invalid composition", async () => {
    const app = buildApp({ archives: [] });
    const response = await app.inject({
      method: "POST",
      url: "/hq/galaxy/fleets/blueprints",
      headers: { authorization: "Bearer player-1" },
      payload: { name: "x", composition: { RAIDER: -1 }, weaponEmphasis: "KINETIC" }
    });
    expect(response.statusCode).toBe(400);
  });

  it("saves a blueprint and lists it back", async () => {
    const app = buildApp({ archives: [] });
    const saveResponse = await app.inject({
      method: "POST",
      url: "/hq/galaxy/fleets/blueprints",
      headers: { authorization: "Bearer player-1" },
      payload: { name: "Strike Force", composition: { RAIDER: 2 }, weaponEmphasis: "KINETIC" }
    });
    expect(saveResponse.statusCode).toBe(200);

    const listResponse = await app.inject({ method: "GET", url: "/hq/galaxy/fleets/blueprints", headers: { authorization: "Bearer player-1" } });
    expect(listResponse.json().blueprints).toHaveLength(1);
    expect(listResponse.json().blueprints[0].name).toBe("Strike Force");
  });
});

describe("DELETE /hq/galaxy/fleets/blueprints/:id", () => {
  it("only lets the owner delete their own blueprint", async () => {
    const galaxyFleetStore = new InMemoryGalaxyFleetStore();
    const blueprint = await galaxyFleetStore.saveBlueprint({ ownerAuthUid: "uid-1", name: "Mine", composition: { RAIDER: 1 }, weaponEmphasis: "KINETIC", createdAt: 0 });
    const app = buildApp({ archives: [], galaxyFleetStore });

    await app.inject({ method: "DELETE", url: `/hq/galaxy/fleets/blueprints/${blueprint.id}`, headers: { authorization: "Bearer player-2" } });
    expect(await galaxyFleetStore.listBlueprints("uid-1")).toHaveLength(1);

    await app.inject({ method: "DELETE", url: `/hq/galaxy/fleets/blueprints/${blueprint.id}`, headers: { authorization: "Bearer player-1" } });
    expect(await galaxyFleetStore.listBlueprints("uid-1")).toHaveLength(0);
  });
});

describe("POST /hq/galaxy/fleets/send", () => {
  it("404s when targetSeasonId isn't a currently held territory", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await bindBoth(authBindingStore);
    const app = buildApp({ archives: [wonArchive()], authBindingStore });

    const response = await app.inject({
      method: "POST",
      url: "/hq/galaxy/fleets/send",
      headers: { authorization: "Bearer player-1" },
      payload: { targetSeasonId: "does-not-exist", composition: { RAIDER: 1 }, weaponEmphasis: "KINETIC" }
    });
    expect(response.statusCode).toBe(404);
  });

  it("402s when the sender can't afford the composition's Production cost", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await bindBoth(authBindingStore);
    const archives = [wonArchive({ seasonId: "season-2", winner: { playerId: "player-2", playerName: "Rival", crownedAt: 1000, objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance" } })];
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    await galaxyEconomyStore.upsertBalance({ authUid: "uid-1", influence: 0, production: 10, lastCycleAt: 0 }); // Raider costs 80
    const app = buildApp({ archives, authBindingStore, galaxyEconomyStore });

    const response = await app.inject({
      method: "POST",
      url: "/hq/galaxy/fleets/send",
      headers: { authorization: "Bearer player-1" },
      payload: { targetSeasonId: "season-2", composition: { RAIDER: 1 }, weaponEmphasis: "KINETIC" }
    });
    expect(response.statusCode).toBe(402);
  });

  it("succeeds, deducts Production, and creates a TRAVELING order with the target's authUid resolved", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await bindBoth(authBindingStore);
    const archives = [wonArchive({ seasonId: "season-2", winner: { playerId: "player-2", playerName: "Rival", crownedAt: 1000, objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance" } })];
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    await galaxyEconomyStore.upsertBalance({ authUid: "uid-1", influence: 0, production: 500, lastCycleAt: 0 });
    const app = buildApp({ archives, authBindingStore, galaxyEconomyStore, now: () => 1_000 });

    const response = await app.inject({
      method: "POST",
      url: "/hq/galaxy/fleets/send",
      headers: { authorization: "Bearer player-1" },
      payload: { targetSeasonId: "season-2", composition: { RAIDER: 1 }, weaponEmphasis: "KINETIC" }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.order.status).toBe("TRAVELING");
    expect(body.order.targetAuthUid).toBe("uid-2");
    expect(body.order.sentAt).toBe(1_000);
    expect(body.order.arrivesAt).toBeGreaterThan(1_000);

    await expect(galaxyEconomyStore.getBalance("uid-1")).resolves.toMatchObject({ production: 420 }); // 500 - 80
  });

  it("does not deduct Production if creating the order fails", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await bindBoth(authBindingStore);
    const archives = [wonArchive({ seasonId: "season-2", winner: { playerId: "player-2", playerName: "Rival", crownedAt: 1000, objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance" } })];
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    await galaxyEconomyStore.upsertBalance({ authUid: "uid-1", influence: 0, production: 500, lastCycleAt: 0 });
    const galaxyFleetStore = new InMemoryGalaxyFleetStore();
    vi.spyOn(galaxyFleetStore, "createOrder").mockRejectedValue(new Error("store unavailable"));
    const app = buildApp({ archives, authBindingStore, galaxyEconomyStore, galaxyFleetStore });

    const response = await app.inject({
      method: "POST",
      url: "/hq/galaxy/fleets/send",
      headers: { authorization: "Bearer player-1" },
      payload: { targetSeasonId: "season-2", composition: { RAIDER: 1 }, weaponEmphasis: "KINETIC" }
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(500);
    await expect(galaxyEconomyStore.getBalance("uid-1")).resolves.toMatchObject({ production: 500 });
  });
});

describe("GET /hq/galaxy/fleets", () => {
  it("lists only the caller's own orders", async () => {
    const galaxyFleetStore = new InMemoryGalaxyFleetStore();
    await galaxyFleetStore.createOrder({ ownerAuthUid: "uid-1", targetAuthUid: "uid-2", targetSeasonId: "season-1", composition: { RAIDER: 1 }, weaponEmphasis: "KINETIC", sentAt: 0, arrivesAt: 1 });
    await galaxyFleetStore.createOrder({ ownerAuthUid: "uid-2", targetAuthUid: "uid-1", targetSeasonId: "season-2", composition: { RAIDER: 1 }, weaponEmphasis: "KINETIC", sentAt: 0, arrivesAt: 1 });
    const app = buildApp({ archives: [], galaxyFleetStore });

    const response = await app.inject({ method: "GET", url: "/hq/galaxy/fleets", headers: { authorization: "Bearer player-1" } });
    expect(response.json().orders).toHaveLength(1);
    expect(response.json().orders[0].targetSeasonId).toBe("season-1");
  });
});

describe("GET /hq/galaxy/fleets/log", () => {
  it("lists the public battle log with no auth required", async () => {
    const galaxyBattleLogStore = new InMemoryGalaxyBattleLogStore();
    await galaxyBattleLogStore.recordRaid({ attackerAuthUid: "uid-1", defenderAuthUid: "uid-2", targetSeasonId: "season-1", reconOnly: false, damageDealt: 200, netDamage: 100, stabilityAfter: 0, resolvedAt: 1 });
    const app = buildApp({ archives: [], galaxyBattleLogStore });

    const response = await app.inject({ method: "GET", url: "/hq/galaxy/fleets/log" });
    expect(response.statusCode).toBe(200);
    expect(response.json().entries).toHaveLength(1);
  });
});

describe("POST /hq/galaxy/garrison/invest", () => {
  it("404s a seasonId the caller doesn't hold", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await bindBoth(authBindingStore);
    const app = buildApp({ archives: [wonArchive()], authBindingStore });

    const response = await app.inject({ method: "POST", url: "/hq/galaxy/garrison/invest", headers: { authorization: "Bearer player-1" }, payload: { seasonId: "does-not-exist", amount: 50 } });
    expect(response.statusCode).toBe(404);
  });

  it("402s when the caller can't afford the investment", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await bindBoth(authBindingStore);
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    await galaxyEconomyStore.upsertBalance({ authUid: "uid-1", influence: 0, production: 10, lastCycleAt: 0 });
    const app = buildApp({ archives: [wonArchive()], authBindingStore, galaxyEconomyStore });

    const response = await app.inject({ method: "POST", url: "/hq/galaxy/garrison/invest", headers: { authorization: "Bearer player-1" }, payload: { seasonId: "season-1", amount: 50 } });
    expect(response.statusCode).toBe(402);
  });

  it("succeeds, deducts Production, and increases the territory's Garrison", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await bindBoth(authBindingStore);
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    await galaxyEconomyStore.upsertBalance({ authUid: "uid-1", influence: 0, production: 200, lastCycleAt: 0 });
    const app = buildApp({ archives: [wonArchive()], authBindingStore, galaxyEconomyStore });

    const response = await app.inject({ method: "POST", url: "/hq/galaxy/garrison/invest", headers: { authorization: "Bearer player-1" }, payload: { seasonId: "season-1", amount: 150 } });
    expect(response.statusCode).toBe(200);
    expect(response.json().territory.garrison).toBe(150);

    await expect(galaxyEconomyStore.getBalance("uid-1")).resolves.toMatchObject({ production: 50 });
  });

  it("accumulates across multiple investments", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await bindBoth(authBindingStore);
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    await galaxyEconomyStore.upsertBalance({ authUid: "uid-1", influence: 0, production: 200, lastCycleAt: 0 });
    const app = buildApp({ archives: [wonArchive()], authBindingStore, galaxyEconomyStore });

    await app.inject({ method: "POST", url: "/hq/galaxy/garrison/invest", headers: { authorization: "Bearer player-1" }, payload: { seasonId: "season-1", amount: 50 } });
    const second = await app.inject({ method: "POST", url: "/hq/galaxy/garrison/invest", headers: { authorization: "Bearer player-1" }, payload: { seasonId: "season-1", amount: 50 } });
    expect(second.json().territory.garrison).toBe(100);
  });
});
