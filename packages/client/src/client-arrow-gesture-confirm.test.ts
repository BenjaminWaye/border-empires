import { describe, expect, it, vi } from "vitest";

vi.mock("./client-arrow-gesture-confirm-sheet.js", () => ({ showArrowGestureConfirmSheet: vi.fn() }));

import { handleArrowGestureConfirm } from "./client-arrow-gesture-confirm.js";
import { createInitialState } from "./client-state/client-state.js";

const deps = { pushFeed: vi.fn(), sendGameMessage: vi.fn(() => true), renderHud: vi.fn(), keyFor: (x: number, y: number) => `${x},${y}` };

describe("handleArrowGestureConfirm", () => {
  it("marks the pending confirm as a new flag only when the caller says so", () => {
    // A plain March To whose flag vanished before the target click must stay
    // invalidatable -- only March Attack from New Flag opts out.
    const state = createInitialState();
    state.me = "me";
    state.tiles.set("1,1", { x: 1, y: 1, terrain: "LAND", ownerId: "me" });
    handleArrowGestureConfirm(state, { x: 1, y: 1 }, { x: 4, y: 1 }, deps);
    expect(state.pendingArrowGestureConfirm).toEqual({ origin: { x: 1, y: 1 }, target: { x: 4, y: 1 } });
    handleArrowGestureConfirm(state, { x: 1, y: 1 }, { x: 4, y: 1 }, deps, { newFlag: true });
    expect(state.pendingArrowGestureConfirm).toEqual({ origin: { x: 1, y: 1 }, target: { x: 4, y: 1 }, newFlag: true });
  });
});
