import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import type { WireTile } from "../admin-tile-inspect/admin-tile-inspect.js";
import { registerAdminTileRoute, type RegisterAdminTileRouteDeps } from "./register-admin-tile-route.js";

const W = 640;
const H = 320;
const AUTH = { authorization: "Bearer ok" };

// A fake sim with the same 3x3 / wrap / visibility-filter behaviour as FetchTileDetail.
const fakeSim = (tileAt: (x: number, y: number) => WireTile, visibleTo: (playerId: string, tile: WireTile) => WireTile | undefined) =>
  vi.fn(async (playerId: string, cx: number, cy: number, fullVisibility?: boolean) => {
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) throw new Error(`unwrapped centre ${cx},${cy}`);
    const tiles: WireTile[] = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const tile = tileAt((cx + dx + W) % W, (cy + dy + H) % H);
        const out = fullVisibility ? tile : visibleTo(playerId, tile);
        if (out) tiles.push(out);
      }
    }
    return { tiles };
  });

const forestWithBeacon = (x: number, y: number): WireTile =>
  x === 524 && y === 298
    ? { x, y, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", economicStructureJson: JSON.stringify({ type: "RELAY_BEACON", status: "active" }) }
    : { x, y, terrain: y > 299 ? "SEA" : "LAND" };

const appWith = (overrides: Partial<RegisterAdminTileRouteDeps> = {}) => {
  const app = Fastify();
  registerAdminTileRoute(app, {
    adminRequestAuthorized: async (request) => request.headers.authorization === "Bearer ok",
    fetchTileDetail: fakeSim(forestWithBeacon, (_id, tile) => tile),
    getAdminPlayers: async () => [{ id: "p1" }],
    getCurrentSeasonSummary: async () => ({ status: "active" }),
    ...overrides
  });
  return app;
};

describe("GET /admin/tile", () => {
  it("requires read admin auth", async () => {
    const response = await appWith().inject({ method: "GET", url: "/admin/tile?x=524&y=298" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects bad coordinates and radii", async () => {
    const app = appWith();
    for (const query of ["x=1.5&y=2", "y=2", "x=1&y=2&radius=7", "x=1&y=2&radius=-1", "x=0x10&y=2"]) {
      expect((await app.inject({ method: "GET", url: `/admin/tile?${query}`, headers: AUTH })).statusCode).toBe(400);
    }
  });

  it("is 503 when the sim RPC isn't wired, and 404 for an unknown playerId", async () => {
    expect((await appWith({ fetchTileDetail: undefined }).inject({ method: "GET", url: "/admin/tile?x=1&y=2", headers: AUTH })).statusCode).toBe(503);
    expect((await appWith().inject({ method: "GET", url: "/admin/tile?x=1&y=2&playerId=p9", headers: AUTH })).statusCode).toBe(404);
  });

  it("returns the server's tiles as a grid and parsed details", async () => {
    const response = await appWith().inject({ method: "GET", url: "/admin/tile?x=524&y=298&radius=2", headers: AUTH });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { grid: string[]; tiles: Array<Record<string, unknown>>; seasonStatus: string };
    expect(body.grid).toEqual(["296 .....", "297 .....", "298 ..B..", "299 .....", "300 ~~~~~"]);
    expect(body.tiles).toHaveLength(25);
    expect(body.tiles.find((tile) => tile.x === 524 && tile.y === 298)).toMatchObject({ economicStructure: { type: "RELAY_BEACON", status: "active" } });
    expect(body.seasonStatus).toBe("active");
  });

  it("wraps across the world edge without sending negative coordinates", async () => {
    const fetchTileDetail = fakeSim((x, y) => ({ x, y, terrain: "LAND" }), (_id, tile) => tile);
    const response = await appWith({ fetchTileDetail }).inject({ method: "GET", url: "/admin/tile?x=0&y=0&radius=3", headers: AUTH });
    const body = response.json() as { tiles: Array<{ x: number; y: number }>; errors?: string[] };
    expect(body.errors).toBeUndefined();
    expect(body.tiles).toHaveLength(49);
    expect(body.tiles.some((tile) => tile.x === 637 && tile.y === 317)).toBe(true);
  });

  it("classifies what the player sees: full, redacted or none", async () => {
    const visibleTo = (_id: string, tile: WireTile): WireTile | undefined => {
      if (tile.y > 299) return undefined;
      if (tile.x === 524 && tile.y === 298) return { x: tile.x, y: tile.y, terrain: tile.terrain, ownerId: tile.ownerId };
      return tile;
    };
    const response = await appWith({ fetchTileDetail: fakeSim(forestWithBeacon, visibleTo) }).inject({ method: "GET", url: "/admin/tile?x=524&y=298&radius=2&playerId=p1", headers: AUTH });
    const body = response.json() as { visibilityGrid: string[]; tiles: Array<Record<string, unknown>> };
    expect(body.visibilityGrid).toEqual(["296 #####", "297 #####", "298 ##r##", "299 #####", "300 -----"]);
    expect(body.tiles.find((tile) => tile.x === 524 && tile.y === 298)).toMatchObject({ visibleToPlayer: "redacted", hiddenFromPlayer: ["ownershipState", "economicStructure"] });
  });

  it("reports a failing block instead of failing the request, and notes forced visibility after season end", async () => {
    const fetchTileDetail = vi.fn(async (_id: string, cx: number) => {
      if (cx === 523) throw new Error("sim down");
      return { tiles: [] as WireTile[] };
    });
    const response = await appWith({ fetchTileDetail, getCurrentSeasonSummary: async () => ({ status: "ended" }) }).inject({ method: "GET", url: "/admin/tile?x=524&y=298&radius=2&playerId=p1", headers: AUTH });
    const body = response.json() as { errors: string[]; visibilityNote?: string; grid: string[] };
    expect(response.statusCode).toBe(200);
    expect(body.errors.some((error) => error.includes("sim down"))).toBe(true);
    expect(body.visibilityNote).toContain("season ended");
    expect(body.grid[0]).toBe("296 ?????");
  });

  it("marks tiles unknown, not invisible, when only the player-vision call for their block fails", async () => {
    const sim = fakeSim(forestWithBeacon, (_id, tile) => tile);
    const fetchTileDetail = vi.fn(async (playerId: string, cx: number, cy: number, fullVisibility?: boolean) => {
      if (!fullVisibility && cx === 523) throw new Error("timed out");
      return sim(playerId, cx, cy, fullVisibility);
    });
    const response = await appWith({ fetchTileDetail }).inject({ method: "GET", url: "/admin/tile?x=524&y=298&radius=2&playerId=p1", headers: AUTH });
    const body = response.json() as { visibilityGrid: string[]; errors: string[] };
    expect(body.visibilityGrid).toEqual(["296 ???##", "297 ???##", "298 ???##", "299 ???##", "300 ???##"]);
    expect(body.errors.every((error) => error.includes("player pass"))).toBe(true);
  });

  it("reports a failed season-status call as an error", async () => {
    const response = await appWith({ getCurrentSeasonSummary: async () => { throw new Error("sim busy"); } }).inject({ method: "GET", url: "/admin/tile?x=1&y=1&radius=0", headers: AUTH });
    const body = response.json() as { errors: string[]; seasonStatus?: string };
    expect(body.seasonStatus).toBeUndefined();
    expect(body.errors).toEqual(["season status: sim busy"]);
  });

  it("serves one inspection at a time", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchTileDetail = vi.fn(async () => { await gate; return { tiles: [] as WireTile[] }; });
    const app = appWith({ fetchTileDetail });
    const first = app.inject({ method: "GET", url: "/admin/tile?x=1&y=1&radius=0", headers: AUTH });
    await vi.waitFor(() => expect(fetchTileDetail).toHaveBeenCalled());
    expect((await app.inject({ method: "GET", url: "/admin/tile?x=1&y=1&radius=0", headers: AUTH })).statusCode).toBe(429);
    release();
    expect((await first).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/admin/tile?x=1&y=1&radius=0", headers: AUTH })).statusCode).toBe(200);
  });
});
