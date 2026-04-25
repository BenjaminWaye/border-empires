import { describe, expect, it } from "vitest";
import Fastify from "fastify";

import { registerGatewayHttpRoutes } from "./http-routes.js";

describe("gateway http routes", () => {
  it("serves health and debug bundle with CORS headers", async () => {
    const app = Fastify();
    registerGatewayHttpRoutes(app, {
      startupStartedAt: 1_000,
      simulationAddress: "127.0.0.1:50051",
      simulationSeedProfile: "default",
      health: () => ({
        ok: true,
        simulation: {
          connected: true,
          lastReadyAt: 1_100
        }
      }),
      snapshotDir: "/tmp/snapshot",
      supportedMessageTypes: ["ATTACK", "COLLECT_VISIBLE"],
      recentEvents: () => [{ at: 1_200, level: "info", event: "gateway_started", payload: {} }],
      attackDebug: () => ({
        controlPath: [{ at: 1_210, level: "info", event: "gateway_auth", payload: { channel: "control" } }],
        hotPath: [{ at: 1_220, level: "warn", event: "pending_input_to_state", payload: { commandId: "cmd-1", ageMs: 8_000 } }],
        slowOrWarn: [{ at: 1_220, level: "warn", event: "pending_input_to_state", payload: { commandId: "cmd-1", ageMs: 8_000 } }]
      }),
      attackTraces: () => [
        {
          traceId: "cmd-1",
          firstAt: 1_220,
          lastAt: 1_230,
          events: [
            { at: 1_220, level: "warn", event: "pending_input_to_state", payload: { commandId: "cmd-1", ageMs: 8_000 } },
            { at: 1_230, level: "warn", event: "simulation_submit_failed", payload: { commandId: "cmd-1" } }
          ]
        }
      ],
      metrics: () => "gateway_event_loop_max_ms 4\n"
    });

    const healthResponse = await app.inject({ method: "GET", url: "/health", headers: { origin: "http://localhost:5173" } });
    expect(healthResponse.statusCode).toBe(200);
    expect(healthResponse.headers["access-control-allow-origin"]).toBe("*");
    expect(healthResponse.json()).toEqual({
      ok: true,
      simulation: {
        connected: true,
        lastReadyAt: 1_100
      }
    });

    const healthzResponse = await app.inject({ method: "GET", url: "/healthz" });
    expect(healthzResponse.statusCode).toBe(200);
    expect(healthzResponse.json()).toEqual(healthResponse.json());

    const metricsResponse = await app.inject({ method: "GET", url: "/metrics" });
    expect(metricsResponse.statusCode).toBe(200);
    expect(metricsResponse.headers["content-type"]).toContain("text/plain");
    expect(metricsResponse.body).toContain("gateway_event_loop_max_ms 4");

    const debugResponse = await app.inject({ method: "GET", url: "/admin/runtime/debug-bundle", headers: { origin: "http://localhost:5173" } });
    expect(debugResponse.statusCode).toBe(200);
    expect(debugResponse.headers["access-control-allow-origin"]).toBe("*");
    expect(debugResponse.json()).toEqual(
      expect.objectContaining({
        ok: true,
        recentServerEvents: [expect.objectContaining({ event: "gateway_started" })],
        attackDebug: {
          controlPath: [expect.objectContaining({ event: "gateway_auth" })],
          hotPath: [expect.objectContaining({ event: "pending_input_to_state" })],
          slowOrWarn: [expect.objectContaining({ event: "pending_input_to_state" })]
        },
        attackTraces: [expect.objectContaining({ traceId: "cmd-1" })],
        runtime: {
          gateway: expect.objectContaining({
            simulationAddress: "127.0.0.1:50051",
            snapshotBridgeEnabled: true
          })
        }
      })
    );
    await app.close();
  });

  it("returns 503 when simulation connectivity is down", async () => {
    const app = Fastify();
    registerGatewayHttpRoutes(app, {
      startupStartedAt: 1_000,
      simulationAddress: "127.0.0.1:50051",
      simulationSeedProfile: "default",
      health: () => ({
        ok: false,
        simulation: {
          connected: false,
          lastError: "simulation ping timed out after 1500ms"
        }
      }),
      supportedMessageTypes: ["ATTACK"],
      recentEvents: () => [],
      attackDebug: () => ({ controlPath: [], hotPath: [], slowOrWarn: [] }),
      attackTraces: () => [],
      metrics: () => ""
    });

    const healthResponse = await app.inject({ method: "GET", url: "/health" });
    expect(healthResponse.statusCode).toBe(503);
    expect(healthResponse.json()).toEqual({
      ok: false,
      simulation: {
        connected: false,
        lastError: "simulation ping timed out after 1500ms"
      }
    });

    await app.close();
  });

  it("surfaces slow and failed gateway events in the debug bundle traces", async () => {
    const app = Fastify();
    registerGatewayHttpRoutes(app, {
      startupStartedAt: 1_000,
      simulationAddress: "127.0.0.1:50051",
      simulationSeedProfile: "default",
      health: () => ({
        ok: true,
        simulation: {
          connected: true
        }
      }),
      supportedMessageTypes: ["ATTACK"],
      recentEvents: () => [
        { at: 1_200, level: "info", event: "gateway_started", payload: {} },
        { at: 1_250, level: "warn", event: "gateway_command_submit_slow", payload: { durationMs: 1400 } }
      ],
      metrics: () => ""
    });

    const debugResponse = await app.inject({ method: "GET", url: "/admin/runtime/debug-bundle" });
    expect(debugResponse.statusCode).toBe(200);
    expect(debugResponse.json()).toEqual(
      expect.objectContaining({
        attackDebug: expect.objectContaining({
          hotPath: [expect.objectContaining({ event: "gateway_command_submit_slow" })],
          slowOrWarn: [expect.objectContaining({ event: "gateway_command_submit_slow" })]
        }),
        attackTraces: [expect.objectContaining({ event: "gateway_command_submit_slow" })]
      })
    );

    await app.close();
  });
});
