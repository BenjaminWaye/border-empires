import { describe, expect, it, vi } from "vitest";

import { createInitialState } from "./client-state.js";
import { processActionQueue } from "./client-queue-logic.js";
import type { RealtimeSocket } from "./client-socket-types.js";
import type { Tile } from "./client-types.js";

const makeTile = (overrides: Partial<Tile>): Tile => ({
  x: 0,
  y: 0,
  terrain: "LAND",
  fogged: false,
  ...overrides
});

describe("frontier queue regressions", () => {
  it("keeps neutral expand targets neutral until the server accepts the action", () => {
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.gold = 999;
    state.selected = { x: 11, y: 18 };
    state.actionQueue = [{ x: 12, y: 18, retries: 0 }];
    state.queuedTargetKeys = new Set<string>(["12,18"]);

    const origin = makeTile({ x: 11, y: 18, ownerId: "me", ownershipState: "FRONTIER" });
    const target = makeTile({ x: 12, y: 18 });
    state.tiles.set("11,18", origin);
    state.tiles.set("12,18", target);

    const send = vi.fn();
    const applyOptimisticTileState = vi.fn((x: number, y: number, update: (tile: Tile) => void) => {
      const tileKey = `${x},${y}`;
      const current = state.tiles.get(tileKey) ?? makeTile({ x, y });
      const next = { ...current };
      update(next);
      state.tiles.set(tileKey, next);
    });

    const started = processActionQueue(state, {
      ws: { OPEN: 1, readyState: 1, send } as unknown as RealtimeSocket,
      authSessionReady: true,
      keyFor: (x, y) => `${x},${y}`,
      isAdjacent: () => true,
      pickOriginForTarget: () => origin,
      notifyInsufficientGoldForFrontierAction: vi.fn(),
      applyOptimisticTileState,
      pushFeed: vi.fn(),
      renderHud: vi.fn()
    });

    expect(started).toBe(true);
    expect(send).toHaveBeenCalledWith(JSON.stringify({ type: "EXPAND", fromX: 11, fromY: 18, toX: 12, toY: 18 }));
    expect(applyOptimisticTileState).not.toHaveBeenCalled();
    expect(state.tiles.get("12,18")).toEqual(expect.not.objectContaining({ ownerId: "me" }));
    expect(state.tiles.get("12,18")?.ownershipState).toBeUndefined();
  });
});
