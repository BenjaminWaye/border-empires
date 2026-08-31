// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from "vitest";

import { createInitialState } from "./client-state/client-state.js";
import { handleWaypointAction } from "./client-waypoint-action-handlers.js";

const stubWindowStorage = (): void => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  });
};

const keyFor = (x: number, y: number): string => `${x},${y}`;
const noop = (): void => {};

/**
 * Regression coverage for the OUT_OF_REACH_EXPAND discovery tip firing at the
 * moment a player queues a waypoint outside their reach -- see
 * client-waypoint-action-handlers.ts::setWaypointForSelected. EXPAND is not
 * reach-gated server-side (an out-of-reach claim still lands, it just decays
 * in two minutes unless reach is extended to it), so this is the client's
 * only chance to warn the player before the round trip to the server.
 */
describe("queuing a waypoint outside reach announces the OUT_OF_REACH_EXPAND tip", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("enqueues the discovery tip when the queued target is outside the player's reach", () => {
    stubWindowStorage();
    const state = createInitialState();
    state.me = "me";
    state.gold = 10_000;
    state.manpower = 10_000;
    state.tiles.set("0,0", { x: 0, y: 0, terrain: "LAND", ownerId: "me" } as never);
    // A reach set that doesn't include the target -- (9, 9) is outside it no
    // matter what the local tile-based approximation would compute.
    state.serverReach = new Set<string>(["0,0"]);
    state.serverReachRevision = 1;

    const handled = handleWaypointAction({
      state,
      selected: { x: 9, y: 9 },
      actionId: "expand_here",
      keyFor,
      pushFeed: noop,
      renderHud: noop,
      hideTileActionMenu: noop,
      showCaptureAlert: noop,
      processActionQueue: () => false
    });

    expect(handled).toBe(true);
    expect(state.waypoint).toHaveLength(1);
    expect(state.discoveryTipQueue).toContain("OUT_OF_REACH_EXPAND");
  });

  it("does not enqueue the discovery tip when the queued target is inside the player's reach", () => {
    stubWindowStorage();
    const state = createInitialState();
    state.me = "me";
    state.gold = 10_000;
    state.manpower = 10_000;
    state.tiles.set("0,0", { x: 0, y: 0, terrain: "LAND", ownerId: "me" } as never);
    state.serverReach = new Set<string>(["0,0", "9,9"]);
    state.serverReachRevision = 1;

    const handled = handleWaypointAction({
      state,
      selected: { x: 9, y: 9 },
      actionId: "expand_here",
      keyFor,
      pushFeed: noop,
      renderHud: noop,
      hideTileActionMenu: noop,
      showCaptureAlert: noop,
      processActionQueue: () => false
    });

    expect(handled).toBe(true);
    expect(state.waypoint).toHaveLength(1);
    expect(state.discoveryTipQueue).not.toContain("OUT_OF_REACH_EXPAND");
  });
});

/**
 * Regression coverage for cancel_waypoint only cancelling the waypoint whose
 * target matches the tile the menu was opened on, not the entire queue --
 * see client-waypoint-action-handlers.ts::handleWaypointAction.
 */
describe("cancel_waypoint cancels only the selected waypoint", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("removes only the waypoint matching the selected tile, leaving the rest queued", () => {
    stubWindowStorage();
    const state = createInitialState();
    state.me = "me";
    state.waypoint = [
      { target: { x: 1, y: 1 }, plan: { reachable: true } as never, planId: "a", plannedAt: 1 },
      { target: { x: 2, y: 2 }, plan: { reachable: true } as never, planId: "b", plannedAt: 2 },
      { target: { x: 3, y: 3 }, plan: { reachable: true } as never, planId: "c", plannedAt: 3 }
    ];

    const sendGameMessage = vi.fn(() => true);
    const handled = handleWaypointAction({
      state,
      selected: { x: 2, y: 2 },
      actionId: "cancel_waypoint",
      keyFor,
      pushFeed: noop,
      renderHud: noop,
      hideTileActionMenu: noop,
      showCaptureAlert: noop,
      processActionQueue: () => false,
      sendGameMessage
    });

    expect(handled).toBe(true);
    expect(state.waypoint.map((w) => w.planId)).toEqual(["a", "c"]);
    expect(sendGameMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "WAYPOINT_CANCEL", x: 2, y: 2 }));
  });
});
