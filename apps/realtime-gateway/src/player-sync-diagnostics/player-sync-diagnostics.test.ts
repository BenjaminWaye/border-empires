import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { registerPlayerSyncDiagnostics } from "./player-sync-diagnostics.js";
import type { GatewayDebugEvent } from "../http-routes/http-routes.js";

const events: GatewayDebugEvent[] = [
  { at: 1, level: "info", event: "gateway_frontier_stage", payload: { playerId: "p1", commandId: "own", stage: "received", elapsedMs: 0, token: "secret", combatResult: { defender: "private" } } },
  { at: 2, level: "warn", event: "simulation_submit_rpc_slow", payload: { playerId: "p2", commandId: "other", durationMs: 5000 } },
  { at: 3, level: "info", event: "gateway_auth", payload: { playerId: "p1", authEmail: "private@example.test" } }
];
const setup = (source: GatewayDebugEvent[] = events) => {
  const app = Fastify();
  registerPlayerSyncDiagnostics(app, {
    authenticateBearer: async (header) => header === "Bearer valid" ? { playerId: "p1", playerName: "Player" } : undefined,
    startupStartedAt: 1, health: () => ({ ok: true, simulation: { connected: true, lastError: "private error" } }),
    metrics: () => 'gateway_event_loop_max_ms 12\ngateway_event_loop_delay_ms{quantile="p99"} 8\nprivate_player_metric{player="p2"} 1',
    recentEvents: () => source
  });
  return app;
};

describe("player sync diagnostics", () => {
  it("rejects unauthenticated requests and ignores a client-supplied player identity", async () => {
    const app = setup();
    const response = await app.inject({ url: "/api/player/sync-diagnostics?playerId=p1" });
    expect(response.statusCode).toBe(401);
    expect(response.headers["cache-control"]).toBe("no-store");
    await app.close();
  });

  it("returns only authenticated player's command events and allowed fields", async () => {
    const app = setup();
    const response = await app.inject({ url: "/api/player/sync-diagnostics?playerId=p2", headers: { authorization: "Bearer valid" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ playerId: "p1", serverStartedAt: 1, recentServerEvents: [{ at: 1, payload: { commandId: "own", stage: "received", elapsedMs: 0 } }] });
    for (const secret of ["secret", "private", '"other"', "authEmail"]) expect(response.body).not.toContain(secret);
    expect(response.json().metrics).toHaveLength(2);
    await app.close();
  });
  it("keeps a requested old incident trace despite newer command traffic without exporting another player's trace", async () => {
    const source: GatewayDebugEvent[] = [
      { at: 1, level: "warn", event: "gateway_frontier_stage", payload: { playerId: "p1", commandId: "old-incident", stage: "received" } },
      { at: 2, level: "info", event: "gateway_command_payload_sent", payload: { playerId: "p1", commandId: "old-incident", payloadType: "ACTION_ACCEPTED" } },
      { at: 3, level: "warn", event: "gateway_frontier_stage", payload: { playerId: "p2", commandId: "private-incident", stage: "received" } },
      ...Array.from({ length: 250 }, (_, i): GatewayDebugEvent => ({
        at: i + 10, level: "info", event: "gateway_frontier_stage", payload: { playerId: "p1", commandId: `new-${i}`, stage: "received" }
      }))
    ];
    const app = setup(source);
    const response = await app.inject({ url: "/api/player/sync-diagnostics?commandId=old-incident&commandId=private-incident", headers: { authorization: "Bearer valid" } });
    expect(response.statusCode).toBe(200);
    expect(response.json().recentServerEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ at: 1, payload: expect.objectContaining({ commandId: "old-incident" }) }),
      expect.objectContaining({ at: 2, payload: expect.objectContaining({ commandId: "old-incident" }) })
    ]));
    expect(response.json().recentServerEvents).toHaveLength(202);
    expect(response.body).not.toContain("private-incident");
    await app.close();
  });

  it("bounds requested incident IDs and exported events while reporting the cap", async () => {
    const source: GatewayDebugEvent[] = Array.from({ length: 970 }, (_, i) => ({
      at: i, level: "info", event: "gateway_frontier_stage",
      payload: { playerId: "p1", commandId: i < 720 ? `old-${Math.floor(i / 24)}` : `new-${i}` }
    }));
    const app = setup(source);
    const query = new URLSearchParams();
    for (let i = 0; i < 40; i += 1) query.append("commandId", `old-${i}`);
    const response = await app.inject({ url: `/api/player/sync-diagnostics?${query}`, headers: { authorization: "Bearer valid" } });
    expect(response.json().recentServerEvents).toHaveLength(680);
    expect(response.json().retention).toMatchObject({ priorityCommandIdsRequested: 20, priorityCommandIdsIgnored: 20, priorityEventsReturned: 480 });
    await app.close();
  });

});
