import type { FastifyInstance } from "fastify";
import type { GatewayDebugEvent } from "./http-routes.js";
import type { BugReportInput } from "../slack-alerts/slack-alerts.js";

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

export const setBugReportAlerter = (args: {
  recentEvents: RecentEventsFn;
  alertPlayerBugReport: AlertFn;
}): void => {
  recentEventsFn = args.recentEvents;
  alertFn = args.alertPlayerBugReport;
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

const BUG_REPORT_LIFECYCLE_EVENTS = new Set([
  "player_connected", "player_disconnected", "command_submit",
  "sim_event_latency", "frontier_action_received"
]);

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerBugReportRoutes = (app: FastifyInstance): void => {
  const rateLimit = new Map<string, number[]>();

  app.post("/api/bug-reports", async (request, reply) => {
    if (!alertFn || !recentEventsFn) {
      reply.code(503);
      return { ok: false, error: "bug reports are unavailable" };
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
        app.log.warn({ trackedIps: rateLimit.size }, "bug_report_rate_map_evicted");
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
    const allServerEvents = recentEventsFn();
    // Filter server events: keep warnings/errors plus key lifecycle events.
    // This avoids sending the full 250-event ring buffer — the player's
    // description and client events provide most of the context.
    const serverEvents = allServerEvents
      .filter((e) => e.level !== "info" || BUG_REPORT_LIFECYCLE_EVENTS.has(e.event))
      .slice(-100);

    alertFn({
      description: description.slice(0, 1_000),
      playerName: typeof clientContext.meName === "string" ? clientContext.meName : "unknown",
      playerId: typeof clientContext.me === "string" ? clientContext.me : "unknown",
      clientEvents: clientEvents.slice(-100),
      serverEvents,
      clientContext,
      metadata
    });

    return { ok: true };
  });
};
