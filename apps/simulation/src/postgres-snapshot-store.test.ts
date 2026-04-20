import { describe, expect, it, vi } from "vitest";

import { PostgresSimulationSnapshotStore } from "./postgres-snapshot-store.js";

describe("PostgresSimulationSnapshotStore", () => {
  it("inserts snapshots with the expected shape", async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] | undefined }> = [];
    const store = new PostgresSimulationSnapshotStore({
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        calls.push({ sql: sql.trim(), params });
        if (sql.includes("RETURNING snapshot_id")) {
          return { rows: [{ snapshot_id: 42 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      })
    });

    await store.saveSnapshot({
      lastAppliedEventId: 7,
      snapshotSections: {
        initialState: {
          tiles: [{ x: 10, y: 10, ownerId: "player-1", ownershipState: "FRONTIER" }],
          activeLocks: []
        },
        commandEvents: []
      },
      createdAt: 2000
    });

    const snapshotInsert = calls.find((call) => call.sql.startsWith("INSERT INTO world_snapshots"));
    expect(snapshotInsert?.params).toEqual([
      7,
      JSON.stringify({
        tiles: [{ x: 10, y: 10, ownerId: "player-1", ownershipState: "FRONTIER" }],
        activeLocks: []
      }),
      JSON.stringify([]),
      2000
    ]);
    expect(calls.some((call) => call.sql.startsWith("DELETE FROM world_events"))).toBe(true);
    expect(calls.some((call) => call.sql.startsWith("DELETE FROM world_snapshots"))).toBe(true);
    expect(calls.some((call) => call.sql.startsWith("INSERT INTO checkpoint_metadata"))).toBe(true);
  });

  it("loads the latest snapshot row", async () => {
    const store = new PostgresSimulationSnapshotStore({
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM checkpoint_metadata")) {
          return { rows: [{ current_snapshot_id: 4 }], rowCount: 1 };
        }
        return {
          rows: [
            {
              snapshot_id: 4,
              last_applied_event_id: 9,
              snapshot_payload: {
                initialState: {
                  tiles: [{ x: 10, y: 11, ownerId: "player-1", ownershipState: "FRONTIER" }],
                  activeLocks: []
                },
                commandEvents: [{ commandId: "cmd-1", events: [] }]
              },
              created_at: 3000
            }
          ],
          rowCount: 1
        };
      })
    });

    await expect(store.loadLatestSnapshot()).resolves.toMatchObject({
      snapshotId: 4,
      lastAppliedEventId: 9,
      createdAt: 3000,
      snapshotPayload: {
        initialState: {
          tiles: [{ x: 10, y: 11, ownerId: "player-1", ownershipState: "FRONTIER" }]
        }
      }
    });
  });
});
