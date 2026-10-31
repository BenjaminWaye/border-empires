import { BoxGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Scene } from "three";
import { describe, expect, it, vi } from "vitest";
import { updateVisibleMatrixWorld } from "./client-map-3d-visible-matrix-world.js";

// Regression: three.js's scene.updateMatrixWorld() walked every hidden pooled
// object (358 marine rigs, survey-line and pylon pools: 17k objects for ~850
// visible on staging) every frame. Only visible subtrees are walked now; these
// pin that hidden ones are skipped yet come back with correct matrices.

const run = (root: Object3D): Object3D[] => {
  const empty: Object3D[] = [];
  updateVisibleMatrixWorld(root, false, empty);
  return empty;
};

describe("updateVisibleMatrixWorld", () => {
  it("matches three.js's own world matrices for a visible tree", () => {
    const build = (): { scene: Scene; leaf: Mesh } => {
      const scene = new Scene();
      const group = new Group();
      group.position.set(3, 1, -2);
      group.rotation.y = 0.7;
      group.scale.setScalar(2);
      const leaf = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
      leaf.position.set(1, 2, 3);
      group.add(leaf);
      scene.add(group);
      return { scene, leaf };
    };
    const ours = build();
    run(ours.scene);
    const reference = build();
    reference.scene.updateMatrixWorld();
    expect(ours.leaf.matrixWorld.elements).toEqual(reference.leaf.matrixWorld.elements);
  });

  it("does not walk hidden subtrees", () => {
    const scene = new Scene();
    const pool = new Group();
    pool.visible = false;
    const slot = new Object3D();
    pool.add(slot);
    scene.add(pool);
    const poolUpdate = vi.spyOn(pool, "updateMatrix");
    const slotUpdate = vi.spyOn(slot, "updateMatrix");
    run(scene);
    expect(poolUpdate).not.toHaveBeenCalled();
    expect(slotUpdate).not.toHaveBeenCalled();
  });

  it("recomputes a hidden object whose parent moved while it was hidden, once it is shown", () => {
    const scene = new Scene();
    const parent = new Group();
    const child = new Object3D();
    child.position.set(1, 0, 0);
    parent.add(child);
    scene.add(parent);
    run(scene);
    expect(child.matrixWorld.elements[12]).toBe(1);

    child.visible = false;
    parent.position.set(10, 0, 0);
    run(scene);
    run(scene); // a later frame with the parent unchanged must not lose the pending update
    child.visible = true;
    run(scene);
    expect(child.matrixWorld.elements[12]).toBe(11);
  });

  it("hands classes with their own updateMatrixWorld to it", () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    camera.position.set(0, 5, 0);
    scene.add(camera);
    run(scene);
    expect(camera.matrixWorldInverse.elements[13]).toBe(-5);
  });

  it("collects only visible empty instanced meshes", () => {
    const scene = new Scene();
    const empty = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 4);
    empty.count = 0;
    const populated = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 4);
    const hiddenEmpty = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 4);
    hiddenEmpty.count = 0;
    hiddenEmpty.visible = false;
    scene.add(empty, populated, hiddenEmpty);
    expect(run(scene)).toEqual([empty]);
  });
});
