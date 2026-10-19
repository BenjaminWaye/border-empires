// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { bindClientMapInput } from "../client-map-input/client-map-input.js";
import { createGarrisonManyFlow } from "./client-garrison-many.js";

it("commits each mouse/touch tap once through the action-flow suppression guard; drags and pinch only move the map", () => {
  const state = createInitialState();
  state.me = "me"; state.authSessionReady = true; state.manpower = 100;
  state.serverReach = new Set(["0,0", "1,0"]);
  // Batch selection must ignore overlapping alert locators while active.
  state.persistentAlertLocators = [{ id: "overlap", kind: "town_unfed", x: 9, y: 9, screenX: 1, screenY: 0, radius: 12 }];
  for (const x of [0, 1]) state.tiles.set(`${x},0`, { x, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" });
  const keyFor = (x: number, y: number): string => `${x},${y}`;
  const identity = (value: number): number => value;
  const flow = createGarrisonManyFlow(state, {
    keyFor, hideTileActionMenu: vi.fn(), renderHud: vi.fn(),
    requestSettlement: vi.fn(), processDevelopmentQueue: vi.fn(), pushFeed: vi.fn()
  });
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 400, 400);
  document.body.append(canvas);
  const flags = { suppressNextClick: false };
  const committed = vi.fn();
  const bulkMenu = vi.fn();
  bindClientMapInput(state, {
    canvas, miniMapEl: document.createElement("canvas"), tileActionMenuEl: document.createElement("div"),
    keyFor, wrapX: identity, wrapY: identity, worldTileRawFromPointer: (x, y) => ({ gx: x, gy: y }),
    computeDragPreview: vi.fn(), requestViewRefresh: vi.fn(), maybeRefreshForCamera: vi.fn(),
    // Same shared guard used by createClientActionFlow.handleTileSelection.
    handleTileSelection: (x, y) => {
      if (flags.suppressNextClick) { flags.suppressNextClick = false; return; }
      committed(x, y);
      flow.select(x, y);
    },
    cancelOngoingCapture: vi.fn(), hideTileActionMenu: vi.fn(), clearCrystalTargeting: vi.fn(), cancelBuildingPlacement: vi.fn(),
    renderMobilePanels: vi.fn(), openBulkTileActionMenu: bulkMenu, requestAttackPreviewForHover: vi.fn(), requestAttackPreviewForTarget: vi.fn(), interactionFlags: flags
  });
  flow.begin(state.tiles.get("0,0")!);
  const mouse = (type: string, x = 1, shiftKey = false): void => {
    const target = type === "mouseup" ? window : canvas;
    target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: 0, button: 0, shiftKey }));
  };
  mouse("mousedown"); mouse("mouseup"); mouse("click");
  expect(state.garrisonMany.keys).toEqual(["0,0", "1,0"]);
  expect(committed).toHaveBeenCalledTimes(1);
  mouse("mousedown", 1, true); mouse("mousemove", 80, true); mouse("mouseup", 80, true); mouse("click", 80);
  expect(committed).toHaveBeenCalledTimes(1);
  expect(bulkMenu).not.toHaveBeenCalled();
  const touch = (type: string, positions: number[]): void => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, "touches", { value: positions.map((x) => ({ clientX: x, clientY: 0 })) });
    canvas.dispatchEvent(event);
    if (type === "touchend") expect(event.defaultPrevented).toBe(true);
  };
  const zoom = state.zoom;
  touch("touchstart", [1]); touch("touchend", []); mouse("click");
  expect(state.garrisonMany.keys).toEqual(["0,0"]);
  touch("touchstart", [1]); touch("touchend", []); mouse("click");
  expect(state.garrisonMany.keys).toEqual(["0,0", "1,0"]);
  expect(state.zoom).toBe(zoom); // quick taps toggle, never double-tap zoom
  touch("touchstart", [1]); touch("touchmove", [80]); touch("touchend", []); mouse("click", 80);
  expect(committed).toHaveBeenCalledTimes(3);
  touch("touchstart", [1, 30]); touch("touchmove", [1, 60]); touch("touchend", []);
  expect(committed).toHaveBeenCalledTimes(3);
  expect(state.zoom).not.toBe(zoom);
  flow.cancel();
});
