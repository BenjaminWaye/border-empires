// Builds the dependency object handed to `registerGatewayHttpRoutes`. Lifted
// out of gateway-app.ts (which is already over the file-line gate's 500-line
// budget and may not grow) so gateway-app.ts only needs to assemble a context
// object and call this function, instead of inlining the whole ~45-line
// literal at the call site.
import type { GatewayAttackDebug, GatewayAttackTrace, GatewayDebugEvent, RegisterGatewayHttpRoutesDeps } from "../http-routes/http-routes.js";
import type { ResolvedGatewayAuthBinding } from "../gateway-auth-binding-resolution/gateway-auth-binding-resolution.js";
import type { GatewayPlayerProfileStore } from "../player-profile-store/player-profile-store.js";
import type { RallyLinkStore } from "../rally-link-store/rally-link-store.js";
import type { GalaxyPlanetStore } from "../galaxy-planet-store/galaxy-planet-store.js";
import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { SimulationSeedProfile } from "../seed-fallback.js";
import type { createSimulationClient } from "../sim-client/sim-client.js";
import type { loadLegacySnapshotBootstrap } from "../../../simulation/src/legacy-snapshot-bootstrap/legacy-snapshot-bootstrap.js";
import { supportedClientMessageTypes } from "../supported-client-messages/supported-client-messages.js";
import {
  hydrateCurrentSeasonSummaryDisplayNames,
  hydrateSeasonArchiveDisplayNames
} from "../hq-summary-hydration/hq-summary-hydration.js";

type SimulationClient = ReturnType<typeof createSimulationClient>;

export type BuildGatewayHttpRoutesDepsContext = {
  startupStartedAt: number;
  simulationAddress?: string;
  simulationSeedProfile: SimulationSeedProfile;
  simulationHealth: { connected: boolean; lastReadyAt: number | undefined; lastError: string | undefined };
  snapshotDir?: string;
  legacySnapshotBootstrap?: ReturnType<typeof loadLegacySnapshotBootstrap>;
  recentGatewayEvents: GatewayDebugEvent[];
  buildAttackDebug: () => GatewayAttackDebug;
  buildAttackTraces: () => GatewayAttackTrace[];
  gatewayMetrics: { renderPrometheus: () => string };
  simMetricsUrl?: string;
  simulationClient: SimulationClient;
  profileStore: GatewayPlayerProfileStore;
  playOrigin?: string;
  resolveHttpBearerIdentity: (authorizationHeader: string | undefined) => Promise<ResolvedGatewayAuthBinding | undefined>;
  rallyLinkStore: RallyLinkStore;
  galaxyPlanetStore: GalaxyPlanetStore;
  authBindingStore: GatewayAuthBindingStore;
  adminApiToken?: string;
};

export const buildGatewayHttpRoutesDeps = (ctx: BuildGatewayHttpRoutesDepsContext): RegisterGatewayHttpRoutesDeps => ({
  startupStartedAt: ctx.startupStartedAt,
  simulationAddress: ctx.simulationAddress ?? "127.0.0.1:50051",
  simulationSeedProfile: ctx.simulationSeedProfile,
  health: () => ({
    ok: ctx.simulationHealth.connected,
    simulation: {
      connected: ctx.simulationHealth.connected,
      ...(typeof ctx.simulationHealth.lastReadyAt === "number" ? { lastReadyAt: ctx.simulationHealth.lastReadyAt } : {}),
      ...(ctx.simulationHealth.lastError ? { lastError: ctx.simulationHealth.lastError } : {})
    }
  }),
  ...(ctx.snapshotDir ? { snapshotDir: ctx.snapshotDir } : {}),
  ...(ctx.legacySnapshotBootstrap ? { runtimeIdentity: ctx.legacySnapshotBootstrap.runtimeIdentity } : {}),
  supportedMessageTypes: [...supportedClientMessageTypes],
  recentEvents: () => [...ctx.recentGatewayEvents],
  attackDebug: ctx.buildAttackDebug,
  attackTraces: ctx.buildAttackTraces,
  metrics: () => ctx.gatewayMetrics.renderPrometheus(),
  ...(ctx.simMetricsUrl
    ? {
        getSimMetrics: async () => {
          const res = await fetch(ctx.simMetricsUrl!, { signal: AbortSignal.timeout(3000) });
          if (!res.ok) throw new Error(`sim metrics HTTP ${res.status}`);
          return res.text();
        }
      }
    : {}),
  getCurrentSeasonSummary: async () =>
    hydrateCurrentSeasonSummaryDisplayNames(await ctx.simulationClient.getCurrentSeasonSummary(), ctx.profileStore),
  getCurrentSeasonStatus: () => ctx.simulationClient.getCurrentSeasonSummary().then((s) => s.status),
  listSeasonArchives: async () =>
    hydrateSeasonArchiveDisplayNames(await ctx.simulationClient.listSeasonArchives(), ctx.profileStore),
  startNextSeason: (force?: boolean) => ctx.simulationClient.startNextSeason(force),
  seedBarbarians: (count?: number) => ctx.simulationClient.seedBarbarians(count),
  ...(ctx.playOrigin ? { playOrigin: ctx.playOrigin } : {}),
  authenticateBearer: ctx.resolveHttpBearerIdentity,
  rallyLinkStore: ctx.rallyLinkStore,
  preparePlayer: (playerId: string) => ctx.simulationClient.preparePlayer(playerId),
  subscribePlayer: (playerId: string) =>
    ctx.simulationClient.subscribePlayer(
      playerId,
      JSON.stringify({ mode: "bootstrap-only", emitBootstrapEvent: false, trigger: "gateway_rally_link" })
    ),
  ...(ctx.adminApiToken ? { adminApiToken: ctx.adminApiToken } : {}),
  galaxyPlanetStore: ctx.galaxyPlanetStore,
  authBindingStore: ctx.authBindingStore
});
