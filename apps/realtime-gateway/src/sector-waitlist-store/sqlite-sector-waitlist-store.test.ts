import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { InMemorySectorWaitlistStore, type SectorWaitlistStore } from "./sector-waitlist-store.js";
import { SqliteSectorWaitlistStore } from "./sqlite-sector-waitlist-store.js";

// Vitest can't resolve `node:sqlite` statically; same createRequire
// workaround as sqlite-player-funnel-store.test.ts.
type Database = ConstructorParameters<typeof SqliteSectorWaitlistStore>[0];
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => Database };

const stores: Array<[string, () => Promise<SectorWaitlistStore>]> = [
  ["in-memory", async () => new InMemorySectorWaitlistStore()],
  [
    "sqlite",
    async () => {
      const store = new SqliteSectorWaitlistStore(new DatabaseSync(":memory:"));
      await store.applySchema();
      return store;
    }
  ]
];

describe.each(stores)("%s sector waitlist store", (_name, create) => {
  it("joins idempotently and counts per season", async () => {
    const store = await create();
    expect(await store.join({ seasonId: "s1", playerId: "p1", joinedAt: 1 })).toBe(true);
    expect(await store.join({ seasonId: "s1", playerId: "p1", joinedAt: 2 })).toBe(false);
    expect(await store.join({ seasonId: "s1", playerId: "p2", joinedAt: 3 })).toBe(true);
    expect(await store.join({ seasonId: "s2", playerId: "p1", joinedAt: 4 })).toBe(true);
    expect(await store.count("s1")).toBe(2);
    expect(await store.count("s2")).toBe(1);
    expect(await store.count("s3")).toBe(0);
  });

  it("reports membership and removes entries", async () => {
    const store = await create();
    await store.join({ seasonId: "s1", playerId: "p1", joinedAt: 1 });
    expect(await store.has("s1", "p1")).toBe(true);
    expect(await store.has("s2", "p1")).toBe(false);
    expect(await store.leave("s1", "p1")).toBe(true);
    expect(await store.leave("s1", "p1")).toBe(false);
    expect(await store.has("s1", "p1")).toBe(false);
    expect(await store.count("s1")).toBe(0);
  });

  it("lists one season's players earliest first", async () => {
    const store = await create();
    await store.join({ seasonId: "s1", playerId: "late", joinedAt: 30 });
    await store.join({ seasonId: "s1", playerId: "early", joinedAt: 10 });
    await store.join({ seasonId: "s2", playerId: "other", joinedAt: 20 });
    expect(await store.list("s1")).toEqual(["early", "late"]);
    expect(await store.list("s3")).toEqual([]);
  });
});
