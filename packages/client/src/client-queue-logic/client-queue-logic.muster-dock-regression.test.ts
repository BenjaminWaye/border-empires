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
import { processActionQueue, processPendingMusterAttacks, queueSpecificTargets } from "./client-queue-logic.js";
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

    // Fires from the dock (5,5) — funded remotely from the flag at (8,5).
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

    // Both attacks should dispatch immediately, each from its own flag.
    expect(state.pendingMusterAttacks).toHaveLength(0);
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
    // the server resolves funding from (0,0) remotely.
    expect(sendAttack).toHaveBeenCalledWith(4, 0, 5, 0, expect.any(String), expect.any(Number));
    expect(sendSetMuster).not.toHaveBeenCalled();
    expect(state.pendingMusterAttacks).toHaveLength(0);
  });

  // Companion to the above: once the only funded flag is far enough away
  // that it's outside resolveMusterSource's remote-funding radius too,
  // there's genuinely nothing to fund the attack from — it must still park
  // (and auto-create a new flag) exactly as before.
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

  // Regression for: manually launching an attack on a dock target that is
  // merely adjacent to (not exactly) a paired dock — e.g. a second dock on
  // a multi-dock island, reached via bulk/region selection which bypasses
  // the per-tile Launch Attack button's own (already-strict) reachability
  // gate — used to queue successfully (queueSpecificTargets's origin check
  // defaulted to the permissive allowAdjacentToDock: true) and then get
  // silently dropped one tick later by processActionQueue's real dispatch
  // origin check (allowAdjacentToDock: false), with zero feedback: no
  // attack, no error, and no Mustering overlay. queueSpecificTargets must
  // use the same strict check so a target it can't actually dispatch is
  // never queued in the first place.
  it("does not queue an attack on a dock target only adjacent to (not exactly) a linked dock", () => {
    const state = createInitialState();
    state.me = "me";
    const enemyDockTarget = makeTile({ x: 10, y: 10, dockId: "dockB", ownerId: "enemy", ownershipState: "SETTLED" });
    state.tiles.set("10,10", enemyDockTarget);

    // pickOriginForTarget mirrors client-origin-selection's real contract:
    // an origin resolves only when allowAdjacentToDock is left permissive
    // (true/omitted) — never when explicitly strict (false), exactly like a
    // target adjacent to, but not equal to, the actual paired dock.
    const pickOriginForTarget = (_x: number, _y: number, allowAdjacentToDock?: boolean): Tile | undefined =>
      allowAdjacentToDock === false ? undefined : makeTile({ x: 5, y: 5, ownerId: "me", ownershipState: "SETTLED" });

    const result = queueSpecificTargets(state, ["10,10"], {
      parseKey: (key) => { const [x, y] = key.split(",").map(Number); return { x: x!, y: y! }; },
      keyFor: (x, y) => `${x},${y}`,
      isTileOwnedByAlly: () => false,
      pickOriginForTarget,
      enqueueTarget: vi.fn(() => true),
      buildFrontierQueue: () => ({ queued: 0, skipped: 0, queuedKeys: [] })
    });

    expect(result.queued).toBe(0);
    expect(result.skipped).toBe(1);
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
