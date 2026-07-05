import type { FastifyInstance } from "fastify";
import type {
  CurrentSeasonSummary,
  SeasonArchiveRow,
  SeasonLifecycleStatus
} from "@border-empires/sim-protocol";
import { randomBytes } from "node:crypto";

import type { GatewayResolvedIdentity } from "../auth-identity/auth-identity.js";
import { RUNTIME_DASHBOARD_HTML } from "../runtime-dashboard-html.js";
import { rallyAnchorFromTiles } from "../rally-link-anchor.js";
import {
  rallyLinkIsActive,
  toRallyLinkPublicView,
  type RallyAnchor,
  type RallyLink,
  type RallyLinkStore
} from "../rally-link-store/rally-link-store.js";
import { registerGalaxyRoutes } from "../galaxy-routes/galaxy-routes.js";
import type { GalaxyPlanetStore } from "../galaxy-planet-store/galaxy-planet-store.js";
import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";

export type GatewayDebugEvent = {
  at: number;
  level: "info" | "warn" | "error";
  event: string;
  payload: Record<string, unknown>;
};

export type GatewayAttackDebug = {
  controlPath: GatewayDebugEvent[];
  hotPath: GatewayDebugEvent[];
  slowOrWarn: GatewayDebugEvent[];
};

export type GatewayAttackTrace = {
  traceId: string;
  firstAt: number;
  lastAt: number;
  events: GatewayDebugEvent[];
};

export type RegisterGatewayHttpRoutesDeps = {
  startupStartedAt: number;
  simulationAddress: string;
  simulationSeedProfile: string;
  health: () => {
    ok: boolean;
    simulation: {
      connected: boolean;
      lastReadyAt?: number;
      lastError?: string;
    };
  };
  snapshotDir?: string;
  runtimeIdentity?: {
    sourceType: "legacy-snapshot" | "seed-profile";
    seasonId: string;
    worldSeed: number;
    fingerprint: string;
    snapshotLabel?: string;
    seedProfile?: string;
    playerCount: number;
    seededTileCount: number;
  };
  supportedMessageTypes: string[];
  recentEvents: () => GatewayDebugEvent[];
  attackDebug: () => GatewayAttackDebug;
  attackTraces: () => GatewayAttackTrace[];
  metrics: () => string;
  // Fetches the simulation's Prometheus metrics text from its loopback HTTP
  // server (127.0.0.1:50052 in the combined deployment). The sim metrics port
  // is never exposed externally, so the gateway proxies it for the runtime
  // dashboard / single scrape URL. Resolves to "" when unreachable so the
  // gateway-side series still render.
  getSimMetrics?: () => Promise<string>;
  getCurrentSeasonSummary: () => Promise<CurrentSeasonSummary>;
  getCurrentSeasonStatus: () => Promise<SeasonLifecycleStatus>;
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
  startNextSeason: (force?: boolean) => Promise<{ seasonId: string }>;
  seedBarbarians?: (count?: number) => Promise<{ requested: number; placed: number; detail: Record<string, unknown> }>;
  adminApiToken?: string;
  playOrigin?: string;
  authenticateBearer?: (authorizationHeader: string | undefined) => Promise<GatewayResolvedIdentity | undefined>;
  rallyLinkStore?: RallyLinkStore;
  preparePlayer?: (playerId: string) => Promise<{ playerId: string; spawned: boolean }>;
  subscribePlayer?: (playerId: string) => Promise<{
    player?: { name?: string };
    tiles: Array<{ x: number; y: number; ownerId?: string | undefined; ownershipState?: string | undefined; townType?: string | undefined }>;
  }>;
  galaxyPlanetStore?: GalaxyPlanetStore;
  authBindingStore?: GatewayAuthBindingStore;
};

const addCorsHeaders = (app: FastifyInstance): void => {
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization");
    return payload;
  });

  app.options("/*", async (_request, reply) => {
    reply.code(204);
    return "";
  });
};

export const registerGatewayHttpRoutes = (app: FastifyInstance, deps: RegisterGatewayHttpRoutesDeps): void => {
  addCorsHeaders(app);
  const playOrigin = deps.playOrigin ?? process.env.PLAY_ORIGIN ?? "https://play.borderempires.com";

  const adminAuthorized = (authorizationHeader: string | undefined): boolean => {
    if (!deps.adminApiToken) return false;
    return authorizationHeader === `Bearer ${deps.adminApiToken}`;
  };

  // NOTE: /health is intentionally O(1) — it only reads cached structs and
  // never touches the event loop, sim RPC, or AI state, so it stays responsive
  // even while the sim worker is saturated. It is a LIVENESS probe, not a perf
  // signal: performance numbers (event-loop lag, sim/AI tick durations, queue
  // backlog, command latency) live at /metrics (gateway) and
  // /admin/runtime/metrics (gateway + sim combined). Anything reading /health
  // for perf is reading the wrong endpoint.
  const readHealth = () => {
    const health = deps.health();
    return {
      statusCode: health.ok ? 200 : 503,
      body: {
        ok: health.ok,
        startupElapsedMs: Date.now() - deps.startupStartedAt,
        metricsHint: "perf metrics at /metrics and /admin/runtime/metrics",
        simulation: health.simulation,
        runtimeIdentity: deps.runtimeIdentity
      }
    };
  };

  app.get("/health", async (_request, reply) => {
    const health = readHealth();
    reply.code(health.statusCode);
    return health.body;
  });

  app.get("/healthz", async (_request, reply) => {
    const health = deps.health();
    reply.code(200);
    return {
      ok: true,
      readiness: {
        ok: health.ok,
        simulation: health.simulation
      },
      runtimeIdentity: deps.runtimeIdentity
    };
  });

  app.get("/admin/runtime/debug-bundle", async () => ({
    ok: true,
    at: Date.now(),
    health: {
      ...deps.health(),
      startupElapsedMs: Date.now() - deps.startupStartedAt
    },
    recentServerEvents: deps.recentEvents(),
    attackDebug: deps.attackDebug(),
    attackTraces: deps.attackTraces(),
    runtime: {
      gateway: {
        simulationAddress: deps.simulationAddress,
        simulationSeedProfile: deps.simulationSeedProfile,
        snapshotBridgeEnabled: Boolean(deps.snapshotDir),
        runtimeIdentity: deps.runtimeIdentity,
        supportedMessageTypes: deps.supportedMessageTypes
      }
    }
  }));

  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", "text/plain; version=0.0.4");
    return deps.metrics();
  });

  // Single token-gated scrape URL combining gateway-side and (proxied) sim-side
  // Prometheus series, so AI-on vs AI-off staging runs can be compared from a
  // laptop without flyctl-ssh'ing the loopback :50052 metrics port.
  const adminRequestAuthorized = (request: { headers: Record<string, unknown>; query?: unknown }): boolean => {
    const headerAuth = typeof request.headers.authorization === "string" ? request.headers.authorization : undefined;
    if (adminAuthorized(headerAuth)) return true;
    // ?token= fallback so the dashboard page (which cannot set Authorization on
    // a plain <fetch> without CORS preflight friction) can pass the same token.
    const queryToken = (request.query as { token?: string } | undefined)?.token;
    return Boolean(deps.adminApiToken) && queryToken === deps.adminApiToken;
  };

  app.get("/admin/runtime/metrics", async (request, reply) => {
    if (!adminRequestAuthorized(request)) {
      reply.code(401);
      return "unauthorized\n";
    }
    reply.header("Content-Type", "text/plain; version=0.0.4");
    const gatewayText = deps.metrics();
    let simText = "# sim metrics proxy not wired\n";
    if (deps.getSimMetrics) {
      try {
        simText = await deps.getSimMetrics();
      } catch (error) {
        simText = `# sim metrics unreachable: ${error instanceof Error ? error.message : String(error)}\n`;
      }
    }
    return `${gatewayText}\n# ---- simulation metrics (proxied from loopback :50052) ----\n${simText}`;
  });

  app.get("/admin/runtime/dashboard", async (request, reply) => {
    if (!adminRequestAuthorized(request)) {
      reply.code(401);
      reply.header("Content-Type", "text/plain");
      return "unauthorized\n";
    }
    reply.header("Content-Type", "text/html; charset=utf-8");
    return RUNTIME_DASHBOARD_HTML;
  });

  app.get("/hq/summary", async (_request, reply) => {
    try {
      return await deps.getCurrentSeasonSummary();
    } catch (error) {
      reply.code(503);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "failed to load current season summary"
      };
    }
  });

  app.get("/hq/archives", async (_request, reply) => {
    try {
      return {
        archives: await deps.listSeasonArchives()
      };
    } catch (error) {
      reply.code(503);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "failed to load season archives"
      };
    }
  });

  const bearerToken = (authorizationHeader: string | undefined): string | undefined => {
    if (!authorizationHeader?.startsWith("Bearer ")) return undefined;
    const token = authorizationHeader.slice("Bearer ".length).trim();
    return token.length > 0 ? token : undefined;
  };

  const requireRallyAuth = async (authorizationHeader: string | undefined): Promise<GatewayResolvedIdentity | undefined> => {
    if (!bearerToken(authorizationHeader)) return undefined;
    return deps.authenticateBearer?.(authorizationHeader);
  };

  const activeOwnerAnchor = async (playerId: string): Promise<RallyAnchor | undefined> => {
    if (!deps.subscribePlayer) return undefined;
    const snapshot = await deps.subscribePlayer(playerId);
    return rallyAnchorFromTiles(playerId, snapshot.tiles);
  };

  const seasonIsActive = async (): Promise<boolean> => {
    try {
      return (await deps.getCurrentSeasonStatus()) === "active";
    } catch {
      return false;
    }
  };

  const publicRallyView = async (link: RallyLink, now: number) => {
    if (!rallyLinkIsActive(link, now)) return undefined;
    if (!(await seasonIsActive())) return undefined;
    if (!(await activeOwnerAnchor(link.ownerPlayerId))) return undefined;
    return toRallyLinkPublicView(link, playOrigin);
  };

  app.post("/rally/links", async (request, reply) => {
    if (!deps.rallyLinkStore || !deps.authenticateBearer || !deps.preparePlayer || !deps.subscribePlayer) {
      reply.code(503);
      return { ok: false, error: "rally links are unavailable" };
    }
    const identity = await requireRallyAuth(typeof request.headers.authorization === "string" ? request.headers.authorization : undefined);
    if (!identity) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    if (!(await seasonIsActive())) {
      reply.code(409);
      return { ok: false, error: "season is not active" };
    }
    const now = Date.now();
    const active = await deps.rallyLinkStore.listActiveForOwner(identity.playerId, now);
    if (active.length >= 10) {
      reply.code(429);
      return { ok: false, error: "active rally link limit reached" };
    }
    const createdLastHour = await deps.rallyLinkStore.countCreatedSince(identity.playerId, now - 60 * 60_000);
    if (createdLastHour >= 5) {
      reply.code(429);
      return { ok: false, error: "rally link creation rate limit reached" };
    }
    const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
    const ttlHours = typeof body.ttlHours === "number" && Number.isFinite(body.ttlHours)
      ? Math.min(24 * 30, Math.max(1, Math.floor(body.ttlHours)))
      : 168;
    const maxUses = typeof body.maxUses === "number" && Number.isFinite(body.maxUses)
      ? Math.min(50, Math.max(1, Math.floor(body.maxUses)))
      : 5;
    const note = typeof body.note === "string" && body.note.trim().length > 0 ? body.note.trim().slice(0, 120) : undefined;

    await deps.preparePlayer(identity.playerId);
    const anchor = await activeOwnerAnchor(identity.playerId);
    if (!anchor) {
      reply.code(409);
      return { ok: false, error: "owner has no active empire anchor" };
    }
    const link = await deps.rallyLinkStore.create({
      code: `r_${randomBytes(9).toString("base64url")}`,
      ownerPlayerId: identity.playerId,
      ownerName: identity.playerName,
      ...(note ? { note } : {}),
      anchor,
      createdAt: now,
      expiresAt: now + ttlHours * 60 * 60_000,
      maxUses
    });
    return toRallyLinkPublicView(link, playOrigin);
  });

  app.get("/rally/links/mine", async (request, reply) => {
    if (!deps.rallyLinkStore || !deps.authenticateBearer) {
      reply.code(503);
      return { ok: false, error: "rally links are unavailable" };
    }
    const identity = await requireRallyAuth(typeof request.headers.authorization === "string" ? request.headers.authorization : undefined);
    if (!identity) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    const now = Date.now();
    const links = await Promise.all((await deps.rallyLinkStore.listActiveForOwner(identity.playerId, now)).map((link) => publicRallyView(link, now)));
    return { links: links.filter((link): link is NonNullable<typeof link> => Boolean(link)) };
  });

  app.get("/rally/links/:code", async (request, reply) => {
    if (!deps.rallyLinkStore) {
      reply.code(503);
      return { ok: false, error: "rally links are unavailable" };
    }
    const code = (request.params as { code?: string }).code ?? "";
    const link = await deps.rallyLinkStore.get(code);
    const view = link ? await publicRallyView(link, Date.now()) : undefined;
    if (!view) {
      reply.code(404);
      return { ok: false, error: "rally link not found" };
    }
    return view;
  });

  app.delete("/rally/links/:code", async (request, reply) => {
    if (!deps.rallyLinkStore || !deps.authenticateBearer) {
      reply.code(503);
      return { ok: false, error: "rally links are unavailable" };
    }
    const identity = await requireRallyAuth(typeof request.headers.authorization === "string" ? request.headers.authorization : undefined);
    if (!identity) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    const code = (request.params as { code?: string }).code ?? "";
    const revoked = await deps.rallyLinkStore.revoke(identity.playerId, code, Date.now());
    if (!revoked) {
      reply.code(404);
      return { ok: false, error: "rally link not found" };
    }
    return { ok: true };
  });

  app.post("/admin/season/start-next", async (request, reply) => {
    const authorization = typeof request.headers.authorization === "string" ? request.headers.authorization : undefined;
    if (!adminAuthorized(authorization)) {
      reply.code(401);
      return {
        ok: false,
        error: "unauthorized"
      };
    }

    try {
      const query = request.query as { force?: string | boolean | number } | undefined;
      const result = await deps.startNextSeason(forceRequested(query?.force));
      return {
        ok: true,
        seasonId: result.seasonId
      };
    } catch (error) {
      reply.code(409);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "failed to start next season"
      };
    }
  });

  // Ops-only: non-destructively reintroduce barbarians into the live world.
  // Barbs only spawn at worldgen and have no maintenance respawn, so this is
  // how an extinct barbarian population is brought back without a season reset.
  // ?count=N overrides the default (INITIAL_BARBARIAN_COUNT); the sim caps it.
  app.post("/admin/barbarians/seed", async (request, reply) => {
    const authorization = typeof request.headers.authorization === "string" ? request.headers.authorization : undefined;
    if (!adminAuthorized(authorization)) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    if (!deps.seedBarbarians) {
      reply.code(501);
      return { ok: false, error: "seedBarbarians not wired" };
    }
    try {
      const query = request.query as { count?: string | number } | undefined;
      const parsedCount = typeof query?.count !== "undefined" ? Number(query.count) : undefined;
      const count = typeof parsedCount === "number" && Number.isFinite(parsedCount) ? parsedCount : undefined;
      const result = await deps.seedBarbarians(count);
      return { ok: true, requested: result.requested, placed: result.placed, detail: result.detail };
    } catch (error) {
      reply.code(409);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "failed to seed barbarians"
      };
    }
  });

  registerGalaxyRoutes(app, {
    listSeasonArchives: deps.listSeasonArchives,
    getCurrentSeasonSummary: deps.getCurrentSeasonSummary,
    ...(deps.authenticateBearer ? { authenticateBearer: deps.authenticateBearer } : {}),
    ...(deps.galaxyPlanetStore ? { galaxyPlanetStore: deps.galaxyPlanetStore } : {}),
    ...(deps.authBindingStore ? { authBindingStore: deps.authBindingStore } : {})
  });
};
  const forceRequested = (value: unknown): boolean =>
    value === true || value === "true" || value === "1" || value === 1;
