// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSpaceCameraRig, GALAXY_VIEW_DISTANCE, GALAXY_VIEW_TARGET, FOCUS_VIEW_DISTANCE } from "./client-space-camera.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSpaceCameraRig", () => {
  it("starts at the default galaxy-view distance from the origin", () => {
    const rig = createSpaceCameraRig(document.createElement("canvas"), 1.6);
    expect(rig.controls.target.toArray()).toEqual([GALAXY_VIEW_TARGET.x, GALAXY_VIEW_TARGET.y, GALAXY_VIEW_TARGET.z]);
    expect(rig.camera.position.distanceTo(rig.controls.target)).toBeCloseTo(GALAXY_VIEW_DISTANCE, 5);
    rig.dispose();
  });

  it("flyTo does not move the camera instantly -- tick() must be called to advance it", () => {
    const rig = createSpaceCameraRig(document.createElement("canvas"), 1.6);
    const before = rig.camera.position.clone();
    rig.flyTo({ x: 10, y: 0, z: 0 }, FOCUS_VIEW_DISTANCE);
    expect(rig.camera.position.equals(before)).toBe(true);
    rig.dispose();
  });

  it("tick() eventually lands the orbit target exactly on the focus position and holds the requested distance", () => {
    const rig = createSpaceCameraRig(document.createElement("canvas"), 1.6);
    const focus = { x: 12, y: 3, z: -7 };
    rig.flyTo(focus, FOCUS_VIEW_DISTANCE);

    let now = 0;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => now);
    // Re-trigger the flight now that performance.now() is mocked from 0, so
    // the flight's own startedAtMs lines up with the mocked clock.
    rig.flyTo(focus, FOCUS_VIEW_DISTANCE);

    now = 2000; // well past FLIGHT_DURATION_MS
    rig.tick();

    expect(rig.controls.target.x).toBeCloseTo(focus.x, 5);
    expect(rig.controls.target.y).toBeCloseTo(focus.y, 5);
    expect(rig.controls.target.z).toBeCloseTo(focus.z, 5);
    expect(rig.camera.position.distanceTo(rig.controls.target)).toBeCloseTo(FOCUS_VIEW_DISTANCE, 5);

    nowSpy.mockRestore();
    rig.dispose();
  });

  it("controls are re-enabled once a flight completes, having been disabled mid-flight", () => {
    const rig = createSpaceCameraRig(document.createElement("canvas"), 1.6);
    let now = 0;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => now);

    rig.flyTo({ x: 5, y: 0, z: 0 }, FOCUS_VIEW_DISTANCE);
    expect(rig.controls.enabled).toBe(false);

    now = 350; // mid-flight
    rig.tick();
    expect(rig.controls.enabled).toBe(false);

    now = 2000; // complete
    rig.tick();
    expect(rig.controls.enabled).toBe(true);

    nowSpy.mockRestore();
    rig.dispose();
  });

  it("resetView flies back to the galaxy-view target and distance", () => {
    const rig = createSpaceCameraRig(document.createElement("canvas"), 1.6);
    let now = 0;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => now);

    rig.flyTo({ x: 20, y: 5, z: -3 }, FOCUS_VIEW_DISTANCE);
    now = 2000;
    rig.tick();

    now = 2100;
    rig.resetView();
    now = 4000;
    rig.tick();

    expect(rig.controls.target.toArray()).toEqual([GALAXY_VIEW_TARGET.x, GALAXY_VIEW_TARGET.y, GALAXY_VIEW_TARGET.z]);
    expect(rig.camera.position.distanceTo(rig.controls.target)).toBeCloseTo(GALAXY_VIEW_DISTANCE, 5);

    nowSpy.mockRestore();
    rig.dispose();
  });

  it("a degenerate flight (camera exactly at the target) still resolves to a stable, non-NaN end position", () => {
    const rig = createSpaceCameraRig(document.createElement("canvas"), 1.6);
    rig.camera.position.copy(rig.controls.target);
    let now = 0;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => now);

    rig.flyTo({ x: 0, y: 0, z: 0 }, FOCUS_VIEW_DISTANCE);
    now = 2000;
    rig.tick();

    expect(Number.isNaN(rig.camera.position.x)).toBe(false);
    expect(rig.camera.position.distanceTo(rig.controls.target)).toBeCloseTo(FOCUS_VIEW_DISTANCE, 5);

    nowSpy.mockRestore();
    rig.dispose();
  });
});
