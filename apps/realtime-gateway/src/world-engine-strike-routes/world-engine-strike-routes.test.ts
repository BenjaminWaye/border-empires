import { describe, expect, it } from "vitest";
import Fastify from "fastify";

import { registerWorldEngineStrikeRoutes } from "./world-engine-strike-routes.js";
import { InMemoryWorldEngineStrikeStore, type WorldEngineStrikeRecord } from "../world-engine-strike-store/world-engine-strike-store.js";

const record = (overrides: Partial<WorldEngineStrikeRecord> = {}): WorldEngineStrikeRecord => ({
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

describe("world engine strike routes", () => {
  it("GET /world-events/world-engine-strikes returns 503 when unwired", async () => {
    const app = Fastify();
    registerWorldEngineStrikeRoutes(app, {});
    const response = await app.inject({ method: "GET", url: "/world-events/world-engine-strikes" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ ok: false, error: "world events are unavailable" });
  });

  it("GET /world-events/world-engine-strikes returns strikes within the 12h window", async () => {
    const store = new InMemoryWorldEngineStrikeStore(() => 10_000);
    await store.insert(record());
    const app = Fastify();
    registerWorldEngineStrikeRoutes(app, { worldEngineStrikeStore: store, now: () => 10_000 });
    const response = await app.inject({ method: "GET", url: "/world-events/world-engine-strikes" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, strikes: [record()] });
  });

  it("excludes strikes older than 12h", async () => {
    let now = 0;
    const store = new InMemoryWorldEngineStrikeStore(() => now);
    await store.insert(record({ strikeId: "old", occurredAt: 0 }));
    now = 13 * 60 * 60_000;
    const app = Fastify();
    registerWorldEngineStrikeRoutes(app, { worldEngineStrikeStore: store, now: () => now });
    const response = await app.inject({ method: "GET", url: "/world-events/world-engine-strikes" });
    expect(response.json()).toEqual({ ok: true, strikes: [] });
  });
});
