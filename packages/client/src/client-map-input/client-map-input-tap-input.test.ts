// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { bindClientMapInput } from "./client-map-input.js";

// Playtest 2026-11-12: a phone tap on a tile next to the border claimed it
// with no confirm. The input layer tags each selection with how it arrived so
// handleTileSelection can make a touch tap inspect-only (TileTapInput).
it("tags touch taps as touch and mouse clicks as mouse", () => {
  const state = createInitialState();
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 400, 400);
  document.body.append(canvas);
  const flags = { suppressNextClick: false };
  const committed = vi.fn();
  const identity = (value: number): number => value;
  bindClientMapInput(state, {
    canvas, miniMapEl: document.createElement("canvas"), tileActionMenuEl: document.createElement("div"),
    keyFor: (x, y) => `${x},${y}`, wrapX: identity, wrapY: identity,
    worldTileRawFromPointer: (x, y) => ({ gx: x, gy: y }),
    computeDragPreview: vi.fn(), requestViewRefresh: vi.fn(), maybeRefreshForCamera: vi.fn(),
    handleTileSelection: (x, y, _clientX, _clientY, tapInput) => {
      if (flags.suppressNextClick) { flags.suppressNextClick = false; return; }
      committed(x, y, tapInput);
    },
    cancelOngoingCapture: vi.fn(), hideTileActionMenu: vi.fn(), clearCrystalTargeting: vi.fn(), cancelBuildingPlacement: vi.fn(),
    renderSidePanel: vi.fn(), openBulkTileActionMenu: vi.fn(), requestAttackPreviewForHover: vi.fn(), requestAttackPreviewForTarget: vi.fn(), interactionFlags: flags
  });
  const start = new Event("touchstart", { cancelable: true });
  Object.defineProperty(start, "touches", { value: [{ clientX: 50, clientY: 60 }] });
  canvas.dispatchEvent(start);
  canvas.dispatchEvent(new Event("touchend", { cancelable: true }));
  expect(committed.mock.calls).toEqual([[50, 60, "touch"]]);

  canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 200, clientY: 210, button: 0 }));
  window.dispatchEvent(new MouseEvent("mouseup", { clientX: 200, clientY: 210, button: 0 }));
  expect(committed.mock.calls).toEqual([[50, 60, "touch"], [200, 210, "mouse"]]);
  canvas.remove();
});
