// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { installMarchInteraction, marchHintText, marchTargetDrag, MARCH_HINT_ID, resetMarchInteractionForTest, syncMarchInteraction } from "./client-march-interaction.js";

const marchingFlag: Tile = {
  x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
  muster: { ownerId: "me", amount: 40, mode: "MARCH", targetX: 14, targetY: 10, updatedAt: 0 }
};

const makeState = () => ({
  tiles: new Map<string, Tile>([["10,10", marchingFlag]]),
  me: "me",
  hover: undefined as { x: number; y: number } | undefined,
  musterMarchTargeting: { active: false, originX: 0, originY: 0 },
  marchOriginPicking: { active: false, targetX: 0, targetY: 0 },
  arrowGesture: undefined as { origin: { x: number; y: number }; target: { x: number; y: number } } | undefined,
  pendingArrowGestureConfirm: undefined,
  incomingAttacksByTile: new Map<string, { attackerName: string; resolvesAt: number }>()
});

afterEach(() => {
  resetMarchInteractionForTest();
  document.body.innerHTML = "";
});

// Regression: after pressing March To nothing on screen said to tap where the flag should go.
describe("March To targeting banner", () => {
  it("tells the player to tap the destination, with distance under the pointer", () => {
    const state = makeState();
    state.musterMarchTargeting = { active: true, originX: 10, originY: 10 };
    expect(marchHintText(state, 0)).toContain("Tap the tile the flag at (10, 10) should march to");
    state.hover = { x: 50, y: 10 };
    expect(marchHintText(state, 0)).toContain("(50, 10) is 40 tiles, too far");
  });

  it("shows the banner and a pointer-following arrow while targeting, and clears both on Cancel", () => {
    const state = makeState();
    installMarchInteraction({ state, sendGameMessage: vi.fn(), renderHud: vi.fn() });
    state.musterMarchTargeting = { active: true, originX: 10, originY: 10 };
    state.hover = { x: 12, y: 11 };
    syncMarchInteraction(0);
    const banner = document.getElementById(MARCH_HINT_ID);
    expect(banner?.style.display).toBe("flex");
    expect(state.arrowGesture).toEqual({ origin: { x: 10, y: 10 }, target: { x: 12, y: 11 } });
    (banner?.querySelector("[data-march-hint-cancel]") as HTMLButtonElement).click();
    syncMarchInteraction(0);
    expect(state.musterMarchTargeting.active).toBe(false);
    expect(state.arrowGesture).toBeUndefined();
    expect(banner?.style.display).toBe("none");
  });
});

describe("dragging a march's destination", () => {
  it("re-targets the march when its destination is dragged to another tile", () => {
    const state = makeState();
    const sendGameMessage = vi.fn(() => true);
    installMarchInteraction({ state, sendGameMessage, renderHud: vi.fn() });
    expect(marchTargetDrag.begin(14, 10, 0, 0)).toBe(true);
    marchTargetDrag.move(16, 12, 40, 40);
    expect(state.arrowGesture?.target).toEqual({ x: 16, y: 12 });
    expect(marchTargetDrag.end()).toBe("moved");
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SET_MUSTER", x: 10, y: 10, mode: "MARCH", targetX: 16, targetY: 12 });
    expect(state.arrowGesture).toBeUndefined();
  });

  it("does not start on tiles that aren't a march destination, and a press without moving is a plain tap", () => {
    const state = makeState();
    const sendGameMessage = vi.fn(() => true);
    installMarchInteraction({ state, sendGameMessage, renderHud: vi.fn() });
    expect(marchTargetDrag.begin(3, 3, 0, 0)).toBe(false);
    expect(marchTargetDrag.begin(14, 10, 0, 0)).toBe(true);
    expect(marchTargetDrag.end()).toBe("tap");
    expect(sendGameMessage).not.toHaveBeenCalled();
  });

  it("refuses a drop beyond the march range and keeps the old target", () => {
    const state = makeState();
    const sendGameMessage = vi.fn(() => true);
    installMarchInteraction({ state, sendGameMessage, renderHud: vi.fn() });
    marchTargetDrag.begin(14, 10, 0, 0);
    marchTargetDrag.move(60, 10, 400, 0);
    expect(marchTargetDrag.end(0)).toBe("moved");
    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(marchHintText(state, 1)).toContain("Too far");
  });

  // Regression (review): a slightly shaky tap on a march target, zoomed out,
  // landed on the next tile and silently moved the march.
  it("ignores pointer jitter below the drag threshold", () => {
    const state = makeState();
    const sendGameMessage = vi.fn(() => true);
    installMarchInteraction({ state, sendGameMessage, renderHud: vi.fn() });
    marchTargetDrag.begin(14, 10, 100, 100);
    marchTargetDrag.move(15, 10, 104, 102);
    expect(marchTargetDrag.end()).toBe("tap");
    expect(sendGameMessage).not.toHaveBeenCalled();
  });

  // Regression (review): dragging re-targeted a besieged flag (Change Target is
  // locked then) and claimed success even when nothing was sent.
  it("refuses while the flag is under siege, and says so when the message can't be sent", () => {
    const state = makeState();
    state.incomingAttacksByTile.set("10,10", { attackerName: "Rival", resolvesAt: Date.now() + 60_000 });
    const sendGameMessage = vi.fn(() => false);
    installMarchInteraction({ state, sendGameMessage, renderHud: vi.fn() });
    marchTargetDrag.begin(14, 10, 0, 0);
    marchTargetDrag.move(16, 12, 40, 40);
    expect(marchTargetDrag.end()).toBe("moved");
    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(marchHintText(state, Date.now())).toContain("Under siege by Rival");
    state.incomingAttacksByTile.clear();
    marchTargetDrag.begin(14, 10, 0, 0);
    marchTargetDrag.move(16, 12, 40, 40);
    marchTargetDrag.end();
    expect(sendGameMessage).toHaveBeenCalledTimes(1);
    expect(marchHintText(state, Date.now())).toContain("Not connected");
  });
});
