import { describe, expect, it } from "vitest";
import Fastify from "fastify";

import { registerSovereignSiegeEngineStrikeRoutes } from "./sovereign-siege-engine-strike-routes.js";
import { InMemorySovereignSiegeEngineStrikeStore, type SovereignSiegeEngineStrikeRecord } from "../sovereign-siege-engine-strike-store/sovereign-siege-engine-strike-store.js";

const record = (overrides: Partial<SovereignSiegeEngineStrikeRecord> = {}): SovereignSiegeEngineStrikeRecord => ({
  strikeId: "strike-1",
  occurredAt: 1_000,
  casterName: "player-1",
  targetX: 50,
  targetY: 50,
  townName: "Ashford",
  populationTier: "CITY",
  populationLost: 300_000,
  targetOwnerName: "player-2",
  ...overrides
});

describe("sovereign siege engine strike routes", () => {
  it("GET /world-events/sovereign-siege-engine-strikes returns 503 when unwired", async () => {
    const app = Fastify();
    registerSovereignSiegeEngineStrikeRoutes(app, {});
    const response = await app.inject({ method: "GET", url: "/world-events/sovereign-siege-engine-strikes" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ ok: false, error: "world events are unavailable" });
  });

  it("GET /world-events/sovereign-siege-engine-strikes returns strikes within the 12h window", async () => {
    const store = new InMemorySovereignSiegeEngineStrikeStore(() => 10_000);
    await store.insert(record());
    const app = Fastify();
    registerSovereignSiegeEngineStrikeRoutes(app, { sovereignSiegeEngineStrikeStore: store, now: () => 10_000 });
    const response = await app.inject({ method: "GET", url: "/world-events/sovereign-siege-engine-strikes" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, strikes: [record()] });
  });

  it("excludes strikes older than 12h", async () => {
    let now = 0;
    const store = new InMemorySovereignSiegeEngineStrikeStore(() => now);
    await store.insert(record({ strikeId: "old", occurredAt: 0 }));
    now = 13 * 60 * 60_000;
    const app = Fastify();
    registerSovereignSiegeEngineStrikeRoutes(app, { sovereignSiegeEngineStrikeStore: store, now: () => now });
    const response = await app.inject({ method: "GET", url: "/world-events/sovereign-siege-engine-strikes" });
    expect(response.json()).toEqual({ ok: true, strikes: [] });
  });

  it("still serves the pre-rename path for clients on an older bundle", async () => {
    const store = new InMemorySovereignSiegeEngineStrikeStore(() => 1_000);
    await store.insert(record());
    const app = Fastify();
    registerSovereignSiegeEngineStrikeRoutes(app, { sovereignSiegeEngineStrikeStore: store, now: () => 1_000 });
    const response = await app.inject({ method: "GET", url: "/world-events/sovereign-siege-engine-strikes" });
    expect(response.json()).toEqual({ ok: true, strikes: [record()] });
  });
});
