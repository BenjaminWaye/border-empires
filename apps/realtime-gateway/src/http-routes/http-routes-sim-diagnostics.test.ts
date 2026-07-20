import { describe, expect, it } from "vitest";
import Fastify from "fastify";

import { registerGatewayHttpRoutes, type RegisterGatewayHttpRoutesDeps } from "./http-routes.js";

// Minimal deps stub — only the fields the debug-bundle route reads. Everything
// else on RegisterGatewayHttpRoutesDeps is unused by this route, so cast the
// partial through the exported type at the single test seam.
const baseDeps = (overrides: Partial<RegisterGatewayHttpRoutesDeps>): RegisterGatewayHttpRoutesDeps =>
  ({
    startupStartedAt: 1_000,
    simulationAddress: "127.0.0.1:50051",
    simulationSeedProfile: "default",
    health: () => ({ ok: true, simulation: { connected: true, lastReadyAt: 1_100 } }),
    supportedMessageTypes: [],
    recentEvents: () => [],
    attackDebug: () => ({ controlPath: [], hotPath: [], slowOrWarn: [] }),
    attackTraces: () => [],
    metrics: () => "",
    getCurrentSeasonSummary: async () => {
      throw new Error("unused");
    },
    getCurrentSeasonStatus: async () => "active",
    listSeasonArchives: async () => [],
    getAdminPlayers: async () => [],
    getRecentCommands: async () => ({ commands: [] }),
    startNextSeason: async () => ({ seasonId: "season-2" }),
    ...overrides
  }) as RegisterGatewayHttpRoutesDeps;

describe("gateway debug-bundle sim diagnostics", () => {
  it("includes the sim worker lag-diagnostics ring buffer when a provider is wired", async () => {
    const app = Fastify();
    registerGatewayHttpRoutes(
      app,
      baseDeps({
        simDiagnostics: () => [
          { at: 1_205, level: "warn", event: "gc_pause_detected", durationMs: 3_200, gcKind: "Mark-sweep" }
        ]
      })
    );

    const response = await app.inject({ method: "GET", url: "/admin/runtime/debug-bundle" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        simDiagnostics: [expect.objectContaining({ event: "gc_pause_detected", durationMs: 3_200 })]
      })
    );
    await app.close();
  });

  it("omits simDiagnostics (undefined) when no provider is wired", async () => {
    const app = Fastify();
    registerGatewayHttpRoutes(app, baseDeps({}));

    const response = await app.inject({ method: "GET", url: "/admin/runtime/debug-bundle" });
    expect(response.statusCode).toBe(200);
    expect(response.json().simDiagnostics).toBeUndefined();
    await app.close();
  });
});
