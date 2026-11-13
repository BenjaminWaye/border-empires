import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { SqliteGalaxyEconomyStore } from "./sqlite-galaxy-economy-store.js";

// Vitest can't resolve `node:sqlite` statically (Node 22+ builtin) — see
// sqlite-player-profile-store.test.ts.
type DatabaseSyncCtor = new (path: string) => unknown;
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: DatabaseSyncCtor };

const createStore = async (): Promise<SqliteGalaxyEconomyStore> => {
  const store = new SqliteGalaxyEconomyStore(new DatabaseSync(":memory:") as ConstructorParameters<typeof SqliteGalaxyEconomyStore>[0]);
  await store.applySchema();
  return store;
};

describe("SqliteGalaxyEconomyStore.creditStipendOnce", () => {
  it("credits a new account once per (authUid, seasonId) and seeds its Cycle clock", async () => {
    const store = await createStore();
    await expect(store.creditStipendOnce({ authUid: "uid-1", seasonId: "s-1", influence: 9, now: 5_000 })).resolves.toBe(true);
    await expect(store.creditStipendOnce({ authUid: "uid-1", seasonId: "s-1", influence: 9, now: 6_000 })).resolves.toBe(false);
    await expect(store.getBalance("uid-1")).resolves.toEqual({ authUid: "uid-1", influence: 9, production: 0, lastCycleAt: 5_000 });
  });

  it("adds Influence to an existing balance, leaves Production and lastCycleAt alone, and pays a different season separately", async () => {
    const store = await createStore();
    await store.upsertBalance({ authUid: "uid-1", influence: -2, production: 5, lastCycleAt: 100 });
    await store.creditStipendOnce({ authUid: "uid-1", seasonId: "s-1", influence: 4, now: 5_000 });
    await store.creditStipendOnce({ authUid: "uid-1", seasonId: "s-2", influence: 1, now: 5_000 });
    await expect(store.getBalance("uid-1")).resolves.toEqual({ authUid: "uid-1", influence: 3, production: 5, lastCycleAt: 100 });
  });
});
