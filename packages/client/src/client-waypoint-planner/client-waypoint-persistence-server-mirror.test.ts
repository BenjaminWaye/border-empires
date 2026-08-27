import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import {
  persistWaypointQueueForPlayer,
  restorePersistedWaypointQueueForPlayer,
  syncWaypointQueueToServer,
  waypointCancelAllWirePayload,
  waypointCancelWirePayload,
  waypointEnqueueWirePayload
} from "./client-waypoint-persistence.js";

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

describe("waypoint queue wire payloads", () => {
  it("builds enqueue/cancel/cancel-all payloads", () => {
    expect(waypointEnqueueWirePayload({ x: 1, y: 2 })).toEqual({ type: "WAYPOINT_ENQUEUE", x: 1, y: 2 });
    expect(waypointEnqueueWirePayload({ x: 1, y: 2 }, true)).toEqual({ type: "WAYPOINT_ENQUEUE", x: 1, y: 2, trackBarbarian: true });
    expect(waypointCancelWirePayload({ x: 1, y: 2 })).toEqual({ type: "WAYPOINT_CANCEL", x: 1, y: 2 });
    expect(waypointCancelAllWirePayload()).toEqual({ type: "WAYPOINT_CANCEL_ALL" });
  });
});

describe("syncWaypointQueueToServer", () => {
  it("cancels everything then re-enqueues each target in order", () => {
    const sendGameMessage = vi.fn(() => true);
    const state: Pick<ClientState, "waypoint"> = {
      waypoint: [
        { target: { x: 1, y: 1 }, plan: { reachable: true, path: [], expandCount: 0, attackCount: 0 } as any },
        { target: { x: 2, y: 2 }, plan: { reachable: true, path: [], expandCount: 0, attackCount: 0 } as any, trackBarbarian: true }
      ]
    };

    syncWaypointQueueToServer(state, sendGameMessage);

    expect(sendGameMessage.mock.calls).toEqual([
      [{ type: "WAYPOINT_CANCEL_ALL" }],
      [{ type: "WAYPOINT_ENQUEUE", x: 1, y: 1 }],
      [{ type: "WAYPOINT_ENQUEUE", x: 2, y: 2, trackBarbarian: true }]
    ]);
  });

  it("is a no-op without a sendGameMessage dep", () => {
    const state: Pick<ClientState, "waypoint"> = { waypoint: [] };
    expect(() => syncWaypointQueueToServer(state, undefined)).not.toThrow();
  });
});

describe("restorePersistedWaypointQueueForPlayer: server merge", () => {
  it("restores purely from the server queue when sessionStorage is empty", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = stateWithTiles([tile(5, 5)]);

    const restored = restorePersistedWaypointQueueForPlayer("me", { state, keyFor }, [{ x: 5, y: 5, queuedAt: 1 }]);

    expect(restored).toHaveLength(1);
    expect(restored[0]?.target).toEqual({ x: 5, y: 5 });
  });

  it("orders server-known targets first, appending session-only extras after", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = stateWithTiles([tile(1, 1), tile(2, 2)]);
    persistWaypointQueueForPlayer("me", [{ target: { x: 2, y: 2 }, plan: { reachable: true, path: [], expandCount: 0, attackCount: 0 } as any }]);

    const restored = restorePersistedWaypointQueueForPlayer("me", { state, keyFor }, [{ x: 1, y: 1, queuedAt: 1 }]);

    expect(restored.map((w) => w.target)).toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }]);
  });

  it("skips a target already reached while offline", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = stateWithTiles([tile(5, 5, { ownerId: "me" })]);

    const restored = restorePersistedWaypointQueueForPlayer("me", { state, keyFor }, [{ x: 5, y: 5, queuedAt: 1 }]);

    expect(restored).toHaveLength(0);
  });

  it("adopts the server's remaining steps (from cursor) as the local plan instead of re-planning blind", () => {
    // Test 5 (docs/waypoint-client-planning-plan.md): reconnect mid-plan --
    // no re-plan, the client resumes exactly where the server's cursor left
    // off. Tile (9,10) below is deliberately absent from local state.tiles
    // (as if fog/chunk data hasn't arrived yet) -- a blind planWaypoint()
    // re-run here would have nothing to route through and could fail or
    // produce a different path than the server actually walked.
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = stateWithTiles([tile(10, 10, { ownerId: "me" })]);

    const restored = restorePersistedWaypointQueueForPlayer("me", { state, keyFor }, [
      {
        x: 12,
        y: 10,
        queuedAt: 1,
        planId: "plan-server-1",
        plannedAt: 500,
        cursor: 1,
        steps: [
          { origin: { x: 10, y: 10 }, target: { x: 11, y: 10 }, action: "EXPAND" },
          { origin: { x: 11, y: 10 }, target: { x: 12, y: 10 }, action: "EXPAND" }
        ]
      }
    ]);

    expect(restored).toHaveLength(1);
    expect(restored[0]?.planId).toBe("plan-server-1");
    expect(restored[0]?.plannedAt).toBe(500);
    // Only the step from cursor (1) onward -- step 0 already happened.
    expect(restored[0]?.plan.steps).toHaveLength(1);
    expect(restored[0]?.plan.steps[0]).toMatchObject({ origin: { x: 11, y: 10 }, target: { x: 12, y: 10 }, action: "EXPAND" });
    expect(restored[0]?.plan.reachable).toBe(true);
  });

  it("re-plans instead of adopting steps when the server entry is stalled", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = stateWithTiles([tile(1, 1, { ownerId: "me" }), tile(2, 1)]);

    const restored = restorePersistedWaypointQueueForPlayer("me", { state, keyFor }, [
      {
        x: 2,
        y: 1,
        queuedAt: 1,
        planId: "plan-stale",
        plannedAt: 10,
        cursor: 0,
        stalled: true,
        steps: [{ origin: { x: 1, y: 1 }, target: { x: 2, y: 1 }, action: "EXPAND" }]
      }
    ]);

    expect(restored).toHaveLength(1);
    // Re-planned fresh via planWaypoint -- not simply the stalled steps
    // handed back verbatim.
    expect(restored[0]?.plan.reachable).toBe(true);
    expect(restored[0]?.plan.steps.length).toBeGreaterThan(0);
  });

  // Regression / desync-investigation coverage: restorePersistedWaypointQueueForPlayer
  // is a pure merge -- it takes no sendGameMessage dependency at all, so it
  // cannot itself push anything to the server. A reconnect whose
  // sessionStorage is empty (fresh tab/device) could otherwise be tempted to
  // "sync" that empty local state back to the server as a
  // WAYPOINT_CANCEL_ALL, wiping the server-authoritative queue the player
  // built up while offline. Prove the actual end-to-end guarantee: feed the
  // restored (server-authoritative) queue into state.waypoint and re-run
  // syncWaypointQueueToServer (the only function that ever emits
  // WAYPOINT_CANCEL_ALL) -- it must re-enqueue every restored target, never
  // resync down to nothing.
  it("round-trips the server-authoritative queue through sync without wiping it, even when sessionStorage is empty", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = stateWithTiles([tile(5, 5), tile(6, 6)]);

    const restored = restorePersistedWaypointQueueForPlayer("me", { state, keyFor }, [{ x: 5, y: 5, queuedAt: 1 }, { x: 6, y: 6, queuedAt: 2 }]);
    expect(restored).toHaveLength(2);

    state.waypoint = restored;
    const sendGameMessage = vi.fn(() => true);
    syncWaypointQueueToServer(state, sendGameMessage);

    expect(sendGameMessage).toHaveBeenCalledWith(waypointCancelAllWirePayload());
    expect(sendGameMessage).toHaveBeenCalledWith(waypointEnqueueWirePayload({ x: 5, y: 5 }));
    expect(sendGameMessage).toHaveBeenCalledWith(waypointEnqueueWirePayload({ x: 6, y: 6 }));
    expect(sendGameMessage).toHaveBeenCalledTimes(3);
  });
});
