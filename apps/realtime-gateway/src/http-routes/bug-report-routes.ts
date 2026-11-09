import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { GatewayDebugEvent } from "./http-routes.js";
import type { BugReportInput } from "../slack-alerts/slack-alerts.js";
import { selectBugReportServerEvents } from "./bug-report-server-events.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RecentEventsFn = () => GatewayDebugEvent[];
type AlertFn = (report: BugReportInput) => void;

// ---------------------------------------------------------------------------
// Module-level state (set once at startup via setBugReportAlerter)
// ---------------------------------------------------------------------------

let recentEventsFn: RecentEventsFn | undefined;
let alertFn: AlertFn | undefined;
let suggestionAlertFn: AlertFn | undefined;

export const setBugReportAlerter = (args: {
  recentEvents: RecentEventsFn;
  alertPlayerBugReport: AlertFn;
  alertPlayerSuggestion: AlertFn;
}): void => {
  recentEventsFn = args.recentEvents;
  alertFn = args.alertPlayerBugReport;
  suggestionAlertFn = args.alertPlayerSuggestion;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BUG_REPORT_RATE_WINDOW_MS = 60 * 60_000;
const BUG_REPORT_RATE_MAX = 5;

// Hard cap on distinct IPs tracked at once. Without this, `rateLimit` grows by
// one entry per unique IP that ever calls this endpoint and never shrinks —
// exactly the unbounded-Map pattern that has previously frozen the gateway
// event loop (see docs/agents/state-and-persistence-discipline.md). Map
// iteration order is insertion order, and we delete+re-set on every touch, so
// the oldest key is always the least-recently-active one to evict.
const BUG_REPORT_RATE_MAP_MAX_IPS = 2_000;

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

const registerPlayerReportRoute = (
  app: FastifyInstance,
  path: string,
  unavailableError: string,
  rateMapWarnEvent: string,
  getAlertFn: () => AlertFn | undefined
): void => {
  const rateLimit = new Map<string, number[]>();

  app.post(path, async (request, reply) => {
    const alert = getAlertFn();
    if (!alert || !recentEventsFn) {
      reply.code(503);
      return { ok: false, error: unavailableError };
    }

    const ip = request.ip ?? "unknown";
    const now = Date.now();
    const timestamps = rateLimit.get(ip) ?? [];
    const recent = timestamps.filter((t) => now - t < BUG_REPORT_RATE_WINDOW_MS);
    if (recent.length >= BUG_REPORT_RATE_MAX) {
      reply.code(429);
      return { ok: false, error: "rate limit exceeded — try again later" };
    }
    recent.push(now);
    // Delete-then-set moves this IP to the end of Map iteration order,
    // marking it most-recently-active for the eviction check below.
    rateLimit.delete(ip);
    rateLimit.set(ip, recent);
    if (rateLimit.size > BUG_REPORT_RATE_MAP_MAX_IPS) {
      const oldestIp = rateLimit.keys().next().value;
      if (oldestIp !== undefined) {
        rateLimit.delete(oldestIp);
        app.log.warn({ trackedIps: rateLimit.size }, rateMapWarnEvent);
      }
    }

    const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (description.length === 0) {
      reply.code(400);
      return { ok: false, error: "description is required" };
    }

    const clientContext = typeof body.clientContext === "object" && body.clientContext !== null
      ? body.clientContext as Record<string, unknown>
      : {};
    const metadata = typeof body.metadata === "object" && body.metadata !== null
      ? body.metadata as Record<string, unknown>
      : {};
    const clientEvents = Array.isArray(body.clientEvents) ? body.clientEvents as BugReportInput["clientEvents"] : [];
    const playerId = typeof clientContext.me === "string" && clientContext.me.length > 0 ? clientContext.me : "unknown";
    const playerName = typeof clientContext.meName === "string" ? clientContext.meName : "unknown";
    const serverEvents = selectBugReportServerEvents(recentEventsFn(), playerId);
    const reportId = randomUUID();

    // Durable breadcrumb: the email is the only other copy of the report, so
    // log enough to find it (and correlate with surrounding gateway logs)
    // even if the email never arrives.
    app.log.info(
      {
        reportId,
        path,
        playerId,
        playerName,
        description: description.slice(0, 1_000),
        clientEventCount: clientEvents.length,
        serverEventCount: serverEvents.length,
        serverBuildSha: clientContext.bridgeDebugServerBuildSha,
        seasonId: clientContext.bridgeDebugSeasonId
      },
      "player_bug_report"
    );

    alert({
      reportId,
      description: description.slice(0, 1_000),
      playerName,
      playerId,
      clientEvents: clientEvents.slice(-100),
      serverEvents,
      clientContext,
      metadata
    });

    return { ok: true, reportId };
  });
};

export const registerBugReportRoutes = (app: FastifyInstance): void => {
  registerPlayerReportRoute(app, "/api/bug-reports", "bug reports are unavailable", "bug_report_rate_map_evicted", () => alertFn);
  registerPlayerReportRoute(app, "/api/suggestions", "suggestions are unavailable", "suggestion_rate_map_evicted", () => suggestionAlertFn);
};
