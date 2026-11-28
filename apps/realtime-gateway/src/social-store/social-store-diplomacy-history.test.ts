import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { buildSocialStateSink } from "../gateway-app/build-social-state-sink.js";
import { DIPLOMACY_HISTORY_PER_PLAYER_CAP, DIPLOMACY_HISTORY_TTL_MS } from "../social-state/social-diplomacy-history.js";
import { createSocialState } from "../social-state/social-state.js";
import { InMemoryGatewaySocialStore, type GatewaySocialStore } from "./social-store.js";
import { SqliteGatewaySocialStore } from "./social-store-sqlite.js";

// Vitest can't resolve the `node:sqlite` builtin statically (see
// social-store-sqlite-terms.test.ts), so load it at runtime.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: typeof DatabaseSyncType };

const players = [
  { id: "player-1", name: "Nauticus" },
  { id: "player-2", name: "Tove" }
];

const stores: Array<[string, (now: () => number) => GatewaySocialStore]> = [
  ["in-memory", (now) => new InMemoryGatewaySocialStore(now)],
  [
    "sqlite",
    (now) => {
      const store = new SqliteGatewaySocialStore(new DatabaseSync(":memory:"), now);
      store.applySchema();
      return store;
    }
  ]
];

// Boots a social state the way gateway-app.ts does: load, prune, then start from the snapshot.
const boot = (store: GatewaySocialStore, now: () => number) => {
  const initial = store.loadSnapshot();
  store.pruneExpired(now());
  return createSocialState({ now, players, initial, sink: buildSocialStateSink(store) });
};

describe.each(stores)("diplomacy history in the %s social store", (_name, makeStore) => {
  it("keeps the Chronicle's truce rows across a gateway restart", () => {
    const clock = { now: 1_000 };
    const now = (): number => clock.now;
    const store = makeStore(now);
    const before = boot(store, now);
    expect(before.requestTruce("player-1", "Tove", 12).ok).toBe(true);
    expect(before.acceptTruce("player-2", before.snapshotForPlayer("player-2").incomingTruceRequests[0]!.id).ok).toBe(true);

    // The gateway is down when the truce runs out, then restarts.
    clock.now += 12 * 60 * 60_000 + 60_000;
    const after = boot(store, now);
    expect(after.diplomacyActivityCards("player-1", 0, clock.now)).toEqual([
      expect.objectContaining({ event: "TRUCE_ENDED", counterpartyName: "Tove" }),
      expect.objectContaining({ event: "TRUCE_STARTED", counterpartyName: "Tove", durationHours: 12 })
    ]);

    // And again: the expiry recorded on the last boot is not lost or doubled.
    const again = boot(store, now);
    expect(again.diplomacyActivityCards("player-2", 0, clock.now).map((card) => card.event)).toEqual(["TRUCE_ENDED", "TRUCE_OFFERED", "TRUCE_STARTED"]);
  });

  it("keeps an offer's note across a restart", () => {
    const clock = { now: 1_000 };
    const now = (): number => clock.now;
    const store = makeStore(now);
    expect(boot(store, now).requestTruce("player-1", "Tove", 12, { note: "Peace while we grow?" }).ok).toBe(true);
    expect(boot(store, now).diplomacyActivityCards("player-2", 0, clock.now)).toEqual([
      expect.objectContaining({ event: "TRUCE_OFFERED", note: "Peace while we grow?" })
    ]);
  });

  it("keeps who broke a truce and court armistices across a restart", () => {
    const clock = { now: 1_000 };
    const now = (): number => clock.now;
    const store = makeStore(now);
    const before = boot(store, now);
    expect(before.requestTruce("player-1", "Tove", 12).ok).toBe(true);
    expect(before.acceptTruce("player-2", before.snapshotForPlayer("player-2").incomingTruceRequests[0]!.id).ok).toBe(true);
    clock.now += 1_000;
    expect(before.breakTruce("player-2", "player-1").ok).toBe(true);
    clock.now += 1_000;
    expect(before.forceTruce("player-1", "player-2").ok).toBe(true);

    const [court, broken] = boot(store, now).diplomacyActivityCards("player-1", 0, clock.now);
    expect(court).toEqual(expect.objectContaining({ event: "TRUCE_STARTED", court: true }));
    expect(broken).toEqual(expect.objectContaining({ event: "TRUCE_BROKEN", byPlayerId: "player-2" }));
    expect(broken).not.toHaveProperty("court");
  });

  it("keeps each truce row's end, an extension's new end included, across a restart", () => {
    const clock = { now: 1_000 };
    const now = (): number => clock.now;
    const store = makeStore(now);
    const before = boot(store, now);
    expect(before.requestTruce("player-1", "Tove", 12).ok).toBe(true);
    expect(before.acceptTruce("player-2", before.snapshotForPlayer("player-2").incomingTruceRequests[0]!.id).ok).toBe(true);
    clock.now += 60_000;
    expect(before.requestTruce("player-2", "Nauticus", 12).ok).toBe(true);
    expect(before.acceptTruce("player-1", before.snapshotForPlayer("player-1").incomingTruceRequests[0]!.id).ok).toBe(true);

    const cards = boot(store, now).diplomacyActivityCards("player-1", 0, clock.now);
    expect(cards.find((card) => card.event === "TRUCE_STARTED")).toEqual(expect.objectContaining({ endsAt: 1_000 + 12 * 3_600_000 }));
    expect(cards.find((card) => card.event === "TRUCE_EXTENDED")).toEqual(expect.objectContaining({ durationHours: 12, endsAt: 1_000 + 24 * 3_600_000 }));
  });

  it("caps rows per player and drops rows older than a day", () => {
    const clock = { now: DIPLOMACY_HISTORY_TTL_MS * 2 };
    const now = (): number => clock.now;
    const store = makeStore(now);
    const entry = (occurredAt: number) => ({ event: "ALLIANCE_FORMED" as const, occurredAt, counterpartyPlayerId: "player-2", counterpartyName: "Tove" });
    for (let index = 0; index < DIPLOMACY_HISTORY_PER_PLAYER_CAP + 5; index += 1) store.saveDiplomacyHistory("player-1", entry(clock.now - index));
    store.saveDiplomacyHistory("player-2", entry(clock.now - DIPLOMACY_HISTORY_TTL_MS - 1));

    const saved = store.loadSnapshot().diplomacyHistory;
    expect(saved.filter((row) => row.playerId === "player-1")).toHaveLength(DIPLOMACY_HISTORY_PER_PLAYER_CAP);
    // The oldest rows went, the newest stayed.
    expect(Math.min(...saved.filter((row) => row.playerId === "player-1").map((row) => row.occurredAt))).toBe(clock.now - DIPLOMACY_HISTORY_PER_PLAYER_CAP + 1);

    store.pruneExpired(clock.now);
    expect(store.loadSnapshot().diplomacyHistory.filter((row) => row.playerId === "player-2")).toEqual([]);
  });

  it("clears with the rest of the season's social data", () => {
    const store = makeStore(() => 1_000);
    store.saveDiplomacyHistory("player-1", { event: "ALLIANCE_FORMED", occurredAt: 1_000, counterpartyPlayerId: "player-2", counterpartyName: "Tove" });
    store.clearSeasonData();
    expect(store.loadSnapshot().diplomacyHistory).toEqual([]);
  });
});

describe("sqlite diplomacy history rows", () => {
  it("skips a row from an event this gateway does not know instead of misreading it", () => {
    const db = new DatabaseSync(":memory:");
    const store = new SqliteGatewaySocialStore(db, () => 1_000);
    store.applySchema();
    db.prepare(
      `INSERT INTO social_diplomacy_history (player_id, event, occurred_at, counterparty_player_id, counterparty_name) VALUES ('player-1', 'PEACE_SUMMIT', 1000, 'player-2', 'Tove')`
    ).run();
    store.applySchema();
    expect(store.loadSnapshot().diplomacyHistory).toEqual([]);
  });
  it("adds the ends_at column to a table saved by an older gateway, keeping its rows", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE social_diplomacy_history (player_id TEXT NOT NULL, event TEXT NOT NULL, occurred_at INTEGER NOT NULL,
      counterparty_player_id TEXT NOT NULL, counterparty_name TEXT NOT NULL, duration_hours INTEGER, by_player_id TEXT, court INTEGER)`);
    db.prepare(
      `INSERT INTO social_diplomacy_history (player_id, event, occurred_at, counterparty_player_id, counterparty_name, duration_hours) VALUES ('player-1', 'TRUCE_STARTED', 1000, 'player-2', 'Tove', 12)`
    ).run();
    const store = new SqliteGatewaySocialStore(db, () => 1_000);
    store.applySchema();
    expect(store.loadSnapshot().diplomacyHistory).toEqual([expect.objectContaining({ event: "TRUCE_STARTED", durationHours: 12 })]);
    expect(store.loadSnapshot().diplomacyHistory[0]).not.toHaveProperty("endsAt");
    store.saveDiplomacyHistory("player-1", { event: "TRUCE_EXTENDED", occurredAt: 2_000, counterpartyPlayerId: "player-2", counterpartyName: "Tove", durationHours: 12, endsAt: 99_000 });
    expect(store.loadSnapshot().diplomacyHistory).toContainEqual(expect.objectContaining({ event: "TRUCE_EXTENDED", endsAt: 99_000 }));
  });
});
