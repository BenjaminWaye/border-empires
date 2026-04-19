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
      recentEvents: () => [{ at: 1_200, level: "info", event: "gateway_started", payload: {} }]
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

    const debugResponse = await app.inject({ method: "GET", url: "/admin/runtime/debug-bundle", headers: { origin: "http://localhost:5173" } });
    expect(debugResponse.statusCode).toBe(200);
    expect(debugResponse.headers["access-control-allow-origin"]).toBe("*");
    expect(debugResponse.json()).toEqual(
      expect.objectContaining({
        ok: true,
        recentServerEvents: [expect.objectContaining({ event: "gateway_started" })],
        attackDebug: {
          controlPath: [],
          hotPath: [],
          slowOrWarn: []
        },
        attackTraces: [],
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
      recentEvents: () => []
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
});
