import type { FastifyInstance } from "fastify";

type GatewayDebugEvent = {
  at: number;
  level: "info" | "warn" | "error";
  event: string;
  payload: Record<string, unknown>;
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
  metrics: () => string;
};

const addCorsHeaders = (app: FastifyInstance): void => {
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Accept");
    return payload;
  });

  app.options("/*", async (_request, reply) => {
    reply.code(204);
    return "";
  });
};

export const registerGatewayHttpRoutes = (app: FastifyInstance, deps: RegisterGatewayHttpRoutesDeps): void => {
  addCorsHeaders(app);

  app.get("/health", async (_request, reply) => {
    const health = deps.health();
    if (!health.ok) reply.code(503);
    return {
      ok: health.ok,
      simulation: health.simulation,
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
    attackDebug: {
      controlPath: [],
      hotPath: [],
      slowOrWarn: []
    },
    attackTraces: [],
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
    reply.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return deps.metrics();
  });
};
