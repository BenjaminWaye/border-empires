import Fastify from "fastify";
import type { SeasonArchiveRow } from "@border-empires/sim-protocol";
import { describe, expect, it } from "vitest";

import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GatewayResolvedIdentity } from "../auth-identity/auth-identity.js";
import { InMemoryGalaxyBattleLogStore } from "../galaxy-battle-log-store/galaxy-battle-log-store.js";
import { GALAXY_CYCLE_LENGTH_MS } from "../galaxy-cycle-tick/galaxy-cycle-tick.js";
import { createGalaxyDukeService } from "../galaxy-duke-service/galaxy-duke-service.js";
import { InMemoryGalaxyDukeStore } from "../galaxy-duke-store/galaxy-duke-store.js";
import { InMemoryGalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import { registerGalaxyDukeRoutes } from "./galaxy-duke-routes.js";

const T0 = 100 * GALAXY_CYCLE_LENGTH_MS;
const won: SeasonArchiveRow = {
  seasonId: "season-1",
  seasonSequence: 1,
  endedAt: 1_000,
  updatedAt: 1_000,
  winner: { playerId: "player-1", playerName: "Nauticus", crownedAt: 1_000, objectiveId: "TOWN_CONTROL", objectiveName: "Town Control" },
  mostTerritory: [],
  mostPoints: [],
  longestSurvivalMs: [],
  replayEvents: []
};
const identities: Record<string, GatewayResolvedIdentity> = {
  "player-1": { playerId: "player-1", playerName: "Nauticus", authUid: "uid-1" },
  "player-2": { playerId: "player-2", playerName: "Bystander", authUid: "uid-2" }
};

const build = async () => {
  const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
  await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
  const galaxyDukeService = createGalaxyDukeService({
    dukeStore: new InMemoryGalaxyDukeStore(),
    galaxyEconomyStore: new InMemoryGalaxyEconomyStore(),
    galaxyBattleLogStore: new InMemoryGalaxyBattleLogStore(),
    authBindingStore,
    listSeasonArchives: async () => [won],
    now: () => T0
  });
  const app = Fastify();
  registerGalaxyDukeRoutes(app, {
    galaxyDukeService,
    authenticateBearer: async (auth) => {
      const token = auth?.replace(/^Bearer /, "");
      return token ? identities[token] : undefined;
    }
  });
  return app;
};

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe("galaxy duke routes", () => {
  it("GET /hq/galaxy/court is public and reports the Court", async () => {
    const app = await build();
    const res = await app.inject({ method: "GET", url: "/hq/galaxy/court" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, court: { start: 300, current: 290, fallen: false } });
  });

  it("requires a login, and refuses a non-Duke with 403 NOT_A_DUKE", async () => {
    const app = await build();
    expect((await app.inject({ method: "GET", url: "/hq/galaxy/duke" })).statusCode).toBe(401);
    const res = await app.inject({ method: "GET", url: "/hq/galaxy/duke", headers: auth("player-2") });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: "NOT_A_DUKE" });
  });

  it("GET /hq/galaxy/duke returns the Duke's status", async () => {
    const app = await build();
    const res = await app.inject({ method: "GET", url: "/hq/galaxy/duke", headers: auth("player-1") });
    expect(res.statusCode).toBe(200);
    expect(res.json().duke).toMatchObject({ production: { ratePerDay: 6 }, gate: { available: true }, court: { offer: { status: "PENDING" } } });
  });

  it("invest starts a build; a second Invest the same Cycle is a 409 with availableAt", async () => {
    const app = await build();
    const first = await app.inject({ method: "POST", url: "/hq/galaxy/duke/invest", headers: auth("player-1"), payload: { kind: "PROBE" } });
    expect(first.statusCode).toBe(200);
    const again = await app.inject({ method: "POST", url: "/hq/galaxy/duke/invest/cancel", headers: auth("player-1") });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ ok: false, code: "ACTION_ALREADY_TAKEN_THIS_CYCLE", availableAt: T0 + 7 * 24 * 60 * 60 * 1000 });
  });

  it("rejects malformed bodies with 400 INVALID", async () => {
    const app = await build();
    for (const [url, payload] of [
      ["/hq/galaxy/duke/invest", { kind: "DREADNOUGHT" }],
      ["/hq/galaxy/duke/invest", { kind: "FORTIFY", seasonId: "season-1" }],
      ["/hq/galaxy/duke/order", { kind: "PROBE" }],
      ["/hq/galaxy/duke/order", { kind: "BOMBARD", seasonId: "x" }],
      ["/hq/galaxy/duke/court-offer", { accept: "yes" }],
      ["/hq/galaxy/duke/court/move", { influence: "lots" }]
    ] as const) {
      const res = await app.inject({ method: "POST", url, headers: auth("player-1"), payload });
      expect(res.statusCode, url).toBe(400);
      expect(res.json()).toMatchObject({ code: "INVALID" });
    }
  });

  it("answers the Court offer once", async () => {
    const app = await build();
    const ok = await app.inject({ method: "POST", url: "/hq/galaxy/duke/court-offer", headers: auth("player-1"), payload: { accept: false } });
    expect(ok.statusCode).toBe(200);
    const twice = await app.inject({ method: "POST", url: "/hq/galaxy/duke/court-offer", headers: auth("player-1"), payload: { accept: true } });
    expect(twice.statusCode).toBe(409);
    expect(twice.json()).toMatchObject({ code: "NO_PENDING_OFFER" });
  });

  it("503s cleanly when the service is not wired", async () => {
    const app = Fastify();
    registerGalaxyDukeRoutes(app, {});
    expect((await app.inject({ method: "GET", url: "/hq/galaxy/court" })).statusCode).toBe(503);
    expect((await app.inject({ method: "GET", url: "/hq/galaxy/duke" })).statusCode).toBe(503);
  });
});
