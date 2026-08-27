import { describe, expect, it, vi } from "vitest";

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

const runDispatch = (state: ReturnType<typeof createInitialState>) =>
  processActionQueue(state, {
    ws: { OPEN: 1, readyState: 1, send: vi.fn() } as unknown as RealtimeSocket,
    authSessionReady: true,
    keyFor: (x, y) => `${x},${y}`,
    isAdjacent: () => true,
    isTileOwnedByAlly: () => false,
    pickOriginForTarget: (x, y) => state.tiles.get(`${x - 1},${y}`),
    notifyInsufficientGoldForFrontierAction: vi.fn(),
    applyOptimisticTileState: vi.fn(),
    pushFeed: vi.fn(),
    renderHud: vi.fn(),
    sendSetMuster: vi.fn(),
    sendAttack: vi.fn(),
    sendGameMessage: vi.fn(() => true)
  });

describe("optimistic capture carries actionType at dispatch time", () => {
  // Regression: the on-map frontier claim plate (client-map-3d.ts's
  // syncFrontierClaimPlate) used to gate on capture.silent, which meant a
  // direct click on an adjacent tile -- where client-action-flow.ts's
  // queueAdjacentExpandClaim deliberately sets silent = false -- played no
  // claim animation at all, while the identical claim arriving as a queued
  // waypoint step did. The plate now gates on capture.actionType === "EXPAND",
  // so the optimistic capture built here must carry actionType from dispatch
  // rather than only once ACTION_ACCEPTED lands.
  it("sets actionType EXPAND on the optimistic capture for a neutral target", () => {
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.gold = 999;
    state.manpower = 999;
    state.actionQueue = [{ x: 12, y: 18, retries: 0 }];
    state.queuedTargetKeys = new Set<string>(["12,18"]);
    state.tiles.set("11,18", makeTile({ x: 11, y: 18, ownerId: "me", ownershipState: "FRONTIER" }));
    state.tiles.set("12,18", makeTile({ x: 12, y: 18 }));

    runDispatch(state);

    expect(state.capture?.actionType).toBe("EXPAND");
    // silent still set for a neutral claim -- it governs feed/popup noise,
    // which is a separate concern from the animation.
    expect(state.capture?.silent).toBe(true);
  });

  it("still sets actionType EXPAND when the click handler clears silent", () => {
    // queueAdjacentExpandClaim flips silent off after dispatch for a direct
    // adjacent tap. The plate must still render, so actionType has to survive
    // independently of silent.
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.gold = 999;
    state.manpower = 999;
    state.actionQueue = [{ x: 12, y: 18, retries: 0 }];
    state.queuedTargetKeys = new Set<string>(["12,18"]);
    state.tiles.set("11,18", makeTile({ x: 11, y: 18, ownerId: "me", ownershipState: "FRONTIER" }));
    state.tiles.set("12,18", makeTile({ x: 12, y: 18 }));

    runDispatch(state);
    if (state.capture) state.capture.silent = false; // what the click handler does

    expect(state.capture?.actionType).toBe("EXPAND");
    expect(state.capture?.silent).toBe(false);
  });

});
