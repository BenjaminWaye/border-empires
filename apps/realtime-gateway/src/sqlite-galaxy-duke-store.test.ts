import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { createDukeState } from "./galaxy-duke-engine/galaxy-duke-production.js";
import { InMemoryGalaxyDukeStore, type GalaxyDukeStore } from "./galaxy-duke-store/galaxy-duke-store.js";
import { SqliteGalaxyDukeStore } from "./sqlite-galaxy-duke-store.js";

// Vitest's bundler can't resolve `node:sqlite` statically; load it at runtime.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => ConstructorParameters<typeof SqliteGalaxyDukeStore>[0];
};

const sqliteStore = async (): Promise<GalaxyDukeStore> => {
  const store = new SqliteGalaxyDukeStore(new DatabaseSync(":memory:"));
  await store.applySchema();
  return store;
};

describe.each([
  ["in-memory", async (): Promise<GalaxyDukeStore> => new InMemoryGalaxyDukeStore()],
  ["sqlite", sqliteStore]
])("GalaxyDukeStore (%s)", (_name, make) => {
  it("round-trips a Duke's full state, and returns undefined for a stranger", async () => {
    const store = await make();
    expect(await store.get("nobody")).toBeUndefined();
    const state = { ...createDukeState("uid-1", 1_000), fighters: [{ hull: 60 }], probeStock: 2 };
    await store.put(state);
    expect(await store.get("uid-1")).toEqual(state);
  });

  it("put overwrites, getAll lists every Duke", async () => {
    const store = await make();
    await store.put(createDukeState("a", 1));
    await store.put(createDukeState("b", 2));
    await store.put({ ...createDukeState("a", 1), probeStock: 3 });
    const all = await store.getAll();
    expect(all).toHaveLength(2);
    expect(all.find((s) => s.authUid === "a")?.probeStock).toBe(3);
  });

  it("does not let callers mutate stored state", async () => {
    const store = await make();
    await store.put(createDukeState("a", 1));
    const first = await store.get("a");
    first!.probeStock = 99;
    expect((await store.get("a"))?.probeStock).toBe(0);
  });

  it("accumulates Move-Against-the-Court contributions per Duke and in total", async () => {
    const store = await make();
    expect(await store.getCourt()).toEqual({ contributions: {}, totalInfluence: 0 });
    await store.addCourtContribution("a", 10);
    await store.addCourtContribution("b", 5);
    const record = await store.addCourtContribution("a", 20);
    expect(record).toEqual({ contributions: { a: 30, b: 5 }, totalInfluence: 35 });
    expect(await store.getCourt()).toEqual(record);
  });
});
