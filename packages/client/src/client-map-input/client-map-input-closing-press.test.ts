// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { takeMenuClosingPress } from "../client-scout-drone/client-scout-drone-closing-press.js";
import { bindClientMapInput } from "./client-map-input.js";

// Player report 2026-11-21: taps meant to close a tile menu started a scout plan. The press closes the menu
// before the tap reaches handleTileSelection, so the input layer notes it; a press that never became a tap
// (review 2026-11-21: a pan) must not leave it noted for the next tap.
it("tells the tap handler when its press closed the tile menu, by mouse and by touch", () => {
  const state = createInitialState();
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 400, 400);
  document.body.append(canvas);
  const closing: boolean[] = [];
  const identity = (value: number): number => value;
  const hideTileActionMenu = vi.fn(() => { state.tileActionMenu.visible = false; });
  bindClientMapInput(state, {
    canvas, miniMapEl: document.createElement("canvas"), tileActionMenuEl: document.createElement("div"),
    keyFor: (x, y) => `${x},${y}`, wrapX: identity, wrapY: identity,
    worldTileRawFromPointer: (x, y) => ({ gx: x, gy: y }),
    computeDragPreview: vi.fn(), requestViewRefresh: vi.fn(), maybeRefreshForCamera: vi.fn(),
    handleTileSelection: () => { closing.push(takeMenuClosingPress()); },
    cancelOngoingCapture: vi.fn(), hideTileActionMenu, clearCrystalTargeting: vi.fn(), cancelBuildingPlacement: vi.fn(),
    renderSidePanel: vi.fn(), openBulkTileActionMenu: vi.fn(), requestAttackPreviewForHover: vi.fn(), requestAttackPreviewForTarget: vi.fn(), interactionFlags: { suppressNextClick: false }
  });
  const click = (x: number): void => {
    canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: x, clientY: 50, button: 0, bubbles: true }));
    window.dispatchEvent(new MouseEvent("mouseup", { clientX: x, clientY: 50, button: 0 }));
  };
  state.tileActionMenu.visible = true;
  click(50);
  click(60);
  expect(closing).toEqual([true, false]);

  state.tileActionMenu.visible = true;
  canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 70, clientY: 50, button: 0, bubbles: true })); // closes, never commits
  click(80);
  expect(closing).toEqual([true, false, false]);

  state.tileActionMenu.visible = true;
  const start = new Event("touchstart", { cancelable: true });
  Object.defineProperty(start, "touches", { value: [{ clientX: 90, clientY: 60 }] });
  canvas.dispatchEvent(start);
  canvas.dispatchEvent(new Event("touchend", { cancelable: true }));
  expect(closing).toEqual([true, false, false, true]);
  canvas.remove();
});
