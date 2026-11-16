import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  diplomacyMemoryExpiresAt,
  MAX_DIPLOMACY_MEMORY_PAIRS,
  type StoredDiplomacyMemoryPair
} from "../ai-diplomacy-memory/ai-diplomacy-memory-record.js";
import { InMemoryGatewaySocialStore, type GatewaySocialStore } from "./social-store.js";
import { SqliteGatewaySocialStore } from "./social-store-sqlite.js";

// Vitest can't resolve the `node:sqlite` builtin statically (see
// social-store-sqlite-terms.test.ts), so load it at runtime.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: typeof DatabaseSyncType };

const pair = (playerId: string, touchedAt: number, overrides: Partial<StoredDiplomacyMemoryPair> = {}): StoredDiplomacyMemoryPair => {
  const values = {
    aiPlayerId: "ai-1",
    playerId,
    tilesTakenFromAi: { value: 6.5, at: touchedAt },
    tilesTakenByAi: { value: 1, at: touchedAt - 10 },
    recentTilesTakenFromAi: { value: 2.25, at: touchedAt },
    recentTilesTakenByAi: { value: 0, at: touchedAt },
    battles: { value: 3, at: touchedAt },
    truceDeals: { value: 1, at: touchedAt - 20 },
    goodwillCoin: { value: 40, at: touchedAt - 30 },
    lastPlayerAttackAt: touchedAt,
    lastCombatAt: touchedAt,
    aiPaidForPeaceAt: undefined,
    touchedAt,
    expiresAt: 0,
    ...overrides
  };
  return { ...values, expiresAt: overrides.expiresAt ?? diplomacyMemoryExpiresAt(values) };
};

const stores: Array<[string, () => GatewaySocialStore]> = [
  ["in-memory", () => new InMemoryGatewaySocialStore()],
  [
    "sqlite",
    () => {
      const store = new SqliteGatewaySocialStore(new DatabaseSync(":memory:"));
      store.applySchema();
      return store;
    }
  ]
];

describe.each(stores)("AI diplomacy memory in the %s social store", (_name, makeStore) => {
  it("saves and loads pairs exactly, least recently touched first", () => {
    const store = makeStore();
    const newer = pair("p1", 5_000, { aiPaidForPeaceAt: 4_000, lastPlayerAttackAt: undefined });
    const older = pair("p2", 2_000);
    store.writeAiDiplomacyMemory([newer, older], []);
    expect(store.loadSnapshot().aiDiplomacyMemory).toEqual([older, newer]);
  });

  it("upserts a changed pair and deletes removed ones in the same write", () => {
    const store = makeStore();
    store.writeAiDiplomacyMemory([pair("p1", 1_000), pair("p2", 1_000)], []);
    const changed = pair("p1", 2_000, { battles: { value: 9, at: 2_000 } });
    store.writeAiDiplomacyMemory([changed], [{ aiPlayerId: "ai-1", playerId: "p2" }]);
    expect(store.loadSnapshot().aiDiplomacyMemory).toEqual([changed]);
  });

  it("prunes pairs whose memory has all faded", () => {
    const store = makeStore();
    store.writeAiDiplomacyMemory([pair("faded", 1_000, { expiresAt: 10_000 }), pair("fresh", 1_000, { expiresAt: 10_001 })], []);
    store.pruneExpired(10_000);
    expect(store.loadSnapshot().aiDiplomacyMemory?.map((stored) => stored.playerId)).toEqual(["fresh"]);
  });

  it("caps the table at the memory's pair limit, dropping the least recently touched", () => {
    const store = makeStore();
    const pairs = Array.from({ length: MAX_DIPLOMACY_MEMORY_PAIRS + 2 }, (_, index) => pair(`p${index}`, 1_000 + index));
    store.writeAiDiplomacyMemory(pairs, []);
    store.pruneExpired(0);
    const stored = store.loadSnapshot().aiDiplomacyMemory ?? [];
    expect(stored).toHaveLength(MAX_DIPLOMACY_MEMORY_PAIRS);
    expect(stored[0]?.playerId).toBe("p2");
  });

  it("clears every pair at a new season", () => {
    const store = makeStore();
    store.writeAiDiplomacyMemory([pair("p1", 1_000)], []);
    store.clearSeasonData();
    expect(store.loadSnapshot().aiDiplomacyMemory).toEqual([]);
  });
});

describe("AI diplomacy memory SQLite schema", () => {
  it("is applied idempotently with one value/at column pair per fading field", () => {
    const db = new DatabaseSync(":memory:");
    const store = new SqliteGatewaySocialStore(db);
    store.applySchema();
    store.applySchema();
    const columns = (db.prepare("PRAGMA table_info(social_ai_diplomacy_memory)").all() as Array<{ name: string }>).map((column) => column.name);
    expect(columns).toEqual(expect.arrayContaining([
      "ai_player_id", "player_id", "tiles_taken_from_ai", "tiles_taken_from_ai_at", "recent_tiles_taken_by_ai_at",
      "goodwill_coin", "ai_paid_for_peace_at", "touched_at", "expires_at"
    ]));
  });
});
