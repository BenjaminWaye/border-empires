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

  it("asks to end supply trades before opening the march sheet on a trade partner", () => {
    const state = createInitialState();
    state.me = "me";
    state.tiles.set("1,1", { x: 1, y: 1, terrain: "LAND", ownerId: "me" });
    state.tiles.set("4,1", { x: 4, y: 1, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED" });
    state.resourceTradeAgreements = [{ id: "t", proposerId: "rival", targetId: "me", proposerGives: { FOOD: 1 }, targetGives: {}, startedAt: 1, fulfilled: true }];
    const sheets: Array<{ subtitle: string; onConfirm: () => void }> = [];
    handleArrowGestureConfirm(state, { x: 1, y: 1 }, { x: 4, y: 1 }, { ...deps, showSupplyTradeSheet: (options) => { sheets.push(options); return true; } });
    expect(sheets[0]?.subtitle).toContain("Attacking ends your 1 supply trade with");
    expect(state.pendingArrowGestureConfirm).toBeUndefined();
    sheets[0]!.onConfirm();
    expect(state.pendingArrowGestureConfirm).toEqual({ origin: { x: 1, y: 1 }, target: { x: 4, y: 1 } });
  });
});
