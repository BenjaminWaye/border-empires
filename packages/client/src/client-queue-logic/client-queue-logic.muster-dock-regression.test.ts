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
  it("dispatches (does not re-park) an attack on a dock-linked target once the origin dock's muster is ready", () => {
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

    const started = processActionQueue(state, {
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

    // Must not re-park behind a new/duplicate muster flag — the whole point
    // of the bug is that this kept happening forever instead of dispatching.
    expect(state.pendingMusterAttacks).toEqual([]);
    expect(sendSetMuster).not.toHaveBeenCalled();

    // Should have armed the (short) transit hop toward an actual send rather
    // than bailing out with started === false.
    expect(started).toBe(true);
    expect(state.musterTransit).toBeDefined();
    expect(state.musterTransit?.musterX).toBe(5);
    expect(state.musterTransit?.musterY).toBe(5);
    expect(state.deferredAttack).toMatchObject({ fromX: 5, fromY: 5, toX: 300, toY: 300 });
  });
});
