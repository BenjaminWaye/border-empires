import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { createSurveySweepPingOverlay } from "./client-map-3d-survey-sweep-ping-overlay.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] => {
  const meshes: InstancedMesh[] = [];
  scene.traverse((child) => {
    if (child instanceof InstancedMesh) meshes.push(child);
  });
  return meshes;
};

describe("survey sweep ping overlay", () => {
  it("uploads instance data when pings are active", () => {
    const scene = new Scene();
    const overlay = createSurveySweepPingOverlay(scene);

    overlay.beginFrame();
    overlay.addPing("resource", 0, 0, 0, 1000, 0, 2000);
    overlay.commit();

    const drawn = instancedMeshes(scene).filter((mesh) => mesh.count > 0);
    expect(drawn.length).toBeGreaterThan(0);
    // BufferAttribute.needsUpdate is write-only in three.js (bumps .version on
    // set); reading version > 0 is how you tell an upload actually happened.
    for (const mesh of drawn) {
      expect(mesh.instanceMatrix.version).toBeGreaterThan(0);
    }

    overlay.dispose();
  });

  it("skips the GPU upload on a second idle frame in a row", () => {
    // Regression guard: commit() used to call `instanceMatrix.needsUpdate = true` on all
    // four meshes unconditionally, every single frame, even with zero active pings — a
    // real WebGL bufferSubData call for no visual change. Once the buffers are already
    // showing zero instances, a further idle frame must not touch them again.
    const scene = new Scene();
    const overlay = createSurveySweepPingOverlay(scene);

    // First idle frame: buffers still hold whatever they held before (nothing here),
    // so this is allowed to commit once to reach the all-zero state.
    overlay.beginFrame();
    overlay.commit();
    const versionsAfterFirstIdleCommit = instancedMeshes(scene).map((mesh) => mesh.instanceMatrix.version);

    // Second idle frame in a row: nothing changed, so commit() must be a no-op —
    // version must not bump again.
    overlay.beginFrame();
    overlay.commit();

    const versionsAfterSecondIdleCommit = instancedMeshes(scene).map((mesh) => mesh.instanceMatrix.version);
    expect(versionsAfterSecondIdleCommit).toEqual(versionsAfterFirstIdleCommit);

    overlay.dispose();
  });

  it("resumes uploading as soon as a ping reappears after idle frames", () => {
    const scene = new Scene();
    const overlay = createSurveySweepPingOverlay(scene);

    overlay.beginFrame();
    overlay.commit();
    overlay.beginFrame();
    overlay.commit();
    const versionsBeforePingReturns = instancedMeshes(scene).map((mesh) => mesh.instanceMatrix.version);

    overlay.beginFrame();
    overlay.addPing("town", 1, 1, 0, 1000, 0, 2000);
    overlay.commit();

    const drawn = instancedMeshes(scene).filter((mesh) => mesh.count > 0);
    expect(drawn.length).toBeGreaterThan(0);
    const versionsAfterPingReturns = instancedMeshes(scene).map((mesh) => mesh.instanceMatrix.version);
    expect(versionsAfterPingReturns).not.toEqual(versionsBeforePingReturns);

    overlay.dispose();
  });
});
