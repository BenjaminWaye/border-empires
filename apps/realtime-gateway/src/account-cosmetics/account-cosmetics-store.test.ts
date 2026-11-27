import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { InMemoryAccountCosmeticsStore, type AccountCosmeticsStore } from "./account-cosmetics-store.js";
import { SqliteAccountCosmeticsStore } from "./sqlite-account-cosmetics-store.js";

// Vitest can't resolve `node:sqlite` statically; same createRequire
// workaround as sqlite-sector-waitlist-store.test.ts.
type Database = ConstructorParameters<typeof SqliteAccountCosmeticsStore>[0];
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => Database };

const stores: Array<[string, () => AccountCosmeticsStore]> = [
  ["in-memory", () => new InMemoryAccountCosmeticsStore()],
  ["sqlite", () => {
    const store = new SqliteAccountCosmeticsStore(new DatabaseSync(":memory:"), () => 1_000);
    store.applySchema();
    store.applySchema(); // safe to run on every boot
    return store;
  }]
];

describe.each(stores)("%s account cosmetics store", (_name, create) => {
  it("starts with nothing owned and the default look", async () => {
    const store = create();
    expect(await store.listOwned("p1")).toEqual([]);
    expect(await store.getSelection("p1")).toEqual({});
    expect(await store.listSelections(10)).toEqual({ selections: [], truncated: false });
    expect(await store.counts()).toEqual({ owned: 0, selected: 0 });
  });

  it("grants once per account and cosmetic", async () => {
    const store = create();
    expect(await store.grant("p1", "flag-high-noble", "admin")).toEqual({ newlyGranted: true });
    expect(await store.grant("p1", "flag-high-noble", "admin")).toEqual({ newlyGranted: false });
    expect(await store.listOwned("p1")).toEqual(["flag-high-noble"]);
    expect(await store.listOwned("p2")).toEqual([]);
  });

  it("stores the chosen cosmetic for a slot and clears it with null", async () => {
    const store = create();
    expect(await store.setSelection("p1", "musterFlag", "flag-high-noble")).toEqual({ musterFlag: "flag-high-noble" });
    expect(await store.setSelection("p1", "musterFlag", "flag-high-noble")).toEqual({ musterFlag: "flag-high-noble" });
    expect(await store.counts()).toEqual({ owned: 0, selected: 1 });
    expect(await store.setSelection("p1", "musterFlag", null)).toEqual({});
    expect(await store.getSelection("p1")).toEqual({});
    expect(await store.counts()).toEqual({ owned: 0, selected: 0 });
  });

  it("revoking removes ownership and stops the account showing it", async () => {
    const store = create();
    await store.grant("p1", "flag-high-noble", "admin");
    await store.setSelection("p1", "musterFlag", "flag-high-noble");
    expect(await store.revoke("p1", "flag-high-noble")).toEqual({ revoked: true });
    expect(await store.revoke("p1", "flag-high-noble")).toEqual({ revoked: false });
    expect(await store.listOwned("p1")).toEqual([]);
    expect(await store.getSelection("p1")).toEqual({});
  });

  it("lists accounts with a non-default look, up to the limit", async () => {
    const store = create();
    await store.setSelection("p1", "musterFlag", "flag-high-noble");
    await store.setSelection("p2", "musterFlag", "flag-high-noble");
    await store.setSelection("p3", "musterFlag", "flag-high-noble");
    await store.setSelection("p3", "musterFlag", null);
    const all = await store.listSelections(10);
    expect(all.truncated).toBe(false);
    expect(new Map(all.selections)).toEqual(new Map([
      ["p1", { musterFlag: "flag-high-noble" }],
      ["p2", { musterFlag: "flag-high-noble" }]
    ]));
    const capped = await store.listSelections(1);
    expect(capped.truncated).toBe(true);
    expect(capped.selections).toHaveLength(1);
  });
});

describe("sqlite account cosmetics store across a restart", () => {
  it("keeps a House crest beside the other slots when the database is reopened", async () => {
    const db = new DatabaseSync(":memory:");
    const first = new SqliteAccountCosmeticsStore(db, () => 1_000);
    first.applySchema();
    await first.setSelection("p1", "crest", "crest-lighthouse");
    await first.setSelection("p1", "musterFlag", "flag-high-noble");
    const reopened = new SqliteAccountCosmeticsStore(db, () => 2_000);
    reopened.applySchema();
    expect(await reopened.getSelection("p1")).toEqual({ musterFlag: "flag-high-noble", crest: "crest-lighthouse" });
    expect((await reopened.listSelections(10)).selections).toEqual([["p1", { musterFlag: "flag-high-noble", crest: "crest-lighthouse" }]]);
  });
});
