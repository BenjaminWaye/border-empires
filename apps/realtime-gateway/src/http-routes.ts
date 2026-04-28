import type { FastifyInstance } from "fastify";
import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";

type GatewayDebugEvent = {
  at: number;
  level: "info" | "warn" | "error";
  event: string;
  payload: Record<string, unknown>;
};

type GatewayAttackDebug = {
  controlPath: GatewayDebugEvent[];
  hotPath: GatewayDebugEvent[];
  slowOrWarn: GatewayDebugEvent[];
};

type GatewayAttackTrace = {
  traceId: string;
  firstAt: number;
  lastAt: number;
  events: GatewayDebugEvent[];
};

type RegisterGatewayHttpRoutesDeps = {
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
  getCurrentSeasonSummary: () => Promise<CurrentSeasonSummary>;
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
  startNextSeason: (force?: boolean) => Promise<{ seasonId: string }>;
  adminApiToken?: string;
};

const addCorsHeaders = (app: FastifyInstance): void => {
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
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

  const adminAuthorized = (authorizationHeader: string | undefined): boolean => {
    if (!deps.adminApiToken) return false;
    return authorizationHeader === `Bearer ${deps.adminApiToken}`;
  };

  const readHealth = () => {
    const health = deps.health();
    return {
      statusCode: health.ok ? 200 : 503,
      body: {
        ok: health.ok,
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
    const health = readHealth();
    reply.code(health.statusCode);
    return health.body;
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
      const result = await deps.startNextSeason(false);
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
};
