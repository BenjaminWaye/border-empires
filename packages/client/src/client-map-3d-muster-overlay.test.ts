import { InstancedMesh, Scene } from "three";
import { describe, expect, it } from "vitest";

import { createMusterOverlay } from "./client-map-3d-muster-overlay.js";

describe("3d muster overlay z-index regression guard", () => {
  it("renders every muster mesh in the transparent pass so renderOrder beats the ownership overlay", () => {
    // Three.js always draws the opaque pass before the transparent pass,
    // regardless of renderOrder. The ownership overlay (client-map-3d-
    // ownership-overlay.ts) is transparent with renderOrder 6-7, so if the
    // muster flag meshes stay in the opaque bucket, the overlay paints over
    // them every frame no matter how high their renderOrder is set. Every
    // muster mesh must opt into the transparent pass so its renderOrder of
    // 36 actually wins against the ownership overlay's 6-7.
    const scene = new Scene();
    const overlay = createMusterOverlay(scene);
    const meshes = scene.children.filter(
      (c): c is InstancedMesh => c instanceof InstancedMesh
    );

    // pole, pennant, spike, soldier
    expect(meshes.length).toBe(4);
    for (const mesh of meshes) {
      const material = mesh.material as { transparent?: boolean; depthTest?: boolean; depthWrite?: boolean };
      expect(material.transparent).toBe(true);
      expect(material.depthTest).toBe(false);
      expect(material.depthWrite).toBe(false);
      expect(mesh.renderOrder).toBe(36);
    }

    overlay.dispose();
  });

  it("still renders one flag per mustering tile after the fix", () => {
    const scene = new Scene();
    const overlay = createMusterOverlay(scene);
    const meshes = scene.children.filter(
      (c): c is InstancedMesh => c instanceof InstancedMesh
    );

    overlay.addMuster(1, 2, 0, 0.5, "#ff0000", false, 1, 2);
    overlay.commit();
    for (const mesh of meshes) {
      if (mesh.count !== undefined) expect(mesh.count).toBeGreaterThanOrEqual(0);
    }
    expect(meshes[0]!.count).toBe(1);

    overlay.clear();
    overlay.commit();
    expect(meshes[0]!.count).toBe(0);

    overlay.dispose();
  });
});
