// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from "vitest";

import { createInitialState } from "./client-state/client-state.js";
import { handleWaypointAction } from "./client-waypoint-action-handlers.js";
import { hideEffortConfirmSheet, isEffortConfirmSheetOpen } from "./client-effort-confirm-sheet/client-effort-confirm-sheet.js";

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
 * reach-gated server-side (an out-of-reach claim still lands but depends
 * on its supply route), so this is the client's
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

  it.each(["town", "dockId", "fort", "economicStructure"])("does not warn for a %s that can be garrisoned outside reach", (field) => {
    stubWindowStorage();
    const state = createInitialState();
    state.me = "me";
    state.gold = 10_000;
    state.manpower = 10_000;
    state.serverReach = new Set(["0,0"]);
    state.serverReachRevision = 1;
    state.tiles.set("0,0", { x: 0, y: 0, terrain: "LAND", ownerId: "me" });
    state.tiles.set("9,9", { x: 9, y: 9, terrain: "LAND", [field]: field === "dockId" ? "dock-1" : {} } as never);
    handleWaypointAction({ state, selected: { x: 9, y: 9 }, actionId: "expand_here", keyFor,
      pushFeed: noop, renderHud: noop, hideTileActionMenu: noop, showCaptureAlert: noop, processActionQueue: () => false });
    expect(state.waypoint).toHaveLength(1);
    expect(state.discoveryTipQueue).not.toContain("OUT_OF_REACH_EXPAND");
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

/**
 * Regression coverage for cancel_all_waypoints -- reachable from any tile's
 * menu (appendCancelAllWaypointsAction, client-waypoint-menu-actions.ts),
 * not just a waypoint's own target, since that target can be a tile the
 * player can no longer see (off-screen or never explored).
 */
describe("cancel_all_waypoints clears the entire queue from any tile", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("clears every queued waypoint without requiring the selected tile to match any of them", () => {
    stubWindowStorage();
    const state = createInitialState();
    state.me = "me";
    state.waypoint = [
      { target: { x: 1, y: 1 }, plan: { reachable: true } as never, planId: "a", plannedAt: 1 },
      { target: { x: 9999, y: 9999 }, plan: { reachable: true } as never, planId: "b", plannedAt: 2 }
    ];

    const sendGameMessage = vi.fn(() => true);
    const handled = handleWaypointAction({
      state,
      selected: { x: 50, y: 50 }, // matches none of the queued waypoints
      actionId: "cancel_all_waypoints",
      keyFor,
      pushFeed: noop,
      renderHud: noop,
      hideTileActionMenu: noop,
      showCaptureAlert: noop,
      processActionQueue: () => false,
      sendGameMessage
    });

    expect(handled).toBe(true);
    expect(state.waypoint).toHaveLength(0);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "WAYPOINT_CANCEL_ALL" });
  });

  it("is a no-op when the queue is already empty", () => {
    stubWindowStorage();
    const state = createInitialState();
    state.me = "me";
    state.waypoint = [];

    const sendGameMessage = vi.fn(() => true);
    const handled = handleWaypointAction({
      state,
      selected: undefined,
      actionId: "cancel_all_waypoints",
      keyFor,
      pushFeed: noop,
      renderHud: noop,
      hideTileActionMenu: noop,
      showCaptureAlert: noop,
      processActionQueue: () => false,
      sendGameMessage
    });

    expect(handled).toBe(true);
    expect(state.waypoint).toHaveLength(0);
  });
});

/**
 * March Attack rows replaced Expand To & Attack on a deep enemy tile; they
 * dispatch through handleWaypointAction to the real March To commit sheet,
 * from the origin the clicked row names.
 */
describe("a March Attack row opens the March To commit sheet", () => {
  afterEach(() => {
    hideEffortConfirmSheet();
    vi.unstubAllGlobals();
  });

  it("opens the sheet from the new-flag tile the row names, marked as a new flag", () => {
    stubWindowStorage();
    const state = createInitialState();
    state.me = "me";
    state.musterFlagLimit = 2;
    state.tiles.set("17,10", { x: 17, y: 10, terrain: "LAND", ownerId: "me" });
    state.tiles.set("20,10", { x: 20, y: 10, terrain: "LAND", ownerId: "rival", ownershipState: "FRONTIER" });
    const handled = handleWaypointAction({
      state,
      selected: { x: 20, y: 10 },
      actionId: "march_attack_new_flag",
      originKey: "17,10",
      keyFor,
      pushFeed: noop,
      renderHud: noop,
      hideTileActionMenu: noop,
      showCaptureAlert: noop,
      processActionQueue: () => false,
      sendGameMessage: () => true
    });
    expect(handled).toBe(true);
    expect(isEffortConfirmSheetOpen()).toBe(true);
    expect(state.pendingArrowGestureConfirm).toEqual({ origin: { x: 17, y: 10 }, target: { x: 20, y: 10 }, newFlag: true });
  });
});

describe("an unexplored tile's Explore button", () => {
  it("closes the menu and launches the scout drone toward the pressed tile", () => {
    const state = createInitialState();
    state.me = "me";
    const hideTileActionMenu = vi.fn();
    const sendGameMessage = vi.fn(() => true);

    const handled = handleWaypointAction({
      state,
      selected: { x: 20, y: 10 },
      actionId: "explore_scout",
      keyFor,
      pushFeed: noop,
      renderHud: noop,
      hideTileActionMenu,
      showCaptureAlert: noop,
      processActionQueue: () => false,
      sendGameMessage
    });

    expect(handled).toBe(true);
    expect(hideTileActionMenu).toHaveBeenCalled();
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "EXPLORE", x: 20, y: 10 });
  });
});

// Playtest Run 4 follow-up: Expand To asks before attacking. These cover the handler wiring around that prompt.
describe("Expand To through barbarian land", () => {
  afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });

  // A one-tile corridor: my land at (10,10), barbarians at (11,10), the empty target at (12,10); sea all round.
  const corridorState = () => {
    stubWindowStorage();
    const state = createInitialState();
    state.me = "me";
    state.gold = 10_000;
    state.manpower = 10_000;
    for (let x = 9; x <= 13; x += 1) for (let y = 9; y <= 11; y += 1) state.tiles.set(keyFor(x, y), { x, y, terrain: "SEA" } as never);
    state.tiles.set(keyFor(10, 10), { x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as never);
    state.tiles.set(keyFor(11, 10), { x: 11, y: 10, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "BARBARIAN" } as never);
    state.tiles.set(keyFor(12, 10), { x: 12, y: 10, terrain: "LAND" } as never);
    state.serverReach = new Set(["10,10", "11,10", "12,10"]);
    state.serverReachRevision = 1;
    return state;
  };
  const run = (state: ReturnType<typeof createInitialState>, actionId: string) =>
    handleWaypointAction({ state, selected: { x: 12, y: 10 }, actionId, keyFor, pushFeed: noop, renderHud: noop,
      hideTileActionMenu: noop, showCaptureAlert: noop, processActionQueue: () => false });

  it("asks first, and queues an approved route only on confirm", () => {
    const state = corridorState();
    run(state, "expand_here");
    expect(state.waypoint).toHaveLength(0);
    document.querySelector<HTMLButtonElement>("[data-pact-go]")!.click();
    expect(state.waypoint).toHaveLength(1);
    expect(state.waypoint[0]!.attacksConfirmed).toBe(true);
  });

  // Regression: the queue was cleared before the prompt, so cancelling it wiped every waypoint.
  it("keeps the existing queue when the clear-and-expand prompt is cancelled", () => {
    const state = corridorState();
    state.waypoint.push({ target: { x: 40, y: 40 }, plan: { steps: [], attackCount: 0, expandCount: 0 } } as never);
    run(state, "clear_waypoint_and_expand_here");
    document.querySelector<HTMLButtonElement>("[data-pact-cancel]")!.click();
    expect(state.waypoint.map((w) => w.target)).toEqual([{ x: 40, y: 40 }]);
  });
});
