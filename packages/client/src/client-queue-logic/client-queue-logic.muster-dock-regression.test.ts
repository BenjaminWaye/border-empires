import { describe, expect, it, vi } from "vitest";

// The muster system is gated by an env-read module-level constant in
// packages/shared/src/config.ts, so it must be set before that module (and
// anything importing it) is first evaluated.
vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { MUSTER_ATTACK_COST } from "@border-empires/shared";
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

describe("processActionQueue muster gating for dock-connected attacks", () => {
  // Regression for: player has a settled dock, the sea-linked enemy dock is
  // settled, Launch Attack stages a muster flag on the player's dock, the
  // flag fills to MUSTER_ATTACK_COST — and the attack must actually fire
  // instead of being parked again by a raw-distance range check that a sea
  // crossing can never satisfy.
  it("dispatches (does not park) an attack on a dock-linked target once the origin dock's muster is ready", () => {
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.gold = 999;

    // Player's dock and the enemy's dock are far apart in raw grid terms —
    // only reachable via the sea route between them.
    const originDock = makeTile({ x: 5, y: 5, dockId: "dockP", ownerId: "me", ownershipState: "SETTLED" });
    const enemyDock = makeTile({ x: 300, y: 300, dockId: "dockE", ownerId: "enemy", ownershipState: "SETTLED" });
    state.tiles.set("5,5", originDock);
    state.tiles.set("300,300", enemyDock);
    state.dockPairs = [{ ax: 5, ay: 5, bx: 300, by: 300 }];

    // Muster flag on the origin dock has already filled to the attack cost.
    state.tiles.set("5,5", {
      ...originDock,
      muster: { ownerId: "me", amount: MUSTER_ATTACK_COST, mode: "HOLD", updatedAt: Date.now() }
    });

    state.actionQueue = [{ x: 300, y: 300, retries: 0 }];
    state.queuedTargetKeys = new Set<string>(["300,300"]);

    const send = vi.fn();
    const sendSetMuster = vi.fn();
    const sendAttack = vi.fn();

    processActionQueue(state, {
      ws: { OPEN: 1, readyState: 1, send } as unknown as RealtimeSocket,
      authSessionReady: true,
      keyFor: (x, y) => `${x},${y}`,
      isAdjacent: () => false,
      isTileOwnedByAlly: () => false,
      pickOriginForTarget: () => state.tiles.get("5,5"),
      notifyInsufficientGoldForFrontierAction: vi.fn(),
      applyOptimisticTileState: vi.fn(),
      pushFeed: vi.fn(),
      renderHud: vi.fn(),
      sendSetMuster,
      sendAttack
    });

    // Must not park behind a new/duplicate muster flag — the whole point of
    // the bug was that this kept happening forever instead of dispatching.
    expect(state.pendingMusterAttacks).toHaveLength(0);
    expect(sendSetMuster).not.toHaveBeenCalled();
    expect(sendAttack).toHaveBeenCalledWith(5, 5, 300, 300, expect.any(String), expect.any(Number));
  });

  // Regression for: Group E — independent muster flag cooldowns. Two flags
  // funding two different attacks must both dispatch in the same queue pass,
  // each from its own flag tile.
  it("dispatches two different flags' attacks independently in a single queue pass", () => {
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.gold = 999;

    const flagA = makeTile({ x: 0, y: 0, ownerId: "me", ownershipState: "SETTLED", muster: { ownerId: "me", amount: MUSTER_ATTACK_COST, mode: "HOLD", updatedAt: Date.now() } });
    const flagB = makeTile({ x: 50, y: 50, ownerId: "me", ownershipState: "SETTLED", muster: { ownerId: "me", amount: MUSTER_ATTACK_COST, mode: "HOLD", updatedAt: Date.now() } });
    const targetA = makeTile({ x: 1, y: 0, ownerId: "enemy", ownershipState: "SETTLED" });
    const targetB = makeTile({ x: 51, y: 50, ownerId: "enemy", ownershipState: "SETTLED" });
    state.tiles.set("0,0", flagA);
    state.tiles.set("50,50", flagB);
    state.tiles.set("1,0", targetA);
    state.tiles.set("51,50", targetB);

    state.actionQueue = [
      { x: 1, y: 0, retries: 0 },
      { x: 51, y: 50, retries: 0 }
    ];
    state.queuedTargetKeys = new Set<string>(["1,0", "51,50"]);

    const pickOriginForTarget = (x: number, y: number): Tile | undefined =>
      x === 1 && y === 0 ? state.tiles.get("0,0") : x === 51 && y === 50 ? state.tiles.get("50,50") : undefined;

    const sendAttack = vi.fn();

    processActionQueue(state, {
      ws: { OPEN: 1, readyState: 1, send: vi.fn() } as unknown as RealtimeSocket,
      authSessionReady: true,
      keyFor: (x, y) => `${x},${y}`,
      isAdjacent: () => true,
      isTileOwnedByAlly: () => false,
      pickOriginForTarget,
      notifyInsufficientGoldForFrontierAction: vi.fn(),
      applyOptimisticTileState: vi.fn(),
      pushFeed: vi.fn(),
      renderHud: vi.fn(),
      sendSetMuster: vi.fn(),
      sendAttack
    });

    // Both attacks should dispatch immediately, each from its own flag.
    expect(state.pendingMusterAttacks).toHaveLength(0);
    expect(sendAttack).toHaveBeenCalledWith(0, 0, 1, 0, expect.any(String), expect.any(Number));
    expect(sendAttack).toHaveBeenCalledWith(50, 50, 51, 50, expect.any(String), expect.any(Number));
  });

  // Regression for: a ready (fully mustered) flag that is "in range" per
  // MUSTER_AUTO_FLAG_THRESHOLD_TILES but not actually adjacent (or
  // dock-linked) to the target must not fire directly — the server rejects
  // a non-adjacent ATTACK with NOT_ADJACENT. It should park instead, same as
  // the no-flag-found case, so the flag can march (ADVANCE) into range.
  it("parks (does not fire) an attack when the closest ready flag is in range but not adjacent to the target", () => {
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.gold = 999;

    // Flag is 5 tiles from the target — well within the 20-tile staging
    // range, but not adjacent.
    const flag = makeTile({ x: 0, y: 0, ownerId: "me", ownershipState: "SETTLED", muster: { ownerId: "me", amount: MUSTER_ATTACK_COST, mode: "HOLD", updatedAt: Date.now() } });
    const target = makeTile({ x: 5, y: 0, ownerId: "enemy", ownershipState: "SETTLED" });
    const origin = makeTile({ x: 4, y: 0, ownerId: "me", ownershipState: "FRONTIER" });
    state.tiles.set("0,0", flag);
    state.tiles.set("5,0", target);
    state.tiles.set("4,0", origin);

    state.actionQueue = [{ x: 5, y: 0, retries: 0 }];
    state.queuedTargetKeys = new Set<string>(["5,0"]);

    const sendAttack = vi.fn();
    const sendSetMuster = vi.fn();

    processActionQueue(state, {
      ws: { OPEN: 1, readyState: 1, send: vi.fn() } as unknown as RealtimeSocket,
      authSessionReady: true,
      keyFor: (x, y) => `${x},${y}`,
      // Only the origin tile adjacent to the target is truly adjacent —
      // the muster flag at (0,0) is not.
      isAdjacent: (ax, ay, bx, by) => ax === 4 && ay === 0 && bx === 5 && by === 0,
      isTileOwnedByAlly: () => false,
      pickOriginForTarget: () => state.tiles.get("4,0"),
      notifyInsufficientGoldForFrontierAction: vi.fn(),
      applyOptimisticTileState: vi.fn(),
      pushFeed: vi.fn(),
      renderHud: vi.fn(),
      sendSetMuster,
      sendAttack
    });

    expect(sendAttack).not.toHaveBeenCalled();
    expect(state.pendingMusterAttacks).toHaveLength(1);
    expect(state.pendingMusterAttacks[0]).toMatchObject({ targetX: 5, targetY: 0, musterTileKey: "4,0" });
  });
});
