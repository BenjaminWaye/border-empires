import { describe, expect, it } from "vitest";

import {
  InMemoryWorldEngineStrikeStore,
  readWorldEngineStrikeAnnouncement,
  WORLD_ENGINE_STRIKE_HISTORY_WINDOW_MS,
  type WorldEngineStrikeRecord
} from "./world-engine-strike-store.js";

const record = (overrides: Partial<WorldEngineStrikeRecord> = {}): WorldEngineStrikeRecord => ({
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

describe("InMemoryWorldEngineStrikeStore", () => {
  it("returns an inserted record from listSince", async () => {
    const store = new InMemoryWorldEngineStrikeStore(() => 1_000);
    await store.insert(record());
    expect(await store.listSince(0)).toEqual([record()]);
  });

  it("ignores a duplicate insert of the same strikeId", async () => {
    const store = new InMemoryWorldEngineStrikeStore(() => 1_000);
    await store.insert(record());
    await store.insert(record({ populationLost: 999 }));
    const all = await store.listSince(0);
    expect(all).toHaveLength(1);
    expect(all[0]?.populationLost).toBe(300_000);
  });

  it("excludes records older than the requested cutoff", async () => {
    const store = new InMemoryWorldEngineStrikeStore(() => 1_000);
    await store.insert(record({ strikeId: "old", occurredAt: 100 }));
    await store.insert(record({ strikeId: "new", occurredAt: 900 }));
    expect((await store.listSince(500)).map((r) => r.strikeId)).toEqual(["new"]);
  });

  it("prunes records older than the 12h history window on insert", async () => {
    let now = 0;
    const store = new InMemoryWorldEngineStrikeStore(() => now);
    await store.insert(record({ strikeId: "ancient", occurredAt: 0 }));
    now = WORLD_ENGINE_STRIKE_HISTORY_WINDOW_MS + 1;
    await store.insert(record({ strikeId: "fresh", occurredAt: now }));
    expect((await store.listSince(0)).map((r) => r.strikeId)).toEqual(["fresh"]);
  });

  it("prunes stale records even when insert() calls arrive out of occurredAt order", async () => {
    const now = WORLD_ENGINE_STRIKE_HISTORY_WINDOW_MS + 1_000;
    const store = new InMemoryWorldEngineStrikeStore(() => now);
    // "fresh" (within the window) is inserted before "ancient" (outside it) —
    // a naive prune-from-front-only implementation would leave "ancient"
    // sitting behind "fresh" and never prune it.
    await store.insert(record({ strikeId: "fresh", occurredAt: now }));
    await store.insert(record({ strikeId: "ancient", occurredAt: 0 }));
    expect((await store.listSince(0)).map((r) => r.strikeId)).toEqual(["fresh"]);
  });
});

describe("readWorldEngineStrikeAnnouncement", () => {
  it("parses a well-formed broadcast payload", () => {
    const payload = {
      type: "WORLD_ENGINE_STRIKE_ANNOUNCEMENT",
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
    expect(readWorldEngineStrikeAnnouncement(payload)).toEqual({
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
    expect(readWorldEngineStrikeAnnouncement({ strikeId: "cmd-1:bc" })).toBeUndefined();
  });

  it("falls back to safe defaults for missing optional string fields", () => {
    const parsed = readWorldEngineStrikeAnnouncement({
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
