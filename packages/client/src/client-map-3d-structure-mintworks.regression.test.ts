import { describe, expect, it } from "vitest";
import { CylinderGeometry, InstancedMesh, Scene } from "three";
import { createContactShadowOverlay } from "./client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import { createStructureOverlay } from "./client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

const flywheelMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" &&
      (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.18 &&
      (mesh.geometry as CylinderGeometry).parameters.height === 0.05
  );

describe("mintworks structure overlay", () => {
  it("commits an assembled mint with a visible flywheel", () => {
    const scene = new Scene();
    const overlay = createStructureOverlay(scene, 3, createContactShadowOverlay(scene, 3));

    overlay.addInstance(0, 0, 0, "MINTWORKS");
    overlay.addInstance(2, 0, 0, "MINTWORKS");
    overlay.addInstance(4, 0, 0, "MINTWORKS");
    overlay.commit();

    const renderedPieces = instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBeGreaterThan(0);
    expect(flywheelMesh(scene)?.count).toBe(3);

    overlay.dispose();
  });

  it("spins the flywheel on update with a partial upload and without disturbing counts", () => {
    const scene = new Scene();
    const overlay = createStructureOverlay(scene, 8, createContactShadowOverlay(scene, 8));

    overlay.addInstance(0, 0, 0, "MINTWORKS");
    overlay.addInstance(2, 0, 0, "MINTWORKS");
    overlay.commit();

    const flywheel = flywheelMesh(scene);
    expect(flywheel).toBeDefined();
    expect(flywheel!.count).toBe(2);

    const before = Array.from(flywheel!.instanceMatrix.array.slice(0, 16));
    overlay.update(1000);
    const after = Array.from(flywheel!.instanceMatrix.array.slice(0, 16));

    expect(after).not.toEqual(before);
    expect(flywheel!.count).toBe(2);

    // update() marks only the used prefix dirty (partial upload) so the GPU
    // re-uploads 2*16 floats, not the whole cap-sized buffer.
    const ranges = flywheel!.instanceMatrix.updateRanges;
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.count).toBe(flywheel!.count * 16);
    expect(ranges[0]!.count).toBeLessThan(flywheel!.instanceMatrix.array.length);
    // three r179 exposes needsUpdate as a setter-only accessor that bumps
    // `version`; assert the flag effect rather than the accessor itself.
    expect(flywheel!.instanceMatrix.version).toBeGreaterThan(0);

    overlay.dispose();
  });

  it("spins the wheel about its fixed axle rather than wobbling", () => {
    const scene = new Scene();
    const overlay = createStructureOverlay(scene, 2, createContactShadowOverlay(scene, 2));

    overlay.addInstance(0, 0, 0, "MINTWORKS");
    overlay.commit();
    overlay.update(1000);

    const flywheel = flywheelMesh(scene);
    expect(flywheel).toBeDefined();

    // The flywheel disc rests in the YZ plane with its axle along world X, so
    // its local Y axis always maps onto the X column (elements 4..6) at every
    // frame. A buggy composition order makes the axle precess — the Y and Z
    // components of that column drift away from 0 — regression guard: spin
    // must keep the wheel on its axle, only rotating in the YZ plane.
    const discColumnY = Array.from(flywheel!.instanceMatrix.array.slice(4, 7));
    const [, yy, yz] = discColumnY;
    expect(Math.abs(yy!)).toBeLessThan(1e-4);
    expect(Math.abs(yz!)).toBeLessThan(1e-4);

    overlay.dispose();
  });

  it("spins two mints on different tiles out of phase", () => {
    const scene = new Scene();
    const overlay = createStructureOverlay(scene, 4, createContactShadowOverlay(scene, 4));

    overlay.addInstance(0, 0, 0, "MINTWORKS");
    overlay.addInstance(2, 0, 0, "MINTWORKS");
    overlay.commit();
    overlay.update(1000);

    const flywheel = flywheelMesh(scene);
    expect(flywheel).toBeDefined();
    const mintOne = Array.from(flywheel!.instanceMatrix.array.slice(0, 16));
    const mintTwo = Array.from(flywheel!.instanceMatrix.array.slice(16, 32));
    expect(mintOne).not.toEqual(mintTwo);

    overlay.dispose();
  });

  it("clears flywheel animation records alongside the piece buffers", () => {
    const scene = new Scene();
    const overlay = createStructureOverlay(scene, 1, createContactShadowOverlay(scene, 1));

    overlay.addInstance(0, 0, 0, "MINTWORKS");
    overlay.commit();
    overlay.clear();
    overlay.commit();
    // update() after a clear must not touch the empty buffers or throw.
    overlay.update(100);

    expect(flywheelMesh(scene)?.count).toBe(0);
    expect(instancedMeshes(scene).length).toBeGreaterThan(0);

    overlay.dispose();
  });
});
