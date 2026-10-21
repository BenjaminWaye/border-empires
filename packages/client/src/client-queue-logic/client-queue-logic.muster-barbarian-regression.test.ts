import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { MUSTER_ATTACK_COST } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import { processActionQueue } from "./client-queue-logic.js";
import { fireDueMusterTransits } from "../client-muster-transit/client-muster-transit.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import type { Tile } from "../client-types.js";

const makeTile = (overrides: Partial<Tile>): Tile => ({
  x: 0,
  y: 0,
  terrain: "LAND",
  fogged: false,
  ...overrides
});

describe("processActionQueue muster gating for Planetary Defense targets", () => {
  // Regression for: attacking a barbarian-1 (Planetary Defense) tile with a
  // ready muster flag on the tile NEXT TO the launch tile. Raids were removed
  // (attacks on barbarians are ordinary muster-funded attacks), but the queue
  // still sent barbarian-target attacks straight to the server, skipping the
  // flag lookup -- the server then rejected them INSUFFICIENT_MUSTER because
  // the launch tile itself held no muster.
  it("routes an attack on a barbarian tile through the muster flag next to the origin", () => {
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.gold = 999;

    const origin = makeTile({ x: 179, y: 247, ownerId: "me", ownershipState: "FRONTIER" });
    const flag = makeTile({
      x: 180,
      y: 247,
      ownerId: "me",
      ownershipState: "SETTLED",
      muster: { ownerId: "me", amount: MUSTER_ATTACK_COST, mode: "HOLD", updatedAt: Date.now() }
    });
    const target = makeTile({ x: 179, y: 246, ownerId: "barbarian-1", ownershipState: "SETTLED" });
    state.tiles.set("179,247", origin);
    state.tiles.set("180,247", flag);
    state.tiles.set("179,246", target);

    state.actionQueue = [{ x: 179, y: 246, retries: 0 }];
    state.queuedTargetKeys = new Set<string>(["179,246"]);

    const send = vi.fn();
    const sendAttack = vi.fn();
    const sendSetMuster = vi.fn();

    processActionQueue(state, {
      ws: { OPEN: 1, readyState: 1, send } as unknown as RealtimeSocket,
      authSessionReady: true,
      keyFor: (x, y) => `${x},${y}`,
      isAdjacent: (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by)) === 1,
      isTileOwnedByAlly: () => false,
      pickOriginForTarget: () => state.tiles.get("179,247"),
      notifyInsufficientGoldForFrontierAction: vi.fn(),
      applyOptimisticTileState: vi.fn(),
      pushFeed: vi.fn(),
      renderHud: vi.fn(),
      sendSetMuster
    });

    // Not fired unfunded straight from the origin -- the flag marches first.
    expect(send).not.toHaveBeenCalled();
    expect(sendSetMuster).not.toHaveBeenCalled();
    expect(state.musterTransitByTile.get("180,247")).toMatchObject({ musterX: 180, musterY: 247, targetX: 179, targetY: 246 });

    for (const transit of state.musterTransitByTile.values()) transit.transitEndsAt = Date.now() - 1;
    state.actionInFlight = false;
    fireDueMusterTransits(state, { keyFor: (x, y) => `${x},${y}`, sendDeferredAttack: sendAttack, requestViewRefresh: () => {} });
    expect(sendAttack).toHaveBeenCalledWith(180, 247, 179, 246, expect.any(String), expect.any(Number));
  });
});
