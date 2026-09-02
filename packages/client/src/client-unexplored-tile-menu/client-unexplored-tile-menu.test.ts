import { describe, expect, it, vi } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import { openUnexploredTileActionMenu } from "./client-unexplored-tile-menu.js";
import type { TileMenuView } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const baseDeps = () => ({
  keyFor,
  pickOriginForTarget: () => undefined,
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

  it("offers Expand To for a reachable unexplored target and makes actions the default tab — the client never guesses it might be a mountain or sea to refuse it", () => {
    const state = createInitialState();
    state.me = "me";
    // A settled town (TOWN_REACH_RADIUS = 3) so the (5,7) target below
    // falls inside the player's reach -- Add Waypoint is now reach-gated
    // the same way Build Relay Beacon already is.
    state.tiles.set(keyFor(5, 5), {
      x: 5,
      y: 5,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: { name: "Capital", type: "FARMING", populationTier: "SETTLEMENT" }
    } as never);
    state.tiles.set(keyFor(5, 6), { x: 5, y: 6, terrain: "LAND" });
    const deps = baseDeps();

    // (5, 7) is unexplored — not in state.tiles at all — yet reachable via the
    // known neutral stepping stone at (5, 6). It might turn out to be a
    // mountain in reality; that's only ever discovered once the player
    // actually gets there, never guessed upfront.
    openUnexploredTileActionMenu(state, 5, 7, 10, 20, deps);

    const [view] = deps.renderTileActionMenu.mock.calls[0] as [TileMenuView, number, number];
    // expand_here, not settle_land: an unexplored target has no entry in
    // state.tiles at all, and settle_land's click handler needs one (see
    // the sibling regression coverage in client-tile-action-fogged.test.ts).
    expect(view.actions[0]?.id).toBe("expand_here");
    expect(view.actions[0]?.label).toBe("Expand To");
    expect(view.tabs[0]).toBe("actions");
    // The "Unexplored (x, y)" info must still be reachable via the Overview tab.
    expect(view.tabs).toContain("overview");
    expect(state.tileActionMenu.activeTab).toBe("actions");
  });

  it("shows the Overview tab (not a dead empty-actions tab) for an unexplored target with no path from owned territory", () => {
    const state = createInitialState();
    state.me = "me";
    const deps = baseDeps();

    openUnexploredTileActionMenu(state, 200, 200, 10, 20, deps);

    const [view] = deps.renderTileActionMenu.mock.calls[0] as [TileMenuView, number, number];
    expect(view.actions).toHaveLength(0);
    // Regression guard: previously tabs was hardcoded to ["actions"], so an
    // unreachable target could only ever land on a permanently-empty
    // Actions tab and show the generic "No actions available on this tile
    // right now." fallback instead of "This tile has not been explored yet."
    expect(view.tabs).toEqual(["overview"]);
    expect(state.tileActionMenu.activeTab).toBe("overview");
    expect(view.overviewLines[0]?.html).toMatch(/not been explored yet/i);
  });
});
