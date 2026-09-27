import { describe, expect, it } from "vitest";
import Fastify from "fastify";

import { InMemoryPlayerFunnelStore, type PlayerFunnelRow } from "../player-funnel-store/player-funnel-store.js";
import { createPlayerFunnelTracker } from "../player-funnel-tracker/player-funnel-tracker.js";
import { buildPlayerInsights, sessionDistribution } from "./player-insights.js";
import { parseWindowDays, registerPlayerInsightsRoutes } from "./player-insights-routes.js";

const DAY = 24 * 60 * 60_000;
const MIN = 60_000;
const NOW = 100 * DAY;

const row = (playerId: string, overrides: Partial<PlayerFunnelRow> = {}): PlayerFunnelRow => ({
  playerId, firstSeenAt: NOW - DAY, lastSeenAt: NOW - DAY, accountNew: true, ...overrides
});

describe("buildPlayerInsights", () => {
  it("builds the new-account cohort funnel, excluding existing and out-of-window accounts", () => {
    const start = NOW - DAY;
    const insights = buildPlayerInsights({
      players: [
        row("a", { spawnedAt: start + MIN, firstMoveAt: start + 2 * MIN, firstMoveType: "EXPAND", tenTilesAt: start + 10 * MIN, firstContactAt: start + 30 * MIN, firstContactIsAi: false, firstInteractionAt: start + 40 * MIN, firstInteractionType: "attack" }),
        row("b", { spawnedAt: start + 3 * MIN, firstContactAt: start + 50 * MIN, firstContactIsAi: true }),
        row("c"),
        row("existing", { accountNew: false, spawnedAt: start }),
        row("old", { firstSeenAt: NOW - 30 * DAY, lastSeenAt: NOW - 30 * DAY })
      ],
      sessions: [],
      acquisition: [],
      names: new Map([["a", "Alice"]]),
      now: NOW,
      windowDays: 7
    });
    expect(insights.cohort).toEqual(expect.objectContaining({
      newAccounts: 3, spawned: 2, firstMove: 1, tenTiles: 1, firstContact: 2, firstContactWithHuman: 1, firstInteraction: 1,
      interactionTypes: { attack: 1 }, medianMsToSpawn: 2 * MIN, medianMsToFirstContact: 40 * MIN
    }));
    expect(insights.players.map((p) => p.playerId).sort()).toEqual(["a", "b", "c", "existing"]);
    expect(insights.players.find((p) => p.playerId === "a")?.name).toBe("Alice");
  });

  it("summarises the anonymous sign-up funnel", () => {
    const at = NOW - DAY;
    const insights = buildPlayerInsights({
      players: [], sessions: [], names: new Map(), now: NOW, windowDays: 7,
      acquisition: [
        { visitorId: "v1", step: "visit", at, detail: { referrerHost: "borderempires.com" } },
        { visitorId: "v2", step: "visit", at, detail: { referrerHost: "google.com" } },
        { visitorId: "v3", step: "visit", at: NOW - 20 * DAY, detail: {} },
        { visitorId: "v1", step: "auth_form_shown", at, detail: {} },
        { visitorId: "v2", step: "auth_form_shown", at, detail: {} },
        { visitorId: "v1", step: "auth_method_clicked", at, detail: { method: "google.com" } },
        { visitorId: "v1", step: "sign_up", at, detail: {} }
      ]
    });
    expect(insights.acquisition).toEqual({ visitors: 2, fromLanding: 1, formShown: 2, methodClicked: 1, signUps: 1, methods: { "google.com": 1 } });
  });

  it("reports session length distribution and per-player session stats", () => {
    const start = NOW - DAY;
    const insights = buildPlayerInsights({
      players: [row("a")],
      sessions: [
        { id: 1, playerId: "a", startedAt: start, endedAt: start + 5 * MIN },
        { id: 2, playerId: "a", startedAt: start + 2 * 60 * MIN, endedAt: start + 2 * 60 * MIN + 45 * MIN }
      ],
      acquisition: [], names: new Map(), now: NOW, windowDays: 7
    });
    expect(insights.cohort.firstSession).toEqual({ count: 1, medianMs: 5 * MIN, atLeastMinutes: { 10: 0, 30: 0, 60: 0 } });
    expect(insights.allSessions.atLeastMinutes).toEqual({ 10: 0.5, 30: 0.5, 60: 0 });
    expect(insights.players[0]).toEqual(expect.objectContaining({ sessionCount: 2, totalSessionMs: 50 * MIN, longestSessionMs: 45 * MIN, firstSessionMs: 5 * MIN }));
  });

  it("handles empty input", () => {
    expect(sessionDistribution([])).toEqual({ count: 0, medianMs: undefined, atLeastMinutes: { 10: 0, 30: 0, 60: 0 } });
  });
});

describe("player insights routes", () => {
  const setup = () => {
    const app = Fastify();
    const store = new InMemoryPlayerFunnelStore();
    const tracker = createPlayerFunnelTracker({ store, now: () => NOW, isAiPlayerId: () => false, onStoreError: () => {} });
    registerPlayerInsightsRoutes(app, {
      store, tracker, now: () => NOW,
      getPlayerName: async (id) => (id === "p1" ? "<b>Eve</b>" : undefined),
      adminRequestAuthorized: async (request) => (request.query as { token?: string } | undefined)?.token === "t"
    });
    return { app, store, tracker };
  };

  it("gates the page and data behind admin auth", async () => {
    const { app } = setup();
    expect((await app.inject({ method: "GET", url: "/admin/players/insights" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/admin/players/insights.json" })).statusCode).toBe(401);
    const page = await app.inject({ method: "GET", url: "/admin/players/insights?token=t" });
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toContain("text/html");
  });

  it("returns insights with display names", async () => {
    const { app, store } = setup();
    await store.ensurePlayer("p1", NOW - DAY, true);
    const response = await app.inject({ method: "GET", url: "/admin/players/insights.json?token=t&days=30" });
    const body = response.json() as { ok: boolean; insights: { windowDays: number; players: Array<{ name?: string }> } };
    expect(body.ok).toBe(true);
    expect(body.insights.windowDays).toBe(30);
    expect(body.insights.players[0]?.name).toBe("<b>Eve</b>");
  });

  it("accepts text/plain sendBeacon bodies and rejects junk", async () => {
    const { app, store, tracker } = setup();
    const ok = await app.inject({ method: "POST", url: "/api/funnel", headers: { "content-type": "text/plain;charset=UTF-8" }, payload: JSON.stringify({ visitorId: "visitor-abc123", step: "visit" }) });
    expect(ok.statusCode).toBe(204);
    const bad = await app.inject({ method: "POST", url: "/api/funnel", headers: { "content-type": "text/plain" }, payload: "nope" });
    expect(bad.statusCode).toBe(400);
    const tooBig = await app.inject({ method: "POST", url: "/api/funnel", headers: { "content-type": "text/plain" }, payload: "x".repeat(5_000) });
    expect(tooBig.statusCode).toBe(413);
    await tracker.idle();
    expect(await store.listAcquisitionSteps(0)).toHaveLength(1);
  });

  it("clamps the window", () => {
    expect(parseWindowDays("0")).toBe(1);
    expect(parseWindowDays("365")).toBe(90);
    expect(parseWindowDays(undefined)).toBe(7);
  });
});
