import { InMemoryGalaxyDefenseCampaignStore, type GalaxyDefenseCampaignStore } from "../galaxy-defense-campaign-store/galaxy-defense-campaign-store.js";

type GalaxyDefenseCampaignStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

// Mirrors galaxy-economy-store-factory.ts / galaxy-senate-store-factory.ts exactly.
export const createGalaxyDefenseCampaignStore = async (
  options: GalaxyDefenseCampaignStoreFactoryOptions = {}
): Promise<GalaxyDefenseCampaignStore> => {
  if (!options.sqlitePath) return new InMemoryGalaxyDefenseCampaignStore();
  const [{ SqliteGalaxyDefenseCampaignStore }, { openSqliteDatabase }] = await Promise.all([
    import("../sqlite-galaxy-defense-campaign-store.js"),
    import("../sqlite-db.js")
  ]);
  const store = new SqliteGalaxyDefenseCampaignStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
