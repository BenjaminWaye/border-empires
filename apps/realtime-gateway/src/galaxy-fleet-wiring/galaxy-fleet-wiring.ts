import type { GalaxyBattleLogStore } from "../galaxy-battle-log-store/galaxy-battle-log-store.js";
import type { GalaxyDefenseCampaignStore } from "../galaxy-defense-campaign-store/galaxy-defense-campaign-store.js";
import type { GalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import type { GalaxyFleetStore } from "../galaxy-fleet-store/galaxy-fleet-store.js";
import { createGalaxyFleetStore } from "../galaxy-fleet-store-factory/galaxy-fleet-store-factory.js";
import { startGalaxyFleetScheduler } from "../galaxy-fleet-scheduler/galaxy-fleet-scheduler.js";

export type GalaxyFleetWiringDeps = {
  existingStore?: GalaxyFleetStore;
  storeOptions: Parameters<typeof createGalaxyFleetStore>[0];
  galaxyEconomyStore: GalaxyEconomyStore;
  galaxyBattleLogStore: GalaxyBattleLogStore;
  galaxyDefenseCampaignStore?: GalaxyDefenseCampaignStore;
  onError: (error: unknown) => void;
};

// Single call site combining the Fleet store's creation with starting its
// raid-resolution scheduler, mirroring galaxy-senate-wiring.ts exactly.
export const wireGalaxyFleets = async (
  deps: GalaxyFleetWiringDeps
): Promise<{ galaxyFleetStore: GalaxyFleetStore; stop: () => void }> => {
  const galaxyFleetStore = deps.existingStore ?? (await createGalaxyFleetStore(deps.storeOptions));
  const scheduler = startGalaxyFleetScheduler({
    galaxyFleetStore,
    galaxyEconomyStore: deps.galaxyEconomyStore,
    galaxyBattleLogStore: deps.galaxyBattleLogStore,
    ...(deps.galaxyDefenseCampaignStore ? { galaxyDefenseCampaignStore: deps.galaxyDefenseCampaignStore } : {}),
    onError: deps.onError
  });
  return { galaxyFleetStore, stop: scheduler.stop };
};
