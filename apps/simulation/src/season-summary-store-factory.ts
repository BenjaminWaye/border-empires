import { readFile } from "node:fs/promises";

import { resolveSimulationMigrationPath } from "./migration-path.js";
import {
  createPostgresSeasonSummaryStore,
  InMemorySeasonSummaryStore,
  type SeasonSummaryStore
} from "./season-summary-store.js";
import { SqliteSeasonSummaryStore } from "./sqlite-season-summary-store.js";
import { openSqliteDatabase } from "./sqlite-db.js";

type SeasonSummaryStoreFactoryOptions = {
  databaseUrl?: string;
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createSeasonSummaryStore = async (
  options: SeasonSummaryStoreFactoryOptions = {}
): Promise<SeasonSummaryStore> => {
  if (options.sqlitePath) {
    const store = new SqliteSeasonSummaryStore(openSqliteDatabase(options.sqlitePath));
    if (options.applySchema) await store.applySchema();
    return store;
  }
  if (!options.databaseUrl) return new InMemorySeasonSummaryStore();

  const store = createPostgresSeasonSummaryStore(options.databaseUrl);
  if (options.applySchema) {
    const boundedMigrationPath = await resolveSimulationMigrationPath("0008_bounded_storage.sql", import.meta.url);
    const boundedMigrationSql = await readFile(boundedMigrationPath, "utf8");
    await store.applySchema(boundedMigrationSql);
    const seasonLifecycleMigrationPath = await resolveSimulationMigrationPath("0009_season_lifecycle.sql", import.meta.url);
    const seasonLifecycleMigrationSql = await readFile(seasonLifecycleMigrationPath, "utf8");
    await store.applySchema(seasonLifecycleMigrationSql);
  }
  return store;
};
