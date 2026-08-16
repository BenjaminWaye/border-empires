import { InstancedMesh, Scene } from "three";
import { describe, expect, it } from "vitest";

import { createMusterOverlay } from "./client-map-3d-muster-overlay.js";

describe("3d muster overlay z-index regression guard", () => {
  it("renders every muster mesh in the transparent pass so renderOrder beats the ownership overlay", () => {
    // Three.js always draws the opaque pass before the transparent pass,
    // regardless of renderOrder. The ownership overlay (client-map-3d-
    // ownership-overlay.ts) is transparent with renderOrder 6-7, so if the
    // muster tower/soldier meshes stay in the opaque bucket, the overlay
    // paints over them every frame no matter how high their renderOrder is
    // set. Every muster mesh must opt into the transparent pass, and every
    // renderOrder must clear the ownership overlay's highest (7).
    const scene = new Scene();
    const overlay = createMusterOverlay(scene);
    const meshes = scene.children.filter(
      (c): c is InstancedMesh => c instanceof InstancedMesh
    );

    // 19 tower parts (base ring, pedestal, glow ring, cannons, smoke,
    // trunk, bands, banner assembly, medallion, wings, dome, spire) + soldiers.
    expect(meshes.length).toBe(20);
    for (const mesh of meshes) {
      const material = mesh.material as { transparent?: boolean; depthTest?: boolean; depthWrite?: boolean };
      expect(material.transparent).toBe(true);
      expect(material.depthTest).toBe(false);
      expect(material.depthWrite).toBe(false);
      expect(mesh.renderOrder).toBeGreaterThan(7);
    }

    overlay.dispose();
  });

  it("still renders one tower per mustering tile after the fix", () => {
    const scene = new Scene();
    const overlay = createMusterOverlay(scene);
    const meshes = scene.children.filter(
      (c): c is InstancedMesh => c instanceof InstancedMesh
    );
    // Single-instance-per-tile part (base glow ring) vs. a mirrored
    // left/right part (the two side cannons) — both should scale with
    // the number of mustering tiles, just at different multiples.
    const singleInstancePart = meshes.find((m) => m.instanceMatrix.count === 64)!;
    const mirroredPart = meshes.find((m) => m.instanceMatrix.count === 128)!;

    overlay.addMuster(1, 2, 0, 0.5, "#ff0000", false, 1, 2);
    overlay.commit();
    overlay.tick(0);

    expect(singleInstancePart.count).toBe(1);
    expect(mirroredPart.count).toBe(2);
    const soldierMesh = meshes[meshes.length - 1]!;
    expect(soldierMesh.count).toBeGreaterThanOrEqual(3);

    overlay.clear();
    overlay.commit();
    overlay.tick(0);
    expect(singleInstancePart.count).toBe(0);
    expect(mirroredPart.count).toBe(0);
    expect(soldierMesh.count).toBe(0);

    overlay.dispose();
  });
});
