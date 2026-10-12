import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { SqliteSovereignSiegeEngineStrikeStore } from "../sqlite-sovereign-siege-engine-strike-store.js";

import {
  InMemorySovereignSiegeEngineStrikeStore,
  readSovereignSiegeEngineStrikeAnnouncement,
  SOVEREIGN_SIEGE_ENGINE_STRIKE_HISTORY_WINDOW_MS,
  type SovereignSiegeEngineStrikeRecord
} from "./sovereign-siege-engine-strike-store.js";

// vitest cannot resolve the bare "node:sqlite" builtin, so load it via require.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => DatabaseSyncType };

const record = (overrides: Partial<SovereignSiegeEngineStrikeRecord> = {}): SovereignSiegeEngineStrikeRecord => ({
  strikeId: "strike-1",
  occurredAt: 1_000,
  casterName: "player-1",
  targetX: 50,
  targetY: 50,
  townName: "Ashford",
  populationTier: "CITY",
  populationLost: 300_000,
  targetOwnerName: "player-2",
  ...overrides
});

describe("InMemorySovereignSiegeEngineStrikeStore", () => {
  it("returns an inserted record from listSince", async () => {
    const store = new InMemorySovereignSiegeEngineStrikeStore(() => 1_000);
    await store.insert(record());
    expect(await store.listSince(0)).toEqual([record()]);
  });

  it("ignores a duplicate insert of the same strikeId", async () => {
    const store = new InMemorySovereignSiegeEngineStrikeStore(() => 1_000);
    await store.insert(record());
    await store.insert(record({ populationLost: 999 }));
    const all = await store.listSince(0);
    expect(all).toHaveLength(1);
    expect(all[0]?.populationLost).toBe(300_000);
  });

  it("excludes records older than the requested cutoff", async () => {
    const store = new InMemorySovereignSiegeEngineStrikeStore(() => 1_000);
    await store.insert(record({ strikeId: "old", occurredAt: 100 }));
    await store.insert(record({ strikeId: "new", occurredAt: 900 }));
    expect((await store.listSince(500)).map((r) => r.strikeId)).toEqual(["new"]);
  });

  it("prunes records older than the 12h history window on insert", async () => {
    let now = 0;
    const store = new InMemorySovereignSiegeEngineStrikeStore(() => now);
    await store.insert(record({ strikeId: "ancient", occurredAt: 0 }));
    now = SOVEREIGN_SIEGE_ENGINE_STRIKE_HISTORY_WINDOW_MS + 1;
    await store.insert(record({ strikeId: "fresh", occurredAt: now }));
    expect((await store.listSince(0)).map((r) => r.strikeId)).toEqual(["fresh"]);
  });

  it("prunes stale records even when insert() calls arrive out of occurredAt order", async () => {
    const now = SOVEREIGN_SIEGE_ENGINE_STRIKE_HISTORY_WINDOW_MS + 1_000;
    const store = new InMemorySovereignSiegeEngineStrikeStore(() => now);
    // "fresh" (within the window) is inserted before "ancient" (outside it) —
    // a naive prune-from-front-only implementation would leave "ancient"
    // sitting behind "fresh" and never prune it.
    await store.insert(record({ strikeId: "fresh", occurredAt: now }));
    await store.insert(record({ strikeId: "ancient", occurredAt: 0 }));
    expect((await store.listSince(0)).map((r) => r.strikeId)).toEqual(["fresh"]);
  });
});

describe("readSovereignSiegeEngineStrikeAnnouncement", () => {
  it("parses a well-formed broadcast payload", () => {
    const payload = {
      type: "SOVEREIGN_SIEGE_ENGINE_STRIKE_ANNOUNCEMENT",
      strikeId: "cmd-1:bc",
      occurredAt: 1_000,
      casterName: "player-1",
      targetX: 50,
      targetY: 50,
      townName: "Ashford",
      populationTier: "CITY",
      populationLost: 300_000,
      targetOwnerName: "player-2"
    };
    expect(readSovereignSiegeEngineStrikeAnnouncement(payload)).toEqual({
      strikeId: "cmd-1:bc",
      occurredAt: 1_000,
      casterName: "player-1",
      targetX: 50,
      targetY: 50,
      townName: "Ashford",
      populationTier: "CITY",
      populationLost: 300_000,
      targetOwnerName: "player-2"
    });
  });

  it("returns undefined when required numeric fields are missing", () => {
    expect(readSovereignSiegeEngineStrikeAnnouncement({ strikeId: "cmd-1:bc" })).toBeUndefined();
  });

  it("falls back to safe defaults for missing optional string fields", () => {
    const parsed = readSovereignSiegeEngineStrikeAnnouncement({
      strikeId: "cmd-1:bc",
      occurredAt: 1_000,
      targetX: 50,
      targetY: 50
    });
    expect(parsed).toMatchObject({
      casterName: "Unknown Empire",
      townName: "",
      populationTier: "TOWN",
      populationLost: 0,
      targetOwnerName: "Unknown Empire"
    });
  });
});

describe("SqliteSovereignSiegeEngineStrikeStore", () => {
  it("keeps strike history recorded under the pre-rename sovereign_siege_engine_strikes table", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE sovereign_siege_engine_strikes (
        strike_id TEXT PRIMARY KEY, occurred_at INTEGER NOT NULL, caster_name TEXT NOT NULL,
        target_x INTEGER NOT NULL, target_y INTEGER NOT NULL, town_name TEXT NOT NULL,
        population_tier TEXT NOT NULL, population_lost INTEGER NOT NULL, target_owner_name TEXT NOT NULL
      );
      CREATE INDEX sovereign_siege_engine_strikes_occurred_at_idx ON sovereign_siege_engine_strikes(occurred_at);
      INSERT INTO sovereign_siege_engine_strikes VALUES ('strike-1', 1000, 'player-1', 50, 50, 'Ashford', 'CITY', 300000, 'player-2');
    `);
    const store = new SqliteSovereignSiegeEngineStrikeStore(db, () => 1_000);
    await store.applySchema();
    await store.applySchema(); // idempotent on the next boot

    expect(await store.listSince(0)).toEqual([record()]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'sovereign_siege_engine_strikes'").get()).toBeUndefined();
  });
});
