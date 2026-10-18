// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { createAfcMapOverlays } from "./client-afc-map-overlays.js";
let true3D = false;
vi.mock("../client-renderer-mode.js", () => ({ isTrue3DRendererActive: () => true3D }));

describe("masked AFC signals in both renderers", () => {
  it.each([false, true])("follows the %s projection through fog and opens Purge without inserting a tile", active => {
    true3D = active;
    document.body.innerHTML = "<div><canvas width='100' height='100'></canvas></div>";
    const canvas = document.querySelector("canvas")!;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, toJSON: () => ({}) });
    const state = createInitialState(); state.authSessionReady = true; state.me = "p"; state.afcDetectedFlags = [{ x: 4, y: 0, ownerId: "e" }];
    const open = vi.fn(), overlay = createAfcMapOverlays(canvas, state, open);
    overlay.render([{ wx: 4, wy: 0, wk: "4,0", px: 40, py: 40, vis: "fog", t: undefined }], { size: 10, project: () => ({ sx: 77, sy: 66 }) });
    const marker = document.querySelector<HTMLButtonElement>(".afc-map-signal")!;
    expect(marker.style.left).toBe(active ? "77px" : "45px");
    marker.click();
    expect(state.selected).toEqual({ x: 4, y: 0 }); expect(open).toHaveBeenCalledOnce(); expect(state.tiles.size).toBe(0);
    state.afcDetectedFlags = [];
    overlay.render([], { size: 10, project: () => ({ sx: 77, sy: 66 }) });
    expect(document.querySelector(".afc-map-signal")).toBeNull();
  });
});
