import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { SqliteGatewaySocialStore } from "./social-store-sqlite.js";

// Vitest can't resolve the `node:sqlite` builtin statically (see
// sqlite-player-growth-baseline-store.test.ts), so load it at runtime.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: typeof DatabaseSyncType };

const terms = { give: { gold: 50, shard: 0 }, ask: { gold: 0, shard: 2 } };

const freshStore = (): { store: SqliteGatewaySocialStore; db: DatabaseSyncType } => {
  const db = new DatabaseSync(":memory:");
  const store = new SqliteGatewaySocialStore(db, () => 1_000);
  store.applySchema();
  return { store, db };
};

describe("SqliteGatewaySocialStore offer terms", () => {
  it("round-trips terms on truce and alliance offers, and re-applying the schema is harmless", () => {
    const { store } = freshStore();
    store.saveTruceRequest({ id: "t1", fromPlayerId: "p1", toPlayerId: "p2", createdAt: 1, expiresAt: 99_999, durationHours: 12, terms });
    store.saveAllianceRequest({ id: "a1", fromPlayerId: "p1", toPlayerId: "p2", createdAt: 1, terms });
    store.saveAllianceRequest({ id: "a2", fromPlayerId: "p2", toPlayerId: "p3", createdAt: 1 });
    store.applySchema();

    const snapshot = store.loadSnapshot();
    expect(snapshot.truceRequests).toEqual([expect.objectContaining({ id: "t1", terms })]);
    expect(snapshot.allianceRequests).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "a1", terms }), expect.not.objectContaining({ terms: expect.anything() })])
    );
  });

  // Keeping an offer whose terms can't be read would let the target accept
  // a paid deal for free, so the whole offer is dropped instead.
  it("drops an offer whose stored terms are corrupt", () => {
    const { store, db } = freshStore();
    store.saveTruceRequest({ id: "t1", fromPlayerId: "p1", toPlayerId: "p2", createdAt: 1, expiresAt: 99_999, durationHours: 12, terms });
    db.prepare(`UPDATE social_truce_requests SET terms_json = ? WHERE id = ?`).run('{"give":{"gold":-5}}', "t1");
    expect(store.loadSnapshot().truceRequests).toEqual([]);
  });
});
