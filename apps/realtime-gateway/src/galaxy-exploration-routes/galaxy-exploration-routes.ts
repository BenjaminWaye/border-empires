import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";
import type { FastifyInstance } from "fastify";

import type { GatewayResolvedIdentity } from "../auth-identity/auth-identity.js";
import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GalaxyExplorationStore } from "../galaxy-exploration-store/galaxy-exploration-store.js";
import { bearerHeader } from "../bearer-header/bearer-header.js";
import { resolveGalaxyHoldingsByOwner } from "../galaxy-holdings/galaxy-holdings.js";

// §17: Exploration/fog-of-war. New route module rather than growing
// galaxy-routes.ts, same reasoning galaxy-senate-routes.ts and
// galaxy-fleet-routes.ts give -- new gameplay surface, not a variant of
// the existing /hq/galaxy* territory endpoints.
export type RegisterGalaxyExplorationRoutesDeps = {
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
  getCurrentSeasonSummary?: () => Promise<CurrentSeasonSummary>;
  authenticateBearer?: (authorizationHeader: string | undefined) => Promise<GatewayResolvedIdentity | undefined>;
  authBindingStore?: GatewayAuthBindingStore;
  galaxyExplorationStore?: GalaxyExplorationStore;
};

type ExplorationSystemView = { seasonId: string; state: "SURVEYED"; stability: number; garrison: number; surveyedAt: number };

export const registerGalaxyExplorationRoutes = (app: FastifyInstance, deps: RegisterGalaxyExplorationRoutesDeps): void => {
  app.get("/hq/galaxy/exploration", async (request, reply) => {
    if (!deps.authenticateBearer || !deps.authBindingStore || !deps.galaxyExplorationStore) {
      reply.code(503);
      return { ok: false, error: "exploration is unavailable" };
    }
    const identity = await deps.authenticateBearer(bearerHeader(request));
    if (!identity?.authUid) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }

    // §17.2: an empire's own held territories are always fully known --
    // that's not a separate charting mechanic, so it's excluded here to
    // avoid a redundant, always-live "Surveyed" entry sitting alongside
    // what /hq/galaxy/me already reports for those same seasonIds.
    const holdingsByOwner = await resolveGalaxyHoldingsByOwner({
      listSeasonArchives: deps.listSeasonArchives,
      ...(deps.getCurrentSeasonSummary ? { getCurrentSeasonSummary: deps.getCurrentSeasonSummary } : {}),
      authBindingStore: deps.authBindingStore
    });
    const ownSeasonIds = new Set((holdingsByOwner.get(identity.authUid) ?? []).map((t) => t.seasonId));

    const surveys = await deps.galaxyExplorationStore.getSurveysForOwner(identity.authUid);
    const systems: ExplorationSystemView[] = surveys
      .filter((s) => !ownSeasonIds.has(s.seasonId))
      .map((s) => ({ seasonId: s.seasonId, state: "SURVEYED", stability: s.stability, garrison: s.garrison, surveyedAt: s.surveyedAt }));

    return { ok: true, systems };
  });
};
