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
    expect(await store.grant("p1", "flag-chevron", "admin")).toEqual({ newlyGranted: true });
    expect(await store.grant("p1", "flag-chevron", "admin")).toEqual({ newlyGranted: false });
    expect(await store.listOwned("p1")).toEqual(["flag-chevron"]);
    expect(await store.listOwned("p2")).toEqual([]);
  });

  it("stores one cosmetic per slot and clears a slot with null", async () => {
    const store = create();
    expect(await store.setSelection("p1", "musterFlag", "flag-chevron")).toEqual({ musterFlag: "flag-chevron" });
    expect(await store.setSelection("p1", "ancillary", "ancillary-ivory")).toEqual({ musterFlag: "flag-chevron", ancillary: "ancillary-ivory" });
    expect(await store.setSelection("p1", "musterFlag", null)).toEqual({ ancillary: "ancillary-ivory" });
    expect(await store.getSelection("p1")).toEqual({ ancillary: "ancillary-ivory" });
    expect(await store.counts()).toEqual({ owned: 0, selected: 1 });
  });

  it("revoking removes ownership and stops the account showing it", async () => {
    const store = create();
    await store.grant("p1", "flag-chevron", "admin");
    await store.setSelection("p1", "musterFlag", "flag-chevron");
    expect(await store.revoke("p1", "flag-chevron")).toEqual({ revoked: true });
    expect(await store.revoke("p1", "flag-chevron")).toEqual({ revoked: false });
    expect(await store.listOwned("p1")).toEqual([]);
    expect(await store.getSelection("p1")).toEqual({});
  });

  it("lists accounts with a non-default look, up to the limit", async () => {
    const store = create();
    await store.setSelection("p1", "musterFlag", "flag-chevron");
    await store.setSelection("p1", "ancillary", "ancillary-ivory");
    await store.setSelection("p2", "ancillary", "ancillary-ivory");
    const all = await store.listSelections(10);
    expect(all.truncated).toBe(false);
    expect(new Map(all.selections)).toEqual(new Map([
      ["p1", { musterFlag: "flag-chevron", ancillary: "ancillary-ivory" }],
      ["p2", { ancillary: "ancillary-ivory" }]
    ]));
    const capped = await store.listSelections(1);
    expect(capped.truncated).toBe(true);
    expect(capped.selections).toHaveLength(1);
  });
});
