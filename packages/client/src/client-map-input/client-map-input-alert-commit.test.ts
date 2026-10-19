// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { bindClientMapInput } from "./client-map-input.js";

it("centers alert markers before committing mouse or consecutive touch selections", () => {
  const state = createInitialState();
  state.persistentAlertLocators = [
    { id: "first", kind: "town_unfed", x: 8, y: 9, screenX: 40, screenY: 40, radius: 12 },
    { id: "second", kind: "town_unfed", x: 12, y: 13, screenX: 80, screenY: 80, radius: 12 }
  ];
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 400, 400);
  document.body.append(canvas);
  const flags = { suppressNextClick: false };
  const committed = vi.fn();
  const refresh = vi.fn();
  const identity = (value: number): number => value;
  bindClientMapInput(state, {
    canvas, miniMapEl: document.createElement("canvas"), tileActionMenuEl: document.createElement("div"),
    keyFor: (x, y) => `${x},${y}`, wrapX: identity, wrapY: identity,
    worldTileRawFromPointer: (x, y) => ({ gx: x, gy: y }),
    computeDragPreview: vi.fn(), requestViewRefresh: refresh, maybeRefreshForCamera: vi.fn(),
    // The action-flow and input layer share this same suppression flag.
    handleTileSelection: (x, y) => {
      if (flags.suppressNextClick) { flags.suppressNextClick = false; return; }
      committed(x, y);
    },
    cancelOngoingCapture: vi.fn(), hideTileActionMenu: vi.fn(), clearCrystalTargeting: vi.fn(), cancelBuildingPlacement: vi.fn(),
    renderMobilePanels: vi.fn(), openBulkTileActionMenu: vi.fn(), requestAttackPreviewForHover: vi.fn(), requestAttackPreviewForTarget: vi.fn(), interactionFlags: flags
  });
  canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 40, clientY: 40, button: 0 }));
  window.dispatchEvent(new MouseEvent("mouseup", { clientX: 40, clientY: 40, button: 0 }));
  canvas.dispatchEvent(new MouseEvent("click", { clientX: 40, clientY: 40 }));
  expect(committed.mock.calls).toEqual([[8, 9]]);
  const tap = (position: number): void => {
    const start = new Event("touchstart", { cancelable: true });
    Object.defineProperty(start, "touches", { value: [{ clientX: position, clientY: position }] });
    canvas.dispatchEvent(start);
    canvas.dispatchEvent(new Event("touchend", { cancelable: true }));
  };
  tap(40);
  tap(80); // no compatibility mouse click clears suppression between touches
  expect(committed.mock.calls).toEqual([[8, 9], [8, 9], [12, 13]]);
  expect(state.selected).toEqual({ x: 12, y: 13 });
  expect(state.camX).toBe(12);
  expect(state.camY).toBe(13);
  expect(refresh).toHaveBeenCalledTimes(3);
  canvas.remove();
});
