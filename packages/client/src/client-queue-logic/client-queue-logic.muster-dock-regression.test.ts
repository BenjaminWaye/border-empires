import { describe, expect, it, vi } from "vitest";

// The muster system is gated by an env-read module-level constant in
// packages/shared/src/config.ts, so it must be set before that module (and
// anything importing it) is first evaluated.
vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { MUSTER_ATTACK_COST } from "@border-empires/shared";
import { MUSTER_FLAG_REQUEST_TIMEOUT_MS } from "../client-constants.js";
import { createInitialState, type ClientState } from "../client-state/client-state.js";
import { processActionQueue, processPendingMusterAttacks } from "./client-queue-logic.js";
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

// A muster-funded attack no longer fires the instant processActionQueue runs
// — armMusterTransit (client-muster-transit.ts) defers the real send until
// the flag's local march timer elapses (real travel time; see
// client-queue-logic.ts's armMusterTransit call sites). These regression
// tests only care that the *right* attack eventually fires from the *right*
// tile, not the exact march duration, so this helper fast-forwards every
// armed transit straight to "due" and drains it through fireDueMusterTransits
// — the same function client-runtime-loop.ts already calls every tick.
const fastForwardAndFireDueMusterTransits = (
  state: Pick<ClientState, "musterTransitByTile" | "deferredAttackByTile" | "actionInFlight" | "actionAcceptedAck" | "combatStartAck" | "actionAcceptTimeoutHandledAt" | "actionStartedAt" | "actionCurrent" | "actionTargetKey">,
  sendAttack: (fromX: number, fromY: number, toX: number, toY: number, commandId: string, clientSeq: number) => void
): void => {
  for (const transit of state.musterTransitByTile.values()) transit.transitEndsAt = Date.now() - 1;
  let guard = 0;
  while (state.deferredAttackByTile.size > 0 && guard++ < 10) {
    state.actionInFlight = false; // each real send would normally get its own ack before the next fires
    fireDueMusterTransits(state, {
      keyFor: (x, y) => `${x},${y}`,
      sendDeferredAttack: sendAttack,
      requestViewRefresh: () => {}
    });
  }
};

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
    // Not sent immediately — the flag marches first (real travel time).
    expect(sendAttack).not.toHaveBeenCalled();
    expect(state.musterTransitByTile.get("5,5")).toMatchObject({ musterX: 5, musterY: 5, targetX: 300, targetY: 300 });
    fastForwardAndFireDueMusterTransits(state, sendAttack);
    expect(sendAttack).toHaveBeenCalledWith(5, 5, 300, 300, expect.any(String), expect.any(Number));
  });

  // Regression for: a dock-crossing attack whose funded flag sits near the
  // dock but not literally on it. findClosestMuster's dock-crossing distance
  // shortcut only applies when the flag tile itself is the paired dock, so
  // this flag scores a huge raw distance to the far-away target and fails
  // that check — but hasFundedMusterWithinRange measures from the origin
  // dock instead of the target, so a flag a few tiles inland from the dock
  // (well within remote-funding range of it) should still fund the attack,
  // fired from the dock, exactly like resolveMusterSource allows server-side.
  it("dispatches a dock-linked attack funded by a flag near the dock, not on it", () => {
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.gold = 999;

    const originDock = makeTile({ x: 5, y: 5, dockId: "dockP", ownerId: "me", ownershipState: "SETTLED" });
    const enemyDock = makeTile({ x: 300, y: 300, dockId: "dockE", ownerId: "enemy", ownershipState: "SETTLED" });
    // Flag is 3 tiles from the dock (well within the 10-tile remote-funding
    // radius of the origin), not on the dock tile itself.
    const nearbyFlag = makeTile({
      x: 8,
      y: 5,
      ownerId: "me",
      ownershipState: "SETTLED",
      muster: { ownerId: "me", amount: MUSTER_ATTACK_COST, mode: "HOLD", updatedAt: Date.now() }
    });
    state.tiles.set("5,5", originDock);
    state.tiles.set("8,5", nearbyFlag);
    state.tiles.set("300,300", enemyDock);
    state.dockPairs = [{ ax: 5, ay: 5, bx: 300, by: 300 }];

    state.actionQueue = [{ x: 300, y: 300, retries: 0 }];
    state.queuedTargetKeys = new Set<string>(["300,300"]);

    const sendSetMuster = vi.fn();
    const sendAttack = vi.fn();

    processActionQueue(state, {
      ws: { OPEN: 1, readyState: 1, send: vi.fn() } as unknown as RealtimeSocket,
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

    // Fires from the dock (5,5) — funded remotely from the flag at (8,5) —
    // but only once that flag's march (armed by armMusterTransit) completes.
    expect(sendAttack).not.toHaveBeenCalled();
    expect(state.musterTransitByTile.get("8,5")).toMatchObject({ musterX: 8, musterY: 5, targetX: 300, targetY: 300 });
    fastForwardAndFireDueMusterTransits(state, sendAttack);
    expect(sendAttack).toHaveBeenCalledWith(5, 5, 300, 300, expect.any(String), expect.any(Number));
    expect(sendSetMuster).not.toHaveBeenCalled();
    expect(state.pendingMusterAttacks).toHaveLength(0);
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

    // Both attacks arm independently (neither blocks the other), then both
    // fire, each from its own flag, once their marches complete.
    expect(state.pendingMusterAttacks).toHaveLength(0);
    expect(state.musterTransitByTile.size).toBe(2);
    fastForwardAndFireDueMusterTransits(state, sendAttack);
    expect(sendAttack).toHaveBeenCalledWith(0, 0, 1, 0, expect.any(String), expect.any(Number));
    expect(sendAttack).toHaveBeenCalledWith(50, 50, 51, 50, expect.any(String), expect.any(Number));
  });

  // Regression for: a ready (fully mustered) flag that is "in range" per
  // MUSTER_AUTO_FLAG_THRESHOLD_TILES but not actually adjacent (or
  // dock-linked) to the target must not fire directly from the flag's own
  // tile — the server rejects a non-adjacent ATTACK with NOT_ADJACENT. But
  // resolveMusterSource (apps/simulation/src/runtime-muster-source.ts) will
  // auto-fund an ATTACK from any owned flag within 10 tiles of the firing
  // tile — the same thing ADVANCE already relies on — so the attack should
  // fire from the normal border origin, funded remotely by this flag,
  // instead of parking behind (and potentially auto-creating) a new one.
  it("fires from the border origin, remotely funded, when the closest ready flag isn't itself adjacent but is within funding range", () => {
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.gold = 999;

    // Flag is 4 tiles from the origin — not adjacent to the target itself,
    // but well within resolveMusterSource's 10-tile remote-funding radius.
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

    // Fires from the border origin (4,0), not the flag's own tile (0,0) —
    // the server resolves funding from (0,0) remotely — once that flag's
    // march to the front (armed by armMusterTransit) completes.
    expect(sendAttack).not.toHaveBeenCalled();
    expect(state.musterTransitByTile.get("0,0")).toMatchObject({ musterX: 0, musterY: 0, targetX: 5, targetY: 0 });
    fastForwardAndFireDueMusterTransits(state, sendAttack);
    expect(sendAttack).toHaveBeenCalledWith(4, 0, 5, 0, expect.any(String), expect.any(Number));
    expect(sendSetMuster).not.toHaveBeenCalled();
    expect(state.pendingMusterAttacks).toHaveLength(0);
  });

});
