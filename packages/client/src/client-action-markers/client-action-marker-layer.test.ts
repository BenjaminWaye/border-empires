// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTrue3DRendererActive } from "../client-renderer-mode.js";
import { PHOTO_MODE_BODY_CLASS } from "../client-photo-mode/client-photo-mode.js";
import { setDiscoveryTipCenterHandler } from "../client-discovery-tips/client-discovery-tip-overlay.js";
import { resetNoticeGateForTests } from "../client-notice-gate/client-notice-gate.js";
import { EDGE_ARROW_INSET_PX, createActionMarkerLayer, edgeArrowPlacement } from "./client-action-marker-layer.js";
import { ACTION_MARKER_MS, resetActionMarkers, showActionMarker } from "./client-action-markers.js";

const mountCanvas = (): HTMLCanvasElement => {
  const host = document.createElement("div");
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 300;
  canvas.getBoundingClientRect = () => ({ width: 400, height: 300, left: 0, top: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) });
  host.append(canvas);
  document.body.append(host);
  return canvas;
};
// Like client-map-math.ts worldToScreen with the camera at 0,0: a tile's centre, (x + 0.5) * size.
const projection = { size: 10, project: (x: number, y: number) => ({ sx: (x + 0.5) * 10, sy: (y + 0.5) * 10 }) };
const visible = (selector: string): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((el) => !el.hidden);

beforeEach(() => {
  vi.useFakeTimers({ now: 1_000_000 });
  document.body.innerHTML = "";
  document.body.className = "";
  resetActionMarkers();
  resetNoticeGateForTests();
});
afterEach(() => {
  vi.useRealTimers();
  setTrue3DRendererActive(false);
  setDiscoveryTipCenterHandler(undefined);
});

// Owner (2026-11-28): "Instead show some indicators on the map that fade, with arrows pointing to them if
// it isn't on your current viewport." These replace the top-of-screen confirmation toast.
describe("action marker layer", () => {
  it("puts a ring and the label on an on-screen tile in both renderers", () => {
    for (const three of [false, true]) {
      document.body.innerHTML = "";
      resetActionMarkers();
      setTrue3DRendererActive(three);
      showActionMarker(5, 5, "+1 tile");
      createActionMarkerLayer(mountCanvas()).render(projection);
      const [marker] = visible(".action-marker");
      expect(marker?.querySelector(".action-marker-label")?.textContent).toBe("+1 tile");
      expect(marker?.style.left).toBe("55px");
      expect(marker?.style.top).toBe("55px");
      expect(visible(".action-marker-arrow")).toHaveLength(0);
    }
  });

  it("shows an edge arrow toward an off-screen tile, and a tap pans the camera there", () => {
    const center = vi.fn();
    setDiscoveryTipCenterHandler(center);
    showActionMarker(100, 15, "Trade agreed");
    createActionMarkerLayer(mountCanvas()).render(projection);
    expect(visible(".action-marker")).toHaveLength(0);
    const [arrow] = visible(".action-marker-arrow") as HTMLButtonElement[];
    expect(arrow?.style.left).toBe(`${400 - EDGE_ARROW_INSET_PX}px`);
    arrow?.click();
    expect(center).toHaveBeenCalledWith({ x: 100, y: 15 });
  });

  it("fades the marker out and removes it when its time is up", () => {
    showActionMarker(5, 5, "Hydrogarden started");
    const layer = createActionMarkerLayer(mountCanvas());
    layer.render(projection);
    vi.advanceTimersByTime(ACTION_MARKER_MS / 2);
    layer.render(projection);
    expect(visible(".action-marker")[0]?.style.opacity).toBe("1.000");
    vi.advanceTimersByTime(ACTION_MARKER_MS / 2);
    layer.render(projection);
    expect(document.querySelectorAll(".action-marker, .action-marker-arrow")).toHaveLength(0);
  });

  it("waits while a sheet covers the map (notice gate), then shows", () => {
    const sheet = document.createElement("div");
    sheet.className = "diplomacy-trade-overlay";
    document.body.append(sheet);
    showActionMarker(5, 5, "Truce agreed");
    const layer = createActionMarkerLayer(mountCanvas());
    layer.render(projection);
    expect(visible(".action-marker")).toHaveLength(0);
    vi.advanceTimersByTime(ACTION_MARKER_MS * 2);
    sheet.remove();
    layer.render(projection);
    expect(visible(".action-marker")).toHaveLength(1);
  });

  it("shows nothing in photo mode or with no map drawn", () => {
    showActionMarker(5, 5, "+1 tile");
    const layer = createActionMarkerLayer(mountCanvas());
    layer.render(projection, false);
    expect(visible(".action-marker")).toHaveLength(0);
    document.body.classList.add(PHOTO_MODE_BODY_CLASS);
    layer.render(projection);
    expect(visible(".action-marker")).toHaveLength(0);
  });
});

describe("edgeArrowPlacement", () => {
  it("sits on the inset edge along the line from the centre and points at the tile", () => {
    expect(edgeArrowPlacement(1000, 150, 400, 300, 30)).toEqual({ left: 370, top: 150, angleDeg: 0 });
    expect(edgeArrowPlacement(200, -1000, 400, 300, 30)).toEqual({ left: 200, top: 30, angleDeg: -90 });
    const corner = edgeArrowPlacement(-800, 1150, 400, 300, 30);
    expect(corner.angleDeg).toBeCloseTo(135);
    expect(corner.left).toBeCloseTo(80);
    expect(corner.top).toBeCloseTo(270);
  });
});
