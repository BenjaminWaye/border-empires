// GET /admin/debug/tile-visibility?playerId=&x=&y=[&radius=]: "why can this
// player see these tiles?". Proxies the simulation's loopback
// /debug/tile-visibility (runtime-tile-visibility-debug.ts), which lists
// every vision source per tile -- own land, reach, ally, town ring, beacon,
// dock reveal, combat lock -- so a fog report ("I still see land I lost")
// can be answered without shelling into the box. Read-only.
import type { FastifyInstance, FastifyRequest } from "fastify";

const MAX_RADIUS = 8;

export type TileVisibilityQuery = {
  playerId: string;
  x: number;
  y: number;
  radius: number;
};

export type RegisterAdminTileVisibilityRouteDeps = {
  adminRequestAuthorized: (request: FastifyRequest) => Promise<boolean>;
  // Omitted when the simulation's loopback HTTP server isn't wired (tests,
  // standalone gateway); the route then answers 503.
  getSimTileVisibility?: (query: TileVisibilityQuery) => Promise<unknown>;
};

const asInt = (value: unknown): number | undefined => {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
};

export const parseTileVisibilityQuery = (raw: Record<string, unknown>): TileVisibilityQuery | undefined => {
  const playerId = typeof raw.playerId === "string" ? raw.playerId.trim() : "";
  const x = asInt(raw.x);
  const y = asInt(raw.y);
  const radius = raw.radius === undefined ? 0 : asInt(raw.radius);
  if (!playerId || x === undefined || y === undefined || radius === undefined || radius < 0 || radius > MAX_RADIUS) return undefined;
  return { playerId, x, y, radius };
};

/** The sim loopback URL for `query`, resolved against the sim's /metrics URL (same host and port). */
export const simTileVisibilityUrl = (simMetricsUrl: string, query: TileVisibilityQuery): string => {
  const url = new URL("/debug/tile-visibility", simMetricsUrl);
  url.searchParams.set("playerId", query.playerId);
  url.searchParams.set("x", String(query.x));
  url.searchParams.set("y", String(query.y));
  url.searchParams.set("radius", String(query.radius));
  return url.toString();
};

export const registerAdminTileVisibilityRoute = (app: FastifyInstance, deps: RegisterAdminTileVisibilityRouteDeps): void => {
  app.get("/admin/debug/tile-visibility", async (request, reply) => {
    if (!(await deps.adminRequestAuthorized(request))) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    const query = parseTileVisibilityQuery(request.query as Record<string, unknown>);
    if (!query) {
      reply.code(400);
      return { ok: false, error: `expected ?playerId=<id>&x=<int>&y=<int>[&radius=<0-${MAX_RADIUS}>]` };
    }
    if (!deps.getSimTileVisibility) {
      reply.code(503);
      return { ok: false, error: "simulation debug endpoint not wired" };
    }
    try {
      return await deps.getSimTileVisibility(query);
    } catch (error) {
      reply.code(503);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
};
