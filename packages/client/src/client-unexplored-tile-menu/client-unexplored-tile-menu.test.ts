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

  it("offers Expand Here for a reachable unexplored target — the client never guesses it might be a mountain or sea to refuse it", () => {
    const state = createInitialState();
    state.me = "me";
    state.tiles.set(keyFor(5, 5), { x: 5, y: 5, terrain: "LAND", ownerId: "me" });
    state.tiles.set(keyFor(5, 6), { x: 5, y: 6, terrain: "LAND" });
    const deps = baseDeps();

    // (5, 7) is unexplored — not in state.tiles at all — yet reachable via the
    // known neutral stepping stone at (5, 6). It might turn out to be a
    // mountain in reality; that's only ever discovered once the player
    // actually gets there, never guessed upfront.
    openUnexploredTileActionMenu(state, 5, 7, 10, 20, deps);

    const [view] = deps.renderTileActionMenu.mock.calls[0] as [TileMenuView, number, number];
    expect(view.actions[0]?.id).toBe("expand_here");
  });

  it("offers no action for an unexplored target with no path from owned territory", () => {
    const state = createInitialState();
    state.me = "me";
    const deps = baseDeps();

    openUnexploredTileActionMenu(state, 200, 200, 10, 20, deps);

    const [view] = deps.renderTileActionMenu.mock.calls[0] as [TileMenuView, number, number];
    expect(view.actions).toHaveLength(0);
  });
});
