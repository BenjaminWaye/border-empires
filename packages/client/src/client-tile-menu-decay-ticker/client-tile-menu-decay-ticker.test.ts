import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startTileMenuDecayTicker } from "./client-tile-menu-decay-ticker.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileMenuView } from "../client-types.js";

const baseTile: Tile = { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" };

const makeState = (tile: Tile | undefined): ClientState =>
  ({
    tileActionMenu: {
      visible: true,
      x: 0,
      y: 0,
      mode: "single",
      bulkKeys: [],
      currentTileKey: "1,1",
      activeTab: "overview",
      scrollTopByTab: {},
      renderSignature: ""
    },
    tiles: new Map(tile ? [["1,1", tile]] : [])
  }) as unknown as ClientState;

const stubView = {} as TileMenuView;

describe("startTileMenuDecayTicker", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("re-renders every second while the open menu's tile is decaying", () => {
    const state = makeState({ ...baseTile, frontierDecayAt: Date.now() + 30_000, frontierDecayKind: "OUT_OF_REACH" });
    const renderTileActionMenu = vi.fn();
    startTileMenuDecayTicker(state, () => stubView, renderTileActionMenu);
    vi.advanceTimersByTime(3_000);
    expect(renderTileActionMenu).toHaveBeenCalledTimes(3);
  });

  it("does not re-render when the open tile has no decay timer", () => {
    const state = makeState({ ...baseTile });
    const renderTileActionMenu = vi.fn();
    startTileMenuDecayTicker(state, () => stubView, renderTileActionMenu);
    vi.advanceTimersByTime(3_000);
    expect(renderTileActionMenu).not.toHaveBeenCalled();
  });

  it("does not re-render when no single tile menu is open", () => {
    const state = makeState({ ...baseTile, frontierDecayAt: Date.now() + 30_000, frontierDecayKind: "ENCIRCLEMENT" });
    state.tileActionMenu.visible = false;
    const renderTileActionMenu = vi.fn();
    startTileMenuDecayTicker(state, () => stubView, renderTileActionMenu);
    vi.advanceTimersByTime(3_000);
    expect(renderTileActionMenu).not.toHaveBeenCalled();
  });
});
