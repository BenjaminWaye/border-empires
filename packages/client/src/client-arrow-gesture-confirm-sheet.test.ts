// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { claimCostNote, hideArrowGestureConfirmSheet, showArrowGestureConfirmSheet } from "./client-arrow-gesture-confirm-sheet.js";
import { createInitialState } from "./client-state/client-state.js";

// 2026-11-12 playtest (pt-predator): a 295-manpower march down an empty beach
// took the pool from 943 to ~97. Each claim on the way is charged to the pool
// on top of the flag's commitment, and the sheet never said so.
describe("March To sheet claim cost", () => {
  afterEach(() => hideArrowGestureConfirmSheet());

  it("states the per-claim manpower cost under the commitment", () => {
    const state = createInitialState();
    state.me = "me";
    state.expandManpowerCost = 14;
    state.tiles.set("1,1", { x: 1, y: 1, terrain: "LAND", ownerId: "me" });
    showArrowGestureConfirmSheet(state, { x: 1, y: 1 }, { x: 9, y: 1 }, (x, y) => `${x},${y}`, { sendGameMessage: vi.fn(() => true), renderHud: vi.fn() });
    expect(document.querySelector("[data-effort-info]")?.textContent).toContain("each tile claimed on the way costs 14 more manpower");
  });

  it("adds nothing when the cost is unknown", () => {
    expect(claimCostNote(undefined)).toBe("");
    expect(claimCostNote(0)).toBe("");
  });
});
