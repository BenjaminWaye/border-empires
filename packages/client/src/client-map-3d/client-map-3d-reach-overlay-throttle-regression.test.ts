import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Regression coverage for the reach-overlay placement throttle: before this
// fix, renderReachOverlay3DPylons() (which recomputes the full boundary
// visibility filter + diffTransitions() over every pylon/segment, plus one
// Mesh+cloned-Material draw call per visible pylon/segment) ran unthrottled
// on every rAF frame, even with the camera idle and no transitions in
// flight. A captured Chrome performance trace of play.borderempires.com
// showed this as the dominant main-thread+GPU cost, keeping the renderer
// near-saturated continuously. This file is too heavy to construct in a
// unit test (needs a full WebGL renderer/scene/world state), so verify the
// throttle wiring by reading the source, the same way
// client-map-3d-first-render-breadcrumb-regression.test.ts does.
describe("client-map-3d reach-overlay placement throttle", () => {
  const source = readFileSync(new URL("./client-map-3d.ts", import.meta.url), "utf8");

  it("defines a REACH_OVERLAY_MIN_INTERVAL_MS floor ahead of renderReachOverlay3DPylons", () => {
    const floorAt = source.indexOf("const REACH_OVERLAY_MIN_INTERVAL_MS");
    const fnAt = source.indexOf("const renderReachOverlay3DPylons = (nowMs: number)");
    expect(floorAt).toBeGreaterThan(-1);
    expect(fnAt).toBeGreaterThan(floorAt);
  });

  it("early-returns renderReachOverlay3DPylons when called again inside the floor", () => {
    const fnAt = source.indexOf("const renderReachOverlay3DPylons = (nowMs: number)");
    expect(fnAt).toBeGreaterThan(-1);
    const block = source.slice(fnAt, fnAt + 400);
    // Must gate on elapsed time before doing any of the expensive per-frame
    // work (clearPylons/visibility-filter/diffTransitions), and must not
    // skip the very first call (lastReachOverlayAt starts at 0).
    expect(block).toContain("lastReachOverlayAt !== 0");
    expect(block).toContain("nowMs - lastReachOverlayAt < REACH_OVERLAY_MIN_INTERVAL_MS");
    expect(block).toContain("return;");
    const clearAt = block.indexOf("reachOverlay3D.clearPylons()");
    const returnAt = block.indexOf("return;");
    expect(clearAt).toBeGreaterThan(returnAt);
  });

  it("keeps reachOverlay3D.update(nowMs) called every renderLoop frame, unthrottled, so already-placed pylons keep animating between placement recomputes", () => {
    const renderLoopAt = source.indexOf("const renderLoop = (): void =>");
    expect(renderLoopAt).toBeGreaterThan(-1);
    const block = source.slice(renderLoopAt, renderLoopAt + 3500);
    expect(block).toContain("reachOverlay3D.update(nowMs)");
    // Placement recompute call must still be present (now internally throttled).
    expect(block).toContain("renderReachOverlay3DPylons(nowMs)");
  });
});
