import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";

import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import type { GalaxySenateStore } from "../galaxy-senate-store/galaxy-senate-store.js";
import { createGalaxySenateStore } from "../galaxy-senate-store-factory/galaxy-senate-store-factory.js";
import { startGalaxySenateScheduler } from "../galaxy-senate-scheduler/galaxy-senate-scheduler.js";

export type GalaxySenateWiringDeps = {
  existingStore?: GalaxySenateStore;
  storeOptions: Parameters<typeof createGalaxySenateStore>[0];
  authBindingStore: GatewayAuthBindingStore;
  galaxyEconomyStore: GalaxyEconomyStore;
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
  getCurrentSeasonSummary: () => Promise<CurrentSeasonSummary>;
  onError: (error: unknown) => void;
};

// Single call site combining the Senate store's creation with starting its
// proposal-resolution scheduler, mirroring galaxy-economy-wiring.ts exactly.
export const wireGalaxySenate = async (
  deps: GalaxySenateWiringDeps
): Promise<{ galaxySenateStore: GalaxySenateStore; stop: () => void }> => {
  const galaxySenateStore = deps.existingStore ?? (await createGalaxySenateStore(deps.storeOptions));
  const scheduler = startGalaxySenateScheduler({
    listSeasonArchives: deps.listSeasonArchives,
    getCurrentSeasonSummary: deps.getCurrentSeasonSummary,
    authBindingStore: deps.authBindingStore,
    galaxyEconomyStore: deps.galaxyEconomyStore,
    galaxySenateStore,
    onError: deps.onError
  });
  return { galaxySenateStore, stop: scheduler.stop };
};
