import { BoxGeometry, InstancedMesh, MeshBasicMaterial, PerspectiveCamera, Scene } from "three";
import { describe, expect, it, vi } from "vitest";
import { createFirstFrameSignal, renderSkippingEmptyInstances } from "./client-map-3d-compile-shaders.js";

// Regression: overlays preallocate a full tile budget of instances with
// frustumCulled = false, so the first frame uploaded every empty overlay's
// buffer — the largest single block of the post-login freeze.

const camera = new PerspectiveCamera();

describe("renderSkippingEmptyInstances", () => {
  it("hides only empty instanced meshes during the render, then restores them", () => {
    const scene = new Scene();
    const empty = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 100);
    empty.count = 0;
    const populated = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 100);
    populated.count = 3;
    const alreadyHidden = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 100);
    alreadyHidden.count = 0;
    alreadyHidden.visible = false;
    scene.add(empty, populated, alreadyHidden);

    let seen: boolean[] = [];
    renderSkippingEmptyInstances({ render: () => { seen = [empty.visible, populated.visible, alreadyHidden.visible]; } }, scene, camera);
    expect(seen).toEqual([false, true, false]);
    expect([empty.visible, populated.visible, alreadyHidden.visible]).toEqual([true, true, false]);
  });

  it("restores visibility and the scene's auto-update even when the render throws", () => {
    const scene = new Scene();
    const empty = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 10);
    empty.count = 0;
    scene.add(empty);
    expect(() =>
      renderSkippingEmptyInstances({ render: () => { throw new Error("render failed"); } }, scene, camera)
    ).toThrow("render failed");
    expect(empty.visible).toBe(true);
    expect(scene.matrixWorldAutoUpdate).toBe(true);
  });

  it("updates visible matrices itself and stops the renderer re-walking the whole scene", () => {
    const scene = new Scene();
    const populated = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 10);
    populated.position.set(4, 0, 0);
    scene.add(populated);
    let autoUpdateDuringRender: boolean | undefined;
    renderSkippingEmptyInstances({ render: (s) => { autoUpdateDuringRender = (s as Scene).matrixWorldAutoUpdate; } }, scene, camera);
    expect(autoUpdateDuringRender).toBe(false);
    expect(populated.matrixWorld.elements[12]).toBe(4);
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
