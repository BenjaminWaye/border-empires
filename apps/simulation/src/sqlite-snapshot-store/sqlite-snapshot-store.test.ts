import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { SqliteSimulationEventStore } from "../sqlite-event-store.js";
import { SqliteSimulationSnapshotStore } from "./sqlite-snapshot-store.js";
import type { SimulationSnapshotSections } from "../snapshot-store/snapshot-store.js";

// Vitest's bundler can't resolve `node:sqlite` at static analysis time
// (Node 22+ builtin), so we pull DatabaseSync via createRequire — runs
// in the same process but bypasses Vite's module graph.
type DatabaseSyncCtor = new (path: string) => DatabaseSyncInstance;
type DatabaseSyncInstance = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
    get(...args: unknown[]): unknown;
  };
  close(): void;
};
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: DatabaseSyncCtor;
};

// The 2026-05-21 prod outage was a 901 MB SQLite DB on a 1 GB volume
// after 7 days of unpruned event accumulation. SQLite hit "database or
// disk is full", sim exited cleanly with code 1, and the gateway
// watchdog couldn't catch it (clean exit, not an event-loop stall).
//
// The retention contract this test pins:
//   - Saving a snapshot deletes events at or before the oldest retained
//     snapshot's last_applied_event_id.
//   - Events strictly after the oldest retained snapshot survive (they're
//     needed for replay from any of the 3 retained snapshots).
//   - First-ever save with no prior snapshots does not delete events
//     (MIN over an empty set is NULL → no-op via SQL three-valued logic).
describe("SqliteSimulationSnapshotStore event prune", () => {
  const seedEvent = (db: DatabaseSyncInstance, commandId: string) => {
    db.prepare(
      `INSERT INTO world_events (command_id, player_id, event_type, event_payload, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(commandId, "player-1", "TILE_DELTA_BATCH", JSON.stringify({}), Date.now());
  };

  const eventIds = (db: DatabaseSyncInstance): number[] =>
    (
      db
        .prepare(`SELECT event_id FROM world_events ORDER BY event_id ASC`)
        .all() as Array<{ event_id: number }>
    ).map((row) => row.event_id);

  const emptySections = (): SimulationSnapshotSections =>
    ({
      initialState: {
        tiles: [],
        players: [],
        pendingSettlements: [],
        activeLocks: [],
        docks: [],
        tileYieldCollectedAtByTile: []
      }
    }) as unknown as SimulationSnapshotSections;

  const buildStores = async (): Promise<{
    db: DatabaseSyncInstance;
    events: SqliteSimulationEventStore;
    snapshots: SqliteSimulationSnapshotStore;
  }> => {
    const db = new DatabaseSync(":memory:");
    const events = new SqliteSimulationEventStore(db);
    await events.applySchema();
    const snapshots = new SqliteSimulationSnapshotStore(db);
    await snapshots.applySchema();
    return { db, events, snapshots };
  };

  it("prunes events covered by the just-inserted snapshot on first save", async () => {
    const { db, snapshots } = await buildStores();
    seedEvent(db, "cmd-1");
    seedEvent(db, "cmd-2");
    seedEvent(db, "cmd-3");
    // Snapshot covers events 1..2; event 3 was emitted after. Saving the
    // snapshot at lastAppliedEventId=2 makes events 1 and 2 redundant
    // (recovery replays events > 2). Event 3 survives.
    await snapshots.saveSnapshot({
      lastAppliedEventId: 2,
      snapshotSections: emptySections(),
      createdAt: 1000
    });
    expect(eventIds(db)).toEqual([3]);
  });

  it("prunes events at or below the oldest retained snapshot's event id", async () => {
    const { db, snapshots } = await buildStores();
    seedEvent(db, "cmd-1");
    seedEvent(db, "cmd-2");
    seedEvent(db, "cmd-3");
    // First snapshot at event 2. Prune is a no-op (no prior snapshots).
    await snapshots.saveSnapshot({
      lastAppliedEventId: 2,
      snapshotSections: emptySections(),
      createdAt: 1000
    });
    seedEvent(db, "cmd-4");
    // Second snapshot at event 4. Oldest retained snapshot's event id is
    // 2, so events 1 and 2 should be deleted; 3 and 4 survive.
    await snapshots.saveSnapshot({
      lastAppliedEventId: 4,
      snapshotSections: emptySections(),
      createdAt: 2000
    });
    expect(eventIds(db)).toEqual([3, 4]);
  });

  it("keeps events strictly after the oldest of three retained snapshots", async () => {
    const { db, snapshots } = await buildStores();
    // Build up 6 events and 4 snapshots. After the 4th save, snapshot
    // retention drops the oldest snapshot (id=1, event=1) — so the
    // oldest retained is at event=2. Events 1 and 2 prune; 3..6 stay.
    for (let i = 1; i <= 6; i += 1) seedEvent(db, `cmd-${i}`);
    await snapshots.saveSnapshot({ lastAppliedEventId: 1, snapshotSections: emptySections(), createdAt: 1 });
    await snapshots.saveSnapshot({ lastAppliedEventId: 2, snapshotSections: emptySections(), createdAt: 2 });
    await snapshots.saveSnapshot({ lastAppliedEventId: 3, snapshotSections: emptySections(), createdAt: 3 });
    await snapshots.saveSnapshot({ lastAppliedEventId: 6, snapshotSections: emptySections(), createdAt: 4 });
    expect(eventIds(db)).toEqual([3, 4, 5, 6]);
  });

  it("chunks a large backlog so each batch yields to the event loop", async () => {
    const { db, snapshots } = await buildStores();
    // Seed 12001 events. With PRUNE_CHUNK = 5000 the prune of the first
    // 12001 events (≤ lastAppliedEventId=12001) takes 3 passes
    // (5000 + 5000 + 2001 + a 0-change exit), yielding twice mid-loop.
    // This is the regression-shape from 2026-05-21: ~200k unpruned
    // rows in a single saveSnapshot blocked the main thread past the
    // 30s watchdog threshold.
    for (let i = 1; i <= 12001; i += 1) seedEvent(db, `cmd-${i}`);
    let yields = 0;
    const realSetImmediate = global.setImmediate;
    (global as unknown as { setImmediate: typeof setImmediate }).setImmediate = ((
      cb: (...args: unknown[]) => void,
      ...args: unknown[]
    ) => {
      yields += 1;
      return realSetImmediate(cb, ...args);
    }) as typeof setImmediate;
    try {
      await snapshots.saveSnapshot({
        lastAppliedEventId: 12001,
        snapshotSections: emptySections(),
        createdAt: 1000
      });
    } finally {
      global.setImmediate = realSetImmediate;
    }
    // 12001 rows / 5000-per-chunk = 3 non-empty passes → 3 yields
    // (one after each non-empty batch). Looser ≥2 to tolerate the
    // SQL planner picking a slightly different batching strategy.
    expect(yields).toBeGreaterThanOrEqual(2);
    expect(eventIds(db)).toEqual([]);
  });
});

describe("SqliteSimulationSnapshotStore overlay memo — baseline scoping", () => {
  type Tile = { x: number; y: number; terrain: string; ownerId?: string; ownershipState?: string };
  const { DatabaseSync: Db } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: DatabaseSyncCtor };

  const sectionsFor = (worldSeed: number, tiles: Tile[]): SimulationSnapshotSections =>
    ({
      initialState: {
        tiles,
        players: [],
        pendingSettlements: [],
        activeLocks: [],
        docks: [],
        tileYieldCollectedAtByTile: [],
        season: { rulesetId: "seasonal-default", worldSeed, mapStyle: "continents" }
      }
    }) as unknown as SimulationSnapshotSections;

  it("does not return a stale overlay when the baseline changes for the same tile object", async () => {
    const db = new Db(":memory:");
    const snapshots = new SqliteSimulationSnapshotStore(db, {
      // Season 1 (seed 1): (0,0) unowned. Season 2 (seed 2): (0,0) already
      // owned by ai-1 in worldgen. Same runtime tile object across both.
      resolveBaseline: ({ worldSeed }) =>
        worldSeed === 1
          ? [{ x: 0, y: 0, terrain: "LAND" }]
          : [{ x: 0, y: 0, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" }]
    });
    await snapshots.applySchema();

    // The exact same tile object reference is reused across both checkpoints,
    // mimicking an unmutated runtime tile surviving a season rollover.
    const sharedTile: Tile = { x: 0, y: 0, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" };

    const json1 = await snapshots.preparePayload(sectionsFor(1, [sharedTile]));
    const overlay1 = (JSON.parse(json1) as { tileOverlay: Array<{ x: number; y: number; ownerId?: string }> }).tileOverlay;
    // vs season-1 baseline (unowned), the tile diverges → overlay carries ownerId.
    expect(overlay1).toEqual([expect.objectContaining({ x: 0, y: 0, ownerId: "ai-1" })]);

    const json2 = await snapshots.preparePayload(sectionsFor(2, [sharedTile]));
    const overlay2 = (JSON.parse(json2) as { tileOverlay: Array<unknown> }).tileOverlay;
    // vs season-2 baseline (already ai-1), the tile MATCHES → no overlay entry.
    // A baseline-agnostic memo would have returned the stale season-1 overlay.
    expect(overlay2).toEqual([]);
  });
});
