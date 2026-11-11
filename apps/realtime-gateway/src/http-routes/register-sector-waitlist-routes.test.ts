import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import type { GatewayResolvedIdentity } from "../auth-identity/auth-identity.js";
import { InMemorySectorWaitlistStore } from "../sector-waitlist-store/sector-waitlist-store.js";
import { registerSectorWaitlistRoutes } from "./register-sector-waitlist-routes.js";

const identities: Record<string, GatewayResolvedIdentity> = {
  "Bearer alice": { playerId: "alice", playerName: "Alice" },
  "Bearer bob": { playerId: "bob", playerName: "Bob" },
  "Bearer guest": { playerId: "guest-1", playerName: "Guest", isGuest: true }
};

const setup = (season: { seasonId: string; status: string } = { seasonId: "season-7", status: "active" }) => {
  const app = Fastify();
  const store = new InMemorySectorWaitlistStore();
  const onJoined = vi.fn();
  const current = { ...season };
  registerSectorWaitlistRoutes(app, {
    store,
    authenticateBearer: async (header) => (header ? identities[header] : undefined),
    getCurrentSeason: async () => current,
    now: () => 5_000,
    onJoined
  });
  return { app, store, onJoined, current };
};

const call = (app: ReturnType<typeof Fastify>, method: "GET" | "POST" | "DELETE", token?: string) =>
  app.inject({ method, url: "/sector/waitlist", ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}) });

describe("sector waitlist routes", () => {
  it("lets signed-in players join once and reports the queue size", async () => {
    const { app, onJoined } = setup();
    expect((await call(app, "POST", "alice")).json()).toEqual({ ok: true, seasonId: "season-7", waitingCount: 1, joined: true });
    expect((await call(app, "POST", "alice")).json()).toEqual({ ok: true, seasonId: "season-7", waitingCount: 1, joined: true });
    expect((await call(app, "POST", "bob")).json()).toMatchObject({ waitingCount: 2, joined: true });
    expect(onJoined).toHaveBeenCalledTimes(2);
    expect(onJoined).toHaveBeenLastCalledWith("bob", "season-7", 2);
  });

  it("serves the count anonymously and the joined flag to the caller", async () => {
    const { app } = setup();
    await call(app, "POST", "alice");
    expect((await call(app, "GET")).json()).toEqual({ ok: true, seasonId: "season-7", waitingCount: 1, joined: false });
    expect((await call(app, "GET", "alice")).json()).toMatchObject({ joined: true });
    expect((await call(app, "GET", "bob")).json()).toMatchObject({ joined: false });
  });

  it("requires a real account to join", async () => {
    const { app, store } = setup();
    const anonymous = await call(app, "POST");
    expect(anonymous.statusCode).toBe(401);
    const guest = await call(app, "POST", "guest");
    expect(guest.statusCode).toBe(403);
    expect(guest.json()).toEqual({ ok: false, error: "account_required" });
    expect(await store.count("season-7")).toBe(0);
  });

  it("rejects joining while the season is not active", async () => {
    const { app } = setup({ seasonId: "season-8", status: "pending" });
    const response = await call(app, "POST", "alice");
    expect(response.statusCode).toBe(409);
  });

  it("keys the waitlist by the current season so a rollover starts empty", async () => {
    const { app, current, store } = setup();
    await call(app, "POST", "alice");
    current.seasonId = "season-8";
    expect((await call(app, "GET", "alice")).json()).toEqual({ ok: true, seasonId: "season-8", waitingCount: 0, joined: false });
    expect(await store.count("season-7")).toBe(1);
  });

  it("lets a player leave", async () => {
    const { app } = setup();
    await call(app, "POST", "alice");
    expect((await call(app, "DELETE", "alice")).json()).toEqual({ ok: true, seasonId: "season-7", waitingCount: 0, joined: false });
    expect((await call(app, "DELETE")).statusCode).toBe(401);
  });
});
