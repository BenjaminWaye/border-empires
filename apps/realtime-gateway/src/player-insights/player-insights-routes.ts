import type { FastifyInstance } from "fastify";

import type { AdminHttpRequest } from "../admin-auth/admin-auth.js";
import type { PlayerFunnelStore } from "../player-funnel-store/player-funnel-store.js";
import type { PlayerFunnelTracker } from "../player-funnel-tracker/player-funnel-tracker.js";
import { buildPlayerInsights } from "./player-insights.js";
import { PLAYER_INSIGHTS_HTML } from "./player-insights-html.js";

export const INSIGHTS_DEFAULT_WINDOW_DAYS = 7;
export const INSIGHTS_MAX_WINDOW_DAYS = 90;
const FUNNEL_BEACON_BODY_LIMIT_BYTES = 2_048;

export type PlayerInsightsRouteDeps = {
  store: PlayerFunnelStore;
  tracker: PlayerFunnelTracker;
  // Display names live in the gateway profile store, not the simulation.
  getPlayerName: (playerId: string) => Promise<string | undefined>;
  now?: () => number;
};

export const parseWindowDays = (value: unknown): number => {
  const parsed = typeof value === "string" ? Number(value) : typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(parsed)) return INSIGHTS_DEFAULT_WINDOW_DAYS;
  return Math.min(INSIGHTS_MAX_WINDOW_DAYS, Math.max(1, Math.round(parsed)));
};

export const registerPlayerInsightsRoutes = (
  app: FastifyInstance,
  deps: PlayerInsightsRouteDeps & { adminRequestAuthorized: (request: AdminHttpRequest) => Promise<boolean> }
): void => {
  const now = deps.now ?? (() => Date.now());

  app.get("/admin/players/insights", async (request, reply) => {
    if (!(await deps.adminRequestAuthorized(request))) {
      reply.code(401);
      reply.header("Content-Type", "text/plain");
      return "unauthorized\n";
    }
    reply.header("Content-Type", "text/html; charset=utf-8");
    reply.header("Cache-Control", "no-store");
    return PLAYER_INSIGHTS_HTML;
  });

  app.get("/admin/players/insights.json", async (request, reply) => {
    if (!(await deps.adminRequestAuthorized(request))) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    const windowDays = parseWindowDays((request.query as { days?: unknown } | undefined)?.days);
    const at = now();
    // Players and their sessions are loaded for the whole retention window so a
    // player active in-window still shows their full session history.
    const [players, sessions, acquisition] = await Promise.all([
      deps.store.listPlayers(),
      deps.store.listSessions(at - INSIGHTS_MAX_WINDOW_DAYS * 24 * 60 * 60_000),
      deps.store.listAcquisitionSteps(at - windowDays * 24 * 60 * 60_000)
    ]);
    const names = new Map<string, string>();
    await Promise.all(
      players.map(async (row) => {
        const name = await deps.getPlayerName(row.playerId).catch(() => undefined);
        if (name) names.set(row.playerId, name);
      })
    );
    return { ok: true, insights: buildPlayerInsights({ players, sessions, acquisition, names, now: at, windowDays }), counters: deps.tracker.counters() };
  });

  // Anonymous pre-login funnel beacon from the play client (navigator.sendBeacon,
  // text/plain so no CORS preflight). Public by design: validated, rate-capped,
  // deduped per (visitor, step) and pruned by the tracker/store.
  app.post("/api/funnel", { bodyLimit: FUNNEL_BEACON_BODY_LIMIT_BYTES }, async (request, reply) => {
    const result = deps.tracker.recordAcquisitionBeacon(request.body);
    reply.code(result === "recorded" ? 204 : result === "rate_limited" ? 429 : 400);
    return "";
  });
};
