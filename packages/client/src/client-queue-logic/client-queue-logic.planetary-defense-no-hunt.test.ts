import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { MUSTER_ATTACK_COST } from "@border-empires/shared";
import { createInitialState, type ClientState } from "../client-state/client-state.js";
import { processActionQueue } from "./client-queue-logic.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import type { Tile } from "../client-types.js";

// Regression (2026-11-26 playtest): attacking Planetary Defense turned the
// nearest holding flag into a "hunt". The server dropped hunts with the
// Planetary Defense camps (it ignores SET_MUSTER.hunt), so the flag became a
// plain ADVANCE that attacked a human in range -- and the attack withdrew the
// player's pending truce offer to them. A manual attack on Planetary Defense
// now goes the ordinary way and never re-orders a flag.

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

describe("attacking Planetary Defense", () => {
  it("arms an ordinary march from the funding flag and never re-orders the flag", () => {
    const state = stateWithFlag("HOLD");
    const sendGameMessage = vi.fn(() => true);
    run(state, sendGameMessage);
    expect(sendGameMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "SET_MUSTER" }));
    expect(state.musterTransitByCommand.size).toBe(1);
  });

  it("leaves a flag that is already advancing alone and attacks the ordinary way", () => {
    const state = stateWithFlag("ADVANCE");
    const sendGameMessage = vi.fn(() => true);
    run(state, sendGameMessage);
    expect(sendGameMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "SET_MUSTER" }));
    expect(state.musterTransitByCommand.size).toBe(1);
  });
});
