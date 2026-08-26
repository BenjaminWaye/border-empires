import { describe, expect, it, vi } from "vitest";
import { EXPAND_MANPOWER_COST } from "@border-empires/shared";

import { createInitialState } from "../client-state/client-state.js";
import { processActionQueue } from "./client-queue-logic.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import type { Tile } from "../client-types.js";

const makeTile = (overrides: Partial<Tile>): Tile => ({
  x: 0,
  y: 0,
  terrain: "LAND",
  fogged: false,
  ...overrides
});

describe("EXPAND optimistic manpower regression", () => {
  it("deducts manpower optimistically when an EXPAND is dispatched", () => {
    // Regression: the client never decremented state.manpower for EXPAND
    // (unlike SETTLE, which already did), so the HUD showed no change until
    // the next server snapshot -- even though the server now charges the
    // cost immediately on accept too.
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.gold = 999;
    state.manpower = 999;
    state.selected = { x: 11, y: 18 };
    state.actionQueue = [{ x: 12, y: 18, retries: 0 }];
    state.queuedTargetKeys = new Set<string>(["12,18"]);

    const origin = makeTile({ x: 11, y: 18, ownerId: "me", ownershipState: "FRONTIER" });
    const target = makeTile({ x: 12, y: 18 });
    state.tiles.set("11,18", origin);
    state.tiles.set("12,18", target);

    const started = processActionQueue(state, {
      ws: { OPEN: 1, readyState: 1, send: vi.fn() } as unknown as RealtimeSocket,
      authSessionReady: true,
      keyFor: (x, y) => `${x},${y}`,
      isAdjacent: () => true,
      isTileOwnedByAlly: () => false,
      pickOriginForTarget: () => origin,
      notifyInsufficientGoldForFrontierAction: vi.fn(),
      sendSetMuster: vi.fn(),
      sendAttack: vi.fn(),
      applyOptimisticTileState: vi.fn(),
      pushFeed: vi.fn(),
      renderHud: vi.fn()
    });

    expect(started).toBe(true);
    expect(state.manpower).toBe(999 - EXPAND_MANPOWER_COST);
  });
});
