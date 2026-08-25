import { describe, expect, it, vi } from "vitest";
import { EXPAND_MANPOWER_COST, SETTLE_COST, SETTLE_MANPOWER_COST } from "@border-empires/shared";

import { createClientOriginSelection } from "../client-origin-selection/client-origin-selection.js";
import { createInitialState } from "../client-state/client-state.js";
import { developmentSlotReason, processActionQueue, reconcileActionQueue, requestSettlement } from "./client-queue-logic.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import type { Tile } from "../client-types.js";

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

const makeTile = (overrides: Partial<Tile>): Tile => ({
  x: 0,
  y: 0,
  terrain: "LAND",
  fogged: false,
  ...overrides
});

describe("frontier queue regressions", () => {
  it("shows a visible settlement warning when a frontier tile cannot be afforded", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = SETTLE_COST - 1;
    state.tiles.set("7,8", makeTile({ x: 7, y: 8, ownerId: "me", ownershipState: "FRONTIER" }));
    const pushFeed = vi.fn();
    const showCaptureAlert = vi.fn();

    const started = requestSettlement(state, 7, 8, {
      keyFor: (x, y) => `${x},${y}`,
      pushFeed,
      showCaptureAlert,
      renderHud: vi.fn(),
      queueDevelopmentAction: vi.fn(() => true),
      developmentSlotSummary: () => ({ busy: 0, limit: 1, available: 1 }),
      developmentSlotReason,
      sendGameMessage: vi.fn(() => true),
      syncOptimisticSettlementTile: vi.fn()
    });

    expect(started).toBe(false);
    expect(showCaptureAlert).toHaveBeenCalledWith("Settlement blocked", `Need ${SETTLE_COST} gold to settle this tile.`, "warn");
    expect(pushFeed).toHaveBeenCalledWith(`Need ${SETTLE_COST} gold to settle this tile.`, "combat", "warn");
  });

  it("shows a visible settlement warning when a frontier tile's manpower cannot be afforded, even with plenty of gold", () => {
    // Regression for the client manpower-gate fix (docs/manpower-economy-rewrite-plan.md
    // §4.1-§4.2): SETTLE now costs manpower too, and the client must check it
    // before dispatching, not just gold — otherwise it shows the action as
    // available when the server would reject it with INSUFFICIENT_MANPOWER.
    const state = createInitialState();
    state.me = "me";
    state.gold = 999;
    state.manpower = SETTLE_MANPOWER_COST - 1;
    state.tiles.set("7,8", makeTile({ x: 7, y: 8, ownerId: "me", ownershipState: "FRONTIER" }));
    const pushFeed = vi.fn();
    const showCaptureAlert = vi.fn();

    const started = requestSettlement(state, 7, 8, {
      keyFor: (x, y) => `${x},${y}`,
      pushFeed,
      showCaptureAlert,
      renderHud: vi.fn(),
      queueDevelopmentAction: vi.fn(() => true),
      developmentSlotSummary: () => ({ busy: 0, limit: 1, available: 1 }),
      developmentSlotReason,
      sendGameMessage: vi.fn(() => true),
      syncOptimisticSettlementTile: vi.fn()
    });

    expect(started).toBe(false);
    expect(showCaptureAlert).toHaveBeenCalledWith("Settlement blocked", `Need ${SETTLE_MANPOWER_COST} manpower to settle this tile.`, "warn");
  });

  it("deducts both gold and manpower optimistically when a settlement is dispatched", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 999;
    state.manpower = 999;
    state.tiles.set("7,8", makeTile({ x: 7, y: 8, ownerId: "me", ownershipState: "FRONTIER" }));

    const started = requestSettlement(state, 7, 8, {
      keyFor: (x, y) => `${x},${y}`,
      pushFeed: vi.fn(),
      showCaptureAlert: vi.fn(),
      renderHud: vi.fn(),
      queueDevelopmentAction: vi.fn(() => true),
      developmentSlotSummary: () => ({ busy: 0, limit: 1, available: 1 }),
      developmentSlotReason,
      sendGameMessage: vi.fn(() => true),
      syncOptimisticSettlementTile: vi.fn()
    });

    expect(started).toBe(true);
    expect(state.gold).toBe(999 - SETTLE_COST);
    expect(state.manpower).toBe(999 - SETTLE_MANPOWER_COST);
  });

  it("does not dispatch EXPAND when manpower is below EXPAND_MANPOWER_COST, even with plenty of gold", () => {
    // Regression for the client manpower-gate fix: processActionQueue's EXPAND
    // branch only checked gold before dispatching — it must also check manpower.
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.gold = 999;
    state.manpower = EXPAND_MANPOWER_COST - 1;
    state.selected = { x: 11, y: 18 };
    state.actionQueue = [{ x: 12, y: 18, retries: 0 }];
    state.queuedTargetKeys = new Set<string>(["12,18"]);

    const origin = makeTile({ x: 11, y: 18, ownerId: "me", ownershipState: "FRONTIER" });
    const target = makeTile({ x: 12, y: 18 });
    state.tiles.set("11,18", origin);
    state.tiles.set("12,18", target);

    const send = vi.fn();
    const pushFeed = vi.fn();
    const notifyInsufficientGoldForFrontierAction = vi.fn();

    const started = processActionQueue(state, {
      ws: { OPEN: 1, readyState: 1, send } as unknown as RealtimeSocket,
      authSessionReady: true,
      keyFor: (x, y) => `${x},${y}`,
      isAdjacent: () => true,
      isTileOwnedByAlly: () => false,
      pickOriginForTarget: () => origin,
      notifyInsufficientGoldForFrontierAction,
      sendSetMuster: vi.fn(),
      sendAttack: vi.fn(),
      applyOptimisticTileState: vi.fn(),
      pushFeed,
      renderHud: vi.fn()
    });

    expect(started).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(notifyInsufficientGoldForFrontierAction).not.toHaveBeenCalled();
    expect(pushFeed).toHaveBeenCalledWith(`Need ${EXPAND_MANPOWER_COST} manpower to claim this tile.`, "combat", "error");
    expect(state.queuedTargetKeys.has("12,18")).toBe(false);
  });

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
      isTileOwnedByAlly: () => false,
      pickOriginForTarget: () => origin,
      notifyInsufficientGoldForFrontierAction: vi.fn(),
      sendSetMuster: vi.fn(),
      sendAttack: vi.fn(),
      applyOptimisticTileState,
      pushFeed: vi.fn(),
      renderHud: vi.fn()
    });

    expect(started).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    const sentPayload = send.mock.calls[0]?.[0];
    expect(typeof sentPayload).toBe("string");
    expect(JSON.parse(sentPayload as string)).toMatchObject({
      type: "EXPAND",
      fromX: 11,
      fromY: 18,
      toX: 12,
      toY: 18,
      clientSeq: 1
    });
    expect(applyOptimisticTileState).not.toHaveBeenCalled();
    expect(state.tiles.get("12,18")).toEqual(expect.not.objectContaining({ ownerId: "me" }));
    expect(state.tiles.get("12,18")?.ownershipState).toBeUndefined();
  });

  // EXPAND's optimistic-manpower-deduction regression test moved to
  // client-queued-expand-manpower-regression.test.ts to keep this file from
  // crossing the repo's 500-line cap.

  it("waits for confirmed ownership when only an optimistic origin is available", () => {
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.gold = 999;
    state.actionQueue = [{ x: 12, y: 18, retries: 0 }];
    state.queuedTargetKeys = new Set<string>(["12,18"]);

    const optimisticOrigin = makeTile({ x: 11, y: 18, ownerId: "me", ownershipState: "FRONTIER", optimisticPending: "expand" });
    const target = makeTile({ x: 12, y: 18 });
    state.tiles.set("11,18", optimisticOrigin);
    state.tiles.set("12,18", target);

    const send = vi.fn();

    const started = processActionQueue(state, {
      ws: { OPEN: 1, readyState: 1, send } as unknown as RealtimeSocket,
      authSessionReady: true,
      keyFor: (x, y) => `${x},${y}`,
      isAdjacent: () => true,
      isTileOwnedByAlly: () => false,
      pickOriginForTarget: (_x, _y, _allowDock, allowOptimisticOrigin) => (allowOptimisticOrigin ? optimisticOrigin : undefined),
      notifyInsufficientGoldForFrontierAction: vi.fn(),
      sendSetMuster: vi.fn(),
      sendAttack: vi.fn(),
      applyOptimisticTileState: vi.fn(),
      pushFeed: vi.fn(),
      renderHud: vi.fn()
    });

    expect(started).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(state.actionQueue).toEqual([{ x: 12, y: 18, retries: 0 }]);
    expect(state.queuedTargetKeys.has("12,18")).toBe(true);
    expect(state.frontierSyncWaitUntilByTarget.get("12,18")).toBeGreaterThan(Date.now());
  });

  it("proceeds to dispatch attacks from a freshly optimistic frontier origin, without waiting for confirmed ownership", () => {
    // ATTACK targets (owned by someone else) are allowed to dispatch from an
    // optimistic origin — only EXPAND targets onto a neutral tile need to
    // wait for a confirmed (non-optimistic) origin. Previously a dead
    // `allowOptimisticOrigin` variable meant this case incorrectly fell into
    // the confirmed-origin wait path and could stall the queue indefinitely
    // whenever the origin's own claim never resolved. With no muster flag
    // set up yet, dispatch takes the "stage a flag and park" branch rather
    // than firing immediately — but critically it gets there at all, instead
    // of looping forever in the confirmed-origin wait.
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.gold = 999;
    state.actionQueue = [{ x: 12, y: 18, retries: 0 }];
    state.queuedTargetKeys = new Set<string>(["12,18"]);

    const optimisticOrigin = makeTile({ x: 11, y: 18, ownerId: "me", ownershipState: "FRONTIER", optimisticPending: "expand" });
    const enemyTarget = makeTile({ x: 12, y: 18, ownerId: "enemy", ownershipState: "FRONTIER" });
    state.tiles.set("11,18", optimisticOrigin);
    state.tiles.set("12,18", enemyTarget);

    const send = vi.fn();
    const sendSetMuster = vi.fn();
    const sendAttack = vi.fn();

    const started = processActionQueue(state, {
      ws: { OPEN: 1, readyState: 1, send } as unknown as RealtimeSocket,
      authSessionReady: true,
      keyFor: (x, y) => `${x},${y}`,
      isAdjacent: () => true,
      isTileOwnedByAlly: () => false,
      pickOriginForTarget: (_x, _y, _allowDock, allowOptimisticOrigin) => (allowOptimisticOrigin ? optimisticOrigin : undefined),
      notifyInsufficientGoldForFrontierAction: vi.fn(),
      sendSetMuster,
      sendAttack,
      applyOptimisticTileState: vi.fn(),
      pushFeed: vi.fn(),
      renderHud: vi.fn()
    });

    expect(started).toBe(false);
    expect(sendAttack).not.toHaveBeenCalled();
    expect(sendSetMuster).toHaveBeenCalledWith(11, 18, "HOLD");
    expect(state.pendingMusterAttacks).toEqual([
      expect.objectContaining({ targetX: 12, targetY: 18, fromX: 11, fromY: 18 })
    ]);
    expect(state.actionQueue).toEqual([]);
    expect(state.frontierSyncWaitUntilByTarget.has("12,18")).toBe(false);
  });

  it("keeps a queued target chained off another target that is only locally queued (not yet dispatched)", () => {
    // Regression for chained EXPAND queuing: clicking a neutral tile C whose
    // only neighbor is B — itself neutral and merely sitting in the local
    // action queue, not yet dispatched or accepted — must not be dropped by
    // reconciliation just because B isn't a real (or even optimistic-pending)
    // origin yet. Uses the real origin selector (not a mock) so this
    // exercises the actual pickOriginForTarget chaining logic end to end.
    const state = createInitialState();
    state.me = "me";
    const keyFor = (x: number, y: number): string => `${x},${y}`;
    const selector = createClientOriginSelection({
      state,
      keyFor,
      wrapX: (x) => wrap(x, 450),
      wrapY: (y) => wrap(y, 450)
    });

    // A: owned. B: neutral, adjacent to A, queued but not yet dispatched.
    // C: neutral, adjacent only to B (not to A).
    state.tiles.set("11,18", makeTile({ x: 11, y: 18, ownerId: "me", ownershipState: "SETTLED" }));
    state.tiles.set("12,18", makeTile({ x: 12, y: 18 }));
    state.tiles.set("13,19", makeTile({ x: 13, y: 19 }));
    state.actionQueue = [
      { x: 12, y: 18, retries: 0 },
      { x: 13, y: 19, retries: 0 }
    ];
    state.queuedTargetKeys = new Set<string>(["12,18", "13,19"]);

    const clearOptimisticTileState = vi.fn();
    reconcileActionQueue(state, {
      keyFor,
      pickOriginForTarget: selector.pickOriginForTarget,
      clearOptimisticTileState
    });

    expect(state.actionQueue).toEqual([
      { x: 12, y: 18, retries: 0 },
      { x: 13, y: 19, retries: 0 }
    ]);
    expect(state.queuedTargetKeys.has("13,19")).toBe(true);
    expect(clearOptimisticTileState).not.toHaveBeenCalled();
  });

  it("drops a queued target once its only chained-off neighbor is no longer pending", () => {
    // Mirror of the test above, but B was never actually queued/pending —
    // C has no confirmed or optimistic origin at all, so reconciliation must
    // still drop it (no regression in the pre-existing drop path).
    const state = createInitialState();
    state.me = "me";
    const keyFor = (x: number, y: number): string => `${x},${y}`;
    const selector = createClientOriginSelection({
      state,
      keyFor,
      wrapX: (x) => wrap(x, 450),
      wrapY: (y) => wrap(y, 450)
    });

    state.tiles.set("11,18", makeTile({ x: 11, y: 18, ownerId: "me", ownershipState: "SETTLED" }));
    state.tiles.set("12,18", makeTile({ x: 12, y: 18 })); // B: neutral, not queued
    state.tiles.set("13,19", makeTile({ x: 13, y: 19 })); // C: only adjacent to B
    state.actionQueue = [{ x: 13, y: 19, retries: 0 }];
    state.queuedTargetKeys = new Set<string>(["13,19"]);

    const clearOptimisticTileState = vi.fn();
    reconcileActionQueue(state, {
      keyFor,
      pickOriginForTarget: selector.pickOriginForTarget,
      clearOptimisticTileState
    });

    expect(state.actionQueue).toEqual([]);
    expect(state.queuedTargetKeys.has("13,19")).toBe(false);
    expect(clearOptimisticTileState).toHaveBeenCalledWith("13,19", true);
  });

  it("dispatches a chained EXPAND once its predecessor actually resolves to ownership", () => {
    // End-to-end version of the chaining tests above: drives processActionQueue
    // with the real origin selector (not a mock) through a full B-then-C
    // cycle. B (adjacent to owned A) dispatches first; C (adjacent only to
    // B) must not dispatch while B is still in flight, and must dispatch
    // from B only after B's tile reflects real (non-optimistic) ownership.
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.gold = 999;
    state.manpower = 999;
    const keyFor = (x: number, y: number): string => `${x},${y}`;
    const selector = createClientOriginSelection({
      state,
      keyFor,
      wrapX: (x) => wrap(x, 450),
      wrapY: (y) => wrap(y, 450)
    });

    state.tiles.set("11,18", makeTile({ x: 11, y: 18, ownerId: "me", ownershipState: "SETTLED" })); // A
    state.tiles.set("12,18", makeTile({ x: 12, y: 18 })); // B: neutral, adjacent to A
    state.tiles.set("13,19", makeTile({ x: 13, y: 19 })); // C: neutral, adjacent only to B
    state.actionQueue = [
      { x: 12, y: 18, retries: 0 },
      { x: 13, y: 19, retries: 0 }
    ];
    state.queuedTargetKeys = new Set<string>(["12,18", "13,19"]);

    const send = vi.fn();
    const deps = {
      ws: { OPEN: 1, readyState: 1, send } as unknown as RealtimeSocket,
      authSessionReady: true,
      keyFor,
      isAdjacent: selector.isAdjacent,
      isTileOwnedByAlly: () => false,
      pickOriginForTarget: selector.pickOriginForTarget,
      notifyInsufficientGoldForFrontierAction: vi.fn(),
      sendSetMuster: vi.fn(),
      sendAttack: vi.fn(),
      applyOptimisticTileState: vi.fn(),
      pushFeed: vi.fn(),
      renderHud: vi.fn()
    };

    // 1) B is the only viable dispatch: adjacent to owned A.
    expect(processActionQueue(state, deps)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(send.mock.calls[0]?.[0] as string)).toMatchObject({ type: "EXPAND", fromX: 11, fromY: 18, toX: 12, toY: 18 });
    expect(state.actionInFlight).toBe(true);
    expect(state.actionQueue).toEqual([{ x: 13, y: 19, retries: 0 }]);

    // 2) While B is in flight, processActionQueue must not touch C at all.
    expect(processActionQueue(state, deps)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);

    // 3) B resolves: server confirms real (non-optimistic) ownership and the
    // in-flight bookkeeping clears, mirroring what resolveFrontierCapture
    // does on FRONTIER_RESULT/TILE_DELTA.
    state.tiles.set("12,18", makeTile({ x: 12, y: 18, ownerId: "me", ownershipState: "FRONTIER" }));
    state.actionInFlight = false;
    state.actionCurrent = undefined;

    // 4) C can now dispatch, from B.
    expect(processActionQueue(state, deps)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(send.mock.calls[1]?.[0] as string)).toMatchObject({ type: "EXPAND", fromX: 12, fromY: 18, toX: 13, toY: 19 });
  });

  it("drops waypoint targets owned by allies instead of dispatching attacks", () => {
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.gold = 999;
    state.allies = ["ally"];
    state.actionQueue = [{ x: 12, y: 18, retries: 0, fromWaypoint: true }];
    state.queuedTargetKeys = new Set<string>(["12,18"]);

    const origin = makeTile({ x: 11, y: 18, ownerId: "me", ownershipState: "FRONTIER" });
    const allyTarget = makeTile({ x: 12, y: 18, ownerId: "ally", ownershipState: "FRONTIER" });
    state.tiles.set("11,18", origin);
    state.tiles.set("12,18", allyTarget);

    const send = vi.fn();
    const started = processActionQueue(state, {
      ws: { OPEN: 1, readyState: 1, send } as unknown as RealtimeSocket,
      authSessionReady: true,
      keyFor: (x, y) => `${x},${y}`,
      isAdjacent: () => true,
      isTileOwnedByAlly: (tile) => Boolean(tile.ownerId && state.allies.includes(tile.ownerId)),
      pickOriginForTarget: () => origin,
      notifyInsufficientGoldForFrontierAction: vi.fn(),
      sendSetMuster: vi.fn(),
      sendAttack: vi.fn(),
      applyOptimisticTileState: vi.fn(),
      pushFeed: vi.fn(),
      renderHud: vi.fn()
    });

    expect(started).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(state.actionQueue).toEqual([]);
    expect(state.queuedTargetKeys.has("12,18")).toBe(false);
  });
});
