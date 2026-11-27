// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { closeScreenKeepingView, closeUpOn, endCloseUp } from "./client-hud-v2-camera.js";

const cameraDeps = () => ({
  state: { camX: 50, camY: 60, camSubX: 0, camSubY: 0, zoom: 22 },
  wrapX: (x: number) => x,
  wrapY: (y: number) => y,
  requestViewRefresh: vi.fn()
});

// Review of #2876: Show on map from a charges panel open over a close-up screen (a town) closed that screen,
// and the close-up's glide back put the camera and zoom where they were before, undoing the framed view.
describe("closing a screen after a House Charge's Show on map", () => {
  it("keeps the framed view instead of gliding back to the close-up's starting view", () => {
    const deps = cameraDeps();
    closeUpOn(deps as never, 10, 10, 72);
    // Show on map framed this view while the close-up screen was open.
    Object.assign(deps.state, { camX: 200, camY: 210, zoom: 12 });
    closeScreenKeepingView(deps as never, { x: 200, y: 210, zoom: 12 }, () => endCloseUp(deps as never));
    expect(deps.state).toMatchObject({ camX: 200, camY: 210, camSubX: 0, camSubY: 0, zoom: 12 });
    expect(deps.requestViewRefresh).toHaveBeenCalled();
  });

  it("runs the screen close it was given", () => {
    const close = vi.fn();
    closeScreenKeepingView(cameraDeps() as never, { x: 1, y: 2, zoom: 30 }, close);
    expect(close).toHaveBeenCalledOnce();
  });
});
