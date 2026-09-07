import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MUSTER_MENU_REPAINT_INTERVAL_MS, startMusterMenuRepaintTicker } from "./client-muster-menu-repaint-ticker.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileMenuView } from "../client-types.js";

const musterTile: Tile = {
  x: 5,
  y: 5,
  terrain: "LAND",
  ownerId: "me",
  muster: { ownerId: "me", amount: 10, mode: "HOLD", updatedAt: 0 }
};

const makeState = (overrides: Partial<ClientState> = {}): ClientState =>
  ({
    me: "me",
    tiles: new Map([["5,5", musterTile]]),
    tileActionMenu: { visible: true, mode: "single", currentTileKey: "5,5", x: 100, y: 200 },
    ...overrides
  }) as unknown as ClientState;

describe("startMusterMenuRepaintTicker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("repaints at the ~250ms cadence while a muster tile's menu is open", () => {
    const state = makeState();
    const tileMenuViewForTile = vi.fn((tile: Tile) => ({ tile }) as unknown as TileMenuView);
    const renderTileActionMenu = vi.fn();
    startMusterMenuRepaintTicker(state, tileMenuViewForTile, renderTileActionMenu);

    vi.advanceTimersByTime(MUSTER_MENU_REPAINT_INTERVAL_MS);
    expect(renderTileActionMenu).toHaveBeenCalledTimes(1);
    expect(renderTileActionMenu).toHaveBeenCalledWith({ tile: musterTile }, 100, 200);
    vi.advanceTimersByTime(MUSTER_MENU_REPAINT_INTERVAL_MS);
    expect(renderTileActionMenu).toHaveBeenCalledTimes(2);
  });

  it("does not repaint when the open tile has no muster flag", () => {
    const state = makeState({
      tiles: new Map([["5,5", { x: 5, y: 5, terrain: "LAND", ownerId: "me" }]])
    });
    const renderTileActionMenu = vi.fn();
    startMusterMenuRepaintTicker(state, vi.fn(), renderTileActionMenu);

    vi.advanceTimersByTime(MUSTER_MENU_REPAINT_INTERVAL_MS * 4);
    expect(renderTileActionMenu).not.toHaveBeenCalled();
  });

  it("does not repaint a muster flag owned by someone else", () => {
    const state = makeState({
      tiles: new Map([["5,5", { x: 5, y: 5, terrain: "LAND", ownerId: "rival", muster: { ownerId: "rival", amount: 10, mode: "HOLD", updatedAt: 0 } }]])
    });
    const renderTileActionMenu = vi.fn();
    startMusterMenuRepaintTicker(state, vi.fn(), renderTileActionMenu);

    vi.advanceTimersByTime(MUSTER_MENU_REPAINT_INTERVAL_MS * 4);
    expect(renderTileActionMenu).not.toHaveBeenCalled();
  });

  it("does not repaint when no menu is visible", () => {
    const state = makeState({
      tileActionMenu: {
        visible: false,
        mode: "single",
        currentTileKey: "5,5",
        x: 0,
        y: 0,
        bulkKeys: [],
        activeTab: "overview",
        scrollTopByTab: {},
        renderSignature: ""
      } as unknown as ClientState["tileActionMenu"]
    });
    const renderTileActionMenu = vi.fn();
    startMusterMenuRepaintTicker(state, vi.fn(), renderTileActionMenu);

    vi.advanceTimersByTime(MUSTER_MENU_REPAINT_INTERVAL_MS * 4);
    expect(renderTileActionMenu).not.toHaveBeenCalled();
  });
});
