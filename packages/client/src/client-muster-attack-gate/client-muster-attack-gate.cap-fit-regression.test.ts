import { describe, expect, it, vi } from "vitest";
import { musterFlagCap } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { fitPendingMusterFlagCapacity, holdUnfundedPendingMusterAttack } from "./client-muster-attack-gate.js";

// Regression: Launch Attack's slider goes up to the whole manpower pool, but
// a flag only stages up to its own cap, so committing more parked the attack
// on a flag that could never fill -- "Mustering 0/N" that never moved. The
// parked attack now asks the server to expand the flag to fit, once.

const setup = (capLevel?: number) => {
  const state = createInitialState();
  state.me = "me";
  state.manpowerCap = 3_000;
  state.tiles.set("0,0", {
    x: 0, y: 0, terrain: "LAND", ownerId: "me",
    muster: { ownerId: "me", amount: 0, mode: "HOLD", updatedAt: 0, ...(capLevel === undefined ? {} : { capLevel }) }
  } as Tile);
  const entry = { targetX: 1, targetY: 0, fromX: 0, fromY: 0, musterTileKey: "0,0" };
  state.pendingMusterAttacks = [entry];
  return { state, entry };
};

describe("fitPendingMusterFlagCapacity", () => {
  it("asks the server to expand a flag too small for the commitment, exactly once", () => {
    const { state, entry } = setup();
    const required = 1_200;
    expect(musterFlagCap(state.manpowerCap, undefined)).toBeLessThan(required);
    const send = vi.fn(() => true);

    fitPendingMusterFlagCapacity(state, entry, required, send);
    fitPendingMusterFlagCapacity(state, entry, required, send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ type: "UPGRADE_MUSTER_CAP", x: 0, y: 0, fitManpower: required });
  });

  it("asks again when the commitment changes", () => {
    const { state, entry } = setup();
    const send = vi.fn(() => true);
    fitPendingMusterFlagCapacity(state, entry, 1_200, send);
    fitPendingMusterFlagCapacity(state, entry, 1_800, send);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("sends nothing when the flag already holds the commitment", () => {
    const { state, entry } = setup(5);
    const send = vi.fn(() => true);
    fitPendingMusterFlagCapacity(state, entry, 1_200, send);
    expect(send).not.toHaveBeenCalled();
  });

  it("retries next tick when the socket didn't take the message", () => {
    const { state, entry } = setup();
    const send = vi.fn(() => false);
    fitPendingMusterFlagCapacity(state, entry, 1_200, send);
    fitPendingMusterFlagCapacity(state, entry, 1_200, send);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("waits for a just-requested flag to exist before asking", () => {
    const { state, entry } = setup();
    state.tiles.delete("0,0");
    const send = vi.fn(() => true);
    fitPendingMusterFlagCapacity(state, entry, 1_200, send);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("holdUnfundedPendingMusterAttack", () => {
  it("fits the flag and keeps the entry waiting", () => {
    const { state, entry } = setup();
    const send = vi.fn(() => true);
    const drop = holdUnfundedPendingMusterAttack(state, entry, 1_200, { pushFeed: vi.fn(), keyFor: (x, y) => `${x},${y}`, sendGameMessage: send });
    expect(drop).toBe(false);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "UPGRADE_MUSTER_CAP", fitManpower: 1_200 }));
  });
});
