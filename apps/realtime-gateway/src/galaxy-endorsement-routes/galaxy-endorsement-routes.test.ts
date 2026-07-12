import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { CurrentSeasonSummary } from "@border-empires/sim-protocol";

import { registerGalaxyEndorsementRoutes } from "./galaxy-endorsement-routes.js";
import { InMemoryGalaxyEndorsementStore } from "../galaxy-endorsement-store/galaxy-endorsement-store.js";
import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GatewayResolvedIdentity } from "../auth-identity/auth-identity.js";

const endedSummary = (overrides: Partial<CurrentSeasonSummary> = {}): CurrentSeasonSummary =>
  ({
    seasonId: "season-1",
    seasonSequence: 1,
    status: "ended",
    seasonWinner: {
      playerId: "emperor-1",
      playerName: "Nauticus",
      crownedAt: 1_000,
      objectiveId: "conquest",
      objectiveName: "Conquest"
    },
    ...overrides
  }) as CurrentSeasonSummary;

const emperorIdentity: GatewayResolvedIdentity = { playerId: "emperor-1", playerName: "Nauticus", authUid: "uid-emperor" };
const otherIdentity: GatewayResolvedIdentity = { playerId: "someone-else", playerName: "Impostor", authUid: "uid-other" };

const buildApp = (options: {
  summary: CurrentSeasonSummary;
  identityForToken?: (token: string | undefined) => GatewayResolvedIdentity | undefined;
  endorsementStore?: InMemoryGalaxyEndorsementStore;
  authBindingStore?: InMemoryGatewayAuthBindingStore;
  now?: () => number;
}) => {
  const app = Fastify();
  registerGalaxyEndorsementRoutes(app, {
    getCurrentSeasonSummary: async () => options.summary,
    authenticateBearer: async (auth) => options.identityForToken?.(auth) ?? undefined,
    endorsementStore: options.endorsementStore ?? new InMemoryGalaxyEndorsementStore(),
    authBindingStore: options.authBindingStore ?? new InMemoryGatewayAuthBindingStore(),
    ...(options.now ? { now: options.now } : {})
  });
  return app;
};

describe("galaxy endorsement routes", () => {
  it("GET /hq/galaxy/emperor returns null emperor when the season is still active", async () => {
    const app = buildApp({ summary: endedSummary({ status: "active", seasonWinner: undefined }) });
    const response = await app.inject({ method: "GET", url: "/hq/galaxy/emperor" });
    expect(response.json()).toEqual({ ok: true, emperor: null, windowOpenUntil: null, endorsement: null, isEmperor: false });
  });

  it("GET /hq/galaxy/emperor reports the crowned winner as Emperor with a 1h window and isEmperor for the winner's own token", async () => {
    const app = buildApp({
      summary: endedSummary(),
      identityForToken: (auth) => (auth === "Bearer emperor-token" ? emperorIdentity : undefined)
    });
    const response = await app.inject({ method: "GET", url: "/hq/galaxy/emperor", headers: { authorization: "Bearer emperor-token" } });
    expect(response.json()).toEqual({
      ok: true,
      emperor: { playerId: "emperor-1", endedSeasonId: "season-1", crownedAt: 1_000 },
      windowOpenUntil: 1_000 + 60 * 60_000,
      endorsement: null,
      isEmperor: true
    });
  });

  it("GET /hq/galaxy/emperor reports isEmperor false for a non-emperor token", async () => {
    const app = buildApp({
      summary: endedSummary(),
      identityForToken: (auth) => (auth === "Bearer other-token" ? otherIdentity : undefined)
    });
    const response = await app.inject({ method: "GET", url: "/hq/galaxy/emperor", headers: { authorization: "Bearer other-token" } });
    expect(response.json().isEmperor).toBe(false);
  });

  it("POST /hq/galaxy/endorse lets the Emperor endorse an existing player by authUid", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-target", playerId: "target-player" });
    const app = buildApp({
      summary: endedSummary(),
      identityForToken: (auth) => (auth === "Bearer emperor-token" ? emperorIdentity : undefined),
      authBindingStore,
      now: () => 1_000
    });

    const response = await app.inject({
      method: "POST",
      url: "/hq/galaxy/endorse",
      headers: { authorization: "Bearer emperor-token" },
      payload: { targetAuthUid: "uid-target" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, endorsement: { targetPlayerId: "target-player", createdAt: expect.any(Number) } });
  });

  it("POST /hq/galaxy/endorse resolves an existing player by email", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-target", playerId: "target-player", email: "target@example.com" });
    const app = buildApp({
      summary: endedSummary(),
      identityForToken: (auth) => (auth === "Bearer emperor-token" ? emperorIdentity : undefined),
      authBindingStore,
      now: () => 1_000
    });

    const response = await app.inject({
      method: "POST",
      url: "/hq/galaxy/endorse",
      headers: { authorization: "Bearer emperor-token" },
      payload: { targetEmail: "target@example.com" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().endorsement.targetPlayerId).toBe("target-player");
  });

  it("rejects self-endorsement with 400", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-emperor", playerId: "emperor-1" });
    const app = buildApp({
      summary: endedSummary(),
      identityForToken: (auth) => (auth === "Bearer emperor-token" ? emperorIdentity : undefined),
      authBindingStore,
      now: () => 1_000
    });

    const response = await app.inject({
      method: "POST",
      url: "/hq/galaxy/endorse",
      headers: { authorization: "Bearer emperor-token" },
      payload: { targetAuthUid: "uid-emperor" }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/cannot endorse yourself/);
  });

  it("rejects endorsement from a non-Emperor with 403", async () => {
    const app = buildApp({
      summary: endedSummary(),
      identityForToken: (auth) => (auth === "Bearer other-token" ? otherIdentity : undefined),
      now: () => 1_000
    });

    const response = await app.inject({
      method: "POST",
      url: "/hq/galaxy/endorse",
      headers: { authorization: "Bearer other-token" },
      payload: { targetAuthUid: "uid-target" }
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects endorsement for an unresolvable target with 404", async () => {
    const app = buildApp({
      summary: endedSummary(),
      identityForToken: (auth) => (auth === "Bearer emperor-token" ? emperorIdentity : undefined),
      now: () => 1_000
    });

    const response = await app.inject({
      method: "POST",
      url: "/hq/galaxy/endorse",
      headers: { authorization: "Bearer emperor-token" },
      payload: { targetAuthUid: "uid-nonexistent" }
    });
    expect(response.statusCode).toBe(404);
  });

  it("rejects endorsement once the 1h window has closed with 409", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-target", playerId: "target-player" });
    const app = buildApp({
      summary: endedSummary(),
      identityForToken: (auth) => (auth === "Bearer emperor-token" ? emperorIdentity : undefined),
      authBindingStore,
      now: () => 1_000 + 60 * 60_000 + 1
    });

    const response = await app.inject({
      method: "POST",
      url: "/hq/galaxy/endorse",
      headers: { authorization: "Bearer emperor-token" },
      payload: { targetAuthUid: "uid-target" }
    });
    expect(response.statusCode).toBe(409);
  });

  it("rejects endorsement with 409 once the next season has already started (no window at all)", async () => {
    const app = buildApp({
      summary: endedSummary({ status: "active", seasonWinner: undefined }),
      identityForToken: (auth) => (auth === "Bearer emperor-token" ? emperorIdentity : undefined)
    });

    const response = await app.inject({
      method: "POST",
      url: "/hq/galaxy/endorse",
      headers: { authorization: "Bearer emperor-token" },
      payload: { targetAuthUid: "uid-target" }
    });
    expect(response.statusCode).toBe(409);
  });

  it("rejects a request with neither targetAuthUid nor targetEmail with 400", async () => {
    const app = buildApp({
      summary: endedSummary(),
      identityForToken: (auth) => (auth === "Bearer emperor-token" ? emperorIdentity : undefined),
      now: () => 1_000
    });

    const response = await app.inject({
      method: "POST",
      url: "/hq/galaxy/endorse",
      headers: { authorization: "Bearer emperor-token" },
      payload: {}
    });
    expect(response.statusCode).toBe(400);
  });

  it("allows the Emperor to change their pick before the window closes (upsert)", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    await authBindingStore.bindIdentity({ uid: "uid-target-a", playerId: "target-a" });
    await authBindingStore.bindIdentity({ uid: "uid-target-b", playerId: "target-b" });
    const endorsementStore = new InMemoryGalaxyEndorsementStore();
    const app = buildApp({
      summary: endedSummary(),
      identityForToken: (auth) => (auth === "Bearer emperor-token" ? emperorIdentity : undefined),
      authBindingStore,
      endorsementStore,
      now: () => 1_000
    });

    await app.inject({
      method: "POST",
      url: "/hq/galaxy/endorse",
      headers: { authorization: "Bearer emperor-token" },
      payload: { targetAuthUid: "uid-target-a" }
    });
    const second = await app.inject({
      method: "POST",
      url: "/hq/galaxy/endorse",
      headers: { authorization: "Bearer emperor-token" },
      payload: { targetAuthUid: "uid-target-b" }
    });

    expect(second.json().endorsement.targetPlayerId).toBe("target-b");
    const stored = await endorsementStore.getByEndedSeasonId("season-1");
    expect(stored?.targetPlayerId).toBe("target-b");
  });
});
