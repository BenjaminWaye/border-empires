import { BoxGeometry, InstancedMesh, MeshBasicMaterial, Scene } from "three";
import { describe, expect, it, vi } from "vitest";
import { createFirstFrameSignal, withEmptyInstancedMeshesHidden } from "./client-map-3d-compile-shaders.js";

// Regression: overlays preallocate a full tile budget of instances with
// frustumCulled = false, so the first frame uploaded every empty overlay's
// buffer — the largest single block of the post-login freeze.

describe("withEmptyInstancedMeshesHidden", () => {
  it("hides only empty instanced meshes during the work, then restores them", () => {
    const scene = new Scene();
    const empty = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 100);
    empty.count = 0;
    const populated = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 100);
    populated.count = 3;
    const alreadyHidden = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 100);
    alreadyHidden.count = 0;
    alreadyHidden.visible = false;
    scene.add(empty, populated, alreadyHidden);

    const seen = withEmptyInstancedMeshesHidden(scene, () => [empty.visible, populated.visible, alreadyHidden.visible]);
    expect(seen).toEqual([false, true, false]);
    expect([empty.visible, populated.visible, alreadyHidden.visible]).toEqual([true, true, false]);
  });

  it("restores visibility even when the work throws", () => {
    const scene = new Scene();
    const empty = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 10);
    empty.count = 0;
    scene.add(empty);
    expect(() =>
      withEmptyInstancedMeshesHidden(scene, () => {
        throw new Error("render failed");
      })
    ).toThrow("render failed");
    expect(empty.visible).toBe(true);
  });
});

describe("createFirstFrameSignal", () => {
  it("resolves when the first frame is marked, or after the fallback", async () => {
    vi.useFakeTimers();
    const marked = createFirstFrameSignal(1_000);
    let resolved = false;
    void marked.rendered.then(() => (resolved = true));
    marked.markRendered();
    await Promise.resolve();
    expect(resolved).toBe(true);

    const neverMarked = createFirstFrameSignal(1_000);
    let fellBack = false;
    void neverMarked.rendered.then(() => (fellBack = true));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fellBack).toBe(true);
    vi.useRealTimers();
  });
});
