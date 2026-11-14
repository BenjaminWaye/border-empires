import { describe, expect, it, vi } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import { openUnexploredTileActionMenu } from "./client-unexplored-tile-menu.js";
import type { ScoutDroneFlight } from "@border-empires/shared";
import type { TileMenuView } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const baseDeps = () => ({
  keyFor,
  renderTileActionMenu: vi.fn(),
  resetAttackPreviewState: vi.fn()
});

describe("openUnexploredTileActionMenu", () => {
  it("selects and opens the menu for any unexplored tile, showing only coordinates and unexplored status", () => {
    const state = createInitialState();
    state.me = "me";
    const deps = baseDeps();

    openUnexploredTileActionMenu(state, 12, 34, 100, 120, deps);

    expect(state.selected).toEqual({ x: 12, y: 34 });
    expect(state.tileActionMenu.mode).toBe("single");
    expect(state.tileActionMenu.currentTileKey).toBe(keyFor(12, 34));
    expect(deps.renderTileActionMenu).toHaveBeenCalledTimes(1);
    const [view] = deps.renderTileActionMenu.mock.calls[0] as [TileMenuView, number, number];
    expect(view.title).toBe("Unexplored");
    expect(view.subtitle).toBe("(12, 34)");
  });

  const flight = (landsAt: number): ScoutDroneFlight => ({
    launchedAt: 0,
    landsAt,
    targetX: 9,
    targetY: 9,
    steps: [{ x: 0, y: 0, at: 0 }, { x: 1, y: 1, at: 1 }],
    turnIndex: 1,
    endReason: "TARGET"
  });
  const openAt = (state: ReturnType<typeof createInitialState>, x: number, y: number): TileMenuView => {
    const deps = baseDeps();
    openUnexploredTileActionMenu(state, x, y, 0, 0, deps);
    return (deps.renderTileActionMenu.mock.calls[0] as [TileMenuView, number, number])[0];
  };

  // docs/explore-scout-plan.md: pressing unexplored ground means "look that
  // way", so the only action is Explore -- never Expand To or March To, even
  // with a reachable path or a muster flag nearby.
  it("offers a single Explore action, even next to the player's land and with a muster flag raised", () => {
    const state = createInitialState();
    state.me = "me";
    state.tiles.set(keyFor(5, 5), { x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", muster: { ownerId: "me", amount: 0, mode: "HOLD", updatedAt: 0 } });
    state.tiles.set(keyFor(5, 6), { x: 5, y: 6, terrain: "LAND" });
    const view = openAt(state, 5, 7);
    expect(view.actions.map((action) => [action.id, action.label, action.disabled ?? false])).toEqual([["explore_scout", "Explore", false]]);
    expect(view.actions[0]?.detail).toMatch(/claims nothing/);
    expect(view.tabs).toEqual(["actions", "overview"]);
    expect(state.tileActionMenu.activeTab).toBe("actions");
    expect(view.overviewLines[0]?.html).toMatch(/not been explored yet/i);
  });

  it("offers Explore for far-off ground with no path from the player's land", () => {
    const state = createInitialState();
    state.me = "me";
    const view = openAt(state, 200, 200);
    expect(view.actions.map((action) => action.id)).toEqual(["explore_scout"]);
  });

  it("disables Explore with the time left while the scout drone is out", () => {
    const state = createInitialState();
    state.me = "me";
    state.scoutDroneFlight = flight(Date.now() + 80_000);
    const view = openAt(state, 3, 3);
    expect(view.actions[0]).toMatchObject({ id: "explore_scout", disabled: true });
    expect(view.actions[0]?.disabledReason).toMatch(/^Scout drone is out, back in 1m 2\ds$/);
  });

  it("enables Explore again once the drone has landed", () => {
    const state = createInitialState();
    state.me = "me";
    state.scoutDroneFlight = flight(Date.now() - 1);
    expect(openAt(state, 3, 3).actions[0]?.disabled).toBeFalsy();
  });
});
