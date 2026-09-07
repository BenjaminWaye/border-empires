import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { startMusterWatchKeepaliveTicker, MUSTER_WATCH_KEEPALIVE_INTERVAL_MS } from "./client-muster-watch-keepalive-ticker.js";
import type { Tile } from "../client-types.js";

const makeTile = (overrides: Partial<Tile>): Tile => ({
  x: 0,
  y: 0,
  terrain: "LAND",
  ...overrides
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("startMusterWatchKeepaliveTicker", () => {
  beforeEach(() => vi.useFakeTimers());

  it("re-sends WATCH_MUSTER while the tile menu is open on an owned muster tile", () => {
    const state = createInitialState();
    state.me = "me";
    const tile = makeTile({ x: 3, y: 4, ownerId: "me", muster: { ownerId: "me", amount: 8, mode: "HOLD", updatedAt: 0 } });
    state.tiles.set("3,4", tile);
    state.tileActionMenu.visible = true;
    state.tileActionMenu.mode = "single";
    state.tileActionMenu.currentTileKey = "3,4";
    const sendGameMessage = vi.fn();

    startMusterWatchKeepaliveTicker(state, { sendGameMessage });

    vi.advanceTimersByTime(MUSTER_WATCH_KEEPALIVE_INTERVAL_MS);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "WATCH_MUSTER", x: 3, y: 4 });
  });

  it("does not resend for a tile the player doesn't own a muster flag on", () => {
    const state = createInitialState();
    state.me = "me";
    const tile = makeTile({ x: 3, y: 4, ownerId: "me" });
    state.tiles.set("3,4", tile);
    state.tileActionMenu.visible = true;
    state.tileActionMenu.mode = "single";
    state.tileActionMenu.currentTileKey = "3,4";
    const sendGameMessage = vi.fn();

    startMusterWatchKeepaliveTicker(state, { sendGameMessage });

    vi.advanceTimersByTime(MUSTER_WATCH_KEEPALIVE_INTERVAL_MS);
    expect(sendGameMessage).not.toHaveBeenCalled();
  });

  it("does not resend for another player's muster flag", () => {
    const state = createInitialState();
    state.me = "me";
    const tile = makeTile({ x: 3, y: 4, ownerId: "enemy", muster: { ownerId: "enemy", amount: 8, mode: "HOLD", updatedAt: 0 } });
    state.tiles.set("3,4", tile);
    state.tileActionMenu.visible = true;
    state.tileActionMenu.mode = "single";
    state.tileActionMenu.currentTileKey = "3,4";
    const sendGameMessage = vi.fn();

    startMusterWatchKeepaliveTicker(state, { sendGameMessage });

    vi.advanceTimersByTime(MUSTER_WATCH_KEEPALIVE_INTERVAL_MS);
    expect(sendGameMessage).not.toHaveBeenCalled();
  });

  it("does not resend when no single tile menu is open", () => {
    const state = createInitialState();
    state.me = "me";
    const sendGameMessage = vi.fn();

    startMusterWatchKeepaliveTicker(state, { sendGameMessage });

    vi.advanceTimersByTime(MUSTER_WATCH_KEEPALIVE_INTERVAL_MS * 2);
    expect(sendGameMessage).not.toHaveBeenCalled();
  });
});
