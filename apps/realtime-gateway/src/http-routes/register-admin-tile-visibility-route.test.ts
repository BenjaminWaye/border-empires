import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";

import {
  fetchSimTileVisibility,
  parseTileVisibilityQuery,
  registerAdminTileVisibilityRoute,
  simTileVisibilityUrl,
  type RegisterAdminTileVisibilityRouteDeps,
  type TileVisibilityQuery
} from "./register-admin-tile-visibility-route.js";

const appWith = (deps: Partial<RegisterAdminTileVisibilityRouteDeps> = {}) => {
  const app = Fastify();
  registerAdminTileVisibilityRoute(app, { adminRequestAuthorized: async (request) => request.headers.authorization === "Bearer ok", ...deps });
  return app;
};

const authed = { authorization: "Bearer ok" };

describe("GET /admin/debug/tile-visibility", () => {
  it("requires admin auth", async () => {
    const response = await appWith().inject({ method: "GET", url: "/admin/debug/tile-visibility?playerId=p&x=1&y=2" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects a missing or malformed query before touching the sim", async () => {
    let called = false;
    const app = appWith({ getSimTileVisibility: async () => { called = true; return {}; } });
    for (const url of ["?x=1&y=2", "?playerId=p&x=1.5&y=2", "?playerId=p&x=1&y=2&radius=9", "?playerId=p&x=1&y="]) {
      const response = await app.inject({ method: "GET", url: `/admin/debug/tile-visibility${url}`, headers: authed });
      expect(response.statusCode).toBe(400);
    }
    expect(called).toBe(false);
  });

  it("answers 503 when the sim loopback isn't wired", async () => {
    const response = await appWith().inject({ method: "GET", url: "/admin/debug/tile-visibility?playerId=p&x=1&y=2", headers: authed });
    expect(response.statusCode).toBe(503);
  });

  it("forwards the parsed query and returns the sim's report", async () => {
    const seen: TileVisibilityQuery[] = [];
    const app = appWith({
      getSimTileVisibility: async (query) => {
        seen.push(query);
        return { ok: true, playerId: query.playerId, tiles: [{ x: 1, y: 2, visible: true, reasons: ["reach:self"] }] };
      }
    });
    const response = await app.inject({ method: "GET", url: "/admin/debug/tile-visibility?playerId=human-1&x=1&y=2&radius=3", headers: authed });
    expect(response.statusCode).toBe(200);
    expect(seen).toEqual([{ playerId: "human-1", x: 1, y: 2, radius: 3 }]);
    expect(response.json()).toEqual({ ok: true, playerId: "human-1", tiles: [{ x: 1, y: 2, visible: true, reasons: ["reach:self"] }] });
  });

  it("does not return an upstream JSON error as HTTP 200", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ error: "missing" }, { status: 404 }));
    const app = appWith({ getSimTileVisibility: (query) => fetchSimTileVisibility("http://127.0.0.1:50052/metrics", query) });
    try {
      const response = await app.inject({ method: "GET", url: "/admin/debug/tile-visibility?playerId=p&x=1&y=2", headers: authed });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ ok: false, error: "Simulation tile visibility returned HTTP 404" });
    } finally {
      fetchMock.mockRestore();
      await app.close();
    }
  });

  it("reports a sim failure as 503", async () => {
    const app = appWith({ getSimTileVisibility: async () => { throw new Error("sim down"); } });
    const response = await app.inject({ method: "GET", url: "/admin/debug/tile-visibility?playerId=p&x=1&y=2", headers: authed });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ ok: false, error: "sim down" });
  });
});

describe("tile visibility helpers", () => {
  it("defaults radius to 0", () => {
    expect(parseTileVisibilityQuery({ playerId: " p ", x: "4", y: "5" })).toEqual({ playerId: "p", x: 4, y: 5, radius: 0 });
  });

  it("builds the loopback URL on the sim metrics host and port", () => {
    expect(simTileVisibilityUrl("http://0.0.0.0:50052/metrics", { playerId: "a b", x: 4, y: 5, radius: 1 })).toBe(
      "http://127.0.0.1:50052/debug/tile-visibility?playerId=a+b&x=4&y=5&radius=1"
    );
  });
});
