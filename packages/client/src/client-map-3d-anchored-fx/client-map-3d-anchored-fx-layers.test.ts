import { Scene } from "three";
import { describe, expect, it } from "vitest";
import { createAnchoredFxLayers } from "./client-map-3d-anchored-fx-layers.js";

describe("createAnchoredFxLayers", () => {
  it("parents every effect layer to the anchored root, which is the scene's only new child", () => {
    const scene = new Scene();
    const layers = createAnchoredFxLayers(scene, undefined);
    expect(scene.children).toEqual([layers.root.group]);
    for (const [name, layer] of Object.entries(layers)) {
      if (name === "root" || name === "floatingText") continue;
      expect((layer as { group: unknown }).group, name).toBeDefined();
      expect(layers.root.group.children, name).toContain((layer as { group: unknown }).group);
    }
  });

  it("keeps a spawned effect on its world tile when the scene origin moves", () => {
    const layers = createAnchoredFxLayers(new Scene(), undefined);
    const origin = { camX: 200, camY: 100 };
    layers.root.follow(origin);
    const local = layers.root.toLocal(4.5, -1.5, origin); // tile (204, 98)'s centre, seen from the origin
    layers.unsettleFx.spawn(local.x, local.z, 0);
    const entry = layers.unsettleFx.group.children[0]!;
    origin.camX = 230;
    layers.root.follow(origin);
    layers.root.group.updateMatrixWorld(true);
    expect(entry.getWorldPosition(entry.position.clone()).x).toBeCloseTo(4.5 - 30, 9);
  });
});
