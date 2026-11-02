import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { createWarScarLayer3D } from "./client-map-3d-war-scars.js";

const instanceCounts = (scene: Scene): number[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh).map((mesh) => mesh.count);

describe("createWarScarLayer3D", () => {
  it("draws more craters and debris the deeper the scars", () => {
    const scene = new Scene();
    const layer = createWarScarLayer3D(scene);
    layer.addTile(1, 0, 0, 0, 3);
    layer.commit();
    const light = instanceCounts(scene);
    layer.clear();
    layer.addTile(5, 0, 0, 0, 3);
    layer.commit();
    const heavy = instanceCounts(scene);
    expect(light.every((count) => count > 0)).toBe(true);
    heavy.forEach((count, i) => expect(count).toBeGreaterThan(light[i]!));
    layer.clear();
    layer.addTile(0, 0, 0, 0, 3);
    layer.commit();
    expect(instanceCounts(scene)).toEqual([0, 0]);
    layer.dispose();
    expect(instanceCounts(scene)).toEqual([]);
  });
});
