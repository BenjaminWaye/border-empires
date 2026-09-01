import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { SqlitePlayerGrowthBaselineStore } from "./sqlite-player-growth-baseline-store.js";

// Vitest's bundler can't resolve `node:sqlite` at static analysis time
// (Node 22+ builtin), so we pull DatabaseSync via createRequire -- runs
// in the same process but bypasses Vite's module graph.
type DatabaseSyncCtor = new (path: string) => { exec(sql: string): void };
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: DatabaseSyncCtor;
};

const createStore = async (): Promise<SqlitePlayerGrowthBaselineStore> => {
  const db = new DatabaseSync(":memory:") as ConstructorParameters<typeof SqlitePlayerGrowthBaselineStore>[0];
  const store = new SqlitePlayerGrowthBaselineStore(db);
  await store.applySchema();
  return store;
};

describe("SqlitePlayerGrowthBaselineStore", () => {
  it("returns undefined for a player with no stored baseline", async () => {
    const store = await createStore();
    await expect(store.get("player-1")).resolves.toBeUndefined();
  });

  it("round-trips a baseline through set/get", async () => {
    const store = await createStore();
    await store.set({ playerId: "player-1", incomePerMinute: 4.5, manpowerCap: 1000, recordedAt: 1_000 });
    await expect(store.get("player-1")).resolves.toEqual({
      playerId: "player-1",
      incomePerMinute: 4.5,
      manpowerCap: 1000,
      recordedAt: 1_000
    });
  });

  it("overwrites the existing baseline on a second set for the same player", async () => {
    const store = await createStore();
    await store.set({ playerId: "player-1", incomePerMinute: 4.5, manpowerCap: 1000, recordedAt: 1_000 });
    await store.set({ playerId: "player-1", incomePerMinute: 6, manpowerCap: 1200, recordedAt: 2_000 });
    await expect(store.get("player-1")).resolves.toEqual({
      playerId: "player-1",
      incomePerMinute: 6,
      manpowerCap: 1200,
      recordedAt: 2_000
    });
  });
});
