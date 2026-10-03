import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { AdminPlayerRow, CurrentSeasonSummary } from "@border-empires/sim-protocol";
import { WATCHTOWERS_ENABLED, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

import { registerAdminWorldRoute, resolveWorldSizeStatus } from "./register-admin-world-route.js";

const summary = (overrides: Partial<CurrentSeasonSummary> = {}): CurrentSeasonSummary =>
  ({
    seasonId: "season-32",
    status: "active",
    startedAt: 1_000,
    totalPlayers: 21,
    townCount: 190,
    ...overrides
  }) as CurrentSeasonSummary;

const players: AdminPlayerRow[] = [
  { id: "ai-1", isAi: true },
  { id: "ai-2", isAi: true },
  { id: "barbarian-1", isAi: false },
  { id: "human-1", isAi: false }
] as AdminPlayerRow[];

const buildApp = (deps: { authorized?: boolean; summary?: () => Promise<CurrentSeasonSummary> }) => {
  const app = Fastify();
  registerAdminWorldRoute(app, {
    adminRequestAuthorized: async () => deps.authorized ?? true,
    getCurrentSeasonSummary: deps.summary ?? (async () => summary({ worldWidth: WORLD_WIDTH, worldHeight: WORLD_HEIGHT })),
    getAdminPlayers: async () => players
  });
  return app;
};

describe("GET /admin/world", () => {
  it("rejects unauthorized callers", async () => {
    const response = await buildApp({ authorized: false }).inject({ method: "GET", url: "/admin/world" });
    expect(response.statusCode).toBe(401);
  });

  it("reports configured size, season size and AI count", async () => {
    const body = (await buildApp({}).inject({ method: "GET", url: "/admin/world" })).json();
    expect(body.configured).toEqual({
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      tileCount: WORLD_WIDTH * WORLD_HEIGHT,
      watchtowersEnabled: WATCHTOWERS_ENABLED,
      isDefaultSize: WORLD_WIDTH === 640 && WORLD_HEIGHT === 320
    });
    expect(body.season).toMatchObject({ seasonId: "season-32", width: WORLD_WIDTH, height: WORLD_HEIGHT, aiPlayers: 2, townCount: 190 });
    expect(body.sizeStatus).toBe("match");
  });

  it("still answers with the configured size when the season summary is unavailable", async () => {
    const body = (
      await buildApp({
        summary: async () => {
          throw new Error("sim unavailable");
        }
      }).inject({ method: "GET", url: "/admin/world" })
    ).json();
    expect(body.ok).toBe(true);
    expect(body.configured.width).toBe(WORLD_WIDTH);
    expect(body.season).toBeNull();
    expect(body.seasonError).toBe("sim unavailable");
    expect(body.sizeStatus).toBe("unknown");
  });
});

describe("resolveWorldSizeStatus", () => {
  it("flags a season generated at a different size than configured", () => {
    expect(resolveWorldSizeStatus({ worldWidth: WORLD_WIDTH + 1, worldHeight: WORLD_HEIGHT })).toBe("rollover_pending");
  });

  it("treats an unstamped (pre-existing) season as unknown, not a match", () => {
    expect(resolveWorldSizeStatus({})).toBe("unknown");
    expect(resolveWorldSizeStatus(undefined)).toBe("unknown");
  });
});
