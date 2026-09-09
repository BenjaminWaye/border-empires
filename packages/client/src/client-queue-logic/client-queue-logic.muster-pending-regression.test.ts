import { describe, expect, it, vi } from "vitest";

// The muster system is gated by an env-read module-level constant in
// packages/shared/src/config.ts, so it must be set before that module (and
// anything importing it) is first evaluated.
vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { MUSTER_ATTACK_COST } from "@border-empires/shared";
import { MUSTER_FLAG_REQUEST_TIMEOUT_MS } from "../client-constants.js";
import { createInitialState } from "../client-state/client-state.js";
import { processActionQueue, processPendingMusterAttacks } from "./client-queue-logic.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import type { Tile } from "../client-types.js";

// processPendingMusterAttacks-focused regressions, split out of
// client-queue-logic.muster-dock-regression.test.ts (over the file-line cap)
// — that file keeps the processActionQueue dispatch/dock-crossing coverage,
// this one covers the pending-attack parking/promotion/expiry lifecycle.

const makeTile = (overrides: Partial<Tile>): Tile => ({
  x: 0,
  y: 0,
  terrain: "LAND",
  fogged: false,
  ...overrides
});

describe("processPendingMusterAttacks lifecycle", () => {
  it("parks (does not fire) an attack when the closest ready flag is beyond remote-funding range", () => {
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.gold = 999;

    // Flag is 20 tiles from the origin — well beyond the 10-tile
    // remote-funding radius, so it can neither fire directly nor fund
    // an attack launched from the border origin.
    const flag = makeTile({ x: 0, y: 0, ownerId: "me", ownershipState: "SETTLED", muster: { ownerId: "me", amount: MUSTER_ATTACK_COST, mode: "HOLD", updatedAt: Date.now() } });
    const target = makeTile({ x: 21, y: 0, ownerId: "enemy", ownershipState: "SETTLED" });
    const origin = makeTile({ x: 20, y: 0, ownerId: "me", ownershipState: "FRONTIER" });
    state.tiles.set("0,0", flag);
    state.tiles.set("21,0", target);
    state.tiles.set("20,0", origin);

    state.actionQueue = [{ x: 21, y: 0, retries: 0 }];
    state.queuedTargetKeys = new Set<string>(["21,0"]);

    const sendAttack = vi.fn();
    const sendSetMuster = vi.fn();

    processActionQueue(state, {
      ws: { OPEN: 1, readyState: 1, send: vi.fn() } as unknown as RealtimeSocket,
      authSessionReady: true,
      keyFor: (x, y) => `${x},${y}`,
      isAdjacent: (ax, ay, bx, by) => ax === 20 && ay === 0 && bx === 21 && by === 0,
      isTileOwnedByAlly: () => false,
      pickOriginForTarget: () => state.tiles.get("20,0"),
      notifyInsufficientGoldForFrontierAction: vi.fn(),
      applyOptimisticTileState: vi.fn(),
      pushFeed: vi.fn(),
      renderHud: vi.fn(),
      sendSetMuster,
      sendAttack
    });

    expect(sendAttack).not.toHaveBeenCalled();
    expect(state.pendingMusterAttacks).toHaveLength(1);
    expect(state.pendingMusterAttacks[0]).toMatchObject({ targetX: 21, targetY: 0, musterTileKey: "20,0" });
  });

  // Regression for: processPendingMusterAttacks promoted an entry back into
  // actionQueue based only on findClosestMuster (funded + nearest), with no
  // adjacency check. processActionQueue's own adjacency check (added by the
  // fix above) then rejected the promoted entry and re-parked it — bouncing
  // the same attack between the two queues forever, exactly like the
  // original never-fires bug, whenever the only funded flag in range isn't
  // adjacent to the target (e.g. a HOLD flag 2+ tiles away that never
  // marches in on its own).
  it("does not promote a pending attack whose only funded flag is not adjacent to the target", () => {
    const state = createInitialState();
    state.me = "me";

    const flag = makeTile({ x: 0, y: 0, ownerId: "me", ownershipState: "SETTLED", muster: { ownerId: "me", amount: MUSTER_ATTACK_COST, mode: "HOLD", updatedAt: Date.now() } });
    const target = makeTile({ x: 5, y: 0, ownerId: "enemy", ownershipState: "SETTLED" });
    state.tiles.set("0,0", flag);
    state.tiles.set("5,0", target);

    state.pendingMusterAttacks = [{ targetX: 5, targetY: 0, fromX: 4, fromY: 0, musterTileKey: "4,0" }];

    processPendingMusterAttacks(state, {
      keyFor: (x, y) => `${x},${y}`,
      // Nothing is adjacent to the target in this scenario — the flag at
      // (0,0) is 5 tiles away.
      isAdjacent: () => false,
      pushFeed: vi.fn()
    });

    expect(state.actionQueue).toHaveLength(0);
    expect(state.pendingMusterAttacks).toHaveLength(1);
  });

  // Regression for: the promotion gate above required the funding flag to
  // itself border the target, but that's stricter than how the game (and
  // ADVANCE auto-fire) actually funds an attack — the server's
  // resolveMusterSource (apps/simulation/src/runtime-muster-source.ts) funds
  // an ATTACK from any owned, ready flag within 10 tiles of the *firing*
  // tile, regardless of whether the flag itself touches the enemy. A flag
  // several tiles behind the front, funding an attack from an adjacent
  // border tile, was previously never promoted here even though the server
  // would happily fund and accept the resulting ATTACK.
  it("promotes a pending attack whose flag is not adjacent to the target but is within remote-funding range of the origin", () => {
    const state = createInitialState();
    state.me = "me";

    // 4 tiles from the origin (4,0) — within the 10-tile remote-funding
    // radius — but 5 tiles from the target itself, nowhere near adjacent.
    const flag = makeTile({ x: 0, y: 0, ownerId: "me", ownershipState: "SETTLED", muster: { ownerId: "me", amount: MUSTER_ATTACK_COST, mode: "HOLD", updatedAt: Date.now() } });
    const target = makeTile({ x: 5, y: 0, ownerId: "enemy", ownershipState: "SETTLED" });
    state.tiles.set("0,0", flag);
    state.tiles.set("5,0", target);

    state.pendingMusterAttacks = [{ targetX: 5, targetY: 0, fromX: 4, fromY: 0, musterTileKey: "4,0" }];

    processPendingMusterAttacks(state, {
      keyFor: (x, y) => `${x},${y}`,
      // The origin (4,0) genuinely borders the target (5,0); nothing else does.
      isAdjacent: (ax, ay, bx, by) => ax === 4 && ay === 0 && bx === 5 && by === 0,
      pushFeed: vi.fn()
    });

    expect(state.actionQueue).toEqual([{ x: 5, y: 0 }]);
    expect(state.pendingMusterAttacks).toHaveLength(0);
  });

  // Regression for a permanently-stuck "Mustering..." overlay report:
  // dropStuckPendingMusterAttack only expires an entry parked against a
  // brand-new flag (musterRequestedAt set). An entry parked against a flag
  // that already existed at queue time has no such field, so if it never
  // becomes usable there was previously no expiry for it at all — it sat
  // forever with no feedback. processPendingMusterAttacks now has an
  // unconditional 5-minute hard cap as a backstop.
  it("drops a pending attack that has been parked past the hard timeout, regardless of cause", () => {
    const state = createInitialState();
    state.me = "me";

    const target = makeTile({ x: 5, y: 0, ownerId: "enemy", ownershipState: "SETTLED" });
    state.tiles.set("5,0", target);
    state.queuedTargetKeys.add("5,0");
    state.pendingMusterAttacks = [
      { targetX: 5, targetY: 0, fromX: 4, fromY: 0, musterTileKey: "4,0", queuedAt: Date.now() - 5 * 60 * 1000 - 1 }
    ];

    const pushFeed = vi.fn();
    processPendingMusterAttacks(state, {
      keyFor: (x, y) => `${x},${y}`,
      isAdjacent: () => false,
      pushFeed
    });

    expect(state.pendingMusterAttacks).toHaveLength(0);
    expect(state.queuedTargetKeys.has("5,0")).toBe(false);
    expect(pushFeed).toHaveBeenCalledWith(expect.stringContaining("never staged enough manpower"), "combat", "warn");
  });

  // Companion to the WATCH_MUSTER regression above: once nothing is left in
  // pendingMusterAttacks (dropped here via the hard timeout), the server's
  // fast per-second tick for that flag should stop too — it's scoped to
  // "whatever's driving the Mustering overlay right now", not a standing
  // subscription that outlives the overlay.
  it("sends UNWATCH_MUSTER once the last pending muster attack is dropped", () => {
    const state = createInitialState();
    state.me = "me";

    const target = makeTile({ x: 5, y: 0, ownerId: "enemy", ownershipState: "SETTLED" });
    state.tiles.set("5,0", target);
    state.queuedTargetKeys.add("5,0");
    state.pendingMusterAttacks = [
      { targetX: 5, targetY: 0, fromX: 4, fromY: 0, musterTileKey: "4,0", queuedAt: Date.now() - 5 * 60 * 1000 - 1 }
    ];

    const sendGameMessage = vi.fn(() => true);
    processPendingMusterAttacks(state, {
      keyFor: (x, y) => `${x},${y}`,
      isAdjacent: () => false,
      pushFeed: vi.fn(),
      sendGameMessage
    });

    expect(state.pendingMusterAttacks).toHaveLength(0);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "UNWATCH_MUSTER" });
  });

  // Regression for: SET_MUSTER is fire-and-forget — processActionQueue sends
  // it and optimistically parks the attack with no ack tracking. When the
  // server rejects it (e.g. MUSTER_LIMIT: "max 3 muster tiles per player"),
  // nothing ever told the parked entry, so it sat forever waiting on a flag
  // that would never exist — visibly, a "Mustering 0/N" overlay that never
  // filled. processActionQueue must stamp musterRequestedAt only when it
  // actually asks the server for a brand new flag.
  it("stamps musterRequestedAt when parking behind a brand new flag, but not when the origin already has one", () => {
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.gold = 999;

    const target = makeTile({ x: 5, y: 0, ownerId: "enemy", ownershipState: "SETTLED" });
    const origin = makeTile({ x: 4, y: 0, ownerId: "me", ownershipState: "FRONTIER" });
    state.tiles.set("5,0", target);
    state.tiles.set("4,0", origin);
    state.actionQueue = [{ x: 5, y: 0, retries: 0 }];
    state.queuedTargetKeys = new Set<string>(["5,0"]);

    const before = Date.now();
    processActionQueue(state, {
      ws: { OPEN: 1, readyState: 1, send: vi.fn() } as unknown as RealtimeSocket,
      authSessionReady: true,
      keyFor: (x, y) => `${x},${y}`,
      isAdjacent: () => false,
      isTileOwnedByAlly: () => false,
      pickOriginForTarget: () => state.tiles.get("4,0"),
      notifyInsufficientGoldForFrontierAction: vi.fn(),
      applyOptimisticTileState: vi.fn(),
      pushFeed: vi.fn(),
      renderHud: vi.fn(),
      sendSetMuster: vi.fn(),
      sendAttack: vi.fn()
    });

    expect(state.pendingMusterAttacks).toHaveLength(1);
    expect(state.pendingMusterAttacks[0]!.musterRequestedAt).toBeGreaterThanOrEqual(before);
  });

  // Regression: server-side tickWatchedMusterTiles fast-ticks (1s cadence)
  // any flag a player has told it to WATCH_MUSTER, vs. the regular ~30s
  // global cadence for everything else — scoped per-player, no cost to
  // anyone else. Parking an attack behind a flag is exactly when the
  // Mustering overlay starts driving off that flag's amount, so it should
  // start being watched at the same moment.
  it("sends WATCH_MUSTER for the origin flag when parking a new pending muster attack", () => {
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.gold = 999;

    const target = makeTile({ x: 5, y: 0, ownerId: "enemy", ownershipState: "SETTLED" });
    const origin = makeTile({ x: 4, y: 0, ownerId: "me", ownershipState: "FRONTIER" });
    state.tiles.set("5,0", target);
    state.tiles.set("4,0", origin);
    state.actionQueue = [{ x: 5, y: 0, retries: 0 }];
    state.queuedTargetKeys = new Set<string>(["5,0"]);

    const sendGameMessage = vi.fn(() => true);
    processActionQueue(state, {
      ws: { OPEN: 1, readyState: 1, send: vi.fn() } as unknown as RealtimeSocket,
      authSessionReady: true,
      keyFor: (x, y) => `${x},${y}`,
      isAdjacent: () => false,
      isTileOwnedByAlly: () => false,
      pickOriginForTarget: () => state.tiles.get("4,0"),
      notifyInsufficientGoldForFrontierAction: vi.fn(),
      applyOptimisticTileState: vi.fn(),
      pushFeed: vi.fn(),
      renderHud: vi.fn(),
      sendSetMuster: vi.fn(),
      sendAttack: vi.fn(),
      sendGameMessage
    });

    expect(sendGameMessage).toHaveBeenCalledWith({ type: "WATCH_MUSTER", x: 4, y: 0 });
  });

  it("does not stamp musterRequestedAt when the origin tile already has a muster flag", () => {
    const state = createInitialState();
    state.authSessionReady = true;
    state.me = "me";
    state.gold = 999;

    const target = makeTile({ x: 5, y: 0, ownerId: "enemy", ownershipState: "SETTLED" });
    // Origin already has a (not-yet-funded) flag — no new SET_MUSTER is sent.
    const origin = makeTile({
      x: 4,
      y: 0,
      ownerId: "me",
      ownershipState: "FRONTIER",
      muster: { ownerId: "me", amount: 5, mode: "HOLD", updatedAt: Date.now() }
    });
    state.tiles.set("5,0", target);
    state.tiles.set("4,0", origin);
    state.actionQueue = [{ x: 5, y: 0, retries: 0 }];
    state.queuedTargetKeys = new Set<string>(["5,0"]);

    const sendSetMuster = vi.fn();
    processActionQueue(state, {
      ws: { OPEN: 1, readyState: 1, send: vi.fn() } as unknown as RealtimeSocket,
      authSessionReady: true,
      keyFor: (x, y) => `${x},${y}`,
      isAdjacent: () => false,
      isTileOwnedByAlly: () => false,
      pickOriginForTarget: () => state.tiles.get("4,0"),
      notifyInsufficientGoldForFrontierAction: vi.fn(),
      applyOptimisticTileState: vi.fn(),
      pushFeed: vi.fn(),
      renderHud: vi.fn(),
      sendSetMuster,
      sendAttack: vi.fn()
    });

    expect(sendSetMuster).not.toHaveBeenCalled();
    expect(state.pendingMusterAttacks).toHaveLength(1);
    expect(state.pendingMusterAttacks[0]!.musterRequestedAt).toBeUndefined();
  });

  it("drops a pending attack once its requested flag has timed out without ever being created", () => {
    const state = createInitialState();
    state.me = "me";

    const target = makeTile({ x: 5, y: 0, ownerId: "enemy", ownershipState: "SETTLED" });
    state.tiles.set("5,0", target);
    // musterTileKey "4,0" has no tile at all (and definitely no muster) —
    // the server rejected the SET_MUSTER that was supposed to create it.
    state.pendingMusterAttacks = [
      {
        targetX: 5,
        targetY: 0,
        fromX: 4,
        fromY: 0,
        musterTileKey: "4,0",
        musterRequestedAt: Date.now() - MUSTER_FLAG_REQUEST_TIMEOUT_MS - 1
      }
    ];

    const pushFeed = vi.fn();
    processPendingMusterAttacks(state, {
      keyFor: (x, y) => `${x},${y}`,
      isAdjacent: () => false,
      pushFeed
    });

    expect(state.pendingMusterAttacks).toHaveLength(0);
    expect(pushFeed).toHaveBeenCalledWith(expect.stringContaining("(5, 0)"), "combat", "error");
  });

  // Regression for: when the requested flag never showed up because the
  // player was already at their muster-flag cap (server rejects with
  // MUSTER_LIMIT), the entry used to just get dropped/cancelled outright once
  // the timeout passed — even though the player already owns another usable
  // flag elsewhere. It should reroute onto that existing flag instead.
  it("reroutes a pending attack onto an existing flag instead of dropping it, when its requested flag never showed up", () => {
    const state = createInitialState();
    state.me = "me";

    const target = makeTile({ x: 5, y: 0, ownerId: "enemy", ownershipState: "SETTLED" });
    // An existing flag elsewhere on the map, adjacent to the target — this is
    // what the fallback should find and reroute onto, since "4,0" (the
    // requested new flag) never got created. Adjacency to the target matters:
    // findClosestOwnedMusterTile only picks a flag the pending-attack
    // promotion path can actually use once it fills (see the companion test
    // below for a merely-nearby, non-adjacent flag being rejected instead).
    const existingFlag = makeTile({ x: 6, y: 0, ownerId: "me", ownershipState: "SETTLED", muster: { ownerId: "me", amount: 0, mode: "HOLD", updatedAt: Date.now() } });
    state.tiles.set("5,0", target);
    state.tiles.set("6,0", existingFlag);
    state.pendingMusterAttacks = [
      {
        targetX: 5,
        targetY: 0,
        fromX: 4,
        fromY: 0,
        musterTileKey: "4,0",
        musterRequestedAt: Date.now() - MUSTER_FLAG_REQUEST_TIMEOUT_MS - 1
      }
    ];

    const pushFeed = vi.fn();
    const sendGameMessage = vi.fn(() => true);
    processPendingMusterAttacks(state, {
      keyFor: (x, y) => `${x},${y}`,
      isAdjacent: () => false,
      pushFeed,
      sendGameMessage
    });

    expect(state.pendingMusterAttacks).toHaveLength(1);
    expect(state.pendingMusterAttacks[0]).toMatchObject({ targetX: 5, targetY: 0, musterTileKey: "6,0" });
    expect(state.pendingMusterAttacks[0]!.musterRequestedAt).toBeUndefined();
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "WATCH_MUSTER", x: 6, y: 0 });
    expect(pushFeed).toHaveBeenCalledWith(expect.stringContaining("Muster flags full"), "combat", "warn");
  });

  // The reroute fallback also accepts a flag that isn't adjacent to the
  // target itself, as long as it sits within the server's 10-tile
  // remote-funding radius of the attack's origin tile (entry.fromX/fromY) --
  // matching resolveMusterSource and the same relaxed rule the promotion gate
  // above now honors, so a reroute doesn't need to find a target-adjacent
  // flag specifically when a remotely-fundable one already exists.
  it("reroutes onto an existing flag that is within remote-funding range of the origin, even though it's not adjacent to the target", () => {
    const state = createInitialState();
    state.me = "me";

    const target = makeTile({ x: 5, y: 0, ownerId: "enemy", ownershipState: "SETTLED" });
    // 5 tiles from the target (not adjacent) but only 4 tiles from the
    // origin (4,0) -- well within the 10-tile remote-funding radius.
    const remoteFlag = makeTile({ x: 0, y: 0, ownerId: "me", ownershipState: "SETTLED", muster: { ownerId: "me", amount: 0, mode: "HOLD", updatedAt: Date.now() } });
    state.tiles.set("5,0", target);
    state.tiles.set("0,0", remoteFlag);
    state.pendingMusterAttacks = [
      {
        targetX: 5,
        targetY: 0,
        fromX: 4,
        fromY: 0,
        musterTileKey: "4,0",
        musterRequestedAt: Date.now() - MUSTER_FLAG_REQUEST_TIMEOUT_MS - 1
      }
    ];

    const pushFeed = vi.fn();
    const sendGameMessage = vi.fn(() => true);
    processPendingMusterAttacks(state, {
      keyFor: (x, y) => `${x},${y}`,
      isAdjacent: () => false,
      pushFeed,
      sendGameMessage
    });

    expect(state.pendingMusterAttacks).toHaveLength(1);
    expect(state.pendingMusterAttacks[0]).toMatchObject({ targetX: 5, targetY: 0, musterTileKey: "0,0" });
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "WATCH_MUSTER", x: 0, y: 0 });
  });

  // Companion to the reroute tests above: a flag that merely sits somewhere
  // on the map, without being adjacent (or dock-linked) to the target *and*
  // outside the remote-funding radius of the origin, can never fund a
  // promotable attack there (a HOLD flag never marches on its own) --
  // rerouting onto it would just trade one dead end for another. The
  // fallback must reject it and fall through to the normal cancel-with-
  // feedback path instead of silently parking on a flag that can never work.
  it("does not reroute onto an existing flag that isn't adjacent to the target, and drops the attack instead", () => {
    const state = createInitialState();
    state.me = "me";

    const target = makeTile({ x: 5, y: 0, ownerId: "enemy", ownershipState: "SETTLED" });
    // 10 tiles from the target and 11 tiles from the origin (4,0) -- outside
    // both the target-adjacency check and the 10-tile remote-funding radius.
    const farFlag = makeTile({ x: 15, y: 0, ownerId: "me", ownershipState: "SETTLED", muster: { ownerId: "me", amount: 0, mode: "HOLD", updatedAt: Date.now() } });
    state.tiles.set("5,0", target);
    state.tiles.set("15,0", farFlag);
    state.pendingMusterAttacks = [
      {
        targetX: 5,
        targetY: 0,
        fromX: 4,
        fromY: 0,
        musterTileKey: "4,0",
        musterRequestedAt: Date.now() - MUSTER_FLAG_REQUEST_TIMEOUT_MS - 1
      }
    ];

    const pushFeed = vi.fn();
    processPendingMusterAttacks(state, {
      keyFor: (x, y) => `${x},${y}`,
      isAdjacent: () => false,
      pushFeed
    });

    expect(state.pendingMusterAttacks).toHaveLength(0);
    expect(pushFeed).toHaveBeenCalledWith(expect.stringContaining("(5, 0)"), "combat", "error");
  });

  it("keeps a pending attack parked while its requested flag is still within the timeout window", () => {
    const state = createInitialState();
    state.me = "me";

    const target = makeTile({ x: 5, y: 0, ownerId: "enemy", ownershipState: "SETTLED" });
    state.tiles.set("5,0", target);
    state.pendingMusterAttacks = [
      {
        targetX: 5,
        targetY: 0,
        fromX: 4,
        fromY: 0,
        musterTileKey: "4,0",
        musterRequestedAt: Date.now()
      }
    ];

    processPendingMusterAttacks(state, {
      keyFor: (x, y) => `${x},${y}`,
      isAdjacent: () => false,
      pushFeed: vi.fn()
    });

    expect(state.pendingMusterAttacks).toHaveLength(1);
  });
});
