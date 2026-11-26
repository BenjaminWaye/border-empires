import { createRequire } from "node:module";
import type { DatabaseSync as Database } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { SqliteHostingStore } from "./sqlite-hosting-store.js";

// vitest (vite) cannot resolve a static import of the built-in node:sqlite; load it at run time.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => Database };

describe("SqliteHostingStore schema", () => {
  it("adds the funding deadline to a database made before split funding, keeping its sectors", () => {
    const db = new DatabaseSync(":memory:");
    // hosted_sectors exactly as the first release created it.
    db.exec(`
      CREATE TABLE hosted_sectors (
        sector_id TEXT PRIMARY KEY, host_uid TEXT NOT NULL, map_style TEXT NOT NULL, map_size TEXT NOT NULL, state TEXT NOT NULL,
        amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, payment_ref TEXT, checkout_url TEXT, server_ref TEXT, hostname TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, paid_at INTEGER, opened_at INTEGER, ended_at INTEGER,
        create_attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER, last_error TEXT
      );
      INSERT INTO hosted_sectors (sector_id, host_uid, map_style, map_size, state, amount_cents, currency, created_at, updated_at)
        VALUES ('s-old', 'host', 'continents', 'standard', 'open', 2000, 'usd', 1, 1);
    `);
    const store = new SqliteHostingStore(db);
    store.applySchema();
    // Applying it again changes nothing.
    store.applySchema();
    expect(store.getSector("s-old")).toMatchObject({ sectorId: "s-old", state: "open" });
    expect(store.getSector("s-old")?.fundingDeadline).toBeUndefined();
    store.insertSector({
      sectorId: "s-new", hostUid: "other", options: { mapStyle: "islands", mapSize: "standard" }, state: "funding", fundingDeadline: 99,
      amountCents: 2000, currency: "usd", createdAt: 2, updatedAt: 2, createAttempts: 0
    });
    expect(store.getSector("s-new")).toMatchObject({ state: "funding", fundingDeadline: 99 });
  });

  it("adds the consent columns to an old database, and keeps a consent with an order and a share", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE hosted_contributions (
        contribution_id TEXT PRIMARY KEY, sector_id TEXT NOT NULL, account_uid TEXT NOT NULL, amount_cents INTEGER NOT NULL,
        state TEXT NOT NULL, payment_ref TEXT, checkout_url TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      INSERT INTO hosted_contributions VALUES ('c-old', 's-x', 'friend', 500, 'held', 'ref', NULL, 1, 1);
    `);
    const store = new SqliteHostingStore(db);
    store.applySchema();
    expect(store.getContribution("c-old")).toMatchObject({ state: "held" });
    expect(store.getContribution("c-old")?.consent).toBeUndefined();
    const consent = { at: 5, termsVersion: "v1", text: "I accept.\nStart now." };
    store.insertSector({
      sectorId: "s-paid", hostUid: "host", options: { mapStyle: "continents", mapSize: "standard" }, state: "awaiting_payment",
      amountCents: 2000, currency: "usd", createdAt: 5, updatedAt: 5, createAttempts: 0, consent
    });
    store.insertContribution({ contributionId: "c-new", sectorId: "s-x", accountUid: "friend", amountCents: 500, state: "awaiting_payment", createdAt: 5, updatedAt: 5, consent });
    expect(store.getSector("s-paid")?.consent).toEqual(consent);
    expect(store.getContribution("c-new")?.consent).toEqual(consent);
  });
});
