import { describe, expect, it, vi } from "vitest";
import { MUSTER_MARCH_MAX_DISTANCE_TILES, WORLD_WIDTH, musterMarchDistanceTiles, musterMarchTooFarAdvice } from "@border-empires/shared";
import { handleArrowGestureConfirm } from "./client-arrow-gesture-confirm.js";
import { handleMusterMarchTargetClick } from "./client-muster-march-targeting.js";

const targetingState = (originX: number, originY: number) => ({ musterMarchTargeting: { active: true, originX, originY } });

describe("march cap advice", () => {
  it("measures the shorter way around the wrapping world", () => {
    expect(musterMarchDistanceTiles(2, 10, WORLD_WIDTH - 3, 10)).toBe(5);
    expect(musterMarchDistanceTiles(10, 10, 20, 25)).toBe(15);
    expect(musterMarchTooFarAdvice(MUSTER_MARCH_MAX_DISTANCE_TILES)).toBeUndefined();
    expect(musterMarchTooFarAdvice(MUSTER_MARCH_MAX_DISTANCE_TILES + 1)).toContain("Raise a muster flag closer");
  });

  it("March To... sends nothing and gives advice (info, not an error) when the target is too far", () => {
    const pushFeed = vi.fn();
    const sendGameMessage = vi.fn(() => true);
    const state = targetingState(10, 10);
    handleMusterMarchTargetClick(state, 10 + MUSTER_MARCH_MAX_DISTANCE_TILES + 1, 10, "visible", { pushFeed, sendGameMessage });
    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(pushFeed).toHaveBeenCalledWith(expect.stringContaining("Raise a muster flag closer"), "combat", "info");
    expect(state.musterMarchTargeting.active).toBe(false);
  });

  it("March To... still sends a march at the cap", () => {
    const pushFeed = vi.fn();
    const sendGameMessage = vi.fn(() => true);
    handleMusterMarchTargetClick(targetingState(10, 10), 10 + MUSTER_MARCH_MAX_DISTANCE_TILES, 10, "visible", { pushFeed, sendGameMessage });
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SET_MUSTER", x: 10, y: 10, mode: "MARCH", targetX: 25, targetY: 10 });
  });

  it("the arrow gesture gives the same advice and opens no confirm sheet", () => {
    const pushFeed = vi.fn();
    const state = { tiles: new Map(), manpowerCap: 100, pendingArrowGestureConfirm: undefined } as never;
    handleArrowGestureConfirm(state, { x: 10, y: 10 }, { x: 40, y: 10 }, { pushFeed, sendGameMessage: vi.fn(() => true), renderHud: vi.fn(), keyFor: (x, y) => `${x},${y}` });
    expect(pushFeed).toHaveBeenCalledTimes(1);
    expect(pushFeed).toHaveBeenCalledWith(expect.stringContaining("Raise a muster flag closer"), "combat", "info");
    expect((state as { pendingArrowGestureConfirm: unknown }).pendingArrowGestureConfirm).toBeUndefined();
  });
});
