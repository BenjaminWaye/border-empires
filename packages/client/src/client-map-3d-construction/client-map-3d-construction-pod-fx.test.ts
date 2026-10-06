import { describe, expect, it } from "vitest";
import { Scene } from "three";
import { createConstructionPodFxLayer } from "./client-map-3d-construction-pod-fx.js";

describe("construction pod fx", () => {
  it("drops from orbit onto the site and retires itself after touchdown", () => {
    const scene = new Scene();
    const layer = createConstructionPodFxLayer(scene);
    layer.spawn(1, 2, 0, 1_000);
    expect(layer.activeCount()).toBe(1);
    expect(scene.children).toHaveLength(1);

    layer.update(1_000); // just launched: high above the tile
    const group = scene.children[0]!;
    const pod = group.children[0]!;
    expect(pod.position.y).toBeGreaterThan(2);

    layer.update(1_000 + 899); // about to land
    expect(pod.position.y).toBeLessThan(0.4);

    layer.update(1_000 + 5_000); // long after: removed from the scene
    expect(layer.activeCount()).toBe(0);
    expect(scene.children).toHaveLength(0);
    layer.dispose();
  });

  it("falls faster as it nears the ground", () => {
    const scene = new Scene();
    const layer = createConstructionPodFxLayer(scene);
    layer.spawn(0, 0, 0, 0);
    const pod = scene.children[0]!.children[0]!;
    layer.update(0);
    const y0 = pod.position.y;
    layer.update(300);
    const y1 = pod.position.y;
    layer.update(600);
    const y2 = pod.position.y;
    expect(y0 - y1).toBeLessThan(y1 - y2);
    layer.dispose();
  });

  it("caps concurrent pods and clear() removes everything", () => {
    const scene = new Scene();
    const layer = createConstructionPodFxLayer(scene);
    for (let i = 0; i < 100; i += 1) layer.spawn(i, 0, 0, 0);
    expect(layer.activeCount()).toBe(24);
    layer.clear();
    expect(layer.activeCount()).toBe(0);
    expect(scene.children).toHaveLength(0);
    layer.dispose();
  });
});
