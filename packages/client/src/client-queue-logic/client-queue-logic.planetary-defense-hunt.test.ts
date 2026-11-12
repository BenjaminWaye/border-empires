import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { MUSTER_ATTACK_COST } from "@border-empires/shared";
import { createInitialState, type ClientState } from "../client-state/client-state.js";
import { processActionQueue } from "./client-queue-logic.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import type { Tile } from "../client-types.js";

// Regression: a manual attack on a Planetary Defense patrol was only sent once
// its company had walked from the flag (a client-side march), and by then the
// patrol had usually walked off -- the attack landed on empty ground and was
// refused "target must be enemy-controlled land". Attacking Planetary Defense
// now turns the nearest holding flag into a hunt, which the server fires (and
// locks the patrol with) at once and keeps re-aiming if the patrol moves.

const makeTile = (overrides: Partial<Tile>): Tile => ({ x: 0, y: 0, terrain: "LAND", fogged: false, ...overrides });

const stateWithFlag = (mode: "HOLD" | "ADVANCE"): ClientState => {
  const state = createInitialState();
  state.authSessionReady = true;
  state.me = "me";
  state.gold = 999;
  state.tiles.set("179,247", makeTile({ x: 179, y: 247, ownerId: "me", ownershipState: "FRONTIER" }));
  state.tiles.set("181,248", makeTile({
    x: 181, y: 248, ownerId: "me", ownershipState: "SETTLED",
    muster: { ownerId: "me", amount: MUSTER_ATTACK_COST, mode, updatedAt: Date.now() }
  }));
  state.tiles.set("180,247", makeTile({ x: 180, y: 247, ownerId: "me", ownershipState: "SETTLED" }));
  state.tiles.set("179,246", makeTile({ x: 179, y: 246, ownerId: "barbarian-1", ownershipState: "FRONTIER" }));
  state.actionQueue = [{ x: 179, y: 246, retries: 0 }];
  state.queuedTargetKeys = new Set<string>(["179,246"]);
  return state;
};

const run = (state: ClientState, sendGameMessage: (payload: unknown) => boolean) => {
  const send = vi.fn();
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
    sendSetMuster: vi.fn(),
    sendGameMessage
  });
  return send;
};

describe("attacking Planetary Defense starts a hunt", () => {
  it("turns the nearest holding flag into a hunt aimed at the clicked tile instead of arming a march", () => {
    const state = stateWithFlag("HOLD");
    const sendGameMessage = vi.fn(() => true);
    const send = run(state, sendGameMessage);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SET_MUSTER", x: 181, y: 248, mode: "ADVANCE", hunt: true, targetX: 179, targetY: 246 });
    expect(send).not.toHaveBeenCalled();
    expect(state.musterTransitByCommand.size).toBe(0);
    expect(state.actionInFlight).toBe(false);
    expect(state.queuedTargetKeys.has("179,246")).toBe(false);
  });

  // Review regression: the hunt used to go to the nearest holding flag even
  // when it was empty, dropping an attack the funded flag could have made.
  it("hunts with the flag that can fund the attack, not a nearer empty one", () => {
    const state = stateWithFlag("HOLD");
    state.tiles.set("180,247", makeTile({
      x: 180, y: 247, ownerId: "me", ownershipState: "SETTLED",
      muster: { ownerId: "me", amount: 0, mode: "HOLD", updatedAt: Date.now() }
    }));
    const sendGameMessage = vi.fn(() => true);
    run(state, sendGameMessage);
    expect(sendGameMessage).toHaveBeenCalledWith(expect.objectContaining({ x: 181, y: 248, hunt: true }));
    expect(sendGameMessage).not.toHaveBeenCalledWith(expect.objectContaining({ x: 180, y: 247 }));
  });

  // Review regression (PR #2716): a flag in straight-line range but cut off
  // from the target over land was turned into a hunt the server could never
  // fire, swallowing the attack. It now attacks the ordinary way.
  it("attacks the ordinary way when the flag can't reach the target over its own land", () => {
    const state = stateWithFlag("HOLD");
    state.tiles.set("180,247", makeTile({ x: 180, y: 247, terrain: "SEA" }));
    const sendGameMessage = vi.fn(() => true);
    run(state, sendGameMessage);
    expect(sendGameMessage).not.toHaveBeenCalledWith(expect.objectContaining({ hunt: true }));
    expect(state.musterTransitByCommand.size).toBe(1);
  });

  it("leaves a flag that is already advancing on everything alone and attacks the ordinary way", () => {
    const state = stateWithFlag("ADVANCE");
    const sendGameMessage = vi.fn(() => true);
    run(state, sendGameMessage);
    expect(sendGameMessage).not.toHaveBeenCalledWith(expect.objectContaining({ hunt: true }));
    expect(state.musterTransitByCommand.size).toBe(1);
  });
});
