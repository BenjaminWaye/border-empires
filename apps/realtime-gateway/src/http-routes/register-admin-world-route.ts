// GET /admin/world: read-only answer to "what map is this environment on?".
// Split out of http-routes.ts, which is over the file-line cap.
//
// `configured` is this process's WORLD_WIDTH/WORLD_HEIGHT/WATCHTOWERS_ENABLED
// env (the combined stack shares one env between gateway and simulation).
// `season` is the size the CURRENT season was actually generated at, stamped
// on the season state at creation. They differ after a size change has been
// deployed but before a forced rollover (POST /admin/season/start-next) --
// restarts reload the persisted season, so the new size is not in play yet.
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AdminPlayerRow, CurrentSeasonSummary } from "@border-empires/sim-protocol";
import { DEFAULT_WORLD_HEIGHT, DEFAULT_WORLD_WIDTH, WATCHTOWERS_ENABLED, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

export type AdminWorldSizeStatus = "match" | "rollover_pending" | "unknown";

export type AdminWorldResponse = {
  ok: true;
  configured: {
    width: number;
    height: number;
    tileCount: number;
    watchtowersEnabled: boolean;
    isDefaultSize: boolean;
  };
  season: {
    seasonId: string;
    status: CurrentSeasonSummary["status"];
    startedAt: number;
    width?: number;
    height?: number;
    aiPlayers?: number;
    totalPlayers: number;
    townCount: number;
  } | null;
  seasonError?: string;
  sizeStatus: AdminWorldSizeStatus;
};

export type RegisterAdminWorldRouteDeps = {
  adminRequestAuthorized: (request: FastifyRequest) => Promise<boolean>;
  getCurrentSeasonSummary: () => Promise<CurrentSeasonSummary>;
  getAdminPlayers: () => Promise<AdminPlayerRow[]>;
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const resolveWorldSizeStatus = (summary: Pick<CurrentSeasonSummary, "worldWidth" | "worldHeight"> | undefined): AdminWorldSizeStatus => {
  if (!summary || typeof summary.worldWidth !== "number" || typeof summary.worldHeight !== "number") return "unknown";
  return summary.worldWidth === WORLD_WIDTH && summary.worldHeight === WORLD_HEIGHT ? "match" : "rollover_pending";
};

export const registerAdminWorldRoute = (app: FastifyInstance, deps: RegisterAdminWorldRouteDeps): void => {
  app.get("/admin/world", async (request, reply) => {
    if (!(await deps.adminRequestAuthorized(request))) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    const configured: AdminWorldResponse["configured"] = {
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      tileCount: WORLD_WIDTH * WORLD_HEIGHT,
      watchtowersEnabled: WATCHTOWERS_ENABLED,
      isDefaultSize: WORLD_WIDTH === DEFAULT_WORLD_WIDTH && WORLD_HEIGHT === DEFAULT_WORLD_HEIGHT
    };
    const [summaryResult, playersResult] = await Promise.allSettled([deps.getCurrentSeasonSummary(), deps.getAdminPlayers()]);
    if (summaryResult.status === "rejected") {
      const response: AdminWorldResponse = { ok: true, configured, season: null, seasonError: errorMessage(summaryResult.reason), sizeStatus: "unknown" };
      return response;
    }
    const summary = summaryResult.value;
    const response: AdminWorldResponse = {
      ok: true,
      configured,
      season: {
        seasonId: summary.seasonId,
        status: summary.status,
        startedAt: summary.startedAt,
        ...(typeof summary.worldWidth === "number" ? { width: summary.worldWidth } : {}),
        ...(typeof summary.worldHeight === "number" ? { height: summary.worldHeight } : {}),
        // barbarian-1 is isAi:false by design, so this counts only AI empires.
        ...(playersResult.status === "fulfilled" ? { aiPlayers: playersResult.value.filter((player) => player.isAi).length } : {}),
        totalPlayers: summary.totalPlayers,
        townCount: summary.townCount
      },
      sizeStatus: resolveWorldSizeStatus(summary)
    };
    return response;
  });
};
