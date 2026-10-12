import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  SOVEREIGN_SIEGE_ENGINE_STRIKE_HISTORY_WINDOW_MS,
  type SovereignSiegeEngineStrikeStore
} from "../sovereign-siege-engine-strike-store/sovereign-siege-engine-strike-store.js";

export type RegisterSovereignSiegeEngineStrikeRoutesDeps = {
  sovereignSiegeEngineStrikeStore?: SovereignSiegeEngineStrikeStore;
  now?: () => number;
};

// Public/unauthenticated: every strike here was already broadcast live to
// every connected player, so there is nothing this endpoint reveals that a
// player couldn't already have seen — it only helps someone who missed the
// live broadcast (offline/reconnecting) catch up within the 12h window.
export const registerSovereignSiegeEngineStrikeRoutes = (app: FastifyInstance, deps: RegisterSovereignSiegeEngineStrikeRoutesDeps): void => {
  const now = deps.now ?? (() => Date.now());

  const listStrikes = async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!deps.sovereignSiegeEngineStrikeStore) {
      reply.code(503);
      return { ok: false, error: "world events are unavailable" };
    }
    const strikes = await deps.sovereignSiegeEngineStrikeStore.listSince(now() - SOVEREIGN_SIEGE_ENGINE_STRIKE_HISTORY_WINDOW_MS);
    return { ok: true, strikes };
  };
  app.get("/world-events/sovereign-siege-engine-strikes", listStrikes);
  // Path used before the structure id rename; clients still running an older
  // bundle keep loading strike history until they reload.
  app.get("/world-events/world-engine-strikes", listStrikes);
};
