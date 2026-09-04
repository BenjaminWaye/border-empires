// The galaxy-layer route registrations (territory, Senate, Emperor
// endorsement), split out of http-routes.ts -- already over the file-line
// cap and not allowed to grow -- so wiring a new galaxy route module (like
// Senate) doesn't need to add lines there. Takes the same deps object
// registerGatewayHttpRoutes already has in scope; this is purely an
// extraction, not a behavior change.
import type { FastifyInstance } from "fastify";
import { registerGalaxyRoutes } from "../galaxy-routes/galaxy-routes.js";
import { registerGalaxySenateRoutes } from "../galaxy-senate-routes/galaxy-senate-routes.js";
import { registerGalaxyEndorsementRoutes } from "../galaxy-endorsement-routes/galaxy-endorsement-routes.js";
import type { RegisterGatewayHttpRoutesDeps } from "./http-routes.js";

export const registerGalaxyHttpRoutes = (app: FastifyInstance, deps: RegisterGatewayHttpRoutesDeps): void => {
  registerGalaxyRoutes(app, {
    listSeasonArchives: deps.listSeasonArchives,
    getCurrentSeasonSummary: deps.getCurrentSeasonSummary,
    ...(deps.authenticateBearer ? { authenticateBearer: deps.authenticateBearer } : {}),
    ...(deps.galaxyPlanetStore ? { galaxyPlanetStore: deps.galaxyPlanetStore } : {}), ...(deps.galaxyEconomyStore ? { galaxyEconomyStore: deps.galaxyEconomyStore } : {}),
    ...(deps.galaxyDefenseCampaignStore ? { galaxyDefenseCampaignStore: deps.galaxyDefenseCampaignStore } : {}),
    ...(deps.authBindingStore ? { authBindingStore: deps.authBindingStore } : {})
  });

  registerGalaxySenateRoutes(app, {
    listSeasonArchives: deps.listSeasonArchives, getCurrentSeasonSummary: deps.getCurrentSeasonSummary,
    ...(deps.authenticateBearer ? { authenticateBearer: deps.authenticateBearer } : {}), ...(deps.authBindingStore ? { authBindingStore: deps.authBindingStore } : {}),
    ...(deps.galaxyEconomyStore ? { galaxyEconomyStore: deps.galaxyEconomyStore } : {}), ...(deps.galaxySenateStore ? { galaxySenateStore: deps.galaxySenateStore } : {})
  });

  registerGalaxyEndorsementRoutes(app, {
    getCurrentSeasonSummary: deps.getCurrentSeasonSummary,
    ...(deps.authenticateBearer ? { authenticateBearer: deps.authenticateBearer } : {}),
    ...(deps.galaxyEndorsementStore ? { endorsementStore: deps.galaxyEndorsementStore } : {}),
    ...(deps.authBindingStore ? { authBindingStore: deps.authBindingStore } : {})
  });
};
