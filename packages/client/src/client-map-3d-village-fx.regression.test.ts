import { describe, expect, it } from "vitest";
import { BufferAttribute, InstancedMesh, Matrix4, Scene, Vector3 } from "three";
import { createVillageEffects } from "./client-map-3d-village-fx.js";

const TEMP_MATRIX = new Matrix4();

const attr = (mesh: InstancedMesh, name: string): BufferAttribute =>
  mesh.geometry.getAttribute(name) as BufferAttribute;

const instancePosition = (mesh: InstancedMesh, index: number): Vector3 => {
  const out = new Vector3();
  mesh.getMatrixAt(index, TEMP_MATRIX);
  out.setFromMatrixPosition(TEMP_MATRIX);
  return out;
};

describe("village effects", () => {
  it("places owned-village smoke puffs at the village base position", () => {
    const scene = new Scene();
    const overlay = createVillageEffects(scene);

    overlay.addOwnedVillage(10, 20, 1, 7);
    overlay.commit();

    expect(overlay.smokeMesh.count).toBe(4); // SMOKE_PUFFS_PER_VILLAGE
    const p0 = instancePosition(overlay.smokeMesh, 0);
    expect(p0.x).toBeCloseTo(10, 5);
    expect(p0.z).toBeCloseTo(20, 5);
    expect(p0.y).toBeCloseTo(1 + 0.35, 5); // surfaceY + SMOKE_BASE_Y

    overlay.dispose();
  });

  it("places capital banners and poles at the anchor position, once", () => {
    const scene = new Scene();
    const overlay = createVillageEffects(scene);

    overlay.addCapitalBanner(4, 6, 2, "#ff8800", 3);
    overlay.commit();

    expect(overlay.bannerMesh.count).toBe(1);
    expect(overlay.poleMesh.count).toBe(1);
    const bannerPos = instancePosition(overlay.bannerMesh, 0);
    expect(bannerPos.x).toBeCloseTo(4 + 0.32, 5); // + BANNER_OFFSET_X
    expect(bannerPos.z).toBeCloseTo(6, 5);

    overlay.dispose();
  });

  it("does not touch any GPU buffer on update() once committed — animation is uniform-only", () => {
    // Regression guard: puff rise/drift/scale/fade used to be recomputed and
    // re-written into instanceMatrix + instanceColor on every update(nowMs)
    // call, forcing a full bufferSubData re-upload of up to ~7,000 combined
    // smoke instances every frame — and the banner mesh's own (static)
    // position was likewise rewritten every frame for no reason. update()
    // must now only advance a time uniform for the animated puffs; none of
    // these buffers should report a version change across repeated calls.
    const scene = new Scene();
    const overlay = createVillageEffects(scene);

    overlay.addOwnedVillage(0, 0, 0, 3);
    overlay.addCapturedTownSmoke(5, 5, 0, 9);
    overlay.addCapitalBanner(2, 2, 0, "#ffffff", 1);
    overlay.commit();

    const buffersToWatch = [
      overlay.smokeMesh.instanceMatrix,
      attr(overlay.smokeMesh, "aPhaseOffset"),
      attr(overlay.smokeMesh, "aSeedX"),
      attr(overlay.smokeMesh, "aSeedZ"),
      overlay.capturedSmokeMesh.instanceMatrix,
      attr(overlay.capturedSmokeMesh, "aPhaseOffset"),
      overlay.bannerMesh.instanceMatrix,
      overlay.poleMesh.instanceMatrix
    ];
    const versionsAfterCommit = buffersToWatch.map((attr) => attr.version);

    overlay.update(1000);
    overlay.update(2000);
    overlay.update(3000);

    const versionsAfterUpdates = buffersToWatch.map((attr) => attr.version);
    expect(versionsAfterUpdates).toEqual(versionsAfterCommit);

    overlay.dispose();
  });

  it("re-derives puff positions and shader inputs when the village list changes", () => {
    const scene = new Scene();
    const overlay = createVillageEffects(scene);

    overlay.addOwnedVillage(0, 0, 0, 1);
    overlay.commit();
    expect(overlay.smokeMesh.count).toBe(4);

    overlay.clear();
    overlay.addOwnedVillage(1, 1, 0, 1);
    overlay.addOwnedVillage(2, 2, 0, 2);
    overlay.commit();

    expect(overlay.smokeMesh.count).toBe(8);
    const p0 = instancePosition(overlay.smokeMesh, 0);
    expect(p0.x).toBeCloseTo(1, 5);
    const p4 = instancePosition(overlay.smokeMesh, 4);
    expect(p4.x).toBeCloseTo(2, 5);

    overlay.dispose();
  });
});
