import type { FastifyInstance } from "fastify";
import type { RegisterGatewayHttpRoutesDeps, GatewayDebugEvent } from "../http-routes/http-routes.js";

// Only scalar diagnostic fields are exported. Never forward arbitrary event
// payloads (auth details, snapshots, other players' combat results or errors).
const SAFE_FIELDS = new Set([
  "commandId", "clientSeq", "messageType", "actionType", "eventType", "stage",
  "durationMs", "elapsedMs", "ageMs", "timeoutMs", "simulationConnected",
  "targetX", "targetY", "persistMs", "submitMs", "payloadType", "channel", "eventLoopMaxMs", "backlogPendingCount"
]);
const METRIC_NAMES = new Set([
  "gateway_event_loop_max_ms", "gateway_event_loop_delay_ms",
  "gateway_command_submit_latency_ms", "gateway_input_to_state_update_latency_ms",
  "gateway_sim_rpc_latency_ms"
]);

type Deps = Pick<RegisterGatewayHttpRoutesDeps,
  "authenticateBearer" | "playerSyncDiagnosticSnapshot" | "recentEvents" | "health" | "metrics" | "startupStartedAt">;

const parsePriorityCommandIds = (value: unknown): { ids: string[]; ignored: number } => {
  const raw = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  const valid = raw.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 160);
  const ids = [...new Set(valid)].slice(0, 20);
  return { ids, ignored: raw.length - ids.length };
};

export const playerSyncEvents = (events: GatewayDebugEvent[], playerId: string, priorityCommandIds: string[] = []): GatewayDebugEvent[] => {
  const owned = events.filter((event) => event.payload.playerId === playerId && typeof event.payload.commandId === "string");
  const priority = new Set(priorityCommandIds);
  // Preserve up to twenty incident traces (24 events each), independently
  // of the recent-traffic window. Identity filtering happens before selection.
  const incidents = owned.filter((event) => priority.has(String(event.payload.commandId))).slice(-480);
  const recent = owned.filter((event) => !priority.has(String(event.payload.commandId))).sort((a, b) => a.at - b.at).slice(-200);
  return [...incidents, ...recent].sort((a, b) => a.at - b.at).map((event) => ({
    at: event.at, level: event.level, event: event.event,
    payload: Object.fromEntries(Object.entries(event.payload).filter(([key, value]) =>
      SAFE_FIELDS.has(key) && (typeof value === "number" || typeof value === "boolean" || typeof value === "string")))
  }));
};

export const registerPlayerSyncDiagnostics = (app: FastifyInstance, deps: Deps): void => {
  app.get<{ Querystring: { commandId?: string | string[] } }>("/api/player/sync-diagnostics", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const identity = await deps.authenticateBearer?.(request.headers.authorization).catch(() => undefined);
    if (!identity) {
      reply.code(401);
      return { ok: false, error: "sign in to collect your server command diagnostics" };
    }
    const at = Date.now();
    const health = deps.health();
    const retained = deps.playerSyncDiagnosticSnapshot?.(identity.playerId);
    const source = retained?.events ?? deps.recentEvents();
    const priority = parsePriorityCommandIds(request.query.commandId);
    const recentServerEvents = playerSyncEvents(source, identity.playerId, priority.ids);
    const priorityIds = new Set(priority.ids);
    return {
      ok: true, at, playerId: identity.playerId,
      serverBuildSha: process.env.BUILD_SHA ?? process.env.GATEWAY_BUILD_SHA ?? "",
      serverStartedAt: deps.startupStartedAt,
      health: {
        ok: health.ok, startupElapsedMs: at - deps.startupStartedAt,
        simulation: {
          connected: health.simulation.connected,
          backlogPendingCount: health.simulation.backlogPendingCount
        }
      },
      // These are explicitly collection-time samples, not incident-time measurements.
      metricsAt: at,
      metrics: deps.metrics().split("\n").filter((line) => METRIC_NAMES.has(line.split(/[ {]/, 1)[0] ?? "")).slice(0, 30),
      retention: {
        ...retained?.retention,
        playerEventsAvailable: source.filter((event) => event.payload.playerId === identity.playerId && typeof event.payload.commandId === "string").length,
        playerEventsReturned: recentServerEvents.length,
        priorityCommandIdsRequested: priority.ids.length,
        priorityCommandIdsIgnored: priority.ignored,
        priorityEventsReturned: recentServerEvents.filter((event) => priorityIds.has(String(event.payload.commandId))).length
      },
      recentServerEvents
    };
  });
};
