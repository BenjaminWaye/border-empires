// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import type { HudV2Deps } from "./client-hud-v2-context.js";
import { focusTileAndOpenMenu } from "./client-hud-v2-focus-tile.js";

const town: Tile = { x: 40, y: 12, terrain: "LAND" };

const deps = () => {
  const state = createInitialState();
  state.tiles.set("40,12", town);
  const openSingleTileActionMenu = vi.fn();
  const d = {
    state,
    wrapX: (x: number) => x,
    wrapY: (y: number) => y,
    requestViewRefresh: vi.fn(),
    actionFlow: { openSingleTileActionMenu } as unknown as HudV2Deps["actionFlow"]
  };
  return { d, state, openSingleTileActionMenu };
};

// First-15 playtest 2026-11-28 (pt-snacker, pt-achiever): "Next ›" moved the camera and selected a tile,
// but the tile's menu -- where the step's action is -- stayed shut, so the tap looked like it did nothing.
describe("Next › / tracker row focus", () => {
  it("centres the tile and opens its menu", () => {
    const { d, state, openSingleTileActionMenu } = deps();
    focusTileAndOpenMenu(d, 40, 12);
    expect([state.camX, state.selected]).toEqual([40, { x: 40, y: 12 }]);
    expect(openSingleTileActionMenu).toHaveBeenCalledWith(town, expect.any(Number), expect.any(Number));
  });

  it("only moves the camera to a tile it has no data for", () => {
    const { d, state, openSingleTileActionMenu } = deps();
    focusTileAndOpenMenu(d, 3, 4);
    expect(state.selected).toEqual({ x: 3, y: 4 });
    expect(openSingleTileActionMenu).not.toHaveBeenCalled();
  });
});
