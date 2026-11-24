import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { InMemoryPublicProfileLinkStore, isPublicProfileId, type PublicProfileLinkStore } from "./public-profile-link-store.js";
import { SqlitePublicProfileLinkStore } from "./sqlite-public-profile-link-store.js";

// Vitest can't resolve `node:sqlite` statically; same createRequire
// workaround as sqlite-sector-waitlist-store.test.ts.
type Database = ConstructorParameters<typeof SqlitePublicProfileLinkStore>[0];
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => Database };

const stores: Array<[string, () => Promise<PublicProfileLinkStore>]> = [
  ["in-memory", async () => new InMemoryPublicProfileLinkStore()],
  [
    "sqlite",
    async () => {
      const store = new SqlitePublicProfileLinkStore(new DatabaseSync(":memory:"));
      await store.applySchema();
      return store;
    }
  ]
];

describe.each(stores)("%s public profile link store", (_name, create) => {
  it("mints one stable link per player that does not contain the player id", async () => {
    const store = await create();
    const playerId = "firebaseUid0123456789abcdefgh";
    const first = await store.getOrCreate(playerId, 10);
    const again = await store.getOrCreate(playerId, 20);
    expect(again).toEqual(first);
    expect(first.createdAt).toBe(10);
    expect(isPublicProfileId(first.publicId)).toBe(true);
    expect(first.publicId).not.toContain(playerId);
    expect((await store.getOrCreate("other", 30)).publicId).not.toBe(first.publicId);
    expect(await store.getByPublicId(first.publicId)).toEqual(first);
    expect(await store.getByPlayerId(playerId)).toEqual(first);
  });

  it("kills the old link when sharing stops, and mints a new id afterwards", async () => {
    const store = await create();
    const first = await store.getOrCreate("p1", 1);
    expect(await store.remove("p1")).toBe(true);
    expect(await store.remove("p1")).toBe(false);
    expect(await store.getByPublicId(first.publicId)).toBeUndefined();
    expect(await store.getByPlayerId("p1")).toBeUndefined();
    expect((await store.getOrCreate("p1", 2)).publicId).not.toBe(first.publicId);
  });
});
