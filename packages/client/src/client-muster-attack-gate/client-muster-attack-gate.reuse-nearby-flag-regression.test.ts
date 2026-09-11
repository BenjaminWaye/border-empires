import { describe, expect, it, vi } from "vitest";

// The muster system is gated by an env-read module-level constant in
// packages/shared/src/config.ts, so it must be set before that module (and
// anything importing it) is first evaluated.
vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { MUSTER_ATTACK_COST } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import { processActionQueue } from "../client-queue-logic/client-queue-logic.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import type { Tile } from "../client-types.js";

// Regression coverage for parkOrReuseMusterFlagForAttack: a launch-attack
// with no fully-funded flag nearby should prefer reusing any owned,
// unreserved flag already within the remote-funding radius (even if it
// isn't staffed up yet) over auto-creating a brand new one -- and should
// detect a muster-flag-cap rejection up front instead of firing a doomed
// SET_MUSTER and waiting 5s to discover it was rejected.

const makeTile = (overrides: Partial<Tile>): Tile => ({
  x: 0,
  y: 0,
  terrain: "LAND",
  fogged: false,
  ...overrides
});

const baseDeps = (state: ReturnType<typeof createInitialState>, overrides: Partial<Parameters<typeof processActionQueue>[1]> = {}) => ({
  ws: { OPEN: 1, readyState: 1, send: vi.fn() } as unknown as RealtimeSocket,
  authSessionReady: true,
  keyFor: (x: number, y: number) => `${x},${y}`,
  isAdjacent: (_ax: number, _ay: number, _bx: number, _by: number) => false,
  isTileOwnedByAlly: () => false,
  pickOriginForTarget: () => state.tiles.get("20,0"),
  notifyInsufficientGoldForFrontierAction: vi.fn(),
  applyOptimisticTileState: vi.fn(),
  pushFeed: vi.fn(),
  renderHud: vi.fn(),
  sendSetMuster: vi.fn(),
  sendAttack: vi.fn(),
  ...overrides
});

describe("parkOrReuseMusterFlagForAttack (via processActionQueue)", () => {
  it("reroutes onto a nearby owned flag that isn't fully funded yet instead of auto-creating a new one", () => {
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.gold = 999;

    // Flag is 3 tiles from the origin (well within the 10-tile
    // remote-funding radius) but under-staffed for this target's cost, so
    // findFundedMusterWithinRange rejects it -- the fix is to still reuse
    // it via findClosestOwnedMusterTile rather than staging a new flag.
    const flag = makeTile({ x: 17, y: 0, ownerId: "me", ownershipState: "SETTLED", muster: { ownerId: "me", amount: 1, mode: "HOLD", updatedAt: Date.now() } });
    const target = makeTile({ x: 21, y: 0, ownerId: "enemy", ownershipState: "SETTLED" });
    const origin = makeTile({ x: 20, y: 0, ownerId: "me", ownershipState: "FRONTIER" });
    state.tiles.set("17,0", flag);
    state.tiles.set("21,0", target);
    state.tiles.set("20,0", origin);

    state.actionQueue = [{ x: 21, y: 0, retries: 0 }];
    state.queuedTargetKeys = new Set<string>(["21,0"]);

    const sendSetMuster = vi.fn();
    processActionQueue(state, baseDeps(state, { sendSetMuster }));

    expect(sendSetMuster).not.toHaveBeenCalled();
    expect(state.pendingMusterAttacks).toHaveLength(1);
    expect(state.pendingMusterAttacks[0]).toMatchObject({ targetX: 21, targetY: 0, musterTileKey: "17,0" });
    expect(state.pendingMusterAttacks[0]?.musterRequestedAt).toBeUndefined();
  });

  it("cancels the attack up front (no SET_MUSTER) when at the muster-flag cap with nothing nearby to reuse", () => {
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.gold = 999;
    state.musterFlagLimit = 1;

    // The player's one allowed flag is already staged far away (outside the
    // remote-funding radius and not touching the target), so it can't be
    // reused -- and creating a second one would just be rejected server-side.
    const existingFlag = makeTile({ x: 0, y: 0, ownerId: "me", ownershipState: "SETTLED", muster: { ownerId: "me", amount: MUSTER_ATTACK_COST, mode: "HOLD", updatedAt: Date.now() } });
    const target = makeTile({ x: 21, y: 0, ownerId: "enemy", ownershipState: "SETTLED" });
    const origin = makeTile({ x: 20, y: 0, ownerId: "me", ownershipState: "FRONTIER" });
    state.tiles.set("0,0", existingFlag);
    state.tiles.set("21,0", target);
    state.tiles.set("20,0", origin);

    state.actionQueue = [{ x: 21, y: 0, retries: 0 }];
    state.queuedTargetKeys = new Set<string>(["21,0"]);

    const sendSetMuster = vi.fn();
    const pushFeed = vi.fn();
    processActionQueue(state, baseDeps(state, { sendSetMuster, pushFeed }));

    expect(sendSetMuster).not.toHaveBeenCalled();
    expect(state.pendingMusterAttacks).toHaveLength(0);
    expect(pushFeed).toHaveBeenCalledWith(expect.stringContaining("Muster flags full"), "combat", "error");
  });
});
