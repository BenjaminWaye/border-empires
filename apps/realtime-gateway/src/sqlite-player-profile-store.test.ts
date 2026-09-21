import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { SqliteGatewayPlayerProfileStore } from "./sqlite-player-profile-store.js";

// Vitest's bundler can't resolve `node:sqlite` at static analysis time
// (Node 22+ builtin), so we pull DatabaseSync via createRequire — runs
// in the same process but bypasses Vite's module graph.
type DatabaseSyncCtor = new (path: string) => { exec(sql: string): void };
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: DatabaseSyncCtor;
};

const createStore = async (now = () => Date.now()): Promise<SqliteGatewayPlayerProfileStore> => {
  const db = new DatabaseSync(":memory:") as ConstructorParameters<typeof SqliteGatewayPlayerProfileStore>[0];
  const store = new SqliteGatewayPlayerProfileStore(db, now);
  await store.applySchema();
  return store;
};

describe("SqliteGatewayPlayerProfileStore", () => {
  it("records nameChangedSeasonId only when passed, and preserves it across colour-only updates", async () => {
    const store = await createStore(() => 1_000);

    await store.setProfile("player-1", "Nauticus", "#123456");
    await expect(store.get("player-1")).resolves.toEqual({
      playerId: "player-1",
      name: "Nauticus",
      tileColor: "#123456",
      profileComplete: true,
      updatedAt: 1_000
    });

    await store.setProfile("player-1", "Renamed", "#123456", "season-1");
    await expect(store.get("player-1")).resolves.toEqual({
      playerId: "player-1",
      name: "Renamed",
      tileColor: "#123456",
      profileComplete: true,
      nameChangedSeasonId: "season-1",
      updatedAt: 1_000
    });

    // Colour-only update (no nameChangedSeasonId passed): must not clear it.
    await store.setTileColor("player-1", "#abcdef");
    await expect(store.get("player-1")).resolves.toEqual({
      playerId: "player-1",
      name: "Renamed",
      tileColor: "#abcdef",
      profileComplete: true,
      nameChangedSeasonId: "season-1",
      updatedAt: 1_000
    });

    // Re-submitting the same name via setProfile (e.g. a colour-only change
    // through SET_PROFILE) with no seasonId also must not clear it.
    await store.setProfile("player-1", "Renamed", "#abcdef");
    await expect(store.get("player-1")).resolves.toEqual({
      playerId: "player-1",
      name: "Renamed",
      tileColor: "#abcdef",
      profileComplete: true,
      nameChangedSeasonId: "season-1",
      updatedAt: 1_000
    });
  });

  it("applySchema is idempotent against an already-migrated table (no duplicate-column crash)", async () => {
    const db = new DatabaseSync(":memory:") as ConstructorParameters<typeof SqliteGatewayPlayerProfileStore>[0];
    const store = new SqliteGatewayPlayerProfileStore(db);
    await store.applySchema();
    await store.applySchema();
    await store.setProfile("player-1", "Nauticus", "#123456", "season-1");
    await expect(store.get("player-1")).resolves.toEqual(
      expect.objectContaining({ name: "Nauticus", nameChangedSeasonId: "season-1" })
    );
  });

  it("persists musterUnlockedSeasonId through setHintState and keeps it across unrelated hint patches", async () => {
    const store = await createStore();
    await store.setProfile("player-1", "Nauticus", "#123456");
    // Fresh row: the column is NULL, so the field is absent.
    await expect(store.get("player-1")).resolves.not.toHaveProperty("musterUnlockedSeasonId");

    await store.setHintState("player-1", { musterUnlockedSeasonId: "season-1" });
    await expect(store.get("player-1")).resolves.toEqual(
      expect.objectContaining({ musterUnlockedSeasonId: "season-1", name: "Nauticus" })
    );

    // A later hint patch that omits the field must COALESCE to the stored value.
    await store.setHintState("player-1", { hintsMuted: true });
    await expect(store.get("player-1")).resolves.toEqual(
      expect.objectContaining({ musterUnlockedSeasonId: "season-1", hintsMuted: true })
    );
  });

  it("overwrites musterUnlockedSeasonId when a new season's contact unlock is reported", async () => {
    const store = await createStore();
    await store.setProfile("player-1", "Nauticus", "#123456");
    await store.setHintState("player-1", { musterUnlockedSeasonId: "season-1" });
    await store.setHintState("player-1", { musterUnlockedSeasonId: "season-2" });
    await expect(store.get("player-1")).resolves.toEqual(expect.objectContaining({ musterUnlockedSeasonId: "season-2" }));
  });

  it("setActivitySeen is monotonic within the same season", async () => {
    const store = await createStore();
    await store.setActivitySeen("player-1", 1_000, "season-1");
    await expect(store.get("player-1")).resolves.toEqual(
      expect.objectContaining({ lastActivitySeenAt: 1_000, lastActivitySeenSeasonId: "season-1" })
    );

    // An older acknowledgement (e.g. a second device racing a stale value)
    // must not move the watermark backwards.
    await store.setActivitySeen("player-1", 500, "season-1");
    await expect(store.get("player-1")).resolves.toEqual(
      expect.objectContaining({ lastActivitySeenAt: 1_000, lastActivitySeenSeasonId: "season-1" })
    );

    await store.setActivitySeen("player-1", 2_000, "season-1");
    await expect(store.get("player-1")).resolves.toEqual(
      expect.objectContaining({ lastActivitySeenAt: 2_000, lastActivitySeenSeasonId: "season-1" })
    );
  });

  it("setActivitySeen overwrites outright when the season changes, even to an earlier timestamp", async () => {
    const store = await createStore();
    await store.setActivitySeen("player-1", 5_000, "season-1");
    // A new season's ack, even with a numerically smaller seenAt (fresh
    // season clock), must not be clamped by the old season's watermark.
    await store.setActivitySeen("player-1", 100, "season-2");
    await expect(store.get("player-1")).resolves.toEqual(
      expect.objectContaining({ lastActivitySeenAt: 100, lastActivitySeenSeasonId: "season-2" })
    );
  });
});
