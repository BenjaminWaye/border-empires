import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { createDukeState } from "./galaxy-duke-engine/galaxy-duke-systems.js";
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
    const base = createDukeState("uid-1", [{ seasonId: "s1", tier: "PLANET", specialization: "INDUSTRIAL" }], 1_000);
    const state = { ...base, systems: [{ ...base.systems[0]!, fighters: [{ hull: 60 }], probeStock: 2, developments: [{ bodyIndex: 0, kind: "MINING" as const }] }] };
    await store.put(state);
    expect(await store.get("uid-1")).toEqual(state);
  });

  it("put overwrites, getAll lists every Duke", async () => {
    const store = await make();
    const planets = [{ seasonId: "s1", tier: "PLANET" as const, specialization: "INDUSTRIAL" as const }];
    await store.put(createDukeState("a", planets, 1));
    await store.put(createDukeState("b", planets, 2));
    await store.put({ ...createDukeState("a", planets, 1), lastCycleApplied: 9 });
    const all = await store.getAll();
    expect(all).toHaveLength(2);
    expect(all.find((s) => s.authUid === "a")?.lastCycleApplied).toBe(9);
  });

  it("does not let callers mutate stored state", async () => {
    const store = await make();
    await store.put(createDukeState("a", [{ seasonId: "s1", tier: "PLANET", specialization: "INDUSTRIAL" }], 1));
    const first = await store.get("a");
    first!.systems[0]!.probeStock = 99;
    expect((await store.get("a"))?.systems[0]?.probeStock).toBe(0);
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

  it("ending an era records it, clears the Court's wagers and starts the next era, together", async () => {
    const store = await make();
    expect(await store.getEra(100)).toEqual({ era: 1, startedAt: 100, baselineCaptured: 0 });
    expect(await store.getEra(999)).toEqual({ era: 1, startedAt: 100, baselineCaptured: 0 });
    await store.addCourtContribution("a", 40);
    const entry = { era: 1, endedAt: 500, emperorAuthUid: "a", emperorLabel: "Aurelia", domainWeight: 12, standings: [{ authUid: "a", label: "Aurelia", weight: 12 }] };
    await store.endEra(entry, { era: 2, startedAt: 500, baselineCaptured: 7 });
    expect(await store.getCourt()).toEqual({ contributions: {}, totalInfluence: 0 });
    expect(await store.getEra(0)).toEqual({ era: 2, startedAt: 500, baselineCaptured: 7 });
    expect(await store.getHallOfFame()).toEqual([entry]);
  });

  it("keeps the Hall of Fame bounded, newest first", async () => {
    const store = await make();
    for (let era = 1; era <= 55; era += 1) {
      await store.endEra({ era, endedAt: era, emperorAuthUid: "a", emperorLabel: "A", domainWeight: 1, standings: [] }, { era: era + 1, startedAt: era, baselineCaptured: 0 });
    }
    const hall = await store.getHallOfFame();
    expect(hall).toHaveLength(50);
    expect(hall[0]?.era).toBe(55);
    expect(hall.at(-1)?.era).toBe(6);
  });
});
