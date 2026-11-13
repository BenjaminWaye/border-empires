import { describe, expect, it, vi } from "vitest";
import type { EffortConfirmSheetOptions } from "./client-effort-confirm-sheet/client-effort-confirm-sheet.js";

const sheets: EffortConfirmSheetOptions[] = [];
vi.mock("./client-effort-confirm-sheet/client-effort-confirm-sheet.js", () => ({
  showEffortConfirmSheet: (options: EffortConfirmSheetOptions) => {
    sheets.push(options);
    return { close: vi.fn() };
  }
}));

import { showArrowGestureConfirmSheet } from "./client-arrow-gesture-confirm-sheet.js";
import { createInitialState } from "./client-state/client-state.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

// Playtest 2026-11-12 (pt-snacker): after "Go" on the march sheet nothing on
// screen said the march had left.
describe("showArrowGestureConfirmSheet Go feedback", () => {
  const open = (sent: boolean) => {
    sheets.length = 0;
    const state = createInitialState();
    state.me = "me";
    state.manpowerCap = 1_000;
    state.tiles.set("1,1", { x: 1, y: 1, terrain: "LAND", ownerId: "me" });
    const pushFeed = vi.fn();
    const sendGameMessage = vi.fn((payload: unknown) => (payload as { type?: string }).type === "SET_MUSTER" ? sent : true);
    showArrowGestureConfirmSheet(state, { x: 1, y: 1 }, { x: 4, y: 1 }, keyFor, { sendGameMessage, pushFeed, renderHud: vi.fn() });
    return { state, pushFeed };
  };

  it("shows a March sent alert and feed entry once Go sends the march", () => {
    const { state, pushFeed } = open(true);
    expect(state.captureAlert).toBeUndefined();
    sheets[0]!.onConfirm(120, undefined);
    expect(state.captureAlert).toMatchObject({ title: "March sent", detail: "120 manpower from (1, 1) to (4, 1)", tone: "success", focusX: 4, focusY: 1 });
    expect(pushFeed).toHaveBeenCalledWith("March sent: 120 manpower from (1, 1) to (4, 1)", "combat", "info");
  });

  it("says nothing when the march could not be sent", () => {
    const { state, pushFeed } = open(false);
    sheets[0]!.onConfirm(120, undefined);
    expect(state.captureAlert).toBeUndefined();
    expect(pushFeed).not.toHaveBeenCalled();
  });
});
