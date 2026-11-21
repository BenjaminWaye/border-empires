// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTrue3DRendererActive } from "../client-renderer-mode.js";
import { PHOTO_MODE_BODY_CLASS } from "../client-photo-mode/client-photo-mode.js";
import { createMapTipPins, mapTipPins, pinAnchor, type MapTipPin } from "./client-map-tip-pins.js";
import { renderDiscoveryTipOverlay, resetDiscoveryTipPinsForTests } from "../client-discovery-tips/client-discovery-tip-overlay.js";
import { enqueueDiscoveryTip, type DiscoveryTipId } from "../client-discovery-tips/client-discovery-tips.js";
import { occupationSurveyController } from "../client-occupation-survey.js";

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
const pin = (key: string, x: number, y: number, open = vi.fn()): MapTipPin => ({ key, x, y, label: `Pin ${key}`, kind: "tip", open });
// Tile (x, y) projects to (x*10, y*10): the 2D top-left corner, or the 3D ground centre.
const projection = { size: 10, project: (x: number, y: number) => ({ sx: x * 10, sy: y * 10 }) };
const buttons = (): HTMLButtonElement[] => Array.from(document.querySelectorAll<HTMLButtonElement>(".map-tip-pin"));

beforeEach(() => {
  document.body.innerHTML = "";
  document.body.className = "";
  window.localStorage.clear();
  resetDiscoveryTipPinsForTests();
});
afterEach(() => setTrue3DRendererActive(false));

describe("map tip pins", () => {
  it("anchors at the tile centre in 2D and above the ground point in 3D", () => {
    expect(pinAnchor(projection, 5, 5, false)).toEqual({ sx: 55, sy: 52 });
    expect(pinAnchor(projection, 5, 5, true)).toEqual({ sx: 50, sy: 28 });
  });

  it("places one button per pin over the map in both renderers, and culls pins off screen", () => {
    for (const three of [false, true]) {
      document.body.innerHTML = "";
      setTrue3DRendererActive(three);
      const layer = createMapTipPins(mountCanvas(), () => [pin("a", 5, 5), pin("far", 900, 5)]);
      layer.render(projection);
      expect(buttons().map((b) => b.dataset.pin)).toEqual(["a"]);
      const at = pinAnchor(projection, 5, 5, three);
      expect(buttons()[0]?.style.left).toBe(`${at.sx}px`);
      expect(buttons()[0]?.style.top).toBe(`${at.sy}px`);
      expect(buttons()[0]?.getAttribute("aria-label")).toBe("Pin a");
    }
  });

  it("opens on a tap without letting the tap reach the map, and drops a pin once it is gone", () => {
    const open = vi.fn();
    let pins = [pin("a", 5, 5, open)];
    const canvas = mountCanvas();
    const mapDown = vi.fn();
    canvas.parentElement?.addEventListener("pointerdown", mapDown);
    const layer = createMapTipPins(canvas, () => pins);
    layer.render(projection);
    buttons()[0]?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    buttons()[0]?.click();
    expect(open).toHaveBeenCalledTimes(1);
    expect(mapDown).not.toHaveBeenCalled();
    pins = [];
    layer.render(projection);
    expect(buttons()).toEqual([]);
  });

  it("shows nothing in photo mode", () => {
    document.body.classList.add(PHOTO_MODE_BODY_CLASS);
    createMapTipPins(mountCanvas(), () => [pin("a", 5, 5)]).render(projection);
    expect(buttons()).toEqual([]);
  });

  it("pins queued discovery tips and pending survey clues", () => {
    const queue: DiscoveryTipId[] = [];
    enqueueDiscoveryTip(queue, "DOCK", "a@example.com", { x: 3, y: 4 });
    renderDiscoveryTipOverlay(queue, "a@example.com", vi.fn());
    occupationSurveyController.reconcile([{
      id: "pin-survey", type: "OCCUPATION_SURVEY", text: "Crystal nearby", surveyResource: "GEMS", surveySignature: "REFRACTIVE_GROUND",
      surveyX: 8, surveyY: 9, bearing: "north", distanceBand: "MID", confidence: "MEDIUM"
    }], [], `pins-${crypto.randomUUID()}`);
    const pins = mapTipPins();
    expect(pins.map(({ key, x, y, kind }) => ({ key, x, y, kind }))).toEqual([
      { key: "tip:DOCK", x: 3, y: 4, kind: "tip" },
      { key: "survey:pin-survey", x: 8, y: 9, kind: "survey" }
    ]);
    pins[0]?.open();
    expect(document.getElementById("discovery-tip-overlay")).not.toBeNull();
    occupationSurveyController.reconcile([], [], `pins-reset-${crypto.randomUUID()}`);
  });
});
