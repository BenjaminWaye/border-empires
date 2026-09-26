import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";

import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GalaxyBattleLogStore } from "../galaxy-battle-log-store/galaxy-battle-log-store.js";
import type { GalaxyDefenseCampaignStore } from "../galaxy-defense-campaign-store/galaxy-defense-campaign-store.js";
import type { DukeCounter } from "../galaxy-duke-engine/galaxy-duke-types.js";
import { startGalaxyDukeScheduler } from "../galaxy-duke-scheduler/galaxy-duke-scheduler.js";
import { createGalaxyDukeService, type GalaxyDukeService } from "../galaxy-duke-service/galaxy-duke-service.js";
import { createGalaxyDukeStore } from "../galaxy-duke-store-factory/galaxy-duke-store-factory.js";
import type { GalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import type { GalaxyExplorationStore } from "../galaxy-exploration-store/galaxy-exploration-store.js";
import type { GalaxyPlanetStore } from "../galaxy-planet-store/galaxy-planet-store.js";

export type GalaxyDukeWiringDeps = {
  storeOptions: Parameters<typeof createGalaxyDukeStore>[0];
  authBindingStore: GatewayAuthBindingStore;
  galaxyEconomyStore: GalaxyEconomyStore;
  galaxyBattleLogStore: GalaxyBattleLogStore;
  galaxyDefenseCampaignStore?: GalaxyDefenseCampaignStore;
  galaxyExplorationStore?: GalaxyExplorationStore;
  galaxyPlanetStore?: GalaxyPlanetStore;
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
  getCurrentSeasonSummary: () => Promise<CurrentSeasonSummary>;
  onCounter: (counter: DukeCounter) => void;
  onError: (error: unknown) => void;
};

// Single call site combining the Duke store/service creation with starting its
// tick, mirroring galaxy-fleet-wiring.ts, so gateway-app.ts (over the line cap)
// only needs one appended expression.
export const wireGalaxyDuke = async (
  deps: GalaxyDukeWiringDeps
): Promise<{ galaxyDukeService: GalaxyDukeService; stop: () => void }> => {
  const dukeStore = await createGalaxyDukeStore(deps.storeOptions);
  const galaxyDukeService = createGalaxyDukeService({
    dukeStore,
    galaxyEconomyStore: deps.galaxyEconomyStore,
    galaxyBattleLogStore: deps.galaxyBattleLogStore,
    ...(deps.galaxyDefenseCampaignStore ? { galaxyDefenseCampaignStore: deps.galaxyDefenseCampaignStore } : {}),
    ...(deps.galaxyExplorationStore ? { galaxyExplorationStore: deps.galaxyExplorationStore } : {}),
    ...(deps.galaxyPlanetStore ? { galaxyPlanetStore: deps.galaxyPlanetStore } : {}),
    authBindingStore: deps.authBindingStore,
    listSeasonArchives: deps.listSeasonArchives,
    getCurrentSeasonSummary: deps.getCurrentSeasonSummary,
    onCounter: deps.onCounter,
    onError: deps.onError
  });
  const scheduler = startGalaxyDukeScheduler({ service: galaxyDukeService, onError: deps.onError });
  return { galaxyDukeService, stop: scheduler.stop };
};
