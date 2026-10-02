import { describe, expect, it, vi } from "vitest";
import { MUSTER_MARCH_MAX_DISTANCE_TILES, WORLD_WIDTH, musterMarchDistanceTiles, musterMarchTooFarAdvice } from "@border-empires/shared";
import { handleArrowGestureConfirm } from "./client-arrow-gesture-confirm.js";
import { handleMusterMarchTargetClick } from "./client-muster-march-targeting.js";

const targetingState = (originX: number, originY: number) => ({ musterMarchTargeting: { active: true, originX, originY } });

const confirmState = () => ({ tiles: new Map(), manpowerCap: 100, pendingArrowGestureConfirm: undefined, arrowGesture: undefined, me: "me", winChancePaint: undefined }) as never;

describe("march cap advice", () => {
  it("measures the shorter way around the wrapping world", () => {
    expect(musterMarchDistanceTiles(2, 10, WORLD_WIDTH - 3, 10)).toBe(5);
    expect(musterMarchDistanceTiles(10, 10, 20, 25)).toBe(15);
    expect(musterMarchTooFarAdvice(MUSTER_MARCH_MAX_DISTANCE_TILES)).toBeUndefined();
    expect(musterMarchTooFarAdvice(MUSTER_MARCH_MAX_DISTANCE_TILES + 1)).toContain("Raise a muster flag closer");
  });

  // The too-far cap check now lives solely in handleArrowGestureConfirm
  // (see the test below) -- handleMusterMarchTargetClick just decides
  // armed vs. cancelled and no longer sends anything itself.
  it("a valid target click returns armed with the origin/target coordinates", () => {
    const pushFeed = vi.fn();
    const result = handleMusterMarchTargetClick(targetingState(10, 10), 25, 10, "visible", { pushFeed });
    expect(result).toEqual({ type: "armed", originX: 10, originY: 10, targetX: 25, targetY: 10 });
    expect(pushFeed).not.toHaveBeenCalled();
  });

  it("clicking the flag's own tile cancels instead of arming", () => {
    const pushFeed = vi.fn();
    const state = targetingState(10, 10);
    const result = handleMusterMarchTargetClick(state, 10, 10, "visible", { pushFeed });
    expect(result).toEqual({ type: "cancelled" });
    expect(state.musterMarchTargeting.active).toBe(false);
    expect(pushFeed).toHaveBeenCalledWith("March target cancelled.", "combat", "info");
  });

  it("the arrow-gesture confirm sends nothing and gives advice (info, not an error) when the target is too far", () => {
    const pushFeed = vi.fn();
    const sendGameMessage = vi.fn(() => true);
    handleArrowGestureConfirm(confirmState(), { x: 10, y: 10 }, { x: 10 + MUSTER_MARCH_MAX_DISTANCE_TILES + 1, y: 10 }, {
      pushFeed,
      sendGameMessage,
      renderHud: vi.fn(),
      keyFor: (x, y) => `${x},${y}`
    });
    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(pushFeed).toHaveBeenCalledWith(expect.stringContaining("Raise a muster flag closer"), "combat", "info");
  });

  it("the arrow gesture gives no advice and opens a confirm sheet at the cap", () => {
    const pushFeed = vi.fn();
    const state = confirmState();
    handleArrowGestureConfirm(state, { x: 10, y: 10 }, { x: 10 + MUSTER_MARCH_MAX_DISTANCE_TILES, y: 10 }, {
      pushFeed,
      sendGameMessage: vi.fn(() => true),
      renderHud: vi.fn(),
      keyFor: (x, y) => `${x},${y}`
    });
    expect(pushFeed).not.toHaveBeenCalled();
    expect((state as { pendingArrowGestureConfirm: unknown }).pendingArrowGestureConfirm).toBeDefined();
  });
});
