import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";

import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import { createGalaxyEconomyStore } from "../galaxy-economy-store-factory/galaxy-economy-store-factory.js";
import { startGalaxyCycleScheduler } from "../galaxy-cycle-scheduler/galaxy-cycle-scheduler.js";

export type GalaxyEconomyWiringDeps = {
  existingStore?: GalaxyEconomyStore;
  storeOptions: Parameters<typeof createGalaxyEconomyStore>[0];
  authBindingStore: GatewayAuthBindingStore;
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
  getCurrentSeasonSummary: () => Promise<CurrentSeasonSummary>;
  onError: (error: unknown) => void;
};

// Single call site combining the galactic economy store's creation with
// starting its Cycle tick scheduler (galaxy-cycle-scheduler.ts), so
// gateway-app.ts — already over the file-line cap and not allowed to grow —
// only needs one line here instead of wiring both separately inline.
export const wireGalaxyEconomy = async (
  deps: GalaxyEconomyWiringDeps
): Promise<{ galaxyEconomyStore: GalaxyEconomyStore; stop: () => void }> => {
  const galaxyEconomyStore = deps.existingStore ?? (await createGalaxyEconomyStore(deps.storeOptions));
  const scheduler = startGalaxyCycleScheduler({
    listSeasonArchives: deps.listSeasonArchives,
    getCurrentSeasonSummary: deps.getCurrentSeasonSummary,
    authBindingStore: deps.authBindingStore,
    galaxyEconomyStore,
    onError: deps.onError
  });
  return { galaxyEconomyStore, stop: scheduler.stop };
};
