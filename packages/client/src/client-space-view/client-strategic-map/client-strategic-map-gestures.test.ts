import { describe, expect, it } from "vitest";

import { clampView, zoomAbout } from "./client-strategic-map-gestures.js";
import { DEFAULT_MAP_VIEW, MAX_MAP_ZOOM, fitTransform } from "./client-strategic-map-layout.js";

const W = 800;
const H = 600;
const fit = fitTransform(W, H).scale;

describe("strategic map gestures", () => {
  it("zooming keeps the point under the cursor fixed", () => {
    const at = { x: 620, y: 200 };
    const world = { x: (at.x - W / 2) / fit, y: (at.y - H / 2) / fit };
    const next = zoomAbout(DEFAULT_MAP_VIEW, 2, at.x, at.y, W, H, fit);
    const p = fitTransform(W, H, 28, next).toScreen(world);
    expect(p.x).toBeCloseTo(at.x, 3);
    expect(p.y).toBeCloseTo(at.y, 3);
  });
  it("zoom stays within its limits", () => {
    expect(zoomAbout(DEFAULT_MAP_VIEW, 0.1, 400, 300, W, H, fit).zoom).toBe(1);
    expect(zoomAbout(DEFAULT_MAP_VIEW, 1000, 400, 300, W, H, fit).zoom).toBe(MAX_MAP_ZOOM);
  });
  it("the galaxy can never be dragged out of reach", () => {
    const far = clampView({ zoom: 2, panX: 99999, panY: -99999 }, fit);
    expect(far.panX).toBe(fit * 2);
    expect(far.panY).toBe(-fit * 2);
  });
});
