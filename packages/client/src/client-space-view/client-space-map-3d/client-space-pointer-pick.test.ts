import { describe, expect, it } from "vitest";
import { Object3D } from "three";
import { createClickTracker, resolvePickedSeasonId, wasDragGesture } from "./client-space-pointer-pick.js";

const intersectionOf = (object: Object3D) => ({ object }) as any;

describe("resolvePickedSeasonId", () => {
  it("returns null with no intersections", () => {
    expect(resolvePickedSeasonId([])).toBeNull();
  });

  it("reads seasonId directly off the hit object", () => {
    const mesh = new Object3D();
    mesh.userData.seasonId = "season-9";
    expect(resolvePickedSeasonId([intersectionOf(mesh)])).toBe("season-9");
  });

  it("walks up to an ancestor group carrying seasonId (e.g. a glow shell hit)", () => {
    const group = new Object3D();
    group.userData.seasonId = "season-parent";
    const child = new Object3D();
    group.add(child);
    expect(resolvePickedSeasonId([intersectionOf(child)])).toBe("season-parent");
  });

  it("skips non-planet hits and returns the first resolvable one", () => {
    const plain = new Object3D();
    const planet = new Object3D();
    planet.userData.seasonId = "season-found";
    expect(resolvePickedSeasonId([intersectionOf(plain), intersectionOf(planet)])).toBe("season-found");
  });
});

describe("wasDragGesture", () => {
  it("is false for a stationary click (down/up at the same point)", () => {
    expect(wasDragGesture({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(false);
  });

  it("is false for tiny jitter under the default threshold", () => {
    expect(wasDragGesture({ x: 100, y: 100 }, { x: 102, y: 101 })).toBe(false);
  });

  it("is true once movement exceeds the default threshold (an orbit-camera drag)", () => {
    expect(wasDragGesture({ x: 100, y: 100 }, { x: 140, y: 100 })).toBe(true);
  });

  it("respects a custom threshold", () => {
    expect(wasDragGesture({ x: 0, y: 0 }, { x: 5, y: 0 }, 10)).toBe(false);
    expect(wasDragGesture({ x: 0, y: 0 }, { x: 15, y: 0 }, 10)).toBe(true);
  });
});

describe("createClickTracker", () => {
  it("treats a stationary primary-button down/up pair as a click", () => {
    const tracker = createClickTracker();
    tracker.onPointerDown(0, 100, 100);
    expect(tracker.onPointerUp(0, 101, 100)).toBe(true);
  });

  it("does not treat a drag (movement past the threshold) as a click", () => {
    const tracker = createClickTracker();
    tracker.onPointerDown(0, 100, 100);
    expect(tracker.onPointerUp(0, 140, 100)).toBe(false);
  });

  it("ignores a secondary-button (right-click) press entirely", () => {
    const tracker = createClickTracker();
    tracker.onPointerDown(2, 100, 100);
    expect(tracker.onPointerUp(2, 100, 100)).toBe(false);
  });

  it("regression: a right-click does not leave stale state that corrupts the next, unrelated left-click", () => {
    const tracker = createClickTracker();
    // Right-click near one planet — browsers don't dispatch a "click" for
    // this, which is exactly the scenario that corrupted the old
    // click-based tracking (see the doc comment).
    tracker.onPointerDown(2, 100, 100);
    // A genuine, stationary left-click somewhere else on the canvas should
    // still register as a click, not be misread as a long drag from the
    // earlier right-click's position.
    tracker.onPointerDown(0, 500, 400);
    expect(tracker.onPointerUp(0, 500, 400)).toBe(true);
  });

  it("clears its down-state after each pointerup, even a suppressed one", () => {
    const tracker = createClickTracker();
    tracker.onPointerDown(0, 0, 0);
    tracker.onPointerUp(0, 100, 0); // drag: suppressed, but must still clear state
    tracker.onPointerDown(0, 500, 500);
    expect(tracker.onPointerUp(0, 500, 500)).toBe(true);
  });
});
