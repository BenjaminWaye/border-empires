import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Regression coverage for two ordering bugs in the camera/rebuild pipeline:
// this file is too large/heavy to unit-test the render loop directly (it
// needs a full WebGL renderer, scene, and world state), so verify the
// wiring by reading the source, the way
// client-map-3d-first-render-breadcrumb-regression.test.ts does for the
// crash-breadcrumb ordering.
describe("client-map-3d camera-ordering wiring", () => {
  const source = readFileSync(new URL("./client-map-3d.ts", import.meta.url), "utf8");

  it("applies the camera transform AFTER sceneOrigin is updated for this frame, not before", () => {
    // Regression for the "duplicated terrain" flash: applyCamera() used to run
    // before maybeRebuild's same-frame sceneOrigin.camX/camY update, so on any
    // frame a rebuild committed, the camera was positioned against the stale
    // pre-rebuild anchor while the terrain had just re-baked to the new one.
    const maybeRebuildAt = source.indexOf("const maybeRebuild = (nowMs: number)");
    expect(maybeRebuildAt).toBeGreaterThan(-1);

    const nextFunctionAt = source.indexOf("\n  const renderLoop = (", maybeRebuildAt);
    expect(nextFunctionAt).toBeGreaterThan(maybeRebuildAt);
    const block = source.slice(maybeRebuildAt, nextFunctionAt);

    const sceneOriginCamXAt = block.indexOf("sceneOrigin.camX = builtWindow.camX");
    const sceneOriginCamYAt = block.indexOf("sceneOrigin.camY = builtWindow.camY");
    const applyCameraAt = block.lastIndexOf("applyCamera();");

    expect(sceneOriginCamXAt).toBeGreaterThan(-1);
    expect(sceneOriginCamYAt).toBeGreaterThan(-1);
    expect(applyCameraAt).toBeGreaterThan(-1);
    expect(applyCameraAt).toBeGreaterThan(sceneOriginCamXAt);
    expect(applyCameraAt).toBeGreaterThan(sceneOriginCamYAt);
  });

  it("freshens the camera before every external worldToScreen/worldTileRawFromPointer read", () => {
    // Regression for HUD icons (bread/gold/dock anchor) lagging a frame behind
    // the WebGL terrain: client-runtime-loop.ts's 2D HUD draws on its own,
    // independent requestAnimationFrame loop and can call these before this
    // module's own renderLoop has applied this frame's camera transform.
    const returnAt = source.lastIndexOf("return {");
    expect(returnAt).toBeGreaterThan(-1);
    const returnBlock = source.slice(returnAt);
    expect(returnBlock).toContain("worldTileRawFromPointer: freshWorldTileRawFromPointer");
    expect(returnBlock).toContain("worldToScreen: freshWorldToScreen");

    const freshPointerAt = source.indexOf("const freshWorldTileRawFromPointer:");
    const freshScreenAt = source.indexOf("const freshWorldToScreen:");
    expect(freshPointerAt).toBeGreaterThan(-1);
    expect(freshScreenAt).toBeGreaterThan(freshPointerAt);

    const pointerBlock = source.slice(freshPointerAt, freshScreenAt);
    const screenBlock = source.slice(freshScreenAt, returnAt);

    // applyCamera() must run before the delegate call in each wrapper, not after.
    const pointerApplyAt = pointerBlock.indexOf("applyCamera();");
    const pointerDelegateAt = pointerBlock.indexOf("return worldTileRawFromPointer(");
    expect(pointerApplyAt).toBeGreaterThan(-1);
    expect(pointerDelegateAt).toBeGreaterThan(pointerApplyAt);

    const screenApplyAt = screenBlock.indexOf("applyCamera();");
    const screenDelegateAt = screenBlock.indexOf("return worldToScreen(");
    expect(screenApplyAt).toBeGreaterThan(-1);
    expect(screenDelegateAt).toBeGreaterThan(screenApplyAt);
  });
});
