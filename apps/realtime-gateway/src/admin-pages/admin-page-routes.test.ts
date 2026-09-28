import { describe, expect, it } from "vitest";
import Fastify from "fastify";

import { registerGatewayHttpRoutes, type RegisterGatewayHttpRoutesDeps } from "../http-routes/http-routes.js";
import { InMemoryPlayerFunnelStore } from "../player-funnel-store/player-funnel-store.js";
import { createPlayerFunnelTracker } from "../player-funnel-tracker/player-funnel-tracker.js";
import { ADMIN_ROUTE_SECTIONS } from "./admin-page-catalog.js";

const TOKEN = "admin-test-token-9f3";

// Minimal deps stub — only what route registration and the admin page routes
// touch; cast the partial through the exported type at the single test seam.
const baseDeps = (overrides: Partial<RegisterGatewayHttpRoutesDeps> = {}): RegisterGatewayHttpRoutesDeps =>
  ({
    startupStartedAt: 1_000,
    simulationAddress: "127.0.0.1:50051",
    simulationSeedProfile: "default",
    health: () => ({ ok: true, simulation: { connected: true } }),
    supportedMessageTypes: [],
    recentEvents: () => [],
    attackDebug: () => ({ controlPath: [], hotPath: [], slowOrWarn: [] }),
    attackTraces: () => [],
    metrics: () => "gateway_up 1",
    getCurrentSeasonSummary: async () => {
      throw new Error("unused");
    },
    getCurrentSeasonStatus: async () => "active",
    listSeasonArchives: async () => [],
    getAdminPlayers: async () => [],
    getRecentCommands: async () => ({ commands: [] }),
    startNextSeason: async () => ({ seasonId: "season-2" }),
    adminApiToken: TOKEN,
    playerInsights: (() => {
      const store = new InMemoryPlayerFunnelStore();
      return { store, tracker: createPlayerFunnelTracker({ store, now: () => 0, isAiPlayerId: () => false, onStoreError: () => {} }), getPlayerName: async () => undefined };
    })(),
    ...overrides
  }) as RegisterGatewayHttpRoutesDeps;

const catalogKeys = new Set(
  ADMIN_ROUTE_SECTIONS.flatMap((section) => section.routes).map((route) => `${route.method} ${route.path}`)
);

const registeredAdminRouteKeys = async (): Promise<Set<string>> => {
  const app = Fastify();
  const keys = new Set<string>();
  app.addHook("onRoute", (route) => {
    if (!route.url.startsWith("/admin")) return;
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    const path = route.url.length > 1 ? route.url.replace(/\/$/, "") : route.url;
    for (const method of methods) if (method !== "HEAD") keys.add(`${method} ${path}`);
  });
  registerGatewayHttpRoutes(app, baseDeps());
  await app.ready();
  return keys;
};

describe("admin navigation page", () => {
  it("lists every registered /admin route, so new admin endpoints can't go missing from the nav", async () => {
    const registered = await registeredAdminRouteKeys();
    expect(registered.size).toBeGreaterThan(0);
    const missingFromCatalog = [...registered].filter((key) => !catalogKeys.has(key));
    expect(missingFromCatalog).toEqual([]);
  });

  it("does not list /admin routes that are no longer registered", async () => {
    const registered = await registeredAdminRouteKeys();
    const stale = [...catalogKeys].filter((key) => key.split(" ")[1]!.startsWith("/admin") && !registered.has(key));
    expect(stale).toEqual([]);
  });

  it("requires admin auth", async () => {
    const app = Fastify();
    registerGatewayHttpRoutes(app, baseDeps());
    const response = await app.inject({ method: "GET", url: "/admin" });
    expect(response.statusCode).toBe(401);
  });

  it("serves the nav page for ?token= and with a trailing slash", async () => {
    const app = Fastify();
    registerGatewayHttpRoutes(app, baseDeps());
    for (const url of [`/admin?token=${TOKEN}`, `/admin/?token=${TOKEN}`]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(response.body).toContain('href="/admin/runtime/dashboard" data-token-forward');
      expect(response.body).toContain("/admin/season/start-next");
      // The token must never be baked into the served HTML.
      expect(response.body).not.toContain(TOKEN);
    }
  });

  it("keeps the moved runtime dashboard and metrics routes working", async () => {
    const app = Fastify();
    registerGatewayHttpRoutes(app, baseDeps({ getSimMetrics: async () => "sim_up 1" }));
    const dashboard = await app.inject({ method: "GET", url: `/admin/runtime/dashboard?token=${TOKEN}` });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.headers["content-type"]).toContain("text/html");
    const metrics = await app.inject({ method: "GET", url: "/admin/runtime/metrics", headers: { authorization: `Bearer ${TOKEN}` } });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.body).toContain("gateway_up 1");
    expect(metrics.body).toContain("sim_up 1");
    const unauthorized = await app.inject({ method: "GET", url: "/admin/runtime/metrics" });
    expect(unauthorized.statusCode).toBe(401);
  });
});
