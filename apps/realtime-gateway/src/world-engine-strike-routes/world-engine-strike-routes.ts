import type { FastifyInstance } from "fastify";

import {
  WORLD_ENGINE_STRIKE_HISTORY_WINDOW_MS,
  type WorldEngineStrikeStore
} from "../world-engine-strike-store/world-engine-strike-store.js";

export type RegisterWorldEngineStrikeRoutesDeps = {
  worldEngineStrikeStore?: WorldEngineStrikeStore;
  now?: () => number;
};

// Public/unauthenticated: every strike here was already broadcast live to
// every connected player, so there is nothing this endpoint reveals that a
// player couldn't already have seen — it only helps someone who missed the
// live broadcast (offline/reconnecting) catch up within the 12h window.
export const registerWorldEngineStrikeRoutes = (app: FastifyInstance, deps: RegisterWorldEngineStrikeRoutesDeps): void => {
  const now = deps.now ?? (() => Date.now());

  app.get("/world-events/world-engine-strikes", async (_request, reply) => {
    if (!deps.worldEngineStrikeStore) {
      reply.code(503);
      return { ok: false, error: "world events are unavailable" };
    }
    const strikes = await deps.worldEngineStrikeStore.listSince(now() - WORLD_ENGINE_STRIKE_HISTORY_WINDOW_MS);
    return { ok: true, strikes };
  });
};
