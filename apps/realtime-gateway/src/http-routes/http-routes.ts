import type { FastifyInstance } from "fastify";
import type { AdminPlayerRow, CurrentSeasonSummary, GetRecentCommandsResponse, SeasonArchiveRow, SeasonLifecycleStatus, SeasonParticipationRow } from "@border-empires/sim-protocol";

import type { GatewayResolvedIdentity } from "../auth-identity/auth-identity.js";
import { createAdminAuthorizer, type AdminGithubAuthConfig } from "../admin-auth/admin-auth.js";
import { createAdminIdTokenCheck, type AdminFirebaseAuthConfig } from "../admin-auth/admin-firebase-auth.js";
import { registerAdminPageRoutes } from "../admin-pages/admin-page-routes.js";
import type { RallyLinkStore } from "../rally-link-store/rally-link-store.js";
import { registerGalaxyHttpRoutes } from "./register-galaxy-http-routes.js";
import { registerRallyLinkRoutes } from "./register-rally-link-routes.js";
import { registerCareerRoutes } from "../career-routes/career-routes.js";
import { registerSocialRoutes, type PublicSocialView } from "../social-routes/social-routes.js";
import { registerWorldEngineStrikeRoutes } from "../world-engine-strike-routes/world-engine-strike-routes.js";
import { registerActivityApiRoute, type RegisterActivityApiRouteDeps } from "../activity-api/activity-api-route.js";
import type { PlayerInsightsRouteDeps } from "../player-insights/player-insights-routes.js";
import { addCorsHeaders } from "./cors-headers.js";
import type { GalaxyEndorsementStore } from "../galaxy-endorsement-store/galaxy-endorsement-store.js"; import type { GalaxyDefenseCampaignStore } from "../galaxy-defense-campaign-store/galaxy-defense-campaign-store.js"; import type { GalaxyFleetStore } from "../galaxy-fleet-store/galaxy-fleet-store.js"; import type { GalaxyBattleLogStore } from "../galaxy-battle-log-store/galaxy-battle-log-store.js"; import type { GalaxyExplorationStore } from "../galaxy-exploration-store/galaxy-exploration-store.js";
import type { GalaxyPlanetStore } from "../galaxy-planet-store/galaxy-planet-store.js"; import type { GalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js"; import type { GalaxySenateStore } from "../galaxy-senate-store/galaxy-senate-store.js";
import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { WorldEngineStrikeStore } from "../world-engine-strike-store/world-engine-strike-store.js";

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
      lastError?: string | undefined; backlogPendingCount?: number | undefined; backlogDegraded?: boolean | undefined;
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
  getSeasonParticipationForPlayer?: (playerId: string) => Promise<SeasonParticipationRow[]>;
  getSocialSnapshotForPlayer?: (playerId: string) => PublicSocialView;
  getAdminPlayers: () => Promise<AdminPlayerRow[]>;
  getRecentCommands: (limit?: number) => Promise<GetRecentCommandsResponse>;
  getAiDecisionDiagnostics?: (playerId?: string) => Promise<unknown[]>;
  startNextSeason: (force?: boolean) => Promise<{ seasonId: string }>;
  seedBarbarians?: (count?: number) => Promise<{ requested: number; placed: number; detail: Record<string, unknown> }>;
  adminApiToken?: string;
  adminGithubAuth?: AdminGithubAuthConfig;
  // Google sign-in for the read-only admin endpoints (admin-firebase-auth.ts).
  adminFirebaseAuth?: AdminFirebaseAuthConfig;
  playOrigin?: string;
  simDiagnostics?: () => unknown[];
  authenticateBearer?: (authorizationHeader: string | undefined) => Promise<GatewayResolvedIdentity | undefined>;
  rallyLinkStore?: RallyLinkStore;
  preparePlayer?: (playerId: string, options: { isGuest: boolean }) => Promise<{ playerId: string; spawned: boolean }>;
  subscribePlayer?: (playerId: string) => Promise<{
    player?: { name?: string };
    tiles: Array<{ x: number; y: number; ownerId?: string | undefined; ownershipState?: string | undefined; townType?: string | undefined }>;
  }>;
  galaxyPlanetStore?: GalaxyPlanetStore; galaxyEconomyStore?: GalaxyEconomyStore; galaxySenateStore?: GalaxySenateStore;
  galaxyEndorsementStore?: GalaxyEndorsementStore; galaxyDefenseCampaignStore?: GalaxyDefenseCampaignStore; galaxyFleetStore?: GalaxyFleetStore; galaxyBattleLogStore?: GalaxyBattleLogStore; galaxyExplorationStore?: GalaxyExplorationStore; galaxyDukeService?: import("../galaxy-duke-service/galaxy-duke-service.js").GalaxyDukeService;
  authBindingStore?: GatewayAuthBindingStore;
  worldEngineStrikeStore?: WorldEngineStrikeStore;
  activityApi?: RegisterActivityApiRouteDeps;
  playerInsights?: PlayerInsightsRouteDeps;
};


export const registerGatewayHttpRoutes = (app: FastifyInstance, deps: RegisterGatewayHttpRoutesDeps): void => {
  addCorsHeaders(app);
  const playOrigin = deps.playOrigin ?? process.env.PLAY_ORIGIN ?? "https://play.borderempires.com";

  const { adminAuthorized, adminRequestAuthorized } = createAdminAuthorizer({
    ...(deps.adminApiToken ? { adminApiToken: deps.adminApiToken } : {}),
    ...(deps.adminGithubAuth ? { githubAuth: deps.adminGithubAuth } : {}),
    ...(deps.adminFirebaseAuth ? { isAdminIdToken: createAdminIdTokenCheck(deps.adminFirebaseAuth) } : {})
  });

  // NOTE: /health is intentionally O(1) — it only reads cached structs and never
  // touches the event loop, sim RPC, or AI state, so it stays responsive even while
  // the sim worker is saturated. It is a LIVENESS probe, not a perf signal: perf
  // numbers live at /metrics (gateway) and /admin/runtime/metrics (combined). Anything
  // reading /health for perf is reading the wrong endpoint.
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

  app.get("/admin/runtime/debug-bundle", async (request, reply) => {
    if (!(await adminRequestAuthorized(request))) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    return {
      ok: true,
      at: Date.now(),
      health: {
        ...deps.health(),
        startupElapsedMs: Date.now() - deps.startupStartedAt
      },
      recentServerEvents: deps.recentEvents(),
      simDiagnostics: deps.simDiagnostics?.(),
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
    };
  });

  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", "text/plain; version=0.0.4");
    return deps.metrics();
  });

  registerAdminPageRoutes(app, {
    adminRequestAuthorized,
    metrics: deps.metrics,
    ...(deps.getSimMetrics ? { getSimMetrics: deps.getSimMetrics } : {}),
    ...(deps.playerInsights ? { playerInsights: deps.playerInsights } : {})
  });

  app.get("/admin/players", async (request, reply) => {
    if (!(await adminRequestAuthorized(request))) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    try {
      return { ok: true, players: await deps.getAdminPlayers() };
    } catch (error) {
      reply.code(503);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  app.get("/admin/debug/ai", async (request, reply) => {
    if (!(await adminRequestAuthorized(request))) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    try {
      const [players, commandsResult] = await Promise.all([
        deps.getAdminPlayers(),
        deps.getRecentCommands(100)
      ]);

      const aiPlayers = players.filter(p => p.isAi);
      const aiDebug = aiPlayers.map(player => {
        const playerCommands = commandsResult.commands
          .filter(cmd => cmd.playerId === player.id)
          .slice(0, 5);

        return {
          playerId: player.id,
          name: player.name,
          gold: player.gold,
          incomePerMinute: player.incomePerMinute,
          settledTiles: player.settledTiles,
          ownedTiles: player.ownedTiles,
          manpower: player.manpower,
          manpowerCap: player.manpowerCap,
          techs: player.techs,
          recentCommands: playerCommands.map(cmd => ({
            type: cmd.type,
            commandId: cmd.commandId,
            issuedAt: cmd.issuedAt
          }))
        };
      });

      return { ok: true, aiPlayers: aiDebug };
    } catch (error) {
      reply.code(503);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  app.get("/admin/debug/ai/decisions", async (request, reply) => {
    if (!(await adminRequestAuthorized(request))) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    try {
      const query = request.query as Record<string, unknown> | undefined;
      const playerId = typeof query?.playerId === "string" ? query.playerId : undefined;
      const diagnostics = await deps.getAiDecisionDiagnostics?.(playerId);
      return { ok: true, diagnostics: diagnostics ?? [], count: (diagnostics ?? []).length };
    } catch (error) {
      reply.code(503);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  app.get("/admin/debug/ai/recording-status", async (request, reply) => {
    if (!(await adminRequestAuthorized(request))) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    try {
      // Try to get diagnostics to verify recording is happening
      const allDiagnostics = await deps.getAiDecisionDiagnostics?.();
      return {
        ok: true,
        recording: (allDiagnostics?.length ?? 0) > 0,
        totalDiagnostics: allDiagnostics?.length ?? 0
      };
    } catch (error) {
      reply.code(503);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
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
        archives: (await deps.listSeasonArchives()).slice(0, 12)
      };
    } catch (error) {
      reply.code(503);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "failed to load season archives"
      };
    }
  });

  registerRallyLinkRoutes(app, deps, playOrigin);

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

  registerGalaxyHttpRoutes(app, deps);
  registerCareerRoutes(app, { ...(deps.getSeasonParticipationForPlayer ? { getSeasonParticipationForPlayer: deps.getSeasonParticipationForPlayer } : {}) });
  registerSocialRoutes(app, { ...(deps.getSocialSnapshotForPlayer ? { getSocialSnapshotForPlayer: deps.getSocialSnapshotForPlayer } : {}) });

  registerWorldEngineStrikeRoutes(app, {
    ...(deps.worldEngineStrikeStore ? { worldEngineStrikeStore: deps.worldEngineStrikeStore } : {})
  });
  if (deps.activityApi) registerActivityApiRoute(app, deps.activityApi);
};
  const forceRequested = (value: unknown): boolean =>
    value === true || value === "true" || value === "1" || value === 1;
