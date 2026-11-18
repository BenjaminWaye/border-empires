// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { clearTownPlotPlacement, setTownPlotPlacement, townPlotPlacement } from "../client-town-plot-placement/client-town-plot-placement.js";
import { bindClientMapInput } from "./client-map-input.js";

afterEach(() => clearTownPlotPlacement());

it("sends map taps to a running town plot pick instead of selecting the tile", () => {
  const state = createInitialState();
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 400, 400);
  document.body.append(canvas);
  const selected = vi.fn();
  const identity = (value: number): number => value;
  bindClientMapInput(state, {
    canvas, miniMapEl: document.createElement("canvas"), tileActionMenuEl: document.createElement("div"),
    keyFor: (x, y) => `${x},${y}`, wrapX: identity, wrapY: identity,
    worldTileRawFromPointer: () => ({ gx: 6, gy: 6 }),
    computeDragPreview: vi.fn(), requestViewRefresh: vi.fn(), maybeRefreshForCamera: vi.fn(),
    handleTileSelection: selected,
    cancelOngoingCapture: vi.fn(), hideTileActionMenu: vi.fn(), clearCrystalTargeting: vi.fn(), cancelBuildingPlacement: vi.fn(),
    renderSidePanel: vi.fn(), openBulkTileActionMenu: vi.fn(), requestAttackPreviewForHover: vi.fn(), requestAttackPreviewForTarget: vi.fn(),
    interactionFlags: { suppressNextClick: false }
  });
  const taps: string[] = [];
  setTownPlotPlacement({ townKey: "5,5", actionId: "build_manufactory", candidates: ["6,5", "6,6"], chosenKey: "6,5" }, (x, y) => {
    taps.push(`${x},${y}`);
    return true;
  });
  canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 40, clientY: 40, button: 0 }));
  window.dispatchEvent(new MouseEvent("mouseup", { clientX: 40, clientY: 40, button: 0 }));
  canvas.dispatchEvent(new MouseEvent("click", { clientX: 40, clientY: 40 }));
  const start = new Event("touchstart", { cancelable: true });
  Object.defineProperty(start, "touches", { value: [{ clientX: 120, clientY: 120 }] });
  canvas.dispatchEvent(start);
  canvas.dispatchEvent(new Event("touchend", { cancelable: true }));
  expect(taps).toEqual(["6,6", "6,6"]);
  expect(selected).not.toHaveBeenCalled();

  // A pick that no longer applies drops itself and the tap selects as usual.
  setTownPlotPlacement({ townKey: "5,5", actionId: "build_manufactory", candidates: ["6,5"], chosenKey: "6,5" }, () => false);
  canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 40, clientY: 40, button: 0 }));
  window.dispatchEvent(new MouseEvent("mouseup", { clientX: 40, clientY: 40, button: 0 }));
  expect(townPlotPlacement()).toBeUndefined();
  expect(selected).toHaveBeenCalledTimes(1);
  canvas.remove();
});
