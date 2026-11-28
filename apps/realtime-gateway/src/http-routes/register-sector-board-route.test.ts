import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { InMemorySectorWaitlistStore } from "../sector-waitlist-store/sector-waitlist-store.js";
import { countAiHouses, countHumanHouses, registerSectorBoardRoute } from "./register-sector-board-route.js";

const setup = (playerIds: string[], maxHouses: number, fail = false, landingSiteAvailable?: boolean) => {
  const app = Fastify();
  const store = new InMemorySectorWaitlistStore();
  registerSectorBoardRoute(app, {
    store,
    getOccupancy: async () => {
      if (fail) throw new Error("sim down");
      return { seasonId: "season-9", status: "active", playerIds, ...(landingSiteAvailable === undefined ? {} : { landingSiteAvailable }) };
    },
    maxHouses: () => maxHouses
  });
  return { app, store };
};

describe("countHumanHouses", () => {
  it("leaves out AI empires and barbarians, like the join cap", () => {
    expect(countHumanHouses(["alice", "ai-1", "ai-12", "barbarian", "barbarian-2", "bob"])).toBe(2);
    expect(countHumanHouses(["ai-lover", "barbarian-king"])).toBe(2);
  });
});

// First-15 playtest 2026-11-28: the join card said "3 of 50 Houses" while Diplomacy listed 23 Houses not met
// (the AI Houses). The board now reports them so the card can say so.
describe("countAiHouses", () => {
  it("counts AI empires only, not barbarians or humans", () => {
    expect(countAiHouses(["alice", "ai-1", "ai-12", "barbarian", "barbarian-2", "ai-lover"])).toBe(2);
  });
});

describe("GET /sector/board", () => {
  it("reports houses, cap and the waitlist for the current season", async () => {
    const { app, store } = setup(["alice", "bob", "ai-1"], 100);
    await store.join({ seasonId: "season-9", playerId: "carol", joinedAt: 1 });
    const response = await app.inject({ method: "GET", url: "/sector/board" });
    expect(response.json()).toEqual({ ok: true, seasonId: "season-9", status: "active", houses: 2, maxHouses: 100, aiHouses: 1, full: false, noLandingSite: false, waitingCount: 1 });
  });

  it("marks the Sector full at the cap", async () => {
    const { app } = setup(["alice", "bob"], 2);
    expect((await app.inject({ method: "GET", url: "/sector/board" })).json()).toMatchObject({ houses: 2, full: true });
  });

  it("marks the Sector full when no viable landing site is left, with House places to spare (GDD §6)", async () => {
    const { app } = setup(["alice"], 100, false, false);
    expect((await app.inject({ method: "GET", url: "/sector/board" })).json()).toMatchObject({ houses: 1, full: true, noLandingSite: true });
    const open = setup(["alice"], 100, false, true);
    expect((await open.app.inject({ method: "GET", url: "/sector/board" })).json()).toMatchObject({ full: false, noLandingSite: false });
  });

  it("never reports full when there is no cap", async () => {
    const { app } = setup(["alice", "bob"], 0);
    expect((await app.inject({ method: "GET", url: "/sector/board" })).json()).toMatchObject({ maxHouses: 0, full: false });
  });

  it("answers 503 instead of crashing when the waitlist store fails", async () => {
    const app = Fastify();
    registerSectorBoardRoute(app, {
      store: { count: async () => { throw new Error("SQLITE_BUSY"); } },
      getOccupancy: async () => ({ seasonId: "season-9", status: "active", playerIds: [] }),
      maxHouses: () => 100
    });
    const response = await app.inject({ method: "GET", url: "/sector/board" });
    expect(response.statusCode).toBe(503);
  });

  it("answers 503 when the season is unavailable", async () => {
    const { app } = setup([], 100, true);
    const response = await app.inject({ method: "GET", url: "/sector/board" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ ok: false, error: "season unavailable" });
  });
});
