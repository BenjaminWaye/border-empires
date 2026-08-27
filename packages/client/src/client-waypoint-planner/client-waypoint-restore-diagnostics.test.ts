import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { snapshotClientDebugEvents } from "../client-debug/client-debug.js";
import { restorePersistedWaypointQueueForPlayer } from "./client-waypoint-persistence.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const installSessionStorageMock = () => {
  let values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => {
      values = new Map<string, string>();
    }
  });
};

const tile = (x: number, y: number, overrides: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ...overrides });

const stateWithTiles = (tiles: Tile[]): ClientState => {
  const state = createInitialState();
  state.me = "me";
  for (const t of tiles) state.tiles.set(keyFor(t.x, t.y), t);
  return state;
};

// This restore has twice now come back empty for a waypoint the durable
// server-side command log shows was never cancelled (see
// runtime-waypoint-queue-command-handlers.ts's doc history). These tests
// don't reproduce that loss -- nobody has been able to yet -- they prove the
// instrumentation added to investigate it actually fires, so the next
// occurrence is provable from a diagnostics bundle's recentDebugEvents
// instead of requiring a manual production database inspection again.
describe("restorePersistedWaypointQueueForPlayer diagnostics", () => {
  it("logs waypoint-restore-empty when both server and session are empty", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = stateWithTiles([]);

    const restored = restorePersistedWaypointQueueForPlayer("me", { state, keyFor }, []);

    expect(restored).toHaveLength(0);
    const events = snapshotClientDebugEvents().filter((e) => e.event === "waypoint-restore-empty");
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({ playerId: "me", serverProvided: true });
  });

  it("logs waypoint-restore-empty with serverProvided: false when serverWaypointQueue is undefined", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = stateWithTiles([]);

    restorePersistedWaypointQueueForPlayer("me", { state, keyFor }, undefined);

    const events = snapshotClientDebugEvents().filter((e) => e.event === "waypoint-restore-empty");
    expect(events.at(-1)?.payload).toMatchObject({ playerId: "me", serverProvided: false });
  });

  it("logs waypoint-restore-filtered when an entry is dropped as already-owned", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = stateWithTiles([tile(5, 5, { ownerId: "me" })]);

    const restored = restorePersistedWaypointQueueForPlayer("me", { state, keyFor }, [{ x: 5, y: 5, queuedAt: 1 }]);

    expect(restored).toHaveLength(0);
    const events = snapshotClientDebugEvents().filter((e) => e.event === "waypoint-restore-filtered");
    expect(events.at(-1)?.payload).toMatchObject({
      playerId: "me",
      serverCount: 1,
      orderedCount: 1,
      restoredCount: 0,
      alreadyOwnedTargets: [{ x: 5, y: 5 }]
    });
  });

  it("does not log waypoint-restore-filtered when nothing was dropped", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = stateWithTiles([tile(5, 5)]);
    const before = snapshotClientDebugEvents().length;

    restorePersistedWaypointQueueForPlayer("me", { state, keyFor }, [{ x: 5, y: 5, queuedAt: 1 }]);

    // The ring buffer (snapshotClientDebugEvents) is process-global and not
    // reset between tests in this file, so check for a NEW event past
    // `before` rather than filtering the whole buffer.
    const newEvents = snapshotClientDebugEvents().slice(before);
    expect(newEvents.some((e) => e.event === "waypoint-restore-filtered")).toBe(false);
  });
});
