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
    tiles: new Map(tile ? [["1,1", tile]] : []),
    activeBattles: new Map(),
    outgoingMusterAttacksByTile: new Map()
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


describe("battle menu repaint", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("refreshes a muster attack timer and clears it after expiry", () => {
    const state = makeState(baseTile);
    state.outgoingMusterAttacksByTile.set("1,1", { originX: 0, originY: 1, targetX: 1, targetY: 1, resolvesAt: Date.now() + 2500 });
    const render = vi.fn();
    startTileMenuDecayTicker(state, () => stubView, render);
    vi.advanceTimersByTime(4000);
    expect(render).toHaveBeenCalledTimes(3);
  });

  it("clears resolved battle details even when map pruning removes the record first", () => {
    const state = makeState(baseTile);
    state.activeBattles.set("1,1", {
      originX: 0, originY: 1, targetX: 1, targetY: 1,
      attackerOwnerId: "me", defenderOwnerId: "ai-1", attackerWon: true,
      startAt: Date.now(), clashAt: Date.now(), endAt: Date.now() + 2500, fromSkirmish: false
    });
    const render = vi.fn();
    startTileMenuDecayTicker(state, () => stubView, render);
    vi.advanceTimersByTime(1000);
    state.activeBattles.clear();
    vi.advanceTimersByTime(3000);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("clears an animation that expires before the first ticker callback", () => {
    const state = makeState(baseTile);
    state.tileActionMenu.renderSignature = JSON.stringify({ statusText: "Battle resolved" });
    const render = vi.fn(() => { state.tileActionMenu.renderSignature = ""; });
    startTileMenuDecayTicker(state, () => stubView, render);
    vi.advanceTimersByTime(3000);
    expect(render).toHaveBeenCalledTimes(1);
  });

});
